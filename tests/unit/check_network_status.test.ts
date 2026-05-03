/**
 * Unit tests for the check_network_status tool and network-monitor service.
 *
 * All HTTP calls are intercepted via vi.stubGlobal('fetch', ...) so no real
 * network traffic is generated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { checkNetworkStatus } from "../../src/services/network-monitor.js";
import { checkNetworkStatusTool } from "../../src/tools/check_network_status.js";
import { PulsarPartitionError, PulsarValidationError } from "../../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(latencyMs = 50): typeof fetch {
  return vi.fn().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, latencyMs));
    return { ok: true, status: 200 } as Response;
  });
}

function makeFetchFail(error: Error): typeof fetch {
  return vi.fn().mockRejectedValue(error);
}

function makeFetchStatus(status: number): typeof fetch {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status } as Response);
}

// ---------------------------------------------------------------------------
// checkNetworkStatus (service layer)
// ---------------------------------------------------------------------------

describe("checkNetworkStatus (service)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns severity=none when both endpoints are reachable", async () => {
    vi.stubGlobal("fetch", makeFetchOk(30));

    const result = await checkNetworkStatus("testnet");

    expect(result.partition_severity).toBe("none");
    expect(result.any_reachable).toBe(true);
    expect(result.horizon.status).toBe("reachable");
    expect(result.soroban_rpc.status).toBe("reachable");
    expect(result.remediation).toHaveLength(0);
    expect(result.summary).toMatch(/no partition detected/i);
    expect(result.network).toBe("testnet");
  });

  it("returns severity=full when both endpoints are unreachable", async () => {
    vi.stubGlobal("fetch", makeFetchFail(new Error("fetch failed")));

    const result = await checkNetworkStatus("testnet");

    expect(result.partition_severity).toBe("full");
    expect(result.any_reachable).toBe(false);
    expect(result.horizon.status).toBe("unreachable");
    expect(result.soroban_rpc.status).toBe("unreachable");
    expect(result.remediation.length).toBeGreaterThan(0);
    expect(result.summary).toMatch(/full network partition/i);
  });

  it("returns severity=partial when only Horizon is reachable", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { ok: true, status: 200 } as Response; // Horizon
        throw new Error("econnrefused");                                    // Soroban RPC
      })
    );

    const result = await checkNetworkStatus("testnet");

    expect(result.partition_severity).toBe("partial");
    expect(result.any_reachable).toBe(true);
    expect(result.horizon.status).toBe("reachable");
    expect(result.soroban_rpc.status).toBe("unreachable");
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("returns severity=partial when only Soroban RPC is reachable", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("enotfound"); // Horizon
        return { ok: true, status: 200 } as Response;      // Soroban RPC
      })
    );

    const result = await checkNetworkStatus("testnet");

    expect(result.partition_severity).toBe("partial");
    expect(result.horizon.status).toBe("unreachable");
    expect(result.soroban_rpc.status).toBe("reachable");
  });

  it("classifies AbortError as timeout", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    vi.stubGlobal("fetch", makeFetchFail(abortErr));

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.status).toBe("timeout");
    expect(result.soroban_rpc.status).toBe("timeout");
    expect(result.horizon.message).toMatch(/timed out/i);
  });

  it("classifies HTTP 503 as degraded", async () => {
    vi.stubGlobal("fetch", makeFetchStatus(503));

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.status).toBe("degraded");
    expect(result.soroban_rpc.status).toBe("degraded");
    expect(result.horizon.http_status).toBe(503);
  });

  it("classifies HTTP 404 as unreachable", async () => {
    vi.stubGlobal("fetch", makeFetchStatus(404));

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.status).toBe("unreachable");
    expect(result.horizon.http_status).toBe(404);
  });

  it("includes latency_ms for reachable endpoints", async () => {
    vi.stubGlobal("fetch", makeFetchOk(10));

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.soroban_rpc.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("sets latency_ms to null for unreachable endpoints (non-timeout)", async () => {
    vi.stubGlobal("fetch", makeFetchFail(new Error("connection refused")));

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.latency_ms).toBeNull();
    expect(result.soroban_rpc.latency_ms).toBeNull();
  });

  it("includes probed_at ISO timestamp on each result", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = await checkNetworkStatus("testnet");

    expect(result.horizon.probed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.soroban_rpc.probed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("works for mainnet network", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = await checkNetworkStatus("mainnet");

    expect(result.network).toBe("mainnet");
    expect(result.horizon.url).toContain("horizon.stellar.org");
    expect(result.soroban_rpc.url).toContain("soroban-rpc.stellar.org");
  });

  it("works for futurenet network", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = await checkNetworkStatus("futurenet");

    expect(result.network).toBe("futurenet");
    expect(result.horizon.url).toContain("futurenet");
    expect(result.soroban_rpc.url).toContain("futurenet");
  });

  it("includes remediation steps for timeout failures", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    vi.stubGlobal("fetch", makeFetchFail(abortErr));

    const result = await checkNetworkStatus("testnet");

    const allRemediation = result.remediation.join(" ");
    expect(allRemediation).toMatch(/retry|fallback/i);
  });
});

// ---------------------------------------------------------------------------
// checkNetworkStatusTool (tool layer)
// ---------------------------------------------------------------------------

describe("checkNetworkStatusTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns status=healthy when both endpoints are reachable", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = (await checkNetworkStatusTool({})) as any;

    expect(result.status).toBe("healthy");
    expect(result.partition_severity).toBe("none");
  });

  it("returns status=degraded for partial partition", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { ok: true, status: 200 } as Response;
        throw new Error("econnrefused");
      })
    );

    const result = (await checkNetworkStatusTool({})) as any;

    expect(result.status).toBe("degraded");
    expect(result.partition_severity).toBe("partial");
  });

  it("throws PulsarPartitionError for full partition", async () => {
    vi.stubGlobal("fetch", makeFetchFail(new Error("fetch failed")));

    await expect(checkNetworkStatusTool({})).rejects.toThrow(PulsarPartitionError);
  });

  it("PulsarPartitionError details contain diagnostic payload", async () => {
    vi.stubGlobal("fetch", makeFetchFail(new Error("fetch failed")));

    try {
      await checkNetworkStatusTool({});
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PulsarPartitionError);
      const details = (err as PulsarPartitionError).details;
      expect(details).toHaveProperty("partition_severity", "full");
      expect(details).toHaveProperty("horizon");
      expect(details).toHaveProperty("soroban_rpc");
      expect(details).toHaveProperty("remediation");
    }
  });

  it("throws PulsarValidationError for invalid timeout_ms", async () => {
    await expect(
      checkNetworkStatusTool({ timeout_ms: 100 }) // below 500 ms minimum
    ).rejects.toThrow(PulsarValidationError);
  });

  it("throws PulsarValidationError for invalid network value", async () => {
    await expect(
      checkNetworkStatusTool({ network: "invalid-net" })
    ).rejects.toThrow(PulsarValidationError);
  });

  it("accepts a custom timeout_ms", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = (await checkNetworkStatusTool({ timeout_ms: 5000 })) as any;

    expect(result.status).toBe("healthy");
  });

  it("accepts an explicit network override", async () => {
    vi.stubGlobal("fetch", makeFetchOk());

    const result = (await checkNetworkStatusTool({ network: "mainnet" })) as any;

    expect(result.network).toBe("mainnet");
  });
});

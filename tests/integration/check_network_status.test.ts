/**
 * Integration tests for check_network_status.
 *
 * These tests hit the real Stellar Testnet endpoints and are opt-in.
 * Set RUN_INTEGRATION_TESTS=true to enable them.
 */

import { describe, it, expect } from "vitest";

import { RUN_INTEGRATION_TESTS } from "./setup.js";
import { checkNetworkStatus } from "../../src/services/network-monitor.js";
import { checkNetworkStatusTool } from "../../src/tools/check_network_status.js";

const describeIfIntegration = RUN_INTEGRATION_TESTS ? describe : describe.skip;

describeIfIntegration("checkNetworkStatus — real Testnet", () => {
  it("reports both Testnet endpoints as reachable", async () => {
    const result = await checkNetworkStatus("testnet", 15_000);

    expect(result.network).toBe("testnet");
    expect(result.partition_severity).toBe("none");
    expect(result.any_reachable).toBe(true);
    expect(result.horizon.status).toBe("reachable");
    expect(result.soroban_rpc.status).toBe("reachable");
    expect(result.horizon.latency_ms).toBeGreaterThan(0);
    expect(result.soroban_rpc.latency_ms).toBeGreaterThan(0);
    expect(result.remediation).toHaveLength(0);
  }, 20_000);

  it("tool returns status=healthy for Testnet", async () => {
    const result = (await checkNetworkStatusTool({ network: "testnet", timeout_ms: 15_000 })) as any;

    expect(result.status).toBe("healthy");
    expect(result.partition_severity).toBe("none");
  }, 20_000);

  it("detects full partition for a bogus custom network URL", async () => {
    // Override env to point at a non-existent host
    const originalHorizon = process.env.HORIZON_URL;
    const originalRpc = process.env.SOROBAN_RPC_URL;
    const originalNetwork = process.env.STELLAR_NETWORK;

    process.env.HORIZON_URL = "https://horizon.invalid-host-that-does-not-exist.example";
    process.env.SOROBAN_RPC_URL = "https://rpc.invalid-host-that-does-not-exist.example";
    process.env.STELLAR_NETWORK = "custom";

    try {
      // Re-import config to pick up new env (dynamic import)
      const { checkNetworkStatus: probe } = await import("../../src/services/network-monitor.js");
      const result = await probe("custom", 5_000);

      expect(result.partition_severity).toBe("full");
      expect(result.any_reachable).toBe(false);
      expect(result.remediation.length).toBeGreaterThan(0);
    } finally {
      // Restore env
      if (originalHorizon !== undefined) process.env.HORIZON_URL = originalHorizon;
      else delete process.env.HORIZON_URL;
      if (originalRpc !== undefined) process.env.SOROBAN_RPC_URL = originalRpc;
      else delete process.env.SOROBAN_RPC_URL;
      if (originalNetwork !== undefined) process.env.STELLAR_NETWORK = originalNetwork;
      else delete process.env.STELLAR_NETWORK;
    }
  }, 15_000);
});

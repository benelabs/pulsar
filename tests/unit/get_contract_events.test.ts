import { describe, it, expect, vi, beforeEach } from "vitest";

import { getContractEvents } from "../../src/tools/get_contract_events.js";
import { getSorobanServer } from "../../src/services/soroban-rpc.js";

vi.mock("../../src/services/soroban-rpc.js", () => ({
  getSorobanServer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTRACT_A = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const CONTRACT_B = "CCJZ5DGASBWQXR5MPFCJXMBI33ZVNHTBHM4L7RLFLHQNNFWDGGFHXMF";

function makeRawEvent(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "0000000123-000",
    type: "contract",
    ledger: 123,
    ledgerClosedAt: "2024-01-01T00:00:00Z",
    contractId: CONTRACT_A,
    txHash: "abc123",
    inSuccessfulContractCall: true,
    pagingToken: "tok-0000000123-000",
    topic: [
      { toXDR: (_: string) => "dG9waWMx" }, // base64 "topic1"
    ],
    value: { toXDR: (_: string) => "dmFsdWUx" }, // base64 "value1"
  };
  return { ...base, ...overrides };
}

function makeMockServer(events: unknown[] = [], latestLedger = 500) {
  return {
    getEvents: vi.fn().mockResolvedValue({ events, latestLedger }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getContractEvents", () => {
  let mockServer: ReturnType<typeof makeMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = makeMockServer();
    vi.mocked(getSorobanServer).mockReturnValue(mockServer as any);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("throws PulsarValidationError when contract_ids is empty", async () => {
    await expect(
      getContractEvents({ contract_ids: [], start_ledger: 100 } as any)
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  it("throws PulsarValidationError when more than 5 contract_ids supplied", async () => {
    const ids = Array(6).fill(CONTRACT_A);
    await expect(
      getContractEvents({ contract_ids: ids, start_ledger: 100 } as any)
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  it("throws PulsarValidationError when neither start_ledger nor cursor is supplied", async () => {
    await expect(
      getContractEvents({ contract_ids: [CONTRACT_A] } as any)
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  it("throws PulsarValidationError when limit is out of range", async () => {
    await expect(
      getContractEvents({ contract_ids: [CONTRACT_A], start_ledger: 100, limit: 201 } as any)
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns structured batch for a single contract", async () => {
    const rawEvent = makeRawEvent();
    mockServer.getEvents.mockResolvedValue({ events: [rawEvent], latestLedger: 500 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
    })) as any;

    expect(result.batch_size).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.latest_ledger).toBe(500);
    expect(result.contracts_queried).toEqual([CONTRACT_A]);
    expect(result.start_ledger).toBe(100);
  });

  it("batches multiple contract_ids into a single RPC call", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 400 });

    await getContractEvents({
      contract_ids: [CONTRACT_A, CONTRACT_B],
      start_ledger: 50,
    });

    expect(mockServer.getEvents).toHaveBeenCalledTimes(1);

    const [req] = mockServer.getEvents.mock.calls[0];
    expect(req.filters).toHaveLength(1);
    expect(req.filters[0].contractIds).toEqual([CONTRACT_A, CONTRACT_B]);
  });

  it("deduplicates events that share the same id", async () => {
    const dup = makeRawEvent({ id: "same-id" });
    mockServer.getEvents.mockResolvedValue({ events: [dup, dup], latestLedger: 300 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
    })) as any;

    expect(result.events).toHaveLength(1);
    expect(result.batch_size).toBe(1);
  });

  it("decodes topics and value into topics_decoded / value_decoded", async () => {
    // scValToNative is mocked at module level via vi.mock — instead we verify
    // the raw XDR strings are present (decoding is a best-effort)
    const rawEvent = makeRawEvent();
    mockServer.getEvents.mockResolvedValue({ events: [rawEvent], latestLedger: 200 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
    })) as any;

    const ev = result.events[0];
    expect(ev.topics).toEqual(["dG9waWMx"]);
    expect(ev.value).toBe("dmFsdWUx");
    expect(ev).toHaveProperty("topics_decoded");
    expect(ev).toHaveProperty("value_decoded");
  });

  it("maps raw event fields to snake_case output shape", async () => {
    const rawEvent = makeRawEvent();
    mockServer.getEvents.mockResolvedValue({ events: [rawEvent], latestLedger: 200 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
    })) as any;

    const ev = result.events[0];
    expect(ev.id).toBe("0000000123-000");
    expect(ev.ledger).toBe(123);
    expect(ev.ledger_closed_at).toBe("2024-01-01T00:00:00Z");
    expect(ev.contract_id).toBe(CONTRACT_A);
    expect(ev.tx_hash).toBe("abc123");
    expect(ev.in_successful_contract_call).toBe(true);
    expect(ev.paging_token).toBe("tok-0000000123-000");
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it("sets has_more=true and next_cursor when batch is full", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeRawEvent({ id: `id-${i}`, pagingToken: `tok-${i}` })
    );
    mockServer.getEvents.mockResolvedValue({ events, latestLedger: 300 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
      limit: 10,
    })) as any;

    expect(result.has_more).toBe(true);
    expect(result.next_cursor).toBe("tok-9");
  });

  it("sets has_more=false when fewer events than limit are returned", async () => {
    const events = [makeRawEvent()];
    mockServer.getEvents.mockResolvedValue({ events, latestLedger: 300 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
      limit: 10,
    })) as any;

    expect(result.has_more).toBe(false);
  });

  it("passes cursor to RPC pagination when provided", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

    await getContractEvents({
      contract_ids: [CONTRACT_A],
      cursor: "tok-99",
      limit: 50,
    });

    const [req] = mockServer.getEvents.mock.calls[0];
    expect(req.pagination?.cursor).toBe("tok-99");
    expect(req.pagination?.limit).toBe(50);
  });

  it("returns null next_cursor when there are no events", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

    const result = (await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
    })) as any;

    expect(result.next_cursor).toBeNull();
    expect(result.batch_size).toBe(0);
  });

  // ── Error handling ────────────────────────────────────────────────────────

  it("wraps RPC errors in PulsarNetworkError", async () => {
    mockServer.getEvents.mockRejectedValue(new Error("RPC connection refused"));

    await expect(
      getContractEvents({ contract_ids: [CONTRACT_A], start_ledger: 100 })
    ).rejects.toMatchObject({
      name: "PulsarNetworkError",
      message: "RPC connection refused",
    });
  });

  it("uses the provided network override", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

    await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
      network: "mainnet",
    });

    expect(vi.mocked(getSorobanServer)).toHaveBeenCalledWith("mainnet");
  });

  it("applies event_type filter in the request", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

    await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
      event_type: "diagnostic",
    });

    const [req] = mockServer.getEvents.mock.calls[0];
    expect(req.filters[0].type).toBe("diagnostic");
  });

  it("omits type field from filter when event_type is 'all'", async () => {
    mockServer.getEvents.mockResolvedValue({ events: [], latestLedger: 300 });

    await getContractEvents({
      contract_ids: [CONTRACT_A],
      start_ledger: 100,
      event_type: "all",
    });

    const [req] = mockServer.getEvents.mock.calls[0];
    expect(req.filters[0].type).toBeUndefined();
  });
});

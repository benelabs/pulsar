import { describe, it, expect, vi, beforeEach } from "vitest";

import { trackLedgerConsensusTime } from "../../src/tools/track_ledger_consensus_time.js";
import { getHorizonServer } from "../../src/services/horizon.js";

vi.mock("../../src/services/horizon.js", () => ({
  getHorizonServer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake Horizon ledger record with a given sequence and ISO close time. */
function makeLedger(sequence: number, closedAt: string) {
  return { sequence, closed_at: closedAt };
}

/**
 * Build a mock Horizon server whose ledgers() chain returns the given records.
 * Records are returned newest-first (as Horizon does with order("desc")).
 */
function mockHorizonServer(records: Array<{ sequence: number; closed_at: string }>) {
  const mockCall = vi.fn().mockResolvedValue({ records });
  const mockLimit = vi.fn().mockReturnValue({ call: mockCall });
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockLedgers = vi.fn().mockReturnValue({ order: mockOrder });
  return { ledgers: mockLedgers, _mockCall: mockCall };
}

// ---------------------------------------------------------------------------
// Fixtures — 11 ledgers, newest-first, each ~5 s apart
// ---------------------------------------------------------------------------
const BASE_TIME = new Date("2026-04-28T12:00:00.000Z").getTime();

/** 11 records newest-first so we can compute 10 intervals */
const ELEVEN_RECORDS = Array.from({ length: 11 }, (_, i) => {
  const seq = 1000 - i; // 1000, 999, …, 990
  const ts = new Date(BASE_TIME - i * 5_000).toISOString(); // newest first
  return makeLedger(seq, ts);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("trackLedgerConsensusTime", () => {
  let mockServer: ReturnType<typeof mockHorizonServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = mockHorizonServer(ELEVEN_RECORDS);
    vi.mocked(getHorizonServer).mockReturnValue(mockServer as any);
  });

  it("returns correct statistics for uniform 5-second ledger closes", async () => {
    const result = (await trackLedgerConsensusTime({ sample_size: 10 })) as any;

    expect(result.sample_size).toBe(10);
    expect(result.average_consensus_seconds).toBe(5);
    expect(result.min_consensus_seconds).toBe(5);
    expect(result.max_consensus_seconds).toBe(5);
    expect(result.std_dev_seconds).toBe(0);
    expect(result.ledgers).toHaveLength(10);
    expect(result.sampled_at).toBeDefined();
  });

  it("ledger records are ordered chronologically (oldest first)", async () => {
    const result = (await trackLedgerConsensusTime({ sample_size: 10 })) as any;
    const seqs: number[] = result.ledgers.map((l: any) => l.sequence);
    // Should be ascending: 991, 992, …, 1000
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    }
  });

  it("each ledger record has required fields", async () => {
    const result = (await trackLedgerConsensusTime({ sample_size: 10 })) as any;
    for (const ledger of result.ledgers) {
      expect(typeof ledger.sequence).toBe("number");
      expect(typeof ledger.closed_at).toBe("string");
      expect(typeof ledger.close_time_seconds).toBe("number");
      expect(ledger.close_time_seconds).toBeGreaterThan(0);
    }
  });

  it("uses default sample_size of 10 when not provided", async () => {
    const result = (await trackLedgerConsensusTime({})) as any;
    expect(result.sample_size).toBe(10);
  });

  it("respects a custom sample_size", async () => {
    // Provide 6 records for sample_size=5
    const sixRecords = ELEVEN_RECORDS.slice(0, 6);
    mockServer = mockHorizonServer(sixRecords);
    vi.mocked(getHorizonServer).mockReturnValue(mockServer as any);

    const result = (await trackLedgerConsensusTime({ sample_size: 5 })) as any;
    expect(result.sample_size).toBe(5);
    expect(result.ledgers).toHaveLength(5);
  });

  it("computes correct std_dev for variable close times", async () => {
    // 3 records → 2 intervals: 4 s and 6 s → avg=5, variance=1, std_dev=1
    const variableRecords = [
      makeLedger(1002, new Date(BASE_TIME).toISOString()),
      makeLedger(1001, new Date(BASE_TIME - 6_000).toISOString()),
      makeLedger(1000, new Date(BASE_TIME - 10_000).toISOString()),
    ];
    mockServer = mockHorizonServer(variableRecords);
    vi.mocked(getHorizonServer).mockReturnValue(mockServer as any);

    const result = (await trackLedgerConsensusTime({ sample_size: 2 })) as any;
    expect(result.average_consensus_seconds).toBe(5);
    expect(result.min_consensus_seconds).toBe(4);
    expect(result.max_consensus_seconds).toBe(6);
    expect(result.std_dev_seconds).toBe(1);
  });

  it("includes the network in the response", async () => {
    const result = (await trackLedgerConsensusTime({ network: "mainnet" })) as any;
    expect(result.network).toBe("mainnet");
  });

  it("throws PulsarValidationError for sample_size below minimum", async () => {
    await expect(
      trackLedgerConsensusTime({ sample_size: 1 })
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  it("throws PulsarValidationError for sample_size above maximum", async () => {
    await expect(
      trackLedgerConsensusTime({ sample_size: 101 })
    ).rejects.toMatchObject({ name: "PulsarValidationError" });
  });

  it("throws PulsarNetworkError when Horizon call fails", async () => {
    const failingServer = {
      ledgers: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            call: vi.fn().mockRejectedValue(new Error("Network timeout")),
          }),
        }),
      }),
    };
    vi.mocked(getHorizonServer).mockReturnValue(failingServer as any);

    await expect(
      trackLedgerConsensusTime({ sample_size: 10 })
    ).rejects.toMatchObject({ name: "PulsarNetworkError" });
  });

  it("throws PulsarNetworkError when Horizon returns fewer than 2 records", async () => {
    mockServer = mockHorizonServer([ELEVEN_RECORDS[0]]);
    vi.mocked(getHorizonServer).mockReturnValue(mockServer as any);

    await expect(
      trackLedgerConsensusTime({ sample_size: 10 })
    ).rejects.toMatchObject({ name: "PulsarNetworkError" });
  });
});

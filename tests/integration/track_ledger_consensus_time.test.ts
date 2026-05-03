import { expect, it } from "vitest";

import { trackLedgerConsensusTime } from "../../src/tools/track_ledger_consensus_time.js";
import { describeIfIntegration } from "./setup.js";

/**
 * Integration tests for track_ledger_consensus_time tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */
describeIfIntegration("track_ledger_consensus_time (Integration)", () => {
  it("returns consensus stats from testnet with default sample_size", async () => {
    const result = (await trackLedgerConsensusTime({ network: "testnet" })) as any;

    expect(result.network).toBe("testnet");
    expect(result.sample_size).toBe(10);
    expect(result.ledgers).toHaveLength(10);

    // Stellar targets ~5 s per ledger; allow generous bounds for testnet variance
    expect(result.average_consensus_seconds).toBeGreaterThan(0);
    expect(result.average_consensus_seconds).toBeLessThan(60);

    expect(result.min_consensus_seconds).toBeGreaterThan(0);
    expect(result.max_consensus_seconds).toBeGreaterThanOrEqual(result.min_consensus_seconds);
    expect(result.std_dev_seconds).toBeGreaterThanOrEqual(0);
    expect(result.sampled_at).toBeDefined();
  });

  it("respects a custom sample_size of 5", async () => {
    const result = (await trackLedgerConsensusTime({
      network: "testnet",
      sample_size: 5,
    })) as any;

    expect(result.sample_size).toBe(5);
    expect(result.ledgers).toHaveLength(5);
  });

  it("each ledger record has valid fields", async () => {
    const result = (await trackLedgerConsensusTime({ network: "testnet" })) as any;

    for (const ledger of result.ledgers) {
      expect(typeof ledger.sequence).toBe("number");
      expect(ledger.sequence).toBeGreaterThan(0);
      expect(typeof ledger.closed_at).toBe("string");
      expect(new Date(ledger.closed_at).getTime()).not.toBeNaN();
      expect(typeof ledger.close_time_seconds).toBe("number");
      expect(ledger.close_time_seconds).toBeGreaterThan(0);
    }
  });
});

import { config } from "../config.js";
import { TrackLedgerConsensusTimeInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import logger from "../logger.js";
import type { McpToolHandler } from "../types.js";

export interface LedgerConsensusRecord {
  /** Ledger sequence number */
  sequence: number;
  /** ISO-8601 close time of this ledger */
  closed_at: string;
  /** Seconds elapsed since the previous ledger closed */
  close_time_seconds: number;
}

export interface TrackLedgerConsensusTimeOutput {
  network: string;
  sample_size: number;
  average_consensus_seconds: number;
  min_consensus_seconds: number;
  max_consensus_seconds: number;
  /** Standard deviation of close times (seconds) */
  std_dev_seconds: number;
  ledgers: LedgerConsensusRecord[];
  sampled_at: string;
}

/**
 * Tool: track_ledger_consensus_time
 *
 * Queries Horizon for the N most recent ledgers and computes the average
 * (and min/max/std-dev) time between consecutive ledger closes.
 *
 * On the Stellar network a ledger closes roughly every 5 seconds.
 * This tool surfaces deviations from that baseline so AI assistants and
 * operators can detect network congestion or validator slowdowns.
 */
export const trackLedgerConsensusTime: McpToolHandler<
  typeof TrackLedgerConsensusTimeInputSchema
> = async (input: unknown) => {
  // ── 1. Validate input ────────────────────────────────────────────────────
  const validated = TrackLedgerConsensusTimeInputSchema.safeParse(input);
  if (!validated.success) {
    throw new PulsarValidationError(
      "Invalid input for track_ledger_consensus_time",
      validated.error.format()
    );
  }

  const { sample_size, network: networkOverride } = validated.data;
  const network = networkOverride ?? config.stellarNetwork;
  const server = getHorizonServer(network);

  logger.debug(
    { network, sample_size },
    "track_ledger_consensus_time: fetching recent ledgers"
  );

  // ── 2. Fetch recent ledgers from Horizon ─────────────────────────────────
  // We request sample_size + 1 records so we can compute sample_size intervals.
  let records: Array<{ sequence: number; closed_at: string }>;
  try {
    const page = await server
      .ledgers()
      .order("desc")
      .limit(sample_size + 1)
      .call();

    records = page.records.map((r: any) => ({
      sequence: r.sequence as number,
      closed_at: r.closed_at as string,
    }));
  } catch (err: any) {
    throw new PulsarNetworkError(
      err.message || "Failed to fetch ledgers from Horizon",
      { network, originalError: err }
    );
  }

  if (records.length < 2) {
    throw new PulsarNetworkError(
      "Horizon returned fewer than 2 ledger records — cannot compute consensus time",
      { network, returned: records.length }
    );
  }

  // ── 3. Compute inter-ledger close times ──────────────────────────────────
  // Records are ordered newest-first; reverse so we iterate chronologically.
  const sorted = [...records].reverse();

  const consensusRecords: LedgerConsensusRecord[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].closed_at).getTime();
    const curr = new Date(sorted[i].closed_at).getTime();
    const deltaSeconds = (curr - prev) / 1_000;

    consensusRecords.push({
      sequence: sorted[i].sequence,
      closed_at: sorted[i].closed_at,
      close_time_seconds: parseFloat(deltaSeconds.toFixed(3)),
    });
  }

  // ── 4. Aggregate statistics ───────────────────────────────────────────────
  const times = consensusRecords.map((r) => r.close_time_seconds);
  const n = times.length;

  const average = times.reduce((sum, t) => sum + t, 0) / n;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const variance = times.reduce((sum, t) => sum + (t - average) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  logger.info(
    { network, sample_size: n, average_consensus_seconds: average.toFixed(3) },
    "track_ledger_consensus_time: computed"
  );

  return {
    network,
    sample_size: n,
    average_consensus_seconds: parseFloat(average.toFixed(3)),
    min_consensus_seconds: parseFloat(min.toFixed(3)),
    max_consensus_seconds: parseFloat(max.toFixed(3)),
    std_dev_seconds: parseFloat(stdDev.toFixed(3)),
    ledgers: consensusRecords,
    sampled_at: new Date().toISOString(),
  } satisfies TrackLedgerConsensusTimeOutput;
};

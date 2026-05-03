import { z } from "zod";
import { config } from "../config.js";
import { getHorizonUrl } from "../services/horizon.js";
import { NetworkSchema } from "../schemas/index.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export const GetFeeStatsInputSchema = z.object({
  network: NetworkSchema.optional().describe("Override the network for fee stats lookup"),
});

export type GetFeeStatsInput = z.infer<typeof GetFeeStatsInputSchema>;

export interface FeeStatsOutput {
  min_accepted_fee: string;
  max_accepted_fee: string;
  avg_accepted_fee: string;
  p_10: string;
  p_20: string;
  p_30: string;
  p_40: string;
  p_50: string;
  p_60: string;
  p_70: string;
  p_80: string;
  p_90: string;
  p_95: string;
  p_99: string;
  last_ledger: string;
  last_ledger_base_fee: string;
  ledger_capacity_usage: number;
  recommended_fee_stroops: string;
  network: string;
}

/**
 * Tool: get_fee_stats
 *
 * Retrieve recent network fee statistics from Horizon to help estimate
 * optimal transaction fees. Returns percentiles and a recommended fee based
 * on the 50th percentile (median).
 */
export const getFeeStats: McpToolHandler<typeof GetFeeStatsInputSchema> = async (input: unknown): Promise<Record<string, unknown>> => {
  const parsed = GetFeeStatsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError("Invalid input for get_fee_stats", parsed.error.format());
  }

  const { network } = parsed.data;
  const baseUrl = getHorizonUrl(network ?? config.stellarNetwork);

  try {
    const response = await fetch(`${baseUrl}/fee_stats`);

    if (!response.ok) {
      const text = await response.text();
      throw new PulsarNetworkError(
        `Horizon fee_stats error ${response.status}: ${text}`,
        { status: response.status }
      );
    }

    const data = await response.json();

    // Determine recommended fee: prefer p_50 (median), else avg, else min
    const recommended =
      data.p_50 ??
      data.avg_accepted_fee ??
      data.min_accepted_fee ??
      "0";

    const result: FeeStatsOutput = {
      min_accepted_fee: data.min_accepted_fee ?? "0",
      max_accepted_fee: data.max_accepted_fee ?? "0",
      avg_accepted_fee: data.avg_accepted_fee ?? "0",
      p_10: data.p_10 ?? "0",
      p_20: data.p_20 ?? "0",
      p_30: data.p_30 ?? "0",
      p_40: data.p_40 ?? "0",
      p_50: data.p_50 ?? "0",
      p_60: data.p_60 ?? "0",
      p_70: data.p_70 ?? "0",
      p_80: data.p_80 ?? "0",
      p_90: data.p_90 ?? "0",
      p_95: data.p_95 ?? "0",
      p_99: data.p_99 ?? "0",
      last_ledger: data.last_ledger ?? "0",
      last_ledger_base_fee: data.last_ledger_base_fee ?? "0",
      ledger_capacity_usage: data.ledger_capacity_usage ?? 0,
      recommended_fee_stroops: recommended,
      network: network ?? config.stellarNetwork,
    };

    return result as Record<string, unknown>;
  } catch (err: any) {
    if (err instanceof PulsarNetworkError || err instanceof PulsarValidationError) {
      throw err;
    }
    throw new PulsarNetworkError(
      err.message || "Failed to fetch fee stats",
      { originalError: err }
    );
  }
};

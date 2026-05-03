import { z } from "zod";
import { config } from "../config.js";
import { getHorizonUrl } from "../services/horizon.js";
import { NetworkSchema } from "../schemas/index.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export const GetLiquidityPoolInputSchema = z.object({
  liquidity_pool_id: z.string().min(1).describe("The liquidity pool ID (e.g. POOL_...)"),
  network: NetworkSchema.optional(),
});

export type GetLiquidityPoolInput = z.infer<typeof GetLiquidityPoolInputSchema>;

export interface LiquidityPoolReserve {
  asset: string;
  amount: string;
}

export interface GetLiquidityPoolOutput {
  liquidity_pool_id: string;
  fee_bp: number;
  type: string;
  reserves: LiquidityPoolReserve[];
  total_shares: string;
  network: string;
}

/**
 * Tool: get_liquidity_pool
 *
 * Fetch AMM liquidity pool details: reserves, total shares, fee, and type.
 * Queries the Stellar Horizon API.
 */
export const getLiquidityPool: McpToolHandler<typeof GetLiquidityPoolInputSchema> = async (input: unknown): Promise<Record<string, unknown>> => {
  const parsed = GetLiquidityPoolInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError("Invalid input for get_liquidity_pool", parsed.error.format());
  }

  const { liquidity_pool_id, network } = parsed.data;
  const baseUrl = getHorizonUrl(network ?? config.stellarNetwork);

  try {
    const response = await fetch(`${baseUrl}/liquidity_pools/${encodeURIComponent(liquidity_pool_id)}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new PulsarNetworkError(
          "Liquidity pool not found",
          { status: 404, liquidity_pool_id }
        );
      }
      const text = await response.text();
      throw new PulsarNetworkError(
        `Horizon API error ${response.status}: ${text}`,
        { status: response.status, liquidity_pool_id }
      );
    }

    const data = await response.json() as any;

    // Normalize reserves
    const reserves: LiquidityPoolReserve[] = (data.reserves || []).map((r: any) => ({
      asset: r.asset,
      amount: r.amount,
    }));

    const result: GetLiquidityPoolOutput = {
      liquidity_pool_id: data.id || liquidity_pool_id,
      fee_bp: data.fee_bp ?? data.feeBp ?? 0,
      type: data.type || "",
      reserves,
      total_shares: data.total_shares ?? data.totalShares ?? "0",
      network: network ?? config.stellarNetwork,
    };

    return result as Record<string, unknown>;
  } catch (err: any) {
    if (err instanceof PulsarNetworkError || err instanceof PulsarValidationError) {
      throw err;
    }
    throw new PulsarNetworkError(
      err.message || "Failed to fetch liquidity pool data",
      { originalError: err, liquidity_pool_id }
    );
  }
};

import { config } from "../config.js";
import { GetClaimableBalanceInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export interface Claimant {
  destination: string;
  predicate: Record<string, unknown>;
}

export interface ClaimableBalanceRecord {
  id: string;
  asset: string;
  amount: string;
  sponsor?: string;
  last_modified_ledger: number;
  claimants: Claimant[];
  flags?: { clawback_enabled?: boolean };
}

export interface GetClaimableBalanceOutput {
  account_id?: string;
  balance_id?: string;
  balances: ClaimableBalanceRecord[];
}

export const getClaimableBalance: McpToolHandler<
  typeof GetClaimableBalanceInputSchema
> = async (input: unknown) => {
  const validatedInput = GetClaimableBalanceInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for get_claimable_balance",
      validatedInput.error.format()
    );
  }

  const { account_id, balance_id, network } = validatedInput.data;
  const server = getHorizonServer(network ?? config.stellarNetwork);

  try {
    if (balance_id) {
      const record = await server.claimableBalances().claimableBalance(balance_id).call();
      return {
        balance_id,
        balances: [{
          id: record.id, asset: record.asset, amount: record.amount,
          sponsor: record.sponsor, last_modified_ledger: Number(record.last_modified_ledger),
          claimants: record.claimants.map((c: any) => ({ destination: c.destination, predicate: c.predicate })),
flags: (record as any).flags,
        }],
      };
    }

    const records = await server.claimableBalances().claimant(account_id!).limit(200).order("desc").call();
    const balances: ClaimableBalanceRecord[] = records.records.map((r: any) => ({
      id: r.id, asset: r.asset, amount: r.amount, sponsor: r.sponsor,
      last_modified_ledger: Number(r.last_modified_ledger),
      claimants: r.claimants.map((c: any) => ({ destination: c.destination, predicate: c.predicate })),
      flags: (r as any).flags,
    }));

    return { account_id: account_id!, balances };
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError("Claimable balance not found", { status: 404, balance_id, account_id });
    }
    throw new PulsarNetworkError(err.message || "Failed to fetch claimable balances", { originalError: err });
  }
};
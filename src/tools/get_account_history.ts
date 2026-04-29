import { config } from "../config.js";
import { GetAccountHistoryInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export interface TransactionRecord {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  fee_charged: string;
  operation_count: number;
  memo_type: string;
  memo?: string;
  successful: boolean;
}

export interface GetAccountHistoryOutput {
  account_id: string;
  network: string;
  transaction_count: number;
  transactions: TransactionRecord[];
  cursor?: string;
}

/**
 * Tool: get_account_history
 * Fetches recent transaction history for a Stellar account via Horizon.
 * Returns structured, AI-consumable JSON with pagination support.
 */
export const getAccountHistory: McpToolHandler<
  typeof GetAccountHistoryInputSchema
> = async (input: unknown) => {
  const validatedInput = GetAccountHistoryInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for get_account_history",
      validatedInput.error.format()
    );
  }

  const { account_id, network, limit, cursor, order } = validatedInput.data;
  const server = getHorizonServer(network ?? config.stellarNetwork);

  try {
    // Verify the account exists first — gives a clear error if not funded
    await server.loadAccount(account_id);

    let builder = server
      .transactions()
      .forAccount(account_id)
      .limit(limit ?? 10)
      .order(order ?? "desc");

    if (cursor) {
      builder = builder.cursor(cursor);
    }

    const response = await builder.call();

    const transactions: TransactionRecord[] = response.records.map(
      (tx: any) => ({
        id: tx.id,
        hash: tx.hash,
        ledger: tx.ledger,
        created_at: tx.created_at,
        source_account: tx.source_account,
        fee_charged: tx.fee_charged,
        operation_count: tx.operation_count,
        memo_type: tx.memo_type,
        memo: tx.memo,
        successful: tx.successful,
      })
    );

    // Extract next page cursor from the last record's paging token
    const lastRecord = response.records[response.records.length - 1];
    const nextCursor = lastRecord?.paging_token;

    const result: GetAccountHistoryOutput = {
      account_id,
      network: network ?? config.stellarNetwork,
      transaction_count: transactions.length,
      transactions,
    };

    if (nextCursor && transactions.length === (limit ?? 10)) {
      result.cursor = nextCursor;
    }

    return result as unknown as Record<string, unknown>;
  } catch (err: any) {
    if (err instanceof PulsarValidationError) throw err;
    if (err instanceof PulsarNetworkError) throw err;

    if (err?.response?.status === 404) {
      throw new PulsarNetworkError(
        "Account not found — it may not be funded yet",
        { status: 404, account_id }
      );
    }

    throw new PulsarNetworkError(
      err.message || "Failed to fetch account transaction history",
      { originalError: err }
    );
  }
};
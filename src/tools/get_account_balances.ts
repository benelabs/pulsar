import { config } from '../config.js';
import { GetAccountBalancesInputSchema } from '../schemas/tools.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError } from '../errors.js';
import { getHorizonServer } from '../services/horizon.js';
import type { McpToolHandler } from '../types.js';

import { loadAccountBalance, type GetAccountBalanceOutput } from './get_account_balance.js';

export interface GetAccountBalancesSuccessResult extends GetAccountBalanceOutput {
  status: 'success';
}

export interface GetAccountBalancesErrorResult extends Record<string, unknown> {
  account_id: string;
  status: 'error';
  error_code: string;
  message: string;
  details?: unknown;
}

export interface GetAccountBalancesOutput extends Record<string, unknown> {
  network: string;
  requested: number;
  succeeded: number;
  failed: number;
  max_concurrency: number;
  duration_ms: number;
  results: Array<GetAccountBalancesSuccessResult | GetAccountBalancesErrorResult>;
}

async function mapWithConcurrencyLimit<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  return results;
}

function toBatchErrorResult(accountId: string, error: unknown): GetAccountBalancesErrorResult {
  const normalizedError =
    error instanceof PulsarError
      ? error
      : new PulsarNetworkError(
          error instanceof Error ? error.message : 'Failed to load account balance',
          { account_id: accountId, originalError: error }
        );

  return {
    account_id: accountId,
    status: 'error',
    error_code: normalizedError.code,
    message: normalizedError.message,
    details: normalizedError.details,
  };
}

/**
 * Tool: get_account_balances
 * Queries Horizon for multiple account balances in a single call.
 * Requests are executed concurrently with a bounded concurrency limit.
 */
export const getAccountBalances: McpToolHandler<typeof GetAccountBalancesInputSchema> = async (
  input: unknown
) => {
  const validatedInput = GetAccountBalancesInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for get_account_balances',
      validatedInput.error.format()
    );
  }

  const { account_ids, asset_code, asset_issuer, max_concurrency, network } = validatedInput.data;
  const resolvedNetwork = network ?? config.stellarNetwork;
  const server = getHorizonServer(resolvedNetwork);
  const startedAt = Date.now();

  const results = await mapWithConcurrencyLimit(account_ids, max_concurrency, async (accountId) => {
    try {
      const result = await loadAccountBalance(server, {
        account_id: accountId,
        asset_code,
        asset_issuer,
      });

      return {
        status: 'success' as const,
        ...result,
      };
    } catch (error) {
      return toBatchErrorResult(accountId, error);
    }
  });

  const succeeded = results.filter(
    (result): result is GetAccountBalancesSuccessResult => result.status === 'success'
  ).length;

  return {
    network: resolvedNetwork,
    requested: account_ids.length,
    succeeded,
    failed: results.length - succeeded,
    max_concurrency,
    duration_ms: Date.now() - startedAt,
    results,
  };
};

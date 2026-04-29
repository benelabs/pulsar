import { Horizon } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import { GetAccountBalanceInputSchema } from '../schemas/tools.js';
import { getHorizonServer } from '../services/horizon.js';
import type { McpToolHandler } from '../types.js';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export interface GetAccountBalanceOutput extends Record<string, unknown> {
  account_id: string;
  balances: Balance[];
}

export interface AccountBalanceFilters {
  asset_code?: string;
  asset_issuer?: string;
}

export interface AccountBalanceQuery extends AccountBalanceFilters {
  account_id: string;
}

interface HorizonBalanceLine {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonLikeError {
  message?: string;
  response?: {
    status?: number;
  };
}

type LoadedAccount = Awaited<ReturnType<Horizon.Server['loadAccount']>>;

function mapBalances(
  account: LoadedAccount,
  { asset_code, asset_issuer }: AccountBalanceFilters
): Balance[] {
  let balances: Balance[] = (account.balances as HorizonBalanceLine[]).map((balance) => ({
    asset_type: balance.asset_type,
    asset_code: balance.asset_code,
    asset_issuer: balance.asset_issuer,
    balance: balance.balance,
  }));

  if (asset_code) {
    balances = balances.filter((balance) => balance.asset_code === asset_code);
  }

  if (asset_issuer) {
    balances = balances.filter((balance) => balance.asset_issuer === asset_issuer);
  }

  return balances;
}

export async function loadAccountBalance(
  server: Horizon.Server,
  { account_id, asset_code, asset_issuer }: AccountBalanceQuery
): Promise<GetAccountBalanceOutput> {
  try {
    const account = await server.loadAccount(account_id);

    return {
      account_id,
      balances: mapBalances(account, { asset_code, asset_issuer }),
    };
  } catch (error: unknown) {
    const horizonError = error as HorizonLikeError;

    if (horizonError.response && horizonError.response.status === 404) {
      throw new PulsarNetworkError('Account not found - it may not be funded yet', {
        status: 404,
        account_id,
      });
    }

    throw new PulsarNetworkError(horizonError.message || 'Failed to load account balance', {
      originalError: error,
      account_id,
    });
  }
}

/**
 * Tool: get_account_balance
 * Queries Horizon for an account's XLM and asset balances.
 * Returns structured JSON.
 */
export const getAccountBalance: McpToolHandler<typeof GetAccountBalanceInputSchema> = async (
  input: unknown
) => {
  const validatedInput = GetAccountBalanceInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for get_account_balance',
      validatedInput.error.format()
    );
  }

  const { account_id, network, asset_code, asset_issuer } = validatedInput.data;
  const server = getHorizonServer(network ?? config.stellarNetwork);

  return loadAccountBalance(server, {
    account_id,
    asset_code,
    asset_issuer,
  });
};

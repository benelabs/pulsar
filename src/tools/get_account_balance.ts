import { config } from '../config.js';
import { GetAccountBalanceInputSchema } from '../schemas/tools.js';
import { getHorizonServer } from '../services/horizon.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export interface Balance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export interface GetAccountBalanceOutput {
  account_id: string;
  balances: Balance[];
}

/**
 * Tool: get_account_balance
 * Queries Horizon for an account's XLM and asset balances.
 * Returns structured JSON.
 */
export const getAccountBalance: McpToolHandler<typeof GetAccountBalanceInputSchema> = async (
  input: unknown
) => {
  // Validate input schema
  const validatedInput = GetAccountBalanceInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for get_account_balance',
      validatedInput.error.format()
    );
  }

  const { account_id, network, asset_code, asset_issuer } = validatedInput.data;
  const server = getHorizonServer(network ?? config.stellarNetwork);

  try {
    const account = await server.loadAccount(account_id);

    let balances: Balance[] = account.balances.map((b: unknown) => {
      const balance = b as {
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      };
      return {
        asset_type: balance.asset_type,
        asset_code: balance.asset_code,
        asset_issuer: balance.asset_issuer,
        balance: balance.balance,
      };
    });

    // Filter by asset_code if provided
    if (asset_code) {
      balances = balances.filter((b) => b.asset_code === asset_code);
    }
    // Filter by asset_issuer if provided
    if (asset_issuer) {
      balances = balances.filter((b) => b.asset_issuer === asset_issuer);
    }

    return {
      account_id,
      balances,
    };
  } catch (err: unknown) {
    const error = err as { response?: { status?: number }; message?: string };
    // Handle 404 (account not found)
    if (error.response && error.response.status === 404) {
      throw new PulsarNetworkError('Account not found — it may not be funded yet', {
        status: 404,
        account_id,
      });
    }

    throw new PulsarNetworkError(error.message || 'Failed to load account balance', {
      originalError: err,
    });
  }
};

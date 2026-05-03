import { config } from '../config.js';
import { GetAccountBalanceInputSchema } from '../schemas/tools.js';
import { getHorizonServer } from '../services/horizon.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import { config } from "../config.js";
import { GetAccountBalanceInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import { normalizeAddress, AddressCache } from "../utils/address.js";
import type { McpToolHandler } from "../types.js";

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

// Cache account balances keyed by "network:account_id:asset_code:asset_issuer".
// 15-second TTL is short enough to stay fresh for interactive use while
// eliminating duplicate fetches from rapid successive tool calls.
export const accountBalanceCache = new AddressCache<GetAccountBalanceOutput>(15_000);

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
export const getAccountBalance: McpToolHandler<
  typeof GetAccountBalanceInputSchema
> = async (input: unknown) => {
  // Normalize address fields before schema validation so that trimmed or
  // mixed-case public keys pass the base32 regex and hit the cache correctly.
  const raw = input as Record<string, unknown>;
  const preNormalized = {
    ...raw,
    ...(typeof raw.account_id === "string" ? { account_id: normalizeAddress(raw.account_id) } : {}),
    ...(typeof raw.asset_issuer === "string" ? { asset_issuer: normalizeAddress(raw.asset_issuer) } : {}),
  };

  const validatedInput = GetAccountBalanceInputSchema.safeParse(preNormalized);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for get_account_balance',
      validatedInput.error.format()
    );
  }

  const rawData = validatedInput.data;
  const account_id = rawData.account_id;
  const asset_issuer = rawData.asset_issuer;
  const { asset_code } = rawData;
  const network = rawData.network ?? config.stellarNetwork;

  const cacheKey = `${network}:${account_id}:${asset_code ?? ""}:${asset_issuer ?? ""}`;
  const cached = accountBalanceCache.get(cacheKey);
  if (cached) return cached;

  const server = getHorizonServer(network);

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

    if (asset_code) {
      balances = balances.filter((b) => b.asset_code === asset_code);
    }
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
    const result: GetAccountBalanceOutput = { account_id, balances };
    accountBalanceCache.set(cacheKey, result);
    return result;
  } catch (err: any) {
    if (err.response && err.response.status === 404) {
      throw new PulsarNetworkError(
        "Account not found — it may not be funded yet",
        { status: 404, account_id }
      );
    }
    throw new PulsarNetworkError(
      err.message || "Failed to load account balance",
      { originalError: err }
    );
  }
};

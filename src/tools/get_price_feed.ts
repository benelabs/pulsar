import { TransactionBuilder, Operation, xdr, scValToNative, Networks } from '@stellar/stellar-sdk';

import { getHorizonServer } from '../services/horizon.js';
import { simulateSorobanTransaction } from '../services/soroban-rpc.js';
import { config } from '../config.js';
import { GetPriceFeedInputSchema } from '../schemas/tools.js';
import type { McpToolHandler } from '../types.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import logger from '../logger.js';

export interface GetPriceFeedOutput {
  contract_id: string;
  base_asset: string;
  quote_asset: string;
  price: string; // i128 as string
  network: string;
}

/** Resolve the stellar-base network passphrase. */
function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}

/**
 * Tool: get_price_feed
 *
 * Queries a decentralized oracle contract for the price of a base asset in terms of a quote asset.
 * Builds a transaction invoking the contract's 'get_price' function with base_asset and quote_asset symbols,
 * simulates it to get the return value, and returns the price.
 *
 * Assumes the oracle contract implements a standard interface:
 * - Function: get_price(base_asset: Symbol, quote_asset: Symbol) -> i128
 */
export const getPriceFeed: McpToolHandler<typeof GetPriceFeedInputSchema> = async (
  input: unknown
) => {
  const validatedInput = GetPriceFeedInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for get_price_feed',
      validatedInput.error.format()
    );
  }

  const data = validatedInput.data;
  const network = data.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);

  // ------------------------------------------------------------------
  // 1. Fetch a source account for the transaction (any funded account)
  // ------------------------------------------------------------------
  const horizonServer = getHorizonServer(network);
  // Use a dummy account for simulation; we can use any account since it's read-only
  const dummyAccountId = 'GAUZUPTHOMSZEV65VNSRMUDABE6VWNUWPYJQHVTAAT5UQF3F3T7BHEOX'; // Example testnet account
  let account;
  try {
    logger.debug(
      { account: dummyAccountId, network },
      'Loading dummy account for price feed query'
    );
    account = await horizonServer.loadAccount(dummyAccountId);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new PulsarNetworkError(`Failed to load dummy account for simulation: ${error.message}`, {
      originalError: err,
    });
  }

  // ------------------------------------------------------------------
  // 2. Build the contract invoke operation
  // ------------------------------------------------------------------
  const args = [xdr.ScVal.scvSymbol(data.base_asset), xdr.ScVal.scvSymbol(data.quote_asset)];

  const operation = Operation.invokeContractFunction({
    contract: data.contract_id,
    function: 'get_price',
    args,
  });

  // ------------------------------------------------------------------
  // 3. Build the transaction
  // ------------------------------------------------------------------
  const tx = new TransactionBuilder(account, {
    fee: (100_000).toString(),
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // ------------------------------------------------------------------
  // 4. Simulate the transaction to get the price
  // ------------------------------------------------------------------
  const simulationResult = await simulateSorobanTransaction(tx.toXDR(), network);

  if (simulationResult.status !== 'success') {
    throw new PulsarNetworkError(
      `Simulation failed: ${simulationResult.error || 'Unknown error'}`,
      { simulationResult }
    );
  }

  if (!simulationResult.return_value) {
    throw new PulsarNetworkError('No return value from contract simulation', { simulationResult });
  }

  // Parse the return value as i128
  let price: string;
  try {
    const nativeValue = scValToNative(simulationResult.return_value);
    if (typeof nativeValue !== 'bigint') {
      throw new Error('Return value is not an integer');
    }
    price = nativeValue.toString();
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new PulsarNetworkError(
      `Failed to parse price from contract return value: ${error.message}`,
      { returnValue: simulationResult.return_value }
    );
  }

  return {
    contract_id: data.contract_id,
    base_asset: data.base_asset,
    quote_asset: data.quote_asset,
    price,
    network,
  };
};

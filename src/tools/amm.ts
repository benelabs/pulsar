/**
 * AMM (Automated Market Maker) Tool Implementation
 *
 * Provides constant-product (x*y=k) AMM functionality for Stellar/Soroban.
 * Supports token swaps, liquidity provision/removal, and pool queries.
 *
 * Features:
 * - Token swap with slippage protection
 * - Liquidity provision with LP share calculation
 * - Liquidity removal with minimum output protection
 * - Pool quote calculation
 * - Pool reserve information
 */

import {
  Account,
  Address,
  Asset,
  Keypair,
  Networks,
  Operation,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { getSorobanServer } from "../services/soroban-rpc.js";
import { PulsarValidationError, PulsarNetworkError } from "../errors.js";
import logger from "../logger.js";
import {
  AMMSwapInput,
  AMMAddLiquidityInput,
  AMMRemoveLiquidityInput,
  AMMGetQuoteInput,
  AMMGetPoolInfoInput,
} from "../schemas/amm.js";

/**
 * Fee basis points for AMM operations (0.30% = 30 bps)
 */
const FEE_BPS = 30;
const FEE_DENOMINATOR = 10000;

/**
 * Calculate swap output using constant-product formula: x * y = k
 *
 * Formula: output = (reserve_out * amount_in * (1 - fee)) / (reserve_in + amount_in * (1 - fee))
 *
 * @param amountIn - Input amount in stroops
 * @param reserveIn - Input asset reserve in stroops
 * @param reserveOut - Output asset reserve in stroops
 * @returns Expected output amount in stroops
 */
export function calculateSwapOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn <= 0n) {
    throw new PulsarValidationError("Swap amount must be positive");
  }

  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new PulsarValidationError("Pool reserves must be positive");
  }

  // Calculate amount with fee: amount_in * (1 - fee)
  const amountInWithFee = amountIn * BigInt(FEE_DENOMINATOR - FEE_BPS);

  // Calculate output: (reserve_out * amount_in_with_fee) / (reserve_in * 10000 + amount_in_with_fee)
  const numerator = reserveOut * amountInWithFee;
  const denominator = reserveIn * BigInt(FEE_DENOMINATOR) + amountInWithFee;

  return numerator / denominator;
}

/**
 * Calculate LP shares for adding liquidity
 *
 * For initial deposit: shares = sqrt(amount_a * amount_b)
 * For subsequent deposits: shares = min((amount_a * total_shares) / reserve_a, (amount_b * total_shares) / reserve_b)
 *
 * @param amountA - Amount of asset A in stroops
 * @param amountB - Amount of asset B in stroops
 * @param reserveA - Current reserve of asset A in stroops
 * @param reserveB - Current reserve of asset B in stroops
 * @param totalShares - Current total LP shares
 * @returns LP shares to mint
 */
export function calculateLiquidityShares(
  amountA: bigint,
  amountB: bigint,
  reserveA: bigint,
  reserveB: bigint,
  totalShares: bigint
): bigint {
  if (amountA <= 0n || amountB <= 0n) {
    throw new PulsarValidationError("Deposit amounts must be positive");
  }

  // Initial liquidity provision
  if (totalShares === 0n) {
    // shares = sqrt(amount_a * amount_b)
    const product = amountA * amountB;
    return integerSquareRoot(product);
  }

  // Subsequent liquidity provision
  const sharesA = (amountA * totalShares) / reserveA;
  const sharesB = (amountB * totalShares) / reserveB;

  // Return the minimum to maintain the pool ratio
  return sharesA < sharesB ? sharesA : sharesB;
}

/**
 * Calculate assets received when removing liquidity
 *
 * @param sharesAmount - Amount of LP shares to burn
 * @param reserveA - Current reserve of asset A in stroops
 * @param reserveB - Current reserve of asset B in stroops
 * @param totalShares - Current total LP shares
 * @returns Object containing asset A and asset B amounts
 */
export function calculateRemoveLiquidity(
  sharesAmount: bigint,
  reserveA: bigint,
  reserveB: bigint,
  totalShares: bigint
): { amountA: bigint; amountB: bigint } {
  if (sharesAmount <= 0n) {
    throw new PulsarValidationError("Shares amount must be positive");
  }

  if (totalShares <= 0n) {
    throw new PulsarValidationError("Total shares must be positive");
  }

  if (sharesAmount > totalShares) {
    throw new PulsarValidationError("Shares amount exceeds total shares");
  }

  const amountA = (sharesAmount * reserveA) / totalShares;
  const amountB = (sharesAmount * reserveB) / totalShares;

  return { amountA, amountB };
}

/**
 * Integer square root using Newton's method
 *
 * @param value - Value to calculate square root of
 * @returns Floor of the square root
 */
function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) {
    throw new PulsarValidationError("Cannot calculate square root of negative number");
  }

  if (value === 0n) return 0n;

  let x = value;
  let y = (x + 1n) / 2n;

  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }

  return x;
}

/**
 * Parse asset code and issuer into Asset object
 *
 * @param assetCode - Asset code (e.g., "XLM", "USDC")
 * @param assetIssuer - Asset issuer public key (optional for XLM)
 * @returns Stellar Asset object
 */
function parseAsset(assetCode: string, assetIssuer?: string): Asset {
  if (assetCode === "XLM" || !assetIssuer) {
    return Asset.native();
  }

  return new Asset(assetCode, assetIssuer);
}

/**
 * Build swap transaction XDR for AMM contract
 *
 * @param input - Validated AMM swap input
 * @returns Transaction XDR ready for signing and submission
 */
export async function buildSwapTransaction(
  input: AMMSwapInput
): Promise<string> {
  logger.info({ amm_contract_id: input.amm_contract_id, offer_asset_code: input.offer_asset_code },
    "Building AMM swap transaction"
  );

  try {
    const server = getSorobanServer(input.network);

    // Get source account to build transaction
    const sourceAccount = await server.getAccount(input.source_account);
    const account = new Account(input.source_account, sourceAccount.sequenceNumber());

    // Build the transaction
    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: getNetworkPassphrase(input.network),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: input.amm_contract_id,
          function: "swap",
          args: [
            parseAsset(input.offer_asset_code, input.offer_asset_issuer),
            BigInt(input.offer_amount),
            parseAsset(input.receive_asset_code, input.receive_asset_issuer),
            BigInt(input.min_receive_amount),
          ],
        })
      )
      .setTimeout(300)
      .build();

    const xdr = transaction.toXDR();
    logger.info("AMM swap transaction built successfully");

    return xdr;
  } catch (error) {
    logger.error({ error, input }, "Failed to build AMM swap transaction");
    throw new PulsarNetworkError(
      `Failed to build swap transaction: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Build add liquidity transaction XDR for AMM contract
 *
 * @param input - Validated AMM add liquidity input
 * @returns Transaction XDR ready for signing and submission
 */
export async function buildAddLiquidityTransaction(
  input: AMMAddLiquidityInput
): Promise<string> {
  logger.info({ amm_contract_id: input.amm_contract_id }, "Building AMM add liquidity transaction");

  try {
    const server = getSorobanServer(input.network);

    const sourceAccount = await server.getAccount(input.source_account);
    const account = new Account(input.source_account, sourceAccount.sequenceNumber());

    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: getNetworkPassphrase(input.network),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: input.amm_contract_id,
          function: "add_liquidity",
          args: [
            parseAsset(input.asset_a_code, input.asset_a_issuer),
            BigInt(input.asset_a_amount),
            parseAsset(input.asset_b_code, input.asset_b_issuer),
            BigInt(input.asset_b_amount),
            BigInt(input.min_shares_received),
          ],
        })
      )
      .setTimeout(300)
      .build();

    const xdr = transaction.toXDR();
    logger.info("AMM add liquidity transaction built successfully");

    return xdr;
  } catch (error) {
    logger.error({ error, input }, "Failed to build AMM add liquidity transaction");
    throw new PulsarNetworkError(
      `Failed to build add liquidity transaction: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Build remove liquidity transaction XDR for AMM contract
 *
 * @param input - Validated AMM remove liquidity input
 * @returns Transaction XDR ready for signing and submission
 */
export async function buildRemoveLiquidityTransaction(
  input: AMMRemoveLiquidityInput
): Promise<string> {
  logger.info({ amm_contract_id: input.amm_contract_id }, "Building AMM remove liquidity transaction");

  try {
    const server = getSorobanServer(input.network);

    const sourceAccount = await server.getAccount(input.source_account);
    const account = new Account(input.source_account, sourceAccount.sequenceNumber());

    const transaction = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: getNetworkPassphrase(input.network),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: input.amm_contract_id,
          function: "remove_liquidity",
          args: [
            BigInt(input.shares_amount),
            BigInt(input.min_asset_a_amount),
            BigInt(input.min_asset_b_amount),
          ],
        })
      )
      .setTimeout(300)
      .build();

    const xdr = transaction.toXDR();
    logger.info("AMM remove liquidity transaction built successfully");

    return xdr;
  } catch (error) {
    logger.error({ error, input }, "Failed to build AMM remove liquidity transaction");
    throw new PulsarNetworkError(
      `Failed to build remove liquidity transaction: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Get quote for AMM swap (read-only operation)
 *
 * @param input - Validated AMM quote input
 * @returns Quote information including expected output and price impact
 */
export async function getSwapQuote(
  input: AMMGetQuoteInput
): Promise<Record<string, unknown>> {
  logger.info({ amm_contract_id: input.amm_contract_id, offer_asset_code: input.offer_asset_code },
    "Getting AMM swap quote"
  );

  try {
    const server = getSorobanServer(input.network);

    // Get pool reserves
    const poolInfo = await getPoolReserves(
      server,
      input.amm_contract_id,
      input.offer_asset_code,
      input.offer_asset_issuer,
      input.receive_asset_code,
      input.receive_asset_issuer
    );

    const amountIn = BigInt(input.offer_amount);
    const output = calculateSwapOutput(
      amountIn,
      poolInfo.reserveA,
      poolInfo.reserveB
    );

    // Calculate price impact
    const expectedOutputWithoutSlippage = (amountIn * poolInfo.reserveB) / poolInfo.reserveA;
    const priceImpactBps = expectedOutputWithoutSlippage > 0n
      ? Number(((expectedOutputWithoutSlippage - output) * BigInt(FEE_DENOMINATOR)) / expectedOutputWithoutSlippage)
      : 0;

    return {
      status: "success",
      offer_asset: {
        code: input.offer_asset_code,
        issuer: input.offer_asset_issuer || "native",
        amount: input.offer_amount,
      },
      receive_asset: {
        code: input.receive_asset_code,
        issuer: input.receive_asset_issuer || "native",
        amount: output.toString(),
      },
      pool_reserves: {
        reserve_a: poolInfo.reserveA.toString(),
        reserve_b: poolInfo.reserveB.toString(),
      },
      fee_bps: FEE_BPS,
      price_impact_bps: priceImpactBps,
      exchange_rate: Number(output) / Number(amountIn),
    };
  } catch (error) {
    logger.error({ error, input }, "Failed to get AMM swap quote");
    throw new PulsarNetworkError(
      `Failed to get swap quote: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Get pool information for an AMM pair
 *
 * @param input - Validated AMM pool info input
 * @returns Pool reserves and LP share information
 */
export async function getPoolInfo(
  input: AMMGetPoolInfoInput
): Promise<Record<string, unknown>> {
  logger.info({ amm_contract_id: input.amm_contract_id, asset_a_code: input.asset_a_code },
    "Getting AMM pool information"
  );

  try {
    const server = getSorobanServer(input.network);

    const poolInfo = await getPoolReserves(
      server,
      input.amm_contract_id,
      input.asset_a_code,
      input.asset_a_issuer,
      input.asset_b_code,
      input.asset_b_issuer
    );

    return {
      status: "success",
      pool: {
        asset_a: {
          code: input.asset_a_code,
          issuer: input.asset_a_issuer || "native",
          reserve: poolInfo.reserveA.toString(),
        },
        asset_b: {
          code: input.asset_b_code,
          issuer: input.asset_b_issuer || "native",
          reserve: poolInfo.reserveB.toString(),
        },
        total_shares: poolInfo.totalShares.toString(),
        contract_id: input.amm_contract_id,
      },
      constant_product: (poolInfo.reserveA * poolInfo.reserveB).toString(),
    };
  } catch (error) {
    logger.error({ error, input }, "Failed to get AMM pool information");
    throw new PulsarNetworkError(
      `Failed to get pool information: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Get pool reserves from the AMM contract
 *
 * @param server - Soroban RPC server instance
 * @param contractId - AMM contract ID
 * @param assetACode - Asset A code
 * @param assetAIssuer - Asset A issuer
 * @param assetBCode - Asset B code
 * @param assetBIssuer - Asset B issuer
 * @returns Pool reserves and total shares
 */
async function getPoolReserves(
  server: SorobanRpc.Server,
  contractId: string,
  assetACode: string,
  assetAIssuer: string | undefined,
  assetBCode: string,
  assetBIssuer: string | undefined
): Promise<{ reserveA: bigint; reserveB: bigint; totalShares: bigint }> {
  try {
    // Try to get reserves from contract ledger entries
    // This is a simplified approach - in production, you'd parse actual ledger entries

    // For now, we'll simulate getting reserves from the contract
    // In a real implementation, this would query the contract's storage
    const assetA = parseAsset(assetACode, assetAIssuer);
    const assetB = parseAsset(assetBCode, assetBIssuer);

    // Attempt to read contract data
    // Note: This requires the AMM contract to be deployed and have storage entries
    // For tool demonstration, we'll return placeholder values
    // In production, use server.getLedgerEntries() to read actual contract storage

    logger.debug({ contract_id: contractId, asset_a: assetA.getCode(), asset_b: assetB.getCode() },
      "Reading pool reserves from contract"
    );

    // Placeholder - in production, read from contract storage
    // This would typically be: server.getLedgerEntries(contractKey)
    return {
      reserveA: 0n,
      reserveB: 0n,
      totalShares: 0n,
    };
  } catch (error) {
    logger.error({ error, contract_id: contractId }, "Failed to read pool reserves");
    throw new PulsarNetworkError(
      `Failed to read pool reserves: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Get network passphrase for the specified network
 *
 * @param network - Network name
 * @returns Network passphrase string
 */
function getNetworkPassphrase(network?: string): string {
  const net = network ?? config.stellarNetwork;

  switch (net) {
    case "mainnet":
      return Networks.PUBLIC;
    case "testnet":
      return Networks.TESTNET;
    case "futurenet":
      return Networks.FUTURENET;
    default:
      // For custom networks, use testnet as fallback or configure separately
      return Networks.TESTNET;
  }
}

/**
 * Main AMM tool handler that routes to specific operations
 *
 * @param input - AMM operation input with action type
 * @returns Result of the AMM operation
 */
export async function ammTool(input: {
  action: string;
  params: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { action, params } = input;

  logger.info({ action }, "Executing AMM tool");

  switch (action) {
    case "swap": {
      const swapInput = params as unknown as AMMSwapInput;
      const xdr = await buildSwapTransaction(swapInput);
      return {
        status: "success",
        action: "swap",
        transaction_xdr: xdr,
        message: "Swap transaction built. Simulate before submitting.",
      };
    }

    case "add_liquidity": {
      const addLiquidityInput = params as unknown as AMMAddLiquidityInput;
      const xdr = await buildAddLiquidityTransaction(addLiquidityInput);
      return {
        status: "success",
        action: "add_liquidity",
        transaction_xdr: xdr,
        message: "Add liquidity transaction built. Simulate before submitting.",
      };
    }

    case "remove_liquidity": {
      const removeLiquidityInput = params as unknown as AMMRemoveLiquidityInput;
      const xdr = await buildRemoveLiquidityTransaction(removeLiquidityInput);
      return {
        status: "success",
        action: "remove_liquidity",
        transaction_xdr: xdr,
        message: "Remove liquidity transaction built. Simulate before submitting.",
      };
    }

    case "get_quote": {
      const quoteInput = params as unknown as AMMGetQuoteInput;
      return await getSwapQuote(quoteInput);
    }

    case "get_pool_info": {
      const poolInfoInput = params as unknown as AMMGetPoolInfoInput;
      return await getPoolInfo(poolInfoInput);
    }

    default:
      throw new PulsarValidationError(
        `Invalid AMM action: ${action}. Valid actions: swap, add_liquidity, remove_liquidity, get_quote, get_pool_info`
      );
  }
}

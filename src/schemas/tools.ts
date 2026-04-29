/**
 * Per-tool input schemas.
 *
 * Each tool gets a dedicated schema export that combines base validators
 * and tool-specific constraints. These schemas are used to validate inputs
 * before any RPC calls are made.
 */

import { z } from "zod";

import {
  StellarPublicKeySchema,
  ContractIdSchema,
  XdrBase64Schema,
  NetworkSchema,
} from "./index.js";

const Hex32Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, {
    message: "Must be a 64-character hex string (32 bytes)",
  })
  .describe("32-byte value encoded as 64 hex characters");

/**
 * Schema for get_account_balance tool
 *
 * Inputs:
 * - account_id: Stellar public key (required)
 * - network: Optional network override
 */
export const GetAccountBalanceInputSchema = z.object({
  account_id: StellarPublicKeySchema,
  network: NetworkSchema.optional(),
  asset_code: z.string().optional(),
  asset_issuer: StellarPublicKeySchema.optional(),
});

export type GetAccountBalanceInput = z.infer<
  typeof GetAccountBalanceInputSchema
>;

/**
 * Schema for submit_transaction tool
 *
 * Inputs:
 * - xdr: Transaction envelope XDR (required, validated as base64)
 * - network: Optional network override
 * - sign: Whether to sign before submitting (default: false)
 * - wait_for_result: Whether to poll for result (default: false)
 * - wait_timeout_ms: Polling timeout in milliseconds (1000 - 120000, default: 30000)
 */
export const SubmitTransactionInputSchema = z.object({
  xdr: XdrBase64Schema,
  network: NetworkSchema.optional(),
  sign: z.boolean().default(false),
  wait_for_result: z.boolean().default(false),
  wait_timeout_ms: z
    .number()
    .int()
    .min(1000, { message: "wait_timeout_ms must be at least 1000 ms" })
    .max(120_000, { message: "wait_timeout_ms must not exceed 120000 ms" })
    .default(30_000),
});

export type SubmitTransactionInput = z.infer<
  typeof SubmitTransactionInputSchema
>;

/**
 * Schema for potential future contract_read tool.
 * Validates a contract ID, method name, and optional JSON parameters.
 */
export const ContractReadInputSchema = z.object({
  contract_id: ContractIdSchema,
  method: z
    .string()
    .min(1, { message: "Method name cannot be empty" })
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message: "Method name must be a valid identifier",
    }),
  args: z.record(z.unknown()).optional(),
});

export type ContractReadInput = z.infer<typeof ContractReadInputSchema>;

/**
 * Schema for simulate_transaction tool
 *
 * Inputs:
 * - xdr: Transaction envelope XDR (required, non-empty base64)
 * - network: Optional network override
 */
export const SimulateTransactionInputSchema = z.object({
  xdr: XdrBase64Schema,
  network: NetworkSchema.optional(),
});

export type SimulateTransactionInput = z.infer<
  typeof SimulateTransactionInputSchema
>;

/**
 * Schema for compute_vesting_schedule tool
 *
 * Inputs:
 * - total_amount: Total token amount to vest (required)
 * - start_timestamp: Unix timestamp when vesting begins (required)
 * - cliff_seconds: Seconds before any tokens unlock (required)
 * - vesting_duration_seconds: Total vesting period in seconds (required)
 * - release_frequency_seconds: How often tokens unlock after cliff (required)
 * - beneficiary_type: Category like 'team' or 'investor' (required)
 * - current_timestamp: Optional override for "now" (defaults to current time)
 */
export const ComputeVestingScheduleInputSchema = z.object({
  total_amount: z
    .number()
    .positive({ message: "total_amount must be positive" }),
  start_timestamp: z
    .number()
    .int()
    .positive({ message: "start_timestamp must be a positive Unix timestamp" }),
  cliff_seconds: z
    .number()
    .int()
    .nonnegative({ message: "cliff_seconds must be non-negative" }),
  vesting_duration_seconds: z
    .number()
    .int()
    .positive({ message: "vesting_duration_seconds must be positive" }),
  release_frequency_seconds: z
    .number()
    .int()
    .positive({ message: "release_frequency_seconds must be positive" }),
  beneficiary_type: z
    .enum(["team", "investor", "advisor", "other"])
    .describe("Type of beneficiary receiving the vesting tokens"),
  current_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional override for current time as Unix timestamp"),
});

export type ComputeVestingScheduleInput = z.infer<
  typeof ComputeVestingScheduleInputSchema
>;

/**
 * Schema for deploy_contract tool
 *
 * Supports two deployment modes:
 * - direct: Uses the built-in Soroban deployer (createCustomContract)
 * - factory: Invokes a factory contract's deploy function
 *
 * Inputs:
 * - mode: 'direct' | 'factory'
 * - source_account: Stellar public key deploying the contract (required)
 * - wasm_hash: 64-char hex WASM hash (required for direct)
 * - salt: Optional 64-char hex salt for deterministic address (direct only)
 * - factory_contract_id: Factory contract ID (required for factory)
 * - deploy_function: Factory deploy function name (default: 'deploy')
 * - deploy_args: Array of typed SCVal arguments for factory deploy function
 * - network: Optional network override
 */
export const DeployContractInputSchema = z.object({
  mode: z
    .enum(["direct", "factory"])
    .describe("Deployment mode: direct (built-in deployer) or factory (via factory contract)"),
  source_account: StellarPublicKeySchema.describe(
    "The Stellar account that will deploy the contract and pay fees"
  ),
  wasm_hash: Hex32Schema.optional().describe(
    "SHA-256 hash of the uploaded WASM (64 hex chars). Required for direct mode."
  ),
  salt: Hex32Schema.optional().describe(
    "Optional 32-byte salt for deterministic contract address (64 hex chars). Random if omitted."
  ),
  factory_contract_id: ContractIdSchema.optional().describe(
    "Factory contract ID. Required for factory mode."
  ),
  deploy_function: z
    .string()
    .min(1)
    .optional()
    .describe("Factory contract deploy function name (default: 'deploy')"),
  deploy_args: z
    .array(
      z.object({
        type: z
          .enum([
            "symbol",
            "string",
            "u32",
            "i32",
            "u64",
            "i64",
            "u128",
            "i128",
            "bool",
            "address",
            "bytes",
            "void",
          ])
          .optional()
          .describe("Soroban SCVal type hint"),
        value: z.unknown().describe("The value to convert to SCVal"),
      })
    )
    .optional()
    .describe("Arguments for factory deploy function as typed SCVal objects"),
  network: NetworkSchema.optional(),
});

export type DeployContractInput = z.infer<typeof DeployContractInputSchema>;

/**
 * Schema for get_orderbook tool
 *
 * Retrieves and analyzes the Stellar DEX orderbook for a trading pair.
 * Returns raw bids/asks plus derived analytics including spread, mid price,
 * liquidity depth, and orderbook imbalance.
 *
 * Inputs:
 * - selling_asset_code: Asset code being sold (e.g. XLM, USDC) (required)
 * - selling_asset_issuer: Issuer account for selling asset (omit for XLM native)
 * - buying_asset_code: Asset code being bought (required)
 * - buying_asset_issuer: Issuer account for buying asset (omit for XLM native)
 * - limit: Number of price levels to return (1-200, default 20)
 * - depth_levels: Price percentage levels for depth analysis (default [1, 2, 5])
 * - network: Optional network override
 */
export const GetOrderbookInputSchema = z.object({
  selling_asset_code: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: "Asset code must be alphanumeric" })
    .describe("Asset code being sold (e.g. XLM, USDC)"),
  selling_asset_issuer: StellarPublicKeySchema.optional().describe(
    "Issuer account for selling asset. Omit for XLM native."
  ),
  buying_asset_code: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: "Asset code must be alphanumeric" })
    .describe("Asset code being bought"),
  buying_asset_issuer: StellarPublicKeySchema.optional().describe(
    "Issuer account for buying asset. Omit for XLM native."
  ),
  limit: z
    .number()
    .int()
    .min(1, { message: "Limit must be at least 1" })
    .max(200, { message: "Limit must not exceed 200" })
    .default(20)
    .describe("Number of price levels to return per side"),
  depth_levels: z
    .array(z.number().positive())
    .default([1, 2, 5])
    .describe("Price percentage levels for depth analysis (e.g. [1, 2, 5] for 1%, 2%, 5%)"),
  network: NetworkSchema.optional(),
});

export type GetOrderbookInput = z.infer<typeof GetOrderbookInputSchema>;


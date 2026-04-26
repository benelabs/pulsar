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
 * Schema for get_contract_events tool
 *
 * Batches multiple contract IDs into a single Soroban RPC getEvents call,
 * deduplicates results by event ID, and returns a paginated response.
 *
 * Inputs:
 * - contract_ids: 1–5 Soroban contract addresses to query together
 * - start_ledger: First ledger to include (required on first page; omit when using cursor)
 * - event_type: Filter by event classification (default: "contract")
 * - topics: Optional topic filters — each inner array is an AND-list of matchers
 * - limit: Max events per batch (1–200, default 100)
 * - cursor: Pagination cursor returned by a previous call
 * - network: Optional network override
 */
export const GetContractEventsInputSchema = z.object({
  contract_ids: z
    .array(ContractIdSchema)
    .min(1, { message: "At least one contract_id is required" })
    .max(5, { message: "At most 5 contract_ids can be batched per request" }),
  start_ledger: z
    .number()
    .int()
    .positive({ message: "start_ledger must be a positive integer" })
    .optional(),
  event_type: z
    .enum(["contract", "system", "diagnostic", "all"])
    .default("contract")
    .describe("Filter events by classification"),
  topics: z
    .array(z.array(z.string().min(1)))
    .max(4, { message: "At most 4 topic filters are allowed" })
    .optional()
    .describe("Topic match filters — each inner array is an AND-list of hex/base64 ScVal matchers"),
  limit: z
    .number()
    .int()
    .min(1, { message: "limit must be at least 1" })
    .max(200, { message: "limit must not exceed 200" })
    .default(100),
  cursor: z.string().optional().describe("Pagination cursor from a previous get_contract_events response"),
  network: NetworkSchema.optional(),
});

export type GetContractEventsInput = z.infer<typeof GetContractEventsInputSchema>;

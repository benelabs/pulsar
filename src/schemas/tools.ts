/**
 * Per-tool input schemas.
 *
 * Each tool gets a dedicated schema export that combines base validators
 * and tool-specific constraints. These schemas are used to validate inputs
 * before any RPC calls are made.
 */

import { z } from 'zod';

import { SIMULATE_TRANSACTION_STATUSES, TOOL_NAMES, type ToolName } from '../constants/tools.js';

import {
  StellarPublicKeySchema,
  ContractIdSchema,
  AddressSchema,
  XdrBase64Schema,
  NetworkSchema,
  FieldsSchema,
} from './index.js';

const Hex32Schema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, {
    message: 'Must be a 64-character hex string (32 bytes)',
  })
  .describe('32-byte value encoded as 64 hex characters');

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
  fields: FieldsSchema,
});

export type GetAccountBalanceInput = z.infer<typeof GetAccountBalanceInputSchema>;

export const MAX_BATCH_ACCOUNT_IDS = 25;
export const DEFAULT_ACCOUNT_BATCH_CONCURRENCY = 5;
export const MAX_ACCOUNT_BATCH_CONCURRENCY = 10;

/**
 * Schema for get_account_balances tool
 *
 * Inputs:
 * - account_ids: Stellar public keys (required, 1-25 entries)
 * - network: Optional network override
 * - asset_code: Optional asset code filter applied to every account
 * - asset_issuer: Optional issuer filter applied to every account
 * - max_concurrency: Optional batch concurrency limit (1-10, default: 5)
 */
export const GetAccountBalancesInputSchema = z.object({
  account_ids: z
    .array(StellarPublicKeySchema)
    .min(1, { message: 'account_ids must contain at least one account' })
    .max(MAX_BATCH_ACCOUNT_IDS, {
      message: `account_ids must contain at most ${MAX_BATCH_ACCOUNT_IDS} accounts`,
    })
    .superRefine((accountIds, ctx) => {
      const seen = new Set<string>();

      accountIds.forEach((accountId, index) => {
        if (seen.has(accountId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate account_id at index ${index}: ${accountId}`,
            path: [index],
          });
        }

        seen.add(accountId);
      });
    }),
  network: NetworkSchema.optional(),
  asset_code: z.string().optional(),
  asset_issuer: StellarPublicKeySchema.optional(),
  max_concurrency: z
    .number()
    .int()
    .min(1, { message: 'max_concurrency must be at least 1' })
    .max(MAX_ACCOUNT_BATCH_CONCURRENCY, {
      message: `max_concurrency must not exceed ${MAX_ACCOUNT_BATCH_CONCURRENCY}`,
    })
    .default(DEFAULT_ACCOUNT_BATCH_CONCURRENCY),
});

export type GetAccountBalancesInput = z.infer<typeof GetAccountBalancesInputSchema>;

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
    .min(1000, { message: 'wait_timeout_ms must be at least 1000 ms' })
    .max(120_000, { message: 'wait_timeout_ms must not exceed 120000 ms' })
    .default(30_000),
  fields: FieldsSchema,
});

export type SubmitTransactionInput = z.infer<typeof SubmitTransactionInputSchema>;

/**
 * Schema for potential future contract_read tool.
 * Validates a contract ID, method name, and optional JSON parameters.
 */
export const ContractReadInputSchema = z.object({
  contract_id: ContractIdSchema,
  method: z
    .string()
    .min(1, { message: 'Method name cannot be empty' })
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message: 'Method name must be a valid identifier',
    }),
  args: z.record(z.unknown()).optional(),
});

export type ContractReadInput = z.infer<typeof ContractReadInputSchema>;

const ScValTypeSchema = z
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
  .describe("Soroban SCVal type hint");

const StorageKeySchema = z.object({
  type: ScValTypeSchema.optional(),
  value: z.unknown().describe("The value to convert to SCVal"),
});

/**
 * Schema for get_contract_storage tool
 *
 * Inputs:
 * - contract_id: Soroban contract ID (required)
 * - storage_type: instance | persistent | temporary (required)
 * - key: Typed SCVal key (required for persistent/temporary)
 * - network: Optional network override
 */
export const GetContractStorageInputSchema = z
  .object({
    contract_id: ContractIdSchema,
    storage_type: z
      .enum(["instance", "persistent", "temporary"])
      .describe("Storage durability: instance, persistent, or temporary"),
    key: StorageKeySchema.optional(),
    network: NetworkSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.storage_type === "instance" && data.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "key is not valid for instance storage",
        path: ["key"],
      });
    }

    if (data.storage_type !== "instance" && !data.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "key is required for persistent or temporary storage",
        path: ["key"],
      });
    }
  });

export type GetContractStorageInput = z.infer<
  typeof GetContractStorageInputSchema
>;

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
  fields: FieldsSchema,
});

export type SimulateTransactionInput = z.infer<typeof SimulateTransactionInputSchema>;

const fixedArithFields = {
  a: z.string().min(1),
  b: z.string().min(1),
  decimals: z.number().int().min(0).max(18).default(7),
};

export const SorobanMathInputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('fixed_add'), ...fixedArithFields }),
  z.object({ operation: z.literal('fixed_sub'), ...fixedArithFields }),
  z.object({ operation: z.literal('fixed_mul'), ...fixedArithFields }),
  z.object({ operation: z.literal('fixed_div'), ...fixedArithFields }),
  z.object({
    operation: z.literal('mean'),
    values: z.array(z.string().min(1)).min(1),
    decimals: z.number().int().min(0).max(18).default(7),
  }),
  z.object({
    operation: z.literal('weighted_mean'),
    values: z.array(z.string().min(1)).min(1),
    weights: z.array(z.string().min(1)).min(1),
    decimals: z.number().int().min(0).max(18).default(7),
  }),
  z.object({
    operation: z.literal('std_dev'),
    values: z.array(z.string().min(1)).min(2),
    decimals: z.number().int().min(0).max(18).default(7),
  }),
  z.object({
    operation: z.literal('twap'),
    prices: z.array(z.object({ price: z.string().min(1), timestamp: z.number().int() })).min(2),
    decimals: z.number().int().min(0).max(18).default(7),
  }),
  z.object({
    operation: z.literal('compound_interest'),
    principal: z.string().min(1),
    rate_bps: z.number().int().min(0),
    periods: z.number().int().min(1),
    compounds_per_period: z.number().int().min(1).default(1),
    decimals: z.number().int().min(0).max(18).default(7),
  }),
  z.object({ operation: z.literal('basis_points_to_percent'), value: z.number() }),
  z.object({ operation: z.literal('percent_to_basis_points'), value: z.number() }),
]);

export type SorobanMathInput = z.infer<typeof SorobanMathInputSchema>;
/**
 * Schema for emergency_pause tool (circuit breaker)
 *
 * Inputs:
 * - contract_id: Soroban contract address (required)
 * - network: Optional network override
 * - action: inspect | pause | unpause (default: inspect)
 * - admin_address: Optional admin address for invocation args
 */
export const EmergencyPauseInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  action: z.enum(["inspect", "pause", "unpause"]).default("inspect"),
  admin_address: z.string().optional(),
});

export type EmergencyPauseInput = z.infer<typeof EmergencyPauseInputSchema>;

/**
 * Schema for calculate_dutch_auction_price tool
 *
 * Inputs:
 * - start_price: Initial price of the asset
 * - reserve_price: Minimum price (bottom of the curve)
 * - start_timestamp: Unix timestamp when price begins to decay
 * - end_timestamp: Unix timestamp when price reaches reserve
 * - current_timestamp: Optional override for current time
 */
export const CalculateDutchAuctionPriceInputSchema = z.object({
  start_price: z.number().positive(),
  reserve_price: z.number().positive(),
  start_timestamp: z.number().int().positive(),
  end_timestamp: z.number().int().positive(),
  current_timestamp: z.number().int().positive().optional(),
});

export type CalculateDutchAuctionPriceInput = z.infer<typeof CalculateDutchAuctionPriceInputSchema>;

/**
 * Schema for calculate_english_auction_state tool
 *
 * Inputs:
 * - current_highest_bid: The current bid to beat (0 if none)
 * - reserve_price: Minimum bid required to start or win
 * - bid_increment: Minimum amount or percentage to add to the highest bid
 * - bid_increment_type: 'absolute' | 'percentage'
 * - end_timestamp: Unix timestamp when the auction ends
 * - current_timestamp: Optional override for current time
 */
export const CalculateEnglishAuctionStateInputSchema = z.object({
  current_highest_bid: z.number().nonnegative(),
  reserve_price: z.number().positive(),
  bid_increment: z.number().positive(),
  bid_increment_type: z.enum(['absolute', 'percentage']).default('absolute'),
  end_timestamp: z.number().int().positive(),
  current_timestamp: z.number().int().positive().optional(),
});

export type CalculateEnglishAuctionStateInput = z.infer<
  typeof CalculateEnglishAuctionStateInputSchema
>;

/**
 * Schema for generate_contract_docs tool
 *
 * Inputs:
 * - contract_id: Soroban contract address (required)
 * - network: Optional network override
 * - format: markdown | text (default: markdown)
 * - include_events: Whether to include events (default: true)
 */
export const GenerateContractDocsInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  format: z.enum(["markdown", "text"]).default("markdown"),
  include_events: z.boolean().default(true),
});

export type GenerateContractDocsInput = z.infer<typeof GenerateContractDocsInputSchema>;
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
  total_amount: z.number().positive({ message: 'total_amount must be positive' }),
  start_timestamp: z
    .number()
    .int()
    .positive({ message: 'start_timestamp must be a positive Unix timestamp' }),
  cliff_seconds: z.number().int().nonnegative({ message: 'cliff_seconds must be non-negative' }),
  vesting_duration_seconds: z
    .number()
    .int()
    .positive({ message: 'vesting_duration_seconds must be positive' }),
  release_frequency_seconds: z
    .number()
    .int()
    .positive({ message: 'release_frequency_seconds must be positive' }),
  beneficiary_type: z
    .enum(['team', 'investor', 'advisor', 'other'])
    .describe('Type of beneficiary receiving the vesting tokens'),
  current_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional override for current time as Unix timestamp'),
  fields: FieldsSchema,
});

export type ComputeVestingScheduleInput = z.infer<typeof ComputeVestingScheduleInputSchema>;

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
 * - optimize_cross_contract_call: Optional simulation+assembly for factory mode
 * - network: Optional network override
 */
export const DeployContractInputSchema = z.object({
  mode: z
    .enum(['direct', 'factory'])
    .describe('Deployment mode: direct (built-in deployer) or factory (via factory contract)'),
  source_account: StellarPublicKeySchema.describe(
    'The Stellar account that will deploy the contract and pay fees'
  ),
  wasm_hash: Hex32Schema.optional().describe(
    'SHA-256 hash of the uploaded WASM (64 hex chars). Required for direct mode.'
  ),
  salt: Hex32Schema.optional().describe(
    'Optional 32-byte salt for deterministic contract address (64 hex chars). Random if omitted.'
  ),
  factory_contract_id: ContractIdSchema.optional().describe(
    'Factory contract ID. Required for factory mode.'
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
            'symbol',
            'string',
            'u32',
            'i32',
            'u64',
            'i64',
            'u128',
            'i128',
            'bool',
            'address',
            'bytes',
            'void',
          ])
          .optional()
          .describe('Soroban SCVal type hint'),
        value: z.unknown().describe('The value to convert to SCVal'),
      })
    )
    .optional()
    .describe('Arguments for factory deploy function as typed SCVal objects'),
  optimize_cross_contract_call: z
    .boolean()
    .optional()
    .describe(
      'If true in factory mode, simulates and assembles the transaction to minimize cross-contract resource overhead'
    ),
  network: NetworkSchema.optional(),
  fields: FieldsSchema,
});

/**
 * Schema for get_account_history tool
 *
 * Inputs:
 * - account_id: Stellar public key (required)
 * - network: Optional network override
 * - limit: Number of transactions to return (1-200, default 10)
 * - cursor: Paging token for next page
 * - order: Sort order — 'asc' or 'desc' (default 'desc')
 */
export const GetAccountHistoryInputSchema = z.object({
  account_id: StellarPublicKeySchema,
  network: NetworkSchema.optional(),
  limit: z.number().int().min(1).max(200).default(10).optional(),
  cursor: z.string().optional(),
  order: z.enum(["asc", "desc"]).default("desc").optional(),
});

export type GetAccountHistoryInput = z.infer<typeof GetAccountHistoryInputSchema>;

export type DeployContractInput = z.infer<typeof DeployContractInputSchema>;

/**
 * Schema for estimate_token_fees tool
 */
export const EstimateTokenFeesInputSchema = z.object({
  contract_id: ContractIdSchema,
  amount: z.string().describe("Amount to mint or burn (as a string representing i128)"),
  address: AddressSchema.describe("The address to mint to or burn from"),
  op: z.enum(["mint", "burn"]).describe("The operation to estimate: mint or burn"),
  source_account: StellarPublicKeySchema.describe("The account invoking the operation (must have appropriate permissions)"),
  network: NetworkSchema.optional(),
});

export type EstimateTokenFeesInput = z.infer<
  typeof EstimateTokenFeesInputSchema
>;
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
 * Schema for get_price_feed tool
 *
 * Queries a decentralized oracle contract for the price of a base asset in terms of a quote asset.
 * Assumes the oracle contract implements a standard interface with a 'get_price' function
 * that takes two symbol arguments (base_asset, quote_asset) and returns an i128 price.
 *
 * Inputs:
 * - contract_id: The oracle contract ID (required)
 * - base_asset: The base asset symbol (e.g., 'USD')
 * - quote_asset: The quote asset symbol (e.g., 'XLM')
 * - network: Optional network override
 */
export const GetPriceFeedInputSchema = z.object({
  contract_id: ContractIdSchema,
  base_asset: z.string().min(1).describe("Base asset symbol (e.g., 'USD')"),
  quote_asset: z.string().min(1).describe("Quote asset symbol (e.g., 'XLM')"),
  network: NetworkSchema.optional(),
});

export type GetPriceFeedInput = z.infer<typeof GetPriceFeedInputSchema>;
 * Schema for safe_math_compute tool
 *
 * Inputs:
 * - a: First operand (string for BigInt support)
 * - b: Second operand (string for BigInt support)
 * - operation: 'add' | 'sub' | 'mul' | 'div'
 * - bounds: 'u64' | 'i128' | 'u128' | 'none' (default: 'none')
 */
export const SafeMathComputeInputSchema = z.object({
  a: z.string().describe('First operand as a string (to support large integers)'),
  b: z.string().describe('Second operand as a string (to support large integers)'),
  operation: z.enum(['add', 'sub', 'mul', 'div']),
  bounds: z.enum(['u32', 'i32', 'u64', 'i64', 'u128', 'i128', 'none']).default('none'),
});

export type SafeMathComputeInput = z.infer<typeof SafeMathComputeInputSchema>;
 * Schema for manage_dao_treasury tool
 *
 * Manages DAO treasury operations including deposits, allocations,
 * and budget tracking. Supports multiple treasury accounts with role-based access.
 *
 * Inputs:
 * - action: 'deposit' | 'allocate' | 'spend' | 'balance' | 'history'
 * - treasury_address: Soroban/Stellar address of the treasury contract or account (required)
 * - amount: Amount to deposit/allocate/spend (required for deposit/allocate/spend)
 * - asset: Asset code (e.g., 'XLM', 'USDC') - defaults to XLM
 * - recipient: Recipient address for allocations/spending (required for allocate/spend)
 * - description: Memo/description for the transaction
 * - budget_category: Category for allocation (e.g., 'grants', 'operations', 'development')
 * - network: Optional network override
 */
export const ManageDaoTreasuryInputSchema = z.object({
  action: z
    .enum(['deposit', 'allocate', 'spend', 'balance', 'history'])
    .describe(
      'Treasury operation: deposit funds, allocate budget, spend/transfer, check balance, view history'
    ),
  treasury_address: ContractIdSchema.or(StellarPublicKeySchema).describe(
    'The treasury contract ID (C...) or account (G...)'
  ),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,7})?$/, {
      message: 'Amount must be a positive decimal string (max 7 decimal places)',
    })
    .optional()
    .describe('Amount to deposit, allocate, or spend'),
  asset: z
    .string()
    .length(3, { message: 'Asset code must be 3-12 characters' })
    .max(12)
    .optional()
    .default('XLM')
    .describe("Asset code (e.g., 'XLM', 'USDC', 'TEST')"),
  recipient: StellarPublicKeySchema.or(ContractIdSchema)
    .optional()
    .describe('Recipient address for allocations or spending'),
  description: z
    .string()
    .max(256, { message: 'Description must not exceed 256 characters' })
    .optional()
    .describe('Memo/description for the transaction'),
  budget_category: z
    .enum(['grants', 'operations', 'development', 'marketing', 'legal', 'other'])
    .optional()
    .describe('Budget category for allocation'),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max number of history entries to return (default: 10)'),
  network: NetworkSchema.optional(),
});

export type ManageDaoTreasuryInput = z.infer<typeof ManageDaoTreasuryInputSchema>;
 * Schema for compute_interest_rates tool
 *
 * Inputs:
 * - utilization_rate: Current pool utilization (0 to 1)
 * - base_rate: Base borrowing rate
 * - multiplier: Rate multiplier below kink
 * - jump_multiplier: Rate multiplier above kink
 * - kink: Utilization point where the jump multiplier kicks in
 */
export const ComputeInterestRatesInputSchema = z.object({
  utilization_rate: z
    .number()
    .min(0)
    .max(1)
    .describe("Current pool utilization (debt / total liquidity)"),
  base_rate: z.number().nonnegative().describe("Minimum borrowing rate"),
  multiplier: z
    .number()
    .nonnegative()
    .describe("Interest rate slope before kink"),
  jump_multiplier: z
    .number()
    .nonnegative()
    .describe("Interest rate slope after kink"),
  kink: z
    .number()
    .min(0)
    .max(1)
    .default(0.8)
    .describe("Utilization threshold for jump multiplier"),
});

export type ComputeInterestRatesInput = z.infer<
  typeof ComputeInterestRatesInputSchema
>;

/**
 * Schema for calculate_borrowing_capacity tool
 *
 * Inputs:
 * - collateral_amount: Amount of collateral deposited
 * - collateral_price: USD price of collateral asset
 * - debt_price: USD price of borrowed asset
 * - ltv: Loan-to-Value ratio (0 to 1)
 * - liquidation_threshold: Health factor threshold (0 to 1)
 * - current_debt: Existing debt in asset units (default: 0)
 */
export const CalculateBorrowingCapacityInputSchema = z.object({
  collateral_amount: z.number().positive(),
  collateral_price: z.number().positive(),
  debt_price: z.number().positive(),
  ltv: z.number().min(0).max(1),
  liquidation_threshold: z.number().min(0).max(1),
  current_debt: z.number().nonnegative().default(0),
});

export type CalculateBorrowingCapacityInput = z.infer<
  typeof CalculateBorrowingCapacityInputSchema
>;
 * Schema for track_ledger_consensus_time tool
 *
 * Inputs:
 * - sample_size: Number of recent ledgers to sample (2–100, default: 10)
 * - network: Optional network override
 */
export const TrackLedgerConsensusTimeInputSchema = z.object({
  sample_size: z
    .number()
    .int()
    .min(2, { message: "sample_size must be at least 2 to compute an average" })
    .max(100, { message: "sample_size must not exceed 100" })
    .default(10)
    .describe("Number of recent ledgers to sample for consensus timing (2–100)"),
  network: NetworkSchema.optional(),
});

export type TrackLedgerConsensusTimeInput = z.infer<
  typeof TrackLedgerConsensusTimeInputSchema
>;
// ---------------------------------------------------------------------------
// manage_subscription
// ---------------------------------------------------------------------------

/**
 * Schema for manage_subscription tool (Issue #175 — pull-payment model)
 *
 * Models a recurring pull-payment subscription between a subscriber and a
 * merchant on the Stellar network.  All timestamps are Unix seconds.
 *
 * Inputs:
 * - subscriber:              Stellar public key of the payer
 * - merchant:                Stellar public key of the payee / service provider
 * - amount_per_period:       Token amount charged each billing period (> 0)
 * - asset_code:              Asset code (e.g. "USDC", "XLM")
 * - asset_issuer:            Issuer public key; omit for XLM
 * - period_seconds:          Length of one billing period in seconds (> 0)
 * - start_timestamp:         Unix timestamp when the subscription begins
 * - total_periods:           Max periods before subscription expires; omit for indefinite
 * - cancelled_timestamp:     Unix timestamp when subscriber cancelled; omit if still active
 * - payments_collected:      Number of periods already collected by merchant (≥ 0)
 * - grace_period_seconds:    Extra seconds after a period ends before marking overdue (≥ 0)
 * - current_timestamp:       Optional override for "now"; defaults to wall-clock
 */
export const ManageSubscriptionInputSchema = z.object({
  subscriber: StellarPublicKeySchema.describe(
    'Stellar public key (G...) of the subscribing account'
  ),
  merchant: StellarPublicKeySchema.describe(
    'Stellar public key (G...) of the merchant / service provider'
  ),
  amount_per_period: z
    .number()
    .positive({ message: 'amount_per_period must be positive' })
    .describe('Token amount charged per billing period'),
  asset_code: z
    .string()
    .min(1, { message: 'asset_code cannot be empty' })
    .max(12, { message: 'asset_code must be at most 12 characters' })
    .describe('Asset code, e.g. USDC or XLM'),
  asset_issuer: StellarPublicKeySchema.optional().describe(
    'Issuer public key (G...) for non-native assets; omit for XLM'
  ),
  period_seconds: z
    .number()
    .int()
    .positive({ message: 'period_seconds must be a positive integer' })
    .describe('Length of one billing period in seconds'),
  start_timestamp: z
    .number()
    .int()
    .positive({ message: 'start_timestamp must be a positive Unix timestamp' })
    .describe('Unix timestamp (seconds) when the subscription starts'),
  total_periods: z
    .number()
    .int()
    .positive({ message: 'total_periods must be a positive integer' })
    .optional()
    .describe('Maximum number of billing periods; omit for indefinite subscriptions'),
  cancelled_timestamp: z
    .number()
    .int()
    .positive({ message: 'cancelled_timestamp must be a positive Unix timestamp' })
    .optional()
    .describe('Unix timestamp when the subscriber cancelled; omit if still active'),
  payments_collected: z
    .number()
    .int()
    .nonnegative({ message: 'payments_collected must be non-negative' })
    .default(0)
    .describe('Number of billing periods already collected by the merchant'),
  grace_period_seconds: z
    .number()
    .int()
    .nonnegative({ message: 'grace_period_seconds must be non-negative' })
    .default(0)
    .describe('Extra seconds after a period due-date before the subscription is marked overdue'),
  current_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional override for current time as Unix timestamp; defaults to wall-clock'),
});

export type ManageSubscriptionInput = z.infer<typeof ManageSubscriptionInputSchema>;

// ---------------------------------------------------------------------------
// analyze_contract_storage  (Issue #180 – Storage Optimization for Large Maps)
// ---------------------------------------------------------------------------

/**
 * Schema for analyze_contract_storage tool.
 *
 * Inputs:
 * - contract_id           Soroban contract address (C…, required)
 * - network               Optional network override
 * - additional_keys       Up to 50 extra base64 XDR ledger keys to include
 * - size_threshold_bytes  Entries larger than this are flagged (default: 1 024)
 * - include_recommendations  Whether to return the recommendations array (default: true)
 */
export const AnalyzeContractStorageInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  additional_keys: z
    .array(z.string().min(1, { message: 'Ledger key XDR cannot be empty' }))
    .max(50, { message: 'Cannot analyze more than 50 additional keys per call' })
    .optional()
    .describe('Optional base64-encoded XDR ledger keys to include alongside the instance entry'),
  size_threshold_bytes: z
    .number()
    .int()
    .positive({ message: 'size_threshold_bytes must be a positive integer' })
    .default(1_024)
    .describe('Entries larger than this (in bytes) are flagged as oversized (default: 1024)'),
  include_recommendations: z
    .boolean()
    .default(true)
    .describe('Include optimization recommendations in the response (default: true)'),
});

export type AnalyzeContractStorageInput = z.infer<typeof AnalyzeContractStorageInputSchema>;

// ---------------------------------------------------------------------------
// verify_escrow_conditions  (Issue #194 – Formal Verification Examples)
// ---------------------------------------------------------------------------

/**
 * Enum of valid escrow state-machine states.
 * Matches the canonical Soroban escrow contract FSM.
 */
export const EscrowStateSchema = z.enum([
  'pending', // created, not yet funded
  'funded', // depositor has locked the funds
  'released', // funds delivered to beneficiary
  'refunded', // funds returned to depositor
  'disputed', // arbiter arbitration in progress
  'resolved', // arbiter has settled the dispute
]);

export type EscrowState = z.infer<typeof EscrowStateSchema>;

/**
 * A single escrow condition that must hold for release to proceed.
 * Conditions are verified against the current timestamp and/or a boolean
 * fulfilment flag supplied by the caller.
 */
const EscrowConditionSchema = z.object({
  kind: z
    .enum(['timelock', 'multisig', 'oracle', 'manual'])
    .describe('Category of release condition'),
  description: z
    .string()
    .min(1, { message: 'Condition description cannot be empty' })
    .describe('Human-readable description of the condition'),
  fulfilled: z
    .boolean()
    .describe('Whether this condition has been met at the time of verification'),
  required_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Unix timestamp after which a timelock condition is considered fulfilled'),
});

export type EscrowCondition = z.infer<typeof EscrowConditionSchema>;

/**
 * Schema for verify_escrow_conditions tool (Issue #194)
 *
 * Performs formal property verification of an escrow contract's state.
 * This is a pure-computation tool — no network calls are made.
 *
 * Verified properties:
 *   P1  Conservation law       – locked = deposited − released − refunded
 *   P2  State-machine validity – current state is reachable from prior state
 *   P3  Access-control         – only authorised parties can trigger transitions
 *   P4  No double-spend        – released and refunded amounts cannot both be > 0
 *   P5  Arbiter neutrality     – arbiter ∉ {depositor, beneficiary}
 *   P6  Conditions coherence   – all conditions are fulfilled before release is allowed
 *   P7  Timelock integrity     – timelock conditions respect current_timestamp
 *   P8  Dispute window         – disputes can only be raised while funded or within window
 */
export const VerifyEscrowConditionsInputSchema = z.object({
  escrow_id: z
    .string()
    .min(1, { message: 'escrow_id cannot be empty' })
    .describe('Unique identifier for the escrow contract instance'),

  depositor: StellarPublicKeySchema.describe(
    'Stellar public key (G...) of the party depositing funds into escrow'
  ),

  beneficiary: StellarPublicKeySchema.describe(
    'Stellar public key (G...) of the party who will receive the escrowed funds'
  ),

  arbiter: StellarPublicKeySchema.optional().describe(
    'Stellar public key (G...) of the neutral arbiter who resolves disputes. ' +
      'Must differ from both depositor and beneficiary.'
  ),

  asset_code: z
    .string()
    .min(1, { message: 'asset_code cannot be empty' })
    .max(12, { message: 'asset_code must be at most 12 characters' })
    .describe('Asset code of the escrowed funds (e.g. "XLM", "USDC")'),

  asset_issuer: StellarPublicKeySchema.optional().describe(
    'Issuer public key for non-native assets; omit for XLM'
  ),

  deposited_amount: z
    .number()
    .nonnegative({ message: 'deposited_amount must be non-negative' })
    .describe('Total amount deposited into the escrow'),

  released_amount: z
    .number()
    .nonnegative({ message: 'released_amount must be non-negative' })
    .default(0)
    .describe('Amount already released to the beneficiary (default: 0)'),

  refunded_amount: z
    .number()
    .nonnegative({ message: 'refunded_amount must be non-negative' })
    .default(0)
    .describe('Amount already refunded to the depositor (default: 0)'),

  state: EscrowStateSchema.describe('Current FSM state of the escrow'),

  prior_state: EscrowStateSchema.optional().describe(
    'Previous FSM state. When provided, the transition from prior_state → state ' +
      'is validated against the legal transition graph.'
  ),

  conditions: z
    .array(EscrowConditionSchema)
    .default([])
    .describe('Release conditions that must all be fulfilled before funds can be released'),

  dispute_window_seconds: z
    .number()
    .int()
    .nonnegative({ message: 'dispute_window_seconds must be non-negative' })
    .optional()
    .describe(
      'Seconds after funding during which a dispute may be raised. ' +
        'Omit to allow disputes at any time while funded.'
    ),

  funded_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Unix timestamp when the escrow was funded; used with dispute_window_seconds'),

  current_timestamp: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional override for "now" as Unix timestamp; defaults to wall-clock'),
});

export type VerifyEscrowConditionsInput = z.infer<typeof VerifyEscrowConditionsInputSchema>;
/**
 * Schema for get_network_params tool
 *
 * Fetches current Soroban network parameters including:
 * - Resource weights (CPU, memory, ledger operations)
 * - Fee thresholds and transaction limits
 * - Inflation and base network parameters
 *
 * Inputs:
 * - network: Optional network override (mainnet | testnet | futurenet | custom)
 */
export const GetNetworkParamsInputSchema = z.object({
  network: NetworkSchema.optional().describe('Override the active network for this call'),
});

export type GetNetworkParamsInput = z.infer<typeof GetNetworkParamsInputSchema>;
 * Schema for simulate_transactions_sequence tool
 *
 * Inputs:
 * - xdrs: Array of transaction envelope XDRs (required, non-empty base64 strings)
 * - network: Optional network override
 */
export const SimulateTransactionsSequenceInputSchema = z.object({
  xdrs: z.array(XdrBase64Schema).min(1, { message: 'Must provide at least one XDR to simulate' }),
  network: NetworkSchema.optional(),
});

export type SimulateTransactionsSequenceInput = z.infer<
  typeof SimulateTransactionsSequenceInputSchema
>;
export const FetchContractSpecInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
});

export type FetchContractSpecInput = z.infer<typeof FetchContractSpecInputSchema>;

const BalanceSchema = z.object({
  asset_type: z.string(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
  balance: z.string(),
});

export const GetAccountBalanceOutputSchema = z.object({
  account_id: StellarPublicKeySchema,
  balances: z.array(BalanceSchema),
});

const ContractFunctionSchema = z.object({
  name: z.string(),
  doc: z.string().optional(),
  inputs: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
  outputs: z.array(
    z.object({
      type: z.string(),
    })
  ),
});

const ContractEventSchema = z.object({
  name: z.string(),
  topics: z
    .array(
      z.object({
        type: z.string(),
      })
    )
    .optional(),
  data: z
    .object({
      type: z.string(),
    })
    .optional(),
});

export const FetchContractSpecOutputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.or(z.string()),
  functions: z.array(ContractFunctionSchema),
  events: z.array(ContractEventSchema),
  raw_xdr: z.string(),
});

const SubmitTransactionBaseOutputSchema = z.object({
  hash: z.string().min(1),
  ledger: z.number().nullable().optional(),
  fee_charged: z.union([z.string(), z.number()]).nullable().optional(),
  envelope_xdr: z.string().nullable().optional(),
  result_xdr: z.string().nullable().optional(),
  result_meta_xdr: z.string().nullable().optional(),
});

export const SubmitTransactionOutputSchema = z.discriminatedUnion('status', [
  SubmitTransactionBaseOutputSchema.extend({
    status: z.literal('SUBMITTED'),
  }),
  SubmitTransactionBaseOutputSchema.extend({
    status: z.literal('SUCCESS'),
    return_value: z.string().nullable().optional(),
  }),
  SubmitTransactionBaseOutputSchema.extend({
    status: z.literal('FAILED'),
    diagnostic_events: z.array(z.unknown()).nullable().optional(),
  }),
  SubmitTransactionBaseOutputSchema.extend({
    status: z.literal('TIMEOUT'),
    message: z.string(),
  }),
]);

export const SimulateTransactionOutputSchema = z.object({
  status: z.enum(SIMULATE_TRANSACTION_STATUSES),
  return_value: z.string().optional(),
  return_value_native: z.unknown().optional(),
  cost: z.object({
    cpu_instructions: z.string(),
    memory_bytes: z.string(),
  }),
  footprint: z.object({
    read_only: z.array(z.string()),
    read_write: z.array(z.string()),
  }),
  min_resource_fee: z.string(),
  events: z.array(z.string()),
  error: z.string().optional(),
  restore_needed: z.boolean().optional(),
});

const VestingReleaseSchema = z.object({
  release_date: z.string(),
  amount: z.string(),
  released: z.boolean(),
});

export const ComputeVestingScheduleOutputSchema = z.object({
  beneficiary_type: z.enum(['team', 'investor', 'advisor', 'other']),
  total_amount: z.string(),
  start_date: z.string(),
  cliff_date: z.string(),
  end_date: z.string(),
  released_amount: z.string(),
  unreleased_amount: z.string(),
  vesting_percentage: z.number(),
  next_release_date: z.string().optional(),
  schedule: z.array(VestingReleaseSchema),
});

export const DeployContractOutputSchema = z.object({
  mode: z.enum(['direct', 'factory']),
  transaction_xdr: z.string().min(1),
  predicted_contract_id: ContractIdSchema.optional(),
  network: NetworkSchema.or(z.string()),
  source_account: StellarPublicKeySchema,
});

export const ToolErrorOutputSchema = z.object({
  status: z.literal('error'),
  error_code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const TOOL_OUTPUT_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  get_account_balance: GetAccountBalanceOutputSchema,
  fetch_contract_spec: FetchContractSpecOutputSchema,
  submit_transaction: SubmitTransactionOutputSchema,
  simulate_transaction: SimulateTransactionOutputSchema,
  compute_vesting_schedule: ComputeVestingScheduleOutputSchema,
  deploy_contract: DeployContractOutputSchema,
};

export const ToolNameSchema = z.enum(TOOL_NAMES);
/**
 * Schema for get_liquidity_pool tool
 *
 * Queries Horizon for an AMM liquidity pool's reserves, shares, and fee.
 */
export const GetLiquidityPoolInputSchema = z.object({
  liquidity_pool_id: z
    .string()
    .min(1)
    .describe("The liquidity pool ID (e.g. POOL_...)"),
  network: NetworkSchema.optional(),
});

export type GetLiquidityPoolInput = z.infer<typeof GetLiquidityPoolInputSchema>;

/**
 * Schema for get_fee_stats tool
 *
 * Fetches recent network fee statistics from Horizon to help estimate
 * optimal transaction fees.
 */
export const GetFeeStatsInputSchema = z.object({
  network: NetworkSchema.optional().describe("Override the network for fee stats lookup"),
});

export type GetFeeStatsInput = z.infer<typeof GetFeeStatsInputSchema>;

 * Schema for optimize_contract_bytecode tool
 *
 * Inputs:
 * - wasm_path: File system path to the WASM blob to analyze
 * - max_size_kb: Size threshold in KB to check against (default: 256)
 * - strict_mode: Throw validation error if size exceeds max_size_kb
 */
export const OptimizeContractBytecodeInputSchema = z.object({
  wasm_path: z
    .string()
    .min(1, { message: 'wasm_path is required' })
    .describe('Path to contract WASM file on disk'),
  max_size_kb: z
    .number()
    .int()
    .positive({ message: 'max_size_kb must be greater than 0' })
    .default(256)
    .describe('Maximum allowed contract bytecode size in KB'),
  strict_mode: z
    .boolean()
    .default(false)
    .describe('If true, return error when WASM size is above max_size_kb'),
});

export type OptimizeContractBytecodeInput = z.infer<typeof OptimizeContractBytecodeInputSchema>;
 * Schema for get_protocol_version tool
 *
 * Inputs:
 * - network: Optional network override
 */
export const GetProtocolVersionInputSchema = z.object({
  network: NetworkSchema.optional(),
});

export type GetProtocolVersionInput = z.infer<typeof GetProtocolVersionInputSchema>;
 * Schema for export_data tool
 *
 * Allows exporting tool results to CSV or JSON format files
 * Inputs:
 * - data: The data to export (array of objects or single object)
 * - format: 'csv' or 'json'
 * - filename: Optional filename (default: export_{timestamp})
 * - include_timestamp: Whether to include export timestamp (default: true)
 */
export const ExportDataInputSchema = z.object({
  data: z
    .union([z.array(z.record(z.unknown())), z.record(z.unknown())])
    .describe('Data to export - can be an array of objects or a single object'),
  format: z.enum(['csv', 'json']).describe('Export format: csv or json'),
  filename: z
    .string()
    .optional()
    .describe('Optional filename (without extension). Default: export_{timestamp}'),
  include_timestamp: z
    .boolean()
    .default(true)
    .describe('Whether to include export timestamp in the output'),
});

export type ExportDataInput = z.infer<typeof ExportDataInputSchema>;
 * Schema for check_network_status tool
 *
 * Inputs:
 * - network: Optional network override (defaults to configured network)
 * - timeout_ms: Per-probe timeout in milliseconds (500 – 30 000, default: 8 000)
 */
export const CheckNetworkStatusInputSchema = z.object({
  network: NetworkSchema.optional(),
  timeout_ms: z
    .number()
    .int()
    .min(500, { message: "timeout_ms must be at least 500 ms" })
    .max(30_000, { message: "timeout_ms must not exceed 30 000 ms" })
    .default(8_000)
    .optional(),
});

export type CheckNetworkStatusInput = z.infer<typeof CheckNetworkStatusInputSchema>;
 * Schema for build_transaction tool
 *
 * Helps AI assistants construct common transaction types without raw XDR.
 * Supports payment, trustline, manage data, set options, account merge,
 * and create account operations.
 *
 * Inputs:
 * - source_account: Stellar public key that will sign and pay fees (required)
 * - operations: Array of operation objects (required, at least one)
 * - fee: Base fee in stroops per operation (optional, default: 100000)
 * - timeout: Transaction timeout in seconds (optional, default: 30)
 * - network: Optional network override
 */
export const BuildTransactionInputSchema = z.object({
  source_account: StellarPublicKeySchema.describe(
    "The Stellar account that will sign the transaction and pay fees"
  ),
  operations: z.array(
    z.discriminatedUnion("type", [
      // Payment operation
      z.object({
        type: z.literal("payment"),
        destination: StellarPublicKeySchema.describe("Destination account (G...)"),
        amount: z.number().positive().describe("Amount to send"),
        asset_code: z.string().optional().describe("Asset code (e.g., USDC). Omit for native XLM"),
        asset_issuer: StellarPublicKeySchema.optional().describe("Asset issuer (G...). Required if asset_code provided"),
      }),
      // Change trust operation
      z.object({
        type: z.literal("change_trust"),
        asset_code: z.string().describe("Asset code to create trustline for (e.g., USDC)"),
        asset_issuer: StellarPublicKeySchema.describe("Asset issuer (G...)"),
        limit: z.string().optional().describe("Trustline limit. Default: maximum uint64"),
      }),
      // Manage data operation
      z.object({
        type: z.literal("manage_data"),
        name: z.string().min(1).max(64).describe("Data entry name (1-64 bytes)"),
        value: z.union([z.string(), z.record(z.unknown())]).optional().describe("Value to set. Omit to clear entry"),
      }),
      // Set options operation
      z.object({
        type: z.literal("set_options"),
        inflation_destination: StellarPublicKeySchema.optional(),
        clear_flags: z.number().int().min(0).max(7).optional(),
        set_flags: z.number().int().min(0).max(7).optional(),
        master_weight: z.number().int().min(1).max(255).optional(),
        low_threshold: z.number().int().min(1).max(255).optional(),
        med_threshold: z.number().int().min(1).max(255).optional(),
        high_threshold: z.number().int().min(1).max(255).optional(),
        home_domain: z.string().max(32).optional(),
        signer_address: z.string().optional(),
        signer_type: z.enum(["ed25519_public_key", "pre_auth_tx", "sha256_hash"]).optional(),
        signer_weight: z.number().int().min(1).max(255).optional(),
      }),
      // Account merge operation
      z.object({
        type: z.literal("account_merge"),
        destination: StellarPublicKeySchema.describe("Destination account to merge into"),
      }),
      // Create account operation
      z.object({
        type: z.literal("create_account"),
        destination: StellarPublicKeySchema.describe("New account to create"),
        starting_balance: z.number().positive().min(1).describe("Starting balance in XLM (minimum 1)"),
      }),
    ])
  ).min(1, { message: "At least one operation is required" }).describe("Array of operations to include in the transaction"),
  fee: z.number().int().min(100).optional().describe("Base fee in stroops per operation. Default: 100000"),
  timeout: z.number().int().min(0).max(65535).optional().describe("Transaction timeout in seconds. Default: 30"),
  network: NetworkSchema.optional(),
});

export type BuildTransactionInput = z.infer<typeof BuildTransactionInputSchema>;
 * Schema for get_claimable_balance tool
 *
 * Inputs:
 * - account_id: Stellar public key (optional if balance_id provided)
 * - balance_id: Claimable balance ID (optional if account_id provided)
 * - network: Optional network override
 *
 * At least one of account_id or balance_id must be provided.
 */
export const GetClaimableBalanceInputSchema = z.object({
  account_id: StellarPublicKeySchema.optional().describe(
    "The Stellar public key (G...) to fetch claimable balances for"
  ),
  balance_id: z
    .string()
    .regex(/^[a-fA-F0-9]{72}$/, {
      message: "Balance ID must be a 72-character hex string",
    })
    .optional()
    .describe("A specific claimable balance ID (72 hex chars)"),
  network: NetworkSchema.optional(),
}).refine(
  (data) => data.account_id || data.balance_id,
  {
    message: "Either account_id or balance_id must be provided",
  }
);

export type GetClaimableBalanceInput = z.infer<
  typeof GetClaimableBalanceInputSchema
>;
 * Schema for search_assets tool
 *
 * Inputs:
 * - asset_code: Optional asset code to search for
 * - asset_issuer: Optional asset issuer to search for
 * - min_reputation_score: Optional minimum reputation score (requires stellar.expert)
 * - network: Optional network override
 */
export const SearchAssetsInputSchema = z.object({
  asset_code: z.string().optional().describe('Filter by asset code (e.g. USDC)'),
  asset_issuer: StellarPublicKeySchema.optional().describe('Filter by asset issuer public key'),
  min_reputation_score: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Minimum reputation score/rating (0-100) to filter by'),
  network: NetworkSchema.optional(),
});

export type SearchAssetsInput = z.infer<typeof SearchAssetsInputSchema>;
 * Schema for get_token_transfer_fee tool
 *
 * Inputs:
 * - contract_id: Soroban token contract ID (required)
 * - amount: Amount to transfer (required)
 * - from: Sender address (required)
 * - to: Recipient address (required)
 * - network: Optional network override
 */
export const GetTokenTransferFeeInputSchema = z.object({
  contract_id: ContractIdSchema.describe('The Soroban token contract ID (C...)'),
  amount: z
    .string()
    .regex(/^\d+$/, { message: 'Amount must be a numeric string' })
    .describe('Amount to transfer (in smallest unit, e.g. stroops)'),
  from: z.string().describe('Stellar address of the sender (G... or C...)'),
  to: z.string().describe('Stellar address of the recipient (G... or C...)'),
  network: NetworkSchema.optional(),
});

export type GetTokenTransferFeeInput = z.infer<typeof GetTokenTransferFeeInputSchema>;
 * Schema for generate_contract_client tool
 *
 * Inputs:
 * - contract_id: Soroban contract ID to fetch spec from (optional if contract_spec provided)
 * - contract_spec: Pre-fetched contract spec object (optional if contract_id provided)
 * - network: Optional network override (used when fetching via contract_id)
 * - class_name: Optional override for the generated TypeScript class name
 */
export const GenerateContractClientInputSchema = z.object({
  contract_id: ContractIdSchema.optional(),
  contract_spec: z
    .object({
      contract_id: z.string(),
      network: z.string(),
      functions: z.array(
        z.object({
          name: z.string(),
          doc: z.string().optional(),
          inputs: z.array(z.object({ name: z.string(), type: z.string() })),
          outputs: z.array(z.object({ type: z.string() })),
        })
      ),
      events: z.array(
        z.object({
          name: z.string(),
          topics: z.array(z.object({ type: z.string() })).optional(),
          data: z.object({ type: z.string() }).optional(),
        })
      ),
      raw_xdr: z.string(),
    })
    .optional(),
  network: NetworkSchema.optional(),
  class_name: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, { message: 'class_name must be a valid identifier' })
    .optional(),
});

export type GenerateContractClientInput = z.infer<typeof GenerateContractClientInputSchema>;
 * Schema for soulbound_token tool
 *
 * Actions:
 * - mint:   Issue a non-transferable SBT to a recipient (requires recipient, metadata).
 * - revoke: Revoke an existing SBT by token_id (requires token_id).
 * - query:  Build a read-only has_token invocation (requires recipient; simulate to read result).
 */
export const SoulboundTokenInputSchema = z
  .object({
    action: z.enum(['mint', 'revoke', 'query']).describe('SBT operation: mint, revoke, or query'),
    contract_id: ContractIdSchema.describe('Deployed SBT contract address (C...)'),
    source_account: StellarPublicKeySchema.describe(
      'Stellar public key (G...) that signs and pays fees'
    ),
    recipient: StellarPublicKeySchema.optional().describe(
      'Recipient public key (G...). Required for mint and query.'
    ),
    token_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Unique token identifier. Required for revoke; auto-generated for mint if omitted.'
      ),
    metadata: z
      .string()
      .min(1)
      .optional()
      .describe('Arbitrary metadata string (e.g. JSON) attached to the token. Required for mint.'),
    network: NetworkSchema.optional(),
  })
  .describe('Input for the soulbound_token tool');

export type SoulboundTokenInput = z.infer<typeof SoulboundTokenInputSchema>;
 * Schema for build_conditional_transaction tool
 *
 * Takes an existing unsigned transaction XDR and embeds Stellar-native
 * preconditions (time bounds, ledger bounds, sequence guards) into the
 * envelope. Optionally validates those conditions against the live ledger
 * before returning.
 *
 * Inputs:
 * - xdr: Unsigned transaction envelope to attach conditions to (required)
 * - conditions: At least one of time_bounds | ledger_bounds | min_sequence_*
 * - validate_now: Check conditions against current ledger state (default: false)
 * - network: Optional network override
 */
export const BuildConditionalTransactionInputSchema = z
  .object({
    xdr: XdrBase64Schema,
    conditions: z
      .object({
        time_bounds: z
          .object({
            min_time: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe('Earliest Unix timestamp at which the transaction is valid'),
            max_time: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe('Latest Unix timestamp at which the transaction is valid (0 = no expiry)'),
          })
          .optional()
          .describe('Validity window expressed as Unix timestamps'),
        ledger_bounds: z
          .object({
            min_ledger: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe('Minimum ledger sequence at which the transaction is valid'),
            max_ledger: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe('Maximum ledger sequence at which the transaction is valid (0 = no cap)'),
          })
          .optional()
          .describe('Validity window expressed as ledger sequence numbers'),
        min_sequence_number: z
          .string()
          .regex(/^\d+$/, { message: 'Must be a non-negative integer string' })
          .optional()
          .describe(
            'Source account must have at least this sequence number for the transaction to be valid'
          ),
        min_sequence_age: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Minimum seconds elapsed since the source account last changed its sequence number'
          ),
        min_sequence_ledger_gap: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Minimum number of ledgers that must have closed since the source account last changed its sequence number'
          ),
      })
      .describe('Preconditions to embed in the transaction envelope'),
    validate_now: z
      .boolean()
      .default(false)
      .describe(
        'When true, evaluate each condition against the current ledger/account state and report which ones pass or fail'
      ),
    network: NetworkSchema.optional(),
  })
  .refine(
    (data) => {
      const c = data.conditions;
      return (
        c.time_bounds !== undefined ||
        c.ledger_bounds !== undefined ||
        c.min_sequence_number !== undefined ||
        c.min_sequence_age !== undefined ||
        c.min_sequence_ledger_gap !== undefined
      );
    },
    { message: 'At least one condition must be specified', path: ['conditions'] }
  );

export type BuildConditionalTransactionInput = z.infer<
  typeof BuildConditionalTransactionInputSchema
>;
 * Schema for batch_events tool
 *
 * Inputs:
 * - events: Array of base64 XDR strings (ContractEvent or DiagnosticEvent) to batch
 * - group_by: Strategy for grouping events (default: contract_and_topic)
 * - deduplicate: Whether to collapse identical events into one with a count (default: true)
 */
export const BatchEventsInputSchema = z.object({
  events: z
    .array(XdrBase64Schema)
    .min(1, { message: 'At least one event XDR is required' })
    .describe('Array of base64 XDR Soroban ContractEvent or DiagnosticEvent strings'),
  group_by: z
    .enum(['contract', 'topic', 'contract_and_topic'])
    .default('contract_and_topic')
    .describe(
      "Grouping strategy: 'contract' (by contract ID), 'topic' (by event topics), or 'contract_and_topic' (both)"
    ),
  deduplicate: z
    .boolean()
    .default(true)
    .describe('Collapse identical events into a single entry with an occurrence count'),
});

export type BatchEventsInput = z.infer<typeof BatchEventsInputSchema>;


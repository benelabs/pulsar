/**
 * Per-tool input schemas.
 *
 * Each tool gets a dedicated schema export that combines base validators
 * and tool-specific constraints. These schemas are used to validate inputs
 * before any RPC calls are made.
 */

import { z } from 'zod';

import {
  StellarPublicKeySchema,
  ContractIdSchema,
  XdrBase64Schema,
  NetworkSchema,
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
});

export type GetAccountBalanceInput = z.infer<typeof GetAccountBalanceInputSchema>;

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
  network: NetworkSchema.optional(),
});

export type DeployContractInput = z.infer<typeof DeployContractInputSchema>;

/**
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

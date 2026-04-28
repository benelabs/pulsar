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

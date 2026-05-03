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


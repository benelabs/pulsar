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

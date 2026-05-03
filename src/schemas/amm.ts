/**
 * AMM (Automated Market Maker) tool schemas.
 *
 * Validates inputs for constant-product (x*y=k) AMM operations including:
 * - Token swaps
 * - Liquidity provision
 * - Liquidity removal
 * - Pool queries
 */

import { z } from "zod";

import {
  StellarPublicKeySchema,
  ContractIdSchema,
  NetworkSchema,
} from "./index.js";

/**
 * Schema for AMM swap operation
 *
 * Inputs:
 * - amm_contract_id: AMM contract address (required)
 * - source_account: User's Stellar public key (required)
 * - offer_asset_code: Asset code being offered (required)
 * - offer_asset_issuer: Issuer of offered asset (required for non-XLM)
 * - offer_amount: Amount being offered in stroops (required)
 * - min_receive_amount: Minimum amount to receive (slippage protection) (required)
 * - receive_asset_code: Asset code to receive (required)
 * - receive_asset_issuer: Issuer of receive asset (required for non-XLM)
 * - network: Optional network override
 */
export const AMMSwapInputSchema = z.object({
  amm_contract_id: ContractIdSchema.describe("AMM contract ID (C..., 56 chars)"),
  source_account: StellarPublicKeySchema.describe("User's Stellar public key"),
  offer_asset_code: z.string().min(1).max(12).describe("Asset code being offered (e.g., USDC)"),
  offer_asset_issuer: StellarPublicKeySchema.optional().describe("Issuer of offered asset (omit for XLM)"),
  offer_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Amount being offered in stroops (1 XLM = 10,000,000 stroops)"),
  min_receive_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Minimum amount to receive (slippage protection) in stroops"),
  receive_asset_code: z.string().min(1).max(12).describe("Asset code to receive"),
  receive_asset_issuer: StellarPublicKeySchema.optional().describe("Issuer of receive asset (omit for XLM)"),
  network: NetworkSchema.optional(),
});

export type AMMSwapInput = z.infer<typeof AMMSwapInputSchema>;

/**
 * Schema for adding liquidity to AMM pool
 *
 * Inputs:
 * - amm_contract_id: AMM contract address (required)
 * - source_account: User's Stellar public key (required)
 * - asset_a_code: First asset code (required)
 * - asset_a_issuer: Issuer of first asset (optional for XLM)
 * - asset_a_amount: Amount of first asset in stroops (required)
 * - asset_b_code: Second asset code (required)
 * - asset_b_issuer: Issuer of second asset (optional for XLM)
 * - asset_b_amount: Amount of second asset in stroops (required)
 * - min_shares_received: Minimum LP shares to receive (slippage protection) (required)
 * - network: Optional network override
 */
export const AMMAddLiquidityInputSchema = z.object({
  amm_contract_id: ContractIdSchema.describe("AMM contract ID (C..., 56 chars)"),
  source_account: StellarPublicKeySchema.describe("User's Stellar public key"),
  asset_a_code: z.string().min(1).max(12).describe("First asset code"),
  asset_a_issuer: StellarPublicKeySchema.optional().describe("Issuer of first asset (omit for XLM)"),
  asset_a_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Amount of first asset in stroops"),
  asset_b_code: z.string().min(1).max(12).describe("Second asset code"),
  asset_b_issuer: StellarPublicKeySchema.optional().describe("Issuer of second asset (omit for XLM)"),
  asset_b_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Amount of second asset in stroops"),
  min_shares_received: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Minimum LP shares to receive (slippage protection) in stroops"),
  network: NetworkSchema.optional(),
});

export type AMMAddLiquidityInput = z.infer<typeof AMMAddLiquidityInputSchema>;

/**
 * Schema for removing liquidity from AMM pool
 *
 * Inputs:
 * - amm_contract_id: AMM contract address (required)
 * - source_account: User's Stellar public key (required)
 * - shares_amount: Amount of LP shares to burn (required)
 * - min_asset_a_amount: Minimum asset A to receive (slippage protection) (required)
 * - min_asset_b_amount: Minimum asset B to receive (slippage protection) (required)
 * - network: Optional network override
 */
export const AMMRemoveLiquidityInputSchema = z.object({
  amm_contract_id: ContractIdSchema.describe("AMM contract ID (C..., 56 chars)"),
  source_account: StellarPublicKeySchema.describe("User's Stellar public key"),
  shares_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Amount of LP shares to burn in stroops"),
  min_asset_a_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Minimum asset A to receive (slippage protection) in stroops"),
  min_asset_b_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Minimum asset B to receive (slippage protection) in stroops"),
  network: NetworkSchema.optional(),
});

export type AMMRemoveLiquidityInput = z.infer<typeof AMMRemoveLiquidityInputSchema>;

/**
 * Schema for getting AMM pool quote (swap simulation)
 *
 * Inputs:
 * - amm_contract_id: AMM contract address (required)
 * - offer_asset_code: Asset code being offered (required)
 * - offer_asset_issuer: Issuer of offered asset (optional for XLM)
 * - offer_amount: Amount being offered in stroops (required)
 * - receive_asset_code: Asset code to receive (required)
 * - receive_asset_issuer: Issuer of receive asset (optional for XLM)
 * - network: Optional network override
 */
export const AMMGetQuoteInputSchema = z.object({
  amm_contract_id: ContractIdSchema.describe("AMM contract ID (C..., 56 chars)"),
  offer_asset_code: z.string().min(1).max(12).describe("Asset code being offered"),
  offer_asset_issuer: StellarPublicKeySchema.optional().describe("Issuer of offered asset (omit for XLM)"),
  offer_amount: z
    .string()
    .regex(/^\d+$/, { message: "Amount must be a valid integer string in stroops" })
    .describe("Amount being offered in stroops"),
  receive_asset_code: z.string().min(1).max(12).describe("Asset code to receive"),
  receive_asset_issuer: StellarPublicKeySchema.optional().describe("Issuer of receive asset (omit for XLM)"),
  network: NetworkSchema.optional(),
});

export type AMMGetQuoteInput = z.infer<typeof AMMGetQuoteInputSchema>;

/**
 * Schema for getting AMM pool information
 *
 * Inputs:
 * - amm_contract_id: AMM contract address (required)
 * - asset_a_code: First asset code (required)
 * - asset_a_issuer: Issuer of first asset (optional for XLM)
 * - asset_b_code: Second asset code (required)
 * - asset_b_issuer: Issuer of second asset (optional for XLM)
 * - network: Optional network override
 */
export const AMMGetPoolInfoInputSchema = z.object({
  amm_contract_id: ContractIdSchema.describe("AMM contract ID (C..., 56 chars)"),
  asset_a_code: z.string().min(1).max(12).describe("First asset code"),
  asset_a_issuer: StellarPublicKeySchema.optional().describe("Issuer of first asset (omit for XLM)"),
  asset_b_code: z.string().min(1).max(12).describe("Second asset code"),
  asset_b_issuer: StellarPublicKeySchema.optional().describe("Issuer of second asset (omit for XLM)"),
  network: NetworkSchema.optional(),
});

export type AMMGetPoolInfoInput = z.infer<typeof AMMGetPoolInfoInputSchema>;

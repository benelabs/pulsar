/**
 * Centralized Zod schema layer for input validation.
 *
 * All tools validate inputs before touching the network using these schemas.
 * Invalid inputs result in clear MCP errors before any RPC calls are made.
 *
 * SECURITY: Secret keys are never logged or surfaced in error messages.
 */

import { z } from "zod";

/**
 * Stellar public key validator.
 * Format: G... base32-encoded 56 character string
 */
export const StellarPublicKeySchema = z
  .string()
  .startsWith("G", { message: "Public key must start with 'G'" })
  .length(56, { message: "Public key must be exactly 56 characters" })
  .regex(/^[A-Z2-7]+$/, {
    message: "Public key must contain only base32 characters (A-Z, 2-7)",
  })
  .describe("Stellar public key (G..., 56 chars)");

/**
 * Stellar secret key validator.
 * Format: S... base32-encoded 56 character string
 * SECURITY: This validator is used only for validation, secret keys are NEVER logged.
 */
export const StellarSecretKeySchema = z
  .string()
  .startsWith("S", { message: "Secret key must start with 'S'" })
  .length(56, { message: "Secret key must be exactly 56 characters" })
  .regex(/^[A-Z2-7]+$/, {
    message: "Secret key must contain only base32 characters (A-Z, 2-7)",
  })
  .describe("Stellar secret key (S..., 56 chars) — NEVER logged");

/**
 * Soroban contract address validator.
 * Format: C... base32-encoded 56 character string
 */
export const ContractIdSchema = z
  .string()
  .startsWith("C", { message: "Contract ID must start with 'C'" })
  .length(56, { message: "Contract ID must be exactly 56 characters" })
  .regex(/^[A-Z2-7]+$/, {
    message: "Contract ID must contain only base32 characters (A-Z, 2-7)",
  })
  .describe("Soroban contract ID (C..., 56 chars)");

/**
 * XDR base64 validator.
 * Ensures non-empty base64-encoded XDR blob
 */
export const XdrBase64Schema = z
  .string()
  .min(1, { message: "XDR cannot be empty" })
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, { message: "XDR must be valid base64" })
  .describe("Base64-encoded XDR transaction envelope");

/**
 * Stellar network validator.
 * Enum: mainnet | testnet | futurenet | custom
 */
export const NetworkSchema = z
  .enum(["mainnet", "testnet", "futurenet", "custom"])
  .describe("Stellar network: mainnet, testnet, futurenet, or custom");

/**
 * Account balance query schema (for get_account_balance tool)
 */
export const AccountBalanceQuerySchema = z.object({
  account_id: StellarPublicKeySchema,
});

export type AccountBalanceQuery = z.infer<typeof AccountBalanceQuerySchema>;

export type StellarPublicKey = z.infer<typeof StellarPublicKeySchema>;
export type StellarSecretKey = z.infer<typeof StellarSecretKeySchema>;
export type ContractId = z.infer<typeof ContractIdSchema>;
export type XdrBase64 = z.infer<typeof XdrBase64Schema>;
export type Network = z.infer<typeof NetworkSchema>;

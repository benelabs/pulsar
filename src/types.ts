import { z } from 'zod';

/**
 * Supported Stellar networks.
 */
export enum StellarNetwork {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Futurenet = 'futurenet',
  Custom = 'custom',
}

/**
 * Standard tool handler signature for the pulsar MCP server.
 *
 * Each tool handler takes a Zod-validated input schema and returns
 * a result that the AI assistant can immediately consume.
 */
export type McpToolHandler<T extends z.ZodTypeAny = z.ZodTypeAny> = (
  input: z.infer<T>
) => Promise<Record<string, unknown>>;

/**
 * Common Zod schemas for tool inputs.
 */
export const AccountIdSchema = z
  .string()
  .startsWith('G')
  .length(56)
  .describe('A Stellar public key starting with G.');
export const ContractIdSchema = z
  .string()
  .startsWith('C')
  .length(56)
  .describe('A Soroban contract ID starting with C.');
export const XdrSchema = z.string().describe('Base64-encoded XDR blob.');

export interface ErrorResponse {
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type McpResult = Record<string, unknown> | ErrorResponse;

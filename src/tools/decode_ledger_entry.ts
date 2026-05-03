import { z } from 'zod';

import { decodeLedgerEntry } from '../services/xdr.js';
import { McpResult } from '../types.js';

/**
 * Schema for decode_ledger_entry tool input.
 */
export const decodeLedgerEntrySchema = z.object({
  xdr: z.string().describe('Base64-encoded XDR of the ledger entry (key or value)'),
  entry_type: z
    .enum(['account', 'trustline', 'contract_data', 'contract_code', 'offer', 'data'])
    .optional()
    .describe('Hint for decoding: account, trustline, contract_data, contract_code, offer, data'),
  compression: z
    .object({
      enabled: z.boolean().default(false),
      algorithm: z.enum(['auto', 'gzip', 'deflate', 'brotli']).default('auto'),
      fields: z
        .array(z.string().min(1))
        .optional()
        .describe(
          'Optional dot-paths in decoded JSON to attempt decompression on (e.g. "val.bytes")'
        ),
    })
    .optional()
    .describe(
      'Optional settings to decode compressed base64 blobs embedded in ledger entry fields'
    ),
});

export type DecodeLedgerEntryInput = z.infer<typeof decodeLedgerEntrySchema>;

/**
 * Tool handler for decode_ledger_entry.
 * Takes a raw base64 XDR ledger entry and returns a human-readable JSON representation.
 */
export const decodeLedgerEntryTool = async (input: DecodeLedgerEntryInput): Promise<McpResult> => {
  const { xdr, entry_type: entryType, compression } = input;

  const result = await decodeLedgerEntry(xdr, entryType, compression);

  // Convert result to McpResult format
  if ('error' in result) {
    return {
      error: {
        code: 400,
        message: result.error || 'XDR decode error',
        data: { code: result.code, diagnostics: result.diagnostics },
      },
    };
  }

  return {
    entry_type: result.entry_type,
    decoded: result.decoded,
    raw_xdr: result.raw_xdr,
    compression: result.compression,
  };
};

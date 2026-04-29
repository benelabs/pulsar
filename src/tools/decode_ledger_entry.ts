import { decodeLedgerEntry } from '../services/xdr.js';
import type { McpToolHandler } from '../types.js';
import {
  DecodeLedgerEntryInputSchema,
  type DecodeLedgerEntryInput,
} from '../schemas/tools.js';

/**
 * Tool handler for decode_ledger_entry.
 * Takes a raw base64 XDR ledger entry and returns a human-readable JSON representation.
 */
export const decodeLedgerEntryTool: McpToolHandler<
  typeof DecodeLedgerEntryInputSchema
> = async (input: DecodeLedgerEntryInput) => {
  const { xdr, entry_type: entryType } = input;

  const result = await decodeLedgerEntry(xdr, entryType);

  // Convert result to McpResult format
  if ('error' in result) {
    return {
      error: {
        code: 400,
        message: result.error || 'XDR decode error',
        data: { code: result.code },
      },
    };
  }

  return {
    entry_type: result.entry_type,
    decoded: result.decoded,
    raw_xdr: result.raw_xdr,
  };
};

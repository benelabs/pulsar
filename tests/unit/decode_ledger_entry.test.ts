import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  decodeLedgerEntryTool,
  decodeLedgerEntrySchema,
} from '../../src/tools/decode_ledger_entry.js';
import * as xdrModule from '../../src/services/xdr.js';

// Mock the xdr module
vi.mock('../../src/services/xdr.js', () => ({
  decodeLedgerEntry: vi.fn(),
}));

describe('decode_ledger_entry tool', () => {
  const mockDecodeLedgerEntry = vi.mocked(xdrModule.decodeLedgerEntry);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('schema validation', () => {
    it('should accept valid input with xdr only', () => {
      const input = { xdr: 'AAAAAQ==' };
      const result = decodeLedgerEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept valid input with xdr and entry_type', () => {
      const input = { xdr: 'AAAAAQ==', entry_type: 'account' as const };
      const result = decodeLedgerEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept compression configuration', () => {
      const input = {
        xdr: 'AAAAAQ==',
        compression: {
          enabled: true,
          algorithm: 'auto' as const,
          fields: ['data.value'],
        },
      };
      const result = decodeLedgerEntrySchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept all valid entry_type values', () => {
      const validTypes = [
        'account',
        'trustline',
        'contract_data',
        'contract_code',
        'offer',
        'data',
      ];
      for (const entry_type of validTypes) {
        const input = { xdr: 'AAAAAQ==', entry_type: entry_type as (typeof validTypes)[number] };
        const result = decodeLedgerEntrySchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject missing xdr', () => {
      const input = {};
      const result = decodeLedgerEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid entry_type', () => {
      const input = { xdr: 'AAAAAQ==', entry_type: 'invalid_type' };
      const result = decodeLedgerEntrySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('tool handler', () => {
    it('should return decoded result on success', async () => {
      const mockResult = {
        entry_type: 'account',
        decoded: { account_id: 'GBBD...', balance: '1000' },
        raw_xdr: 'AAAAAQ==',
      };
      mockDecodeLedgerEntry.mockResolvedValue(mockResult);

      const result = await decodeLedgerEntryTool({ xdr: 'AAAAAQ==', entry_type: 'account' });

      expect(mockDecodeLedgerEntry).toHaveBeenCalledWith('AAAAAQ==', 'account', undefined);
      expect(result).toEqual({
        entry_type: 'account',
        decoded: { account_id: 'GBBD...', balance: '1000' },
        raw_xdr: 'AAAAAQ==',
        compression: undefined,
      });
    });

    it('should return error response on decode failure', async () => {
      const mockError = {
        error: 'Invalid XDR format',
        code: 'DECODE_ERROR',
      };
      mockDecodeLedgerEntry.mockResolvedValue(mockError);

      const result = await decodeLedgerEntryTool({ xdr: 'invalid' });

      expect(result).toEqual({
        error: {
          code: 400,
          message: 'Invalid XDR format',
          data: { code: 'DECODE_ERROR', diagnostics: undefined },
        },
      });
    });

    it('should handle undefined entry_type', async () => {
      const mockResult = {
        entry_type: 'unknown',
        decoded: { some: 'data' },
        raw_xdr: 'AAAAAQ==',
      };
      mockDecodeLedgerEntry.mockResolvedValue(mockResult);

      const result = await decodeLedgerEntryTool({ xdr: 'AAAAAQ==' });

      expect(mockDecodeLedgerEntry).toHaveBeenCalledWith('AAAAAQ==', undefined, undefined);
      expect(result).toEqual({
        entry_type: 'unknown',
        decoded: { some: 'data' },
        raw_xdr: 'AAAAAQ==',
        compression: undefined,
      });
    });

    it('should pass compression options through to service', async () => {
      const mockResult = {
        entry_type: 'contract_data',
        decoded: { val: { data: 'H4sIAAAAAAAA/8tIzcnJBwCGphA2BQAAAA==' } },
        raw_xdr: 'AAAAAQ==',
        compression: {
          enabled: true,
          requested_algorithm: 'auto' as const,
          inspected_fields: ['val.data'],
          decompressed_fields: [
            {
              path: 'val.data',
              algorithm: 'gzip' as const,
              utf8: 'hello',
              byte_length: 5,
            },
          ],
          skipped_fields: [],
        },
      };
      mockDecodeLedgerEntry.mockResolvedValue(mockResult);

      const result = await decodeLedgerEntryTool({
        xdr: 'AAAAAQ==',
        compression: { enabled: true, algorithm: 'auto', fields: ['val.data'] },
      });

      expect(mockDecodeLedgerEntry).toHaveBeenCalledWith('AAAAAQ==', undefined, {
        enabled: true,
        algorithm: 'auto',
        fields: ['val.data'],
      });
      expect(result).toEqual(mockResult);
    });
  });
});

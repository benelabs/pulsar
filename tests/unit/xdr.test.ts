import { spawn } from 'child_process';
import { gzipSync } from 'zlib';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { decodeLedgerEntry } from '../../src/services/xdr.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  config: {
    stellarCliPath: 'stellar',
  },
}));

describe('XDR Service', () => {
  const mockSpawn = vi.mocked(spawn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockChildProcess(exitCode: number | null, stdout: string, stderr: string) {
    const stdoutEmitter = {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          cb(Buffer.from(stdout));
        }
      }),
    };

    const stderrEmitter = {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          cb(Buffer.from(stderr));
        }
      }),
    };

    const child = {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      on: vi.fn((event: string, cb: unknown) => {
        if (event === 'close') {
          (cb as (code: number | null) => void)(exitCode);
        }
        if (event === 'error') {
          // Don't call error handler for success cases
        }
      }),
    };

    return child;
  }

  describe('decodeLedgerEntry', () => {
    it('should return error for invalid base64', async () => {
      const result = await decodeLedgerEntry('not-valid-base64!!!');

      expect(result).toEqual({
        error: 'Invalid XDR: not a valid base64 string',
        code: 'INVALID_XDR',
      });
    });

    it('should decode valid XDR successfully', async () => {
      const validXdr = 'AAAAAQ==';
      const decodedOutput = JSON.stringify({ account_id: 'GBBD...', balance: '1000' });

      mockSpawn.mockReturnValue(
        createMockChildProcess(0, decodedOutput, '') as unknown as ReturnType<typeof spawn>
      );

      const result = await decodeLedgerEntry(validXdr, 'account');

      expect(mockSpawn).toHaveBeenCalledWith(
        'stellar',
        ['xdr', 'decode', '--type', 'LedgerEntry', '--input', 'base64', '--output', 'json'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );

      expect(result).toEqual({
        entry_type: 'account',
        decoded: { account_id: 'GBBD...', balance: '1000' },
        raw_xdr: validXdr,
        compression: undefined,
      });
    });

    it('should return error when CLI fails', async () => {
      const validXdr = 'AAAAAQ==';
      const errorOutput = 'Error: Invalid XDR format';

      mockSpawn.mockReturnValue(
        createMockChildProcess(1, '', errorOutput) as unknown as ReturnType<typeof spawn>
      );

      const result = await decodeLedgerEntry(validXdr);

      expect(result).toEqual({
        error: 'Error: Invalid XDR format',
        code: 'DECODE_ERROR',
      });
    });

    it('should detect account entry type from decoded data', async () => {
      const validXdr = 'AAAAAQ==';
      const decodedOutput = JSON.stringify({ seq_num: '123456', balance: '1000' });

      mockSpawn.mockReturnValue(
        createMockChildProcess(0, decodedOutput, '') as unknown as ReturnType<typeof spawn>
      );

      const result = await decodeLedgerEntry(validXdr);

      if ('entry_type' in result) {
        expect(result.entry_type).toBe('account');
      }
    });

    it('should detect contract_data entry type from decoded data', async () => {
      const validXdr = 'AAAAAQ==';
      const decodedOutput = JSON.stringify({
        contract: 'CA3D...',
        key: { type: 'Symbol', value: 'Balance' },
        durability: 'persistent',
      });

      mockSpawn.mockReturnValue(
        createMockChildProcess(0, decodedOutput, '') as unknown as ReturnType<typeof spawn>
      );

      const result = await decodeLedgerEntry(validXdr);

      if ('entry_type' in result) {
        expect(result.entry_type).toBe('contract_data');
      }
    });

    it('should handle CLI spawn error', async () => {
      const validXdr = 'AAAAAQ==';

      mockSpawn.mockImplementation(() => {
        throw new Error('spawn stellar ENOENT');
      });

      const result = await decodeLedgerEntry(validXdr);

      expect(result).toEqual({
        error: 'spawn stellar ENOENT',
        code: 'UNKNOWN_ERROR',
      });
    });

    it('should decode compressed on-chain blob from configured field', async () => {
      const validXdr = 'AAAAAQ==';
      const compressed = gzipSync(Buffer.from('hello on chain', 'utf8')).toString('base64');
      const decodedOutput = JSON.stringify({ val: { data: compressed } });

      mockSpawn.mockReturnValue(
        createMockChildProcess(0, decodedOutput, '') as unknown as ReturnType<typeof spawn>
      );

      const result = await decodeLedgerEntry(validXdr, 'contract_data', {
        enabled: true,
        algorithm: 'auto',
        fields: ['val.data'],
      });

      if ('entry_type' in result) {
        expect(result.compression?.decompressed_fields).toEqual([
          {
            path: 'val.data',
            algorithm: 'gzip',
            utf8: 'hello on chain',
            byte_length: 14,
          },
        ]);
      }
    });
  });
});

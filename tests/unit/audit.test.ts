import { promises as fs } from 'fs';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { anonymize, logToolExecution } from '../../src/audit.js';
import { config } from '../../src/config.js';

vi.mock('fs', () => ({
  promises: {
    appendFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('audit', () => {
  describe('anonymize', () => {
    it('should redact sensitive keys', () => {
      const data = {
        STELLAR_SECRET_KEY: 'SD123',
        secret: 'my-secret',
        privateKey: 'pk_123',
        raw_secret: 'raw123',
        envelope_xdr: 'AAAA...',
        xdr: 'BBBB...',
        safe_key: 'public info',
      };

      const result = anonymize(data);

      expect(result.STELLAR_SECRET_KEY).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.privateKey).toBe('[REDACTED]');
      expect(result.raw_secret).toBe('[REDACTED]');
      expect(result.envelope_xdr).toBe('[REDACTED]');
      expect(result.xdr).toBe('[REDACTED]');
      expect(result.safe_key).toBe('public info');
    });

    it('should anonymize Stellar Public Keys (G...)', () => {
      const address = 'GA5WCHZ77IK6W7KAXVXM4J6B6IKHSP65VREB7GOSJSOD5M5SOH5R5BQU';
      const result = anonymize(address);

      expect(result).toMatch(/^G\.\.\.[a-f0-9]{8}$/);
    });

    it('should anonymize Soroban Contract IDs (C...)', () => {
      const contractId = 'CCW67STJRLWRIA6B5YILU4ZTP743ALUFA7B4KKVD3B3BYNDND7I7MTSD';
      const result = anonymize(contractId);

      expect(result).toMatch(/^C\.\.\.[a-f0-9]{8}$/);
    });

    it('should recursively anonymize arrays and objects', () => {
      const data = {
        nested: {
          address: 'GA5WCHZ77IK6W7KAXVXM4J6B6IKHSP65VREB7GOSJSOD5M5SOH5R5BQU',
        },
        list: ['CCW67STJRLWRIA6B5YILU4ZTP743ALUFA7B4KKVD3B3BYNDND7I7MTSD', { xdr: 'AAAA' }],
      };

      const result = anonymize(data);

      expect(result.nested.address).toMatch(/^G\.\.\.[a-f0-9]{8}$/);
      expect(result.list[0]).toMatch(/^C\.\.\.[a-f0-9]{8}$/);
      expect(result.list[1].xdr).toBe('[REDACTED]');
    });

    it('should pass non-string primitives through', () => {
      expect(anonymize(123)).toBe(123);
      expect(anonymize(true)).toBe(true);
      expect(anonymize(null)).toBe(null);
      expect(anonymize(undefined)).toBe(undefined);
    });
  });

  describe('logToolExecution', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should format and append audit log entry for success', async () => {
      const toolName = 'get_account_balance';
      const inputs = { account_id: 'GA5WCHZ77IK6W7KAXVXM4J6B6IKHSP65VREB7GOSJSOD5M5SOH5R5BQU' };
      const response = { balance: 100 };

      await logToolExecution(toolName, inputs, 'success', response);

      expect(fs.appendFile).toHaveBeenCalledTimes(1);
      const args = (fs.appendFile as any).mock.calls[0];
      expect(args[0]).toBe(config.auditLogPath);

      const logEntry = JSON.parse(args[1].trim());
      expect(logEntry.tool).toBe(toolName);
      expect(logEntry.outcome).toBe('success');
      expect(logEntry.inputs.account_id).toMatch(/^G\.\.\.[a-f0-9]{8}$/);
      expect(logEntry.result).toEqual({ balance: 100 });
      expect(logEntry.timestamp).toBeDefined();
    });

    it('should format and append audit log entry for error', async () => {
      const toolName = 'get_account_balance';
      const inputs = { account_id: 'GA5WCHZ77IK6W7KAXVXM4J6B6IKHSP65VREB7GOSJSOD5M5SOH5R5BQU' };
      const error = { status: 'error', message: 'Not found' };

      await logToolExecution(toolName, inputs, 'error', error);

      expect(fs.appendFile).toHaveBeenCalledTimes(1);
      const args = (fs.appendFile as any).mock.calls[0];

      const logEntry = JSON.parse(args[1].trim());
      expect(logEntry.tool).toBe(toolName);
      expect(logEntry.outcome).toBe('error');
      expect(logEntry.inputs.account_id).toMatch(/^G\.\.\.[a-f0-9]{8}$/);
      expect(logEntry.error).toEqual(error);
    });

    it('should log an error if fs.appendFile fails', async () => {
      const toolName = 'get_account_balance';
      const inputs = { account_id: 'GA5WCHZ77IK6W7KAXVXM4J6B6IKHSP65VREB7GOSJSOD5M5SOH5R5BQU' };
      const response = { balance: 100 };

      const error = new Error('Disk full');
      vi.mocked(fs.appendFile).mockRejectedValueOnce(error);

      await logToolExecution(toolName, inputs, 'success', response);

      expect(fs.appendFile).toHaveBeenCalledTimes(1);
    });
  });
});

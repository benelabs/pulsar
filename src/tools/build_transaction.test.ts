import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildTransaction } from './build_transaction.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import { BuildTransactionInputSchema } from '../schemas/tools.js';
import { Horizon } from '@stellar/stellar-sdk';

// Mock dependencies
vi.mock('../services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    stellarNetwork: 'testnet',
  },
}));

vi.mock('../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getHorizonServer } from '../services/horizon.js';

const mockGetHorizonServer = vi.mocked(getHorizonServer);

describe('build_transaction', () => {
  const mockAccount = {
    accountId: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
    sequenceNumber: '123456789',
    incrementSequenceNumber: vi.fn(),
  };

  const mockServer = {
    loadAccount: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHorizonServer.mockReturnValue(mockServer as any);
    mockServer.loadAccount.mockResolvedValue(mockAccount);
  });

  describe('Input Validation', () => {
    it('should validate input schema correctly', async () => {
      const invalidInput = {
        source_account: 'invalid-key',
        operations: [],
      };

      await expect(buildTransaction(invalidInput)).rejects.toThrow(PulsarValidationError);
    });

    it('should require at least one operation', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });

    it('should validate Stellar public key format', async () => {
      const input = {
        source_account: 'INVALID_KEY',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Account Loading', () => {
    it('should load source account from Horizon', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
      };

      await buildTransaction(input);

      expect(mockGetHorizonServer).toHaveBeenCalledWith('testnet');
      expect(mockServer.loadAccount).toHaveBeenCalledWith('GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6');
    });

    it('should handle account not found error', async () => {
      mockServer.loadAccount.mockRejectedValue({
        response: { status: 404 },
      });

      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarNetworkError);
    });

    it('should handle network errors', async () => {
      mockServer.loadAccount.mockRejectedValue(new Error('Network error'));

      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarNetworkError);
    });
  });

  describe('Payment Operations', () => {
    it('should build native XLM payment', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result).toMatchObject({
        network: 'testnet',
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        fee: '100000',
        timeout: 30,
        operations: [
          {
            type: 'payment',
            description: 'Payment of 100 XLM to GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
          },
        ],
      });
      expect(result.transaction_xdr).toBeDefined();
      expect(typeof result.transaction_xdr).toBe('string');
    });

    it('should build asset payment', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
            asset_code: 'USDC',
            asset_issuer: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'payment',
          description: 'Payment of 100 USDC to GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        },
      ]);
    });
  });

  describe('Change Trust Operations', () => {
    it('should build change trust operation', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'change_trust',
            asset_code: 'USDC',
            asset_issuer: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            limit: '1000000',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'change_trust',
          description: 'Trustline for USDC:GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        },
      ]);
    });

    it('should require asset_code and asset_issuer for trustline', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'change_trust',
            asset_code: 'USDC',
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Manage Data Operations', () => {
    it('should build manage data operation with value', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'manage_data',
            name: 'test_key',
            value: 'test_value',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'manage_data',
          description: 'Set data entry "test_key"',
        },
      ]);
    });

    it('should build manage data operation to clear entry', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'manage_data',
            name: 'test_key',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'manage_data',
          description: 'Clear data entry "test_key"',
        },
      ]);
    });

    it('should require name for manage data', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'manage_data',
            value: 'test_value',
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Set Options Operations', () => {
    it('should build set options operation', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'set_options',
            inflation_destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            home_domain: 'example.com',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'set_options',
          description: 'Set account options',
        },
      ]);
    });

    it('should build set options with signer', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'set_options',
            signer_address: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            signer_type: 'ed25519_public_key',
            signer_weight: 1,
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'set_options',
          description: 'Set account options',
        },
      ]);
    });

    it('should validate signer_type', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'set_options',
            signer_address: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            signer_type: 'invalid_type',
            signer_weight: 1,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Account Merge Operations', () => {
    it('should build account merge operation', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'account_merge',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'account_merge',
          description: 'Merge account into GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        },
      ]);
    });

    it('should require destination for account merge', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'account_merge',
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Create Account Operations', () => {
    it('should build create account operation', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'create_account',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            starting_balance: 2,
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toEqual([
        {
          type: 'create_account',
          description: 'Create account GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6 with 2 XLM',
        },
      ]);
    });

    it('should require minimum 1 XLM starting balance', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'create_account',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            starting_balance: 0.5,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });

    it('should require destination for create account', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'create_account',
            starting_balance: 2,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });

  describe('Multiple Operations', () => {
    it('should build transaction with multiple operations', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
          {
            type: 'change_trust',
            asset_code: 'USDC',
            asset_issuer: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
          },
        ],
      };

      const result = await buildTransaction(input);

      expect(result.operations).toHaveLength(2);
      expect(result.fee).toBe('200000'); // 100000 * 2 operations
    });

    it('should use custom fee when specified', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
        fee: 50000,
      };

      const result = await buildTransaction(input);

      expect(result.fee).toBe('50000');
    });

    it('should use custom timeout when specified', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
        timeout: 60,
      };

      const result = await buildTransaction(input);

      expect(result.timeout).toBe(60);
    });
  });

  describe('Network Configuration', () => {
    it('should use custom network when specified', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'payment',
            destination: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
            amount: 100,
          },
        ],
        network: 'mainnet',
      };

      const result = await buildTransaction(input);

      expect(result.network).toBe('mainnet');
      expect(mockGetHorizonServer).toHaveBeenCalledWith('mainnet');
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported operation type', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'unsupported_operation' as any,
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });

    it('should handle invalid manage data value type', async () => {
      const input = {
        source_account: 'GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6',
        operations: [
          {
            type: 'manage_data',
            name: 'test_key',
            value: 123, // Invalid type
          },
        ],
      };

      await expect(buildTransaction(input)).rejects.toThrow(PulsarValidationError);
    });
  });
});

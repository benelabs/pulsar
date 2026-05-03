import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionBuilder, Networks, Keypair } from '@stellar/stellar-sdk';

import { deployContract } from '../../src/tools/deploy_contract.js';
import { getHorizonServer } from '../../src/services/horizon.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

describe('deployContract', () => {
  let mockServer: any;

  const SOURCE_ACCOUNT = Keypair.random().publicKey();
  const WASM_HASH = 'a'.repeat(64);
  const FACTORY_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  function mockAccount(sequence = '123456789') {
    let currentSequence = BigInt(sequence);
    mockServer.loadAccount.mockResolvedValue({
      accountId: () => SOURCE_ACCOUNT,
      sequenceNumber: () => sequence,
      incrementSequenceNumber: vi.fn(),
      sequenceNumber: () => currentSequence.toString(),
      incrementSequenceNumber: () => {
        currentSequence += 1n;
      },
    });
  }

  describe('direct mode', () => {
    it('builds a direct deployment transaction with valid inputs', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
      })) as any;

      expect(result.mode).toBe('direct');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.transaction_xdr.length).toBeGreaterThan(0);
      expect(result.predicted_contract_id).toBeDefined();
      expect(result.predicted_contract_id).toMatch(/^C[A-Z2-7]{55}$/);
      expect(result.network).toBe('testnet');
      expect(result.source_account).toBe(SOURCE_ACCOUNT);
    });

    it('builds a direct deployment with custom salt', async () => {
      mockAccount();
      const salt = 'b'.repeat(64);

      const result = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
        salt,
      })) as any;

      expect(result.mode).toBe('direct');
      expect(result.predicted_contract_id).toBeDefined();
      // With a fixed salt, the contract ID should be deterministic
      const firstRun = result.predicted_contract_id;

      // Calling again with same salt should produce same ID
      const result2 = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
        salt,
      })) as any;

      expect(result2.predicted_contract_id).toBe(firstRun);
    });

    it('produces different contract IDs with different salts', async () => {
      mockAccount();

      const result1 = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
        salt: 'b'.repeat(64),
      })) as any;

      const result2 = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
        salt: 'c'.repeat(64),
      })) as any;

      expect(result1.predicted_contract_id).not.toBe(result2.predicted_contract_id);
    });

    it('rejects invalid wasm_hash', async () => {
      mockAccount();

      await expect(
        deployContract({
          mode: 'direct',
          source_account: SOURCE_ACCOUNT,
          wasm_hash: 'invalid',
        })
      ).rejects.toThrow('Invalid input for deploy_contract');
    });

    it('rejects missing wasm_hash in direct mode', async () => {
      mockAccount();

      await expect(
        deployContract({
          mode: 'direct',
          source_account: SOURCE_ACCOUNT,
        } as any)
      ).rejects.toThrow('wasm_hash is required for direct deployment mode');
    });

    it('rejects invalid salt length', async () => {
      mockAccount();

      await expect(
        deployContract({
          mode: 'direct',
          source_account: SOURCE_ACCOUNT,
          wasm_hash: WASM_HASH,
          salt: 'too-short',
        })
      ).rejects.toThrow('Invalid input for deploy_contract');
    });

    it('handles unfunded source account', async () => {
      const error = new Error('Not Found');
      (error as any).response = { status: 404 };
      mockServer.loadAccount.mockRejectedValue(error);

      await expect(
        deployContract({
          mode: 'direct',
          source_account: SOURCE_ACCOUNT,
          wasm_hash: WASM_HASH,
        })
      ).rejects.toThrow('not found. Fund the account before deploying');
    });

    it('supports network override', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
        network: 'futurenet',
      })) as any;

      expect(result.network).toBe('futurenet');
    });

    it('produces valid XDR that can be parsed', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: WASM_HASH,
      })) as any;

      // Should be parseable
      const tx = TransactionBuilder.fromXDR(
        result.transaction_xdr,
        Networks.TESTNET
      ) as import('@stellar/stellar-sdk').Transaction;
      expect(tx.operations.length).toBe(1);
      expect(tx.source).toBe(SOURCE_ACCOUNT);
    });
  });

  describe('factory mode', () => {
    it('builds a factory deployment transaction', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'factory',
        source_account: SOURCE_ACCOUNT,
        factory_contract_id: FACTORY_CONTRACT_ID,
      })) as any;

      expect(result.mode).toBe('factory');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.transaction_xdr.length).toBeGreaterThan(0);
      expect(result.predicted_contract_id).toBeUndefined();
      expect(result.network).toBe('testnet');
      expect(result.source_account).toBe(SOURCE_ACCOUNT);
    });

    it('builds a factory deployment with custom function name', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'factory',
        source_account: SOURCE_ACCOUNT,
        factory_contract_id: FACTORY_CONTRACT_ID,
        deploy_function: 'create_child',
      })) as any;

      expect(result.transaction_xdr).toBeDefined();
    });

    it('builds a factory deployment with typed args', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'factory',
        source_account: SOURCE_ACCOUNT,
        factory_contract_id: FACTORY_CONTRACT_ID,
        deploy_function: 'deploy',
        deploy_args: [
          { type: 'symbol', value: 'init' },
          { type: 'u64', value: 1000 },
          { type: 'address', value: SOURCE_ACCOUNT },
          { type: 'bool', value: true },
        ],
      })) as any;

      expect(result.transaction_xdr).toBeDefined();
    });

    it('rejects missing factory_contract_id in factory mode', async () => {
      mockAccount();

      await expect(
        deployContract({
          mode: 'factory',
          source_account: SOURCE_ACCOUNT,
        } as any)
      ).rejects.toThrow('factory_contract_id is required for factory deployment mode');
    });

    it('rejects invalid factory_contract_id', async () => {
      mockAccount();

      await expect(
        deployContract({
          mode: 'factory',
          source_account: SOURCE_ACCOUNT,
          factory_contract_id: 'invalid',
        } as any)
      ).rejects.toThrow('Invalid input for deploy_contract');
    });

    it('produces valid XDR for factory mode', async () => {
      mockAccount();

      const result = (await deployContract({
        mode: 'factory',
        source_account: SOURCE_ACCOUNT,
        factory_contract_id: FACTORY_CONTRACT_ID,
        deploy_args: [{ type: 'symbol', value: 'test' }],
      })) as any;

      const tx = TransactionBuilder.fromXDR(
        result.transaction_xdr,
        Networks.TESTNET
      ) as import('@stellar/stellar-sdk').Transaction;
      expect(tx.operations.length).toBe(1);
      expect(tx.source).toBe(SOURCE_ACCOUNT);
    });
  });

  describe('input validation', () => {
    it('rejects invalid source_account', async () => {
      await expect(
        deployContract({
          mode: 'direct',
          source_account: 'invalid',
          wasm_hash: WASM_HASH,
        } as any)
      ).rejects.toThrow('Invalid input for deploy_contract');
    });

    it('rejects invalid mode', async () => {
      await expect(
        deployContract({
          mode: 'invalid',
          source_account: SOURCE_ACCOUNT,
        } as any)
      ).rejects.toThrow();
    });
  });
});

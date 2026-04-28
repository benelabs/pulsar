import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Account, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import { accountMerge } from '../../src/tools/account_merge.js';
import { getHorizonServer } from '../../src/services/horizon.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

describe('accountMerge', () => {
  const sourceKeypair = Keypair.random();
  const destinationKeypair = Keypair.random();
  const SOURCE_ACCOUNT = sourceKeypair.publicKey();
  const DESTINATION_ACCOUNT = destinationKeypair.publicKey();

  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  it('builds an unsigned account merge transaction', async () => {
    mockServer.loadAccount.mockImplementation((accountId: string) => {
      if (accountId === SOURCE_ACCOUNT) {
        return Promise.resolve(new Account(SOURCE_ACCOUNT, '1'));
      }
      if (accountId === DESTINATION_ACCOUNT) {
        return Promise.resolve({
          accountId: () => DESTINATION_ACCOUNT,
          sequenceNumber: () => '1',
        });
      }
      return Promise.reject(new Error('unexpected account'));
    });

    const result = (await accountMerge({
      source_account: SOURCE_ACCOUNT,
      destination_account: DESTINATION_ACCOUNT,
    })) as {
      source_account: string;
      destination_account: string;
      network: string;
      transaction_xdr: string;
    };

    expect(result.source_account).toBe(SOURCE_ACCOUNT);
    expect(result.destination_account).toBe(DESTINATION_ACCOUNT);
    expect(result.network).toBe('testnet');
    expect(typeof result.transaction_xdr).toBe('string');
    expect(result.transaction_xdr.length).toBeGreaterThan(0);

    const tx = TransactionBuilder.fromXDR(result.transaction_xdr, Networks.TESTNET);
    expect(tx.operations).toHaveLength(1);
    expect((tx.operations[0] as any).destination).toBe(DESTINATION_ACCOUNT);
  });

  it('rejects when source and destination are the same', async () => {
    await expect(
      accountMerge({
        source_account: SOURCE_ACCOUNT,
        destination_account: SOURCE_ACCOUNT,
      })
    ).rejects.toThrow('source_account and destination_account must differ');
  });

  it('rejects when source account does not exist', async () => {
    mockServer.loadAccount.mockRejectedValueOnce({
      response: { status: 404 },
      message: 'Not Found',
    });

    await expect(
      accountMerge({
        source_account: SOURCE_ACCOUNT,
        destination_account: DESTINATION_ACCOUNT,
      })
    ).rejects.toThrow('Source account');
  });

  it('rejects when destination account does not exist', async () => {
    mockServer.loadAccount.mockImplementation((accountId: string) => {
      if (accountId === SOURCE_ACCOUNT) {
        return Promise.resolve(new Account(SOURCE_ACCOUNT, '1'));
      }
      return Promise.reject({ response: { status: 404 }, message: 'Not Found' });
    });

    await expect(
      accountMerge({
        source_account: SOURCE_ACCOUNT,
        destination_account: DESTINATION_ACCOUNT,
      })
    ).rejects.toThrow('Destination account');
  });
});

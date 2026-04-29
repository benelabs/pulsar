import { describe, it, expect, vi } from 'vitest';
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk';

import { createClaimableBalance } from '../../src/tools/create_claimable_balance.js';

// Mocking horizon and sdk
vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn().mockReturnValue({
    loadAccount: vi.fn().mockResolvedValue({
      accountId: () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      sequenceNumber: () => '123456789',
      incrementSequenceNumber: vi.fn(),
    }),
  }),
}));

describe('createClaimableBalance', () => {
  const TEST_DESTINATION = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  it('builds a simple unconditional claimable balance transaction', async () => {
    const input = {
      asset: 'XLM',
      amount: '100.0',
      claimants: [
        {
          destination: TEST_DESTINATION,
        },
      ],
      source_account: TEST_DESTINATION,
    };

    const result = await createClaimableBalance(input);
    expect(result.transaction_xdr).toBeDefined();
    expect(result.source_account).toBe(TEST_DESTINATION);
  });

  it('builds a complex claimable balance with nested predicates', async () => {
    const input = {
      asset: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      amount: '50.0',
      claimants: [
        {
          destination: TEST_DESTINATION,
          predicate: {
            type: 'and',
            predicates: [
              { type: 'beforeAbsoluteTime', timestamp: 1700000000 },
              {
                type: 'or',
                predicates: [
                  { type: 'beforeRelativeTime', seconds: 3600 },
                  { type: 'not', predicate: { type: 'unconditional' } },
                ],
              },
            ],
          },
        },
      ],
      source_account: TEST_DESTINATION,
    };

    const result = await createClaimableBalance(input);
    expect(result.transaction_xdr).toBeDefined();

    // Verify we can parse it back
    const tx = TransactionBuilder.fromXDR(result.transaction_xdr as string, Networks.TESTNET);
    const op = tx.operations[0] as unknown as {
      type: string;
      asset: { code: string };
      amount: string;
      claimants: { destination: string }[];
    };
    expect(op.type).toBe('createClaimableBalance');
    expect(op.asset.code).toBe('USDC');
    expect(op.amount).toBe('50.0000000');
    expect(op.claimants).toHaveLength(1);
    expect(op.claimants[0].destination).toBe(TEST_DESTINATION);
  });

  it('throws validation error for invalid asset format', async () => {
    const input = {
      asset: 'INVALID_ASSET',
      amount: '100.0',
      claimants: [{ destination: TEST_DESTINATION }],
      source_account: TEST_DESTINATION,
    };

    await expect(createClaimableBalance(input)).rejects.toThrow('Invalid asset format');
  });

  it('throws validation error for empty claimants', async () => {
    const input = {
      asset: 'XLM',
      amount: '100.0',
      claimants: [],
      source_account: TEST_DESTINATION,
    };

    await expect(createClaimableBalance(input)).rejects.toThrow(
      'Invalid input for create_claimable_balance'
    );
  });
});

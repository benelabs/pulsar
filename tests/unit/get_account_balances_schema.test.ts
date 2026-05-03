import { describe, expect, it } from 'vitest';

import { GetAccountBalancesInputSchema } from '../../src/schemas/tools.js';

describe('GetAccountBalancesInputSchema', () => {
  const accountIds = [
    'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234',
    'GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ',
  ];

  it('accepts valid account_ids with defaults', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_concurrency).toBe(5);
    }
  });

  it('accepts explicit filters and concurrency', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      network: 'testnet',
      asset_code: 'USDC',
      asset_issuer: 'GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7',
      max_concurrency: 3,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty account_ids array', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: [accountIds[0], accountIds[0]],
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: ['INVALID_KEY'],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than 25 account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: new Array(26).fill(accountIds[0]),
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid max_concurrency values', () => {
    const tooLow = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      max_concurrency: 0,
    });
    const tooHigh = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      max_concurrency: 11,
    });

    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });
});

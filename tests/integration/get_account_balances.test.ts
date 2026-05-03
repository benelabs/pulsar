import { Keypair } from '@stellar/stellar-sdk';
import { beforeAll, expect, it } from 'vitest';

import { getAccountBalances } from '../../src/tools/get_account_balances.js';

import { createFundedTestnetAccount, describeIfIntegration } from './setup.js';

describeIfIntegration('get_account_balances (Integration)', () => {
  let primaryAccountPublicKey: string;
  let secondaryAccountPublicKey: string;

  beforeAll(async () => {
    const primaryAccount = await createFundedTestnetAccount();
    primaryAccountPublicKey = primaryAccount.publicKey();

    const secondaryAccount = await createFundedTestnetAccount();
    secondaryAccountPublicKey = secondaryAccount.publicKey();

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 30_000);

  it('fetches balances for multiple funded accounts in one call', async () => {
    const result = (await getAccountBalances({
      account_ids: [primaryAccountPublicKey, secondaryAccountPublicKey],
      network: 'testnet',
      max_concurrency: 2,
    })) as any;

    expect(result.requested).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);

    for (const entry of result.results) {
      expect(entry.status).toBe('success');
      expect(entry.balances.some((balance: any) => balance.asset_type === 'native')).toBe(true);
    }
  });

  it('returns partial errors when one account does not exist', async () => {
    const missingAccount = Keypair.random().publicKey();

    const result = (await getAccountBalances({
      account_ids: [primaryAccountPublicKey, missingAccount],
      network: 'testnet',
      max_concurrency: 2,
    })) as any;

    expect(result.requested).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].status).toBe('success');
    expect(result.results[1].account_id).toBe(missingAccount);
    expect(result.results[1].status).toBe('error');
    expect(result.results[1].error_code).toBe('NETWORK_ERROR');
    expect(result.results[1].message).toMatch(/Account not found|Bad Request/);
    expect(result.results[1]).toMatchObject({
      account_id: missingAccount,
      status: 'error',
    });
  });
});

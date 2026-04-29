import { Keypair } from '@stellar/stellar-sdk';
import { beforeAll, expect, it } from 'vitest';

import { getAccountBalance } from '../../src/tools/get_account_balance.js';

import { createFundedTestnetAccount, describeIfIntegration } from './setup.js';

/**
 * Integration tests for get_account_balance tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */
describeIfIntegration('get_account_balance (Integration)', () => {
  let fundedAccountPublicKey: string;

  beforeAll(async () => {
    const fundedAccount = await createFundedTestnetAccount();
    fundedAccountPublicKey = fundedAccount.publicKey();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }, 30_000);

  it('should fetch account balance from testnet', async () => {
    const result = (await getAccountBalance({
      account_id: fundedAccountPublicKey,
      network: 'testnet',
    })) as any;

    expect(result.account_id).toBe(fundedAccountPublicKey);
    expect(result.balances).toBeDefined();
    expect(Array.isArray(result.balances)).toBe(true);

    const xlmBalance = result.balances.find((balance: any) => balance.asset_type === 'native');
    expect(xlmBalance).toBeDefined();
    expect(parseFloat(xlmBalance.balance)).toBeGreaterThan(0);
  });

  it('should return error for non-existent account', async () => {
    const nonExistentKey = Keypair.random().publicKey();

    await expect(
      getAccountBalance({
        account_id: nonExistentKey,
        network: 'testnet',
      })
    ).rejects.toThrow(/Account not found|Bad Request/);
  });
});

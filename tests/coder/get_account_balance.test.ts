import { expect, it, beforeAll } from 'vitest';

import { getAccountBalance } from '../../src/tools/get_account_balance.js';

import {
  describeIfIntegration,
  fundWithFriendbot,
  TEST_ACCOUNT_PUBLIC_KEY,
} from './setup.js';

/**
 * Integration tests for get_account_balance tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('get_account_balance (Integration)', () => {
  // Ensure test account is funded before tests
  beforeAll(async () => {
    try {
      await fundWithFriendbot(TEST_ACCOUNT_PUBLIC_KEY);
      // Wait a moment for the funding transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.log('Setup: Account may already be funded or funding failed:', error);
    }
  });

  it('should fetch account balance from testnet', async () => {
    const result = (await getAccountBalance({
      account_id: TEST_ACCOUNT_PUBLIC_KEY,
      network: 'testnet'
    })) as any;

    expect(result.account_id).toBe(TEST_ACCOUNT_PUBLIC_KEY);
    expect(result.balances).toBeDefined();
    expect(Array.isArray(result.balances)).toBe(true);

    // Should have at least XLM balance (native)
    const xlmBalance = result.balances.find(
      (b: any) => b.asset_type === 'native'
    );
    expect(xlmBalance).toBeDefined();
    expect(parseFloat(xlmBalance!.balance)).toBeGreaterThan(0);
  });

  it('should return error for non-existent account', async () => {
    const nonExistentKey = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG';

    await expect(getAccountBalance({ 
      account_id: nonExistentKey,
      network: 'testnet'
    })).rejects.toThrow("Account not found — it may not be funded yet");
  });
});

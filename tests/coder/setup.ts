import { Keypair } from '@stellar/stellar-sdk';
import { describe, it } from 'vitest';

/**
 * Integration test setup utilities.
 *
 * These tests hit the real Stellar Testnet and are opt-in.
 * Set RUN_INTEGRATION_TESTS=true to enable them.
 */

export const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

// Well-known Testnet account for balance checks
// This is a funded testnet account that will be created/funded via Friendbot
export const TEST_ACCOUNT_PUBLIC_KEY =
  process.env.INTEGRATION_TEST_PUBLIC_KEY ||
  'GBV3Y3CRDBHCBK4KZ7Q5MZ7CJFS7K3LYKX3LKF2Q4LHMVZ7MNTB6UQHP';

// Testnet USDC SAC (Stellar Asset Contract) contract ID
export const TESTNET_USDC_CONTRACT_ID =
  process.env.TESTNET_USDC_CONTRACT_ID ||
  'CBIELTKRNMPAW7R5AWR5WWPQMGEBSYV6QJ5I6QVWVJ7V3P2YGKG5OXF';

// Soroban RPC URL for Testnet
export const TESTNET_SOROBAN_RPC_URL =
  process.env.TESTNET_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

// Horizon URL for Testnet
export const TESTNET_HORIZON_URL =
  process.env.TESTNET_HORIZON_URL || 'https://horizon-testnet.stellar.org';

/**
 * Funds a testnet account using Friendbot.
 *
 * @param publicKey - The public key to fund
 * @returns Promise that resolves when funding is complete
 */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const friendbotUrl = `https://friendbot.stellar.org?addr=${publicKey}`;

  const response = await fetch(friendbotUrl);

  if (!response.ok) {
    // Account might already be funded, which is fine
    if (response.status === 400) {
      console.log(`Account ${publicKey} may already be funded`);
      return;
    }
    throw new Error(`Friendbot failed: ${response.status} ${await response.text()}`);
  }

  console.log(`Funded account ${publicKey} via Friendbot`);
}

/**
 * Creates a new funded testnet account.
 *
 * @returns The Keypair for the new account
 */
export async function createFundedTestnetAccount(): Promise<Keypair> {
  const keypair = Keypair.random();
  await fundWithFriendbot(keypair.publicKey());
  return keypair;
}

/**
 * Skips tests if integration tests are not enabled.
 *
 * @param name - Test name
 * @param fn - Test function
 */
export function itIfIntegration(
  name: string,
  fn: () => Promise<void>
): void {
  if (RUN_INTEGRATION_TESTS) {
    it(name, fn);
  } else {
    it.skip(name, fn);
  }
}

/**
 * Describes a suite of integration tests that are skipped unless
 * RUN_INTEGRATION_TESTS is set.
 */
export function describeIfIntegration(
  name: string,
  fn: () => void
): void {
  if (RUN_INTEGRATION_TESTS) {
    describe(name, fn);
  } else {
    describe.skip(name, fn);
  }
}

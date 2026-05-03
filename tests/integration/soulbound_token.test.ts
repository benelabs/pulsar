import { expect, it } from 'vitest';

import {
  describeIfIntegration,
  TESTNET_HORIZON_URL,
  TEST_ACCOUNT_PUBLIC_KEY,
} from './setup.js';
import { soulboundToken } from '../../src/tools/soulbound_token.js';

// A deployed SBT contract on testnet — override via env for real end-to-end runs.
const CONTRACT_ID =
  process.env.TESTNET_SBT_CONTRACT_ID ||
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

/**
 * Integration tests for soulbound_token tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */
describeIfIntegration('soulbound_token (Integration)', () => {
  it('builds a mint XDR against a live testnet account', async () => {
    const result = (await soulboundToken({
      action: 'mint',
      contract_id: CONTRACT_ID,
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      recipient: TEST_ACCOUNT_PUBLIC_KEY,
      metadata: JSON.stringify({ role: 'member', issued_at: Date.now() }),
      network: 'testnet',
    })) as any;

    expect(result.action).toBe('mint');
    expect(result.transaction_xdr).toBeDefined();
    expect(typeof result.transaction_xdr).toBe('string');
    expect(result.token_id).toBeDefined();
    expect(result.network).toBe('testnet');
  });

  it('builds a query XDR against a live testnet account', async () => {
    const result = (await soulboundToken({
      action: 'query',
      contract_id: CONTRACT_ID,
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      recipient: TEST_ACCOUNT_PUBLIC_KEY,
      network: 'testnet',
    })) as any;

    expect(result.action).toBe('query');
    expect(result.transaction_xdr).toBeDefined();
    expect(result.recipient).toBe(TEST_ACCOUNT_PUBLIC_KEY);
  });

  it('builds a revoke XDR against a live testnet account', async () => {
    const result = (await soulboundToken({
      action: 'revoke',
      contract_id: CONTRACT_ID,
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      token_id: 'integration-test-token-001',
      network: 'testnet',
    })) as any;

    expect(result.action).toBe('revoke');
    expect(result.transaction_xdr).toBeDefined();
    expect(result.token_id).toBe('integration-test-token-001');
  });

  it('throws PulsarNetworkError for an unfunded source account', async () => {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const ghost = Keypair.random().publicKey();

    await expect(
      soulboundToken({
        action: 'mint',
        contract_id: CONTRACT_ID,
        source_account: ghost,
        recipient: TEST_ACCOUNT_PUBLIC_KEY,
        metadata: 'test',
        network: 'testnet',
      })
    ).rejects.toThrow('not found');
  });
});

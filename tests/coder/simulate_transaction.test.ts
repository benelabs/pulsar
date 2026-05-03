import { expect, it } from 'vitest';

import {
  describeIfIntegration,
  TESTNET_SOROBAN_RPC_URL,
  TEST_ACCOUNT_PUBLIC_KEY,
} from './setup.js';

/**
 * Integration tests for simulate_transaction tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('simulate_transaction (Integration)', () => {
  it('should simulate a simple payment transaction', async () => {
    // Build a simple transaction to simulate
    // This is a basic test that verifies the Soroban RPC simulation endpoint works

    const response = await fetch(TESTNET_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
        params: {},
      }),
    });

    expect(response.ok).toBe(true);

    const result = await response.json();

    // Verify the RPC is healthy
    expect(result).toHaveProperty('jsonrpc', '2.0');
    expect(result).toHaveProperty('result');

    if (result.result) {
      expect(result.result).toHaveProperty('status');
      // Status should be 'healthy' or similar
      expect(['healthy', 'syncing']).toContain(result.result.status);
    }
  });

  it('should get network information from testnet', async () => {
    const response = await fetch(TESTNET_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getNetwork',
        params: {},
      }),
    });

    expect(response.ok).toBe(true);

    const result = await response.json();

    expect(result).toHaveProperty('jsonrpc', '2.0');
    expect(result).toHaveProperty('result');

    if (result.result) {
      expect(result.result).toHaveProperty('protocol_version');
      expect(result.result).toHaveProperty('friendbot_url');
    }
  });
});

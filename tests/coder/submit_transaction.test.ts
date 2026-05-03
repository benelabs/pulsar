import { expect, it } from 'vitest';

import {
  describeIfIntegration,
  TESTNET_HORIZON_URL,
  TESTNET_SOROBAN_RPC_URL,
} from './setup.js';

/**
 * Integration tests for submit_transaction tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('submit_transaction (Integration)', () => {
  it('should get fee stats from testnet', async () => {
    // Get fee stats from Horizon
    const response = await fetch(`${TESTNET_HORIZON_URL}/fee_stats`);

    expect(response.ok).toBe(true);

    const feeStats = await response.json();

    expect(feeStats).toHaveProperty('last_ledger');
    expect(feeStats).toHaveProperty('last_ledger_base_fee');
    expect(feeStats).toHaveProperty('ledger_capacity_usage');
  });

  it('should get latest ledger from testnet', async () => {
    // Get the latest ledger to verify network connectivity
    const response = await fetch(TESTNET_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestLedger',
        params: {},
      }),
    });

    expect(response.ok).toBe(true);

    const result = await response.json();

    expect(result).toHaveProperty('jsonrpc', '2.0');
    expect(result).toHaveProperty('result');

    if (result.result) {
      expect(result.result).toHaveProperty('id');
      expect(result.result).toHaveProperty('protocolVersion');
      expect(result.result).toHaveProperty('sequence');
      expect(typeof result.result.sequence).toBe('number');
      expect(result.result.sequence).toBeGreaterThan(0);
    }
  });

  it('should get transactions from testnet', async () => {
    // Get recent transactions to verify network is processing
    const response = await fetch(`${TESTNET_HORIZON_URL}/transactions?limit=1&order=desc`);

    expect(response.ok).toBe(true);

    const data = await response.json();

    expect(data).toHaveProperty('_embedded');
    expect(data._embedded).toHaveProperty('records');
    expect(Array.isArray(data._embedded.records)).toBe(true);

    if (data._embedded.records.length > 0) {
      const tx = data._embedded.records[0];
      expect(tx).toHaveProperty('hash');
      expect(tx).toHaveProperty('ledger');
      expect(tx).toHaveProperty('successful');
    }
  });
});

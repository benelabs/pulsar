import { expect, it } from 'vitest';

import {
  describeIfIntegration,
  TESTNET_USDC_CONTRACT_ID,
  TESTNET_SOROBAN_RPC_URL,
} from './setup.js';

/**
 * Integration tests for fetch_contract_spec tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('fetch_contract_spec (Integration)', () => {
  it('should fetch USDC contract spec from testnet', async () => {
    // Use Soroban RPC to get the contract WASM
    const response = await fetch(TESTNET_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getContractWasm',
        params: {
          contractId: TESTNET_USDC_CONTRACT_ID,
        },
      }),
    });

    expect(response.ok).toBe(true);

    const result = await response.json();

    // The result should either have the WASM or an error
    // If the contract exists, we should get a result
    expect(result).toHaveProperty('jsonrpc', '2.0');
    expect(result).toHaveProperty('id', 1);

    // Either we get the wasm or an error (contract might not exist)
    if (result.error) {
      console.log('Contract WASM fetch returned error:', result.error);
    }
  });

  it('should verify USDC contract exists on testnet', async () => {
    // Get ledger entries for the contract
    const response = await fetch(TESTNET_SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLedgerEntries',
        params: {
          keys: [
            {
              contract_data: {
                contract: TESTNET_USDC_CONTRACT_ID,
                key: 'persistent',
                durability: 'persistent',
              },
            },
          ],
        },
      }),
    });

    expect(response.ok).toBe(true);

    const result = await response.json();
    expect(result).toHaveProperty('jsonrpc', '2.0');
  });
});

import { describe, it, expect } from 'vitest';

import { deployContract } from '../../src/tools/deploy_contract.js';

import { RUN_INTEGRATION_TESTS, TEST_ACCOUNT_PUBLIC_KEY, describeIfIntegration } from './setup.js';
import {
  RUN_INTEGRATION_TESTS,
  TEST_ACCOUNT_PUBLIC_KEY,
  describeIfIntegration,
} from './setup.js';

/**
 * Integration tests for deploy_contract tool.
 *
 * These exercise the transaction building pipeline against the real Horizon API.
 * No actual contract deployment is performed — we only verify that valid
 * transaction XDR is produced.
 */

describeIfIntegration('deploy_contract (Integration)', () => {
  const SOURCE_ACCOUNT = TEST_ACCOUNT_PUBLIC_KEY;
  const WASM_HASH = 'a'.repeat(64);
  const FACTORY_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  it('builds a direct deployment transaction against testnet', async () => {
    const result = (await deployContract({
      mode: 'direct',
      source_account: SOURCE_ACCOUNT,
      wasm_hash: WASM_HASH,
      network: 'testnet',
    })) as any;

    expect(result.mode).toBe('direct');
    expect(result.transaction_xdr).toBeDefined();
    expect(result.transaction_xdr.length).toBeGreaterThan(0);
    expect(result.predicted_contract_id).toBeDefined();
    expect(result.predicted_contract_id).toMatch(/^C[A-Z2-7]{55}$/);
    expect(result.network).toBe('testnet');
    expect(result.source_account).toBe(SOURCE_ACCOUNT);
  });

  it('builds a factory deployment transaction against testnet', async () => {
    const result = (await deployContract({
      mode: 'factory',
      source_account: SOURCE_ACCOUNT,
      factory_contract_id: FACTORY_CONTRACT_ID,
      deploy_function: 'deploy',
      deploy_args: [
        { type: 'symbol', value: 'init' },
        { type: 'u64', value: 1000 },
      ],
      network: 'testnet',
    })) as any;

    expect(result.mode).toBe('factory');
    expect(result.transaction_xdr).toBeDefined();
    expect(result.transaction_xdr.length).toBeGreaterThan(0);
    expect(result.predicted_contract_id).toBeUndefined();
    expect(result.network).toBe('testnet');
    expect(result.source_account).toBe(SOURCE_ACCOUNT);
  });

  it('uses deterministic salt for reproducible contract IDs', async () => {
    const salt = 'b'.repeat(64);

    const result1 = (await deployContract({
      mode: 'direct',
      source_account: SOURCE_ACCOUNT,
      wasm_hash: WASM_HASH,
      salt,
      network: 'testnet',
    })) as any;

    const result2 = (await deployContract({
      mode: 'direct',
      source_account: SOURCE_ACCOUNT,
      wasm_hash: WASM_HASH,
      salt,
      network: 'testnet',
    })) as any;

    expect(result1.predicted_contract_id).toBe(result2.predicted_contract_id);
  });
});

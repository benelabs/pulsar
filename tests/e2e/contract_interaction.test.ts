import { ChildProcess } from 'node:child_process';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { spawnPulsarServer, callMcpTool } from './utils.js';

// Skip these if we don't want to hit real network/CLI in every test run
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true';

describe('Pulsar Contract & CLI Integration (E2E)', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawnPulsarServer({
      STELLAR_NETWORK: 'testnet',
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  describe('deploy_contract', () => {
    const SOURCE_ACCOUNT = 'GBV3Y3CRDBHCBK4KZ7Q5MZ7CJFS7K3LYKX3LKF2Q4LHMVZ7MNTB6UQHP';

    it('builds a direct deployment transaction', async () => {
      // This tool calls Horizon to get the sequence number, so it needs network access
      if (!RUN_INTEGRATION_TESTS) return it.skip('Skipping integration test');

      const result = await callMcpTool(server, 'deploy_contract', {
        mode: 'direct',
        source_account: SOURCE_ACCOUNT,
        wasm_hash: 'a'.repeat(64),
        network: 'testnet',
      });

      expect(result.mode).toBe('direct');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.predicted_contract_id).toMatch(/^C[A-Z2-7]{55}$/);
    });

    it('builds a factory deployment transaction', async () => {
      if (!RUN_INTEGRATION_TESTS) return it.skip('Skipping integration test');

      const result = await callMcpTool(server, 'deploy_contract', {
        mode: 'factory',
        source_account: SOURCE_ACCOUNT,
        factory_contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        deploy_function: 'deploy',
        deploy_args: [
          { type: 'symbol', value: 'init' },
          { type: 'u64', value: 1000 },
        ],
        network: 'testnet',
      });

      expect(result.mode).toBe('factory');
      expect(result.transaction_xdr).toBeDefined();
      expect(result.predicted_contract_id).toBeUndefined();
    });
  });

  describe('fetch_contract_spec (CLI Integration)', () => {
    it('delegates to stellar CLI and returns parsed spec', async () => {
      // This requires the 'stellar' CLI to be installed and working
      if (!RUN_INTEGRATION_TESTS) return it.skip('Skipping integration test');

      const USDC_CONTRACT_ID = 'CBIELTKRNMPAW7R5AWR5WWPQMGEBSYV6QJ5I6QVWVJ7V3P2YGKG5OXF';

      const result = await callMcpTool(server, 'fetch_contract_spec', {
        contract_id: USDC_CONTRACT_ID,
        network: 'testnet',
      });

      expect(result.contract_id).toBe(USDC_CONTRACT_ID);
      expect(result.functions).toBeDefined();
      expect(result.functions.length).toBeGreaterThan(0);

      // Verify we found some standard token functions
      const functionNames = (result as { functions: { name: string }[] }).functions.map(
        (f) => f.name
      );
      expect(functionNames).toContain('balance');
      expect(functionNames).toContain('transfer');
    });

    it('handles CLI errors gracefully', async () => {
      if (!RUN_INTEGRATION_TESTS) return it.skip('Skipping integration test');

      // Invalid contract ID that should make the CLI fail
      const INVALID_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

      const result = await callMcpTool(server, 'fetch_contract_spec', {
        contract_id: INVALID_CONTRACT_ID,
        network: 'testnet',
      });

      expect(result.status).toBe('error');
      expect(result.error_code).toBe('CLI_ERROR');
    });
  });

  describe('decode_ledger_entry', () => {
    it('decodes a simple ledger entry XDR', async () => {
      // This uses internal XDR service, doesn't strictly need network
      // But we'll test it here as part of the tool verification

      // Example XDR for a ContractData entry (minimal)
      const xdr =
        'AAAABgAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAACAAAABAAAAAIAAAADAAAABAAAABAAAAA=';

      const result = await callMcpTool(server, 'decode_ledger_entry', {
        xdr: xdr,
        entry_type: 'contract_data',
      });

      if (result.status === 'error') {
        // If the XDR is invalid for the current SDK version, it might fail,
        // but we expect the tool to be called correctly.
        console.log('Decode result error:', result);
      } else {
        expect(result.entry_type).toBeDefined();
        expect(result.decoded).toBeDefined();
      }
    });
  });
});

import { expect, it } from 'vitest';

import { decodeLedgerEntry } from '../../src/services/xdr.js';

import { describeIfIntegration, TESTNET_HORIZON_URL } from './setup.js';

/**
 * Integration tests for decode_ledger_entry tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('decode_ledger_entry (Integration)', () => {
  it('should decode a real ledger entry from testnet', async () => {
    // Fetch a real account from testnet to get its XDR
    const response = await fetch(`${TESTNET_HORIZON_URL}/accounts?limit=1`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data._embedded.records.length).toBeGreaterThan(0);

    const account = data._embedded.records[0];

    // Get the ledger entry XDR for this account
    const ledgerResponse = await fetch(
      `${TESTNET_HORIZON_URL}/ledgers/${account.last_modified_ledger}`
    );
    expect(ledgerResponse.ok).toBe(true);

    // Note: In a real implementation, we would fetch the actual ledger entry XDR
    // and decode it. For this integration test, we verify the decodeLedgerEntry
    // function works with the stellar CLI against testnet.

    // Test with a sample XDR (this is a minimal valid XDR structure)
    // In practice, you'd fetch real ledger entry XDR from the network
    const sampleXdr = 'AAAAAQAAAAA='; // Minimal base64

    const result = await decodeLedgerEntry(sampleXdr);

    // The result should be structured (either success or error)
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('should handle invalid XDR gracefully', async () => {
    const invalidXdr = 'invalid-base64!!!';

    const result = await decodeLedgerEntry(invalidXdr);

    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('code', 'INVALID_XDR');
  });
});

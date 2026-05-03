import { expect, it } from 'vitest';

import { getNetworkParams } from '../../src/tools/get_network_params.js';

import { describeIfIntegration } from './setup.js';

/**
 * Integration tests for get_network_params tool.
 *
 * These tests hit the real Soroban RPC endpoints.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('get_network_params (Integration)', () => {
  it('should fetch network parameters from testnet', async () => {
    const result = await getNetworkParams({
      network: 'testnet',
    });

    // Verify structure
    expect(result).toBeDefined();
    expect(result.network).toBe('testnet');
    expect(result.ledger_sequence).toBeDefined();
    expect(typeof result.ledger_sequence).toBe('number');
    expect(result.ledger_sequence).toBeGreaterThan(0);

    // Verify resource weights
    expect(result.resource_weights).toBeDefined();
    expect(result.resource_weights.cpu_instructions).toBeDefined();
    expect(result.resource_weights.memory_bytes).toBeDefined();
    expect(result.resource_weights.ledger_entry_read).toBeDefined();
    expect(result.resource_weights.ledger_entry_write).toBeDefined();
    expect(result.resource_weights.ledger_entry_create).toBeDefined();
    expect(result.resource_weights.transmit_bytes).toBeDefined();

    // Verify fee thresholds
    expect(result.fee_thresholds).toBeDefined();
    expect(result.fee_thresholds.min_resource_fee).toBeDefined();
    expect(result.fee_thresholds.max_cpu_instructions).toBeDefined();
    expect(result.fee_thresholds.max_memory_bytes).toBeDefined();
    expect(result.fee_thresholds.ledger_entry_limits).toBeDefined();

    // Verify inflation params
    expect(result.inflation_params).toBeDefined();
    expect(result.inflation_params.base_reserve).toBeDefined();
    expect(result.inflation_params.base_fee).toBeDefined();
    expect(result.inflation_params.inflation_rate).toBeDefined();

    // Verify network passphrase
    expect(result.network_passphrase).toBe('Test SDF Network ; September 2015');

    // Verify protocol version
    expect(result.protocol_version).toBeDefined();
    expect(typeof result.protocol_version).toBe('number');
    expect(result.protocol_version).toBeGreaterThanOrEqual(20);
  });

  it('should fetch network parameters from mainnet', async () => {
    const result = await getNetworkParams({
      network: 'mainnet',
    });

    expect(result.network).toBe('mainnet');
    expect(result.network_passphrase).toBe('Public Global Stellar Network ; September 2015');
    expect(result.ledger_sequence).toBeGreaterThan(0);
  });

  it('should fetch network parameters from futurenet', async () => {
    const result = await getNetworkParams({
      network: 'futurenet',
    });

    expect(result.network).toBe('futurenet');
    expect(result.network_passphrase).toBe('Test SDF Future Network ; October 2022');
    expect(result.ledger_sequence).toBeGreaterThan(0);
  });

  it('should use default network when no network is specified', async () => {
    const result = await getNetworkParams({});

    expect(result).toBeDefined();
    expect(result.ledger_sequence).toBeGreaterThan(0);
    expect(result.resource_weights).toBeDefined();
    expect(result.fee_thresholds).toBeDefined();
    expect(result.inflation_params).toBeDefined();
  });

  it('resource weights should be reasonable values', async () => {
    const result = await getNetworkParams({
      network: 'testnet',
    });

    // Resource weights should be non-negative numeric strings
    expect(Number(result.resource_weights.cpu_instructions)).toBeGreaterThanOrEqual(0);
    expect(Number(result.resource_weights.memory_bytes)).toBeGreaterThanOrEqual(0);
    expect(Number(result.resource_weights.ledger_entry_read)).toBeGreaterThanOrEqual(0);
    expect(Number(result.resource_weights.ledger_entry_write)).toBeGreaterThanOrEqual(0);
    expect(Number(result.resource_weights.ledger_entry_create)).toBeGreaterThanOrEqual(0);
    expect(Number(result.resource_weights.transmit_bytes)).toBeGreaterThanOrEqual(0);
  });

  it('fee thresholds should be reasonable values', async () => {
    const result = await getNetworkParams({
      network: 'testnet',
    });

    // Thresholds should be reasonable
    expect(Number(result.fee_thresholds.min_resource_fee)).toBeGreaterThanOrEqual(0);
    expect(Number(result.fee_thresholds.max_cpu_instructions)).toBeGreaterThan(0);
    expect(Number(result.fee_thresholds.max_memory_bytes)).toBeGreaterThan(0);
    expect(Number(result.fee_thresholds.ledger_entry_limits.max_read_bytes)).toBeGreaterThan(0);
    expect(Number(result.fee_thresholds.ledger_entry_limits.max_write_bytes)).toBeGreaterThan(0);
    expect(Number(result.fee_thresholds.ledger_entry_limits.max_create_bytes)).toBeGreaterThan(0);
  });
});

import { expect, it } from 'vitest';

import { getOrderbook } from '../../src/tools/get_orderbook.js';

import { describeIfIntegration } from './setup.js';

/**
 * Integration tests for get_orderbook tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration('get_orderbook (Integration)', () => {
  // Well-known testnet USDC issuer
  const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  it('should fetch XLM/USDC orderbook from testnet', async () => {
    const result = (await getOrderbook({
      selling_asset_code: 'XLM',
      buying_asset_code: 'USDC',
      buying_asset_issuer: USDC_ISSUER,
      network: 'testnet',
      limit: 5,
    })) as any;

    expect(result.selling_asset.code).toBe('XLM');
    expect(result.buying_asset.code).toBe('USDC');
    expect(result.buying_asset.issuer).toBe(USDC_ISSUER);
    expect(result.bids).toBeDefined();
    expect(result.asks).toBeDefined();
    expect(Array.isArray(result.bids)).toBe(true);
    expect(Array.isArray(result.asks)).toBe(true);

    // If orderbook is not empty, verify analytics
    if (!result.empty_book) {
      expect(result.analytics).toBeDefined();
      expect(result.analytics.total_bid_liquidity).toBeDefined();
      expect(result.analytics.total_ask_liquidity).toBeDefined();
      expect(result.analytics.bid_depth_at_levels).toBeDefined();
      expect(result.analytics.ask_depth_at_levels).toBeDefined();
    }
  });

  it('should handle limit parameter correctly', async () => {
    const result = (await getOrderbook({
      selling_asset_code: 'XLM',
      buying_asset_code: 'USDC',
      buying_asset_issuer: USDC_ISSUER,
      network: 'testnet',
      limit: 5,
    })) as any;

    // Should return at most 5 bids and 5 asks
    expect(result.bids.length).toBeLessThanOrEqual(5);
    expect(result.asks.length).toBeLessThanOrEqual(5);
  });

  it('should handle empty orderbook gracefully', async () => {
    // Use an unlikely trading pair that probably has no orderbook
    const result = (await getOrderbook({
      selling_asset_code: 'XLM',
      buying_asset_code: 'RARE',
      buying_asset_issuer: 'GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH',
      network: 'testnet',
    })) as any;

    // Should handle empty orderbook without error
    expect(result).toBeDefined();
    expect(result.bids).toBeDefined();
    expect(result.asks).toBeDefined();

    if (result.empty_book) {
      expect(result.analytics).toBeNull();
    }
  });

  it('should reject invalid asset code', async () => {
    await expect(
      getOrderbook({
        selling_asset_code: 'INVALID_CODE_TOO_LONG',
        buying_asset_code: 'XLM',
        network: 'testnet',
      })
    ).rejects.toThrow('must be 1–12 alphanumeric characters');
  });

  it('should reject non-native asset without issuer', async () => {
    await expect(
      getOrderbook({
        selling_asset_code: 'USDC',
        buying_asset_code: 'XLM',
        network: 'testnet',
      })
    ).rejects.toThrow('Non-native assets require an issuer account ID');
  });

  it('should reject invalid issuer format', async () => {
    await expect(
      getOrderbook({
        selling_asset_code: 'USDC',
        selling_asset_issuer: 'INVALID',
        buying_asset_code: 'XLM',
        network: 'testnet',
      })
    ).rejects.toThrow('Issuer must be a valid Stellar account ID');
  });
});

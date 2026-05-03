import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// We may need to de-duplicate if other tests also mock fetch, but isolate this file.

import { getLiquidityPool, GetLiquidityPoolInputSchema } from '../../src/tools/get_liquidity_pool.js';

describe('getLiquidityPool', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('validates input schema', async () => {
    // @ts-ignore - intentionally missing required field
    await expect(getLiquidityPool({})).rejects.toThrow('Invalid input for get_liquidity_pool');
  });

  it('fetches and returns pool data with snake_case fields', async () => {
    const mockResponse = {
      id: 'POOL_ABC123',
      fee_bp: 30,
      type: 'constant_product',
      reserves: [
        { asset: 'XLM', amount: '1000.1234567' },
        { asset: 'USDC:GA...', amount: '500.0000000' }
      ],
      total_shares: '2000.1234567'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await getLiquidityPool({
      liquidity_pool_id: 'POOL_ABC123',
      network: 'testnet'
    });

    expect(result).toMatchObject({
      liquidity_pool_id: 'POOL_ABC123',
      fee_bp: 30,
      type: 'constant_product',
      reserves: mockResponse.reserves,
      total_shares: '2000.1234567',
      network: 'testnet'
    });
  });

  it('normalizes camelCase field names from Horizon', async () => {
    const mockResponse = {
      id: 'POOL_XYZ',
      feeBp: 25,
      type: 'constant_product',
      reserves: [{ asset: 'XLM', amount: '100' }],
      totalShares: '1500'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await getLiquidityPool({ liquidity_pool_id: 'POOL_XYZ' });

    expect(result.fee_bp).toBe(25);
    expect(result.total_shares).toBe('1500');
  });

  it('handles 404 pool not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found'
    });

    await expect(getLiquidityPool({ liquidity_pool_id: 'FAKE_POOL' }))
      .rejects.toThrow('Liquidity pool not found');
  });

  it('handles other non-ok responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });

    await expect(getLiquidityPool({ liquidity_pool_id: 'POOL' }))
      .rejects.toThrow('Horizon API error 500');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(getLiquidityPool({ liquidity_pool_id: 'POOL' }))
      .rejects.toThrow('Failed to fetch liquidity pool data');
  });

  it('uses default network from config when not provided', async () => {
    // No network param; falls back to config.stellarNetwork (testnet default)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'P', fee_bp: 0, type: '', reserves: [], total_shares: '0' })
    });

    await getLiquidityPool({ liquidity_pool_id: 'P' });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('horizon-testnet.stellar.org');
  });
});

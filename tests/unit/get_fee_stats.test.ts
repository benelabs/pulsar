import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { getFeeStats, GetFeeStatsInputSchema } from '../../src/tools/get_fee_stats.js';

describe('getFeeStats', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('validates input schema', async () => {
    // @ts-ignore - invalid input
    await expect(getFeeStats({ unknown: 1 })).rejects.toThrow('Invalid input for get_fee_stats');
  });

  it('returns fee stats with recommended fee based on p50', async () => {
    const mockStats = {
      min_accepted_fee: '100',
      max_accepted_fee: '10000',
      avg_accepted_fee: '5000',
      p_10: '1000',
      p_20: '1500',
      p_30: '2000',
      p_40: '2500',
      p_50: '3000',
      p_60: '3500',
      p_70: '4000',
      p_80: '4500',
      p_90: '5000',
      p_95: '6000',
      p_99: '8000',
      last_ledger: '12345',
      last_ledger_base_fee: '100',
      ledger_capacity_usage: 0.75
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats
    });

    const result = await getFeeStats({ network: 'testnet' });

    expect(result).toMatchObject({
      ...mockStats,
      recommended_fee_stroops: '3000', // p50
      network: 'testnet'
    });
  });

  it('falls back to avg_accepted_fee when p50 is missing', async () => {
    const mockStats = {
      min_accepted_fee: '100',
      max_accepted_fee: '10000',
      avg_accepted_fee: '4500',
      p_10: '1000',
      p_20: '1500',
      p_30: '2000',
      p_40: '2500',
      // p_50 missing
      p_60: '3500',
      p_70: '4000',
      p_80: '4500',
      p_90: '5000',
      p_95: '6000',
      p_99: '8000',
      last_ledger: '12345',
      last_ledger_base_fee: '100',
      ledger_capacity_usage: 0.7
    };

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockStats });

    const result = await getFeeStats({});

    expect(result.recommended_fee_stroops).toBe('4500');
  });

  it('falls back to min_accepted_fee when both p50 and avg are missing', async () => {
    const mockStats = {
      min_accepted_fee: '200',
      max_accepted_fee: '10000'
      // no avg, no p_50
    };

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockStats });

    const result = await getFeeStats({});

    expect(result.recommended_fee_stroops).toBe('200');
  });

  it('handles non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error'
    });

    await expect(getFeeStats({})).rejects.toThrow('Horizon fee_stats error 500');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

    await expect(getFeeStats({})).rejects.toThrow('Failed to fetch fee stats');
  });

  it('uses default network from config when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        min_accepted_fee: '0',
        max_accepted_fee: '0',
        avg_accepted_fee: '0',
        ledger_capacity_usage: 0,
        last_ledger: '0',
        last_ledger_base_fee: '0'
      })
    });

    await getFeeStats({});

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('horizon-testnet.stellar.org');
  });

  it('uses network override when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        min_accepted_fee: '0',
        max_accepted_fee: '0',
        avg_accepted_fee: '0',
        ledger_capacity_usage: 0,
        last_ledger: '0',
        last_ledger_base_fee: '0'
      })
    });

    await getFeeStats({ network: 'mainnet' });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('horizon.stellar.org');
  });
});

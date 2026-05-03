import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

import { searchAssets } from '../../src/tools/search_assets.js';
import { getHorizonServer } from '../../src/services/horizon.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

const originalFetch = globalThis.fetch;

describe('searchAssets', () => {
  let mockServer: any;
  let mockAssetsBuilder: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAssetsBuilder = {
      forCode: vi.fn().mockReturnThis(),
      forIssuer: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn(),
    };

    mockServer = {
      assets: vi.fn().mockReturnValue(mockAssetsBuilder),
    };

    vi.mocked(getHorizonServer).mockReturnValue(mockServer);

    globalThis.fetch = vi.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches from stellar.expert when min_reputation_score is provided', async () => {
    const mockStellarExpertResponse = {
      _embedded: {
        records: [
          {
            asset: 'USDC-GABC...',
            supply: '1000',
            rating: { average: 9 },
            domain: 'circle.com',
          },
          {
            asset: 'TEST-GDEF...',
            supply: '500',
            rating: { average: 4 },
            domain: 'test.com',
          },
        ],
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockStellarExpertResponse,
    });

    const result = (await searchAssets({
      min_reputation_score: 5,
    })) as any;

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].asset_code).toBe('USDC');
    expect(result.assets[0].reputation_score).toBe(9);
  });

  it('fetches from horizon when no reputation score or code is needed', async () => {
    mockAssetsBuilder.call.mockResolvedValue({
      records: [
        {
          asset_code: 'USDC',
          asset_issuer: 'GABC...',
          asset_type: 'credit_alphanum4',
          amount: '1000',
          num_accounts: 10,
          toml_link: 'https://circle.com/.well-known/stellar.toml',
        },
      ],
    });

    const result = (await searchAssets({
      asset_issuer: 'GABC...',
    })) as any;

    expect(mockAssetsBuilder.forIssuer).toHaveBeenCalledWith('GABC...');
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].asset_code).toBe('USDC');
    expect(result.assets[0].domain).toBe('circle.com');
  });

  it('filters by issuer using stellar.expert when asset_code is provided', async () => {
    const mockStellarExpertResponse = {
      _embedded: {
        records: [
          {
            asset: 'USDC-GABC...',
            supply: '1000',
            rating: { average: 9 },
          },
          {
            asset: 'USDC-GDEF...',
            supply: '500',
            rating: { average: 8 },
          },
        ],
      },
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockStellarExpertResponse,
    });

    const result = (await searchAssets({
      asset_code: 'USDC',
      asset_issuer: 'GABC...',
    })) as any;

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].asset_issuer).toBe('GABC...');
  });
});

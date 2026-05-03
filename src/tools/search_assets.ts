import { config } from '../config.js';
import { SearchAssetsInputSchema } from '../schemas/tools.js';
import { getHorizonServer } from '../services/horizon.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export interface AssetSearchResult {
  asset_code: string;
  asset_issuer: string;
  asset_type: string;
  reputation_score?: number;
  amount?: string;
  num_accounts?: number;
  domain?: string;
}

/**
 * Tool: search_assets
 * Searches for Stellar assets by code, issuer, or reputation score.
 * Falls back to Horizon if stellar.expert is not needed or fails.
 */
export const searchAssets: McpToolHandler<typeof SearchAssetsInputSchema> = async (
  input: unknown
) => {
  const validatedInput = SearchAssetsInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for search_assets',
      validatedInput.error.format()
    );
  }

  const { asset_code, asset_issuer, min_reputation_score, network } = validatedInput.data;
  const activeNetwork = network ?? config.stellarNetwork;

  try {
    let results: AssetSearchResult[] = [];

    // If min_reputation_score is provided or we just want to search via stellar.expert
    // stellar.expert is preferred for general search as it includes reputation and better indexing.
    const useStellarExpert = min_reputation_score !== undefined || asset_code !== undefined;

    if (useStellarExpert && (activeNetwork === 'mainnet' || activeNetwork === 'testnet')) {
      const stellarExpertNetwork = activeNetwork === 'mainnet' ? 'public' : 'testnet';
      const url = new URL(`https://api.stellar.expert/explorer/${stellarExpertNetwork}/asset`);
      if (asset_code) {
        url.searchParams.append('search', asset_code);
      }
      url.searchParams.append('limit', '50');

      const response = await fetch(url.toString());
      if (response.ok) {
        const data = (await response.json()) as any;
        let records = data._embedded?.records || [];

        if (asset_issuer) {
          records = records.filter((r: any) => r.asset.includes(asset_issuer));
        }

        if (min_reputation_score !== undefined) {
          // Note: stellar.expert average rating is typically out of 10.
          // We normalize checking here.
          records = records.filter((r: any) => (r.rating?.average || 0) >= min_reputation_score);
        }

        results = records.map((r: any) => {
          const parts = r.asset.split('-');
          const code = parts[0];
          const issuer = parts[1] || 'native';
          const assetType =
            issuer === 'native'
              ? 'native'
              : code.length > 4
                ? 'credit_alphanum12'
                : 'credit_alphanum4';

          return {
            asset_code: code,
            asset_issuer: issuer,
            asset_type: assetType,
            reputation_score: r.rating?.average || 0,
            amount: r.supply,
            domain: r.domain,
          };
        });

        return { assets: results };
      }
    }

    // Fallback or purely Horizon path
    const server = getHorizonServer(activeNetwork);
    let builder = server.assets();
    if (asset_code) {
      builder = builder.forCode(asset_code);
    }
    if (asset_issuer) {
      builder = builder.forIssuer(asset_issuer);
    }

    const response = await builder.limit(50).call();

    let horizonResults: AssetSearchResult[] = response.records.map((r: any) => ({
      asset_code: r.asset_code,
      asset_issuer: r.asset_issuer,
      asset_type: r.asset_type,
      amount: r.amount,
      num_accounts: r.num_accounts,
      domain: r.toml_link ? new URL(r.toml_link).hostname : undefined,
    }));

    if (min_reputation_score !== undefined) {
      // Horizon has no reputation scores, so we can't fulfill this requirement
      horizonResults = [];
    }

    return { assets: horizonResults };
  } catch (err: any) {
    throw new PulsarNetworkError(err.message || 'Failed to search assets', { originalError: err });
  }
};

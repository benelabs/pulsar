import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '../../src/config.js';
import { getHorizonServer } from '../../src/services/horizon.js';
import { getAccountBalances } from '../../src/tools/get_account_balances.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

describe('getAccountBalances', () => {
  let mockServer: {
    loadAccount: ReturnType<typeof vi.fn>;
  };

  const ACCOUNT_A = 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';
  const ACCOUNT_B = 'GBH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';
  const ACCOUNT_C = 'GCH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';
  const ISSUER_ID = 'GAZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer as never);
  });

  it('returns batch results and summary metadata', async () => {
    mockServer.loadAccount.mockImplementation(async (accountId: string) => ({
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: accountId === ACCOUNT_A ? 'USDC' : 'BRL',
          asset_issuer: ISSUER_ID,
          balance: '25.0000000',
        },
      ],
    }));

    const result = (await getAccountBalances({
      account_ids: [ACCOUNT_A, ACCOUNT_B],
      asset_code: 'USDC',
      max_concurrency: 2,
    })) as any;

    expect(result.network).toBe(config.stellarNetwork);
    expect(result.requested).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.max_concurrency).toBe(2);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.results).toEqual([
      {
        status: 'success',
        account_id: ACCOUNT_A,
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            asset_issuer: ISSUER_ID,
            balance: '25.0000000',
          },
        ],
      },
      {
        status: 'success',
        account_id: ACCOUNT_B,
        balances: [],
      },
    ]);
  });

  it('returns per-account errors without failing the whole batch', async () => {
    mockServer.loadAccount.mockImplementation(async (accountId: string) => {
      if (accountId === ACCOUNT_B) {
        const error = new Error('Not Found');
        (error as Error & { response?: { status: number } }).response = {
          status: 404,
        };
        throw error;
      }

      return {
        balances: [{ asset_type: 'native', balance: '50.0000000' }],
      };
    });

    const result = (await getAccountBalances({
      account_ids: [ACCOUNT_A, ACCOUNT_B],
      network: 'testnet',
      max_concurrency: 2,
    })) as any;

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      status: 'success',
      account_id: ACCOUNT_A,
      balances: [{ asset_type: 'native', balance: '50.0000000' }],
    });
    expect(result.results[1]).toEqual({
      account_id: ACCOUNT_B,
      status: 'error',
      error_code: 'NETWORK_ERROR',
      message: 'Account not found - it may not be funded yet',
      details: {
        status: 404,
        account_id: ACCOUNT_B,
      },
    });
  });

  it('enforces validation before any Horizon requests run', async () => {
    await expect(
      getAccountBalances({
        account_ids: [ACCOUNT_A, ACCOUNT_A],
        network: 'testnet',
        max_concurrency: 2,
      })
    ).rejects.toMatchObject({
      name: 'PulsarValidationError',
      message: 'Invalid input for get_account_balances',
    });

    expect(mockServer.loadAccount).not.toHaveBeenCalled();
  });

  it('runs requests concurrently up to the configured limit and preserves order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    mockServer.loadAccount.mockImplementation(
      (accountId: string) =>
        new Promise((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);

          const delay = accountId === ACCOUNT_A ? 40 : accountId === ACCOUNT_B ? 30 : 10;

          setTimeout(() => {
            inFlight -= 1;
            resolve({
              balances: [
                {
                  asset_type: 'native',
                  balance: `1${delay}.0000000`,
                },
              ],
            });
          }, delay);
        })
    );

    const result = (await getAccountBalances({
      account_ids: [ACCOUNT_A, ACCOUNT_B, ACCOUNT_C],
      network: 'testnet',
      max_concurrency: 2,
    })) as any;

    expect(maxInFlight).toBe(2);
    expect(result.results.map((entry: any) => entry.account_id)).toEqual([
      ACCOUNT_A,
      ACCOUNT_B,
      ACCOUNT_C,
    ]);
  });
});

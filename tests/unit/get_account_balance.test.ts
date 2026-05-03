import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getAccountBalance } from '../../src/tools/get_account_balance.js';
import { getHorizonServer } from '../../src/services/horizon.js';
import { getAccountBalance, accountBalanceCache } from "../../src/tools/get_account_balance.js";
import { getHorizonServer } from "../../src/services/horizon.js";

// Mock the services
vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

describe('getAccountBalance', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    accountBalanceCache.clear();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  const ACCOUNT_ID = 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';

  it('returns balances for a funded account', async () => {
    const mockAccount = {
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GABC...',
          balance: '50.00',
        { asset_type: "native", balance: "100.0000000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "USDC",
          asset_issuer: "GABC...",
          balance: "50.00"
        },
      ],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const result = (await getAccountBalance({ account_id: ACCOUNT_ID })) as any;

    expect(result.account_id).toBe(ACCOUNT_ID);
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].asset_type).toBe('native');
    expect(result.balances[0].balance).toBe('100.0000000');
    expect(result.balances[1].asset_code).toBe('USDC');
  });

  it('filters by asset_code', async () => {
    const mockAccount = {
      balances: [
        { asset_type: 'native', balance: '100.00' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'G...',
          balance: '50.00',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'BRL',
          asset_issuer: 'G...',
          balance: '20.00',
        },
      ],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const result = (await getAccountBalance({
      account_id: ACCOUNT_ID,
      asset_code: 'USDC',
    })) as any;

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].asset_code).toBe('USDC');
  });

  const ISSUER_ID = 'GBH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';

  it('filters by asset_issuer', async () => {
    const mockAccount = {
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ISSUER_ID,
          balance: '50.00',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: ACCOUNT_ID,
          balance: '20.00',
        },
      ],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const result = (await getAccountBalance({
      account_id: ACCOUNT_ID,
      asset_issuer: ISSUER_ID,
    })) as any;

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].asset_issuer).toBe(ISSUER_ID);
  });

  it('handles 404 account not found error', async () => {
    const error = new Error('Not Found');
    (error as any).response = { status: 404 };
    mockServer.loadAccount.mockRejectedValue(error);

    await expect(getAccountBalance({ account_id: ACCOUNT_ID })).rejects.toThrow(
      'Account not found — it may not be funded yet'
    );
    await expect(getAccountBalance({ account_id: ACCOUNT_ID }))
      .rejects.toThrow("Account not found — it may not be funded yet");

    try {
      await getAccountBalance({ account_id: ACCOUNT_ID });
    } catch (e: any) {
      expect(e.name).toBe('PulsarNetworkError');
      expect(e.details.status).toBe(404);
      expect(e.details.account_id).toBe(ACCOUNT_ID);
    }
  });

  it('throws other network errors', async () => {
    const error = new Error('Gateway Timeout');
    (error as any).response = { status: 504 };
    mockServer.loadAccount.mockRejectedValue(error);

    await expect(getAccountBalance({ account_id: ACCOUNT_ID })).rejects.toThrow('Gateway Timeout');
  });

  it("normalizes account_id before lookup (trims whitespace, uppercases)", async () => {
    mockServer.loadAccount.mockResolvedValue({ balances: [] });

    const result = (await getAccountBalance({ account_id: `  ${ACCOUNT_ID.toLowerCase()}  ` })) as any;
    expect(result.account_id).toBe(ACCOUNT_ID);
    expect(mockServer.loadAccount).toHaveBeenCalledWith(ACCOUNT_ID);
  });

  it("returns cached result on second call without hitting network", async () => {
    mockServer.loadAccount.mockResolvedValue({
      balances: [{ asset_type: "native", balance: "42.0" }],
    });

    await getAccountBalance({ account_id: ACCOUNT_ID });
    await getAccountBalance({ account_id: ACCOUNT_ID });

    expect(mockServer.loadAccount).toHaveBeenCalledTimes(1);
  });

  it("caches results independently per network", async () => {
    mockServer.loadAccount.mockResolvedValue({ balances: [] });

    await getAccountBalance({ account_id: ACCOUNT_ID, network: "testnet" });
    await getAccountBalance({ account_id: ACCOUNT_ID, network: "mainnet" });

    expect(mockServer.loadAccount).toHaveBeenCalledTimes(2);
  });
});

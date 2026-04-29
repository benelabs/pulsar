import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getHorizonServer } from '../../src/services/horizon.js';
import { getAccountBalance } from '../../src/tools/get_account_balance.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

describe('getAccountBalance', () => {
  let mockServer: any;

  const ACCOUNT_ID = 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';
  const ISSUER_ID = 'GBH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  it('returns balances for a funded account', async () => {
    mockServer.loadAccount.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GABC...',
          balance: '50.00',
        },
      ],
    });

    const result = (await getAccountBalance({ account_id: ACCOUNT_ID })) as any;

    expect(result.account_id).toBe(ACCOUNT_ID);
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].asset_type).toBe('native');
    expect(result.balances[0].balance).toBe('100.0000000');
    expect(result.balances[1].asset_code).toBe('USDC');
  });

  it('rejects invalid input before loading Horizon data', async () => {
    await expect(getAccountBalance({ account_id: 'INVALID_KEY' } as any)).rejects.toMatchObject({
      name: 'PulsarValidationError',
      message: 'Invalid input for get_account_balance',
    });

    expect(mockServer.loadAccount).not.toHaveBeenCalled();
  });

  it('filters by asset_code', async () => {
    mockServer.loadAccount.mockResolvedValue({
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
    });

    const result = (await getAccountBalance({
      account_id: ACCOUNT_ID,
      asset_code: 'USDC',
    })) as any;

    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].asset_code).toBe('USDC');
  });

  it('filters by asset_issuer', async () => {
    mockServer.loadAccount.mockResolvedValue({
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
    });

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
      'Account not found - it may not be funded yet'
    );

    try {
      await getAccountBalance({ account_id: ACCOUNT_ID });
    } catch (caughtError: any) {
      expect(caughtError.name).toBe('PulsarNetworkError');
      expect(caughtError.details.status).toBe(404);
      expect(caughtError.details.account_id).toBe(ACCOUNT_ID);
    }
  });

  it('throws other network errors with account diagnostics', async () => {
    const error = new Error('Gateway Timeout');
    (error as any).response = { status: 504 };
    mockServer.loadAccount.mockRejectedValue(error);

    await expect(getAccountBalance({ account_id: ACCOUNT_ID })).rejects.toThrow('Gateway Timeout');

    try {
      await getAccountBalance({ account_id: ACCOUNT_ID });
    } catch (caughtError: any) {
      expect(caughtError.details.account_id).toBe(ACCOUNT_ID);
    }
  });

  it('falls back to a default error message when Horizon omits one', async () => {
    mockServer.loadAccount.mockRejectedValue({});

    await expect(getAccountBalance({ account_id: ACCOUNT_ID })).rejects.toThrow(
      'Failed to load account balance'
    );
  });
});

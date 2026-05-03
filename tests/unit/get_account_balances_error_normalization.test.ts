import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getHorizonServer } from '../../src/services/horizon.js';
import { loadAccountBalance } from '../../src/tools/get_account_balance.js';
import { getAccountBalances } from '../../src/tools/get_account_balances.js';

vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

vi.mock('../../src/tools/get_account_balance.js', () => ({
  loadAccountBalance: vi.fn(),
}));

describe('getAccountBalances error normalization', () => {
  const ACCOUNT_ID = 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getHorizonServer).mockReturnValue({} as never);
  });

  it('normalizes unexpected thrown values into structured network errors', async () => {
    vi.mocked(loadAccountBalance).mockRejectedValue('boom');

    const result = (await getAccountBalances({
      account_ids: [ACCOUNT_ID],
      network: 'testnet',
      max_concurrency: 1,
    })) as any;

    expect(result.failed).toBe(1);
    expect(result.results[0]).toEqual({
      account_id: ACCOUNT_ID,
      status: 'error',
      error_code: 'NETWORK_ERROR',
      message: 'Failed to load account balance',
      details: {
        account_id: ACCOUNT_ID,
        originalError: 'boom',
      },
    });
  });

  it('preserves explicit Error messages when normalizing unexpected failures', async () => {
    vi.mocked(loadAccountBalance).mockRejectedValue(new Error('boom'));

    const result = (await getAccountBalances({
      account_ids: [ACCOUNT_ID],
      network: 'testnet',
      max_concurrency: 1,
    })) as any;

    expect(result.results[0]).toMatchObject({
      account_id: ACCOUNT_ID,
      status: 'error',
      error_code: 'NETWORK_ERROR',
      message: 'boom',
    });
  });
});

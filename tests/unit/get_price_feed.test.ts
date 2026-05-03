import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getPriceFeed } from '../../src/tools/get_price_feed.js';
import { getHorizonServer } from '../../src/services/horizon.js';
import { simulateSorobanTransaction } from '../../src/services/soroban-rpc.js';

// Mock the services
vi.mock('../../src/services/horizon.js', () => ({
  getHorizonServer: vi.fn(),
}));

vi.mock('../../src/services/soroban-rpc.js', () => ({
  simulateSorobanTransaction: vi.fn(),
}));

describe('getPriceFeed', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockHorizonServer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSimulate: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHorizonServer = {
      loadAccount: vi.fn(),
    };
    mockSimulate = vi.fn();
    vi.mocked(getHorizonServer).mockReturnValue(mockHorizonServer);
    vi.mocked(simulateSorobanTransaction).mockImplementation(mockSimulate);
  });

  const CONTRACT_ID = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

  it('returns price for a valid oracle query', async () => {
    const mockAccount = {
      sequence: '123',
    };

    mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

    // Mock successful simulation with price return value
    mockSimulate.mockResolvedValue({
      status: 'success',
      return_value: {
        // Mock ScVal for i128 price
        switch: 10, // i128 type
        value: [0, 1000000], // BigInt(1000000) as [lo, hi]
      },
    });

    const result = await getPriceFeed({
      contract_id: CONTRACT_ID,
      base_asset: 'USD',
      quote_asset: 'XLM',
    });

    expect(result.contract_id).toBe(CONTRACT_ID);
    expect(result.base_asset).toBe('USD');
    expect(result.quote_asset).toBe('XLM');
    expect(result.price).toBe('1000000');
    expect(result.network).toBe('testnet');
  });

  it('throws error on simulation failure', async () => {
    const mockAccount = {
      sequence: '123',
    };

    mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

    mockSimulate.mockResolvedValue({
      status: 'error',
      error: 'Contract panic',
    });

    await expect(
      getPriceFeed({
        contract_id: CONTRACT_ID,
        base_asset: 'USD',
        quote_asset: 'XLM',
      })
    ).rejects.toThrow('Simulation failed: Contract panic');
  });

  it('throws error when no return value', async () => {
    const mockAccount = {
      sequence: '123',
    };

    mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

    mockSimulate.mockResolvedValue({
      status: 'success',
      return_value: undefined,
    });

    await expect(
      getPriceFeed({
        contract_id: CONTRACT_ID,
        base_asset: 'USD',
        quote_asset: 'XLM',
      })
    ).rejects.toThrow('No return value from contract simulation');
  });

  it('throws error on invalid return type', async () => {
    const mockAccount = {
      sequence: '123',
    };

    mockHorizonServer.loadAccount.mockResolvedValue(mockAccount);

    mockSimulate.mockResolvedValue({
      status: 'success',
      return_value: {
        // Mock ScVal for string instead of i128
        switch: 3, // string type
        value: 'not a number',
      },
    });

    await expect(
      getPriceFeed({
        contract_id: CONTRACT_ID,
        base_asset: 'USD',
        quote_asset: 'XLM',
      })
    ).rejects.toThrow('Failed to parse price from contract return value');
  });
});

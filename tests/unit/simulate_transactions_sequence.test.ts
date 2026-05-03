import { describe, it, expect, vi, beforeEach } from 'vitest';

import { simulateTransactionsSequence } from '../../src/tools/simulate_transactions_sequence.js';
import { simulateTransaction } from '../../src/tools/simulate_transaction.js';

// Mock the simulateTransaction tool
vi.mock('../../src/tools/simulate_transaction.js', () => ({
  simulateTransaction: vi.fn(),
}));

const DUMMY_XDR_1 =
  'AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9AAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const DUMMY_XDR_2 =
  'AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9AAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

describe('simulateTransactionsSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles a successful sequence of simulations', async () => {
    const mockSuccessResult = {
      status: 'SUCCESS',
      cost: { cpu_instructions: '100', memory_bytes: '200' },
      footprint: { read_only: [], read_write: [] },
      min_resource_fee: '50',
      events: [],
    };

    vi.mocked(simulateTransaction).mockResolvedValue(mockSuccessResult);

    const result = await simulateTransactionsSequence({
      xdrs: [DUMMY_XDR_1, DUMMY_XDR_2],
    });

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('SUCCESS');
    expect(result[1].status).toBe('SUCCESS');
    expect(simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('handles mixed success and error in sequence', async () => {
    const mockSuccessResult = {
      status: 'SUCCESS',
      cost: { cpu_instructions: '100', memory_bytes: '200' },
      footprint: { read_only: [], read_write: [] },
      min_resource_fee: '50',
      events: [],
    };

    const mockErrorResult = {
      status: 'ERROR',
      cost: { cpu_instructions: '0', memory_bytes: '0' },
      footprint: { read_only: [], read_write: [] },
      min_resource_fee: '0',
      events: [],
      error: 'Contract panicked',
    };

    vi.mocked(simulateTransaction)
      .mockResolvedValueOnce(mockSuccessResult)
      .mockResolvedValueOnce(mockErrorResult);

    const result = await simulateTransactionsSequence({
      xdrs: [DUMMY_XDR_1, DUMMY_XDR_2],
    });

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('SUCCESS');
    expect(result[1].status).toBe('ERROR');
    expect(result[1].error).toBe('Contract panicked');
  });

  it('handles thrown errors during simulation and wraps them', async () => {
    vi.mocked(simulateTransaction).mockRejectedValueOnce(new Error('Failed to parse XDR'));

    const result = await simulateTransactionsSequence({
      xdrs: ['invalid-xdr'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ERROR');
    expect(result[0].error).toBe('Failed to parse XDR');
  });

  it('returns an empty array if empty sequence is provided', async () => {
    const result = await simulateTransactionsSequence({
      xdrs: [],
    });

    expect(result).toHaveLength(0);
    expect(simulateTransaction).not.toHaveBeenCalled();
  });

  it('handles non-Error objects thrown during simulation', async () => {
    vi.mocked(simulateTransaction).mockRejectedValueOnce('String Error');

    const result = await simulateTransactionsSequence({
      xdrs: ['invalid-xdr'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ERROR');
    expect(result[0].error).toBe('String Error');
  });
});

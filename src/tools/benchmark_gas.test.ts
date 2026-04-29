import { describe, it, expect, vi } from 'vitest';

import { benchmarkGas } from './benchmark_gas.js';

describe('benchmarkGas', () => {
  it('should return cpu, memory, and pulsarGas fields', async () => {
    const fakeSim = { gas: 123, result: 'ok' };
    vi.mock('./simulate_transaction', () => ({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
      contractId: 'abc',
      method: 'foo',
      args: [1, 2],
      account: 'testacc',
    });
    expect(res.cpuMs).toBeTypeOf('number');
    expect(res.memDelta).toBeTypeOf('number');
    expect(res.pulsarGas).toBe(123);
    expect(res.simulationResult).toEqual(fakeSim);
    expect(res.error).toBeUndefined();
  });

  it('should handle simulation errors', async () => {
    vi.mock('./simulate_transaction', () => ({
      simulateTransaction: vi.fn().mockRejectedValue(new Error('fail')),
    }));
    const res = await benchmarkGas({
      contractId: 'abc',
      method: 'foo',
      args: [],
      account: 'testacc',
    });
    expect(res.error).toBeInstanceOf(Error);
    expect(res.pulsarGas).toBeNull();
  });
});

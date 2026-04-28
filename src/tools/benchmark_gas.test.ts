import { describe, it, expect, vi } from 'vitest';

import { benchmarkGas } from './benchmark_gas.js';

describe('benchmarkGas', () => {
  it('should return cpu, memory, and pulsarGas fields', async () => {
    vi.mock('../tools/simulate_transaction.js', () => ({
      simulateTransaction: vi.fn().mockResolvedValue({
        cost: {
          cpu_instructions: '123',
          memory_bytes: '456',
        },
      }),
    }));
    vi.mock('../logger.js', () => ({
      default: { info: vi.fn(), error: vi.fn() },
    }));

    const result = await benchmarkGas({
      xdr: 'dummy-xdr',
    });

    expect(result.cpuMs).toBeGreaterThanOrEqual(0);
    expect(result.memDelta).toBeDefined();
    expect(result.pulsarGas).toEqual({
      cpu_instructions: '123',
      memory_bytes: '456',
    });
  });

  it('should handle simulation errors', async () => {
    vi.mock('../tools/simulate_transaction.js', () => ({
      simulateTransaction: vi.fn().mockRejectedValue(new Error('fail')),
    }));
    const res = await benchmarkGas({
      xdr: 'dummy-xdr',
    });
    expect(res.error).toBeInstanceOf(Error);
    expect(res.pulsarGas).toBeNull();
  });
});

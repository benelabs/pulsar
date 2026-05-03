import { describe, it, expect, vi } from 'vitest';

import { benchmarkGas } from './benchmark_gas.js';
import { benchmarkGas } from './benchmark_gas';

describe('benchmarkGas', () => {
  it('should return cpu, memory, and pulsarGas fields', async () => {
    const fakeSim = { gas: 123, result: 'ok' };
    vi.mock('./simulate_transaction', () => ({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
import { benchmarkGas } from './benchmark_gas.js';

describe('benchmarkGas', () => {
  it('should return cpu, memory, and pulsarGas fields', async () => {
    const fakeSim = {
      status: 'success',
      cost: { cpu_instructions: '123456', memory_bytes: '1024' },
      result: 'ok',
    };
    vi.mock('./simulate_transaction.js', () => ({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
      xdr: 'AAAAAgAAAAE...',
      network: 'testnet',
    });
    expect(res.cpuMs).toBeTypeOf('number');
    expect(res.memDelta).toBeTypeOf('number');
    expect(res.pulsarGas).toBe('123456');
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
    const fakeSim = { gas: 123, result: 'ok' };
    vi.mock('./simulate_transaction', () => ({
      simulateTransaction: vi.fn().mockResolvedValue(fakeSim),
    }));
    const res = await benchmarkGas({
      xdr: 'AAAA',
      network: 'testnet',
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
    vi.mock('./simulate_transaction.js', () => ({
      simulateTransaction: vi.fn().mockRejectedValue(new Error('fail')),
    }));
    const res = await benchmarkGas({
      xdr: 'AAAAAgAAAAE...',
      network: 'testnet',
    vi.mock('./simulate_transaction', () => ({
      simulateTransaction: vi.fn().mockRejectedValue(new Error('fail')),
    }));
    const res = await benchmarkGas({
      xdr: 'AAAA',
      network: 'testnet',
      contractId: 'abc',
      method: 'foo',
      args: [],
      account: 'testacc',
    });
    expect(res.error).toBeInstanceOf(Error);
    expect(res.pulsarGas).toBeNull();
  });
});

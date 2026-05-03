import { describe, it, expect } from 'vitest';

import {
  fixed_add,
  fixed_sub,
  fixed_mul,
  fixed_div,
  compound_interest,
  basis_points_to_percent,
  percent_to_basis_points,
  mean,
  weighted_mean,
  std_dev,
  twap,
  formatHumanReadable,
} from '../../src/utils/math.js';
import { sorobanMath } from '../../src/tools/soroban_math.js';

const D = 7;

describe('math.ts — fixed-point arithmetic', () => {
  it('fixed_add adds two values', () => {
    expect(fixed_add(10000000n, 5000000n)).toBe(15000000n);
  });

  it('fixed_sub subtracts two values (can be negative)', () => {
    expect(fixed_sub(10000000n, 15000000n)).toBe(-5000000n);
  });

  it('fixed_mul: 1.5 × 2.0 = 3.0', () => {
    expect(fixed_mul(15000000n, 20000000n, D)).toBe(30000000n);
  });

  it('fixed_div: 1.0 / 2.0 = 0.5', () => {
    expect(fixed_div(10000000n, 20000000n, D)).toBe(5000000n);
  });

  it('fixed_div throws on zero denominator', () => {
    expect(() => fixed_div(10000000n, 0n, D)).toThrow('Division by zero');
  });
});

describe('math.ts — financial', () => {
  it('compound_interest: 100% APR doubles principal', () => {
    expect(compound_interest(10000000n, 10000, 1, 1, D)).toBe(20000000n);
  });

  it('compound_interest: 0% rate returns principal unchanged', () => {
    expect(compound_interest(10000000n, 0, 3, 1, D)).toBe(10000000n);
  });

  it('basis_points_to_percent: 500 bps = 5%', () => {
    expect(basis_points_to_percent(500)).toBe(5);
  });

  it('percent_to_basis_points: 5% = 500 bps', () => {
    expect(percent_to_basis_points(5)).toBe(500);
  });

  it('percent_to_basis_points rounds fractional bps', () => {
    expect(percent_to_basis_points(0.125)).toBe(13);
  });
});

describe('math.ts — statistics', () => {
  it('mean of equal values equals that value', () => {
    expect(mean([10000000n, 10000000n, 10000000n], D)).toBe(10000000n);
  });

  it('mean uses integer division', () => {
    expect(mean([10000000n, 30000000n], D)).toBe(20000000n);
  });

  it('weighted_mean: equal weights = plain mean', () => {
    const result = weighted_mean([10000000n, 30000000n], [10000000n, 10000000n], D);
    expect(result).toBe(20000000n);
  });

  it('weighted_mean: biased weights', () => {
    const result = weighted_mean([10000000n, 30000000n], [30000000n, 10000000n], D);
    expect(result).toBe(15000000n);
  });

  it('weighted_mean throws on mismatched array lengths', () => {
    expect(() => weighted_mean([10000000n], [10000000n, 20000000n], D)).toThrow('same length');
  });

  it('weighted_mean throws on negative weight', () => {
    expect(() => weighted_mean([10000000n], [-10000000n], D)).toThrow('non-negative');
  });

  it('weighted_mean throws on zero weight sum', () => {
    expect(() => weighted_mean([10000000n], [0n], D)).toThrow('non-zero');
  });

  it('std_dev of {1.0, 3.0} = 1.0', () => {
    expect(std_dev([10000000n, 30000000n], D)).toBe(10000000n);
  });

  it('std_dev of identical values = 0', () => {
    expect(std_dev([20000000n, 20000000n], D)).toBe(0n);
  });
});

describe('math.ts — twap', () => {
  it('twap of three evenly-spaced prices = average of first two', () => {
    const prices = [
      { price: 10000000n, timestamp: 0n },
      { price: 20000000n, timestamp: 5n },
      { price: 30000000n, timestamp: 10n },
    ];
    expect(twap(prices, D)).toBe(15000000n);
  });

  it('twap throws when total time is zero', () => {
    const prices = [
      { price: 10000000n, timestamp: 5n },
      { price: 20000000n, timestamp: 5n },
    ];
    expect(() => twap(prices, D)).toThrow('non-zero');
  });
});

describe('math.ts — formatHumanReadable', () => {
  it('formats positive fixed-point value', () => {
    expect(formatHumanReadable(10000000n, D)).toBe('1.0000000');
  });

  it('formats negative fixed-point value', () => {
    expect(formatHumanReadable(-15000000n, D)).toBe('-1.5000000');
  });

  it('formats zero', () => {
    expect(formatHumanReadable(0n, D)).toBe('0.0000000');
  });

  it('pads fractional part', () => {
    expect(formatHumanReadable(1n, D)).toBe('0.0000001');
  });

  it('works with decimals=0', () => {
    expect(formatHumanReadable(42n, 0)).toBe('42');
  });
});

describe('sorobanMath tool handler', () => {
  it('fixed_add via handler', async () => {
    const result = (await sorobanMath({
      operation: 'fixed_add',
      a: '10000000',
      b: '5000000',
      decimals: D,
    })) as any;
    expect(result.result).toBe('15000000');
    expect(result.human_readable).toBe('1.5000000');
    expect(result.decimals).toBe(D);
  });

  it('fixed_sub via handler (negative result)', async () => {
    const result = (await sorobanMath({
      operation: 'fixed_sub',
      a: '5000000',
      b: '10000000',
      decimals: D,
    })) as any;
    expect(result.result).toBe('-5000000');
    expect(result.human_readable).toBe('-0.5000000');
  });

  it('fixed_mul via handler', async () => {
    const result = (await sorobanMath({
      operation: 'fixed_mul',
      a: '15000000',
      b: '20000000',
      decimals: D,
    })) as any;
    expect(result.result).toBe('30000000');
  });

  it('fixed_div via handler', async () => {
    const result = (await sorobanMath({
      operation: 'fixed_div',
      a: '10000000',
      b: '20000000',
      decimals: D,
    })) as any;
    expect(result.result).toBe('5000000');
  });

  it('fixed_div by zero re-throws as PulsarValidationError', async () => {
    await expect(
      sorobanMath({ operation: 'fixed_div', a: '10000000', b: '0', decimals: D })
    ).rejects.toThrow('Division by zero');
  });

  it('mean via handler', async () => {
    const result = (await sorobanMath({
      operation: 'mean',
      values: ['10000000', '30000000'],
      decimals: D,
    })) as any;
    expect(result.result).toBe('20000000');
  });

  it('weighted_mean via handler', async () => {
    const result = (await sorobanMath({
      operation: 'weighted_mean',
      values: ['10000000', '30000000'],
      weights: ['30000000', '10000000'],
      decimals: D,
    })) as any;
    expect(result.result).toBe('15000000');
  });

  it('std_dev via handler', async () => {
    const result = (await sorobanMath({
      operation: 'std_dev',
      values: ['10000000', '30000000'],
      decimals: D,
    })) as any;
    expect(result.result).toBe('10000000');
  });

  it('twap via handler', async () => {
    const result = (await sorobanMath({
      operation: 'twap',
      prices: [
        { price: '10000000', timestamp: 0 },
        { price: '20000000', timestamp: 5 },
        { price: '30000000', timestamp: 10 },
      ],
      decimals: D,
    })) as any;
    expect(result.result).toBe('15000000');
  });

  it('compound_interest via handler', async () => {
    const result = (await sorobanMath({
      operation: 'compound_interest',
      principal: '10000000',
      rate_bps: 10000,
      periods: 1,
      compounds_per_period: 1,
      decimals: D,
    })) as any;
    expect(result.result).toBe('20000000');
  });

  it('basis_points_to_percent via handler', async () => {
    const result = (await sorobanMath({
      operation: 'basis_points_to_percent',
      value: 500,
    })) as any;
    expect(result.result).toBe(5);
  });

  it('percent_to_basis_points via handler', async () => {
    const result = (await sorobanMath({
      operation: 'percent_to_basis_points',
      value: 5,
    })) as any;
    expect(result.result).toBe(500);
  });

  it('throws PulsarValidationError on invalid input', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(sorobanMath({ operation: 'unknown_op' } as any)).rejects.toThrow();
  });

  it('throws on invalid BigInt string', async () => {
    await expect(
      sorobanMath({ operation: 'fixed_add', a: '1.5', b: '10000000', decimals: D })
    ).rejects.toThrow();
  });
});

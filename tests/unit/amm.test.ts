/**
 * Unit tests for AMM (Automated Market Maker) tool
 *
 * Tests constant-product (x*y=k) AMM calculations including:
 * - Swap output calculations
 * - Liquidity shares calculations
 * - Remove liquidity calculations
 * - Input validation
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSwapOutput,
  calculateLiquidityShares,
  calculateRemoveLiquidity,
} from '../../src/tools/amm.js';
import { PulsarValidationError } from '../../src/errors.js';

describe('AMM Tool - Swap Calculations', () => {
  it('should calculate correct swap output with standard reserves', () => {
    // Pool: 1000 XLM, 2000 USDC
    // Swap: 100 XLM -> USDC
    const amountIn = 100n;
    const reserveIn = 1000n;
    const reserveOut = 2000n;

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    // With 0.30% fee, expected output should be slightly less than 200 USDC
    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThan(200n); // Should be less than proportional due to fee
  });

  it('should calculate swap output with large amounts', () => {
    // Pool: 1,000,000 XLM, 2,000,000 USDC
    // Swap: 50,000 XLM -> USDC
    const amountIn = 50_000n;
    const reserveIn = 1_000_000n;
    const reserveOut = 2_000_000n;

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThan(100_000n); // Less than 2x due to fee and slippage
  });

  it('should calculate swap output with small amounts', () => {
    // Pool: 100 XLM, 200 USDC
    // Swap: 1 XLM -> USDC
    const amountIn = 1n;
    const reserveIn = 100n;
    const reserveOut = 200n;

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThanOrEqual(2n);
  });

  it('should throw error for zero input amount', () => {
    expect(() => calculateSwapOutput(0n, 1000n, 2000n)).toThrow();
  });

  it('should throw error for negative input amount', () => {
    expect(() => calculateSwapOutput(-100n, 1000n, 2000n)).toThrow();
  });

  it('should throw error for zero reserve in', () => {
    expect(() => calculateSwapOutput(100n, 0n, 2000n)).toThrow();
  });

  it('should throw error for zero reserve out', () => {
    expect(() => calculateSwapOutput(100n, 1000n, 0n)).toThrow();
  });

  it('should maintain constant product invariant after swap', () => {
    // Initial: 1000 XLM * 2000 USDC = 2,000,000
    const reserveIn = 1000n;
    const reserveOut = 2000n;
    const initialK = reserveIn * reserveOut;

    const amountIn = 100n;
    const amountOut = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    // New reserves after swap
    const newReserveIn = reserveIn + amountIn;
    const newReserveOut = reserveOut - amountOut;
    const newK = newReserveIn * newReserveOut;

    // K should increase due to fees (0.30% fee stays in pool)
    expect(newK).toBeGreaterThanOrEqual(initialK);
  });

  it('should handle equal reserves correctly', () => {
    // Pool: 1000 XLM, 1000 USDC
    // Swap: 100 XLM -> USDC
    const amountIn = 100n;
    const reserveIn = 1000n;
    const reserveOut = 1000n;

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThan(100n); // Less than 1:1 due to fee
  });
});

describe('AMM Tool - Liquidity Shares Calculations', () => {
  it('should calculate initial liquidity shares correctly', () => {
    // First liquidity provider: 1000 XLM, 2000 USDC
    // shares = sqrt(1000 * 2000) = sqrt(2,000,000) ≈ 1414
    const amountA = 1000n;
    const amountB = 2000n;
    const reserveA = 0n;
    const reserveB = 0n;
    const totalShares = 0n;

    const shares = calculateLiquidityShares(amountA, amountB, reserveA, reserveB, totalShares);

    expect(shares).toBeGreaterThan(0n);
    const expectedShares = BigInt(Math.floor(Math.sqrt(Number(amountA * amountB))));
    expect(shares).toBe(expectedShares);
  });

  it('should calculate subsequent liquidity shares correctly', () => {
    // Existing pool: 1000 XLM, 2000 USDC, 1414 shares
    // New deposit: 100 XLM, 200 USDC (maintaining 1:2 ratio)
    const amountA = 100n;
    const amountB = 200n;
    const reserveA = 1000n;
    const reserveB = 2000n;
    const totalShares = 1414n;

    const shares = calculateLiquidityShares(amountA, amountB, reserveA, reserveB, totalShares);

    // Should be proportional: (100 / 1000) * 1414 = 141.4 ≈ 141
    expect(shares).toBeGreaterThan(0n);
    expect(shares).toBeLessThanOrEqual(142n);
  });

  it('should return minimum shares when ratio is not maintained', () => {
    // Existing pool: 1000 XLM, 1000 USDC, 1000 shares
    // New deposit: 200 XLM, 100 USDC (not maintaining 1:1 ratio)
    const amountA = 200n;
    const amountB = 100n;
    const reserveA = 1000n;
    const reserveB = 1000n;
    const totalShares = 1000n;

    const shares = calculateLiquidityShares(amountA, amountB, reserveA, reserveB, totalShares);

    // Asset A would give: (200 / 1000) * 1000 = 200 shares
    // Asset B would give: (100 / 1000) * 1000 = 100 shares
    // Should return minimum: 100 shares
    expect(shares).toBe(100n);
  });

  it('should throw error for zero deposit amounts', () => {
    expect(() => calculateLiquidityShares(0n, 1000n, 1000n, 1000n, 1000n)).toThrow();
  });

  it('should throw error for negative deposit amounts', () => {
    expect(() => calculateLiquidityShares(-100n, 1000n, 1000n, 1000n, 1000n)).toThrow();
  });

  it('should handle large liquidity deposits', () => {
    const amountA = 1_000_000n;
    const amountB = 2_000_000n;
    const reserveA = 10_000_000n;
    const reserveB = 20_000_000n;
    const totalShares = 14_142_135n; // sqrt(10M * 20M)

    const shares = calculateLiquidityShares(amountA, amountB, reserveA, reserveB, totalShares);

    expect(shares).toBeGreaterThan(0n);
    expect(shares).toBeLessThan(totalShares); // Should not exceed total shares
  });
});

describe('AMM Tool - Remove Liquidity Calculations', () => {
  it('should calculate correct asset amounts for burning shares', () => {
    // Pool: 1000 XLM, 2000 USDC, 1414 total shares
    // Burn: 141 shares (10% of pool)
    const sharesAmount = 141n;
    const reserveA = 1000n;
    const reserveB = 2000n;
    const totalShares = 1414n;

    const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

    // Should receive approximately 10% of each reserve
    // 141/1414 * 1000 ≈ 99.7 ≈ 99 (integer division)
    expect(result.amountA).toBeGreaterThanOrEqual(99n);
    expect(result.amountA).toBeLessThanOrEqual(100n);
    // 141/1414 * 2000 ≈ 199.4 ≈ 199 (integer division)
    expect(result.amountB).toBeGreaterThanOrEqual(199n);
    expect(result.amountB).toBeLessThanOrEqual(200n);
  });

  it('should calculate proportional amounts for any share amount', () => {
    const sharesAmount = 500n;
    const reserveA = 2000n;
    const reserveB = 4000n;
    const totalShares = 1000n;

    const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

    // 50% of pool
    expect(result.amountA).toBe(1000n);
    expect(result.amountB).toBe(2000n);
  });

  it('should throw error for zero shares amount', () => {
    expect(() => calculateRemoveLiquidity(0n, 1000n, 2000n, 1414n)).toThrow();
  });

  it('should throw error for negative shares amount', () => {
    expect(() => calculateRemoveLiquidity(-100n, 1000n, 2000n, 1414n)).toThrow();
  });

  it('should throw error for zero total shares', () => {
    expect(() => calculateRemoveLiquidity(100n, 1000n, 2000n, 0n)).toThrow();
  });

  it('should throw error when shares exceed total shares', () => {
    expect(() => calculateRemoveLiquidity(2000n, 1000n, 2000n, 1414n)).toThrow();
  });

  it('should handle burning all shares', () => {
    const sharesAmount = 1414n;
    const reserveA = 1000n;
    const reserveB = 2000n;
    const totalShares = 1414n;

    const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

    // Should receive entire reserve
    expect(result.amountA).toBe(reserveA);
    expect(result.amountB).toBe(reserveB);
  });

  it('should handle small share amounts', () => {
    const sharesAmount = 1n;
    const reserveA = 1000n;
    const reserveB = 2000n;
    const totalShares = 1414n;

    const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

    // Should receive proportional amount (may be 0 due to integer division)
    expect(result.amountA).toBeGreaterThanOrEqual(0n);
    expect(result.amountB).toBeGreaterThanOrEqual(0n);
  });
});

describe('AMM Tool - Edge Cases', () => {
  it('should handle very large numbers without overflow', () => {
    const amountIn = 1_000_000_000_000n; // 100,000 XLM in stroops
    const reserveIn = 10_000_000_000_000n; // 1,000,000 XLM
    const reserveOut = 20_000_000_000_000n; // 2,000,000 USDC

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
  });

  it('should handle minimum non-zero amounts', () => {
    const amountIn = 1n; // 1 stroop
    const reserveIn = 1_000_000n; // 0.1 XLM
    const reserveOut = 2_000_000n; // 0.2 USDC

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    // May be 0 due to integer division with very small amounts
    expect(output).toBeGreaterThanOrEqual(0n);
  });

  it('should maintain precision with large reserve ratios', () => {
    // Pool with very unbalanced reserves
    const amountIn = 100n;
    const reserveIn = 100n; // Small reserve
    const reserveOut = 1_000_000n; // Large reserve

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
  });

  it('should handle equal input and output reserves', () => {
    const amountIn = 50n;
    const reserveIn = 1000n;
    const reserveOut = 1000n;

    const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThan(amountIn); // Should be less due to fee
  });
});

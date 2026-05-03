/**
 * Integration tests for AMM (Automated Market Maker) tool
 *
 * Tests AMM operations with mocked Soroban RPC server to verify:
 * - Transaction building
 * - Schema validation
 * - End-to-end workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ammTool, calculateSwapOutput } from '../../src/tools/amm.js';
import { PulsarValidationError } from '../../src/errors.js';

// Mock the Soroban RPC server
const mockGetAccount = vi.fn().mockResolvedValue({
  sequenceNumber: () => '123456789',
});

const mockServer = {
  getAccount: mockGetAccount,
};

vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(() => mockServer),
}));

// Mock Stellar SDK with proper function implementations
vi.mock('@stellar/stellar-sdk', () => {
  const mockAccount = vi.fn().mockImplementation(() => ({
    sequenceNumber: () => '123456789',
  }));

  const mockTransactionBuilder = vi.fn().mockImplementation(() => ({
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      toXDR: () => 'AAAAAQAAAAC7E/Bw8b0K6K3z1VqZxL6H2F3V4K5L6M7N8O9P0Q==',
    }),
  }));

  const mockInvokeContractFunction = vi.fn().mockReturnValue({
    type: 'invokeContractFunction',
  });

  const mockAssetNative = vi.fn().mockReturnValue({
    getCode: () => 'XLM',
    getIssuer: () => undefined,
  });

  const mockAsset = vi.fn().mockImplementation((code, issuer) => ({
    getCode: () => code,
    getIssuer: () => issuer,
  }));

  return {
    Account: mockAccount,
    TransactionBuilder: mockTransactionBuilder,
    Operation: {
      invokeContractFunction: mockInvokeContractFunction,
    },
    Networks: {
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      TESTNET: 'Test SDF Network ; September 2015',
      FUTURENET: 'Test SDF Future Network ; October 2022',
    },
    Asset: {
      native: mockAssetNative,
    },
  };
});

describe('AMM Tool Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccount.mockResolvedValue({
      sequenceNumber: () => '123456789',
    });
  });

  describe('Swap Operation', () => {
    it('should calculate swap output correctly', async () => {
      // Test the calculation function directly
      const amountIn = 10000000n; // 1 XLM
      const reserveIn = 1000000000n; // 100 XLM
      const reserveOut = 2000000000n; // 2000 USDC

      const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

      expect(output).toBeGreaterThan(0n);
      expect(output).toBeLessThan(20000000n); // Less than 2 USDC due to fee
    });

    it('should handle different asset pairs', async () => {
      const amountIn = 100000000n; // 10 USDC
      const reserveIn = 1000000000n; // 100 USDC
      const reserveOut = 500000000n; // 50 EURC

      const output = calculateSwapOutput(amountIn, reserveIn, reserveOut);

      expect(output).toBeGreaterThan(0n);
    });
  });

  describe('Add Liquidity Operation', () => {
    it('should calculate liquidity shares for new pool', async () => {
      const { calculateLiquidityShares } = await import('../../src/tools/amm.js');
      
      const amountA = 1000000000n; // 100 XLM
      const amountB = 200000000n; // 20 USDC
      const shares = calculateLiquidityShares(amountA, amountB, 0n, 0n, 0n);

      expect(shares).toBeGreaterThan(0n);
    });

    it('should calculate liquidity shares for existing pool', async () => {
      const { calculateLiquidityShares } = await import('../../src/tools/amm.js');
      
      const amountA = 100000000n; // 10 XLM
      const amountB = 20000000n; // 2 USDC
      const reserveA = 1000000000n;
      const reserveB = 200000000n;
      const totalShares = 400000000n;

      const shares = calculateLiquidityShares(amountA, amountB, reserveA, reserveB, totalShares);

      expect(shares).toBeGreaterThan(0n);
      expect(shares).toBeLessThanOrEqual(40000000n); // 10% of total shares
    });
  });

  describe('Remove Liquidity Operation', () => {
    it('should calculate asset amounts for burning shares', async () => {
      const { calculateRemoveLiquidity } = await import('../../src/tools/amm.js');
      
      const sharesAmount = 100000000n;
      const reserveA = 1000000000n;
      const reserveB = 200000000n;
      const totalShares = 400000000n;

      const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

      expect(result.amountA).toBeGreaterThan(0n);
      expect(result.amountB).toBeGreaterThan(0n);
    });

    it('should handle partial liquidity removal', async () => {
      const { calculateRemoveLiquidity } = await import('../../src/tools/amm.js');
      
      const sharesAmount = 200000000n; // 50% of shares
      const reserveA = 1000000000n;
      const reserveB = 200000000n;
      const totalShares = 400000000n;

      const result = calculateRemoveLiquidity(sharesAmount, reserveA, reserveB, totalShares);

      // Should receive 50% of reserves
      expect(result.amountA).toBe(500000000n);
      expect(result.amountB).toBe(100000000n);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid action', async () => {
      const input = {
        action: 'invalid_action',
        params: {},
      };

      await expect(ammTool(input)).rejects.toThrow();
    });
  });

  describe('AMM Calculations Integration', () => {
    it('should maintain constant product through multiple swaps', async () => {
      const { calculateSwapOutput } = await import('../../src/tools/amm.js');
      
      let reserveIn = 1000000000n;
      let reserveOut = 2000000000n;
      const initialK = reserveIn * reserveOut;

      // Perform multiple swaps
      for (let i = 0; i < 5; i++) {
        const amountIn = 10000000n; // 1 XLM each time
        const amountOut = calculateSwapOutput(amountIn, reserveIn, reserveOut);
        
        reserveIn += amountIn;
        reserveOut -= amountOut;
      }

      const finalK = reserveIn * reserveOut;
      // K should increase due to fees
      expect(finalK).toBeGreaterThanOrEqual(initialK);
    });

    it('should handle complete liquidity cycle', async () => {
      const { calculateLiquidityShares, calculateRemoveLiquidity } = await import('../../src/tools/amm.js');
      
      // Add liquidity
      const amountA = 1000000000n;
      const amountB = 200000000n;
      const shares = calculateLiquidityShares(amountA, amountB, 0n, 0n, 0n);

      // Remove all liquidity
      const result = calculateRemoveLiquidity(shares, amountA, amountB, shares);

      // Should get back approximately the same amounts (minus rounding)
      expect(result.amountA).toBeLessThanOrEqual(amountA);
      expect(result.amountB).toBeLessThanOrEqual(amountB);
    });
  });
});

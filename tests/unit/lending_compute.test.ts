import { describe, it, expect } from 'vitest';

import { computeInterestRates, calculateBorrowingCapacity } from '../../src/tools/lending_compute.js';

describe('Lending Computations', () => {
  describe('computeInterestRates', () => {
    it('calculates interest rates correctly below kink', async () => {
      const result = await computeInterestRates({
        utilization_rate: 0.5,
        base_rate: 0.02,
        multiplier: 0.1,
        jump_multiplier: 1.0,
        kink: 0.8,
      });

      // borrow_rate = 0.02 + (0.5 / 0.8) * 0.1 = 0.02 + 0.625 * 0.1 = 0.02 + 0.0625 = 0.0825
      expect(result.borrow_rate).toBe('0.0825000');
      // supply_rate = 0.0825 * 0.5 = 0.04125
      expect(result.supply_rate).toBe('0.0412500');
    });

    it('calculates interest rates correctly correctly above kink', async () => {
      const result = await computeInterestRates({
        utilization_rate: 0.9,
        base_rate: 0.02,
        multiplier: 0.1,
        jump_multiplier: 1.0,
        kink: 0.8,
      });

      // borrow_rate = 0.02 + 0.1 + ((0.9 - 0.8) / (1 - 0.8)) * 1.0
      // borrow_rate = 0.12 + (0.1 / 0.2) * 1.0 = 0.12 + 0.5 = 0.62
      expect(result.borrow_rate).toBe('0.6200000');
      expect(result.supply_rate).toBe('0.5580000');
    });
  });

  describe('calculateBorrowingCapacity', () => {
    it('calculates borrowing capacity for a new position', async () => {
      const result = await calculateBorrowingCapacity({
        collateral_amount: 100,
        collateral_price: 1, // e.g. USDC
        debt_price: 1,
        ltv: 0.8,
        liquidation_threshold: 0.85,
        current_debt: 0,
      });

      expect(result.collateral_value_usd).toBe('100.00');
      expect(result.max_borrow_usd).toBe('80.00');
      expect(result.available_to_borrow_usd).toBe('80.00');
      expect(result.health_factor).toBe('Infinity');
    });

    it('calculates health factor and liquidation price for an active position', async () => {
      const result = await calculateBorrowingCapacity({
        collateral_amount: 10, // 10 ETH
        collateral_price: 2000,
        debt_price: 1, // Borrowing USDC
        ltv: 0.75,
        liquidation_threshold: 0.8,
        current_debt: 10000,
      });

      // Collateral Value = 20000
      // Max Borrow = 20000 * 0.75 = 15000
      // Health Factor = (20000 * 0.8) / 10000 = 16000 / 10000 = 1.6
      expect(result.health_factor).toBe('1.6000');
      expect(result.max_borrow_usd).toBe('15000.00');
      expect(result.available_to_borrow_usd).toBe('5000.00');
      
      // Liquidation Price = 10000 / (10 * 0.8) = 10000 / 8 = 1250
      expect(result.liquidation_price).toBe('1250.0000000');
      expect(result.is_liquidatable).toBe(false);
    });

    it('detects liquidatable positions', async () => {
      const result = await calculateBorrowingCapacity({
        collateral_amount: 10,
        collateral_price: 1200, // Price dropped below 1250
        debt_price: 1,
        ltv: 0.75,
        liquidation_threshold: 0.8,
        current_debt: 10000,
      });

      // Health Factor = (12000 * 0.8) / 10000 = 9600 / 10000 = 0.96
      expect(result.health_factor).toBe('0.9600');
      expect(result.is_liquidatable).toBe(true);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { calculateDutchAuctionPrice, calculateEnglishAuctionState } from '../../src/tools/auction_compute.js';

describe('Auction Computations', () => {
  describe('calculateDutchAuctionPrice', () => {
    const start_timestamp = 1700000000;
    const end_timestamp = 1700010000; // 10000s duration
    const start_price = 1000;
    const reserve_price = 500;

    it('returns start price before auction starts', async () => {
      const result = await calculateDutchAuctionPrice({
        start_price,
        reserve_price,
        start_timestamp,
        end_timestamp,
        current_timestamp: start_timestamp - 100,
      });

      expect(result.status).toBe('UPCOMING');
      expect(result.current_price).toBe('1000.0000000');
    });

    it('calculates price halfway through the auction', async () => {
      const result = await calculateDutchAuctionPrice({
        start_price,
        reserve_price,
        start_timestamp,
        end_timestamp,
        current_timestamp: start_timestamp + 5000,
      });

      // 50% through: 1000 - 0.5 * (1000 - 500) = 1000 - 250 = 750
      expect(result.status).toBe('ACTIVE');
      expect(result.current_price).toBe('750.0000000');
      expect(result.progress_percentage).toBe('50.00');
    });

    it('returns reserve price after auction ends', async () => {
      const result = await calculateDutchAuctionPrice({
        start_price,
        reserve_price,
        start_timestamp,
        end_timestamp,
        current_timestamp: end_timestamp + 100,
      });

      expect(result.status).toBe('ENDED');
      expect(result.current_price).toBe('500.0000000');
    });
  });

  describe('calculateEnglishAuctionState', () => {
    const end_timestamp = 1700000000;
    const reserve_price = 100;

    it('calculates min bid when no bids exist', async () => {
      const result = await calculateEnglishAuctionState({
        current_highest_bid: 0,
        reserve_price,
        bid_increment: 10,
        bid_increment_type: 'absolute',
        end_timestamp,
        current_timestamp: end_timestamp - 100,
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.min_next_bid).toBe('100.0000000'); // Must beat reserve
      expect(result.is_reserve_met).toBe(false);
    });

    it('calculates absolute bid increment', async () => {
      const result = await calculateEnglishAuctionState({
        current_highest_bid: 150,
        reserve_price,
        bid_increment: 10,
        bid_increment_type: 'absolute',
        end_timestamp,
        current_timestamp: end_timestamp - 100,
      });

      expect(result.min_next_bid).toBe('160.0000000');
      expect(result.is_reserve_met).toBe(true);
    });

    it('calculates percentage bid increment', async () => {
      const result = await calculateEnglishAuctionState({
        current_highest_bid: 200,
        reserve_price,
        bid_increment: 5, // 5%
        bid_increment_type: 'percentage',
        end_timestamp,
        current_timestamp: end_timestamp - 100,
      });

      // 200 + 5% = 200 + 10 = 210
      expect(result.min_next_bid).toBe('210.0000000');
    });

    it('handles ended auction state', async () => {
      const result = await calculateEnglishAuctionState({
        current_highest_bid: 250,
        reserve_price,
        bid_increment: 10,
        end_timestamp,
        current_timestamp: end_timestamp + 100,
      });

      expect(result.status).toBe('ENDED');
      expect(result.time_remaining).toBe(0);
    });
  });
});

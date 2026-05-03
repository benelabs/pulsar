import {
  CalculateDutchAuctionPriceInput,
  CalculateEnglishAuctionStateInput,
} from '../schemas/tools.js';
import { toStroops, fromStroops, safeSub, safeMul, safeDiv, safeAdd } from '../utils/safe_math.js';

/**
 * Calculates the current price of an asset in a Dutch auction with linear decay.
 */
export async function calculateDutchAuctionPrice(input: CalculateDutchAuctionPriceInput) {
  const {
    start_price,
    reserve_price,
    start_timestamp,
    end_timestamp,
    current_timestamp = Math.floor(Date.now() / 1000),
  } = input;

  if (current_timestamp <= start_timestamp) {
    return {
      status: 'UPCOMING',
      current_price: start_price.toFixed(7),
      time_until_start: start_timestamp - current_timestamp,
    };
  }

  if (current_timestamp >= end_timestamp) {
    return {
      status: 'ENDED',
      current_price: reserve_price.toFixed(7),
      time_since_end: current_timestamp - end_timestamp,
    };
  }

  // Linear decay: Price = Start - (Elapsed / TotalDuration) * (Start - Reserve)
  // Use BigInt (stroops) for high precision math
  const startStroops = toStroops(start_price);
  const reserveStroops = toStroops(reserve_price);
  const elapsed = BigInt(current_timestamp - start_timestamp);
  const totalDuration = BigInt(end_timestamp - start_timestamp);

  const priceRange = safeSub(startStroops, reserveStroops);
  const priceDrop = safeDiv(safeMul(elapsed, priceRange), totalDuration);
  const currentStroops = safeSub(startStroops, priceDrop);

  const current_price = fromStroops(currentStroops);

  return {
    status: 'ACTIVE',
    current_price: current_price.toFixed(7),
    elapsed_seconds: Number(elapsed),
    remaining_seconds: end_timestamp - current_timestamp,
    progress_percentage: ((Number(elapsed) / Number(totalDuration)) * 100).toFixed(2),
  };
}

/**
 * Calculates the next bid requirements for an English auction.
 */
export async function calculateEnglishAuctionState(input: CalculateEnglishAuctionStateInput) {
  const {
    current_highest_bid,
    reserve_price,
    bid_increment,
    bid_increment_type,
    end_timestamp,
    current_timestamp = Math.floor(Date.now() / 1000),
  } = input;

  const is_ended = current_timestamp >= end_timestamp;

  let minNextBidStroops: bigint;
  const currentHighestStroops = toStroops(current_highest_bid);
  const reserveStroops = toStroops(reserve_price);

  if (current_highest_bid === 0) {
    // No bids yet, next bid must be at least reserve price
    minNextBidStroops = reserveStroops;
  } else {
    // Calculate increment
    let incrementStroops: bigint;
    if (bid_increment_type === 'percentage') {
      // (current_highest_bid * bid_increment) / 100
      // To maintain precision with BigInt: (currentHighestStroops * BigInt(bid_increment)) / 100n
      // Assuming bid_increment is a number like 5.5 (meaning 5.5%), we handle it carefully.
      const bidIncrementStroops = toStroops(bid_increment);
      incrementStroops = safeDiv(
        safeMul(currentHighestStroops, bidIncrementStroops),
        toStroops(100)
      );
    } else {
      incrementStroops = toStroops(bid_increment);
    }

    minNextBidStroops = safeAdd(currentHighestStroops, incrementStroops);
  }

  const min_next_bid = fromStroops(minNextBidStroops);

  return {
    status: is_ended ? 'ENDED' : 'ACTIVE',
    current_highest_bid: current_highest_bid.toFixed(7),
    min_next_bid: min_next_bid.toFixed(7),
    reserve_price: reserve_price.toFixed(7),
    is_reserve_met: current_highest_bid >= reserve_price,
    time_remaining: Math.max(0, end_timestamp - current_timestamp),
    bid_increment_details: {
      type: bid_increment_type,
      value: bid_increment,
    },
  };
}

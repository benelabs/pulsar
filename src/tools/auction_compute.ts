import { 
  CalculateDutchAuctionPriceInput, 
  CalculateEnglishAuctionStateInput 
} from "../schemas/tools.js";

/**
 * Calculates the current price of an asset in a Dutch auction with linear decay.
 */
export async function calculateDutchAuctionPrice(input: CalculateDutchAuctionPriceInput) {
  const { 
    start_price, 
    reserve_price, 
    start_timestamp, 
    end_timestamp, 
    current_timestamp = Math.floor(Date.now() / 1000) 
  } = input;

  if (current_timestamp <= start_timestamp) {
    return {
      status: "UPCOMING",
      current_price: start_price.toFixed(7),
      time_until_start: start_timestamp - current_timestamp,
    };
  }

  if (current_timestamp >= end_timestamp) {
    return {
      status: "ENDED",
      current_price: reserve_price.toFixed(7),
      time_since_end: current_timestamp - end_timestamp,
    };
  }

  // Linear decay: Price = Start - (Elapsed / TotalDuration) * (Start - Reserve)
  const elapsed = current_timestamp - start_timestamp;
  const total_duration = end_timestamp - start_timestamp;
  const price_drop = (elapsed / total_duration) * (start_price - reserve_price);
  const current_price = start_price - price_drop;

  return {
    status: "ACTIVE",
    current_price: current_price.toFixed(7),
    elapsed_seconds: elapsed,
    remaining_seconds: end_timestamp - current_timestamp,
    progress_percentage: ((elapsed / total_duration) * 100).toFixed(2),
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
    current_timestamp = Math.floor(Date.now() / 1000) 
  } = input;

  const is_ended = current_timestamp >= end_timestamp;
  
  let min_next_bid: number;
  
  if (current_highest_bid === 0) {
    // No bids yet, next bid must be at least reserve price
    min_next_bid = reserve_price;
  } else {
    // Calculate increment
    const increment = bid_increment_type === 'percentage' 
      ? current_highest_bid * (bid_increment / 100) 
      : bid_increment;
    
    min_next_bid = current_highest_bid + increment;
  }

  return {
    status: is_ended ? "ENDED" : "ACTIVE",
    current_highest_bid: current_highest_bid.toFixed(7),
    min_next_bid: min_next_bid.toFixed(7),
    reserve_price: reserve_price.toFixed(7),
    is_reserve_met: current_highest_bid >= reserve_price,
    time_remaining: Math.max(0, end_timestamp - current_timestamp),
    bid_increment_details: {
      type: bid_increment_type,
      value: bid_increment,
    }
  };
}

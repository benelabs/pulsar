import { 
  ComputeInterestRatesInput, 
  CalculateBorrowingCapacityInput 
} from "../schemas/tools.js";

/**
 * Calculates borrowing and supply rates based on utilization and jump rate model.
 */
export async function computeInterestRates(input: ComputeInterestRatesInput) {
  const { utilization_rate, base_rate, multiplier, jump_multiplier, kink } = input;

  let borrow_rate: number;

  if (utilization_rate <= kink) {
    // Normal slope: base_rate + (utilization / kink) * multiplier
    borrow_rate = base_rate + (utilization_rate / kink) * multiplier;
  } else {
    // Jump slope: base_rate + multiplier + ((utilization - kink) / (1 - kink)) * jump_multiplier
    borrow_rate = base_rate + multiplier + ((utilization_rate - kink) / (1 - kink)) * jump_multiplier;
  }

  // Supply rate is roughly borrow_rate * utilization (ignoring reserve factor)
  const supply_rate = borrow_rate * utilization_rate;

  return {
    utilization_rate: utilization_rate.toFixed(7),
    borrow_rate: borrow_rate.toFixed(7),
    supply_rate: supply_rate.toFixed(7),
    model: "Jump Rate Model",
    parameters: {
      base_rate,
      multiplier,
      jump_multiplier,
      kink,
    },
  };
}

/**
 * Calculates borrowing capacity and health factor for a collateralized position.
 */
export async function calculateBorrowingCapacity(input: CalculateBorrowingCapacityInput) {
  const { 
    collateral_amount, 
    collateral_price, 
    debt_price, 
    ltv, 
    liquidation_threshold, 
    current_debt 
  } = input;

  const collateral_value_usd = collateral_amount * collateral_price;
  const debt_value_usd = current_debt * debt_price;

  // Max borrow in USD
  const max_borrow_usd = collateral_value_usd * ltv;
  const available_to_borrow_usd = Math.max(0, max_borrow_usd - debt_value_usd);
  const available_to_borrow_asset = available_to_borrow_usd / debt_price;

  // Health Factor = (Collateral * Price * Threshold) / Debt
  // If debt is 0, health factor is effectively infinite
  const health_factor = current_debt > 0 
    ? (collateral_value_usd * liquidation_threshold) / debt_value_usd 
    : Infinity;

  // Liquidation price: When (Collateral * Price * Threshold) = Debt
  // Price = Debt / (Collateral * Threshold)
  const liquidation_price = (current_debt * debt_price) / (collateral_amount * liquidation_threshold);

  return {
    collateral_value_usd: collateral_value_usd.toFixed(2),
    debt_value_usd: debt_value_usd.toFixed(2),
    max_borrow_usd: max_borrow_usd.toFixed(2),
    available_to_borrow_usd: available_to_borrow_usd.toFixed(2),
    available_to_borrow_asset: available_to_borrow_asset.toFixed(7),
    health_factor: health_factor === Infinity ? "Infinity" : health_factor.toFixed(4),
    liquidation_price: liquidation_price.toFixed(7),
    is_liquidatable: health_factor < 1,
    parameters: {
      ltv,
      liquidation_threshold,
    }
  };
}

import { config } from "../config.js";
import { GetOrderbookInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

/**
 * Stellar asset representation for orderbook queries
 */
export interface StellarAsset {
  code: string;
  issuer?: string; // Omit for XLM native
}

/**
 * Raw orderbook entry from Horizon
 */
export interface OrderbookEntry {
  price_r: { n: number; d: number };
  price: string;
  amount: string;
}

/**
 * Orderbook analytics computed from raw data
 */
export interface OrderbookAnalytics {
  best_bid: string | null;
  best_ask: string | null;
  mid_price: string | null;
  spread: string | null;
  spread_percentage: string | null;
  total_bid_liquidity: string;
  total_ask_liquidity: string;
  bid_depth_at_levels: Record<string, string>;
  ask_depth_at_levels: Record<string, string>;
  orderbook_imbalance: string | null;
  weighted_avg_bid_price: string | null;
  weighted_avg_ask_price: string | null;
}

/**
 * Complete orderbook response
 */
export interface GetOrderbookOutput {
  selling_asset: StellarAsset;
  buying_asset: StellarAsset;
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  empty_book: boolean;
  analytics: OrderbookAnalytics | null;
}

/**
 * Decimal arithmetic helper using string-based operations
 * to avoid floating point precision issues
 */
class DecimalMath {
  /**
   * Add two decimal strings
   */
  static add(a: string, b: string): string {
    const aNum = BigInt(a.replace(".", ""));
    const bNum = BigInt(b.replace(".", ""));
    const aDec = a.includes(".") ? a.split(".")[1].length : 0;
    const bDec = b.includes(".") ? b.split(".")[1].length : 0;
    const maxDec = Math.max(aDec, bDec);
    
    const aScaled = aNum * BigInt(10 ** (maxDec - aDec));
    const bScaled = bNum * BigInt(10 ** (maxDec - bDec));
    const sum = aScaled + bScaled;
    
    return this.formatBigInt(sum, maxDec);
  }

  /**
   * Subtract two decimal strings (a - b)
   */
  static subtract(a: string, b: string): string {
    const aNum = BigInt(a.replace(".", ""));
    const bNum = BigInt(b.replace(".", ""));
    const aDec = a.includes(".") ? a.split(".")[1].length : 0;
    const bDec = b.includes(".") ? b.split(".")[1].length : 0;
    const maxDec = Math.max(aDec, bDec);
    
    const aScaled = aNum * BigInt(10 ** (maxDec - aDec));
    const bScaled = bNum * BigInt(10 ** (maxDec - bDec));
    const diff = aScaled - bScaled;
    
    return this.formatBigInt(diff, maxDec);
  }

  /**
   * Multiply two decimal strings
   */
  static multiply(a: string, b: string): string {
    const aNum = BigInt(a.replace(".", ""));
    const bNum = BigInt(b.replace(".", ""));
    const aDec = a.includes(".") ? a.split(".")[1].length : 0;
    const bDec = b.includes(".") ? b.split(".")[1].length : 0;
    const totalDec = aDec + bDec;
    
    const product = aNum * bNum;
    return this.formatBigInt(product, totalDec);
  }

  /**
   * Divide two decimal strings (a / b) with specified precision
   */
  static divide(a: string, b: string, precision: number = 7): string {
    if (b === "0" || b === "0.0000000") {
      throw new Error("Division by zero");
    }
    
    const aNum = BigInt(a.replace(".", ""));
    const bNum = BigInt(b.replace(".", ""));
    const aDec = a.includes(".") ? a.split(".")[1].length : 0;
    const bDec = b.includes(".") ? b.split(".")[1].length : 0;
    
    // Scale numerator for precision
    const scaledA = aNum * BigInt(10 ** (precision + bDec));
    const quotient = scaledA / bNum;
    
    return this.formatBigInt(quotient, precision + bDec - aDec);
  }

  /**
   * Format BigInt with decimal places
   */
  private static formatBigInt(value: BigInt, decimals: number): string {
    const str = value.toString();
    const isNegative = str.startsWith("-");
    const absStr = isNegative ? str.slice(1) : str;
    
    if (decimals === 0) {
      return str;
    }
    
    const padded = absStr.padStart(decimals + 1, "0");
    const intPart = padded.slice(0, -decimals) || "0";
    const decPart = padded.slice(-decimals);
    
    const result = `${intPart}.${decPart}`;
    return isNegative ? `-${result}` : result;
  }

  /**
   * Compare two decimal strings
   * Returns: -1 if a < b, 0 if a === b, 1 if a > b
   */
  static compare(a: string, b: string): number {
    const diff = this.subtract(a, b);
    if (diff.startsWith("-")) return -1;
    if (diff === "0" || diff.match(/^0\.0+$/)) return 0;
    return 1;
  }
}

/**
 * Compute all derived analytics from raw orderbook data
 */
function computeAnalytics(
  bids: OrderbookEntry[],
  asks: OrderbookEntry[],
  depthLevels: number[]
): OrderbookAnalytics | null {
  // Handle empty orderbook
  if (bids.length === 0 && asks.length === 0) {
    return null;
  }

  const bestBid = bids.length > 0 ? bids[0].price : null;
  const bestAsk = asks.length > 0 ? asks[0].price : null;

  // Compute mid price
  let midPrice: string | null = null;
  if (bestBid && bestAsk) {
    try {
      const sum = DecimalMath.add(bestBid, bestAsk);
      midPrice = DecimalMath.divide(sum, "2", 7);
    } catch {
      midPrice = null;
    }
  }

  // Compute spread
  let spread: string | null = null;
  let spreadPercentage: string | null = null;
  if (bestBid && bestAsk) {
    try {
      spread = DecimalMath.subtract(bestAsk, bestBid);
      const spreadNum = DecimalMath.divide(spread, bestAsk, 7);
      spreadPercentage = DecimalMath.multiply(spreadNum, "100");
    } catch {
      spread = null;
      spreadPercentage = null;
    }
  }

  // Compute total liquidity
  const totalBidLiquidity = bids.reduce(
    (sum, bid) => DecimalMath.add(sum, bid.amount),
    "0"
  );
  const totalAskLiquidity = asks.reduce(
    (sum, ask) => DecimalMath.add(sum, ask.amount),
    "0"
  );

  // Compute depth at levels
  const bidDepthAtLevels: Record<string, string> = {};
  const askDepthAtLevels: Record<string, string> = {};

  if (midPrice) {
    for (const level of depthLevels) {
      const levelStr = level.toString();
      const levelDecimal = DecimalMath.divide(level.toString(), "100", 7);

      // Bid depth: within level% below mid price
      const bidThreshold = DecimalMath.multiply(
        midPrice,
        DecimalMath.subtract("1", levelDecimal)
      );
      bidDepthAtLevels[levelStr] = bids
        .filter((bid) => DecimalMath.compare(bid.price, bidThreshold) >= 0)
        .reduce((sum, bid) => DecimalMath.add(sum, bid.amount), "0");

      // Ask depth: within level% above mid price
      const askThreshold = DecimalMath.multiply(
        midPrice,
        DecimalMath.add("1", levelDecimal)
      );
      askDepthAtLevels[levelStr] = asks
        .filter((ask) => DecimalMath.compare(ask.price, askThreshold) <= 0)
        .reduce((sum, ask) => DecimalMath.add(sum, ask.amount), "0");
    }
  }

  // Compute orderbook imbalance
  let orderbookImbalance: string | null = null;
  try {
    const totalVolume = DecimalMath.add(totalBidLiquidity, totalAskLiquidity);
    if (DecimalMath.compare(totalVolume, "0") > 0) {
      const volumeDiff = DecimalMath.subtract(totalBidLiquidity, totalAskLiquidity);
      orderbookImbalance = DecimalMath.divide(volumeDiff, totalVolume, 7);
    }
  } catch {
    orderbookImbalance = null;
  }

  // Compute weighted average prices
  let weightedAvgBidPrice: string | null = null;
  let weightedAvgAskPrice: string | null = null;

  try {
    if (bids.length > 0 && DecimalMath.compare(totalBidLiquidity, "0") > 0) {
      const bidWeightedSum = bids.reduce((sum, bid) => {
        const weighted = DecimalMath.multiply(bid.price, bid.amount);
        return DecimalMath.add(sum, weighted);
      }, "0");
      weightedAvgBidPrice = DecimalMath.divide(bidWeightedSum, totalBidLiquidity, 7);
    }
  } catch {
    weightedAvgBidPrice = null;
  }

  try {
    if (asks.length > 0 && DecimalMath.compare(totalAskLiquidity, "0") > 0) {
      const askWeightedSum = asks.reduce((sum, ask) => {
        const weighted = DecimalMath.multiply(ask.price, ask.amount);
        return DecimalMath.add(sum, weighted);
      }, "0");
      weightedAvgAskPrice = DecimalMath.divide(askWeightedSum, totalAskLiquidity, 7);
    }
  } catch {
    weightedAvgAskPrice = null;
  }

  return {
    best_bid: bestBid,
    best_ask: bestAsk,
    mid_price: midPrice,
    spread,
    spread_percentage: spreadPercentage,
    total_bid_liquidity: totalBidLiquidity,
    total_ask_liquidity: totalAskLiquidity,
    bid_depth_at_levels: bidDepthAtLevels,
    ask_depth_at_levels: askDepthAtLevels,
    orderbook_imbalance: orderbookImbalance,
    weighted_avg_bid_price: weightedAvgBidPrice,
    weighted_avg_ask_price: weightedAvgAskPrice,
  };
}

/**
 * Validate asset parameters
 */
function validateAsset(code: string, issuer: string | undefined, assetName: string): void {
  // Validate asset code format (1-12 alphanumeric)
  if (!code || code.length < 1 || code.length > 12) {
    throw new PulsarValidationError(
      `${assetName} code must be 1–12 alphanumeric characters`,
      { code: "INVALID_ASSET" }
    );
  }

  if (!/^[a-zA-Z0-9]+$/.test(code)) {
    throw new PulsarValidationError(
      `${assetName} code must be 1–12 alphanumeric characters`,
      { code: "INVALID_ASSET" }
    );
  }

  // Native XLM doesn't need issuer
  if (code.toUpperCase() === "XLM" && !issuer) {
    return;
  }

  // Non-native assets require issuer
  if (code.toUpperCase() !== "XLM" && !issuer) {
    throw new PulsarValidationError(
      `Non-native assets require an issuer account ID`,
      { code: "MISSING_ISSUER" }
    );
  }

  // Validate issuer format if provided
  if (issuer) {
    if (!issuer.startsWith("G") || issuer.length !== 56) {
      throw new PulsarValidationError(
        `Issuer must be a valid Stellar account ID (G...)`,
        { code: "INVALID_ISSUER" }
      );
    }
  }
}

/**
 * Tool: get_orderbook
 * Retrieves and analyzes the Stellar DEX orderbook for a trading pair.
 * Returns raw bids/asks plus derived analytics.
 */
export const getOrderbook: McpToolHandler<typeof GetOrderbookInputSchema> = async (
  input: unknown
) => {
  // Validate input schema
  const validatedInput = GetOrderbookInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for get_orderbook",
      validatedInput.error.format()
    );
  }

  const {
    selling_asset_code,
    selling_asset_issuer,
    buying_asset_code,
    buying_asset_issuer,
    limit = 20,
    depth_levels = [1, 2, 5],
    network,
  } = validatedInput.data;

  // Validate assets
  validateAsset(selling_asset_code, selling_asset_issuer, "Selling asset");
  validateAsset(buying_asset_code, buying_asset_issuer, "Buying asset");

  // Validate and clamp limit
  const clampedLimit = Math.max(1, Math.min(200, limit));

  const server = getHorizonServer(network ?? config.stellarNetwork);

  try {
    // Build asset objects for Horizon API
    const sellingAsset =
      selling_asset_code.toUpperCase() === "XLM" && !selling_asset_issuer
        ? { asset_type: "native" as const }
        : {
            asset_type: "credit_alphanum4" as const,
            asset_code: selling_asset_code,
            asset_issuer: selling_asset_issuer!,
          };

    const buyingAsset =
      buying_asset_code.toUpperCase() === "XLM" && !buying_asset_issuer
        ? { asset_type: "native" as const }
        : {
            asset_type: "credit_alphanum4" as const,
            asset_code: buying_asset_code,
            asset_issuer: buying_asset_issuer!,
          };

    // Fetch orderbook from Horizon
    const orderbook = await server
      .orderbook(sellingAsset as any, buyingAsset as any)
      .limit(clampedLimit)
      .call();

    const bids: OrderbookEntry[] = orderbook.bids.map((bid: any) => ({
      price_r: bid.price_r,
      price: bid.price,
      amount: bid.amount,
    }));

    const asks: OrderbookEntry[] = orderbook.asks.map((ask: any) => ({
      price_r: ask.price_r,
      price: ask.price,
      amount: ask.amount,
    }));

    const emptyBook = bids.length === 0 && asks.length === 0;

    // Compute analytics
    const analytics = emptyBook ? null : computeAnalytics(bids, asks, depth_levels);

    return {
      selling_asset: {
        code: selling_asset_code,
        issuer: selling_asset_issuer,
      },
      buying_asset: {
        code: buying_asset_code,
        issuer: buying_asset_issuer,
      },
      bids,
      asks,
      empty_book: emptyBook,
      analytics,
    };
  } catch (err: any) {
    // Handle rate limiting
    if (err.response && err.response.status === 429) {
      throw new PulsarNetworkError("Request rate limited, please slow down", {
        code: "RATE_LIMITED",
        status: 429,
      });
    }

    // Handle Horizon unavailable
    if (err.response && (err.response.status === 503 || err.response.status === 504)) {
      throw new PulsarNetworkError("Stellar network unavailable, please retry", {
        code: "HORIZON_UNAVAILABLE",
        status: err.response.status,
      });
    }

    // Handle other network errors
    throw new PulsarNetworkError(err.message || "Failed to fetch orderbook", {
      originalError: err,
    });
  }
};

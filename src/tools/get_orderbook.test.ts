import { describe, it, expect, vi, beforeEach } from "vitest";

import { getOrderbook } from "./get_orderbook.js";
import { getHorizonServer } from "../services/horizon.js";

// Mock the services
vi.mock("../services/horizon.js", () => ({
  getHorizonServer: vi.fn(),
}));

describe("getOrderbook", () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      orderbook: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

  describe("computeAnalytics - normal orderbook", () => {
    it("returns all analytics for a normal orderbook", async () => {
      const mockOrderbook = {
        bids: [
          { price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "500.0000000" },
          { price_r: { n: 9, d: 100 }, price: "0.0900000", amount: "300.0000000" },
        ],
        asks: [
          { price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "400.0000000" },
          { price_r: { n: 12, d: 100 }, price: "0.1200000", amount: "200.0000000" },
        ],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.empty_book).toBe(false);
      expect(result.bids).toHaveLength(2);
      expect(result.asks).toHaveLength(2);
      expect(result.analytics).toBeDefined();
      expect(result.analytics.best_bid).toBe("0.1000000");
      expect(result.analytics.best_ask).toBe("0.1100000");
      expect(result.analytics.mid_price).toBeDefined();
      expect(result.analytics.spread).toBeDefined();
      expect(result.analytics.spread_percentage).toBeDefined();
      expect(result.analytics.total_bid_liquidity).toBe("800.0000000");
      expect(result.analytics.total_ask_liquidity).toBe("600.0000000");
      expect(result.analytics.orderbook_imbalance).toBeDefined();
      expect(result.analytics.weighted_avg_bid_price).toBeDefined();
      expect(result.analytics.weighted_avg_ask_price).toBeDefined();
    });
  });

  describe("computeAnalytics - edge cases", () => {
    it("handles single bid and single ask", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.best_bid).toBe("0.1000000");
      expect(result.analytics.best_ask).toBe("0.1100000");
      expect(result.analytics.spread).toBeDefined();
      expect(result.analytics.mid_price).toBeDefined();
    });

    it("handles empty bids gracefully", async () => {
      const mockOrderbook = {
        bids: [],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.best_bid).toBeNull();
      expect(result.analytics.best_ask).toBe("0.1100000");
      expect(result.analytics.spread).toBeNull();
      expect(result.analytics.mid_price).toBeNull();
      expect(result.analytics.total_bid_liquidity).toBe("0");
      expect(result.analytics.total_ask_liquidity).toBe("100.0000000");
    });

    it("handles empty asks gracefully", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.best_bid).toBe("0.1000000");
      expect(result.analytics.best_ask).toBeNull();
      expect(result.analytics.spread).toBeNull();
      expect(result.analytics.mid_price).toBeNull();
      expect(result.analytics.total_bid_liquidity).toBe("100.0000000");
      expect(result.analytics.total_ask_liquidity).toBe("0");
    });

    it("handles identical bid and ask price (zero spread)", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.spread).toBe("0.0000000");
      expect(result.analytics.spread_percentage).toBe("0.0000000");
    });

    it("returns null analytics for empty orderbook", async () => {
      const mockOrderbook = {
        bids: [],
        asks: [],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.empty_book).toBe(true);
      expect(result.analytics).toBeNull();
    });
  });

  describe("depth analysis", () => {
    it("computes depth at configured levels", async () => {
      const mockOrderbook = {
        bids: [
          { price_r: { n: 100, d: 1000 }, price: "0.1000000", amount: "500.0000000" },
          { price_r: { n: 99, d: 1000 }, price: "0.0990000", amount: "300.0000000" },
          { price_r: { n: 95, d: 1000 }, price: "0.0950000", amount: "200.0000000" },
        ],
        asks: [
          { price_r: { n: 110, d: 1000 }, price: "0.1100000", amount: "400.0000000" },
          { price_r: { n: 111, d: 1000 }, price: "0.1110000", amount: "200.0000000" },
          { price_r: { n: 115, d: 1000 }, price: "0.1150000", amount: "100.0000000" },
        ],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
        depth_levels: [1, 2, 5],
      })) as any;

      expect(result.analytics.bid_depth_at_levels).toBeDefined();
      expect(result.analytics.ask_depth_at_levels).toBeDefined();
      expect(result.analytics.bid_depth_at_levels["1"]).toBeDefined();
      expect(result.analytics.bid_depth_at_levels["2"]).toBeDefined();
      expect(result.analytics.bid_depth_at_levels["5"]).toBeDefined();
    });
  });

  describe("orderbook imbalance", () => {
    it("returns +1 for all bids (no asks)", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.orderbook_imbalance).toBe("1.0000000");
    });

    it("returns -1 for all asks (no bids)", async () => {
      const mockOrderbook = {
        bids: [],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.orderbook_imbalance).toBe("-1.0000000");
    });

    it("returns 0 for balanced orderbook", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.analytics.orderbook_imbalance).toBe("0.0000000");
    });
  });

  describe("weighted average price", () => {
    it("computes weighted average bid and ask prices", async () => {
      const mockOrderbook = {
        bids: [
          { price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" },
          { price_r: { n: 9, d: 100 }, price: "0.0900000", amount: "100.0000000" },
        ],
        asks: [
          { price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" },
          { price_r: { n: 12, d: 100 }, price: "0.1200000", amount: "100.0000000" },
        ],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      // Weighted avg bid = (0.1 * 100 + 0.09 * 100) / 200 = 0.095
      expect(result.analytics.weighted_avg_bid_price).toBe("0.0950000");
      // Weighted avg ask = (0.11 * 100 + 0.12 * 100) / 200 = 0.115
      expect(result.analytics.weighted_avg_ask_price).toBe("0.1150000");
    });
  });

  describe("asset validation", () => {
    it("accepts native XLM without issuer", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      const result = (await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      })) as any;

      expect(result.selling_asset.code).toBe("XLM");
      expect(result.selling_asset.issuer).toBeUndefined();
    });

    it("rejects non-native asset without issuer", async () => {
      await expect(
        getOrderbook({
          selling_asset_code: "USDC",
          buying_asset_code: "XLM",
        })
      ).rejects.toThrow("Non-native assets require an issuer account ID");
    });

    it("rejects invalid asset code format", async () => {
      await expect(
        getOrderbook({
          selling_asset_code: "INVALID_CODE_TOO_LONG",
          buying_asset_code: "XLM",
        })
      ).rejects.toThrow("must be 1–12 alphanumeric characters");
    });

    it("rejects invalid issuer format", async () => {
      await expect(
        getOrderbook({
          selling_asset_code: "USDC",
          selling_asset_issuer: "INVALID",
          buying_asset_code: "XLM",
        })
      ).rejects.toThrow("Issuer must be a valid Stellar account ID");
    });
  });

  describe("limit validation", () => {
    it("clamps limit to minimum 1", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
        limit: 0,
      });

      expect(mockServer.limit).toHaveBeenCalledWith(1);
    });

    it("clamps limit to maximum 200", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
        limit: 500,
      });

      expect(mockServer.limit).toHaveBeenCalledWith(200);
    });

    it("uses default limit of 20", async () => {
      const mockOrderbook = {
        bids: [{ price_r: { n: 1, d: 10 }, price: "0.1000000", amount: "100.0000000" }],
        asks: [{ price_r: { n: 11, d: 100 }, price: "0.1100000", amount: "100.0000000" }],
      };

      mockServer.call.mockResolvedValue(mockOrderbook);

      await getOrderbook({
        selling_asset_code: "XLM",
        buying_asset_code: "USDC",
        buying_asset_issuer: USDC_ISSUER,
      });

      expect(mockServer.limit).toHaveBeenCalledWith(20);
    });
  });

  describe("error handling", () => {
    it("handles 429 rate limited error", async () => {
      const error = new Error("Too Many Requests");
      (error as any).response = { status: 429 };
      mockServer.call.mockRejectedValue(error);

      await expect(
        getOrderbook({
          selling_asset_code: "XLM",
          buying_asset_code: "USDC",
          buying_asset_issuer: USDC_ISSUER,
        })
      ).rejects.toThrow("Request rate limited, please slow down");

      try {
        await getOrderbook({
          selling_asset_code: "XLM",
          buying_asset_code: "USDC",
          buying_asset_issuer: USDC_ISSUER,
        });
      } catch (e: any) {
        expect(e.name).toBe("PulsarNetworkError");
        expect(e.details.code).toBe("RATE_LIMITED");
        expect(e.details.status).toBe(429);
      }
    });

    it("handles 503 Horizon unavailable error", async () => {
      const error = new Error("Service Unavailable");
      (error as any).response = { status: 503 };
      mockServer.call.mockRejectedValue(error);

      await expect(
        getOrderbook({
          selling_asset_code: "XLM",
          buying_asset_code: "USDC",
          buying_asset_issuer: USDC_ISSUER,
        })
      ).rejects.toThrow("Stellar network unavailable, please retry");

      try {
        await getOrderbook({
          selling_asset_code: "XLM",
          buying_asset_code: "USDC",
          buying_asset_issuer: USDC_ISSUER,
        });
      } catch (e: any) {
        expect(e.name).toBe("PulsarNetworkError");
        expect(e.details.code).toBe("HORIZON_UNAVAILABLE");
        expect(e.details.status).toBe(503);
      }
    });

    it("handles other network errors", async () => {
      const error = new Error("Network timeout");
      mockServer.call.mockRejectedValue(error);

      await expect(
        getOrderbook({
          selling_asset_code: "XLM",
          buying_asset_code: "USDC",
          buying_asset_issuer: USDC_ISSUER,
        })
      ).rejects.toThrow("Network timeout");
    });
  });
});

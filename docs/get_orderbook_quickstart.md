# get_orderbook Quick Start Guide

## Basic Usage

### Example 1: Get XLM/USDC orderbook

```json
{
  "selling_asset_code": "XLM",
  "buying_asset_code": "USDC",
  "buying_asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
}
```

### Example 2: Get top 10 levels with custom depth analysis

```json
{
  "selling_asset_code": "XLM",
  "buying_asset_code": "USDC",
  "buying_asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "limit": 10,
  "depth_levels": [0.5, 1, 2]
}
```

### Example 3: Get USDC/BTC orderbook on testnet

```json
{
  "selling_asset_code": "USDC",
  "selling_asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "buying_asset_code": "BTC",
  "buying_asset_issuer": "GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM",
  "network": "testnet"
}
```

## Response Structure

```json
{
  "selling_asset": { "code": "XLM" },
  "buying_asset": { 
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  },
  "bids": [
    {
      "price_r": { "n": 1, "d": 10 },
      "price": "0.1000000",
      "amount": "500.0000000"
    }
  ],
  "asks": [
    {
      "price_r": { "n": 11, "d": 100 },
      "price": "0.1100000",
      "amount": "400.0000000"
    }
  ],
  "empty_book": false,
  "analytics": {
    "best_bid": "0.1000000",
    "best_ask": "0.1100000",
    "mid_price": "0.1050000",
    "spread": "0.0100000",
    "spread_percentage": "9.0909090",
    "total_bid_liquidity": "500.0000000",
    "total_ask_liquidity": "400.0000000",
    "bid_depth_at_levels": {
      "1": "500.0000000",
      "2": "500.0000000",
      "5": "500.0000000"
    },
    "ask_depth_at_levels": {
      "1": "400.0000000",
      "2": "400.0000000",
      "5": "400.0000000"
    },
    "orderbook_imbalance": "0.1111111",
    "weighted_avg_bid_price": "0.1000000",
    "weighted_avg_ask_price": "0.1100000"
  }
}
```

## Common Use Cases

### 1. Check Market Spread

```typescript
const result = await getOrderbook({
  selling_asset_code: "XLM",
  buying_asset_code: "USDC",
  buying_asset_issuer: USDC_ISSUER,
  limit: 5
});

console.log(`Spread: ${result.analytics.spread_percentage}%`);
// High spread (>5%) = low liquidity
// Low spread (<1%) = high liquidity
```

### 2. Assess Orderbook Imbalance

```typescript
const result = await getOrderbook({
  selling_asset_code: "XLM",
  buying_asset_code: "USDC",
  buying_asset_issuer: USDC_ISSUER
});

const imbalance = parseFloat(result.analytics.orderbook_imbalance);
if (imbalance > 0.3) {
  console.log("Strong buy pressure");
} else if (imbalance < -0.3) {
  console.log("Strong sell pressure");
} else {
  console.log("Balanced orderbook");
}
```

### 3. Analyze Liquidity Depth

```typescript
const result = await getOrderbook({
  selling_asset_code: "XLM",
  buying_asset_code: "USDC",
  buying_asset_issuer: USDC_ISSUER,
  depth_levels: [1, 2, 5]
});

console.log("Liquidity within 1% of mid:", 
  result.analytics.bid_depth_at_levels["1"],
  result.analytics.ask_depth_at_levels["1"]
);
```

### 4. Market Making Strategy

```typescript
const result = await getOrderbook({
  selling_asset_code: "XLM",
  buying_asset_code: "USDC",
  buying_asset_issuer: USDC_ISSUER,
  limit: 20
});

// Place quotes around weighted average prices
const bidPrice = result.analytics.weighted_avg_bid_price;
const askPrice = result.analytics.weighted_avg_ask_price;

console.log(`Place bid at: ${bidPrice}`);
console.log(`Place ask at: ${askPrice}`);
```

## Error Handling

```typescript
try {
  const result = await getOrderbook({
    selling_asset_code: "USDC",
    buying_asset_code: "XLM"
  });
} catch (error) {
  if (error.code === "MISSING_ISSUER") {
    console.error("USDC requires an issuer");
  } else if (error.code === "RATE_LIMITED") {
    console.error("Rate limited, retry after delay");
  } else if (error.code === "HORIZON_UNAVAILABLE") {
    console.error("Horizon unavailable, retry later");
  }
}
```

## Performance Tips

1. **Use appropriate limits:**
   - Quick check: `limit: 5-10`
   - Standard analysis: `limit: 20-50`
   - Deep analysis: `limit: 100-200`

2. **Configure depth levels based on your needs:**
   - Tight spreads: `[0.1, 0.5, 1]`
   - Standard: `[1, 2, 5]`
   - Wide spreads: `[5, 10, 20]`

3. **Handle empty orderbooks:**
   ```typescript
   if (result.empty_book) {
     console.log("No liquidity available");
     return;
   }
   ```

4. **Implement retry logic for rate limits:**
   ```typescript
   async function getOrderbookWithRetry(params, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await getOrderbook(params);
       } catch (error) {
         if (error.code === "RATE_LIMITED" && i < maxRetries - 1) {
           await sleep(1000 * Math.pow(2, i)); // Exponential backoff
           continue;
         }
         throw error;
       }
     }
   }
   ```

## Well-Known Asset Issuers

### Testnet
- **USDC**: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

### Mainnet
- **USDC (Circle)**: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- **AQUA**: `GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA`
- **yXLM**: `GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55`

## Related Documentation

- Full documentation: [docs/market-tools.md](./market-tools.md)
- AI schema: [docs/tools/get_orderbook.schema.json](./tools/get_orderbook.schema.json)
- Implementation: [GET_ORDERBOOK_IMPLEMENTATION.md](../GET_ORDERBOOK_IMPLEMENTATION.md)

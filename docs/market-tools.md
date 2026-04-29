# Market Data Tools

This document describes the market data tools available in Pulsar for analyzing the Stellar DEX.

## get_orderbook

### Purpose and Use Cases

The `get_orderbook` tool retrieves and analyzes the Stellar DEX orderbook for a trading pair. It provides both raw orderbook data (bids and asks) and derived analytics for deep market analysis.

**Primary use cases:**

- **Market making**: Monitor spread and liquidity to optimize quote placement and manage inventory
- **Arbitrage detection**: Compare orderbooks across trading pairs to identify price discrepancies
- **Liquidity analysis**: Assess market depth at various price levels for large order execution planning
- **Trading strategy**: Use orderbook imbalance as a signal for directional bias
- **Risk management**: Monitor spread percentage and depth to assess market quality before execution

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `selling_asset_code` | string | Yes | - | Asset code being sold (e.g. XLM, USDC). Must be 1-12 alphanumeric characters. |
| `selling_asset_issuer` | string | No | - | Issuer account for selling asset (G..., 56 chars). Omit for XLM native. |
| `buying_asset_code` | string | Yes | - | Asset code being bought (e.g. XLM, USDC). Must be 1-12 alphanumeric characters. |
| `buying_asset_issuer` | string | No | - | Issuer account for buying asset (G..., 56 chars). Omit for XLM native. |
| `limit` | integer | No | 20 | Number of price levels to return per side (1-200). |
| `depth_levels` | array | No | [1, 2, 5] | Price percentage levels for depth analysis (e.g. [1, 2, 5] for 1%, 2%, 5%). |
| `network` | string | No | configured | Network override: mainnet, testnet, futurenet, or custom. |

**Parameter constraints:**

- Asset codes must be 1-12 alphanumeric characters
- Native XLM does not require an issuer
- Non-native assets (e.g. USDC, BTC) require a valid issuer account ID
- Issuer must be a valid Stellar account ID starting with 'G' (56 characters)
- Limit is automatically clamped to the range [1, 200]
- Depth levels must be positive numbers representing percentages

### Response Fields

#### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `selling_asset` | object | The asset being sold: `{ code, issuer? }` |
| `buying_asset` | object | The asset being bought: `{ code, issuer? }` |
| `bids` | array | Array of bid orders (buy orders), sorted by price descending (best bid first) |
| `asks` | array | Array of ask orders (sell orders), sorted by price ascending (best ask first) |
| `empty_book` | boolean | True if orderbook has no bids and no asks |
| `analytics` | object \| null | Derived analytics. Null if orderbook is empty. |

#### Orderbook entry structure (bids/asks)

Each bid or ask entry contains:

| Field | Type | Description |
|-------|------|-------------|
| `price_r` | object | Price as a rational number: `{ n: numerator, d: denominator }` |
| `price` | string | Price as a decimal string (7 decimal places) |
| `amount` | string | Amount available at this price level (7 decimal places) |

#### Analytics fields

All analytics use string-based decimal arithmetic to avoid floating point precision issues.

| Field | Type | Formula | Description |
|-------|------|---------|-------------|
| `best_bid` | string \| null | `bids[0].price` | Highest bid price (top of buy side). Null if no bids. |
| `best_ask` | string \| null | `asks[0].price` | Lowest ask price (top of sell side). Null if no asks. |
| `mid_price` | string \| null | `(best_bid + best_ask) / 2` | Mid-market price. Null if missing bid or ask. |
| `spread` | string \| null | `best_ask - best_bid` | Absolute spread. Null if missing bid or ask. |
| `spread_percentage` | string \| null | `(spread / best_ask) * 100` | Spread as percentage of best ask. Null if missing bid or ask. |
| `total_bid_liquidity` | string | `sum(bids[].amount)` | Sum of all bid amounts. |
| `total_ask_liquidity` | string | `sum(asks[].amount)` | Sum of all ask amounts. |
| `bid_depth_at_levels` | object | - | Total bid liquidity within each configured percentage level below mid price. Keys are percentage levels (e.g. "1", "2", "5"), values are liquidity amounts. |
| `ask_depth_at_levels` | object | - | Total ask liquidity within each configured percentage level above mid price. Keys are percentage levels (e.g. "1", "2", "5"), values are liquidity amounts. |
| `orderbook_imbalance` | string \| null | `(bid_vol - ask_vol) / (bid_vol + ask_vol)` | Orderbook imbalance ratio. Ranges from -1 (all asks) to +1 (all bids). 0 indicates balanced orderbook. Null if total volume is zero. |
| `weighted_avg_bid_price` | string \| null | `sum(bid.price * bid.amount) / sum(bid.amount)` | Volume-weighted average bid price. Null if no bids. |
| `weighted_avg_ask_price` | string \| null | `sum(ask.price * ask.amount) / sum(ask.amount)` | Volume-weighted average ask price. Null if no asks. |

### Example Request and Response

#### Example 1: XLM/USDC orderbook

**Request:**
```json
{
  "selling_asset_code": "XLM",
  "buying_asset_code": "USDC",
  "buying_asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "limit": 5
}
```

**Response:**
```json
{
  "selling_asset": {
    "code": "XLM"
  },
  "buying_asset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  },
  "bids": [
    {
      "price_r": { "n": 1, "d": 10 },
      "price": "0.1000000",
      "amount": "500.0000000"
    },
    {
      "price_r": { "n": 99, "d": 1000 },
      "price": "0.0990000",
      "amount": "300.0000000"
    }
  ],
  "asks": [
    {
      "price_r": { "n": 11, "d": 100 },
      "price": "0.1100000",
      "amount": "400.0000000"
    },
    {
      "price_r": { "n": 111, "d": 1000 },
      "price": "0.1110000",
      "amount": "200.0000000"
    }
  ],
  "empty_book": false,
  "analytics": {
    "best_bid": "0.1000000",
    "best_ask": "0.1100000",
    "mid_price": "0.1050000",
    "spread": "0.0100000",
    "spread_percentage": "9.0909090",
    "total_bid_liquidity": "800.0000000",
    "total_ask_liquidity": "600.0000000",
    "bid_depth_at_levels": {
      "1": "500.0000000",
      "2": "800.0000000",
      "5": "800.0000000"
    },
    "ask_depth_at_levels": {
      "1": "400.0000000",
      "2": "600.0000000",
      "5": "600.0000000"
    },
    "orderbook_imbalance": "0.1428571",
    "weighted_avg_bid_price": "0.0962500",
    "weighted_avg_ask_price": "0.1066666"
  }
}
```

#### Example 2: Empty orderbook

**Request:**
```json
{
  "selling_asset_code": "XLM",
  "buying_asset_code": "RARE",
  "buying_asset_issuer": "GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH"
}
```

**Response:**
```json
{
  "selling_asset": {
    "code": "XLM"
  },
  "buying_asset": {
    "code": "RARE",
    "issuer": "GATEMHCCKCY67ZUCKTROYN24ZYT5GK4EQZ65JJLDHKHRUZI3EUEKMTCH"
  },
  "bids": [],
  "asks": [],
  "empty_book": true,
  "analytics": null
}
```

### Error Codes Reference

| Error Code | HTTP Status | Message | Trigger |
|------------|-------------|---------|---------|
| `INVALID_ASSET` | 400 | Asset code must be 1–12 alphanumeric characters | Invalid asset code format |
| `MISSING_ISSUER` | 400 | Non-native assets require an issuer account ID | Non-native asset provided without issuer |
| `INVALID_ISSUER` | 400 | Issuer must be a valid Stellar account ID (G...) | Invalid issuer account ID format |
| `INVALID_LIMIT` | 400 | Limit must be between 1 and 200 | Limit parameter out of valid range (note: limit is auto-clamped, so this error is rare) |
| `RATE_LIMITED` | 429 | Request rate limited, please slow down | Horizon API rate limit exceeded |
| `HORIZON_UNAVAILABLE` | 503 | Stellar network unavailable, please retry | Horizon API is unreachable or returning 503/504 |

**Error response format:**

All errors follow the standard Pulsar error envelope:

```json
{
  "status": "error",
  "error_code": "RATE_LIMITED",
  "message": "Request rate limited, please slow down",
  "details": {
    "code": "RATE_LIMITED",
    "status": 429
  }
}
```

### Performance Notes

**Response time:**
- Typically < 500ms for `limit` ≤ 20
- Typically < 1s for `limit` = 200
- Analytics computation: < 5ms for `limit` = 200

**Recommended limit values:**

| Use Case | Recommended Limit | Rationale |
|----------|-------------------|-----------|
| Quick market snapshot | 5-20 | Fast response, sufficient for spread and top-of-book analysis |
| Standard analysis | 20-50 | Balanced view of market depth without excessive data |
| Deep liquidity analysis | 100-200 | Full market depth for large order execution planning |

**Caching:**

Orderbook data is **not cached** as it is real-time by nature. Each request fetches fresh data from Horizon.

**Rate limiting:**

Horizon enforces rate limits. If you receive a `RATE_LIMITED` error (429), implement exponential backoff or reduce request frequency.

### Implementation Details

**Decimal arithmetic:**

All price and amount calculations use string-based decimal arithmetic with BigInt to avoid floating point precision issues. This ensures accurate computation of:
- Spread and spread percentage
- Mid price
- Weighted average prices
- Liquidity totals
- Depth analysis

**Depth level computation:**

For each configured depth level (e.g. 1%, 2%, 5%):
- **Bid depth**: Sum of all bid amounts with price ≥ (mid_price * (1 - level%))
- **Ask depth**: Sum of all ask amounts with price ≤ (mid_price * (1 + level%))

**Orderbook imbalance interpretation:**

- `+1.0`: All bids, no asks (strong buy pressure)
- `+0.5`: 75% bids, 25% asks (moderate buy pressure)
- `0.0`: Balanced orderbook (50% bids, 50% asks)
- `-0.5`: 25% bids, 75% asks (moderate sell pressure)
- `-1.0`: All asks, no bids (strong sell pressure)

### Best Practices

1. **Start with small limits**: Use `limit: 5-20` for initial exploration, then increase if needed
2. **Handle empty orderbooks**: Always check `empty_book` flag before accessing analytics
3. **Monitor spread percentage**: High spread percentage (> 5%) indicates low liquidity
4. **Use depth levels strategically**: Configure depth levels based on your typical order size
5. **Implement retry logic**: Handle `RATE_LIMITED` and `HORIZON_UNAVAILABLE` errors with exponential backoff
6. **Validate assets**: Ensure asset codes and issuers are correct before calling the tool
7. **Interpret imbalance carefully**: Orderbook imbalance is a signal, not a guarantee of price direction

### Related Tools

- `get_account_balance`: Check account balances before trading
- `simulate_transaction`: Simulate trades before execution
- `submit_transaction`: Execute trades on the Stellar DEX

---

*For the complete AI-ready tool schema, see [docs/tools/get_orderbook.schema.json](./tools/get_orderbook.schema.json)*

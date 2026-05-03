# Storage Optimization for Large Maps

> Issue #180 — Implemented in `src/tools/analyze_contract_storage.ts`

---

## Overview

Soroban contract storage is metered: every byte stored on-chain incurs **ledger rent** that must be paid periodically or the entry is evicted. Large maps — the most common pattern for contract state — are the primary cause of runaway storage costs because:

1. Each ledger entry is serialised as XDR and its byte length is the billing unit.
2. A map with *N* keys encodes as roughly O(N × avg\_key\_size + N × avg\_value\_size) bytes **per entry**.
3. Instance storage is loaded on **every** contract invocation regardless of which function is called.

The `analyze_contract_storage` MCP tool surfaces these hot spots and recommends concrete refactors.

---

## Tool: `analyze_contract_storage`

### Input

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `contract_id` | `string` | ✅ | — | Soroban contract address (`C…`, 56 chars) |
| `network` | `string` | — | config | `mainnet` \| `testnet` \| `futurenet` \| `custom` |
| `additional_keys` | `string[]` | — | — | Base64-encoded XDR ledger keys to analyse alongside the instance entry (max 50) |
| `size_threshold_bytes` | `integer` | — | `1024` | Entries larger than this are flagged as oversized |
| `include_recommendations` | `boolean` | — | `true` | Whether to include the recommendations array |

### Output

```jsonc
{
  "contract_id": "CABC…",
  "network": "testnet",
  "latest_ledger": 1234567,
  "entries": [
    {
      "key_xdr": "<base64 XDR>",
      "key_type": "contractData",
      "value_size_bytes": 4096,
      "live_until_ledger": 2000000,
      "last_modified_ledger": 1200000,
      "is_oversized": true,
      "storage_type": "instance",   // instance | persistent | temporary | unknown
      "top_level_map_keys": 120,    // present only when value is a map
      "nested_maps": 3              // present only when value is a map
    }
  ],
  "summary": {
    "total_entries": 1,
    "total_size_bytes": 4096,
    "oversized_entries": 1,
    "instance_entries": 1,
    "persistent_entries": 0,
    "temporary_entries": 0,
    "estimated_rent_fee_100_ledgers_stroops": 400   // illustrative – see note
  },
  "recommendations": [
    {
      "severity": "high",           // high | medium | low
      "category": "chunking",       // chunking | ttl | storage_type | deduplication
      "message": "…",
      "affected_key": "AAAB…"
    }
  ]
}
```

> **Note on fee estimate**: `estimated_rent_fee_100_ledgers_stroops` uses simplified CAP-0046 constants. It is intended as an order-of-magnitude guide, not a live fee quote. Use `simulate_transaction` for accurate fee calculations.

---

## Optimisation Patterns

### 1. Paginated map storage (chunking)

**Problem**: Storing all map entries in a single ledger entry means paying for the entire map on every read or write, even when only one key is needed.

**Pattern**: Split the map into pages stored under indexed keys, with a separate size counter.

```rust
// ❌  Anti-pattern — one entry, grows indefinitely
env.storage().persistent().set(&Symbol::new(&env, "data"), &map);

// ✅  Paginated pattern — O(page_size) bytes per entry
const PAGE_SIZE: u32 = 50;

fn page_key(env: &Env, n: u32) -> Symbol {
    Symbol::new(env, &format!("data_page_{}", n))
}

fn map_len_key(env: &Env) -> Symbol {
    Symbol::new(env, "data_len")
}

fn set_entry(env: &Env, index: u32, value: Val) {
    let page = index / PAGE_SIZE;
    let mut page_map: Map<u32, Val> = env
        .storage()
        .persistent()
        .get(&page_key(env, page))
        .unwrap_or(Map::new(env));
    page_map.set(index % PAGE_SIZE, value);
    env.storage().persistent().set(&page_key(env, page), &page_map);
}
```

### 2. Move cold data from instance to persistent storage

**Problem**: `instance()` storage is loaded on every contract call, even for data accessed once a month.

**Pattern**: Keep only hot, frequently-read state in instance storage; move cold state to persistent.

```rust
// ❌  Anti-pattern — historical data in instance storage
env.storage().instance().set(&Symbol::new(&env, "history"), &history_vec);

// ✅  Cold data in persistent storage
env.storage().persistent().set(&Symbol::new(&env, "history"), &history_vec);
// Bump TTL explicitly to avoid eviction:
env.storage().persistent().extend_ttl(
    &Symbol::new(&env, "history"),
    MIN_TTL_LEDGERS,
    MAX_TTL_LEDGERS,
);
```

### 3. Temporary storage for short-lived data

**Problem**: Using persistent storage for data that is only valid for a short time (swap reserves, nonces, session tokens) causes unnecessary rent accumulation.

**Pattern**: Use `temporary()` storage; it expires automatically without requiring a TTL-bump transaction.

```rust
// ✅  Temporary storage for short-lived entries
env.storage().temporary().set(&nonce_key, &nonce_value);
// Automatic expiry — no manual cleanup required
```

### 4. TTL management

**Problem**: Persistent entries expire if rent is not paid, causing data loss.

**Pattern**: Bump TTL proactively inside contract functions that are called regularly, and also from off-chain using `extendFootprintTtl`.

```rust
// In your contract — bump on every write
let key = Symbol::new(&env, "state");
env.storage().persistent().set(&key, &value);
env.storage().persistent().extend_ttl(&key, 100_000, 500_000);
```

Off-chain (via Pulsar `submit_transaction`):
```ts
// Build a TransactionBuilder with an extendFootprintTtl operation,
// simulate it first, then submit.
```

---

## Running the Tool

Via the MCP server (AI assistant):

```json
{
  "tool": "analyze_contract_storage",
  "arguments": {
    "contract_id": "CABC…",
    "network": "testnet",
    "size_threshold_bytes": 512,
    "include_recommendations": true
  }
}
```

---

## Testing

```bash
# Unit tests (no network required)
npm test tests/unit/analyze_contract_storage.test.ts

# All unit tests
npm test

# Coverage report
npm run test:coverage
```

---

## References

- [CAP-0046 — Smart Contract Standardized Asset](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-01.md)
- [Soroban Storage Docs](https://developers.stellar.org/docs/build/smart-contracts/getting-started/storing-data)
- [extendFootprintTtl Operation](https://developers.stellar.org/docs/learn/encyclopedia/network-configuration/resource-limits-fees#ttl-extension)

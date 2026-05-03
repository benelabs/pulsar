# Soulbound Token (SBT) Tool

Build unsigned Soroban transaction XDR for non-transferable identity or reputation token operations.

## Overview

Soulbound Tokens are non-transferable by design — the on-chain contract enforces this. This tool constructs the transaction XDR for three operations:

| Action | Contract function | Description |
|--------|------------------|-------------|
| `mint` | `mint(recipient, token_id, metadata)` | Issue a new SBT to a recipient |
| `revoke` | `revoke(token_id)` | Revoke a previously issued token |
| `query` | `has_token(recipient)` | Check whether an address holds a token |

The tool returns unsigned XDR — pass it to `submit_transaction` after signing.

## Usage

```typescript
import { soulboundToken } from './tools/soulbound_token.js';

// Mint
const mint = await soulboundToken({
  action: 'mint',
  contract_id: 'C...',
  source_account: 'G...',
  recipient: 'G...',
  metadata: JSON.stringify({ role: 'member' }),
  network: 'testnet',          // optional, defaults to config
  token_id: 'custom-id-001',   // optional, auto-generated if omitted
});
// → { action, transaction_xdr, contract_id, recipient, token_id, network }

// Revoke
const revoke = await soulboundToken({
  action: 'revoke',
  contract_id: 'C...',
  source_account: 'G...',
  token_id: 'custom-id-001',
});

// Query (simulate-ready XDR)
const query = await soulboundToken({
  action: 'query',
  contract_id: 'C...',
  source_account: 'G...',
  recipient: 'G...',
});
```

## Input Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `'mint' \| 'revoke' \| 'query'` | ✅ | Operation to perform |
| `contract_id` | `string` (Stellar contract address) | ✅ | Deployed SBT contract |
| `source_account` | `string` (Stellar public key) | ✅ | Fee/sequence source |
| `recipient` | `string` | mint, query | Recipient address |
| `token_id` | `string` | revoke; optional for mint | Token identifier |
| `metadata` | `string` | mint | Arbitrary token metadata (JSON recommended) |
| `network` | `'testnet' \| 'mainnet' \| 'futurenet'` | ❌ | Defaults to `config.stellarNetwork` |

## Output

```typescript
{
  action: 'mint' | 'revoke' | 'query';
  transaction_xdr?: string;   // unsigned XDR — sign then submit
  contract_id: string;
  recipient?: string;
  token_id?: string;
  network: string;
}
```

## Error Handling

| Error | Cause |
|-------|-------|
| `PulsarValidationError` | Invalid input (bad address, missing required field, unknown action) |
| `PulsarNetworkError` | Source account not found on ledger or Horizon unreachable |

## Security Notes

- The tool only builds XDR — it never signs or submits.
- Non-transferability is enforced by the on-chain contract, not this tool.
- `token_id` is auto-generated (UUID without hyphens) when omitted for `mint`.

## Tests

- Unit: `tests/unit/soulbound_token.test.ts` — 17 tests, no network required
- Integration: `tests/integration/soulbound_token.test.ts` — set `RUN_INTEGRATION_TESTS=true`

---

*See also: [Soroban Smart Contracts](https://developers.stellar.org/docs/smart-contracts)*

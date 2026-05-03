# Network Partition Detection

## Overview

The `check_network_status` tool probes Horizon and Soroban RPC connectivity for the configured (or specified) Stellar network and returns a structured diagnostic report. It is designed to be called by AI assistants before or after transaction failures to surface actionable root-cause information.

## Tool: `check_network_status`

### Input Schema

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `network` | `"mainnet" \| "testnet" \| "futurenet" \| "custom"` | No | Configured network | Override the network to probe |
| `timeout_ms` | `number` (500 – 30 000) | No | `8000` | Per-probe timeout in milliseconds |

### Output Schema

```jsonc
{
  "status": "healthy" | "degraded",          // "healthy" = no partition; "degraded" = partial partition
  "partition_severity": "none" | "partial" | "full",
  "any_reachable": true,
  "network": "testnet",
  "summary": "All endpoints on testnet are reachable. No partition detected.",
  "remediation": [],                          // Non-empty when issues are detected
  "horizon": {
    "url": "https://horizon-testnet.stellar.org",
    "status": "reachable",                    // reachable | timeout | unreachable | degraded
    "latency_ms": 142,
    "http_status": 200,
    "message": "Endpoint healthy (142 ms)",
    "probed_at": "2026-04-29T10:00:00.000Z"
  },
  "soroban_rpc": {
    "url": "https://soroban-testnet.stellar.org",
    "status": "reachable",
    "latency_ms": 98,
    "http_status": 200,
    "message": "Endpoint healthy (98 ms)",
    "probed_at": "2026-04-29T10:00:00.000Z"
  }
}
```

When a **full partition** is detected (both endpoints unreachable), the tool throws a `PulsarPartitionError` (`PARTITION_DETECTED` error code) so the MCP server surfaces it as an `isError: true` response with the full diagnostic payload in `details`.

### Partition Severity Levels

| Severity | Meaning |
|---|---|
| `none` | Both Horizon and Soroban RPC are reachable |
| `partial` | Exactly one endpoint is reachable |
| `full` | Neither endpoint is reachable |

### Endpoint Status Values

| Status | Meaning |
|---|---|
| `reachable` | HTTP 2xx received within timeout |
| `timeout` | Request aborted after `timeout_ms` |
| `unreachable` | Connection refused, DNS failure, or other network error |
| `degraded` | HTTP 5xx received (server-side error) |

## Architecture

### New Files

| File | Purpose |
|---|---|
| `src/services/network-monitor.ts` | Core probe logic — `checkNetworkStatus()` |
| `src/tools/check_network_status.ts` | MCP tool handler |
| `src/schemas/tools.ts` | `CheckNetworkStatusInputSchema` added |
| `tests/unit/check_network_status.test.ts` | Unit tests (mocked fetch) |
| `tests/integration/check_network_status.test.ts` | Integration tests (real Testnet) |

### Modified Files

| File | Change |
|---|---|
| `src/errors.ts` | Added `PARTITION_DETECTED` error code and `PulsarPartitionError` class |
| `src/index.ts` | Registered `check_network_status` tool |

### Probe Strategy

- **Horizon**: `GET /fee_stats` — lightweight, always available, no auth required.
- **Soroban RPC**: `POST /` with `{"jsonrpc":"2.0","method":"getHealth","params":[]}` — standard JSON-RPC health check.
- Both probes run **concurrently** via `Promise.all` to minimise total latency.
- Each probe is bounded by an `AbortController` timer set to `timeout_ms`.

## Usage Examples

### Check default network health

```json
{
  "tool": "check_network_status",
  "arguments": {}
}
```

### Check mainnet with a tighter timeout

```json
{
  "tool": "check_network_status",
  "arguments": {
    "network": "mainnet",
    "timeout_ms": 5000
  }
}
```

## Error Handling

| Scenario | Behaviour |
|---|---|
| Both endpoints reachable | Returns `status: "healthy"` |
| One endpoint unreachable | Returns `status: "degraded"` with `partition_severity: "partial"` |
| Both endpoints unreachable | Throws `PulsarPartitionError` (`PARTITION_DETECTED`) with full diagnostic payload in `details` |
| Invalid input | Throws `PulsarValidationError` (`VALIDATION_ERROR`) |

## Running Tests

```bash
# Unit tests only (no network required)
npm test

# Integration tests (requires network access to Stellar Testnet)
RUN_INTEGRATION_TESTS=true npm run test:integration
```

## Environment Variables

No new environment variables are required. The tool reuses the existing `STELLAR_NETWORK`, `HORIZON_URL`, and `SOROBAN_RPC_URL` configuration.

## Performance

Each call makes two concurrent HTTP requests. On a healthy network, total latency is dominated by the slower of the two probes (typically 50–300 ms on Testnet). The default `timeout_ms` of 8 000 ms ensures the tool always returns within a predictable window.

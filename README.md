# pulsar

> A community-built **Model Context Protocol (MCP) server** that gives AI coding assistants native, real-time access to the Stellar network and Soroban smart contracts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Protocol](https://img.shields.io/badge/MCP-1.0-blue)](https://modelcontextprotocol.io)
[![Stellar Network](https://img.shields.io/badge/Stellar-Mainnet%20%7C%20Testnet-purple)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Soroban-Smart%20Contracts-orange)](https://soroban.stellar.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Table of Contents

- [Overview](#overview)
- [Why pulsar Exists](#why-pulsar-exists)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [From Source (TypeScript)](#from-source-typescript)
  - [NPX (No Install)](#npx-no-install)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Network Selection](#network-selection)
  - [Monitoring with Prometheus Metrics](#monitoring-with-prometheus-metrics)
- [Connecting to AI Assistants](#connecting-to-ai-assistants)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Any MCP-Compatible Client](#any-mcp-compatible-client)
- [Tools Reference](#tools-reference)
  - [get_account_balance](#get_account_balance)
  - [search_assets](#search_assets)
  - [fetch_contract_spec](#fetch_contract_spec)
  - [simulate_transaction](#simulate_transaction)
  - [get_contract_storage](#get_contract_storage)
  - [decode_ledger_entry](#decode_ledger_entry)
  - [submit_transaction](#submit_transaction)
  - [build_transaction](#build_transaction)
  - [soroban_math](#soroban_math)
  - [compute_vesting_schedule](#compute_vesting_schedule)
  - [deploy_contract](#deploy_contract)
  - [track_ledger_consensus_time](#track_ledger_consensus_time)
  - [get_network_params](#get_network_params)
  - [optimize_contract_bytecode](#optimize_contract_bytecode)
  - [get_protocol_version](#get_protocol_version)
  - [amm](#amm)
  - [get_token_transfer_fee](#get_token_transfer_fee)
- [Example Prompts & Workflows](#example-prompts--workflows)
- [Soroban CLI Integration](#soroban-cli-integration)
- [Development Guide](#development-guide)
  - [Project Structure](#project-structure)
  - [Adding a New Tool](#adding-a-new-tool)
  - [Running Locally](#running-locally)
  - [Testing](#testing)
- [Monitoring](#monitoring)
- [Security Considerations](#security-considerations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Related Projects](#related-projects)
- [License](#license)

---

## Overview

**pulsar** is a community-built [Model Context Protocol](https://modelcontextprotocol.io) server that bridges AI coding assistants — Cursor, Claude Desktop, Windsurf, and any other MCP-compatible client — directly to the Stellar network and Soroban smart contract platform.

Instead of pasting raw JSON into prompts or copying balances from a block explorer, you can ask your AI assistant:

> _"What is the XLM balance of `GBBD...`?"_  
> _"Simulate submitting this Soroban transaction and tell me what it returns."_  
> _"Fetch the ABI spec for contract `CA3D...` and write me a TypeScript client for it."_

pulsar handles all the low-level RPC calls, XDR encoding/decoding, and Soroban CLI invocations on your behalf, returning clean, structured data that the AI can immediately reason about.

---

## Why pulsar Exists

The Stellar Developer Foundation is building **Stella** — a headless AI assistant that can answer Stellar questions and help builders across platforms. That's a great initiative. But it is a centralised, SDF-maintained tool.

There is currently **no community-driven MCP server** for Stellar, which means:

- AI assistants cannot query live account balances without custom function-calling setups per project.
- Simulating Soroban transactions requires copy-pasting XDR blobs and running CLI commands manually.
- Fetching and interpreting contract ABI specs (the Soroban contract interface) requires a developer to decode them by hand.
- AI-assisted onboarding for new Stellar builders involves pointing the AI at docs instead of letting it directly introspect the chain.

**pulsar closes that gap.** It is the community answer: an open, self-hostable MCP server that any developer can run alongside their editor in under two minutes.

---

## Features

| Capability                       | Details                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Account Balances**             | Query XLM and any issued asset balance for any account on Mainnet or Testnet                    |
| **Contract Spec Fetching**       | Retrieve the full ABI/interface spec of any deployed Soroban contract                           |
| **Transaction Simulation**       | Dry-run a Soroban transaction and inspect resource usage and return values before spending fees |
| **Ledger Entry Decoding**        | Decode raw XDR ledger entries into human-readable JSON                                          |
| **Transaction Submission**       | Sign (via a provided secret key or external signer) and submit transactions to the network      |
| **Contract Deployment**          | Deploy Soroban smart contracts via built-in deployer or factory contracts                       |
| **Vesting Schedule Computation** | Calculate token vesting / timelock release schedules for team, investors, and advisors          |
| **Network Parameters**           | Fetch Soroban network resource weights, fee thresholds, and inflation parameters                |
| **Multi-network**                | Targets Mainnet, Testnet, Futurenet, or a custom RPC endpoint                                   |
| **Soroban CLI Backend**          | Delegates complex operations to the official `stellar` / `soroban` CLI for maximum correctness  |
| **Structured Output**            | All tool responses are typed JSON objects the AI can directly parse and act upon                |
| **Zero-dependency transport**    | Uses standard MCP stdio transport — no extra HTTP server required                               |
| Capability | Details |
|---|---|
| **Account Balances** | Query XLM and any issued asset balance for any account on Mainnet or Testnet |
| **Liquidity Pool Queries** | Fetch AMM pool reserves, shares, and fee settings from Horizon |
| **Network Fee Statistics** | Retrieve recent fee percentiles and recommended transaction fees |
| **Asset Discovery** | Search for Stellar assets by code, issuer, or reputation scores via Stellar Expert / Horizon |
| **Contract Spec Fetching** | Retrieve the full ABI/interface spec of any deployed Soroban contract |
| **Transaction Simulation** | Dry-run a Soroban transaction and inspect resource usage and return values before spending fees |
| **Ledger Entry Decoding** | Decode raw XDR ledger entries into human-readable JSON |
| **Transaction Submission** | Sign (via a provided secret key or external signer) and submit transactions to the network |
| **Transaction Build Helper** | Construct common Stellar transactions (payment, trustline, manage data, etc.) without raw XDR knowledge |
| **Soroban Math** | Fixed-point arithmetic, statistical functions (mean, std dev, TWAP), and financial math (compound interest, basis points) compatible with Soroban's 7-decimal integer model |
| **Contract Deployment** | Deploy Soroban smart contracts via built-in deployer or factory contracts |
| **Protocol Version Info** | Track network upgrades and feature availability across different networks |
| **Vesting Schedule Computation** | Calculate token vesting / timelock release schedules for team, investors, and advisors |
| **Ledger Consensus Tracking** | Sample recent ledgers and report average, min, max, and std-dev of inter-ledger close times |
| **Automated Market Maker (AMM)** | Interact with constant-product (x*y=k) AMM pools: swap tokens, add/remove liquidity, get quotes |
| **Fee-on-Transfer Detection** | Simulate transfers to detect hidden fees or explicit Fee-on-Transfer logic |
| **Multi-network** | Targets Mainnet, Testnet, Futurenet, or a custom RPC endpoint |
| **Latency-Based RPC Routing** | Automatically route Soroban RPC calls to the fastest healthy endpoint when multiple are configured |
| **Soroban CLI Backend** | Delegates complex operations to the official `stellar` / `soroban` CLI for maximum correctness |
| **Structured Output** | All tool responses are typed JSON objects the AI can directly parse and act upon |
| **Zero-dependency transport** | Uses standard MCP stdio transport — no extra HTTP server required |

---

## Architecture

```
┌─────────────────────────────────────┐
│          AI Coding Assistant        │
│  (Cursor / Claude Desktop / Windsurf│)
└────────────────┬────────────────────┘
                 │  MCP (stdio / SSE)
                 ▼
┌─────────────────────────────────────┐
│               pulsar                │
│  ┌──────────┐  ┌──────────────────┐ │
│  │Tool Layer│  │  Schema / Types  │ │
│  └────┬─────┘  └──────────────────┘ │
│       │                             │
│  ┌────▼──────────────────────────┐  │
│  │         Service Layer         │  │
│  │  Horizon Client  │  RPC Client│  │
│  │  Soroban CLI     │  XDR Codec │  │
│  └────┬─────────────────────┬────┘  │
└───────┼─────────────────────┼───────┘
        │                     │
        ▼                     ▼
┌──────────────┐    ┌──────────────────┐
│ Stellar      │    │  Soroban RPC     │
│ Horizon API  │    │  (Mainnet /      │
│ (REST)       │    │   Testnet / etc) │
└──────────────┘    └──────────────────┘
```

**Key design choices:**

- **stdio transport** — The server communicates over stdin/stdout, which means any MCP host can spawn it as a child process without needing a port or firewall rule.
- **Soroban CLI as a backend** — Rather than re-implementing XDR serialisation from scratch, the server shells out to the official `stellar` CLI for operations that require it, ensuring byte-level correctness.
- **Horizon + Soroban RPC** — Account data is fetched from Horizon (the REST layer), while contract interaction goes through the Soroban JSON-RPC endpoint.
- **Zod schemas** — Every tool input and output is validated with [Zod](https://zod.dev) at runtime, preventing malformed data from reaching the network.
- **Central output contracts** — Tool outputs are validated in a shared dispatcher path (`TOOL_OUTPUT_SCHEMAS`) before being returned to MCP clients, ensuring contract consistency across all tools.

---

## Prerequisites

Before you start, ensure the following are installed on your machine:

### Required

| Dependency                  | Version | Install                          |
| --------------------------- | ------- | -------------------------------- |
| **Node.js**                 | ≥ 18    | [nodejs.org](https://nodejs.org) |
| **npm**                     | ≥ 9     | Bundled with Node.js             |
| **Stellar CLI** (`stellar`) | ≥ 21    | See below                        |

### Installing the Stellar CLI

The Stellar CLI (which includes `soroban` commands) is the official tool maintained by SDF.

**macOS / Linux (via Homebrew):**

```bash
brew install stellar-cli
```

**macOS / Linux (via cargo):**

```bash
cargo install --locked stellar-cli --features opt
```

**Verify installation:**

```bash
stellar --version
# stellar 21.x.x
```

> **Note:** If you only plan to use `get_account_balance` and `fetch_contract_spec`, the Stellar CLI is optional. It is required for `simulate_transaction` and `submit_transaction`.

### Optional

| Dependency       | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| **jq**           | Pretty-printing JSON in shell examples              |
| **Rust + cargo** | Only needed if building the Stellar CLI from source |

---

## Installation

### From Source (TypeScript)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/pulsar.git
cd pulsar

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. (Optional) Link globally so any MCP host can find it
npm link
```

After linking, the `pulsar` binary is available system-wide:

```bash
pulsar --version
```

### NPX (No Install)

You can run the server directly without cloning via npx once the package is published:

```bash
npx pulsar
```

This is the recommended approach for editor plugin configurations (see [Connecting to AI Assistants](#connecting-to-ai-assistants)).

### Docker

You can also run pulsar using Docker:

```bash
# Pull the image from GitHub Container Registry
docker pull ghcr.io/benelabs/pulsar:latest

# Run with environment variables
docker run --rm -e STELLAR_NETWORK=testnet ghcr.io/benelabs/pulsar:latest

# Run with a custom .env file
docker run --rm --env-file .env ghcr.io/benelabs/pulsar:latest
```

#### Building from Source

```bash
# Build the Docker image
docker build -t pulsar .

# Run the container
docker run --rm -e STELLAR_NETWORK=testnet pulsar
```

#### Docker Compose

For local development with environment variable passthrough:

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your configuration

# Run with docker-compose
docker-compose up
```

The `docker-compose.yml` includes:

- Environment variable passthrough from `.env`
- Resource limits (512MB memory, 1 CPU max)
- Non-root user execution
- Automatic restart policy

---

## Configuration

### Environment Variables

Create a `.env` file in the project root (or set these variables in your shell / editor config):

```env
# ─── Network ────────────────────────────────────────────────────────────────
# Options: mainnet | testnet | futurenet | custom
STELLAR_NETWORK=testnet

# Override the Horizon REST endpoint (optional)
HORIZON_URL=https://horizon-testnet.stellar.org

# Override the Soroban RPC endpoint (optional)
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Comma-separated list of Soroban RPC endpoints for latency-based routing.
# If provided, pulsar will automatically route requests to the fastest healthy endpoint.
# Example: SOROBAN_RPC_URLS=https://rpc1.example.com,https://rpc2.example.com
SOROBAN_RPC_URLS=

# ─── Signing (optional — required only for submit_transaction) ───────────────
# WARNING: Never commit a funded secret key to version control.
# Use a dedicated low-value keypair for development.
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ─── Soroban CLI ────────────────────────────────────────────────────────────
# Path to the stellar/soroban CLI binary (auto-detected if on PATH)
STELLAR_CLI_PATH=stellar

# ─── Server ─────────────────────────────────────────────────────────────────
# Log level: error | warn | info | debug | trace
LOG_LEVEL=info

# Tool execution audit log path (defaults to audit.log)
AUDIT_LOG_PATH=audit.log
# ─── Metrics (optional) ──────────────────────────────────────────────────────
# Enable Prometheus metrics export (default: true)
METRICS_ENABLED=true

# Port for metrics HTTP endpoint (default: 9090)
METRICS_PORT=9090
# ─── RPC Routing ─────────────────────────────────────────────────────────────
# Health check interval in milliseconds (default: 30000)
# RPC_HEALTH_CHECK_INTERVAL_MS=30000

# Maximum acceptable latency for an RPC endpoint in milliseconds before marking it unhealthy (default: 2000)
# RPC_LATENCY_THRESHOLD_MS=2000
```

Logs are emitted as structured JSON to stderr to keep MCP stdout clean.

> **Security note:** `STELLAR_SECRET_KEY` is optional and only used by `submit_transaction`. If not set, that tool will return an unsigned XDR blob that you can sign externally. Never use a funded Mainnet key during development — use a throwaway Testnet keypair funded via [Friendbot](https://friendbot.stellar.org).

### Network Selection

| `STELLAR_NETWORK` value | Horizon URL                             | Soroban RPC URL                       |
| ----------------------- | --------------------------------------- | ------------------------------------- |
| `mainnet`               | `https://horizon.stellar.org`           | `https://soroban-rpc.stellar.org`     |
| `testnet`               | `https://horizon-testnet.stellar.org`   | `https://soroban-testnet.stellar.org` |
| `futurenet`             | `https://horizon-futurenet.stellar.org` | `https://rpc-futurenet.stellar.org`   |
| `custom`                | `HORIZON_URL` env var                   | `SOROBAN_RPC_URL` env var             |

### Monitoring with Prometheus Metrics

pulsar exposes Prometheus metrics on a dedicated HTTP endpoint for real-time monitoring and alerting.

#### Metrics Endpoint

When `METRICS_ENABLED=true` (default), metrics are available at:

```
http://localhost:9090/metrics
```

The endpoint returns metrics in standard Prometheus text format.

#### Available Metrics

**Tool Execution Metrics:**
- `pulsar_tool_invocations_total` (counter) — Total tool invocations by tool name and status (success/error)
- `pulsar_tool_duration_seconds` (histogram) — Tool execution duration in seconds (per tool)
- `pulsar_tool_errors_total` (counter) — Total tool errors by tool name and error type
- `pulsar_validation_errors_total` (counter) — Input validation errors per tool
- `pulsar_active_tool_invocations` (gauge) — Current number of active tool invocations

**System Metrics:**
- `pulsar_heap_memory_used_bytes` (gauge) — Current heap memory usage in bytes
- `pulsar_heap_memory_total_bytes` (gauge) — Total heap memory allocated in bytes
- `pulsar_process_*` (various) — Standard Node.js process metrics (uptime, CPU, file descriptors, etc.)

**Network Metrics:**
- `pulsar_network_requests_total` (counter) — Total network requests by service (horizon, soroban-rpc) and status
- `pulsar_network_duration_seconds` (histogram) — Network request duration by service

#### Health Check Endpoint

A simple health check endpoint is available at:

```
GET http://localhost:9090/health
```

Returns:
```json
{
  "status": "ok",
  "uptime": 123.456
}
```

#### Scraping with Prometheus

Configure Prometheus to scrape pulsar metrics by adding to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'pulsar'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
    scrape_timeout: 10s
```

#### Disabling Metrics

To disable metrics export (e.g., for reduced overhead), set:

```env
METRICS_ENABLED=false
```

The HTTP metrics endpoint will not be started, and metrics collection is skipped.

---

## Connecting to AI Assistants

pulsar uses the **stdio transport** — the server is launched as a child process by the AI assistant and communicates over stdin/stdout. No ports, no firewall changes, no extra services.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pulsar": {
      "command": "npx",
      "args": ["-y", "pulsar"],
      "env": {
        "STELLAR_NETWORK": "testnet",
        "LOG_LEVEL": "warn"
      }
    }
  }
}
```

If you cloned and built from source:

```json
{
  "mcpServers": {
    "pulsar": {
      "command": "node",
      "args": ["/absolute/path/to/pulsar/dist/index.js"],
      "env": {
        "STELLAR_NETWORK": "testnet"
      }
    }
  }
}
```

Restart Claude Desktop. You should see **pulsar** appear in the tool list (hammer icon).

### Cursor

Open Cursor Settings → **Features** → **MCP Servers** → **Add new MCP server**.

- **Name:** `pulsar`
- **Type:** `command`
- **Command:** `npx -y pulsar`

Or, edit `.cursor/mcp.json` in your project root for project-local configuration:

```json
{
  "mcpServers": {
    "pulsar": {
      "command": "npx",
      "args": ["-y", "pulsar"],
      "env": {
        "STELLAR_NETWORK": "testnet"
      }
    }
  }
}
```

### Windsurf

Open the Windsurf settings panel → **MCP** → **Add Server**:

```json
{
  "pulsar": {
    "command": "npx",
    "args": ["-y", "pulsar"],
    "env": {
      "STELLAR_NETWORK": "testnet"
    }
  }
}
```

### Any MCP-Compatible Client

pulsar speaks the standard MCP protocol over stdio. To connect any MCP client:

```bash
# Spawn the server manually to test it
node dist/index.js

# Send a raw list-tools request (for debugging)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

---

## Tools Reference

All tools accept and return JSON objects. Inputs are validated with Zod; invalid inputs return a structured MCP error before any network call is made.

---

### `get_account_balance`

Retrieve the XLM balance and all issued asset balances held by a Stellar account.

**Input:**

| Parameter      | Type     | Required | Description                                                                |
| -------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `account_id`   | `string` | Yes      | The Stellar public key (`G...`) or a federated address (`name*domain.com`) |
| `asset_code`   | `string` | No       | Filter results to a specific asset code, e.g. `USDC`                       |
| `asset_issuer` | `string` | No       | The issuer public key for the filtered asset                               |

**Output:**

```jsonc
{
  "account_id": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "sequence": "12345678901",
  "subentry_count": 3,
  "balances": [
    {
      "asset_type": "native",
      "asset_code": "XLM",
      "balance": "9842.1234567",
      "buying_liabilities": "0.0000000",
      "selling_liabilities": "0.0000000"
    },
    {
      "asset_type": "credit_alphanum4",
      "asset_code": "USDC",
      "asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "balance": "250.0000000",
      "limit": "922337203685.4775807",
      "is_authorized": true
    }
  ],
  "network": "testnet"
}
```

**Example prompt:**

> _"Check the balance of account `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` on testnet."_

---

### `get_fee_stats`

Retrieve recent network fee statistics from Horizon to help estimate optimal transaction fees. Returns minimum, maximum, average, and percentile (p10–p99) fee values in stroops, along with a recommended fee based on the median (p50).
### `search_assets`

Search for Stellar assets by code, issuer, or minimum reputation score. Uses `stellar.expert` if available for reputation scoring and enhanced search; otherwise falls back to Horizon's `/assets` endpoint.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `network` | `string` | No | Override the network for this call (`mainnet`, `testnet`, `futurenet`, `custom`) |
|---|---|---|---|
| `asset_code` | `string` | No | Filter by asset code (e.g. `USDC`) |
| `asset_issuer` | `string` | No | Filter by asset issuer public key (`G...`) |
| `min_reputation_score` | `number` | No | Minimum reputation score/rating (0-10) to filter by. Requires `stellar.expert` resolution. |
| `network` | `string` | No | Override the configured network for this call |

**Output:**

```jsonc
{
  "min_accepted_fee": "100",
  "max_accepted_fee": "10000",
  "avg_accepted_fee": "5000",
  "p_10": "1000",
  "p_20": "1500",
  "p_30": "2000",
  "p_40": "2500",
  "p_50": "3000",
  "p_60": "3500",
  "p_70": "4000",
  "p_80": "4500",
  "p_90": "5000",
  "p_95": "6000",
  "p_99": "8000",
  "last_ledger": "48234567",
  "last_ledger_base_fee": "100",
  "ledger_capacity_usage": 0.75,
  "recommended_fee_stroops": "3000",
  "network": "testnet"
}
```

`recommended_fee_stroops` is a sensible fee for typical transactions, using the median (p50) when available, falling back to the average or minimum if necessary.

**Example prompt:**

> _"What are the current recommended transaction fees on testnet?"_
> _"Show me the fee percentile distribution for mainnet."_

---

### `get_liquidity_pool`

Query AMM liquidity pool data including reserves, total shares, fee (in basis points), and pool type. Data is sourced from the Stellar Horizon API.

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `liquidity_pool_id` | `string` | Yes | The liquidity pool ID (e.g. `POOL_...`) |
| `network` | `string` | No | Override the network for this call (`mainnet`, `testnet`, `futurenet`, `custom`) |

**Output:**

```jsonc
{
  "liquidity_pool_id": "POOL_ABC123...",
  "fee_bp": 30,
  "type": "constant_product",
  "reserves": [
    { "asset": "XLM", "amount": "1000.1234567" },
    { "asset": "USDC:GA...", "amount": "500.0000000" }
  ],
  "total_shares": "2000.1234567",
  "network": "testnet"
}
```

- `fee_bp` is the pool fee expressed in basis points (1 bp = 0.01%, so 30 bp = 0.3%).
- `reserves` list the pooled assets and their amounts.
- `total_shares` is the total supply of pool shares.

**Example prompt:**

> _"Get the reserves and fee for liquidity pool POOL_XYZ on testnet."_
> _"What is the total share count for the USDC/XLM pool?"_
  "assets": [
    {
      "asset_code": "USDC",
      "asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "asset_type": "credit_alphanum4",
      "reputation_score": 9,
      "amount": "2670911892241840",
      "domain": "circle.com"
    }
  ]
}
```

**Example prompt:**

> _"Find all USDC assets on mainnet with a reputation score of at least 8."_

---

### `fetch_contract_spec`

Fetch the ABI interface specification of a deployed Soroban smart contract. Returns the full list of functions, their parameter types, and return types — in both raw XDR and decoded JSON form.

**Input:**

| Parameter     | Type     | Required | Description                                                            |
| ------------- | -------- | -------- | ---------------------------------------------------------------------- |
| `contract_id` | `string` | Yes      | The Soroban contract address (`C...`)                                  |
| `network`     | `string` | No       | Override the network for this call (`mainnet`, `testnet`, `futurenet`) |

**Output:**

```jsonc
{
  "contract_id": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
  "network": "testnet",
  "functions": [
    {
      "name": "transfer",
      "doc": "Transfer tokens from one account to another.",
      "inputs": [
        { "name": "from", "type": "Address" },
        { "name": "to", "type": "Address" },
        { "name": "amount", "type": "i128" }
      ],
      "outputs": [{ "type": "bool" }]
    },
    {
      "name": "balance",
      "inputs": [{ "name": "id", "type": "Address" }],
      "outputs": [{ "type": "i128" }]
    }
  ],
  "events": [
    {
      "name": "transfer",
      "topics": [{ "type": "Symbol" }, { "type": "Address" }, { "type": "Address" }],
      "data": { "type": "i128" }
    }
  ],
  "raw_xdr": "AAAAAgAAAA..."
}
```

**Example prompt:**

> _"Fetch the contract spec for `CA3D...` and write me a TypeScript SDK client that calls its `transfer` function."_

---

### `simulate_transaction`

Dry-run a Soroban transaction against the network without broadcasting it. Returns the simulated result, resource footprint (CPU, memory, ledger reads/writes), and the fee estimate. This is equivalent to calling `stellar contract invoke --dry-run` or the `simulateTransaction` Soroban RPC method.

**Input:**

| Parameter | Type     | Required | Description                                             |
| --------- | -------- | -------- | ------------------------------------------------------- |
| `xdr`     | `string` | Yes      | The base64-encoded transaction envelope XDR to simulate |
| `network` | `string` | No       | Override the network for this call                      |

**Output:**

```jsonc
{
  "status": "success",
  "return_value": {
    "type": "i128",
    "value": "1000000000"
  },
  "cost": {
    "cpu_instructions": 512340,
    "memory_bytes": 98304
  },
  "footprint": {
    "read_only": ["ledger_key_1_xdr", "ledger_key_2_xdr"],
    "read_write": ["ledger_key_3_xdr"]
  },
  "min_resource_fee": "12345",
  "events": [],
  "error": null
}
```

If the simulation fails (e.g. contract panics, insufficient balance), the `status` is `"error"` and the `error` field contains the diagnostic message from the contract.

**Example prompt:**

> _"Simulate this transaction XDR and tell me whether it will succeed and how much it will cost."_

---

### `simulate_transactions_sequence`

Simulate a sequence of Soroban transactions sequentially against the network. Iterates over an array of XDRs and returns a detailed array of results, errors, footprints, and fee estimates for each transaction.
### `get_contract_storage`

Fetch a Soroban contract storage entry by durability and key. Returns the raw ledger entry XDR plus TTL metadata when available. Use `decode_ledger_entry` to inspect the decoded fields.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `xdrs` | `array of strings` | Yes | An array of base64-encoded transaction envelope XDRs to simulate sequentially |
| `network` | `string` | No | Override the network for this sequence |

**Output:**

Returns an array of simulation outputs. Each element follows the same structure as `simulate_transaction` above, and includes a `status` field (`"SUCCESS"`, `"ERROR"`, or `"RESTORE_NEEDED"`).

**Example prompt:**

> _"Simulate this sequence of transaction XDRs sequentially and list their costs and any errors."_
| `contract_id` | `string` | Yes | The Soroban contract address (`C...`) |
| `storage_type` | `string` | Yes | `instance`, `persistent`, or `temporary` |
| `key` | `object` | No | Typed SCVal key for persistent/temporary storage, e.g. `{ type: "symbol", value: "Balance" }` |
| `network` | `string` | No | Override the network for this call |

**Output:**

```jsonc
{
  "contract_id": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
  "storage_type": "persistent",
  "key": { "type": "symbol", "value": "Balance" },
  "network": "testnet",
  "entries": [
    {
      "key_xdr": "AAAAAgAAAA...",
      "entry_xdr": "AAAABgAAAAEA...",
      "last_modified_ledger": 48123456,
      "live_until_ledger": 48199999
    }
  ]
}
```

**Example prompt:**

> _"Fetch the persistent storage entry for key `Balance` on contract `CA3D...` and decode it."_

---

### `decode_ledger_entry`

Decode a raw base64-encoded XDR ledger entry into a human-readable JSON structure. Useful for inspecting persistent storage slots of Soroban contracts, or debugging what is actually stored on-chain.

**Input:**

| Parameter    | Type     | Required | Description                                                                                  |
| ------------ | -------- | -------- | -------------------------------------------------------------------------------------------- |
| `xdr`        | `string` | Yes      | The base64-encoded XDR of the ledger entry (key or value)                                    |
| `entry_type` | `string` | No       | Hint for decoding: `account`, `trustline`, `contract_data`, `contract_code`, `offer`, `data` |
| Parameter | Type | Required | Description |
|---|---|---|---|
| `xdr` | `string` | Yes | The base64-encoded XDR of the ledger entry (key or value) |
| `entry_type` | `string` | No | Hint for decoding: `account`, `trustline`, `contract_data`, `contract_code`, `offer`, `data` |
| `compression.enabled` | `boolean` | No | Enable decompression pass for embedded base64 blobs in decoded ledger fields |
| `compression.algorithm` | `string` | No | Compression algorithm: `auto` (default), `gzip`, `deflate`, `brotli` |
| `compression.fields` | `string[]` | No | Dot-paths to fields to inspect (for example `val.data`); if omitted, common blob fields are auto-discovered |

**Output:**

```jsonc
{
  "entry_type": "contract_data",
  "decoded": {
    "contract": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
    "key": {
      "type": "Symbol",
      "value": "Balance"
    },
    "val": {
      "type": "Map",
      "value": [
        {
          "key": { "type": "Address", "value": "GBBD47IF..." },
          "val": { "type": "i128", "value": "5000000000" }
        }
      ]
    },
    "durability": "persistent",
    "last_modified_ledger": 48123456
  },
  "raw_xdr": "AAAABgAAAAEA...",
  "compression": {
    "enabled": true,
    "requested_algorithm": "auto",
    "inspected_fields": ["val.data"],
    "decompressed_fields": [
      {
        "path": "val.data",
        "algorithm": "gzip",
        "utf8": "{\"version\":1,\"blob\":\"...\"}",
        "byte_length": 26
      }
    ],
    "skipped_fields": []
  }
}
```

**Example prompt:**

> _"Decode this ledger entry XDR and explain what is stored in it: `AAAABgAAAAEA...`"_

---

### `submit_transaction`

Sign (optionally) and submit a transaction to the Stellar network. If `STELLAR_SECRET_KEY` is set in the environment, the server will sign the transaction before submission. If not set, you can pass an already-signed XDR and it will be submitted as-is.

> **Warning:** This tool irreversibly mutates state on the network. On Mainnet, it costs real XLM. Always simulate first.

**Input:**

| Parameter         | Type      | Required | Description                                                                                                     |
| ----------------- | --------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `xdr`             | `string`  | Yes      | The base64-encoded transaction envelope XDR (signed or unsigned)                                                |
| `network`         | `string`  | No       | Override the network for this submission                                                                        |
| `sign`            | `boolean` | No       | If `true` and `STELLAR_SECRET_KEY` is set, the server signs the transaction before submitting. Default: `false` |
| `wait_for_result` | `boolean` | No       | If `true`, polls until the transaction is confirmed and returns the final result. Default: `true`               |

**Output (success):**

```jsonc
{
  "status": "SUCCESS",
  "hash": "aabbccdd1122...",
  "ledger": 48123789,
  "created_at": "2026-03-16T14:30:00Z",
  "fee_charged": "1234",
  "return_value": {
    "type": "bool",
    "value": true
  },
  "result_xdr": "AAAAAAAAAGQ..."
}
```

**Output (failure):**

```jsonc
{
  "status": "FAILED",
  "hash": "aabbccdd1122...",
  "error_result_xdr": "AAAAAAAAAGT...",
  "diagnostic_events": [
    {
      "event": "contract error",
      "message": "HostError: Error(Contract, #1)"
    }
  ]
}
```

**Example prompt:**

> _"Submit this signed transaction XDR to testnet and tell me the result: `AAAA...`"_

---

### `build_transaction`

Construct common Stellar transaction types (payment, trustline, manage data, set options, account merge, create account) without requiring raw XDR knowledge. Returns unsigned transaction XDR ready for simulation and submission.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `source_account` | `string` | Yes | The Stellar public key (`G...`) that will sign the transaction and pay fees |
| `operations` | `array` | Yes | Array of operation objects (minimum 1). Each operation has a `type` and type-specific parameters |
| `fee` | `number` | No | Base fee in stroops per operation. Default: `100000` |
| `timeout` | `number` | No | Transaction timeout in seconds. Default: `30` |
| `network` | `string` | No | Override the network for this transaction |

**Supported Operation Types:**

#### Payment Operation
```jsonc
{
  "type": "payment",
  "destination": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "amount": 100.5,
  "asset_code": "USDC",        // Optional - omit for native XLM
  "asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"  // Required if asset_code provided
}
```

#### Change Trust Operation
```jsonc
{
  "type": "change_trust",
  "asset_code": "USDC",
  "asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "limit": "1000000"  // Optional - defaults to maximum uint64
}
```

#### Manage Data Operation
```jsonc
{
  "type": "manage_data",
  "name": "user_preference",
  "value": "dark_mode"  // Optional - omit to clear the entry
}
```

#### Set Options Operation
```jsonc
{
  "type": "set_options",
  "inflation_destination": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "home_domain": "example.com",
  "master_weight": 1,
  "low_threshold": 2,
  "med_threshold": 3,
  "high_threshold": 4,
  "signer_address": "GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6",
  "signer_type": "ed25519_public_key",
  "signer_weight": 1
}
```

#### Account Merge Operation
```jsonc
{
  "type": "account_merge",
  "destination": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
}
```

#### Create Account Operation
```jsonc
{
  "type": "create_account",
  "destination": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "starting_balance": 2.5
}
```
### `soroban_math`

Perform fixed-point arithmetic, statistical, and financial math operations using Soroban-compatible 7-decimal integer representations. All numeric values are passed as strings to preserve precision with large integers.

**Operations:**

| `operation` | Description | Key Parameters |
|---|---|---|
| `fixed_add` | Add two fixed-point numbers | `a`, `b`, `decimals` |
| `fixed_sub` | Subtract two fixed-point numbers | `a`, `b`, `decimals` |
| `fixed_mul` | Multiply two fixed-point numbers | `a`, `b`, `decimals` |
| `fixed_div` | Divide two fixed-point numbers | `a`, `b`, `decimals` |
| `mean` | Arithmetic mean of a list of values | `values[]`, `decimals` |
| `weighted_mean` | Weighted mean of values with corresponding weights | `values[]`, `weights[]`, `decimals` |
| `std_dev` | Population standard deviation | `values[]` (≥ 2), `decimals` |
| `twap` | Time-weighted average price | `prices[]{price, timestamp}` (≥ 2), `decimals` |
| `compound_interest` | Compound interest final amount | `principal`, `rate_bps`, `periods`, `compounds_per_period`, `decimals` |
| `basis_points_to_percent` | Convert basis points to a percentage | `value` |
| `percent_to_basis_points` | Convert a percentage to basis points | `value` |

**Common Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `operation` | `string` | Yes | One of the operation names above |
| `decimals` | `integer` | No | Fixed-point decimal places (0–18, default `7` — Stellar's standard) |

**Output:**

```jsonc
{
  "transaction_xdr": "AAAAAgAAAABGDW...==",
  "network": "testnet",
  "source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "operations": [
    {
      "type": "payment",
      "description": "Payment of 100.5 XLM to GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6"
    }
  ],
  "fee": "100000",
  "timeout": 30
}
```

**Example prompts:**

> _"Build a transaction to send 10 XLM from my account to `GBBD47IF...` on testnet"_
> _"Create a trustline for USDC issued by `GA5ZSEJY...` with a limit of 1000"_
> _"Build a transaction that creates a new account with 2 XLM starting balance"_

---

  "operation": "fixed_mul",
  "result": "10000000",     // raw integer string
  "human_readable": "1.0000000",
  "decimals": 7
}
```

For `basis_points_to_percent` / `percent_to_basis_points` the output contains only `operation` and `result` (a number, not a fixed-point integer).

**Example prompt:**

> _"What is the compound interest on a principal of 1,000 USDC at 5% annual rate (500 bps) over 12 monthly periods?"_
### `compute_vesting_schedule`

Calculate a token vesting / timelock release schedule for team members, investors, or advisors. Given a total allocation, start time, cliff, vesting duration, and release frequency, the tool returns the amount already released, the amount still locked, and a period-by-period schedule.

**Input:**

| Parameter                   | Type     | Required | Description                                                      |
| --------------------------- | -------- | -------- | ---------------------------------------------------------------- |
| `total_amount`              | `number` | Yes      | Total token amount to vest                                       |
| `start_timestamp`           | `number` | Yes      | Unix timestamp when vesting begins                               |
| `cliff_seconds`             | `number` | Yes      | Seconds before any tokens unlock (cliff period)                  |
| `vesting_duration_seconds`  | `number` | Yes      | Total vesting period in seconds                                  |
| `release_frequency_seconds` | `number` | Yes      | How often tokens unlock after cliff (e.g. `2592000` for monthly) |
| `beneficiary_type`          | `string` | Yes      | Category: `team`, `investor`, `advisor`, or `other`              |
| `current_timestamp`         | `number` | No       | Optional override for "now" (defaults to current time)           |

**Output:**

```jsonc
{
  "beneficiary_type": "team",
  "total_amount": "1000000.0000000",
  "start_date": "2024-11-13T12:00:00.000Z",
  "cliff_date": "2025-11-13T12:00:00.000Z",
  "end_date": "2028-11-13T12:00:00.000Z",
  "released_amount": "250000.0000000",
  "unreleased_amount": "750000.0000000",
  "vesting_percentage": 25.0,
  "next_release_date": "2025-12-13T12:00:00.000Z",
  "schedule": [
    {
      "release_date": "2025-12-13T12:00:00.000Z",
      "amount": "20833.3333333",
      "released": true
    },
    {
      "release_date": "2026-01-13T12:00:00.000Z",
      "amount": "20833.3333333",
      "released": false
    }
  ]
}
```

**Example prompt:**

> _"Compute the vesting schedule for 1,000,000 tokens allocated to the team with a 1-year cliff and 4-year vesting, releasing monthly."_

---

### `deploy_contract`

Builds a Stellar transaction for deploying a Soroban smart contract. Supports two modes:

- **Direct mode** — Uses the built-in Soroban deployer (`Operation.createCustomContract`). The source account deploys a contract directly from an uploaded WASM hash. Returns the unsigned transaction XDR and the predicted deterministic contract address.
- **Factory mode** — Invokes a factory contract's deploy function (`Operation.invokeContractFunction`). The factory contract internally uses the built-in deployer to create child contracts. Returns the unsigned transaction XDR.

> **Warning:** This tool builds but does not submit transactions. Always simulate the returned XDR with `simulate_transaction` before submitting with `submit_transaction`.

**Input:**

| Parameter             | Type     | Required | Description                                                                                                                                          |
| --------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                | `string` | Yes      | `direct` (built-in deployer) or `factory` (via factory contract)                                                                                     |
| `source_account`      | `string` | Yes      | Stellar public key (`G...`) that will pay fees                                                                                                       |
| `wasm_hash`           | `string` | No       | 64-char hex WASM hash. **Required for direct mode.**                                                                                                 |
| `salt`                | `string` | No       | 64-char hex salt for deterministic address. Random if omitted.                                                                                       |
| `factory_contract_id` | `string` | No       | Factory contract ID (`C...`). **Required for factory mode.**                                                                                         |
| `deploy_function`     | `string` | No       | Factory deploy function name. Default: `deploy`                                                                                                      |
| `deploy_args`         | `array`  | No       | Typed SCVal arguments: `[{ type?: 'symbol'\|'string'\|'u32'\|'i32'\|'u64'\|'i64'\|'u128'\|'i128'\|'bool'\|'address'\|'bytes'\|'void', value: any }]` |
| `network`             | `string` | No       | Override network: `mainnet`, `testnet`, `futurenet`, `custom`                                                                                        |

**Output (direct mode):**

```jsonc
{
  "mode": "direct",
  "transaction_xdr": "AAAAAgAAAAE...",
  "predicted_contract_id": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
  "network": "testnet",
  "source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
}
```

**Output (factory mode):**

```jsonc
{
  "mode": "factory",
  "transaction_xdr": "AAAAAgAAAAE...",
  "network": "testnet",
  "source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
}
```

**Example prompts:**

> _"Build a transaction to deploy a contract from wasm hash `a1b2c3...` on testnet using account `GBBD...`."_

> _"Deploy a new token contract through my factory `CA3D...` with init args `[symbol: 'init', u64: 1000]` on testnet."_

---

### `track_ledger_consensus_time`

Samples recent ledgers from Horizon and reports the average, minimum, maximum, and standard deviation of inter-ledger close times. Stellar targets approximately 5 seconds per ledger; deviations indicate network congestion or validator slowdowns.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `sample_size` | `number` | No | Number of recent ledgers to sample (2–100). Default: `10` |
| `network` | `string` | No | Override the network for this call (`mainnet`, `testnet`, `futurenet`, `custom`) |
### `get_network_params`

Fetch current Soroban network parameters including resource weights (for CPU, memory, ledger operations), fee thresholds and transaction limits, and inflation/base network parameters. Use this to understand resource pricing and network constraints before building transactions.

**Input:**

| Parameter | Type     | Required | Description                                                                      |
| --------- | -------- | -------- | -------------------------------------------------------------------------------- |
| `network` | `string` | No       | Override the network for this call (`mainnet`, `testnet`, `futurenet`, `custom`) |
### `optimize_contract_bytecode`

Analyzes a Soroban contract WASM blob and provides bytecode-size diagnostics, size-limit checks, and optimization actions that align with Stellar/Soroban best practices.

This tool is designed for pre-deployment quality gates and CI enforcement.
### `get_protocol_version`

Retrieves the current Stellar protocol version and network information from Horizon. Returns protocol version, Horizon version, supported features, and upgrade status to help track network capabilities and feature availability.

**Input:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wasm_path` | `string` | Yes | Path to the WASM file to analyze |
| `max_size_kb` | `number` | No | Maximum allowed size in KB (default: `256`) |
| `strict_mode` | `boolean` | No | If `true`, returns an error when size exceeds `max_size_kb` |
| `network` | `string` | No | Override network: `mainnet`, `testnet`, `futurenet`, `custom` |
### `amm`

Interact with Automated Market Maker (AMM) contracts implementing the constant-product (x*y=k) formula. This tool supports token swaps, liquidity provision/removal, pool queries, and price impact calculations with built-in slippage protection.

**Actions:**

| Action | Description |
|---|---|
| `swap` | Swap one asset for another with slippage protection |
| `add_liquidity` | Add liquidity to a pool and receive LP shares |
| `remove_liquidity` | Burn LP shares to withdraw underlying assets |
| `get_quote` | Get a swap quote with price impact calculation |
| `get_pool_info` | Query pool reserves and total LP shares |

#### Swap Tokens

Exchange one asset for another using the AMM pool. The tool builds a transaction that you should simulate before submitting.

**Input (action: `swap`):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amm_contract_id` | `string` | Yes | AMM contract ID (`C...`) |
| `source_account` | `string` | Yes | Your Stellar public key (`G...`) |
| `offer_asset_code` | `string` | Yes | Asset code you're offering (e.g., `XLM`, `USDC`) |
| `offer_asset_issuer` | `string` | No | Issuer of offered asset (omit for XLM) |
| `offer_amount` | `string` | Yes | Amount in stroops (1 XLM = 10,000,000 stroops) |
| `min_receive_amount` | `string` | Yes | Minimum amount to receive (slippage protection) in stroops |
| `receive_asset_code` | `string` | Yes | Asset code you want to receive |
| `receive_asset_issuer` | `string` | No | Issuer of receive asset (omit for XLM) |
| `network` | `string` | No | Override network: `mainnet`, `testnet`, `futurenet` |

**Output:**

```jsonc
{
  "network": "testnet",
  "sample_size": 10,
  "average_consensus_seconds": 5.123,
  "min_consensus_seconds": 4.891,
  "max_consensus_seconds": 6.204,
  "std_dev_seconds": 0.412,
  "sampled_at": "2026-04-28T12:00:00.000Z",
  "ledgers": [
    {
      "sequence": 999991,
      "closed_at": "2026-04-28T11:59:55.000Z",
      "close_time_seconds": 5.0
    },
    {
      "sequence": 999992,
      "closed_at": "2026-04-28T11:59:60.000Z",
      "close_time_seconds": 5.0
    }
  ]
}
```

**Example prompt:**

> _"How fast is the Stellar testnet closing ledgers right now? Is consensus healthy?"_
  "ledger_sequence": 48123789,
  "resource_weights": {
    "cpu_instructions": "100",
    "memory_bytes": "1000",
    "ledger_entry_read": "50",
    "ledger_entry_write": "100",
    "ledger_entry_create": "150",
    "transmit_bytes": "200"
  },
  "fee_thresholds": {
    "min_resource_fee": "100",
    "max_cpu_instructions": "100000000",
    "max_memory_bytes": "52428800",
    "ledger_entry_limits": {
      "max_read_bytes": "10485760",
      "max_write_bytes": "10485760",
      "max_create_bytes": "10485760"
    }
  },
  "inflation_params": {
    "base_reserve": "500000000",
    "base_fee": "100",
    "inflation_rate": 1.0
  },
  "network_passphrase": "Test SDF Network ; September 2015",
  "protocol_version": 20
}
```

**Resource Weight Units:**

- `cpu_instructions`: Cost multiplier per CPU instruction
- `memory_bytes`: Cost multiplier per byte of memory
- `ledger_entry_read`: Cost for reading a ledger entry
- `ledger_entry_write`: Cost for writing to a ledger entry
- `ledger_entry_create`: Cost for creating a new ledger entry
- `transmit_bytes`: Cost per byte of transaction data

**Fee Thresholds:**

- `min_resource_fee`: Minimum fee required per transaction (in stroops)
- `max_cpu_instructions`: Maximum CPU instructions allowed per transaction
- `max_memory_bytes`: Maximum memory (in bytes) allowed per transaction
- Ledger entry limits: Maximum bytes for read, write, and create operations

**Example prompt:**

> _"What are the current resource weights and fee thresholds on testnet? I want to estimate the cost of my transaction."_
  "wasm_path": "/workspace/target/wasm32v1-none/release/governor.wasm",
  "size_bytes": 178432,
  "size_kb": 174.25,
  "max_size_kb": 256,
  "exceeds_limit": false,
  "diagnostics": {
    "custom_section_bytes": 8120,
    "code_section_bytes": 129744,
    "data_section_bytes": 14688,
    "section_breakdown": []
  },
  "suggested_commands": [
    "cargo build --release --target wasm32v1-none",
    "stellar contract optimize --wasm <input.wasm> --wasm-out <optimized.wasm>",
    "wasm-opt -Oz -o <optimized.wasm> <input.wasm>"
  ],
  "recommendations": [
    {
      "id": "strip-custom-sections",
      "priority": "high",
      "title": "Strip debug/custom sections",
      "rationale": "Custom/debug sections increase binary size and are not needed for on-chain execution.",
      "action": "Enable symbol stripping and optimization pass to remove custom sections from the final WASM artifact."
    }
  ]
}
```

See [docs/benchmark_gas.md](./docs/benchmark_gas.md) and [docs/contract-bytecode-optimization.md](./docs/contract-bytecode-optimization.md) for workflow guidance.

**Example prompt:**

> _"Analyze `./target/wasm32v1-none/release/governor.wasm` and tell me how to get it under 256 KB."_
  "network": "testnet",
  "protocol_version": 20,
  "horizon_version": "4.0.0",
  "core_version": "stellar-core 20.0.0",
  "supported_features": [
    "basic_transactions",
    "multi_signature", 
    "payment_channels",
    "soroban_smart_contracts",
    "footprint_expiration",
    "fee_bumps",
    "liquidity_pools",
    "claimable_balances",
    "contract_data_ttl",
    "contract_instance_storage",
    "smart_contract_auth",
    "envelope_types",
    "contract_cost_model",
    "cpu_instructions",
    "stellar_asset_contract",
    "wasm_v2",
    "complex_contract_auth",
    "enhanced_fee_structures"
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Supported Features by Protocol Version:**

| Protocol Version | Key Features Added |
|---|---|
| 11 | Soroban smart contracts, footprint expiration, fee bumps |
| 12 | Liquidity pools, claimable balances |
| 13 | Contract data TTL, contract instance storage |
| 14 | Smart contract auth, envelope types |
| 15 | Contract cost model, CPU instructions |
| 16 | Stellar Asset Contract, WASM v2 |
| 17+ | Complex contract auth, enhanced fee structures |

**Example prompts:**

> _"What protocol version is testnet currently running and what features are available?"_

> _"Check if mainnet supports Soroban smart contracts yet."_

> _"Compare protocol versions between mainnet and testnet to see what's different."_
  "status": "success",
  "action": "swap",
  "transaction_xdr": "AAAAAgAAAAE...",
  "message": "Swap transaction built. Simulate before submitting."
}
```

**Example prompt:**

> _"Swap 10 XLM for USDC using AMM contract `CA3D...` with minimum receive of 150 USDC."_

#### Add Liquidity

Provide liquidity to an AMM pool and receive LP (Liquidity Provider) shares proportional to your contribution.

**Input (action: `add_liquidity`):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amm_contract_id` | `string` | Yes | AMM contract ID (`C...`) |
| `source_account` | `string` | Yes | Your Stellar public key (`G...`) |
| `asset_a_code` | `string` | Yes | First asset code |
| `asset_a_issuer` | `string` | No | Issuer of first asset (omit for XLM) |
| `asset_a_amount` | `string` | Yes | Amount of first asset in stroops |
| `asset_b_code` | `string` | Yes | Second asset code |
| `asset_b_issuer` | `string` | No | Issuer of second asset (omit for XLM) |
| `asset_b_amount` | `string` | Yes | Amount of second asset in stroops |
| `min_shares_received` | `string` | Yes | Minimum LP shares to receive (slippage protection) |
| `network` | `string` | No | Override network |

**Output:**

```jsonc
{
  "status": "success",
  "action": "add_liquidity",
  "transaction_xdr": "AAAAAgAAAAE...",
  "message": "Add liquidity transaction built. Simulate before submitting."
}
```

**Example prompt:**

> _"Add liquidity to pool `CA3D...`: 100 XLM and 200 USDC, minimum 4000 LP shares."_

#### Remove Liquidity

Burn LP shares to withdraw your proportionate share of the pool's underlying assets.

**Input (action: `remove_liquidity`):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amm_contract_id` | `string` | Yes | AMM contract ID (`C...`) |
| `source_account` | `string` | Yes | Your Stellar public key (`G...`) |
| `shares_amount` | `string` | Yes | Amount of LP shares to burn in stroops |
| `min_asset_a_amount` | `string` | Yes | Minimum asset A to receive (slippage protection) |
| `min_asset_b_amount` | `string` | Yes | Minimum asset B to receive (slippage protection) |
| `network` | `string` | No | Override network |

**Output:**

```jsonc
{
  "status": "success",
  "action": "remove_liquidity",
  "transaction_xdr": "AAAAAgAAAAE...",
  "message": "Remove liquidity transaction built. Simulate before submitting."
}
```

**Example prompt:**

> _"Remove 500 LP shares from pool `CA3D...`, minimum 50 XLM and 100 USDC."_

#### Get Swap Quote

Get a quote for a potential swap, including expected output, price impact, and exchange rate. This is a read-only operation that doesn't build a transaction.

**Input (action: `get_quote`):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amm_contract_id` | `string` | Yes | AMM contract ID (`C...`) |
| `offer_asset_code` | `string` | Yes | Asset code being offered |
| `offer_asset_issuer` | `string` | No | Issuer of offered asset (omit for XLM) |
| `offer_amount` | `string` | Yes | Amount being offered in stroops |
| `receive_asset_code` | `string` | Yes | Asset code to receive |
| `receive_asset_issuer` | `string` | No | Issuer of receive asset (omit for XLM) |
| `network` | `string` | No | Override network |

**Output:**

```jsonc
{
  "status": "success",
  "offer_asset": {
    "code": "XLM",
    "issuer": "native",
    "amount": "10000000"
  },
  "receive_asset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "amount": "19850000"
  },
  "pool_reserves": {
    "reserve_a": "1000000000",
    "reserve_b": "2000000000"
  },
  "fee_bps": 30,
  "price_impact_bps": 150,
  "exchange_rate": 1.985
}
```

**Example prompt:**

> _"Get a quote for swapping 10 XLM to USDC on AMM `CA3D...` with current reserves."_

#### Get Pool Information

Query the current state of an AMM pool, including reserves for both assets and total LP shares in circulation.

**Input (action: `get_pool_info`):**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `amm_contract_id` | `string` | Yes | AMM contract ID (`C...`) |
| `asset_a_code` | `string` | Yes | First asset code |
| `asset_a_issuer` | `string` | No | Issuer of first asset (omit for XLM) |
| `asset_b_code` | `string` | Yes | Second asset code |
| `asset_b_issuer` | `string` | No | Issuer of second asset (omit for XLM) |
| `network` | `string` | No | Override network |

**Output:**

```jsonc
{
  "status": "success",
  "pool": {
    "asset_a": {
      "code": "XLM",
      "issuer": "native",
      "reserve": "1000000000"
    },
    "asset_b": {
      "code": "USDC",
      "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "reserve": "2000000000"
    },
    "total_shares": "1414213562",
    "contract_id": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE"
  },
  "constant_product": "2000000000000000000"
}
```

**Example prompt:**

> _"Get pool information for the XLM/USDC pair on AMM contract `CA3D...`."_

---

## AMM Mathematics

pulsar implements the standard constant-product AMM formula (x * y = k) used by Uniswap V2 and similar protocols:

### Swap Calculation

```
output = (reserve_out * amount_in * (1 - fee)) / (reserve_in + amount_in * (1 - fee))
```

Where:
- `fee` = 0.30% (30 basis points)
- `reserve_in` = Current reserve of the input asset
- `reserve_out` = Current reserve of the output asset
- `amount_in` = Amount being swapped

### Liquidity Shares

**Initial deposit:**
```
shares = sqrt(amount_a * amount_b)
```

**Subsequent deposits:**
```
shares = min((amount_a * total_shares) / reserve_a, (amount_b * total_shares) / reserve_b)
```

### Remove Liquidity

```
amount_a = (shares_burned * reserve_a) / total_shares
amount_b = (shares_burned * reserve_b) / total_shares
```

---

## Example Prompts & Workflows

These are real-world workflows that become possible once pulsar is connected to your AI assistant.


### 1. Inspect an account before sending funds

```
Me: Check the XLM and USDC balance of GBBD47... on testnet before I send anything.
AI: [calls get_account_balance] — The account holds 9,842.12 XLM and 250.00 USDC. It has 3 subentries, so the minimum balance is 2 XLM base + 0.5 per subentry = 3.5 XLM. Safe to proceed.
```

### 2. Generate a TypeScript SDK from a contract spec

```
Me: Fetch the contract spec for CA3D... and generate a fully-typed TypeScript client for all its functions.
AI: [calls fetch_contract_spec] — Here is a TypeScript client using @stellar/stellar-sdk ...
```

### 3. Dry-run before spending fees

```
Me: I built this transaction XDR. Simulate it and tell me if it will succeed and what the fee will be.
AI: [calls simulate_transaction] — The simulation succeeded. Return value is `true`. The min resource fee is 12,345 stroops (~0.001234 XLM). CPU: 512,340 instructions. Looks good to submit.
```

### 4. Debug contract storage

```
Me: Here's a ledger entry XDR from querying the contract storage. What's in it?
AI: [calls decode_ledger_entry] — This is a persistent ContractData entry for contract CA3D.... The key is the Symbol "Balance" and the value is a Map with one entry: address GBBD47... → i128 value 5,000,000,000 (which at 7 decimal places is 500.0000000 tokens).
```

### 5. Full send cycle with confirmation

```
Me: Submit this signed XDR to testnet and wait for confirmation.
AI: [calls submit_transaction with wait_for_result: true] — Submitted! Hash: aabbcc... Confirmed in ledger 48,123,789. Fee charged: 1,234 stroops. Return value: true.
```

---

## Soroban CLI Integration

pulsar delegates certain operations to the official Stellar CLI to ensure byte-level correctness with the Soroban XDR format. The server will use the binary found at `STELLAR_CLI_PATH` (default: `stellar` on `$PATH`).

Operations that use the CLI backend:

| Tool                       | CLI command used                                                               |
| -------------------------- | ------------------------------------------------------------------------------ |
| `fetch_contract_spec`      | `stellar contract info interface`                                              |
| `simulate_transaction`     | calls Soroban RPC `simulateTransaction` directly                               |
| `decode_ledger_entry`      | `stellar xdr decode`                                                           |
| `submit_transaction`       | calls Soroban RPC / Horizon directly, uses CLI for signing if needed           |
| `compute_vesting_schedule` | pure computation, no external calls                                            |
| `deploy_contract`          | calls Horizon to fetch sequence number; builds transaction XDR via stellar-sdk |
| Tool | CLI command used |
|---|---|
| `fetch_contract_spec` | `stellar contract info interface` |
| `simulate_transaction` | calls Soroban RPC `simulateTransaction` directly |
| `decode_ledger_entry` | `stellar xdr decode` |
| `submit_transaction` | calls Soroban RPC / Horizon directly, uses CLI for signing if needed |
| `compute_vesting_schedule` | pure computation, no external calls |
| `deploy_contract` | calls Horizon to fetch sequence number; builds transaction XDR via stellar-sdk |
| `track_ledger_consensus_time` | calls Horizon `ledgers()` endpoint; pure computation for statistics |
| `get_protocol_version` | calls Horizon to fetch latest ledger and root information |

You can inspect the exact CLI commands being executed by setting `LOG_LEVEL=debug`.

---

## Development Guide

### Project Structure

```
pulsar/
├── src/
│   ├── index.ts              # MCP server entrypoint, tool registration
│   ├── tools/
│   │   ├── get_account_balance.ts
│   │   ├── fetch_contract_spec.ts
│   │   ├── simulate_transaction.ts
│   │   ├── decode_ledger_entry.ts
│   │   ├── submit_transaction.ts
│   │   ├── compute_vesting_schedule.ts
│   │   ├── deploy_contract.ts
│   │   └── track_ledger_consensus_time.ts
│   │   └── get_protocol_version.ts
│   ├── services/
│   │   ├── horizon.ts        # Horizon REST client wrapper
│   │   ├── soroban-rpc.ts    # Soroban JSON-RPC client wrapper
│   │   ├── stellar-cli.ts    # Shell-out wrapper for the Stellar CLI
│   │   └── xdr.ts            # XDR encode/decode helpers
│   ├── schemas/
│   │   └── index.ts          # Zod schemas for all tool inputs/outputs
│   └── config.ts             # Network config, env var loading
├── tests/
│   ├── unit/
│   └── integration/
├── contracts/                  # Soroban Rust workspaces
│   └── reference/            # Reference contracts and test suite
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### Reference Contracts

To ensure pulsar's toolsets (`simulate_transaction`, `fetch_contract_spec`, `decode_ledger_entry`) are rigorously verified, we maintain a `contracts/` directory containing "Reference Contracts". These are standard Soroban Rust contracts that implement various features (events, structs, cross-contract calls, conditional panics).

You can compile these contracts to WASM and run their comprehensive Rust unit tests via:

```bash
# Build the reference contracts (generates AI-ready WASM specs)
npm run build:contracts

# Run the comprehensive unit test suite
npm run test:contracts
```

These reference WASM files provide an exact baseline to verify the outputs of pulsar tools.

### Adding a New Tool

1. **Create the handler** in `src/tools/my_new_tool.ts`:

```typescript
import { z } from 'zod';
import { McpToolHandler } from '../types.js';

export const myNewToolSchema = z.object({
  some_param: z.string().describe('Description for the AI to understand'),
});

export const myNewTool: McpToolHandler<typeof myNewToolSchema> = async (input) => {
  const { some_param } = input;
  // ... implementation
  return { result: '...' };
};
```

2. **Register it** in `src/index.ts`:

```typescript
import { myNewTool, myNewToolSchema } from './tools/my_new_tool.js';

server.tool(
  'my_new_tool',
  'One-sentence description visible to the AI assistant',
  myNewToolSchema.shape,
  myNewTool
);
```

3. **Add tests** in `tests/unit/my_new_tool.test.ts`.

4. **Document it** in this README under [Tools Reference](#tools-reference).

### Running Locally

```bash
# Development mode with hot-reload
npm run dev

# Build and run
npm run build && node dist/index.js

# Test the server interactively (pipe JSON-RPC requests)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js | jq .
```

### Testing

```bash
# Run all unit tests
npm test

# Run integration tests (requires testnet access)
npm run test:integration

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Type-check only (no emit)
npm run typecheck
```

**Unit tests** mock Horizon and Soroban RPC responses and do not require network access.

**Integration tests** hit the real Testnet endpoints. They are skipped in CI unless `RUN_INTEGRATION_TESTS=true` is set.

---

## Monitoring

### Prometheus Metrics

pulsar exposes detailed Prometheus metrics for monitoring tool performance, resource usage, and error rates.

#### Accessing Metrics

By default, metrics are available at `http://localhost:9090/metrics` (customizable via `METRICS_PORT`).

```bash
# Fetch metrics in Prometheus format
curl http://localhost:9090/metrics

# Health check endpoint
curl http://localhost:9090/health
```

#### Example Prometheus Queries

```promql
# Average tool execution time (last 5 minutes)
rate(pulsar_tool_duration_seconds_sum[5m]) / rate(pulsar_tool_duration_seconds_count[5m])

# Tool error rate
rate(pulsar_tool_errors_total[5m])

# Current heap memory usage in MB
pulsar_heap_memory_used_bytes / 1024 / 1024

# Active tool invocations
pulsar_active_tool_invocations

# Total successful invocations by tool
sum by (tool_name) (pulsar_tool_invocations_total{status="success"})
```

#### Metrics in Docker

When running pulsar in Docker, expose the metrics port:

```bash
docker run -p 9090:9090 ghcr.io/benelabs/pulsar:latest
```

#### Disabling Metrics

If you want to reduce memory overhead or disable metrics export for privacy reasons, set:

```env
METRICS_ENABLED=false
```

The HTTP metrics server will not start, and no metrics will be collected.

---

## Security Considerations

- **Never commit `STELLAR_SECRET_KEY`** to version control. Add `.env` to `.gitignore`. Use a throwaway funded Testnet keypair during development.
- **`submit_transaction` is irreversible.** Always call `simulate_transaction` first to verify the transaction will succeed, especially on Mainnet.
- **Input validation.** All tool inputs are validated with Zod schemas before any network call. Malformed XDR or invalid public keys are rejected early with clear error messages.
- **No key storage.** pulsar does not persist keys. The `STELLAR_SECRET_KEY` environment variable is read at runtime and never written to disk by the server.
- **Tool Execution Audit Logging.** pulsar maintains a local file log (defaults to `audit.log`) of all tools executed, including inputs and outcomes. For strict security standards and data privacy, sensitive fields (such as `STELLAR_SECRET_KEY`, `xdr`, and `envelope_xdr`) are completely redacted, and public identifiers like Stellar account addresses (`G...`) and Soroban Contract IDs (`C...`) are hashed to ensure anonymization.
- **Rate limiting.** The server does not implement rate limiting internally — if you are hitting Horizon or the Soroban RPC heavily, consider running your own node or using a provider with rate-limit controls.
- **Testnet first.** The default `STELLAR_NETWORK` is `testnet`. You must explicitly set `STELLAR_NETWORK=mainnet` to interact with the live network. This is intentional.

---

## Roadmap

- [x] `get_account_balance` — account balance query
- [x] `fetch_contract_spec` — Soroban ABI fetching
- [x] `simulate_transaction` — dry-run via Soroban RPC
- [x] `decode_ledger_entry` — XDR decode
- [x] `submit_transaction` — broadcast + wait for result
- [x] `soroban_math` — fixed-point, statistical, and financial math
- [x] `compute_vesting_schedule` — token vesting / timelock schedule calculator
- [x] `deploy_contract` — deploy Soroban contracts via built-in deployer or factory pattern
- [x] Prometheus metrics export — monitor tool performance, errors, and resource usage
- [x] `get_liquidity_pool` — fetch AMM pool reserves, shares, and fee settings
- [x] `get_fee_stats` — retrieve network fee statistics and recommended fees
- [x] `latency_based_rpc` — automatic routing to the fastest Soroban RPC endpoint
- [x] `get_protocol_version` — track network upgrades and feature availability
- [x] `amm` — Automated Market Maker (constant-product x*y=k) with swap, liquidity, and quote operations
- [ ] `get_transaction_history` — paginated history for an account
- [ ] `stream_events` — subscribe to Soroban contract events
- [ ] `build_transaction` — construct a Soroban invoke transaction from contract spec + args (without needing pre-built XDR)
- [ ] `fund_testnet_account` — call Friendbot to fund a new Testnet account
- [ ] `get_offers` — query open DEX offers for an account or asset pair
- [ ] `watch_account` — streaming ledger updates for an account
- [ ] SSE transport option (for web-based MCP hosts)
- [ ] Rust implementation (for lower latency and single-binary distribution)
- [ ] Docker image for self-hosted deployment

---

## Contributing

Contributions are very welcome. pulsar is a community project born from the need for better AI tooling in the Stellar ecosystem.

### Quick start

```bash
# Fork and clone
git clone https://github.com/your-username/pulsar.git
cd pulsar

# Install deps
npm install

# Create a feature branch
git checkout -b feat/my-feature

# Make your changes, add tests
npm test && npm run lint

# Open a PR
```

### Guidelines

- **One tool per PR** — keep changes focused and reviewable.
- **Tests required** — every new tool needs at least unit test coverage.
- **Document your tool** — add a section to this README.
- **No secret keys in tests** — use mocked responses or Friendbot-funded throwaway accounts.
- **Conventional Commits** — use `feat:`, `fix:`, `docs:`, `test:` prefixes in commit messages.

### Reporting Issues

Open an issue with:

1. The tool name and inputs you used (redact any secret keys).
2. The error message or unexpected output.
3. Your `STELLAR_NETWORK` and `stellar --version`.

---

## Related Projects

| Project                                                           | Description                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| [Stellar Developer Docs](https://developers.stellar.org)          | Official documentation for Stellar and Soroban           |
| [Stellar CLI](https://github.com/stellar/stellar-cli)             | Official CLI for Soroban development                     |
| [@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk) | Official JavaScript/TypeScript SDK                       |
| [Model Context Protocol](https://modelcontextprotocol.io)         | The open protocol this server implements                 |
| [Stella (SDF)](https://stellar.org/blog)                          | SDF's official headless AI assistant for Stellar         |
| [Soroban Examples](https://github.com/stellar/soroban-examples)   | Example Soroban smart contracts                          |
| [Stellar Laboratory](https://lab.stellar.org)                     | Browser-based tool for building and signing transactions |

---

## License

[MIT](LICENSE) © 2026 pulsar contributors

---

<p align="center">
Built by the Stellar community, for the Stellar community.<br/>
If this helped you ship something, leave a ⭐ and tell a friend.
</p>

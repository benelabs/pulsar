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
- [Connecting to AI Assistants](#connecting-to-ai-assistants)
  - [Claude Desktop](#claude-desktop)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Any MCP-Compatible Client](#any-mcp-compatible-client)
- [Tools Reference](#tools-reference)
  - [get_account_balance](#get_account_balance)
  - [get_account_balances](#get_account_balances)
  - [fetch_contract_spec](#fetch_contract_spec)
  - [simulate_transaction](#simulate_transaction)
  - [decode_ledger_entry](#decode_ledger_entry)
  - [submit_transaction](#submit_transaction)
  - [compute_vesting_schedule](#compute_vesting_schedule)
  - [deploy_contract](#deploy_contract)
- [Example Prompts & Workflows](#example-prompts--workflows)
- [Soroban CLI Integration](#soroban-cli-integration)
- [Development Guide](#development-guide)
  - [Project Structure](#project-structure)
  - [Adding a New Tool](#adding-a-new-tool)
  - [Running Locally](#running-locally)
  - [Testing](#testing)
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

| Capability                       | Details                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Account Balances**             | Query XLM and issued asset balances for one account or batch-fetch up to 25 accounts in a single call |
| **Contract Spec Fetching**       | Retrieve the full ABI/interface spec of any deployed Soroban contract                                 |
| **Transaction Simulation**       | Dry-run a Soroban transaction and inspect resource usage and return values before spending fees       |
| **Ledger Entry Decoding**        | Decode raw XDR ledger entries into human-readable JSON                                                |
| **Transaction Submission**       | Sign (via a provided secret key or external signer) and submit transactions to the network            |
| **Contract Deployment**          | Deploy Soroban smart contracts via built-in deployer or factory contracts                             |
| **Vesting Schedule Computation** | Calculate token vesting / timelock release schedules for team, investors, and advisors                |
| **Multi-network**                | Targets Mainnet, Testnet, Futurenet, or a custom RPC endpoint                                         |
| **Soroban CLI Backend**          | Delegates complex operations to the official `stellar` / `soroban` CLI for maximum correctness        |
| **Structured Output**            | All tool responses are typed JSON objects the AI can directly parse and act upon                      |
| **Zero-dependency transport**    | Uses standard MCP stdio transport — no extra HTTP server required                                     |

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

# ─── Signing (optional — required only for submit_transaction) ───────────────
# WARNING: Never commit a funded secret key to version control.
# Use a dedicated low-value keypair for development.
STELLAR_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ─── Soroban CLI ────────────────────────────────────────────────────────────
# Path to the stellar/soroban CLI binary (auto-detected if on PATH)
STELLAR_CLI_PATH=stellar

# ─── Server ─────────────────────────────────────────────────────────────────
# Log level: error | warn | info | debug
LOG_LEVEL=info
```

> **Security note:** `STELLAR_SECRET_KEY` is optional and only used by `submit_transaction`. If not set, that tool will return an unsigned XDR blob that you can sign externally. Never use a funded Mainnet key during development — use a throwaway Testnet keypair funded via [Friendbot](https://friendbot.stellar.org).

### Network Selection

| `STELLAR_NETWORK` value | Horizon URL                             | Soroban RPC URL                       |
| ----------------------- | --------------------------------------- | ------------------------------------- |
| `mainnet`               | `https://horizon.stellar.org`           | `https://soroban-rpc.stellar.org`     |
| `testnet`               | `https://horizon-testnet.stellar.org`   | `https://soroban-testnet.stellar.org` |
| `futurenet`             | `https://horizon-futurenet.stellar.org` | `https://rpc-futurenet.stellar.org`   |
| `custom`                | `HORIZON_URL` env var                   | `SOROBAN_RPC_URL` env var             |

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
      "selling_liabilities": "0.0000000",
    },
    {
      "asset_type": "credit_alphanum4",
      "asset_code": "USDC",
      "asset_issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "balance": "250.0000000",
      "limit": "922337203685.4775807",
      "is_authorized": true,
    },
  ],
  "network": "testnet",
}
```

**Example prompt:**

> _"Check the balance of account `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` on testnet."_

---

### `get_account_balances`

Fetch balances for multiple Stellar accounts in a single tool call. The server fans out concurrent Horizon requests with a bounded concurrency limit and returns per-account successes or failures without dropping the whole batch.

**Input:**

| Parameter         | Type       | Required | Description                                                                     |
| ----------------- | ---------- | -------- | ------------------------------------------------------------------------------- |
| `account_ids`     | `string[]` | Yes      | One to 25 unique Stellar public keys (`G...`)                                   |
| `asset_code`      | `string`   | No       | Filter every account result to a specific asset code, e.g. `USDC`               |
| `asset_issuer`    | `string`   | No       | The issuer public key for the filtered asset                                    |
| `max_concurrency` | `number`   | No       | Maximum number of concurrent Horizon requests. Range: `1` to `10`. Default: `5` |
| `network`         | `string`   | No       | Override the network for this call                                              |

**Output:**

```jsonc
{
  "network": "testnet",
  "requested": 3,
  "succeeded": 2,
  "failed": 1,
  "max_concurrency": 3,
  "duration_ms": 184,
  "results": [
    {
      "status": "success",
      "account_id": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      "balances": [
        {
          "asset_type": "native",
          "balance": "9842.1234567",
        },
      ],
    },
    {
      "status": "error",
      "account_id": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG",
      "error_code": "NETWORK_ERROR",
      "message": "Account not found - it may not be funded yet",
      "details": {
        "status": 404,
        "account_id": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHG",
      },
    },
  ],
}
```

**Example prompt:**

> _"Fetch XLM balances for these treasury accounts in one call and flag any unfunded ones: `GBBD47...`, `GBZX12...`, `GAAA...`."_

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
        { "name": "amount", "type": "i128" },
      ],
      "outputs": [{ "type": "bool" }],
    },
    {
      "name": "balance",
      "inputs": [{ "name": "id", "type": "Address" }],
      "outputs": [{ "type": "i128" }],
    },
  ],
  "events": [
    {
      "name": "transfer",
      "topics": [{ "type": "Symbol" }, { "type": "Address" }, { "type": "Address" }],
      "data": { "type": "i128" },
    },
  ],
  "raw_xdr": "AAAAAgAAAA...",
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
    "value": "1000000000",
  },
  "cost": {
    "cpu_instructions": 512340,
    "memory_bytes": 98304,
  },
  "footprint": {
    "read_only": ["ledger_key_1_xdr", "ledger_key_2_xdr"],
    "read_write": ["ledger_key_3_xdr"],
  },
  "min_resource_fee": "12345",
  "events": [],
  "error": null,
}
```

If the simulation fails (e.g. contract panics, insufficient balance), the `status` is `"error"` and the `error` field contains the diagnostic message from the contract.

**Example prompt:**

> _"Simulate this transaction XDR and tell me whether it will succeed and how much it will cost."_

---

### `decode_ledger_entry`

Decode a raw base64-encoded XDR ledger entry into a human-readable JSON structure. Useful for inspecting persistent storage slots of Soroban contracts, or debugging what is actually stored on-chain.

**Input:**

| Parameter    | Type     | Required | Description                                                                                  |
| ------------ | -------- | -------- | -------------------------------------------------------------------------------------------- |
| `xdr`        | `string` | Yes      | The base64-encoded XDR of the ledger entry (key or value)                                    |
| `entry_type` | `string` | No       | Hint for decoding: `account`, `trustline`, `contract_data`, `contract_code`, `offer`, `data` |

**Output:**

```jsonc
{
  "entry_type": "contract_data",
  "decoded": {
    "contract": "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE",
    "key": {
      "type": "Symbol",
      "value": "Balance",
    },
    "val": {
      "type": "Map",
      "value": [
        {
          "key": { "type": "Address", "value": "GBBD47IF..." },
          "val": { "type": "i128", "value": "5000000000" },
        },
      ],
    },
    "durability": "persistent",
    "last_modified_ledger": 48123456,
  },
  "raw_xdr": "AAAABgAAAAEA...",
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
    "value": true,
  },
  "result_xdr": "AAAAAAAAAGQ...",
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
      "message": "HostError: Error(Contract, #1)",
    },
  ],
}
```

**Example prompt:**

> _"Submit this signed transaction XDR to testnet and tell me the result: `AAAA...`"_

---

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
      "released": true,
    },
    {
      "release_date": "2026-01-13T12:00:00.000Z",
      "amount": "20833.3333333",
      "released": false,
    },
  ],
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
  "source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
}
```

**Output (factory mode):**

```jsonc
{
  "mode": "factory",
  "transaction_xdr": "AAAAAgAAAAE...",
  "network": "testnet",
  "source_account": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
}
```

**Example prompts:**

> _"Build a transaction to deploy a contract from wasm hash `a1b2c3...` on testnet using account `GBBD...`."_

> _"Deploy a new token contract through my factory `CA3D...` with init args `[symbol: 'init', u64: 1000]` on testnet."_

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
│   │   └── deploy_contract.ts
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
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

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

## Security Considerations

- **Never commit `STELLAR_SECRET_KEY`** to version control. Add `.env` to `.gitignore`. Use a throwaway funded Testnet keypair during development.
- **`submit_transaction` is irreversible.** Always call `simulate_transaction` first to verify the transaction will succeed, especially on Mainnet.
- **Input validation.** All tool inputs are validated with Zod schemas before any network call. Malformed XDR or invalid public keys are rejected early with clear error messages.
- **No key storage.** pulsar does not persist keys. The `STELLAR_SECRET_KEY` environment variable is read at runtime and never written to disk by the server.
- **Rate limiting.** The server does not implement rate limiting internally — if you are hitting Horizon or the Soroban RPC heavily, consider running your own node or using a provider with rate-limit controls.
- **Testnet first.** The default `STELLAR_NETWORK` is `testnet`. You must explicitly set `STELLAR_NETWORK=mainnet` to interact with the live network. This is intentional.

---

## Roadmap

- [x] `get_account_balance` — account balance query
- [x] `fetch_contract_spec` — Soroban ABI fetching
- [x] `simulate_transaction` — dry-run via Soroban RPC
- [x] `decode_ledger_entry` — XDR decode
- [x] `submit_transaction` — broadcast + wait for result
- [x] `compute_vesting_schedule` — token vesting / timelock schedule calculator
- [x] `deploy_contract` — deploy Soroban contracts via built-in deployer or factory pattern
- [ ] `get_transaction_history` — paginated history for an account
- [ ] `stream_events` — subscribe to Soroban contract events
- [ ] `build_transaction` — construct a Soroban invoke transaction from contract spec + args (without needing pre-built XDR)
- [ ] `fund_testnet_account` — call Friendbot to fund a new Testnet account
- [ ] `get_offers` — query open DEX offers for an account or asset pair
- [ ] `get_liquidity_pool` — fetch liquidity pool details
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

# Reference Token Contract

A complete, auditable reference implementation of the SEP-41 token standard for Soroban. Suitable for use as a test fixture, a starting point for custom tokens, or as a learning resource.

## Features
- Fully implements SEP-41.
- Supports comprehensive minting, burning, and allowance logic.
- Maintains 100% test coverage to ensure reliable integration.

## AI Integration
An AI-ready contract schema mapping is available in `ai-spec.json`. This JSON document defines the smart contract methods, parameters, return types, and event signatures for consumption by AI tooling or the Pulsar MCP server.

## Testing
This library has a full suite of unit and edge-case testing validating both its logic and event emissions. Tests can be run via:
```bash
cargo test
```

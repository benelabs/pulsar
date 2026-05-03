# Contract Bytecode Optimization Guide

This guide explains how to keep Soroban contract WASM bytecode under deployment limits and avoid regressions.

## Why This Matters

Smaller contract blobs reduce deployment risk, improve maintainability, and help avoid size-limit failures during CI or release.

## Recommended Build Profile

Use a size-first release profile in your contract crate:

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = "symbols"
overflow-checks = false
```

## Suggested Optimization Flow

```bash
cargo build --release --target wasm32v1-none
stellar contract optimize --wasm <input.wasm> --wasm-out <optimized.wasm>
wasm-opt -Oz -o <optimized.wasm> <input.wasm>
```

## Using `optimize_contract_bytecode`

1. Build your contract WASM.
2. Call the MCP tool with:
   - `wasm_path`
   - optional `max_size_kb` (default 256)
   - optional `strict_mode` for CI gating.
3. Apply the returned recommendations and re-run the analysis.

## CI Recommendation

Use strict mode in CI to fail early when a contract exceeds your bytecode budget.

Example policy:
- Main contracts: `max_size_kb = 256`
- Helper contracts: `max_size_kb = 128`

## Security Notes

- Do not remove runtime checks that protect contract invariants just to reduce size.
- Prefer targeted optimizations (profiling, code deduplication, dead code elimination) over risky behavior changes.
- Re-run unit/integration tests after every optimization pass.

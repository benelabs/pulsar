# Soroban Staking & Rewards Contract

This contract handles staking of a designated Stellar asset (the "staking token") and distributes emissions of a secondary asset (the "reward token") continuously over time.

## Architecture

The contract utilizes the industry-standard **MasterChef "Reward Per Share" (RPS)** algorithm.
This provides an `O(1)` performance impact, avoiding unbounded loops regardless of the number of users interacting with the pool. The `acc_reward_per_share` dynamically tracks global token emissions and ensures fair proportioning of rewards based on standard fractional shares.

### Security & Privacy Features

- **`require_auth()`**: Strictly enforced on all user state-mutating functions (`stake`, `unstake`, `claim`).
- **Storage Tiers**:
  - `Instance`: Global configurations (`RewardConfig`, `PoolInfo`) optimized for low-cost reads.
  - `Persistent`: Individual `UserStats` mapping to prevent state eviction of active stakers.
- **Safety Limits**: Strict integer checked arithmetic prevents overflow and underflow vulnerabilities.

## Integration with Pulsar Toolsets

This contract is designed to be **AI-ready** and easily queryable via the Pulsar MCP server.

- **Inspect the ABI**: When deployed, an AI assistant can run Pulsar's `fetch_contract_spec` to instantly pull the interface and generate TypeScript/Rust bindings.
- **Querying State**: Use Pulsar's `simulate_transaction` against the read-only view functions:
  - `pending_rewards(user: Address)`: Allows UIs to display real-time accrued rewards.
  - `get_pool_info()`: Fetches TVL (`total_staked`) and the last block an emission was tallied.
  - `get_user_info(user: Address)`: Fetches standard `amount` and `reward_debt` data.

## Contract Interface

### State Mutation

- `initialize(staking_token: Address, reward_token: Address, reward_per_second: i128)`
  Sets the global config. Panics with `AlreadyInitialized` if called more than once.

- `stake(from: Address, amount: i128)`
  Transfers tokens from the user to the contract and tallies current accrued rewards.

- `unstake(to: Address, amount: i128)`
  Transfers tokens back to the user and moves their active rewards into the `pending_rewards` slot to prevent loss during subtraction.

- `claim(user: Address)`
  Pushes all accumulated and pending rewards directly to the user's wallet.

### Error Codes

This contract returns diagnostic error codes using `panic_with_error!` for excellent trace visibility in Soroban RPC.

| Code | Variant              | Description                                                   |
| ---- | -------------------- | ------------------------------------------------------------- |
| `1`  | `NotInitialized`     | Action attempted before `initialize` was called.              |
| `2`  | `ArithmeticError`    | Underflow, Overflow, or 0/negative deposits.                  |
| `3`  | `InsufficientStake`  | User attempted to `unstake` more than their current `amount`. |
| `4`  | `Unauthorized`       | Standard Soroban auth verification failed.                    |
| `5`  | `AlreadyInitialized` | Contract setup cannot be overwritten.                         |

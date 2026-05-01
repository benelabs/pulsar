//! Reference SEP-41 Token Contract
//!
//! A complete, auditable reference implementation of the SEP-41 token
//! standard for Soroban. Suitable for use as a test fixture, a starting
//! point for custom tokens, or as a learning resource.
//!
//! # Storage layout
//!
//! | Key                          | Type    | Lifetime  | Description                  |
//! |------------------------------|---------|-----------|------------------------------|
//! | `DataKey::Admin`             | Address | Persistent| Contract administrator       |
//! | `DataKey::Decimals`          | u32     | Persistent| Token decimals               |
//! | `DataKey::Name`              | String  | Persistent| Token name                   |
//! | `DataKey::Symbol`            | String  | Persistent| Token symbol                 |
//! | `DataKey::TotalSupply`       | i128    | Persistent| Circulating supply           |
//! | `DataKey::Balance(Address)`  | i128    | Persistent| Per-account balance          |
//! | `DataKey::Allowance(…)`      | AllowanceValue | Temporary | Spender allowance    |

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address), // (owner, spender)
}

// ---------------------------------------------------------------------------
// Allowance value (amount + expiry ledger)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct ReferenceToken;

#[contractimpl]
impl ReferenceToken {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the token.  Must be called exactly once.
    ///
    /// # Arguments
    ///
    /// * `admin`    – Address that can mint and set metadata.
    /// * `decimals` – Number of decimal places (e.g. 7 for Stellar-style).
    /// * `name`     – Human-readable token name.
    /// * `symbol`   – Short ticker symbol.
    pub fn initialize(
        env: Env,
        admin: Address,
        decimals: u32,
        name: String,
        symbol: String,
    ) {
        // Prevent re-initialisation
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Decimals, &decimals);
        env.storage().persistent().set(&DataKey::Name, &name);
        env.storage().persistent().set(&DataKey::Symbol, &symbol);
        env.storage().persistent().set(&DataKey::TotalSupply, &0_i128);
    }

    // -----------------------------------------------------------------------
    // Admin-only: mint
    // -----------------------------------------------------------------------

    /// Mint `amount` tokens to `to`.  Only callable by the admin.
    ///
    /// # Events
    ///
    /// Emits `["mint", admin: Address, to: Address]` with data `[amount: i128]`.
    pub fn mint(env: Env, to: Address, amount: i128) {
        assert!(amount > 0, "mint amount must be positive");

        let admin: Address = env.storage().persistent().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(balance + amount));

        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply + amount));

        env.events().publish(
            (symbol_short!("mint"), admin, to),
            amount,
        );
    }

    // -----------------------------------------------------------------------
    // SEP-41 read functions
    // -----------------------------------------------------------------------

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Decimals)
            .unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .persistent()
            .get(&DataKey::Name)
            .unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .persistent()
            .get(&DataKey::Symbol)
            .unwrap()
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = DataKey::Allowance(from, spender);
        match env
            .storage()
            .temporary()
            .get::<DataKey, AllowanceValue>(&key)
        {
            Some(v) if v.expiration_ledger >= env.ledger().sequence() => v.amount,
            _ => 0,
        }
    }

    // -----------------------------------------------------------------------
    // SEP-41 mutating functions
    // -----------------------------------------------------------------------

    /// Approve `spender` to spend up to `amount` from `from` until
    /// `expiration_ledger`.
    ///
    /// # Events
    ///
    /// Emits `["approve", from: Address, spender: Address]` with data
    /// `[amount: i128, expiration_ledger: u32]`.
    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        from.require_auth();
        assert!(amount >= 0, "allowance amount must be non-negative");
        assert!(
            expiration_ledger >= env.ledger().sequence(),
            "expiration_ledger must be in the future"
        );

        let key = DataKey::Allowance(from.clone(), spender.clone());
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
        env.storage()
            .temporary()
            .extend_ttl(&key, 0, expiration_ledger - env.ledger().sequence());

        env.events().publish(
            (symbol_short!("approve"), from, spender),
            (amount, expiration_ledger),
        );
    }

    /// Transfer `amount` from `from` to `to`.
    ///
    /// # Events
    ///
    /// Emits `["transfer", from: Address, to: Address]` with data `[amount: i128]`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "transfer amount must be positive");

        let from_balance = Self::balance(env.clone(), from.clone());
        assert!(from_balance >= amount, "insufficient balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_balance + amount));

        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }

    /// Transfer `amount` from `from` to `to`, consuming `spender`'s allowance.
    ///
    /// # Events
    ///
    /// Emits `["transfer", from: Address, to: Address]` with data `[amount: i128]`.
    pub fn transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) {
        spender.require_auth();
        assert!(amount > 0, "transfer amount must be positive");

        let current = Self::allowance(env.clone(), from.clone(), spender.clone());
        assert!(current >= amount, "insufficient allowance");

        // Reduce allowance
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let av: AllowanceValue = env.storage().temporary().get(&key).unwrap();
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount: av.amount - amount,
                expiration_ledger: av.expiration_ledger,
            },
        );

        let from_balance = Self::balance(env.clone(), from.clone());
        assert!(from_balance >= amount, "insufficient balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));

        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_balance + amount));

        env.events()
            .publish((symbol_short!("transfer"), from, to), amount);
    }

    /// Burn `amount` from `from`.
    ///
    /// # Events
    ///
    /// Emits `["burn", from: Address]` with data `[amount: i128]`.
    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "burn amount must be positive");

        let balance = Self::balance(env.clone(), from.clone());
        assert!(balance >= amount, "insufficient balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(balance - amount));

        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply - amount));

        env.events()
            .publish((symbol_short!("burn"), from), amount);
    }

    /// Burn `amount` from `from`, consuming `spender`'s allowance.
    ///
    /// # Events
    ///
    /// Emits `["burn", from: Address]` with data `[amount: i128]`.
    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        assert!(amount > 0, "burn amount must be positive");

        let current = Self::allowance(env.clone(), from.clone(), spender.clone());
        assert!(current >= amount, "insufficient allowance");

        // Reduce allowance
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let av: AllowanceValue = env.storage().temporary().get(&key).unwrap();
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount: av.amount - amount,
                expiration_ledger: av.expiration_ledger,
            },
        );

        let balance = Self::balance(env.clone(), from.clone());
        assert!(balance >= amount, "insufficient balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(balance - amount));

        let supply: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::TotalSupply, &(supply - amount));

        env.events()
            .publish((symbol_short!("burn"), from), amount);
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        Address, Env, IntoVal, String,
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Deploy a fresh token and return (env, client, admin).
    fn setup() -> (Env, ReferenceTokenClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(ReferenceToken, ());
        let client = ReferenceTokenClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(
            &admin,
            &7_u32,
            &String::from_str(&env, "Reference Token"),
            &String::from_str(&env, "REF"),
        );

        (env, client, admin)
    }

    // -----------------------------------------------------------------------
    // initialize
    // -----------------------------------------------------------------------

    #[test]
    fn test_initialize_sets_metadata() {
        let (env, client, _admin) = setup();
        assert_eq!(client.decimals(), 7);
        assert_eq!(client.name(), String::from_str(&env, "Reference Token"));
        assert_eq!(client.symbol(), String::from_str(&env, "REF"));
        assert_eq!(client.total_supply(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_panics_on_reinit() {
        let (env, client, admin) = setup();
        // Second call must panic
        client.initialize(
            &admin,
            &7_u32,
            &String::from_str(&env, "Other"),
            &String::from_str(&env, "OTH"),
        );
    }

    // -----------------------------------------------------------------------
    // mint
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_increases_balance_and_supply() {
        let (_env, client, _admin) = setup();
        let user = Address::generate(&_env);

        client.mint(&user, &1_000_i128);

        assert_eq!(client.balance(&user), 1_000);
        assert_eq!(client.total_supply(), 1_000);
    }

    #[test]
    fn test_mint_accumulates_multiple_mints() {
        let (_env, client, _admin) = setup();
        let user = Address::generate(&_env);

        client.mint(&user, &500_i128);
        client.mint(&user, &300_i128);

        assert_eq!(client.balance(&user), 800);
        assert_eq!(client.total_supply(), 800);
    }

    #[test]
    fn test_mint_to_different_accounts() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);

        client.mint(&alice, &1_000_i128);
        client.mint(&bob, &500_i128);

        assert_eq!(client.balance(&alice), 1_000);
        assert_eq!(client.balance(&bob), 500);
        assert_eq!(client.total_supply(), 1_500);
    }

    #[test]
    #[should_panic(expected = "mint amount must be positive")]
    fn test_mint_zero_panics() {
        let (_env, client, _admin) = setup();
        let user = Address::generate(&_env);
        client.mint(&user, &0_i128);
    }

    #[test]
    #[should_panic(expected = "mint amount must be positive")]
    fn test_mint_negative_panics() {
        let (_env, client, _admin) = setup();
        let user = Address::generate(&_env);
        client.mint(&user, &-1_i128);
    }

    #[test]
    fn test_mint_requires_admin_auth() {
        let (env, client, admin) = setup();
        env.mock_all_auths_allowing_non_root_auth();
        let user = Address::generate(&env);

        client.mint(&user, &100_i128);

        let auths = env.auths();
        // The first auth should be the admin authorising the mint
        assert!(auths.iter().any(|(addr, _)| *addr == admin));
    }

    // -----------------------------------------------------------------------
    // balance
    // -----------------------------------------------------------------------

    #[test]
    fn test_balance_returns_zero_for_unknown_account() {
        let (_env, client, _admin) = setup();
        let stranger = Address::generate(&_env);
        assert_eq!(client.balance(&stranger), 0);
    }

    // -----------------------------------------------------------------------
    // transfer
    // -----------------------------------------------------------------------

    #[test]
    fn test_transfer_moves_tokens() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);

        client.mint(&alice, &1_000_i128);
        client.transfer(&alice, &bob, &400_i128);

        assert_eq!(client.balance(&alice), 600);
        assert_eq!(client.balance(&bob), 400);
        assert_eq!(client.total_supply(), 1_000); // supply unchanged
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn test_transfer_insufficient_balance_panics() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);

        client.mint(&alice, &100_i128);
        client.transfer(&alice, &bob, &200_i128);
    }

    #[test]
    #[should_panic(expected = "transfer amount must be positive")]
    fn test_transfer_zero_panics() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);
        client.mint(&alice, &100_i128);
        client.transfer(&alice, &bob, &0_i128);
    }

    #[test]
    fn test_transfer_requires_from_auth() {
        let (env, client, _admin) = setup();
        env.mock_all_auths_allowing_non_root_auth();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &100_i128);
        client.transfer(&alice, &bob, &50_i128);

        let auths = env.auths();
        assert!(auths.iter().any(|(addr, _)| *addr == alice));
    }

    // -----------------------------------------------------------------------
    // approve / allowance
    // -----------------------------------------------------------------------

    #[test]
    fn test_approve_sets_allowance() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);

        assert_eq!(client.allowance(&alice, &bob), 500);
    }

    #[test]
    fn test_allowance_returns_zero_for_unknown_pair() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);
        assert_eq!(client.allowance(&alice, &bob), 0);
    }

    #[test]
    fn test_allowance_returns_zero_after_expiry() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        // Approve with expiry at current ledger (already expired next ledger)
        let expiry = env.ledger().sequence();
        client.approve(&alice, &bob, &500_i128, &expiry);

        // Advance ledger past expiry
        env.ledger().with_mut(|li| li.sequence_number += 1);

        assert_eq!(client.allowance(&alice, &bob), 0);
    }

    #[test]
    #[should_panic(expected = "allowance amount must be non-negative")]
    fn test_approve_negative_amount_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &-1_i128, &expiry);
    }

    // -----------------------------------------------------------------------
    // transfer_from
    // -----------------------------------------------------------------------

    #[test]
    fn test_transfer_from_consumes_allowance() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &600_i128, &expiry);

        client.transfer_from(&bob, &alice, &carol, &400_i128);

        assert_eq!(client.balance(&alice), 600);
        assert_eq!(client.balance(&carol), 400);
        assert_eq!(client.allowance(&alice, &bob), 200); // 600 - 400
    }

    #[test]
    #[should_panic(expected = "insufficient allowance")]
    fn test_transfer_from_exceeds_allowance_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &100_i128, &expiry);

        client.transfer_from(&bob, &alice, &carol, &200_i128);
    }

    // -----------------------------------------------------------------------
    // burn
    // -----------------------------------------------------------------------

    #[test]
    fn test_burn_reduces_balance_and_supply() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);

        client.mint(&alice, &1_000_i128);
        client.burn(&alice, &300_i128);

        assert_eq!(client.balance(&alice), 700);
        assert_eq!(client.total_supply(), 700);
    }

    #[test]
    #[should_panic(expected = "insufficient balance")]
    fn test_burn_more_than_balance_panics() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);

        client.mint(&alice, &100_i128);
        client.burn(&alice, &200_i128);
    }

    #[test]
    #[should_panic(expected = "burn amount must be positive")]
    fn test_burn_zero_panics() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        client.mint(&alice, &100_i128);
        client.burn(&alice, &0_i128);
    }

    // -----------------------------------------------------------------------
    // burn_from
    // -----------------------------------------------------------------------

    #[test]
    fn test_burn_from_consumes_allowance_and_supply() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);

        client.burn_from(&bob, &alice, &200_i128);

        assert_eq!(client.balance(&alice), 800);
        assert_eq!(client.total_supply(), 800);
        assert_eq!(client.allowance(&alice, &bob), 300); // 500 - 200
    }

    #[test]
    #[should_panic(expected = "insufficient allowance")]
    fn test_burn_from_exceeds_allowance_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &100_i128, &expiry);

        client.burn_from(&bob, &alice, &200_i128);
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_emits_event() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.mint(&user, &1_000_i128);

        let events = env.events().all();
        assert!(!events.is_empty(), "expected at least one event");
        // The last event should be the mint event
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("mint"));
        let amount: i128 = data.into_val(&env);
        assert_eq!(amount, 1_000);
    }

    #[test]
    fn test_transfer_emits_event() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        client.transfer(&alice, &bob, &400_i128);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("transfer"));
        let amount: i128 = data.into_val(&env);
        assert_eq!(amount, 400);
    }

    #[test]
    fn test_burn_emits_event() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        client.burn(&alice, &300_i128);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("burn"));
        let amount: i128 = data.into_val(&env);
        assert_eq!(amount, 300);
    }

    #[test]
    fn test_approve_emits_event() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let expiry = env.ledger().sequence() + 100;

        client.approve(&alice, &bob, &500_i128, &expiry);

        let events = env.events().all();
        let (_, topics, _data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("approve"));
    }

    // -----------------------------------------------------------------------
    // Edge cases / security
    // -----------------------------------------------------------------------

    #[test]
    fn test_full_lifecycle() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        // Mint to alice
        client.mint(&alice, &10_000_i128);
        assert_eq!(client.total_supply(), 10_000);

        // Alice approves bob
        let expiry = env.ledger().sequence() + 200;
        client.approve(&alice, &bob, &3_000_i128, &expiry);

        // Bob transfers on behalf of alice to carol
        client.transfer_from(&bob, &alice, &carol, &1_000_i128);
        assert_eq!(client.balance(&carol), 1_000);
        assert_eq!(client.allowance(&alice, &bob), 2_000);

        // Carol burns her tokens
        client.burn(&carol, &500_i128);
        assert_eq!(client.balance(&carol), 500);
        assert_eq!(client.total_supply(), 9_500);

        // Bob burns from alice using remaining allowance
        client.burn_from(&bob, &alice, &2_000_i128);
        assert_eq!(client.balance(&alice), 7_000);
        assert_eq!(client.total_supply(), 7_500);
        assert_eq!(client.allowance(&alice, &bob), 0);
    }

    #[test]
    fn test_transfer_to_self_is_idempotent() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);

        client.mint(&alice, &1_000_i128);
        client.transfer(&alice, &alice, &400_i128);

        // Balance should be unchanged
        assert_eq!(client.balance(&alice), 1_000);
    }

    // -----------------------------------------------------------------------
    // transfer_from – additional edge cases
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "transfer amount must be positive")]
    fn test_transfer_from_zero_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.transfer_from(&bob, &alice, &carol, &0_i128);
    }

    #[test]
    #[should_panic(expected = "transfer amount must be positive")]
    fn test_transfer_from_negative_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.transfer_from(&bob, &alice, &carol, &-1_i128);
    }

    #[test]
    #[should_panic(expected = "insufficient allowance")]
    fn test_transfer_from_after_allowance_exhausted_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &200_i128, &expiry);
        client.transfer_from(&bob, &alice, &carol, &200_i128); // exhausts allowance
        client.transfer_from(&bob, &alice, &carol, &1_i128);   // must panic
    }

    #[test]
    fn test_transfer_from_emits_transfer_event() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.transfer_from(&bob, &alice, &carol, &300_i128);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("transfer"));
        let amount: i128 = data.into_val(&env);
        assert_eq!(amount, 300);
    }

    // -----------------------------------------------------------------------
    // burn – additional edge cases
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "burn amount must be positive")]
    fn test_burn_negative_panics() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        client.mint(&alice, &100_i128);
        client.burn(&alice, &-1_i128);
    }

    #[test]
    fn test_burn_requires_from_auth() {
        let (env, client, _admin) = setup();
        env.mock_all_auths_allowing_non_root_auth();
        let alice = Address::generate(&env);

        client.mint(&alice, &500_i128);
        client.burn(&alice, &100_i128);

        let auths = env.auths();
        assert!(auths.iter().any(|(addr, _)| *addr == alice));
    }

    // -----------------------------------------------------------------------
    // burn_from – additional edge cases
    // -----------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "burn amount must be positive")]
    fn test_burn_from_zero_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.burn_from(&bob, &alice, &0_i128);
    }

    #[test]
    #[should_panic(expected = "burn amount must be positive")]
    fn test_burn_from_negative_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.burn_from(&bob, &alice, &-1_i128);
    }

    #[test]
    fn test_burn_from_requires_spender_auth() {
        let (env, client, _admin) = setup();
        env.mock_all_auths_allowing_non_root_auth();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.burn_from(&bob, &alice, &200_i128);

        let auths = env.auths();
        assert!(auths.iter().any(|(addr, _)| *addr == bob));
    }

    #[test]
    fn test_burn_from_emits_burn_event() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        client.mint(&alice, &1_000_i128);
        let expiry = env.ledger().sequence() + 100;
        client.approve(&alice, &bob, &500_i128, &expiry);
        client.burn_from(&bob, &alice, &250_i128);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("burn"));
        let amount: i128 = data.into_val(&env);
        assert_eq!(amount, 250);
    }

    // -----------------------------------------------------------------------
    // approve – additional edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_approve_overwrites_previous_allowance() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let expiry = env.ledger().sequence() + 100;

        client.approve(&alice, &bob, &500_i128, &expiry);
        assert_eq!(client.allowance(&alice, &bob), 500);

        client.approve(&alice, &bob, &200_i128, &expiry);
        assert_eq!(client.allowance(&alice, &bob), 200);
    }

    #[test]
    fn test_approve_zero_revokes_allowance() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let expiry = env.ledger().sequence() + 100;

        client.approve(&alice, &bob, &500_i128, &expiry);
        client.approve(&alice, &bob, &0_i128, &expiry);

        assert_eq!(client.allowance(&alice, &bob), 0);
    }

    #[test]
    #[should_panic(expected = "expiration_ledger must be in the future")]
    fn test_approve_past_expiry_panics() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);

        // Advance ledger so sequence > 0, then use a past ledger as expiry
        env.ledger().with_mut(|li| li.sequence_number = 10);
        client.approve(&alice, &bob, &500_i128, &5_u32); // expiry in the past
    }

    #[test]
    fn test_approve_emits_correct_event_data() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let expiry = env.ledger().sequence() + 50;

        client.approve(&alice, &bob, &777_i128, &expiry);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();
        let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
        assert_eq!(topic0, symbol_short!("approve"));
        // data is (amount, expiration_ledger)
        let (amount, exp): (i128, u32) = data.into_val(&env);
        assert_eq!(amount, 777);
        assert_eq!(exp, expiry);
    }

    // -----------------------------------------------------------------------
    // mint – event topics correctness
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_event_topics_include_admin_and_recipient() {
        let (env, client, admin) = setup();
        let user = Address::generate(&env);

        client.mint(&user, &500_i128);

        let events = env.events().all();
        let (_, topics, _) = events.last().unwrap();
        // topics: [symbol, admin, to]
        let topic1: Address = topics.get(1).unwrap().into_val(&env);
        let topic2: Address = topics.get(2).unwrap().into_val(&env);
        assert_eq!(topic1, admin);
        assert_eq!(topic2, user);
    }

    // -----------------------------------------------------------------------
    // Metadata
    // -----------------------------------------------------------------------

    #[test]
    fn test_decimals_zero_is_valid() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(ReferenceToken, ());
        let client = ReferenceTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        client.initialize(
            &admin,
            &0_u32,
            &String::from_str(&env, "Zero Dec"),
            &String::from_str(&env, "ZD"),
        );

        assert_eq!(client.decimals(), 0);
    }

    #[test]
    fn test_total_supply_tracks_mint_and_burn() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);

        assert_eq!(client.total_supply(), 0);
        client.mint(&alice, &5_000_i128);
        client.mint(&bob, &3_000_i128);
        assert_eq!(client.total_supply(), 8_000);
        client.burn(&alice, &1_000_i128);
        assert_eq!(client.total_supply(), 7_000);
        client.burn(&bob, &3_000_i128);
        assert_eq!(client.total_supply(), 4_000);
    }

    // -----------------------------------------------------------------------
    // Boundary / large values
    // -----------------------------------------------------------------------

    #[test]
    fn test_mint_and_burn_large_amount() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let large: i128 = 1_000_000_000_000_000_i128; // 10^15

        client.mint(&alice, &large);
        assert_eq!(client.balance(&alice), large);
        assert_eq!(client.total_supply(), large);

        client.burn(&alice, &large);
        assert_eq!(client.balance(&alice), 0);
        assert_eq!(client.total_supply(), 0);
    }

    #[test]
    fn test_transfer_exact_balance_leaves_zero() {
        let (_env, client, _admin) = setup();
        let alice = Address::generate(&_env);
        let bob = Address::generate(&_env);

        client.mint(&alice, &1_000_i128);
        client.transfer(&alice, &bob, &1_000_i128);

        assert_eq!(client.balance(&alice), 0);
        assert_eq!(client.balance(&bob), 1_000);
    }

    #[test]
    fn test_allowance_independent_per_spender() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);
        let expiry = env.ledger().sequence() + 100;

        client.approve(&alice, &bob, &300_i128, &expiry);
        client.approve(&alice, &carol, &700_i128, &expiry);

        assert_eq!(client.allowance(&alice, &bob), 300);
        assert_eq!(client.allowance(&alice, &carol), 700);
    }
}
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, Map, String, Symbol, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    LimitReached = 1,
    Unauthorized = 2,
    InvalidAmount = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Counter,
    Admin,
    UserData(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserProfile {
    pub name: String,
    pub age: u32,
    pub is_active: bool,
    pub tags: Vec<Symbol>,
}

#[contract]
pub struct ReferenceContract;

#[contractimpl]
impl ReferenceContract {
    /// Initialize the contract with an admin.
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Counter, &0_u32);
    }

    /// Increment the counter, returns the new counter value.
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&DataKey::Counter, &count);

        // Emit an event
        env.events().publish(
            (Symbol::new(&env, "COUNTER"), Symbol::new(&env, "increment")),
            count,
        );

        count
    }

    /// A complex function that accepts a Vector and returns a Map.
    pub fn process_data(env: Env, keys: Vec<Symbol>) -> Map<Symbol, u32> {
        let mut map = Map::new(&env);
        for (i, key) in keys.iter().enumerate() {
            map.set(key, i as u32);
        }
        map
    }

    /// Create or update a user profile.
    pub fn set_profile(env: Env, user: Address, profile: UserProfile) -> Result<(), Error> {
        user.require_auth();

        if profile.age < 18 {
            return Err(Error::InvalidAmount);
        }

        env.storage()
            .persistent()
            .set(&DataKey::UserData(user.clone()), &profile);

        // Emit profile update event
        env.events()
            .publish((Symbol::new(&env, "PROFILE"), user), profile);

        Ok(())
    }

    /// Retrieve a user profile.
    pub fn get_profile(env: Env, user: Address) -> Option<UserProfile> {
        env.storage().persistent().get(&DataKey::UserData(user))
    }

    /// A function that deliberately panics to test simulation error diagnostics.
    pub fn fail_with_error(_env: Env) -> Result<(), Error> {
        Err(Error::LimitReached)
    }
}

mod test;

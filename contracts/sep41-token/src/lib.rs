//! SEP-41 Token Interface
//!
//! Defines the standard Soroban token interface as specified by SEP-41.
//! All compliant token contracts must implement these functions.

#![no_std]

use soroban_sdk::{contractclient, Address, Env, String};

/// SEP-41 standard token interface.
///
/// Every function that mutates state emits a corresponding event so that
/// off-chain indexers can reconstruct balances without scanning storage.
#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    /// Returns the number of decimals used to represent amounts of this token.
    fn decimals(env: Env) -> u32;

    /// Returns the name of the token.
    fn name(env: Env) -> String;

    /// Returns the symbol of the token.
    fn symbol(env: Env) -> String;

    /// Returns the total supply of the token.
    fn total_supply(env: Env) -> i128;

    /// Returns the balance of `id`.
    fn balance(env: Env, id: Address) -> i128;

    /// Returns the allowance for `spender` to transfer from `from`.
    fn allowance(env: Env, from: Address, spender: Address) -> i128;

    /// Set the allowance by `amount` for `spender` to transfer/burn each
    /// token from `from`'s balance. The expiration_ledger is when the
    /// allowance expires. The allowance is reset when the ledger is
    /// greater than or equal to the expiration_ledger.
    ///
    /// # Arguments
    ///
    /// * `from` - The address holding the balance of tokens to be drawn from.
    /// * `spender` - The address spending the tokens held by `from`.
    /// * `amount` - The amount allowed to be spent.
    /// * `expiration_ledger` - The ledger number at which the allowance expires.
    ///
    /// # Events
    ///
    /// Emits an event with topics `["approve", from: Address, spender: Address]`
    /// and data `[amount: i128, expiration_ledger: u32]`.
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);

    /// Transfer `amount` from `from` to `to`.
    ///
    /// # Arguments
    ///
    /// * `from` - The address holding the balance of tokens which will be
    ///   withdrawn from.
    /// * `to` - The address which will receive the transferred tokens.
    /// * `amount` - The amount of tokens to be transferred.
    ///
    /// # Events
    ///
    /// Emits an event with topics `["transfer", from: Address, to: Address]`
    /// and data `[amount: i128]`.
    fn transfer(env: Env, from: Address, to: Address, amount: i128);

    /// Transfer `amount` from `from` to `to`, consuming the allowance of
    /// `spender`. Authorized by spender (`spender.require_auth()`).
    ///
    /// # Arguments
    ///
    /// * `spender` - The address authorizing the transfer, and having its
    ///   allowance consumed during the transfer.
    /// * `from` - The address holding the balance of tokens which will be
    ///   withdrawn from.
    /// * `to` - The address which will receive the transferred tokens.
    /// * `amount` - The amount of tokens to be transferred.
    ///
    /// # Events
    ///
    /// Emits an event with topics `["transfer", from: Address, to: Address]`
    /// and data `[amount: i128]`.
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);

    /// Burn `amount` from `from`.
    ///
    /// # Arguments
    ///
    /// * `from` - The address holding the balance of tokens which will be
    ///   burned from.
    /// * `amount` - The amount of tokens to be burned.
    ///
    /// # Events
    ///
    /// Emits an event with topics `["burn", from: Address]` and data
    /// `[amount: i128]`.
    fn burn(env: Env, from: Address, amount: i128);

    /// Burn `amount` from `from`, consuming the allowance of `spender`.
    ///
    /// # Arguments
    ///
    /// * `spender` - The address authorizing the burn, and having its
    ///   allowance consumed during the burn.
    /// * `from` - The address holding the balance of tokens which will be
    ///   burned from.
    /// * `amount` - The amount of tokens to be burned.
    ///
    /// # Events
    ///
    /// Emits an event with topics `["burn", from: Address]` and data
    /// `[amount: i128]`.
    fn burn_from(env: Env, spender: Address, from: Address, amount: i128);
}
#![no_std]

//! SEP-41 Standard Token Contract
//!
//! Implements the Stellar SEP-41 token interface on Soroban.
//! Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
//!
//! Storage layout:
//!   Instance   — Admin, Decimals, Name, Symbol, TotalSupply
//!   Persistent — Balance(Address), Allowance(Address, Address)

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String,
};

macro_rules! err {
    ($env:expr, $e:expr) => {{
        $env.panic_with_error($e);
        #[allow(unreachable_code)]
        unreachable!()
    }};
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Contract has already been initialized.
    AlreadyInitialized = 1,
    /// Caller is not the admin.
    Unauthorized = 2,
    /// Amount must be greater than zero.
    InvalidAmount = 3,
    /// Sender does not have sufficient balance.
    InsufficientBalance = 4,
    /// Spender does not have sufficient allowance.
    InsufficientAllowance = 5,
    /// Arithmetic overflow.
    Overflow = 6,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

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

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct Sep41Token;

#[contractimpl]
impl Sep41Token {
    // ── Admin / lifecycle ─────────────────────────────────────────────────────

    /// Initialize the token. Can only be called once.
    ///
    /// # Arguments
    /// * `admin`    – Address that can mint tokens.
    /// * `decimals` – Number of decimal places (e.g. 7 for XLM-style).
    /// * `name`     – Human-readable token name.
    /// * `symbol`   – Short ticker symbol.
    pub fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            err!(&env, Error::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0_i128);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("init")),
            (admin, decimals, name, symbol),
        );
    }

    // ── SEP-41 metadata ───────────────────────────────────────────────────────

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap()
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    // ── SEP-41 balances ───────────────────────────────────────────────────────

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    // ── SEP-41 allowances ─────────────────────────────────────────────────────

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    /// Approve `spender` to transfer up to `amount` tokens on behalf of the caller.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128) {
        if amount < 0 {
            err!(&env, Error::InvalidAmount);
        }
        from.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from.clone(), spender.clone()), &amount);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("approve")),
            (from, spender, amount),
        );
    }

    // ── SEP-41 transfers ──────────────────────────────────────────────────────

    /// Transfer `amount` tokens from the caller to `to`.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            err!(&env, Error::InvalidAmount);
        }
        from.require_auth();

        Self::spend_balance(&env, from.clone(), amount);
        Self::receive_balance(&env, to.clone(), amount);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("transfer")),
            (from, to, amount),
        );
    }

    /// Transfer `amount` tokens from `from` to `to` using an allowance.
    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            err!(&env, Error::InvalidAmount);
        }
        spender.require_auth();

        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            err!(&env, Error::InsufficientAllowance);
        }

        env.storage().persistent().set(
            &DataKey::Allowance(from.clone(), spender.clone()),
            &(allowance - amount),
        );

        Self::spend_balance(&env, from.clone(), amount);
        Self::receive_balance(&env, to.clone(), amount);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("xfer_from")),
            (spender, from, to, amount),
        );
    }

    // ── Mint / burn (admin-only) ───────────────────────────────────────────────

    /// Mint `amount` new tokens to `to`. Caller must be the admin.
    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            err!(&env, Error::InvalidAmount);
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        Self::receive_balance(&env, to.clone(), amount);

        let supply: i128 = Self::total_supply(env.clone());
        let new_supply = supply.checked_add(amount).unwrap_or_else(|| {
            err!(&env, Error::Overflow);
        });
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("mint")),
            (to, amount),
        );
    }

    /// Burn `amount` tokens from the caller's balance.
    pub fn burn(env: Env, from: Address, amount: i128) {
        if amount <= 0 {
            err!(&env, Error::InvalidAmount);
        }
        from.require_auth();

        Self::spend_balance(&env, from.clone(), amount);

        let supply: i128 = Self::total_supply(env.clone());
        let new_supply = supply.checked_sub(amount).unwrap_or_else(|| {
            err!(&env, Error::Overflow);
        });
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("burn")),
            (from, amount),
        );
    }

    /// Burn `amount` tokens from `from` using an allowance. Caller must be the spender.
    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        if amount <= 0 {
            err!(&env, Error::InvalidAmount);
        }
        spender.require_auth();

        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            err!(&env, Error::InsufficientAllowance);
        }

        env.storage().persistent().set(
            &DataKey::Allowance(from.clone(), spender.clone()),
            &(allowance - amount),
        );

        Self::spend_balance(&env, from.clone(), amount);

        let supply: i128 = Self::total_supply(env.clone());
        let new_supply = supply.checked_sub(amount).unwrap_or_else(|| {
            err!(&env, Error::Overflow);
        });
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);

        env.events().publish(
            (symbol_short!("token"), symbol_short!("burn_from")),
            (spender, from, amount),
        );
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn spend_balance(env: &Env, from: Address, amount: i128) {
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(from.clone()))
            .unwrap_or(0);

        if balance < amount {
            err!(env, Error::InsufficientBalance);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from), &(balance - amount));
    }

    fn receive_balance(env: &Env, to: Address, amount: i128) {
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(to.clone()))
            .unwrap_or(0);

        let new_balance = balance.checked_add(amount).unwrap_or_else(|| {
            err!(env, Error::Overflow);
        });
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to), &new_balance);
    }
}

mod test;

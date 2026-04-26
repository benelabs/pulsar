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

//! Decentralized Oracle Contract Interface
//!
//! This is a sample Soroban smart contract implementing a decentralized oracle
//! for price feeds. It provides a standard interface for querying asset prices.
//!
//! The contract maintains a mapping of asset pairs to their prices, updated by
//! authorized oracles. Prices are stored as i128 values representing the price
//! with appropriate decimal precision (e.g., 1000000 for $1.00 with 6 decimals).
//!
//! Standard Interface:
//! - get_price(base_asset: Symbol, quote_asset: Symbol) -> i128
//! - set_price(base_asset: Symbol, quote_asset: Symbol, price: i128)
//! - get_supported_assets() -> Vec<Symbol>
//!
//! Security considerations:
//! - Only authorized oracles can update prices
//! - Prices should be updated regularly to remain relevant
//! - Consider using multiple oracles for decentralization

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, vec, Env, Symbol, Vec, Address};

#[contracttype]
pub enum DataKey {
    Price(Symbol, Symbol), // (base_asset, quote_asset) -> price
    AuthorizedOracle(Address),
    SupportedAssets,
}

#[contract]
pub struct OracleContract;

#[contractimpl]
impl OracleContract {
    /// Initialize the oracle contract with an initial authorized oracle
    pub fn initialize(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::AuthorizedOracle(admin), &true);
    }

    /// Get the price of base_asset in terms of quote_asset
    /// Returns the price as i128 (e.g., 1000000 = $1.00 with 6 decimals)
    pub fn get_price(env: Env, base_asset: Symbol, quote_asset: Symbol) -> i128 {
        env.storage().instance()
            .get(&DataKey::Price(base_asset, quote_asset))
            .unwrap_or(0)
    }

    /// Set the price for an asset pair (only authorized oracles)
    pub fn set_price(env: Env, oracle: Address, base_asset: Symbol, quote_asset: Symbol, price: i128) {
        // Check if oracle is authorized
        oracle.require_auth();

        let is_authorized: bool = env.storage().instance()
            .get(&DataKey::AuthorizedOracle(oracle))
            .unwrap_or(false);

        if !is_authorized {
            panic!("Unauthorized oracle");
        }

        env.storage().instance().set(&DataKey::Price(base_asset, quote_asset), &price);

        // Update supported assets list
        let mut assets: Vec<Symbol> = env.storage().instance()
            .get(&DataKey::SupportedAssets)
            .unwrap_or(vec![&env]);

        if !assets.contains(&base_asset) {
            assets.push_back(base_asset);
        }
        if !assets.contains(&quote_asset) {
            assets.push_back(quote_asset);
        }

        env.storage().instance().set(&DataKey::SupportedAssets, &assets);
    }

    /// Get list of supported assets
    pub fn get_supported_assets(env: Env) -> Vec<Symbol> {
        env.storage().instance()
            .get(&DataKey::SupportedAssets)
            .unwrap_or(vec![&env])
    }

    /// Add an authorized oracle (admin only)
    pub fn add_oracle(env: Env, admin: Address, new_oracle: Address) {
        admin.require_auth();

        let is_admin: bool = env.storage().instance()
            .get(&DataKey::AuthorizedOracle(admin))
            .unwrap_or(false);

        if !is_admin {
            panic!("Unauthorized admin");
        }

        env.storage().instance().set(&DataKey::AuthorizedOracle(new_oracle), &true);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    #[test]
    fn test_oracle() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);

        let contract_id = env.register_contract(None, OracleContract);
        let client = OracleContractClient::new(&env, &contract_id);

        // Initialize
        client.initialize(&admin);

        // Add oracle
        client.add_oracle(&admin, &oracle);

        // Set price
        let base = symbol_short!("USD");
        let quote = symbol_short!("XLM");
        client.set_price(&oracle, &base, &quote, &1000000);

        // Get price
        let price = client.get_price(&base, &quote);
        assert_eq!(price, 1000000);
    }
}
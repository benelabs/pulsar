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

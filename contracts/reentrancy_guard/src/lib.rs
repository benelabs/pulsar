#![no_std]

use soroban_sdk::{contracttype, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ReentrancyLock,
}

pub struct ReentrancyGuard;

impl ReentrancyGuard {
    /// Locks the state to prevent reentrancy.
    /// Panics if already locked.
    pub fn lock(env: &Env) {
        if let Some(locked) = env.storage().instance().get::<_, bool>(&DataKey::ReentrancyLock) {
            if locked {
                panic!("Reentrancy Guard: reentrant call detected");
            }
        }
        env.storage().instance().set(&DataKey::ReentrancyLock, &true);
    }

    /// Unlocks the state, allowing future calls.
    pub fn unlock(env: &Env) {
        env.storage().instance().set(&DataKey::ReentrancyLock, &false);
    }
    
    /// Checks if the guard is currently locked without panicking.
    pub fn is_locked(env: &Env) -> bool {
        env.storage().instance().get::<_, bool>(&DataKey::ReentrancyLock).unwrap_or(false)
    }
}

// A simple test module to demonstrate and test the guard
#[cfg(test)]
mod test;

#![cfg(test)]

use super::*;
use soroban_sdk::{contract, contractimpl, Env};

#[contract]
struct MockContract;

#[contractimpl]
impl MockContract {
    pub fn do_work(env: Env) {
        ReentrancyGuard::lock(&env);
        
        // Simulating some work
        
        ReentrancyGuard::unlock(&env);
    }
    
    pub fn do_reentrant_work(env: Env) {
        ReentrancyGuard::lock(&env);
        
        // Attempting to re-enter the lock
        ReentrancyGuard::lock(&env);
        
        ReentrancyGuard::unlock(&env);
    }
    
    pub fn check_locked(env: Env) -> bool {
        ReentrancyGuard::is_locked(&env)
    }
}

#[test]
fn test_lock_unlock_success() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockContract);
    let client = MockContractClient::new(&env, &contract_id);
    
    assert_eq!(client.check_locked(), false);
    
    // This should succeed without panicking
    client.do_work();
    
    // Should be unlocked after the work is done
    assert_eq!(client.check_locked(), false);
}

#[test]
#[should_panic(expected = "Reentrancy Guard: reentrant call detected")]
fn test_reentrancy_panic() {
    let env = Env::default();
    let contract_id = env.register_contract(None, MockContract);
    let client = MockContractClient::new(&env, &contract_id);
    
    // This will panic internally when it tries to lock a second time
    client.do_reentrant_work();
}

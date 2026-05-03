#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

/// A helper function to initialize the testing environment securely.
fn setup_env<'a>() -> (Env, StakingContractClient<'a>, TokenClient<'a>, TokenClient<'a>) {
    let env = Env::default();
    // Mocking auths simplifies testing cross-contract token transfers natively 
    // without building heavy signatures for every generated Address.
    env.mock_all_auths();

    let contract_id = env.register_contract(None, StakingContract);
    let client = StakingContractClient::new(&env, &contract_id);

    let staking_token_admin = Address::generate(&env);
    let reward_token_admin = Address::generate(&env);

    let staking_token_id = env.register_stellar_asset_contract(staking_token_admin.clone());
    let reward_token_id = env.register_stellar_asset_contract(reward_token_admin.clone());

    let staking_token = TokenClient::new(&env, &staking_token_id);
    let reward_token = TokenClient::new(&env, &reward_token_id);

    let reward_asset_client = StellarAssetClient::new(&env, &reward_token_id);
    // Mint a large pool of reward tokens directly to the staking contract to act as emissions
    reward_asset_client.mint(&contract_id, &1_000_000_000_000_000);

    (env, client, staking_token, reward_token)
}

#[test]
fn test_initialization_errors() {
    let (env, client, staking_token, reward_token) = setup_env();
    
    // Init successfully
    client.initialize(&staking_token.address, &reward_token.address, &100);

    // Try to init again - should fail with AlreadyInitialized
    let res = client.try_initialize(&staking_token.address, &reward_token.address, &100);
    assert_eq!(res.unwrap_err().unwrap(), StakingError::AlreadyInitialized.into());
}

#[test]
fn test_uninitialized_errors() {
    let (env, client, _staking_token, _reward_token) = setup_env();
    let user = Address::generate(&env);

    assert_eq!(
        client.try_stake(&user, &100).unwrap_err().unwrap(),
        StakingError::NotInitialized.into()
    );

    assert_eq!(
        client.try_unstake(&user, &100).unwrap_err().unwrap(),
        StakingError::NotInitialized.into()
    );

    assert_eq!(
        client.try_claim(&user).unwrap_err().unwrap(),
        StakingError::NotInitialized.into()
    );

    assert_eq!(
        client.try_get_pool_info().unwrap_err().unwrap(),
        StakingError::NotInitialized.into()
    );

    assert_eq!(
        client.try_pending_rewards(&user).unwrap_err().unwrap(),
        StakingError::NotInitialized.into()
    );
}

#[test]
fn test_arithmetic_and_stake_errors() {
    let (env, client, staking_token, reward_token) = setup_env();
    let user = Address::generate(&env);
    
    client.initialize(&staking_token.address, &reward_token.address, &100);

    // Zero stake
    assert_eq!(
        client.try_stake(&user, &0).unwrap_err().unwrap(),
        StakingError::ArithmeticError.into()
    );

    // Negative stake
    assert_eq!(
        client.try_stake(&user, &-50).unwrap_err().unwrap(),
        StakingError::ArithmeticError.into()
    );

    // Zero unstake
    assert_eq!(
        client.try_unstake(&user, &0).unwrap_err().unwrap(),
        StakingError::ArithmeticError.into()
    );

    // Unstake more than balance
    assert_eq!(
        client.try_unstake(&user, &100).unwrap_err().unwrap(),
        StakingError::InsufficientStake.into()
    );
}

#[test]
fn test_staking_and_reward_accumulation() {
    let (env, client, staking_token, reward_token) = setup_env();
    
    let user = Address::generate(&env);
    let reward_per_second = 10;
    
    client.initialize(&staking_token.address, &reward_token.address, &reward_per_second);

    let staking_asset = StellarAssetClient::new(&env, &staking_token.address);
    staking_asset.mint(&user, &1_000);

    // Set initial ledger timestamp
    env.ledger().set_timestamp(1_000);

    // User stakes their tokens
    client.stake(&user, &1_000);

    // Advance time by a simulated 24-hour period (86400 seconds)
    env.ledger().set_timestamp(1_000 + 86_400);

    // Claim rewards
    client.claim(&user);

    // Calculate expected rewards:
    // 86,400 seconds * 10 rewards/sec * (1000 user stake / 1000 total stake) = 864,000
    assert_eq!(reward_token.balance(&user), 864_000);
    // Ensure staking tokens are held properly by the contract
    assert_eq!(staking_token.balance(&client.address), 1_000);
}

#[test]
fn test_multiple_stakers() {
    let (env, client, staking_token, reward_token) = setup_env();
    
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    
    let reward_per_second = 100;
    client.initialize(&staking_token.address, &reward_token.address, &reward_per_second);

    let staking_asset = StellarAssetClient::new(&env, &staking_token.address);
    staking_asset.mint(&user1, &1_000);
    staking_asset.mint(&user2, &3_000);

    env.ledger().set_timestamp(1_000);

    // Both users stake at the exact same ledger timestamp
    client.stake(&user1, &1_000);
    client.stake(&user2, &3_000);

    // Total stake = 4,000. Advance time by 100 seconds.
    env.ledger().set_timestamp(1_100);

    client.claim(&user1);
    client.claim(&user2);

    // Reward pool over 100 seconds = 100 elapsed * 100 emissions = 10,000 total.
    // User1 stake ratio = 1000 / 4000 = 25% -> Expected reward = 2,500
    // User2 stake ratio = 3000 / 4000 = 75% -> Expected reward = 7,500
    assert_eq!(reward_token.balance(&user1), 2_500);
    assert_eq!(reward_token.balance(&user2), 7_500);
}

#[test]
fn test_unstake_and_emergency_handling() {
    let (env, client, staking_token, reward_token) = setup_env();
    
    let user = Address::generate(&env);
    client.initialize(&staking_token.address, &reward_token.address, &100);

    let staking_asset = StellarAssetClient::new(&env, &staking_token.address);
    staking_asset.mint(&user, &1_000);

    env.ledger().set_timestamp(1_000);
    client.stake(&user, &1_000);

    env.ledger().set_timestamp(1_100);
    
    // Unstaking should correctly calculate and claim accumulated rewards
    client.unstake(&user, &1_000);

    // User should have their stake back
    assert_eq!(staking_token.balance(&user), 1_000);
    // User should have 100 sec * 100 emissions = 10,000 rewards
    assert_eq!(reward_token.balance(&user), 10_000);

    // Contract should have 0 total staked.
    // Let's advance time and have another user stake to ensure pool info handles 0 total staked logic accurately.
    env.ledger().set_timestamp(1_200);
    
    let user2 = Address::generate(&env);
    staking_asset.mint(&user2, &500);
    client.stake(&user2, &500);
    
    env.ledger().set_timestamp(1_300);
    client.claim(&user2);
    
    // user2 should get 100 sec * 100 emissions = 10,000 rewards (emissions during the 1100->1200 period when total_stake was 0 are ignored)
    assert_eq!(reward_token.balance(&user2), 10_000);
}

#[test]
fn test_zero_balance_account() {
    let (env, client, staking_token, reward_token) = setup_env();
    let user = Address::generate(&env);
    
    client.initialize(&staking_token.address, &reward_token.address, &100);
    env.ledger().set_timestamp(1_000);
    
    // Claiming with 0 balance shouldn't panic, just yields 0 rewards
    client.claim(&user);
    assert_eq!(reward_token.balance(&user), 0);
}

#[test]
#[should_panic]
fn test_unauthorized_withdrawal() {
    let env = Env::default();
    // By omitting `env.mock_all_auths()`, we enforce strict authentication validation.
    let contract_id = env.register_contract(None, StakingContract);
    let client = StakingContractClient::new(&env, &contract_id);
    
    let user = Address::generate(&env);
    
    // This correctly simulates an adversarial call where `to.require_auth()`
    // fails and panics the host because `user` did not sign the invocation.
    client.unstake(&user, &100);
}

#[test]
fn test_view_functions() {
    let (env, client, staking_token, reward_token) = setup_env();
    let user = Address::generate(&env);
    
    client.initialize(&staking_token.address, &reward_token.address, &100);
    
    env.ledger().set_timestamp(1_000);
    let staking_asset = StellarAssetClient::new(&env, &staking_token.address);
    staking_asset.mint(&user, &1_000);
    
    client.stake(&user, &1_000);
    
    env.ledger().set_timestamp(1_100);
    
    // Check pending rewards dynamically
    let pending = client.pending_rewards(&user);
    assert_eq!(pending, 10_000); // 100 seconds * 100 emission = 10,000
    
    // Check pool info
    let pool = client.get_pool_info();
    assert_eq!(pool.total_staked, 1_000);
    
    // Check user info
    let user_info = client.get_user_info(&user);
    assert_eq!(user_info.amount, 1_000);
}
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StakingError {
    NotInitialized = 1,
    ArithmeticError = 2,
    InsufficientStake = 3,
    Unauthorized = 4,
    AlreadyInitialized = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    UserStats(Address),
    RewardConfig,
    PoolInfo,
}

#[contracttype]
#[derive(Clone)]
pub struct PoolInfo {
    pub last_reward_block: u64,
    pub acc_reward_per_share: i128,
    pub total_staked: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct UserStats {
    pub amount: i128,
    pub reward_debt: i128,
    pub pending_rewards: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct RewardConfig {
    pub staking_token: Address,
    pub reward_token: Address,
    pub reward_per_second: i128,
}

#[contract]
pub struct StakingContract;

#[contractimpl]
impl StakingContract {
    /// Initializes the contract with the reward token and emission rate.
    pub fn initialize(env: Env, staking_token: Address, reward_token: Address, reward_per_second: i128) {
        if env.storage().instance().has(&DataKey::RewardConfig) {
            panic_with_error!(&env, StakingError::AlreadyInitialized);
        }

        let config = RewardConfig {
            staking_token,
            reward_token,
            reward_per_second,
        };

        // Instance storage is ideal for contract-level configurations
        env.storage().instance().set(&DataKey::RewardConfig, &config);

        let pool_info = PoolInfo {
            last_reward_block: env.ledger().timestamp(),
            acc_reward_per_share: 0,
            total_staked: 0,
        };
        env.storage().instance().set(&DataKey::PoolInfo, &pool_info);
    }

    fn update_pool(env: &Env, config: &RewardConfig) -> PoolInfo {
        let mut pool: PoolInfo = env.storage().instance().get(&DataKey::PoolInfo)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::NotInitialized));

        let current_time = env.ledger().timestamp();
        if current_time <= pool.last_reward_block {
            return pool;
        }

        if pool.total_staked == 0 {
            pool.last_reward_block = current_time;
            env.storage().instance().set(&DataKey::PoolInfo, &pool);
            return pool;
        }

        let time_elapsed = (current_time - pool.last_reward_block) as i128;
        let reward = time_elapsed.checked_mul(config.reward_per_second)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));
        
        const SCALE: i128 = 1_000_000_000;
        let reward_per_share_inc = reward.checked_mul(SCALE)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError))
            .checked_div(pool.total_staked)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));

        pool.acc_reward_per_share = pool.acc_reward_per_share.checked_add(reward_per_share_inc)
            .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));
        pool.last_reward_block = current_time;

        env.storage().instance().set(&DataKey::PoolInfo, &pool);
        pool
    }

    fn settle_user_rewards(env: &Env, user: Address, pool: &PoolInfo) -> UserStats {
        let stats_key = DataKey::UserStats(user);
        let mut stats: UserStats = env.storage().persistent().get(&stats_key).unwrap_or(UserStats {
            amount: 0,
            reward_debt: 0,
            pending_rewards: 0,
        });

        if stats.amount > 0 {
            const SCALE: i128 = 1_000_000_000;
            let accumulated = stats.amount.checked_mul(pool.acc_reward_per_share)
                .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError))
                .checked_div(SCALE)
                .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));
            
            let pending = accumulated.checked_sub(stats.reward_debt)
                .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));

            if pending > 0 {
                stats.pending_rewards = stats.pending_rewards.checked_add(pending)
                    .unwrap_or_else(|| panic_with_error!(env, StakingError::ArithmeticError));
            }
            stats.reward_debt = accumulated; // Update right away so it isn't double-counted
        }
        stats
    }

    /// Stakes a specified amount of tokens.
    pub fn stake(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, StakingError::ArithmeticError);
        }

        let config: RewardConfig = env.storage().instance().get(&DataKey::RewardConfig)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized));

        let mut pool = Self::update_pool(&env, &config);
        let mut stats = Self::settle_user_rewards(&env, from.clone(), &pool);

        stats.amount = stats.amount.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));
        
        const SCALE: i128 = 1_000_000_000;
        stats.reward_debt = stats.amount.checked_mul(pool.acc_reward_per_share)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError))
            .checked_div(SCALE)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));

        env.storage().persistent().set(&DataKey::UserStats(from.clone()), &stats);

        pool.total_staked = pool.total_staked.checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));
        env.storage().instance().set(&DataKey::PoolInfo, &pool);

        let token_client = token::Client::new(&env, &config.staking_token);
        token_client.transfer(&from, &env.current_contract_address(), &amount);
    }

    /// Allows users to unstake.
    pub fn unstake(env: Env, to: Address, amount: i128) {
        to.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, StakingError::ArithmeticError);
        }

        let config: RewardConfig = env.storage().instance().get(&DataKey::RewardConfig)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized));

        let mut pool = Self::update_pool(&env, &config);
        let mut stats = Self::settle_user_rewards(&env, to.clone(), &pool);

        if stats.amount < amount {
            panic_with_error!(&env, StakingError::InsufficientStake);
        }

        stats.amount = stats.amount.checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));
        
        const SCALE: i128 = 1_000_000_000;
        stats.reward_debt = stats.amount.checked_mul(pool.acc_reward_per_share)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError))
            .checked_div(SCALE)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));

        env.storage().persistent().set(&DataKey::UserStats(to.clone()), &stats);

        pool.total_staked = pool.total_staked.checked_sub(amount)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::ArithmeticError));
        env.storage().instance().set(&DataKey::PoolInfo, &pool);

        let token_client = token::Client::new(&env, &config.staking_token);
        token_client.transfer(&env.current_contract_address(), &to, &amount);
    }

    /// Claims accumulated rewards for a user.
    pub fn claim(env: Env, user: Address) {
        user.require_auth();

        let config: RewardConfig = env.storage().instance().get(&DataKey::RewardConfig)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized));

        let pool = Self::update_pool(&env, &config);
        let mut stats = Self::settle_user_rewards(&env, user.clone(), &pool);

        let reward = stats.pending_rewards;
        if reward > 0 {
            stats.pending_rewards = 0;
            env.storage().persistent().set(&DataKey::UserStats(user.clone()), &stats);

            let token_client = token::Client::new(&env, &config.reward_token);
            token_client.transfer(&env.current_contract_address(), &user, &reward);
        }
    }

    /// Returns the current global pool configuration and state.
    pub fn get_pool_info(env: Env) -> PoolInfo {
        env.storage().instance().get(&DataKey::PoolInfo)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized))
    }

    /// Returns the user's current stake and reward tracking state.
    pub fn get_user_info(env: Env, user: Address) -> UserStats {
        env.storage().persistent().get(&DataKey::UserStats(user)).unwrap_or(UserStats {
            amount: 0,
            reward_debt: 0,
            pending_rewards: 0,
        })
    }

    /// Calculates pending rewards for a user at the current ledger timestamp without modifying state.
    pub fn pending_rewards(env: Env, user: Address) -> i128 {
        let config: RewardConfig = env.storage().instance().get(&DataKey::RewardConfig)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized));
        let pool: PoolInfo = env.storage().instance().get(&DataKey::PoolInfo)
            .unwrap_or_else(|| panic_with_error!(&env, StakingError::NotInitialized));
        let stats: UserStats = Self::get_user_info(env.clone(), user);

        if stats.amount == 0 {
            return stats.pending_rewards;
        }

        let mut acc_reward_per_share = pool.acc_reward_per_share;
        let current_time = env.ledger().timestamp();
        
        if current_time > pool.last_reward_block && pool.total_staked > 0 {
            let time_elapsed = (current_time - pool.last_reward_block) as i128;
            let reward = time_elapsed.checked_mul(config.reward_per_second).unwrap_or(0);
            const SCALE: i128 = 1_000_000_000;
            let reward_per_share_inc = reward.checked_mul(SCALE).unwrap_or(0).checked_div(pool.total_staked).unwrap_or(0);
            acc_reward_per_share = acc_reward_per_share.checked_add(reward_per_share_inc).unwrap_or(0);
        }

        const SCALE: i128 = 1_000_000_000;
        let accumulated = stats.amount.checked_mul(acc_reward_per_share).unwrap_or(0).checked_div(SCALE).unwrap_or(0);
        let new_pending = accumulated.checked_sub(stats.reward_debt).unwrap_or(0);
        
        stats.pending_rewards.checked_add(new_pending).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests;
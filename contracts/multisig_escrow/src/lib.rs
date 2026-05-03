#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Vec, Symbol, Map};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Active,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub sender: Address,
    pub receiver: Address,
    pub token: Address,
    pub amount: i128,
    pub signers: Vec<Address>,
    pub threshold: u32,
    pub state: EscrowState,
    pub unlock_time: u64,
}

#[contract]
pub struct MultisigEscrowContract;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow(u64),
    NextId,
    Signatures(u64), // Map<Address, bool>
}

#[contractimpl]
impl MultisigEscrowContract {
    pub fn init_escrow(
        env: Env,
        sender: Address,
        receiver: Address,
        token: Address,
        amount: i128,
        signers: Vec<Address>,
        threshold: u32,
        unlock_time: u64,
    ) -> u64 {
        sender.require_auth();
        
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if threshold == 0 || threshold > signers.len() {
            panic!("invalid threshold");
        }
        
        // Transfer tokens to this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);
        
        let mut next_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let id = next_id;
        next_id += 1;
        env.storage().instance().set(&DataKey::NextId, &next_id);
        
        let escrow = Escrow {
            sender,
            receiver,
            token,
            amount,
            signers,
            threshold,
            state: EscrowState::Active,
            unlock_time,
        };
        
        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);
        let empty_sigs: Map<Address, bool> = Map::new(&env);
        env.storage().persistent().set(&DataKey::Signatures(id), &empty_sigs);
        
        env.events().publish((Symbol::new(&env, "escrow_created"), id), ());
        
        id
    }
    
    pub fn approve(env: Env, id: u64, signer: Address) {
        signer.require_auth();
        let mut escrow: Escrow = env.storage().persistent().get(&DataKey::Escrow(id)).unwrap();
        
        if escrow.state != EscrowState::Active {
            panic!("escrow not active");
        }
        
        if !escrow.signers.contains(&signer) {
            panic!("not a signer");
        }
        
        let mut sigs: Map<Address, bool> = env.storage().persistent().get(&DataKey::Signatures(id)).unwrap();
        sigs.set(signer.clone(), true);
        env.storage().persistent().set(&DataKey::Signatures(id), &sigs);
        
        // Check if threshold met
        if sigs.len() >= escrow.threshold {
            escrow.state = EscrowState::Released;
            env.storage().persistent().set(&DataKey::Escrow(id), &escrow);
            
            let token_client = token::Client::new(&env, &escrow.token);
            token_client.transfer(&env.current_contract_address(), &escrow.receiver, &escrow.amount);
            
            env.events().publish((Symbol::new(&env, "escrow_released"), id), ());
        } else {
            env.events().publish((Symbol::new(&env, "escrow_approved"), id), signer);
        }
    }
    
    pub fn refund(env: Env, id: u64, caller: Address) {
        caller.require_auth();
        let mut escrow: Escrow = env.storage().persistent().get(&DataKey::Escrow(id)).unwrap();
        
        if escrow.state != EscrowState::Active {
            panic!("escrow not active");
        }
        
        if caller != escrow.sender {
            panic!("only sender can refund");
        }
        
        if env.ledger().timestamp() < escrow.unlock_time {
            panic!("unlock time not reached");
        }
        
        escrow.state = EscrowState::Refunded;
        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);
        
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.sender, &escrow.amount);
        
        env.events().publish((Symbol::new(&env, "escrow_refunded"), id), ());
    }
    
    pub fn get_escrow(env: Env, id: u64) -> Escrow {
        env.storage().persistent().get(&DataKey::Escrow(id)).unwrap()
    }
}

mod test;

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Vec, Symbol, xdr::ToXdr};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    MerkleRoot,
    Claimed(Address), // keep track of who claimed
}

#[contract]
pub struct MerkleWhitelistContract;

#[contractimpl]
impl MerkleWhitelistContract {
    pub fn init(env: Env, admin: Address, root: BytesN<32>) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::MerkleRoot, &root);
    }
    
    pub fn set_root(env: Env, admin: Address, root: BytesN<32>) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not admin");
        }
        env.storage().instance().set(&DataKey::MerkleRoot, &root);
    }

    pub fn claim(env: Env, caller: Address, amount: i128, proof: Vec<BytesN<32>>) {
        caller.require_auth();
        
        // Ensure not already claimed
        if env.storage().persistent().has(&DataKey::Claimed(caller.clone())) {
            panic!("already claimed");
        }
        
        let root: BytesN<32> = env.storage().instance().get(&DataKey::MerkleRoot).expect("root not set");
        
        // Verify proof
        if !Self::verify_proof(&env, &caller, amount, &proof, &root) {
            panic!("invalid proof");
        }
        
        // Mark as claimed
        env.storage().persistent().set(&DataKey::Claimed(caller.clone()), &true);
        
        // Publish event for tracking claims
        env.events().publish((Symbol::new(&env, "claim_successful"), caller), amount);
    }
    
    pub fn has_claimed(env: Env, caller: Address) -> bool {
        env.storage().persistent().has(&DataKey::Claimed(caller))
    }
    
    fn verify_proof(
        env: &Env,
        caller: &Address,
        amount: i128,
        proof: &Vec<BytesN<32>>,
        root: &BytesN<32>,
    ) -> bool {
        let leaf = Self::compute_leaf(env, caller, amount);
        let mut computed_hash = leaf;
        
        for sibling in proof.iter() {
            let is_computed_first = Self::is_less_than(env, &computed_hash, &sibling);
            
            let mut combined = soroban_sdk::Bytes::new(env);
            if is_computed_first {
                combined.append(&computed_hash.into());
                combined.append(&sibling.into());
            } else {
                combined.append(&sibling.into());
                combined.append(&computed_hash.into());
            }
            computed_hash = env.crypto().sha256(&combined);
        }
        
        computed_hash == *root
    }
    
    fn compute_leaf(env: &Env, caller: &Address, amount: i128) -> BytesN<32> {
        let tuple = (caller.clone(), amount);
        let bytes = tuple.to_xdr(env);
        env.crypto().sha256(&bytes)
    }
    
    fn is_less_than(_env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> bool {
        let a_arr = a.to_array();
        let b_arr = b.to_array();
        for i in 0..32 {
            if a_arr[i] < b_arr[i] {
                return true;
            }
            if a_arr[i] > b_arr[i] {
                return false;
            }
        }
        false
    }
}

mod test;

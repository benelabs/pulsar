#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, xdr::ToXdr, Address, Env, BytesN, vec};

fn compute_leaf(env: &Env, caller: &Address, amount: i128) -> BytesN<32> {
    let tuple = (caller.clone(), amount);
    let bytes = tuple.to_xdr(env);
    env.crypto().sha256(&bytes)
}

fn sort_and_hash(env: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let a_arr = a.to_array();
    let b_arr = b.to_array();
    let mut is_a_first = false;
    for i in 0..32 {
        if a_arr[i] < b_arr[i] {
            is_a_first = true;
            break;
        } else if a_arr[i] > b_arr[i] {
            is_a_first = false;
            break;
        }
    }
    
    let mut combined = soroban_sdk::Bytes::new(env);
    if is_a_first {
        combined.append(&a.clone().into());
        combined.append(&b.clone().into());
    } else {
        combined.append(&b.clone().into());
        combined.append(&a.clone().into());
    }
    env.crypto().sha256(&combined)
}

#[test]
fn test_whitelist_success() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, MerkleWhitelistContract);
    let client = MerkleWhitelistContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    
    let amount1 = 100i128;
    let amount2 = 200i128;
    let amount3 = 300i128;
    
    let leaf1 = compute_leaf(&env, &user1, amount1);
    let leaf2 = compute_leaf(&env, &user2, amount2);
    let leaf3 = compute_leaf(&env, &user3, amount3);
    
    // Tree:
    //      root
    //      /  \
    //   node1  leaf3
    //   /   \
    // leaf1 leaf2
    let node1 = sort_and_hash(&env, &leaf1, &leaf2);
    let root = sort_and_hash(&env, &node1, &leaf3);
    
    client.init(&admin, &root);
    
    // Test user 1 claiming
    // Proof for leaf1 is [leaf2, leaf3]
    let proof1 = vec![&env, leaf2.clone(), leaf3.clone()];
    client.claim(&user1, &amount1, &proof1);
    
    assert_eq!(client.has_claimed(&user1), true);
    
    // Test user 3 claiming
    // Proof for leaf3 is [node1]
    let proof3 = vec![&env, node1.clone()];
    client.claim(&user3, &amount3, &proof3);
    
    assert_eq!(client.has_claimed(&user3), true);
}

#[test]
#[should_panic(expected = "invalid proof")]
fn test_whitelist_invalid_proof() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, MerkleWhitelistContract);
    let client = MerkleWhitelistContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    
    let leaf1 = compute_leaf(&env, &user1, 100);
    let leaf2 = compute_leaf(&env, &user2, 200);
    
    let root = sort_and_hash(&env, &leaf1, &leaf2);
    
    client.init(&admin, &root);
    
    // Try to claim with wrong amount
    let proof = vec![&env, leaf2.clone()];
    client.claim(&user1, &999, &proof);
}

#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, vec};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

#[test]
fn test_escrow_success() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, MultisigEscrowContract);
    let client = MultisigEscrowContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract(token_admin);
    let token = TokenClient::new(&env, &token_contract);
    let token_admin_client = StellarAssetClient::new(&env, &token_contract);
    
    token_admin_client.mint(&sender, &1000);
    
    let signers = vec![&env, signer1.clone(), signer2.clone(), signer3.clone()];
    
    let id = client.init_escrow(
        &sender,
        &receiver,
        &token_contract,
        &500,
        &signers,
        &2,
        &100,
    );
    
    assert_eq!(token.balance(&sender), 500);
    assert_eq!(token.balance(&contract_id), 500);
    
    client.approve(&id, &signer1);
    assert_eq!(token.balance(&receiver), 0);
    
    client.approve(&id, &signer2);
    assert_eq!(token.balance(&receiver), 500);
    assert_eq!(token.balance(&contract_id), 0);
}

#[test]
fn test_escrow_refund() {
    let env = Env::default();
    env.mock_all_auths();
    
    let contract_id = env.register_contract(None, MultisigEscrowContract);
    let client = MultisigEscrowContractClient::new(&env, &contract_id);

    let sender = Address::generate(&env);
    let receiver = Address::generate(&env);
    let signer1 = Address::generate(&env);
    
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract(token_admin);
    let token = TokenClient::new(&env, &token_contract);
    let token_admin_client = StellarAssetClient::new(&env, &token_contract);
    
    token_admin_client.mint(&sender, &1000);
    
    let signers = vec![&env, signer1.clone()];
    
    let id = client.init_escrow(
        &sender,
        &receiver,
        &token_contract,
        &500,
        &signers,
        &1,
        &100, // unlock time
    );
    
    // advance ledger
    env.ledger().set_timestamp(101);
    
    client.refund(&id, &sender);
    
    assert_eq!(token.balance(&sender), 1000);
    assert_eq!(token.balance(&contract_id), 0);
}

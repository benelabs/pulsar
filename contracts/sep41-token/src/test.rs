#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, Sep41TokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Sep41Token, ());
    let client = Sep41TokenClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(
        &admin,
        &7,
        &String::from_str(&env, "Pulsar Token"),
        &String::from_str(&env, "PLSR"),
    );

    (env, client, admin)
}

// ── Initialization ────────────────────────────────────────────────────────────

#[test]
fn test_initialize_metadata() {
    let (env, client, _admin) = setup();
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.name(), String::from_str(&env, "Pulsar Token"));
    assert_eq!(client.symbol(), String::from_str(&env, "PLSR"));
    assert_eq!(client.total_supply(), 0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_initialize_twice_fails() {
    let (env, client, admin) = setup();
    client.initialize(
        &admin,
        &7,
        &String::from_str(&env, "Pulsar Token"),
        &String::from_str(&env, "PLSR"),
    );
}

// ── Mint ──────────────────────────────────────────────────────────────────────

#[test]
fn test_mint_increases_balance_and_supply() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);

    client.mint(&user, &1_000_0000000);

    assert_eq!(client.balance(&user), 1_000_0000000);
    assert_eq!(client.total_supply(), 1_000_0000000);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_mint_zero_fails() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_mint_negative_fails() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &-1);
}

// ── Transfer ──────────────────────────────────────────────────────────────────

#[test]
fn test_transfer() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &500);
    client.transfer(&alice, &bob, &200);

    assert_eq!(client.balance(&alice), 300);
    assert_eq!(client.balance(&bob), 200);
    assert_eq!(client.total_supply(), 500);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_transfer_insufficient_balance_fails() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &100);
    client.transfer(&alice, &bob, &101);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_transfer_zero_fails() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    client.transfer(&alice, &bob, &0);
}

// ── Approve / transfer_from ───────────────────────────────────────────────────

#[test]
fn test_approve_and_transfer_from() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    client.mint(&alice, &1_000);
    client.approve(&alice, &bob, &300);

    assert_eq!(client.allowance(&alice, &bob), 300);

    client.transfer_from(&bob, &alice, &carol, &200);

    assert_eq!(client.balance(&alice), 800);
    assert_eq!(client.balance(&carol), 200);
    assert_eq!(client.allowance(&alice, &bob), 100); // 300 - 200
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_transfer_from_insufficient_allowance_fails() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    client.mint(&alice, &1_000);
    client.approve(&alice, &bob, &50);
    client.transfer_from(&bob, &alice, &carol, &51);
}

// ── Burn ──────────────────────────────────────────────────────────────────────

#[test]
fn test_burn_reduces_balance_and_supply() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    client.mint(&alice, &1_000);
    client.burn(&alice, &400);

    assert_eq!(client.balance(&alice), 600);
    assert_eq!(client.total_supply(), 600);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #4)")]
fn test_burn_insufficient_balance_fails() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);

    client.mint(&alice, &100);
    client.burn(&alice, &101);
}

#[test]
fn test_burn_from() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &1_000);
    client.approve(&alice, &bob, &500);
    client.burn_from(&bob, &alice, &300);

    assert_eq!(client.balance(&alice), 700);
    assert_eq!(client.total_supply(), 700);
    assert_eq!(client.allowance(&alice, &bob), 200); // 500 - 300
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5)")]
fn test_burn_from_insufficient_allowance_fails() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.mint(&alice, &1_000);
    client.approve(&alice, &bob, &100);
    client.burn_from(&bob, &alice, &101);
}

// ── Zero-balance reads ────────────────────────────────────────────────────────

#[test]
fn test_balance_of_unknown_address_is_zero() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(client.balance(&stranger), 0);
}

#[test]
fn test_allowance_of_unknown_pair_is_zero() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    assert_eq!(client.allowance(&a, &b), 0);
}

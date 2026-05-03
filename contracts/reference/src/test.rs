#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, Env};

fn setup_test() -> (Env, ReferenceContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ReferenceContract, ());
    let client = ReferenceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    (env, client, admin)
}

#[test]
fn test_init_and_increment() {
    let (_env, client, admin) = setup_test();
    client.init(&admin);

    assert_eq!(client.increment(), 1);
    assert_eq!(client.increment(), 2);
    assert_eq!(client.increment(), 3);
}

#[test]
fn test_process_data() {
    let (env, client, _admin) = setup_test();

    let keys = vec![&env, Symbol::new(&env, "A"), Symbol::new(&env, "B")];
    let result = client.process_data(&keys);

    assert_eq!(result.get(Symbol::new(&env, "A")).unwrap(), 0);
    assert_eq!(result.get(Symbol::new(&env, "B")).unwrap(), 1);
}

#[test]
fn test_set_and_get_profile() {
    let (env, client, admin) = setup_test();
    client.init(&admin);

    let user = Address::generate(&env);
    let profile = UserProfile {
        name: String::from_str(&env, "Alice"),
        age: 25,
        is_active: true,
        tags: vec![&env, Symbol::new(&env, "dev")],
    };

    client.set_profile(&user, &profile);

    let retrieved = client.get_profile(&user).unwrap();
    assert_eq!(retrieved.name, profile.name);
    assert_eq!(retrieved.age, profile.age);
    assert_eq!(retrieved.is_active, profile.is_active);
    assert_eq!(retrieved.tags.len(), 1);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #3)")]
fn test_set_profile_invalid_age() {
    let (env, client, admin) = setup_test();
    client.init(&admin);

    let user = Address::generate(&env);
    let profile = UserProfile {
        name: String::from_str(&env, "Bob"),
        age: 17, // Invalid age, should return Error::InvalidAmount (3)
        is_active: true,
        tags: vec![&env],
    };

    client.set_profile(&user, &profile);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1)")]
fn test_fail_with_error() {
    let (_env, client, _admin) = setup_test();
    client.fail_with_error();
}

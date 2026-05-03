#[cfg(test)]
mod test {
    use soroban_sdk::{Env, Address};
    use crate::create_user;

    #[test]
    fn test_create_emits_event() {
        let env = Env::default();

        let caller = Address::random(&env);
        let user = Address::random(&env);

        create_user(env.clone(), caller.clone(), user.clone());

        let events = env.events().all();
        assert!(!events.is_empty());
    }
}

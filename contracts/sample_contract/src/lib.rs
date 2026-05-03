use soroban_sdk::{Env, Address};
mod events;

use events::{Event, CREATE};

pub fn create_user(env: Env, caller: Address, user: Address) {
    // business logic here

    Event::state_change(
        &env,
        CREATE,
        &caller,
        Some(user.clone()),
        soroban_sdk::symbol_short!("user_created"),
    );
}

use soroban_sdk::{symbol_short, Env, Symbol, Address};

pub struct Event;

impl Event {
    pub fn state_change(
        env: &Env,
        action: Symbol,
        actor: &Address,
        target: Option<Address>,
        metadata: Symbol,
    ) {
        env.events().publish(
            (symbol_short!("pulsar"), action),
            (actor, target, metadata),
        );
    }
}

pub const CREATE: Symbol = symbol_short!("CREATE");
pub const UPDATE: Symbol = symbol_short!("UPDATE");
pub const DELETE: Symbol = symbol_short!("DELETE");
pub const TRANSFER: Symbol = symbol_short!("TRANSFER");

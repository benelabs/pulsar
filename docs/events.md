# Pulsar Event Standard

## Event Format

### Topic
("pulsar", ACTION)

### Data
(actor: Address, target: Option<Address>, metadata: Symbol)

## Actions
- CREATE
- UPDATE
- DELETE
- TRANSFER

## Example

Event::state_change(
    &env,
    CREATE,
    &caller,
    Some(user.clone()),
    symbol_short!("user_created"),
);

# Requirements Document

## Introduction

The restricted addresses feature adds a security layer to the Pulsar MCP server that allows operators to define a list of Stellar account addresses and/or Soroban contract IDs that are blocked from being used in tool calls. When a restricted address is detected in any tool input, the server rejects the request before any network call is made, returning a clear diagnostic error. The list is managed via environment configuration and an in-memory store, with optional persistence to a local JSON file.

## Glossary

- **Restricted_Address**: A Stellar public key (G...) or Soroban contract ID (C...) that has been blocked from use in any Pulsar tool call.
- **Address_Registry**: The in-memory store that holds the current set of restricted addresses, loaded at startup and optionally persisted to disk.
- **Guard**: The validation step that checks tool inputs against the Address_Registry before any network call is made.
- **Operator**: A person or system that configures and manages the Pulsar MCP server.
- **Tool_Input**: The validated Zod-parsed input object passed to any Pulsar MCP tool handler.
- **Pulsar_Server**: The Pulsar MCP server process.

## Requirements

### Requirement 1: Address Registry Management

**User Story:** As an operator, I want to manage a list of restricted addresses, so that I can prevent specific Stellar accounts or contracts from being used through the Pulsar server.

#### Acceptance Criteria

1. THE Address_Registry SHALL store a set of unique Stellar public keys and Soroban contract IDs as restricted addresses.
2. WHEN the Pulsar_Server starts, THE Address_Registry SHALL load restricted addresses from the `RESTRICTED_ADDRESSES` environment variable, which contains a comma-separated list of addresses.
3. WHERE a `RESTRICTED_ADDRESSES_FILE` environment variable is set, THE Address_Registry SHALL also load addresses from the specified JSON file at startup.
4. WHEN an address is added to the Address_Registry, THE Address_Registry SHALL validate that it is a well-formed Stellar public key (G..., 56 chars, base32) or Soroban contract ID (C..., 56 chars, base32).
5. IF an address provided to the Address_Registry fails format validation, THEN THE Address_Registry SHALL reject it and return a descriptive validation error identifying the malformed address.
6. THE Address_Registry SHALL expose an `add` operation that inserts a single validated address into the restricted set.
7. THE Address_Registry SHALL expose a `remove` operation that deletes a single address from the restricted set.
8. THE Address_Registry SHALL expose a `list` operation that returns all currently restricted addresses as an array.
9. THE Address_Registry SHALL expose a `has` operation that returns a boolean indicating whether a given address is restricted.
10. WHEN the same address is added more than once, THE Address_Registry SHALL store it only once (set semantics).

### Requirement 2: Tool Input Guard

**User Story:** As an operator, I want all tool calls to be checked against the restricted address list, so that blocked addresses cannot be used in any Pulsar operation.

#### Acceptance Criteria

1. WHEN any Pulsar tool receives a Tool_Input containing an address field, THE Guard SHALL check every address field in that input against the Address_Registry before any network call is made.
2. IF a Tool_Input contains a restricted address, THEN THE Guard SHALL reject the request and return an error response with error code `RESTRICTED_ADDRESS` and a message identifying which address is restricted.
3. WHEN THE Guard rejects a request, THE Pulsar_Server SHALL NOT make any network call (Horizon, Soroban RPC, or stellar-cli) for that request.
4. THE Guard SHALL check the following fields across all tools:
   - `get_account_balance`: `account_id`, `asset_issuer`
   - `submit_transaction`: no direct address field (XDR is opaque — not decoded for restriction checks)
   - `fetch_contract_spec`: `contract_id`
   - `simulate_transaction`: no direct address field (XDR is opaque — not decoded for restriction checks)
5. WHEN no address fields in a Tool_Input are restricted, THE Guard SHALL allow the request to proceed normally.

### Requirement 3: MCP Tool Interface

**User Story:** As an AI assistant, I want MCP tools to manage restricted addresses, so that I can help operators configure address restrictions through the standard tool interface.

#### Acceptance Criteria

1. THE Pulsar_Server SHALL expose a `manage_restricted_addresses` MCP tool that accepts an `action` parameter with values `add`, `remove`, `list`, or `check`.
2. WHEN the `manage_restricted_addresses` tool is called with `action: "add"` and a valid `address`, THE Pulsar_Server SHALL add the address to the Address_Registry and return a success confirmation including the address and the updated count of restricted addresses.
3. WHEN the `manage_restricted_addresses` tool is called with `action: "remove"` and an `address`, THE Pulsar_Server SHALL remove the address from the Address_Registry and return a success confirmation.
4. WHEN the `manage_restricted_addresses` tool is called with `action: "list"`, THE Pulsar_Server SHALL return the full list of currently restricted addresses.
5. WHEN the `manage_restricted_addresses` tool is called with `action: "check"` and an `address`, THE Pulsar_Server SHALL return whether that address is currently restricted.
6. IF the `manage_restricted_addresses` tool is called with `action: "add"` or `action: "remove"` without an `address` field, THEN THE Pulsar_Server SHALL return a validation error.
7. IF the `manage_restricted_addresses` tool is called with `action: "add"` and a malformed address, THEN THE Pulsar_Server SHALL return a validation error identifying the malformed address.

### Requirement 4: Persistence

**User Story:** As an operator, I want restricted address changes to survive server restarts, so that I don't have to reconfigure restrictions every time the server is restarted.

#### Acceptance Criteria

1. WHERE a `RESTRICTED_ADDRESSES_FILE` environment variable is set, THE Address_Registry SHALL write the current restricted address set to that file after every `add` or `remove` operation.
2. WHEN the Pulsar_Server starts and `RESTRICTED_ADDRESSES_FILE` points to an existing file, THE Address_Registry SHALL merge the addresses from that file with any addresses from the `RESTRICTED_ADDRESSES` environment variable.
3. IF the `RESTRICTED_ADDRESSES_FILE` cannot be read at startup, THEN THE Address_Registry SHALL log a warning and continue with addresses from the environment variable only.
4. IF the `RESTRICTED_ADDRESSES_FILE` cannot be written after an `add` or `remove` operation, THEN THE Address_Registry SHALL log an error but SHALL NOT fail the in-memory operation.
5. THE Address_Registry SHALL store the persistence file as a JSON array of address strings.

### Requirement 5: Error Handling and Diagnostics

**User Story:** As an operator, I want clear error messages when restricted address checks fail, so that I can diagnose and resolve issues quickly.

#### Acceptance Criteria

1. WHEN THE Guard rejects a request due to a restricted address, THE Pulsar_Server SHALL include the restricted address value in the error response.
2. WHEN THE Guard rejects a request due to a restricted address, THE Pulsar_Server SHALL include the name of the tool that was called in the error response.
3. THE Pulsar_Server SHALL log a warning-level message whenever a restricted address is detected in a tool call, including the tool name and the restricted address.
4. IF an address validation error occurs during `add`, THE Pulsar_Server SHALL return a structured error response with the invalid address and a description of the format violation.
5. THE Pulsar_Server SHALL use the existing `PulsarError` hierarchy, adding a new `RESTRICTED_ADDRESS` error code to `PulsarErrorCode`.

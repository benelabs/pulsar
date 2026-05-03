# Implementation Plan: Restricted Addresses

## Overview

Implement the restricted addresses security layer for the Pulsar MCP server. Tasks build incrementally: core registry → guard → MCP tool → server wiring → persistence.

## Tasks

- [x] 1. Extend error types and config
  - [x] 1.1 Add `RESTRICTED_ADDRESS` to `PulsarErrorCode` enum and create `PulsarRestrictedAddressError` class in `src/errors.ts`
    - Extend `PulsarErrorCode` with `RESTRICTED_ADDRESS = 'RESTRICTED_ADDRESS'`
    - Add `PulsarRestrictedAddressError extends PulsarError` with `address` and `tool` in details
    - _Requirements: 5.5_
  - [x] 1.2 Add `restrictedAddresses` and `restrictedAddressesFile` optional fields to `configSchema` in `src/config.ts`
    - Map from `RESTRICTED_ADDRESSES` and `RESTRICTED_ADDRESSES_FILE` env vars
    - _Requirements: 1.2, 1.3_

- [x] 2. Implement AddressRegistry service
  - [x] 2.1 Create `src/services/address-registry.ts` with the `AddressRegistry` class
    - Internal `Set<string>` store
    - `add(address)` — validates with `StellarPublicKeySchema` or `ContractIdSchema`, throws `PulsarValidationError` if invalid, inserts into set
    - `remove(address)` — deletes from set, no-op if absent
    - `list()` — returns sorted array of all addresses
    - `has(address)` — returns boolean
    - Export a singleton `addressRegistry` instance
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  - [x] 2.2 Add `load()` method to `AddressRegistry`
    - Parse comma-separated `config.restrictedAddresses` string and add each address
    - If `config.restrictedAddressesFile` is set, read the JSON file and merge addresses
    - On file read failure, log a warning and continue
    - _Requirements: 1.2, 1.3, 4.2, 4.3_
  - [x]* 2.3 Write property tests for AddressRegistry in `tests/unit/address-registry.test.ts`
    - Install `fast-check` as a dev dependency
    - **Property 1: Add then has** — for any valid address, after add(), has() returns true
      - `// Feature: restricted-addresses, Property 1: Add then has`
      - **Validates: Requirements 1.1, 1.6, 1.9**
    - **Property 2: Add/remove round trip** — for any address, add then remove leaves has() as false and list() unchanged
      - `// Feature: restricted-addresses, Property 2: Add/remove round trip`
      - **Validates: Requirements 1.7, 1.9**
    - **Property 3: Set semantics** — adding an address N times results in it appearing exactly once in list()
      - `// Feature: restricted-addresses, Property 3: Set semantics — no duplicates`
      - **Validates: Requirements 1.10**
    - **Property 6: Invalid addresses rejected** — any string that is not a valid G.../C... address causes add() to throw PulsarValidationError
      - `// Feature: restricted-addresses, Property 6: Invalid addresses are rejected`
      - **Validates: Requirements 1.4, 1.5**
    - Run minimum 100 iterations per property (`{ numRuns: 100 }`)

- [x] 3. Implement AddressRegistry persistence
  - [x] 3.1 Add `persist()` private method to `AddressRegistry` and call it after every `add` and `remove`
    - Write `list()` as a JSON array to a temp file, then rename to `filePath` (atomic write)
    - On write failure, log an error but do not throw
    - _Requirements: 4.1, 4.4, 4.5_
  - [x]* 3.2 Write property test for persistence round trip in `tests/unit/address-registry.test.ts`
    - **Property 8: Persistence round trip** — for any set of valid addresses, writing then loading a new registry from the file produces the same list()
      - `// Feature: restricted-addresses, Property 8: Persistence round trip`
      - **Validates: Requirements 4.1, 4.2, 4.5**

- [ ] 4. Checkpoint — Ensure all AddressRegistry tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Guard service
  - [x] 5.1 Create `src/services/address-guard.ts` with `checkToolInput` function
    - Define the per-tool field map: `get_account_balance` → `[account_id, asset_issuer]`, `fetch_contract_spec` → `[contract_id]`
    - Extract the relevant fields from the input object for the given tool name
    - Call `registry.has()` on each extracted address value (skip undefined/null)
    - Return `{ blocked: true, address }` on first match, `{ blocked: false }` if none match
    - _Requirements: 2.1, 2.4, 2.5_
  - [x]* 5.2 Write property tests for Guard in `tests/unit/address-guard.test.ts`
    - **Property 4: Guard blocks restricted addresses** — for any valid address added to the registry, a tool input containing that address returns blocked: true
      - `// Feature: restricted-addresses, Property 4: Guard blocks restricted addresses`
      - **Validates: Requirements 2.1, 2.2**
    - **Property 5: Guard allows unrestricted addresses** — for any tool input whose address fields are not in the registry, checkToolInput returns blocked: false
      - `// Feature: restricted-addresses, Property 5: Guard allows unrestricted addresses`
      - **Validates: Requirements 2.5**
    - Unit test: guard does not check XDR fields for submit_transaction and simulate_transaction
    - Unit test: guard skips undefined/null address fields without throwing
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

- [x] 6. Implement manage_restricted_addresses tool
  - [x] 6.1 Create `src/tools/manage_restricted_addresses.ts`
    - Define `ManageRestrictedAddressesInputSchema` with `action` enum and optional `address`
    - Implement handler for `add`: validate address presence, call `registry.add()`, return `{ action, address, count }`
    - Implement handler for `remove`: validate address presence, call `registry.remove()`, return `{ action, address, removed, count }`
    - Implement handler for `list`: call `registry.list()`, return `{ action, addresses, count }`
    - Implement handler for `check`: validate address presence, call `registry.has()`, return `{ action, address, restricted }`
    - Throw `PulsarValidationError` when `address` is missing for add/remove/check actions
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x]* 6.2 Write unit tests for manage_restricted_addresses in `tests/unit/manage_restricted_addresses.test.ts`
    - Test all four actions with valid inputs
    - Test validation errors for missing address on add/remove/check
    - Test validation error for malformed address on add
    - Test that add returns updated count
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 7. Wire everything into PulsarServer
  - [x] 7.1 Initialize `addressRegistry` at server startup in `src/index.ts`
    - Call `await addressRegistry.load()` before `this.setupHandlers()` in the `PulsarServer` constructor
    - _Requirements: 1.2, 1.3_
  - [x] 7.2 Add guard checks to the `CallToolRequestSchema` handler in `src/index.ts`
    - After input validation and before calling the tool handler, call `checkToolInput(name, args, addressRegistry)`
    - If `blocked`, throw `PulsarRestrictedAddressError` with the address and tool name
    - Log a warning via `logger.warn` with tool name and restricted address
    - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.2, 5.3_
  - [x] 7.3 Register `manage_restricted_addresses` in the `ListToolsRequestSchema` handler and `CallToolRequestSchema` switch in `src/index.ts`
    - Add tool definition with `action` and optional `address` fields to the tools list
    - Add `case 'manage_restricted_addresses'` to the switch statement
    - _Requirements: 3.1_
  - [ ]* 7.4 Write unit tests for the guard integration in `tests/unit/index.test.ts` or a new `tests/unit/server-guard.test.ts`
    - Test that a tool call with a restricted account_id returns an error response with `RESTRICTED_ADDRESS` code
    - Test that a tool call with a restricted contract_id returns an error response
    - Test that a tool call with no restricted addresses proceeds to the tool handler
    - Mock the tool handlers and registry to isolate the guard logic
    - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.2_

- [ ] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with `{ numRuns: 100 }` minimum
- Atomic file writes (write temp → rename) prevent persistence file corruption

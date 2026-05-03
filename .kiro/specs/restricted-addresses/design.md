# Design Document: Restricted Addresses

## Overview

The restricted addresses feature adds a security guard layer to the Pulsar MCP server. It maintains an in-memory set of blocked Stellar public keys and Soroban contract IDs, loaded from environment variables and optionally a JSON file. Before any tool handler makes a network call, a guard function checks all address-typed fields in the tool input against this set and rejects the request if a match is found. A new `manage_restricted_addresses` MCP tool lets operators (and AI assistants) add, remove, list, and check addresses at runtime.

The design follows the existing Pulsar patterns: Zod validation at the boundary, `PulsarError` subclasses for structured errors, and a thin service layer consumed by tool handlers.

---

## Architecture

```mermaid
flowchart TD
    A[MCP Client / AI Assistant] -->|tool call| B[PulsarServer.CallToolRequestSchema handler]
    B --> C{Guard.check(input)}
    C -->|address restricted| D[Return RESTRICTED_ADDRESS error]
    C -->|address allowed| E[Tool Handler]
    E --> F[Horizon / Soroban RPC / stellar-cli]

    G[Startup] --> H[AddressRegistry.load from env + file]
    H --> I[In-memory Set<string>]

    J[manage_restricted_addresses tool] --> K[AddressRegistry.add / remove / list / has]
    K --> I
    K -->|if RESTRICTED_ADDRESSES_FILE set| L[Persist to JSON file]
```

The three new modules are:

| Module | Path | Responsibility |
|---|---|---|
| `AddressRegistry` | `src/services/address-registry.ts` | In-memory store, load, persist, CRUD |
| `Guard` | `src/services/address-guard.ts` | Extract address fields from tool input, check against registry |
| `manage_restricted_addresses` tool | `src/tools/manage_restricted_addresses.ts` | MCP tool handler for runtime management |

---

## Components and Interfaces

### AddressRegistry

```typescript
// src/services/address-registry.ts

export interface AddressRegistryOptions {
  /** Comma-separated list of addresses from RESTRICTED_ADDRESSES env var */
  envAddresses?: string;
  /** Path to JSON persistence file from RESTRICTED_ADDRESSES_FILE env var */
  filePath?: string;
}

export class AddressRegistry {
  private addresses: Set<string>;
  private filePath: string | undefined;

  constructor(options?: AddressRegistryOptions);

  /** Load addresses from env string and optional file. Called at startup. */
  async load(): Promise<void>;

  /** Add a validated address. Throws PulsarValidationError if malformed. */
  add(address: string): void;

  /** Remove an address. No-op if not present. */
  remove(address: string): void;

  /** Return all restricted addresses as a sorted array. */
  list(): string[];

  /** Return true if the address is restricted. */
  has(address: string): boolean;

  /** Persist current set to file (if filePath configured). */
  private async persist(): Promise<void>;
}
```

A single shared instance is created in `src/services/address-registry.ts` and exported as `addressRegistry`. This singleton is initialized during server startup before the MCP handlers are registered.

### Address Validation

Address validation reuses the existing Zod schemas from `src/schemas/index.ts`:

```typescript
import { StellarPublicKeySchema, ContractIdSchema } from '../schemas/index.js';

function isValidAddress(address: string): boolean {
  return (
    StellarPublicKeySchema.safeParse(address).success ||
    ContractIdSchema.safeParse(address).success
  );
}
```

### Guard

```typescript
// src/services/address-guard.ts

export interface GuardCheckResult {
  blocked: boolean;
  address?: string; // the first restricted address found
}

/**
 * Extracts all address-typed fields from a tool input object
 * and checks each against the AddressRegistry.
 */
export function checkToolInput(
  toolName: string,
  input: Record<string, unknown>,
  registry: AddressRegistry
): GuardCheckResult;
```

The guard knows which fields to check per tool:

| Tool | Checked fields |
|---|---|
| `get_account_balance` | `account_id`, `asset_issuer` |
| `fetch_contract_spec` | `contract_id` |
| `submit_transaction` | _(none — XDR is opaque)_ |
| `simulate_transaction` | _(none — XDR is opaque)_ |
| `manage_restricted_addresses` | _(none — this tool manages the list itself)_ |

### manage_restricted_addresses Tool

```typescript
// src/tools/manage_restricted_addresses.ts

export const ManageRestrictedAddressesInputSchema = z.object({
  action: z.enum(['add', 'remove', 'list', 'check']),
  address: z.string().optional(),
});

export type ManageRestrictedAddressesInput = z.infer<
  typeof ManageRestrictedAddressesInputSchema
>;

export const manageRestrictedAddresses: McpToolHandler<
  typeof ManageRestrictedAddressesInputSchema
> = async (input) => { ... };
```

Response shapes:

```typescript
// add
{ action: 'add', address: string, count: number }

// remove
{ action: 'remove', address: string, removed: boolean, count: number }

// list
{ action: 'list', addresses: string[], count: number }

// check
{ action: 'check', address: string, restricted: boolean }
```

---

## Data Models

### Persistence File Format

```json
["GABC...XYZ", "CABC...XYZ"]
```

A plain JSON array of address strings. Written atomically (write to temp file, rename) to avoid corruption on crash.

### New Error Code

```typescript
// src/errors.ts — extend PulsarErrorCode enum
export enum PulsarErrorCode {
  // ... existing codes ...
  RESTRICTED_ADDRESS = 'RESTRICTED_ADDRESS',
}

export class PulsarRestrictedAddressError extends PulsarError {
  constructor(address: string, toolName: string) {
    super(
      PulsarErrorCode.RESTRICTED_ADDRESS,
      `Address '${address}' is restricted and cannot be used with tool '${toolName}'`,
      { address, tool: toolName }
    );
    this.name = 'PulsarRestrictedAddressError';
  }
}
```

### Config Extension

```typescript
// src/config.ts — add to configSchema
restrictedAddresses: z.string().optional(),       // RESTRICTED_ADDRESSES env var
restrictedAddressesFile: z.string().optional(),   // RESTRICTED_ADDRESSES_FILE env var
```

---

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

Property-based testing (PBT) validates software correctness by testing universal properties across many generated inputs. Each property is a formal specification that should hold for all valid inputs.

The project uses **Vitest** for testing. For property-based testing we will use **[fast-check](https://fast-check.dev/)**, a mature PBT library for TypeScript/JavaScript. Each property test should run a minimum of 100 iterations.

---

Property 1: Add then has
*For any* well-formed Stellar public key or Soroban contract ID, after adding it to the AddressRegistry, `has(address)` must return `true`.
**Validates: Requirements 1.1, 1.6, 1.9**

---

Property 2: Remove then not has
*For any* address that is present in the AddressRegistry, after calling `remove(address)`, `has(address)` must return `false`.
**Validates: Requirements 1.7, 1.9**

---

Property 3: Add/remove round trip
*For any* address, adding it and then removing it must leave the registry in the same state as before the add (i.e., `has(address)` returns `false` and `list()` does not contain it).
**Validates: Requirements 1.6, 1.7**

---

Property 4: Set semantics — no duplicates
*For any* address, adding it N times must result in it appearing exactly once in `list()`.
**Validates: Requirements 1.10**

---

Property 5: Guard blocks restricted addresses
*For any* tool input that contains a restricted address in a checked field, `checkToolInput` must return `{ blocked: true }`.
**Validates: Requirements 2.1, 2.2**

---

Property 6: Guard allows unrestricted addresses
*For any* tool input whose address fields are not in the registry, `checkToolInput` must return `{ blocked: false }`.
**Validates: Requirements 2.5**

---

Property 7: Invalid addresses are rejected
*For any* string that is not a valid Stellar public key or Soroban contract ID (wrong prefix, wrong length, non-base32 chars), calling `registry.add(address)` must throw a `PulsarValidationError`.
**Validates: Requirements 1.4, 1.5**

---

Property 8: Persistence round trip
*For any* set of valid addresses written to the persistence file, loading a new AddressRegistry from that file must produce a registry whose `list()` contains exactly those addresses.
**Validates: Requirements 4.1, 4.2, 4.5**

---

## Error Handling

| Scenario | Error class | Error code | HTTP-equivalent |
|---|---|---|---|
| Restricted address in tool input | `PulsarRestrictedAddressError` | `RESTRICTED_ADDRESS` | 403 |
| Malformed address passed to `add` | `PulsarValidationError` | `VALIDATION_ERROR` | 400 |
| `add`/`remove`/`check` called without `address` | `PulsarValidationError` | `VALIDATION_ERROR` | 400 |
| Persistence file unreadable at startup | Log warning, continue | — | — |
| Persistence file unwritable after mutation | Log error, in-memory op succeeds | — | — |

All errors flow through the existing `handleToolError` method in `PulsarServer`, which formats them into the standard MCP error response shape.

---

## Testing Strategy

### Unit Tests (`tests/unit/`)

- `address-registry.test.ts` — CRUD operations, deduplication, validation rejection, load from env string
- `address-guard.test.ts` — field extraction per tool, blocked/allowed outcomes
- `manage_restricted_addresses.test.ts` — all four actions, validation errors

Unit tests cover specific examples and edge cases:
- Empty registry
- Registry with one address
- Malformed addresses (wrong prefix, wrong length, non-base32)
- `list` action returns sorted array
- `check` on absent address returns `restricted: false`

### Property-Based Tests (`tests/unit/`)

Uses **fast-check** (`npm install --save-dev fast-check`). Each property test runs 100+ iterations.

| Property | Test file | fast-check arbitraries |
|---|---|---|
| P1: Add then has | `address-registry.test.ts` | `fc.constantFrom(...validAddresses)` |
| P2: Remove then not has | `address-registry.test.ts` | same |
| P3: Add/remove round trip | `address-registry.test.ts` | same |
| P4: Set semantics | `address-registry.test.ts` | `fc.array(fc.constantFrom(...validAddresses))` |
| P5: Guard blocks restricted | `address-guard.test.ts` | `fc.constantFrom(...validAddresses)` |
| P6: Guard allows unrestricted | `address-guard.test.ts` | `fc.constantFrom(...validAddresses)` |
| P7: Invalid addresses rejected | `address-registry.test.ts` | `fc.string()` filtered to invalid |
| P8: Persistence round trip | `address-registry.test.ts` | `fc.array(fc.constantFrom(...validAddresses))` |

Tag format for each property test:
`// Feature: restricted-addresses, Property N: <property_text>`

### Integration Tests

Not required for this feature — all behavior is deterministic and fully unit-testable without network access.

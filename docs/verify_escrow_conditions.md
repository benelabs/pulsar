# `verify_escrow_conditions` — Formal Verification Tool

> **Issue #194 — Implement Formal Verification Examples**
>
> High-level formal verification of critical escrow logic for the Stellar / Soroban ecosystem.
> Pure computation — no network calls required.

---

## Overview

`verify_escrow_conditions` checks an escrow contract snapshot against **8 formal properties** derived from Soroban escrow best practices. It returns a structured verification report that an AI agent or developer can act on immediately.

### Verified Properties

| ID  | Name                    | Severity if violated |
|-----|-------------------------|----------------------|
| P1  | Conservation Law        | critical             |
| P2  | State-Machine Validity  | critical             |
| P3  | Access-Control Invariants | critical           |
| P4  | No Double-Spend         | critical             |
| P5  | Arbiter Neutrality      | critical             |
| P6  | Conditions Coherence    | critical             |
| P7  | Timelock Integrity      | warning              |
| P8  | Dispute Window          | warning              |

---

## Input Schema (AI-Ready Tool Spec)

```json
{
  "name": "verify_escrow_conditions",
  "description": "Formally verifies the correctness of a Soroban escrow contract state against 8 critical properties. Pure computation — no network calls. Returns a structured verification report.",
  "inputSchema": {
    "type": "object",
    "required": ["escrow_id", "depositor", "beneficiary", "asset_code", "deposited_amount", "state"],
    "properties": {
      "escrow_id": {
        "type": "string",
        "description": "Unique identifier for the escrow contract instance.",
        "minLength": 1
      },
      "depositor": {
        "type": "string",
        "description": "Stellar public key (G..., 56 chars) of the depositing party.",
        "pattern": "^G[A-Z2-7]{55}$"
      },
      "beneficiary": {
        "type": "string",
        "description": "Stellar public key (G..., 56 chars) of the receiving party.",
        "pattern": "^G[A-Z2-7]{55}$"
      },
      "arbiter": {
        "type": "string",
        "description": "Optional. Stellar public key (G..., 56 chars) of the neutral arbiter who resolves disputes. Must differ from both depositor and beneficiary.",
        "pattern": "^G[A-Z2-7]{55}$"
      },
      "asset_code": {
        "type": "string",
        "description": "Asset code of the escrowed funds (e.g. 'XLM', 'USDC').",
        "minLength": 1,
        "maxLength": 12
      },
      "asset_issuer": {
        "type": "string",
        "description": "Optional. Issuer public key (G...) for non-native assets; omit for XLM.",
        "pattern": "^G[A-Z2-7]{55}$"
      },
      "deposited_amount": {
        "type": "number",
        "description": "Total amount deposited into the escrow (>= 0).",
        "minimum": 0
      },
      "released_amount": {
        "type": "number",
        "description": "Amount already released to the beneficiary. Default: 0.",
        "minimum": 0,
        "default": 0
      },
      "refunded_amount": {
        "type": "number",
        "description": "Amount already refunded to the depositor. Default: 0.",
        "minimum": 0,
        "default": 0
      },
      "state": {
        "type": "string",
        "enum": ["pending", "funded", "released", "refunded", "disputed", "resolved"],
        "description": "Current FSM state of the escrow."
      },
      "prior_state": {
        "type": "string",
        "enum": ["pending", "funded", "released", "refunded", "disputed", "resolved"],
        "description": "Optional. Previous FSM state. When provided, the transition from prior_state → state is validated against the legal Soroban escrow FSM graph."
      },
      "conditions": {
        "type": "array",
        "description": "Release conditions that must all be fulfilled before funds can be released. Default: [].",
        "default": [],
        "items": {
          "type": "object",
          "required": ["kind", "description", "fulfilled"],
          "properties": {
            "kind": {
              "type": "string",
              "enum": ["timelock", "multisig", "oracle", "manual"],
              "description": "Category of release condition."
            },
            "description": {
              "type": "string",
              "description": "Human-readable description of the condition.",
              "minLength": 1
            },
            "fulfilled": {
              "type": "boolean",
              "description": "Whether this condition has been met at the time of verification."
            },
            "required_timestamp": {
              "type": "integer",
              "description": "Optional. Unix timestamp after which a timelock condition is considered fulfilled.",
              "minimum": 1
            }
          }
        }
      },
      "dispute_window_seconds": {
        "type": "integer",
        "description": "Optional. Seconds after funding during which a dispute may be raised. Omit to allow disputes at any time while funded.",
        "minimum": 0
      },
      "funded_timestamp": {
        "type": "integer",
        "description": "Optional. Unix timestamp when the escrow was funded; used with dispute_window_seconds.",
        "minimum": 1
      },
      "current_timestamp": {
        "type": "integer",
        "description": "Optional. Override for 'now' as Unix timestamp. Defaults to wall-clock if omitted.",
        "minimum": 1
      }
    }
  }
}
```

---

## Output Schema

```typescript
interface VerifyEscrowConditionsOutput {
  /** The escrow_id passed as input. */
  escrow_id: string;

  /** true if no critical violations were found; warnings are allowed. */
  verified: boolean;

  /** Number of critical (blocking) violations. */
  critical_count: number;

  /** Number of warning (non-blocking) findings. */
  warning_count: number;

  /** One-sentence human-readable summary. */
  summary: string;

  /** ISO-8601 timestamp of this verification run. */
  verified_at: string;

  /** Computed locked amount: deposited − released − refunded (clamped to ≥ 0). */
  computed_locked_amount: number;

  /** Detailed result for each of the 8 formal properties. */
  findings: VerificationFinding[];
}

interface VerificationFinding {
  /** Formal property identifier: "P1" … "P8". */
  property: string;

  /** Human-readable property name. */
  name: string;

  /** true = property holds; false = violation detected. */
  passed: boolean;

  /** Severity level when passed = false. */
  severity: "critical" | "warning" | "info";

  /** Detailed explanation of the finding. */
  message: string;
}
```

---

## Property Reference

### P1 — Conservation Law
Ensures `deposited_amount == released_amount + refunded_amount + locked`.
A violation implies funds were created or destroyed inside the escrow — a critical invariant breach.

### P2 — State-Machine Validity
The FSM legal transition graph:
```
pending  → funded
funded   → released | refunded | disputed
disputed → resolved
```
Any other transition (e.g. `released → funded`) is illegal and flagged as critical.

### P3 — Access-Control Invariants
Checks that each transition is reachable by the correct actor:
- `funded→disputed`: requires an arbiter to be configured
- `disputed→resolved`: requires an arbiter to be configured

### P4 — No Double-Spend
`released_amount > 0 AND refunded_amount > 0` simultaneously is a double-spend — funds were paid to both parties.

### P5 — Arbiter Neutrality
The arbiter must be a distinct third party (`arbiter ≠ depositor AND arbiter ≠ beneficiary`). A conflicted arbiter voids the dispute-resolution guarantee.

### P6 — Conditions Coherence
All conditions in the `conditions` array must be `fulfilled = true` before the escrow can reach `state = "released"`.

### P7 — Timelock Integrity
For `kind = "timelock"` conditions: `fulfilled` must equal `current_timestamp >= required_timestamp`. A mismatch (e.g. marked fulfilled before the timestamp) raises a warning.

### P8 — Dispute Window
When `dispute_window_seconds` and `funded_timestamp` are provided, a `disputed` state must have been entered within `funded_timestamp + dispute_window_seconds`. Late disputes raise a warning.

---

## Usage Examples

### Minimal — healthy funded escrow

```json
{
  "escrow_id": "escrow-001",
  "depositor":  "GABCDE...",
  "beneficiary": "GBTZKY...",
  "asset_code": "XLM",
  "deposited_amount": 1000,
  "state": "funded"
}
```

### Full lifecycle check — released with conditions

```json
{
  "escrow_id": "escrow-002",
  "depositor":  "GABCDE...",
  "beneficiary": "GBTZKY...",
  "asset_code": "USDC",
  "asset_issuer": "GCZUDC...",
  "deposited_amount": 50000,
  "released_amount": 50000,
  "refunded_amount": 0,
  "state": "released",
  "prior_state": "funded",
  "conditions": [
    {
      "kind": "timelock",
      "description": "6-month vesting cliff",
      "fulfilled": true,
      "required_timestamp": 1700000000
    },
    {
      "kind": "multisig",
      "description": "Board 3-of-5 approval",
      "fulfilled": true
    }
  ],
  "current_timestamp": 1701000000
}
```

### Dispute with arbiter and dispute window

```json
{
  "escrow_id": "escrow-003",
  "depositor":   "GABCDE...",
  "beneficiary": "GBTZKY...",
  "arbiter":     "GCZUDC...",
  "asset_code":  "XLM",
  "deposited_amount": 3000,
  "state": "disputed",
  "prior_state": "funded",
  "funded_timestamp": 1699990000,
  "dispute_window_seconds": 86400,
  "current_timestamp": 1700000000
}
```

---

## Running Tests

```bash
# Unit tests (deterministic, no network)
npm test -- tests/unit/verify_escrow_conditions.test.ts

# Integration tests (realistic e2e scenarios, still no network for this tool)
npm test -- tests/integration/verify_escrow_conditions.test.ts

# Full test suite with coverage
npm run test:coverage
```

---

## Architecture Notes

- **Location**: `src/tools/verify_escrow_conditions.ts`
- **Schema**: `src/schemas/tools.ts` → `VerifyEscrowConditionsInputSchema`
- **Registration**: `src/index.ts` → `verify_escrow_conditions` case
- **Errors**: Uses `PulsarValidationError` from `src/errors.ts`
- **Pattern**: Follows the `McpToolHandler<T>` signature from `src/types.ts`
- **Performance**: O(n) in conditions array; typically < 1 ms for any realistic input

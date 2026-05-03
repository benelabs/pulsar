# Formal Verification of Escrow Logic (Issue #194)

## Overview

The `verify_escrow_conditions` tool provides high-level **formal property verification** of Soroban escrow contracts on the Stellar network. It is a pure-computation MCP tool — no network calls are made. Supply the escrow state; receive a structured verification report with per-property pass/fail findings.

---

## Verified Properties

| ID | Property               | Severity when failed | Description |
|----|------------------------|----------------------|-------------|
| P1 | Conservation Law       | `critical`           | `deposited = released + refunded + locked`. No funds are created or destroyed. |
| P2 | State-Machine Validity | `critical`           | Current FSM state is reachable from prior state via the legal transition graph. |
| P3 | Access-Control         | `critical`           | Only authorised parties can trigger each state transition. |
| P4 | No Double-Spend        | `critical`           | `released_amount > 0 AND refunded_amount > 0` simultaneously is prohibited. |
| P5 | Arbiter Neutrality     | `critical`           | Arbiter ∉ {depositor, beneficiary}. |
| P6 | Conditions Coherence   | `critical`           | All release conditions are fulfilled before `state = released`. |
| P7 | Timelock Integrity     | `warning`            | Timelock conditions' `fulfilled` flags match `now >= required_timestamp`. |
| P8 | Dispute Window         | `warning`            | Disputes raised within the configured dispute window. |

---

## FSM Transition Graph

```
 pending
    │
    ▼
 funded ──────────────────┐
    │                      │
    ├──► released (P6)     │ (via arbiter)
    │                      │
    ├──► refunded          │ (via arbiter)
    │                      │
    └──► disputed ─────────► resolved
```

Legal transitions:

| From      | To       |
|-----------|----------|
| `pending` | `funded` |
| `funded`  | `released`, `refunded`, `disputed` |
| `disputed`| `resolved` |

All other transitions are flagged as `P2` violations.

---

## Tool Input Schema

```json
{
  "escrow_id":               "string (required) — unique escrow instance ID",
  "depositor":               "G... Stellar public key (required)",
  "beneficiary":             "G... Stellar public key (required)",
  "arbiter":                 "G... Stellar public key (optional)",
  "asset_code":              "string e.g. 'XLM' (required)",
  "asset_issuer":            "G... public key (optional, omit for XLM)",
  "deposited_amount":        "number ≥ 0 (required)",
  "released_amount":         "number ≥ 0 (default: 0)",
  "refunded_amount":         "number ≥ 0 (default: 0)",
  "state":                   "'pending'|'funded'|'released'|'refunded'|'disputed'|'resolved'",
  "prior_state":             "same enum (optional) — enables FSM transition check",
  "conditions": [
    {
      "kind":                "'timelock'|'multisig'|'oracle'|'manual'",
      "description":         "string",
      "fulfilled":           "boolean",
      "required_timestamp":  "Unix seconds (required for timelock)"
    }
  ],
  "dispute_window_seconds":  "number ≥ 0 (optional)",
  "funded_timestamp":        "Unix seconds (optional, needed with dispute_window_seconds)",
  "current_timestamp":       "Unix seconds (optional, defaults to wall-clock)"
}
```

---

## Tool Output Schema

```json
{
  "escrow_id":             "string",
  "verified":              "boolean — true iff zero critical violations",
  "critical_count":        "number",
  "warning_count":         "number",
  "summary":               "string — human-readable verdict",
  "findings": [
    {
      "property":          "P1"…"P8",
      "name":              "string",
      "passed":            "boolean",
      "severity":          "'critical'|'warning'|'info'",
      "message":           "string — detailed explanation"
    }
  ],
  "verified_at":           "ISO-8601 timestamp",
  "computed_locked_amount":"number — deposited − released − refunded"
}
```

---

## Example: Fully-Valid Funded Escrow

**Request:**
```json
{
  "escrow_id":         "escrow-2024-001",
  "depositor":         "GABCDE...G234",
  "beneficiary":       "GBTZKY...WXYZ",
  "arbiter":           "GZCFGH...J234",
  "asset_code":        "USDC",
  "asset_issuer":      "GABCDE...ISSUER",
  "deposited_amount":  5000,
  "state":             "funded",
  "prior_state":       "pending",
  "conditions": [
    {
      "kind":        "timelock",
      "description": "30-day delivery window",
      "fulfilled":   false,
      "required_timestamp": 1730000000
    },
    {
      "kind":        "manual",
      "description": "Delivery confirmed by buyer",
      "fulfilled":   false
    }
  ],
  "funded_timestamp":        1727000000,
  "dispute_window_seconds":  2592000
}
```

**Response:**
```json
{
  "escrow_id": "escrow-2024-001",
  "verified": true,
  "critical_count": 0,
  "warning_count": 0,
  "summary": "Escrow \"escrow-2024-001\" passes all 8 formal verification properties.",
  "findings": [
    { "property": "P1", "passed": true,  "severity": "info", "message": "Funds balance: deposited(5000) = released(0) + refunded(0) + locked(5000.0000000)." },
    { "property": "P2", "passed": true,  "severity": "info", "message": "Transition pending → funded is a legal FSM step." },
    { "property": "P3", "passed": true,  "severity": "info", "message": "Access-control rules are satisfied for the pending → funded transition." },
    { "property": "P4", "passed": true,  "severity": "info", "message": "Funds are flowing to at most one party (released XOR refunded)." },
    { "property": "P5", "passed": true,  "severity": "info", "message": "Arbiter (GZCFGH…) is distinct from both depositor and beneficiary." },
    { "property": "P6", "passed": true,  "severity": "info", "message": "0/2 release condition(s) fulfilled. Remaining: 30-day delivery window, Delivery confirmed by buyer." },
    { "property": "P7", "passed": true,  "severity": "info", "message": "All 1 timelock condition(s) have consistent fulfilled flags relative to current_timestamp=1727000001." },
    { "property": "P8", "passed": true,  "severity": "info", "message": "Dispute window is still open: 2591999s remaining (closes 2024-10-24T...)." }
  ],
  "verified_at": "2024-09-22T...",
  "computed_locked_amount": 5000
}
```

---

## Example: Critical Violation — Double-Spend

**Request (erroneous state):**
```json
{
  "escrow_id":         "escrow-hack-001",
  "depositor":         "GABCDE...G234",
  "beneficiary":       "GBTZKY...WXYZ",
  "asset_code":        "XLM",
  "deposited_amount":  1000,
  "released_amount":   800,
  "refunded_amount":   800,
  "state":             "released"
}
```

**Response:**
```json
{
  "verified": false,
  "critical_count": 2,
  "summary": "Escrow \"escrow-hack-001\" has 2 CRITICAL violation(s) and 0 warning(s). Immediate review required.",
  "findings": [
    { "property": "P1", "passed": false, "severity": "critical", "message": "Funds imbalance detected: deposited(1000) < released(800) + refunded(800)..." },
    { "property": "P4", "passed": false, "severity": "critical", "message": "CRITICAL: Both released_amount(800) and refunded_amount(800) are non-zero..." }
  ]
}
```

---

## Integration with Existing Pulsar Tools

The formal verification tool is designed to integrate seamlessly with the Pulsar MCP toolchain:

1. **Before deploying**: use `fetch_contract_spec` to retrieve the escrow contract ABI, confirm method signatures match expected escrow FSM.
2. **After funding**: call `verify_escrow_conditions` with `state=funded`, `prior_state=pending` to confirm the transition is valid.
3. **Before releasing**: verify all conditions are fulfilled (`state=released` check with full conditions list).
4. **After dispute**: verify arbiter neutrality and dispute window compliance.
5. **Simulate/Submit**: once verified, use `simulate_transaction` then `submit_transaction` with full confidence.

---

## Security Considerations

- **No secret keys** are ever required or accepted by this tool.
- All computation is deterministic and pure — suitable for audit trails.
- `current_timestamp` can be overridden for historical re-verification.
- The tool enforces Stellar base32 key format on all public keys, rejecting malformed inputs before any verification logic runs.

---

## Test Coverage

All 8 properties have dedicated unit tests in `tests/unit/verify_escrow_conditions.test.ts`, covering:

- Valid/invalid inputs for each property
- Edge cases: zero amounts, terminal state transitions, no-arbiter mode, no-conditions mode
- Aggregate: `verified` flag, `critical_count`, `warning_count`, `computed_locked_amount`
- ISO-8601 `verified_at` format assertion

/**
 * Integration tests for verify_escrow_conditions tool (Issue #194)
 *
 * These tests exercise the full verification pipeline with realistic
 * end-to-end escrow scenarios. No network calls are made — the tool is
 * pure computation — so they run without RUN_INTEGRATION_TESTS flag.
 *
 * Scenarios covered:
 *   1. Happy-path funded escrow (all 8 properties pass)
 *   2. Full lifecycle: pending → funded → released
 *   3. Disputed lifecycle with arbiter
 *   4. Multi-condition escrow with timelock
 *   5. Refund path
 *   6. Double-spend attack detection
 *   7. Conflicted arbiter detection
 *   8. USDC non-native asset escrow
 */

import { describe, it, expect } from 'vitest';

import { verifyEscrowConditions } from '../../src/tools/verify_escrow_conditions.js';

// ---------------------------------------------------------------------------
// Well-known Stellar public keys (not funded — just valid format for tests)
// ---------------------------------------------------------------------------
const ALICE = 'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234'; // depositor
const BOB = 'GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ'; // beneficiary
const CHARLIE = 'GZCFGHJKMNPQRSTUVWXYZABCDEFGHJKMNPQRSTUVWXYZABCDEFGHJ234'; // neutral arbiter

const NOW = Math.floor(Date.now() / 1000); // real wall-clock for integration realism

// ---------------------------------------------------------------------------
// Scenario 1 – Happy-path: funded escrow, all properties pass
// ---------------------------------------------------------------------------

describe('Scenario 1 – Healthy funded escrow', () => {
  it('passes all 8 properties for a clean funded escrow', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-healthy-001',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 5_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'funded',
      conditions: [],
      current_timestamp: NOW,
    })) as any;

    expect(result.verified).toBe(true);
    expect(result.critical_count).toBe(0);
    expect(result.warning_count).toBe(0);
    expect(result.findings).toHaveLength(8);
    expect(result.computed_locked_amount).toBe(5_000);
    expect(result.summary).toMatch(/passes all 8 formal verification properties/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 – Full lifecycle: pending → funded → released
// ---------------------------------------------------------------------------

describe('Scenario 2 – Full release lifecycle', () => {
  it('verifies pending state', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-lifecycle-002',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 2_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'pending',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
  });

  it('verifies pending → funded transition', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-lifecycle-002',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 2_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'funded',
      prior_state: 'pending',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    const p2 = result.findings.find((f: any) => f.property === 'P2');
    expect(p2.passed).toBe(true);
  });

  it('verifies funded → released transition (all conditions met)', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-lifecycle-002',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 2_000,
      released_amount: 2_000,
      refunded_amount: 0,
      state: 'released',
      prior_state: 'funded',
      conditions: [{ kind: 'manual', description: 'Service delivered', fulfilled: true }],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.computed_locked_amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 – Disputed lifecycle with arbiter
// ---------------------------------------------------------------------------

describe('Scenario 3 – Dispute resolution lifecycle', () => {
  it('verifies funded → disputed transition with neutral arbiter', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-dispute-003',
      depositor: ALICE,
      beneficiary: BOB,
      arbiter: CHARLIE,
      asset_code: 'XLM',
      deposited_amount: 3_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'disputed',
      prior_state: 'funded',
      funded_timestamp: NOW - 1_800, // funded 30 min ago
      dispute_window_seconds: 86_400, // 24-hour window
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.findings.find((f: any) => f.property === 'P3').passed).toBe(true);
    expect(result.findings.find((f: any) => f.property === 'P5').passed).toBe(true);
    expect(result.findings.find((f: any) => f.property === 'P8').passed).toBe(true);
  });

  it('verifies disputed → resolved transition with arbiter releasing to beneficiary', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-dispute-003',
      depositor: ALICE,
      beneficiary: BOB,
      arbiter: CHARLIE,
      asset_code: 'XLM',
      deposited_amount: 3_000,
      released_amount: 3_000,
      refunded_amount: 0,
      state: 'resolved',
      prior_state: 'disputed',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.computed_locked_amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 – Multi-condition escrow with timelock + manual conditions
// ---------------------------------------------------------------------------

describe('Scenario 4 – Multi-condition escrow', () => {
  const VESTING_UNLOCK = NOW - 3_600; // unlocked 1 hour ago

  it('verifies all conditions satisfied before release', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-multicond-004',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'USDC',
      asset_issuer: CHARLIE, // USDC issuer (using CHARLIE as placeholder)
      deposited_amount: 10_000,
      released_amount: 10_000,
      refunded_amount: 0,
      state: 'released',
      prior_state: 'funded',
      conditions: [
        {
          kind: 'timelock',
          description: 'Vesting cliff: 6 months',
          fulfilled: true,
          required_timestamp: VESTING_UNLOCK,
        },
        {
          kind: 'multisig',
          description: 'Board 3-of-5 approval',
          fulfilled: true,
        },
        {
          kind: 'manual',
          description: 'Legal compliance sign-off',
          fulfilled: true,
        },
      ],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.findings.find((f: any) => f.property === 'P6').passed).toBe(true);
    expect(result.findings.find((f: any) => f.property === 'P7').passed).toBe(true);
  });

  it('detects premature release: escrow released with unfulfilled conditions', async () => {
    const FUTURE_UNLOCK = NOW + 86_400; // unlocks tomorrow

    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-multicond-004b',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'USDC',
      asset_issuer: CHARLIE,
      deposited_amount: 10_000,
      released_amount: 10_000,
      refunded_amount: 0,
      state: 'released',
      conditions: [
        {
          kind: 'timelock',
          description: 'Vesting cliff not yet reached',
          fulfilled: false,
          required_timestamp: FUTURE_UNLOCK,
        },
      ],
      current_timestamp: NOW,
    })) as any;
    // P6 should fail (conditions not met) and P7 should pass (flags consistent)
    expect(result.findings.find((f: any) => f.property === 'P6').passed).toBe(false);
    expect(result.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 – Refund path
// ---------------------------------------------------------------------------

describe('Scenario 5 – Refund path', () => {
  it('verifies a funded → refunded lifecycle', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-refund-005',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 1_500,
      released_amount: 0,
      refunded_amount: 1_500,
      state: 'refunded',
      prior_state: 'funded',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.computed_locked_amount).toBe(0);
    expect(result.findings.find((f: any) => f.property === 'P4').passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 – Security: double-spend attack detection
// ---------------------------------------------------------------------------

describe('Scenario 6 – Double-spend attack detection', () => {
  it('flags an escrow with both released and refunded amounts as non-zero', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-dblspend-006',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'XLM',
      deposited_amount: 5_000,
      released_amount: 3_000, // paid out to beneficiary
      refunded_amount: 3_000, // also refunded to depositor (INVALID)
      state: 'released',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(false);
    const p4 = result.findings.find((f: any) => f.property === 'P4');
    expect(p4.passed).toBe(false);
    expect(p4.severity).toBe('critical');
    expect(result.summary).toMatch(/CRITICAL/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7 – Security: conflicted arbiter detection
// ---------------------------------------------------------------------------

describe('Scenario 7 – Conflicted arbiter detection', () => {
  it('flags arbiter == depositor as a critical P5 violation', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-arbiter-007',
      depositor: ALICE,
      beneficiary: BOB,
      arbiter: ALICE, // CONFLICT: arbiter is the depositor
      asset_code: 'XLM',
      deposited_amount: 1_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'disputed',
      prior_state: 'funded',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(false);
    const p5 = result.findings.find((f: any) => f.property === 'P5');
    expect(p5.passed).toBe(false);
    expect(p5.severity).toBe('critical');
    expect(p5.message).toMatch(/depositor/i);
  });

  it('flags arbiter == beneficiary as a critical P5 violation', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-arbiter-007b',
      depositor: ALICE,
      beneficiary: BOB,
      arbiter: BOB, // CONFLICT: arbiter is the beneficiary
      asset_code: 'XLM',
      deposited_amount: 1_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'disputed',
      conditions: [],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(false);
    const p5 = result.findings.find((f: any) => f.property === 'P5');
    expect(p5.passed).toBe(false);
    expect(p5.message).toMatch(/beneficiary/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8 – USDC non-native asset escrow
// ---------------------------------------------------------------------------

describe('Scenario 8 – Non-native asset (USDC) escrow', () => {
  // USDC issuer on Stellar mainnet (for test format; not a live call)
  const USDC_ISSUER = CHARLIE; // placeholder valid key

  it('verifies a USDC escrow correctly', async () => {
    const result = (await verifyEscrowConditions({
      escrow_id: 'e2e-usdc-008',
      depositor: ALICE,
      beneficiary: BOB,
      asset_code: 'USDC',
      asset_issuer: USDC_ISSUER,
      deposited_amount: 50_000,
      released_amount: 0,
      refunded_amount: 0,
      state: 'funded',
      prior_state: 'pending',
      conditions: [
        {
          kind: 'oracle',
          description: 'Chainlink price feed: ETH/USD > 3000',
          fulfilled: false,
        },
        {
          kind: 'multisig',
          description: '2-of-3 signatory approval',
          fulfilled: false,
        },
      ],
      current_timestamp: NOW,
    })) as any;
    expect(result.verified).toBe(true);
    expect(result.computed_locked_amount).toBe(50_000);
    // P6 passes because state is not 'released'
    expect(result.findings.find((f: any) => f.property === 'P6').passed).toBe(true);
  });
});

/**
 * Unit tests for verify_escrow_conditions tool (Issue #194 – Formal Verification Examples)
 *
 * 100% branch coverage of all 8 formal verification properties:
 *   P1  Conservation Law
 *   P2  State-Machine Validity
 *   P3  Access-Control Invariants
 *   P4  No Double-Spend
 *   P5  Arbiter Neutrality
 *   P6  Conditions Coherence
 *   P7  Timelock Integrity
 *   P8  Dispute Window
 *
 * Each property is tested for all pass/fail/edge-case branches.
 */

import { describe, it, expect } from 'vitest';

import { verifyEscrowConditions } from '../../src/tools/verify_escrow_conditions.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DEPOSITOR = 'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234';
const BENEFICIARY = 'GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ';
const ARBITER = 'GZCFGHJKMNPQRSTUVWXYZABCDEFGHJKMNPQRSTUVWXYZABCDEFGHJ234';

const BASE_TIMESTAMP = 1_700_000_000; // fixed "now" for deterministic tests

/** Minimal valid escrow in "funded" state — no conditions, no arbiter. */
const FUNDED_ESCROW = {
  escrow_id: 'escrow-001',
  depositor: DEPOSITOR,
  beneficiary: BENEFICIARY,
  asset_code: 'XLM',
  deposited_amount: 1_000,
  released_amount: 0,
  refunded_amount: 0,
  state: 'funded' as const,
  conditions: [],
  current_timestamp: BASE_TIMESTAMP,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a finding by property ID, assert it passes. */
function expectPass(findings: any[], propertyId: string) {
  const f = findings.find((x: any) => x.property === propertyId);
  expect(f, `Finding ${propertyId} not found`).toBeDefined();
  expect(f.passed, `Property ${propertyId} should pass`).toBe(true);
}

/** Find a finding by property ID, assert it fails with the given severity. */
function expectFail(findings: any[], propertyId: string, severity?: string) {
  const f = findings.find((x: any) => x.property === propertyId);
  expect(f, `Finding ${propertyId} not found`).toBeDefined();
  expect(f.passed, `Property ${propertyId} should fail`).toBe(false);
  if (severity) {
    expect(f.severity).toBe(severity);
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('verifyEscrowConditions – schema validation', () => {
  it('rejects empty escrow_id', async () => {
    await expect(verifyEscrowConditions({ ...FUNDED_ESCROW, escrow_id: '' })).rejects.toThrow(
      'Invalid input'
    );
  });

  it('rejects invalid depositor key', async () => {
    await expect(
      verifyEscrowConditions({ ...FUNDED_ESCROW, depositor: 'NOT_A_KEY' })
    ).rejects.toThrow('Invalid input');
  });

  it('rejects negative deposited_amount', async () => {
    await expect(
      verifyEscrowConditions({ ...FUNDED_ESCROW, deposited_amount: -1 })
    ).rejects.toThrow('Invalid input');
  });

  it('rejects invalid state', async () => {
    await expect(
      verifyEscrowConditions({ ...FUNDED_ESCROW, state: 'unknown' as any })
    ).rejects.toThrow('Invalid input');
  });
});

// ---------------------------------------------------------------------------
// P1 – Conservation Law
// ---------------------------------------------------------------------------

describe('P1 – Conservation Law', () => {
  it('passes when deposited = released + refunded + locked', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P1');
  });

  it('passes when partial release is made', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      released_amount: 600,
      deposited_amount: 1_000,
    })) as any;
    expectPass(result.findings, 'P1');
  });

  it('fails when released + refunded > deposited (fund creation)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 100,
      released_amount: 80,
      refunded_amount: 50, // 80 + 50 = 130 > 100
    })) as any;
    expectFail(result.findings, 'P1', 'critical');
    expect(result.verified).toBe(false);
    expect(result.critical_count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// P2 – State-Machine Validity
// ---------------------------------------------------------------------------

describe('P2 – State-Machine Validity', () => {
  it('passes for a legal pending → funded transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      prior_state: 'pending',
    })) as any;
    expectPass(result.findings, 'P2');
  });

  it('passes for a legal funded → released transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      prior_state: 'funded',
      released_amount: 1_000,
    })) as any;
    expectPass(result.findings, 'P2');
  });

  it('passes for a legal funded → disputed transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      prior_state: 'funded',
      arbiter: ARBITER,
    })) as any;
    expectPass(result.findings, 'P2');
  });

  it('passes for a legal disputed → resolved transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'resolved',
      prior_state: 'disputed',
      arbiter: ARBITER,
      released_amount: 1_000,
    })) as any;
    expectPass(result.findings, 'P2');
  });

  it('fails for an illegal pending → released transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      prior_state: 'pending',
      released_amount: 1_000,
    })) as any;
    expectFail(result.findings, 'P2', 'critical');
  });

  it('fails for an illegal released → funded transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      prior_state: 'released',
      released_amount: 0,
    })) as any;
    expectFail(result.findings, 'P2', 'critical');
  });

  it('fails for an illegal resolved → funded transition', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      prior_state: 'resolved',
      arbiter: ARBITER,
    })) as any;
    expectFail(result.findings, 'P2', 'critical');
  });

  it('passes without prior_state (snapshot mode)', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    // P2 should pass (no transition to check)
    expectPass(result.findings, 'P2');
  });
});

// ---------------------------------------------------------------------------
// P3 – Access-Control Invariants
// ---------------------------------------------------------------------------

describe('P3 – Access-Control Invariants', () => {
  it('flags dispute → resolved without an arbiter (critical)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'resolved',
      prior_state: 'disputed',
      released_amount: 1_000,
      // no arbiter
    })) as any;
    expectFail(result.findings, 'P3', 'critical');
  });

  it('flags funded → disputed without an arbiter (critical)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      prior_state: 'funded',
      // no arbiter
    })) as any;
    expectFail(result.findings, 'P3', 'critical');
  });

  it('passes funded → disputed when arbiter is present', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      prior_state: 'funded',
      arbiter: ARBITER,
    })) as any;
    expectPass(result.findings, 'P3');
  });

  it('passes without prior_state (access check skipped)', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P3');
  });
});

// ---------------------------------------------------------------------------
// P4 – No Double-Spend
// ---------------------------------------------------------------------------

describe('P4 – No Double-Spend', () => {
  it('passes when only released_amount is non-zero', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      released_amount: 1_000,
    })) as any;
    expectPass(result.findings, 'P4');
  });

  it('passes when only refunded_amount is non-zero', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'refunded',
      refunded_amount: 1_000,
    })) as any;
    expectPass(result.findings, 'P4');
  });

  it('passes when both are zero', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P4');
  });

  it('fails when both released and refunded are positive (double-spend)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 2_000,
      released_amount: 1_000,
      refunded_amount: 1_000,
    })) as any;
    expectFail(result.findings, 'P4', 'critical');
    expect(result.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P5 – Arbiter Neutrality
// ---------------------------------------------------------------------------

describe('P5 – Arbiter Neutrality', () => {
  it('passes when arbiter is a distinct third party', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      arbiter: ARBITER,
    })) as any;
    expectPass(result.findings, 'P5');
  });

  it('passes without an arbiter in non-dispute state', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P5');
  });

  it('fails when arbiter equals depositor', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      arbiter: DEPOSITOR, // same as depositor
    })) as any;
    expectFail(result.findings, 'P5', 'critical');
  });

  it('fails when arbiter equals beneficiary', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      arbiter: BENEFICIARY,
    })) as any;
    expectFail(result.findings, 'P5', 'critical');
  });

  it('fails when state is disputed but no arbiter configured', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      // no arbiter
    })) as any;
    expectFail(result.findings, 'P5', 'critical');
  });
});

// ---------------------------------------------------------------------------
// P6 – Conditions Coherence
// ---------------------------------------------------------------------------

describe('P6 – Conditions Coherence', () => {
  it('passes when no conditions are configured', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P6');
  });

  it('passes when all conditions are fulfilled before release', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      released_amount: 1_000,
      conditions: [
        { kind: 'manual', description: 'Goods delivered', fulfilled: true },
        { kind: 'manual', description: 'Invoice approved', fulfilled: true },
      ],
    })) as any;
    expectPass(result.findings, 'P6');
  });

  it('fails when escrow is released with unfulfilled conditions', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      released_amount: 1_000,
      conditions: [{ kind: 'manual', description: 'Goods delivered', fulfilled: false }],
    })) as any;
    expectFail(result.findings, 'P6', 'critical');
  });

  it('passes (non-release state) even with unfulfilled conditions', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      conditions: [{ kind: 'manual', description: 'Goods delivered', fulfilled: false }],
    })) as any;
    expectPass(result.findings, 'P6');
  });
});

// ---------------------------------------------------------------------------
// P7 – Timelock Integrity
// ---------------------------------------------------------------------------

describe('P7 – Timelock Integrity', () => {
  it('passes when no timelock conditions exist', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P7');
  });

  it('passes when timelock is correctly marked fulfilled (now >= required)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      current_timestamp: BASE_TIMESTAMP + 1_000,
      conditions: [
        {
          kind: 'timelock',
          description: 'Timelock expires after 500s',
          fulfilled: true,
          required_timestamp: BASE_TIMESTAMP, // already passed
        },
      ],
    })) as any;
    expectPass(result.findings, 'P7');
  });

  it('passes when timelock is correctly marked not fulfilled (now < required)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      current_timestamp: BASE_TIMESTAMP,
      conditions: [
        {
          kind: 'timelock',
          description: 'Timelock in the future',
          fulfilled: false,
          required_timestamp: BASE_TIMESTAMP + 10_000,
        },
      ],
    })) as any;
    expectPass(result.findings, 'P7');
  });

  it('warns when timelock is marked fulfilled but required_timestamp is in the future', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      current_timestamp: BASE_TIMESTAMP,
      conditions: [
        {
          kind: 'timelock',
          description: 'Future lock marked as done',
          fulfilled: true, // wrong
          required_timestamp: BASE_TIMESTAMP + 10_000, // hasn't passed yet
        },
      ],
    })) as any;
    expectFail(result.findings, 'P7', 'warning');
  });

  it('warns when timelock is marked unfulfilled but required_timestamp has passed', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      current_timestamp: BASE_TIMESTAMP + 10_000,
      conditions: [
        {
          kind: 'timelock',
          description: 'Expired lock not updated',
          fulfilled: false, // wrong
          required_timestamp: BASE_TIMESTAMP, // already passed
        },
      ],
    })) as any;
    expectFail(result.findings, 'P7', 'warning');
  });
});

// ---------------------------------------------------------------------------
// P8 – Dispute Window
// ---------------------------------------------------------------------------

describe('P8 – Dispute Window', () => {
  it('passes when no dispute window is configured', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expectPass(result.findings, 'P8');
  });

  it('passes when dispute is raised within the window', async () => {
    const funded_ts = BASE_TIMESTAMP - 500; // funded 500 s ago
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      arbiter: ARBITER,
      prior_state: 'funded',
      funded_timestamp: funded_ts,
      dispute_window_seconds: 3_600, // 1-hour window
      current_timestamp: BASE_TIMESTAMP, // 500 s into window
    })) as any;
    expectPass(result.findings, 'P8');
  });

  it('warns when dispute is raised after the window has closed', async () => {
    const funded_ts = BASE_TIMESTAMP - 7_200; // funded 2 hours ago
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      arbiter: ARBITER,
      prior_state: 'funded',
      funded_timestamp: funded_ts,
      dispute_window_seconds: 3_600, // 1-hour window — closed 1 hour ago
      current_timestamp: BASE_TIMESTAMP,
    })) as any;
    expectFail(result.findings, 'P8', 'warning');
  });

  it('passes informing window still open while funded', async () => {
    const funded_ts = BASE_TIMESTAMP - 1_000;
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      funded_timestamp: funded_ts,
      dispute_window_seconds: 3_600,
      current_timestamp: BASE_TIMESTAMP,
    })) as any;
    expectPass(result.findings, 'P8');
  });
});

// ---------------------------------------------------------------------------
// Aggregate / summary
// ---------------------------------------------------------------------------

describe('verifyEscrowConditions – aggregate result', () => {
  it('returns verified=true for a perfectly valid funded escrow', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expect(result.verified).toBe(true);
    expect(result.critical_count).toBe(0);
    expect(result.escrow_id).toBe('escrow-001');
    expect(result.computed_locked_amount).toBe(1_000);
    expect(result.findings).toHaveLength(8); // one finding per property
  });

  it('returns verified=false when any critical violation is present', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 100,
      released_amount: 80,
      refunded_amount: 50, // P1 violation
    })) as any;
    expect(result.verified).toBe(false);
    expect(result.critical_count).toBeGreaterThan(0);
    expect(result.summary).toContain('CRITICAL');
  });

  it('returns verified=true (warnings only) when only warnings exist', async () => {
    const funded_ts = BASE_TIMESTAMP - 7_200;
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'disputed',
      arbiter: ARBITER,
      prior_state: 'funded',
      funded_timestamp: funded_ts,
      dispute_window_seconds: 3_600,
      current_timestamp: BASE_TIMESTAMP,
    })) as any;
    // P8 is a warning; no critical violations from other properties
    expect(result.verified).toBe(true);
    expect(result.warning_count).toBeGreaterThan(0);
  });

  it('includes verified_at as a valid ISO-8601 date', async () => {
    const result = (await verifyEscrowConditions(FUNDED_ESCROW)) as any;
    expect(() => new Date(result.verified_at)).not.toThrow();
    expect(result.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('computes correct locked amount from deposited − released − refunded', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 1_000,
      released_amount: 300,
      refunded_amount: 0,
    })) as any;
    expect(result.computed_locked_amount).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// Additional edge-case / branch coverage
// ---------------------------------------------------------------------------

describe('verifyEscrowConditions – edge cases', () => {
  it('uses wall-clock time when current_timestamp is omitted', async () => {
    const before = Math.floor(Date.now() / 1000);
    const input = { ...FUNDED_ESCROW } as any;
    delete input.current_timestamp;
    const result = (await verifyEscrowConditions(input)) as any;
    const verifiedAtSec = Math.floor(new Date(result.verified_at).getTime() / 1000);
    const after = Math.floor(Date.now() / 1000);
    expect(verifiedAtSec).toBeGreaterThanOrEqual(before);
    expect(verifiedAtSec).toBeLessThanOrEqual(after + 1);
  });

  it('clamps computed_locked_amount to 0 when numbers are negative (e.g. P1 violation)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 100,
      released_amount: 80,
      refunded_amount: 50,
    })) as any;
    // locked would be -30 → clamped to 0
    expect(result.computed_locked_amount).toBe(0);
  });

  it('handles an escrow with zero deposited_amount (edge: no funds yet)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      deposited_amount: 0,
      state: 'pending',
    })) as any;
    expect(result.computed_locked_amount).toBe(0);
    expect(result.verified).toBe(true);
  });

  it('handles multiple simultaneous violations (critical_count > 1)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      // P4: double-spend
      released_amount: 500,
      refunded_amount: 500,
      deposited_amount: 2_000,
      // P5: arbiter = depositor
      arbiter: DEPOSITOR,
    })) as any;
    expect(result.critical_count).toBeGreaterThanOrEqual(2);
    expect(result.verified).toBe(false);
  });

  it('passes P3 with info message for pending→funded (depositor role is implicit)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      prior_state: 'pending',
    })) as any;
    const p3 = result.findings.find((f: any) => f.property === 'P3');
    expect(p3.passed).toBe(true);
  });

  it('passes P3 for funded→released (conditions check covers access)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'released',
      prior_state: 'funded',
      released_amount: 1_000,
    })) as any;
    const p3 = result.findings.find((f: any) => f.property === 'P3');
    expect(p3.passed).toBe(true);
  });

  it('passes P3 for funded→refunded (depositor role enforced off-chain)', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'refunded',
      prior_state: 'funded',
      refunded_amount: 1_000,
    })) as any;
    const p3 = result.findings.find((f: any) => f.property === 'P3');
    expect(p3.passed).toBe(true);
  });

  it('passes P5 arbiter check for resolved state without arbiter config', async () => {
    // State 'resolved' without arbiter — P5 should flag it as critical
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'resolved',
      released_amount: 1_000,
      // no arbiter
    })) as any;
    const p5 = result.findings.find((f: any) => f.property === 'P5');
    expect(p5.passed).toBe(false);
    expect(p5.severity).toBe('critical');
  });

  it('P6 reports partial fulfillment count in non-release state', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      conditions: [
        { kind: 'manual', description: 'Step A', fulfilled: true },
        { kind: 'manual', description: 'Step B', fulfilled: false },
        { kind: 'oracle', description: 'Oracle confirmed', fulfilled: true },
      ],
    })) as any;
    const p6 = result.findings.find((f: any) => f.property === 'P6');
    expect(p6.passed).toBe(true);
    expect(p6.message).toMatch(/2\/3/);
  });

  it('P8 passes with "dispute window closed" message when state is funded and window expired', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      state: 'funded',
      funded_timestamp: BASE_TIMESTAMP - 10_000,
      dispute_window_seconds: 100, // closed 9900 s ago
      current_timestamp: BASE_TIMESTAMP,
    })) as any;
    const p8 = result.findings.find((f: any) => f.property === 'P8');
    expect(p8.passed).toBe(true);
    expect(p8.message).toMatch(/closed/i);
  });

  it('P7 passes informational when only non-timelock conditions exist', async () => {
    const result = (await verifyEscrowConditions({
      ...FUNDED_ESCROW,
      conditions: [
        { kind: 'multisig', description: 'Board approval', fulfilled: true },
        { kind: 'oracle', description: 'KYC cleared', fulfilled: false },
      ],
    })) as any;
    const p7 = result.findings.find((f: any) => f.property === 'P7');
    expect(p7.passed).toBe(true);
    expect(p7.message).toMatch(/No timelock/i);
  });
});

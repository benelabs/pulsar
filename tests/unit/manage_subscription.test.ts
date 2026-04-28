/**
 * Unit tests for manage_subscription tool (Issue #175)
 *
 * Covers:
 *  - pending status (before start)
 *  - active status (within a paid period)
 *  - overdue status (grace elapsed, uncollected)
 *  - cancelled status
 *  - expired status (fixed-term complete)
 *  - payment schedule correctness
 *  - partial collection by merchant
 *  - indefinite vs fixed-term subscriptions
 *  - grace period boundary conditions
 *  - input validation errors
 *  - asset label formatting (native XLM and issued assets)
 *  - subscriber === merchant guard
 *  - cancelled_timestamp before start_timestamp guard
 */

import { describe, it, expect } from 'vitest';

import { manageSubscription } from '../../src/tools/manage_subscription.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const SUBSCRIBER = 'GABC1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';
const MERCHANT = 'GDEF1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';
const ISSUER = 'GHIJ1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';

// Fixed epoch to make all tests deterministic
const BASE_TIME = 1_700_000_000; // 2023-11-14 22:13:20 UTC
const MONTHLY = 2_592_000; // 30 days in seconds
const DAILY = 86_400; // 1 day in seconds

/** Convenience builder — only overrides what the test needs. */
function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    subscriber: SUBSCRIBER,
    merchant: MERCHANT,
    amount_per_period: 100,
    asset_code: 'USDC',
    asset_issuer: ISSUER,
    period_seconds: MONTHLY,
    start_timestamp: BASE_TIME,
    payments_collected: 0,
    grace_period_seconds: 0,
    ...overrides,
  };
}

// ── Status: pending ──────────────────────────────────────────────────────────

describe('status: pending', () => {
  it('returns pending when current time is before start', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME - 1 })
    )) as any;

    expect(result.status).toBe('pending');
    expect(result.payments_collected).toBe(0);
    expect(result.payments_outstanding).toBe(0);
    expect(result.schedule).toHaveLength(0);
    expect(result.next_payment_due).toBe(new Date(BASE_TIME * 1000).toISOString());
  });

  it('returns pending with correct end_date for fixed-term subscription', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME - 1, total_periods: 3 })
    )) as any;

    expect(result.status).toBe('pending');
    expect(result.end_date).toBe(new Date((BASE_TIME + 3 * MONTHLY) * 1000).toISOString());
  });

  it('returns null end_date for indefinite subscription when pending', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME - 100 })
    )) as any;

    expect(result.end_date).toBeNull();
  });
});

// ── Status: active ───────────────────────────────────────────────────────────

describe('status: active', () => {
  it('is active just after start with no periods elapsed', async () => {
    // 1 second into the first period — period 1 is due but within grace (grace=0 so it should be overdue only after grace elapses)
    // At exactly start_timestamp + 0 seconds: periodsElapsed = 0, so no periods in schedule yet
    const result = (await manageSubscription(makeInput({ current_timestamp: BASE_TIME }))) as any;

    // elapsed = 0 → periodsElapsed = 0 → no schedule entries
    expect(result.status).toBe('active');
    expect(result.schedule).toHaveLength(0);
    expect(result.payments_outstanding).toBe(0);
  });

  it('is active when all due periods have been collected', async () => {
    // 2 full periods elapsed, both collected
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 2 * MONTHLY + 1,
        payments_collected: 2,
      })
    )) as any;

    expect(result.status).toBe('active');
    expect(result.payments_outstanding).toBe(0);
    expect(result.schedule).toHaveLength(2);
    expect(result.schedule.every((p: any) => p.collected)).toBe(true);
  });

  it('next_payment_due points to the first uncollected period', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 3 * MONTHLY + 1,
        payments_collected: 2,
      })
    )) as any;

    // 3 periods elapsed; 2 collected → period 3 is outstanding
    const expectedDue = new Date((BASE_TIME + 2 * MONTHLY) * 1000).toISOString();
    expect(result.next_payment_due).toBe(expectedDue);
  });

  it('last_payment_date reflects the most recently collected period', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 3 * MONTHLY + 1,
        payments_collected: 2,
      })
    )) as any;

    // Period 2 due date = BASE_TIME + 1 * MONTHLY
    const expected = new Date((BASE_TIME + 1 * MONTHLY) * 1000).toISOString();
    expect(result.last_payment_date).toBe(expected);
  });

  it('last_payment_date is null when nothing collected', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + MONTHLY + 1 })
    )) as any;

    expect(result.last_payment_date).toBeNull();
  });
});

// ── Status: overdue ──────────────────────────────────────────────────────────

describe('status: overdue', () => {
  it('is overdue when a period is uncollected and grace has elapsed', async () => {
    // 1 period elapsed, grace=0 → immediately overdue
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + 1,
        payments_collected: 0,
        grace_period_seconds: 0,
      })
    )) as any;

    expect(result.status).toBe('overdue');
    expect(result.payments_outstanding).toBe(1);
    expect(result.schedule[0].overdue).toBe(true);
  });

  it('is active (not overdue) while still within grace window', async () => {
    const GRACE = 3600; // 1 hour grace
    // 1 period elapsed but only 30 minutes into grace
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + 1800, // 30 min after due
        payments_collected: 0,
        grace_period_seconds: GRACE,
      })
    )) as any;

    // Still within grace — should be active, not overdue
    expect(result.status).toBe('active');
    expect(result.schedule[0].overdue).toBe(false);
  });

  it('is overdue immediately after grace expires', async () => {
    const GRACE = 3600;
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + GRACE + 1, // 1 s past grace
        payments_collected: 0,
        grace_period_seconds: GRACE,
      })
    )) as any;

    expect(result.status).toBe('overdue');
    expect(result.schedule[0].overdue).toBe(true);
  });

  it('grace_period_ends is set to the overdue period grace end', async () => {
    const GRACE = DAILY;
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + DAILY + 1,
        payments_collected: 0,
        grace_period_seconds: GRACE,
      })
    )) as any;

    const expected = new Date((BASE_TIME + GRACE) * 1000).toISOString();
    expect(result.grace_period_ends).toBe(expected);
  });

  it('grace_period_ends is null when nothing is overdue', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + 1,
        payments_collected: 1,
      })
    )) as any;

    expect(result.grace_period_ends).toBeNull();
  });
});

// ── Status: cancelled ────────────────────────────────────────────────────────

describe('status: cancelled', () => {
  it('is cancelled when cancelled_timestamp is in the past', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 2 * MONTHLY,
        cancelled_timestamp: BASE_TIME + MONTHLY,
      })
    )) as any;

    expect(result.status).toBe('cancelled');
    expect(result.cancelled_date).toBe(new Date((BASE_TIME + MONTHLY) * 1000).toISOString());
  });

  it('stops generating schedule entries after cancellation', async () => {
    // Cancelled after period 1 ends; 3 periods would have elapsed otherwise
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 3 * MONTHLY + 1,
        cancelled_timestamp: BASE_TIME + MONTHLY + 1,
        payments_collected: 0,
      })
    )) as any;

    // Only 1 period should appear in schedule (the one covering the cancellation time)
    expect(result.schedule.length).toBeLessThanOrEqual(2);
    expect(result.status).toBe('cancelled');
  });

  it('is not cancelled when cancelled_timestamp is in the future', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY,
        cancelled_timestamp: BASE_TIME + 3 * MONTHLY, // future
        payments_collected: 1,
      })
    )) as any;

    expect(result.status).toBe('active');
  });
});

// ── Status: expired ──────────────────────────────────────────────────────────

describe('status: expired', () => {
  it('is expired when all fixed-term periods have elapsed', async () => {
    const result = (await manageSubscription(
      makeInput({
        total_periods: 3,
        current_timestamp: BASE_TIME + 3 * MONTHLY + 1,
        payments_collected: 3,
      })
    )) as any;

    expect(result.status).toBe('expired');
    expect(result.end_date).toBe(new Date((BASE_TIME + 3 * MONTHLY) * 1000).toISOString());
  });

  it('is active just before a fixed-term subscription expires', async () => {
    const result = (await manageSubscription(
      makeInput({
        total_periods: 3,
        current_timestamp: BASE_TIME + 3 * MONTHLY - 1,
        payments_collected: 2,
      })
    )) as any;

    expect(result.status).not.toBe('expired');
  });

  it('schedule does not exceed total_periods', async () => {
    const result = (await manageSubscription(
      makeInput({
        total_periods: 2,
        current_timestamp: BASE_TIME + 10 * MONTHLY,
        payments_collected: 2,
      })
    )) as any;

    expect(result.schedule).toHaveLength(2);
  });
});

// ── Payment totals ───────────────────────────────────────────────────────────

describe('payment totals', () => {
  it('correctly computes total_collected_amount', async () => {
    const result = (await manageSubscription(
      makeInput({
        amount_per_period: 50,
        current_timestamp: BASE_TIME + 5 * MONTHLY + 1,
        payments_collected: 3,
      })
    )) as any;

    expect(result.total_collected_amount).toBe('150.0000000');
    expect(result.payments_collected).toBe(3);
  });

  it('correctly computes total_outstanding_amount', async () => {
    const result = (await manageSubscription(
      makeInput({
        amount_per_period: 25,
        current_timestamp: BASE_TIME + 4 * MONTHLY + 1,
        payments_collected: 1,
      })
    )) as any;

    // 4 periods elapsed; 1 collected → 3 outstanding
    expect(result.payments_outstanding).toBe(3);
    expect(result.total_outstanding_amount).toBe('75.0000000');
  });

  it('payments_collected is capped to collectible periods', async () => {
    // Only 2 periods elapsed but payments_collected says 5
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 2 * MONTHLY + 1,
        payments_collected: 5,
      })
    )) as any;

    expect(result.payments_collected).toBe(2);
    expect(result.payments_outstanding).toBe(0);
  });
});

// ── Schedule correctness ─────────────────────────────────────────────────────

describe('schedule correctness', () => {
  it('schedule has correct period count', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + 3 * MONTHLY + 1 })
    )) as any;

    expect(result.schedule).toHaveLength(3);
  });

  it('schedule periods are 1-indexed', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + 2 * MONTHLY + 1 })
    )) as any;

    expect(result.schedule[0].period).toBe(1);
    expect(result.schedule[1].period).toBe(2);
  });

  it('schedule due_date increments correctly', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + 3 * MONTHLY + 1 })
    )) as any;

    expect(result.schedule[0].due_date).toBe(new Date(BASE_TIME * 1000).toISOString());
    expect(result.schedule[1].due_date).toBe(new Date((BASE_TIME + MONTHLY) * 1000).toISOString());
    expect(result.schedule[2].due_date).toBe(
      new Date((BASE_TIME + 2 * MONTHLY) * 1000).toISOString()
    );
  });

  it('schedule grace_ends equals due_date + grace_period_seconds', async () => {
    const GRACE = 7200;
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + 1,
        grace_period_seconds: GRACE,
      })
    )) as any;

    const period = result.schedule[0];
    const dueDateTs = new Date(period.due_date).getTime() / 1000;
    const graceEndsTs = new Date(period.grace_ends).getTime() / 1000;
    expect(graceEndsTs - dueDateTs).toBe(GRACE);
  });

  it('collected flag is true only for periods within payments_collected', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + 3 * MONTHLY + 1,
        payments_collected: 2,
      })
    )) as any;

    expect(result.schedule[0].collected).toBe(true);
    expect(result.schedule[1].collected).toBe(true);
    expect(result.schedule[2].collected).toBe(false);
  });
});

// ── Asset label ──────────────────────────────────────────────────────────────

describe('asset label', () => {
  it('formats issued asset as CODE:ISSUER', async () => {
    const result = (await manageSubscription(
      makeInput({ asset_code: 'USDC', asset_issuer: ISSUER, current_timestamp: BASE_TIME })
    )) as any;

    expect(result.asset).toBe(`USDC:${ISSUER}`);
  });

  it('formats native asset as just the code when no issuer', async () => {
    const input = makeInput({ current_timestamp: BASE_TIME });
    delete (input as any).asset_issuer;
    const result = (await manageSubscription({ ...input, asset_code: 'XLM' })) as any;

    expect(result.asset).toBe('XLM');
  });
});

// ── Validation errors ────────────────────────────────────────────────────────

describe('validation errors', () => {
  it('throws when subscriber and merchant are identical', async () => {
    await expect(manageSubscription(makeInput({ merchant: SUBSCRIBER }))).rejects.toThrow(
      'subscriber and merchant must be different'
    );
  });

  it('throws when cancelled_timestamp is before start_timestamp', async () => {
    await expect(
      manageSubscription(makeInput({ cancelled_timestamp: BASE_TIME - 1 }))
    ).rejects.toThrow('cancelled_timestamp must be after start_timestamp');
  });

  it('throws on invalid subscriber key format', async () => {
    await expect(manageSubscription(makeInput({ subscriber: 'INVALID_KEY' }))).rejects.toThrow();
  });

  it('throws on negative amount_per_period', async () => {
    await expect(manageSubscription(makeInput({ amount_per_period: -1 }))).rejects.toThrow();
  });

  it('throws on zero period_seconds', async () => {
    await expect(manageSubscription(makeInput({ period_seconds: 0 }))).rejects.toThrow();
  });

  it('throws on empty asset_code', async () => {
    await expect(manageSubscription(makeInput({ asset_code: '' }))).rejects.toThrow();
  });

  it('throws on asset_code longer than 12 characters', async () => {
    await expect(
      manageSubscription(makeInput({ asset_code: 'TOOLONGASSETCODE' }))
    ).rejects.toThrow();
  });

  it('throws on negative payments_collected', async () => {
    await expect(manageSubscription(makeInput({ payments_collected: -1 }))).rejects.toThrow();
  });
});

// ── Indefinite subscription ──────────────────────────────────────────────────

describe('indefinite subscription', () => {
  it('end_date is null for indefinite subscriptions', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + MONTHLY + 1 })
    )) as any;

    expect(result.end_date).toBeNull();
  });

  it('schedule keeps growing beyond any total_periods', async () => {
    const result = (await manageSubscription(
      makeInput({ current_timestamp: BASE_TIME + 12 * MONTHLY + 1, payments_collected: 12 })
    )) as any;

    expect(result.schedule.length).toBeGreaterThanOrEqual(12);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles daily billing correctly', async () => {
    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 10,
      asset_code: 'XLM',
      period_seconds: DAILY,
      start_timestamp: BASE_TIME,
      payments_collected: 0,
      grace_period_seconds: 0,
      current_timestamp: BASE_TIME + 7 * DAILY + 1,
    })) as any;

    expect(result.schedule).toHaveLength(7);
    expect(result.payments_outstanding).toBe(7);
  });

  it('handles exact boundary — one second before period ends', async () => {
    // Exactly at the start of the second period but not into it
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY - 1,
        payments_collected: 0,
      })
    )) as any;

    // 0 full periods elapsed → empty schedule
    expect(result.schedule).toHaveLength(0);
  });

  it('returns correct output types', async () => {
    const result = (await manageSubscription(
      makeInput({
        current_timestamp: BASE_TIME + MONTHLY + 1,
        payments_collected: 1,
      })
    )) as any;

    expect(typeof result.status).toBe('string');
    expect(typeof result.amount_per_period).toBe('string');
    expect(typeof result.period_seconds).toBe('number');
    expect(Array.isArray(result.schedule)).toBe(true);
    expect(typeof result.payments_collected).toBe('number');
    expect(typeof result.payments_outstanding).toBe('number');
  });
});

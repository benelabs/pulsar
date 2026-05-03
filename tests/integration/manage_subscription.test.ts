/**
 * Integration tests for manage_subscription tool (Issue #175)
 *
 * These tests exercise the full computation pipeline with wall-clock
 * timestamps (no deterministic fixture epoch).  No network calls are
 * required — manage_subscription is a pure-computation tool.
 *
 * Scenarios:
 *  - Active monthly SaaS subscription started 3 months ago, 2 collected
 *  - Overdue subscription with no collections and no grace period
 *  - Cancelled subscription — schedule stops at cancellation
 *  - Expired fixed-term subscription (12-month, 12 collected)
 *  - Indefinite subscription that's pending (starts in the future)
 *  - Weekly billing with partial collection
 */

import { describe, it, expect } from 'vitest';

import { manageSubscription } from '../../src/tools/manage_subscription.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SUBSCRIBER = 'GABC1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';
const MERCHANT = 'GDEF1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';
const ISSUER = 'GHIJ1234ABCD5678ABCD1234ABCD5678ABCD1234ABCD5678ABCD5678ABCD';

const now = Math.floor(Date.now() / 1000);
const MONTHLY = 2_592_000; // 30 days
const WEEKLY = 604_800; // 7 days

describe('manage_subscription (Integration)', () => {
  // ── Active monthly SaaS subscription ──────────────────────────────────────
  it('active monthly subscription with 2 of 3 periods collected', async () => {
    const start = now - 3 * MONTHLY - 1; // 3 full periods elapsed

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 29.99,
      asset_code: 'USDC',
      asset_issuer: ISSUER,
      period_seconds: MONTHLY,
      start_timestamp: start,
      payments_collected: 2,
      grace_period_seconds: 86_400, // 1-day grace
    })) as any;

    expect(result.status).toBe('active'); // period 3 within grace
    expect(result.payments_collected).toBe(2);
    expect(result.payments_outstanding).toBe(1);
    expect(parseFloat(result.total_collected_amount)).toBeCloseTo(2 * 29.99, 5);
    expect(parseFloat(result.total_outstanding_amount)).toBeCloseTo(1 * 29.99, 5);
    expect(result.schedule).toHaveLength(3);
    expect(result.schedule[0].collected).toBe(true);
    expect(result.schedule[1].collected).toBe(true);
    expect(result.schedule[2].collected).toBe(false);
    expect(result.asset).toBe(`USDC:${ISSUER}`);
    expect(result.end_date).toBeNull();
  });

  // ── Overdue — no grace, no collections ───────────────────────────────────
  it('marks subscription as overdue when payment is due with zero grace', async () => {
    const start = now - 2 * MONTHLY - 1; // 2 periods elapsed

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 9.99,
      asset_code: 'XLM',
      period_seconds: MONTHLY,
      start_timestamp: start,
      payments_collected: 0,
      grace_period_seconds: 0,
    })) as any;

    expect(result.status).toBe('overdue');
    expect(result.payments_outstanding).toBe(2);
    expect(result.schedule.every((p: any) => p.overdue)).toBe(true);
    expect(result.grace_period_ends).not.toBeNull();
  });

  // ── Cancelled subscription ────────────────────────────────────────────────
  it('returns cancelled status and truncated schedule after cancellation', async () => {
    const start = now - 4 * MONTHLY - 1;
    const cancelledAt = now - 2 * MONTHLY; // cancelled 2 months ago

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 49,
      asset_code: 'USDC',
      asset_issuer: ISSUER,
      period_seconds: MONTHLY,
      start_timestamp: start,
      cancelled_timestamp: cancelledAt,
      payments_collected: 1,
      grace_period_seconds: 0,
    })) as any;

    expect(result.status).toBe('cancelled');
    expect(result.cancelled_date).toBe(new Date(cancelledAt * 1000).toISOString());
    // Schedule should not extend beyond the cancellation window
    expect(result.schedule.length).toBeLessThan(4);
  });

  // ── Expired fixed-term subscription ──────────────────────────────────────
  it('expires a 12-month fixed-term subscription after full term', async () => {
    const start = now - 13 * MONTHLY; // 13 months ago

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 19.99,
      asset_code: 'USDC',
      asset_issuer: ISSUER,
      period_seconds: MONTHLY,
      start_timestamp: start,
      total_periods: 12,
      payments_collected: 12,
      grace_period_seconds: 0,
    })) as any;

    expect(result.status).toBe('expired');
    expect(result.schedule).toHaveLength(12);
    expect(result.payments_outstanding).toBe(0);
    expect(result.end_date).toBe(new Date((start + 12 * MONTHLY) * 1000).toISOString());
  });

  // ── Pending — starts in the future ───────────────────────────────────────
  it('returns pending for a subscription that has not yet started', async () => {
    const start = now + MONTHLY; // starts next month

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 5,
      asset_code: 'XLM',
      period_seconds: MONTHLY,
      start_timestamp: start,
      payments_collected: 0,
      grace_period_seconds: 0,
    })) as any;

    expect(result.status).toBe('pending');
    expect(result.schedule).toHaveLength(0);
    expect(result.payments_outstanding).toBe(0);
    expect(result.next_payment_due).toBe(new Date(start * 1000).toISOString());
  });

  // ── Weekly billing ────────────────────────────────────────────────────────
  it('computes correct weekly billing with partial collection', async () => {
    const start = now - 5 * WEEKLY - 1; // 5 full weeks elapsed

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 7,
      asset_code: 'XLM',
      period_seconds: WEEKLY,
      start_timestamp: start,
      payments_collected: 3,
      grace_period_seconds: 3_600, // 1-hour grace
    })) as any;

    expect(result.schedule).toHaveLength(5);
    expect(result.payments_collected).toBe(3);
    expect(result.payments_outstanding).toBe(2);
    expect(parseFloat(result.total_collected_amount)).toBeCloseTo(3 * 7, 5);
    expect(parseFloat(result.total_outstanding_amount)).toBeCloseTo(2 * 7, 5);
  });

  // ── Output shape invariants ───────────────────────────────────────────────
  it('always includes all required output fields', async () => {
    const start = now - MONTHLY - 1;

    const result = (await manageSubscription({
      subscriber: SUBSCRIBER,
      merchant: MERCHANT,
      amount_per_period: 1,
      asset_code: 'XLM',
      period_seconds: MONTHLY,
      start_timestamp: start,
      payments_collected: 0,
      grace_period_seconds: 0,
    })) as any;

    const requiredFields = [
      'status',
      'subscriber',
      'merchant',
      'asset',
      'amount_per_period',
      'period_seconds',
      'start_date',
      'end_date',
      'cancelled_date',
      'payments_collected',
      'payments_outstanding',
      'total_collected_amount',
      'total_outstanding_amount',
      'next_payment_due',
      'last_payment_date',
      'grace_period_ends',
      'schedule',
    ];

    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
    }
  });
});

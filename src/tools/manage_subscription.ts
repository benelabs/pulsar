/**
 * Tool: manage_subscription
 *
 * Implements a pull-payment model for recurring service fees on
 * the Stellar / Soroban network (Issue #175).
 *
 * This is a pure-computation tool — it derives subscription state from plan
 * parameters without hitting any network endpoint.  The output is intended to
 * be fed into simulate_transaction / submit_transaction when the merchant
 * wants to actually collect a payment.
 *
 * Pull-payment semantics
 * ─────────────────────
 * • The merchant (payee) initiates each payment collection, not the subscriber.
 * • Payments become collectable at the start of each new period.
 * • An optional grace_period_seconds window exists after each due-date before
 *   the subscription is marked OVERDUE.
 * • A cancelled subscription stops generating new collectible periods after
 *   the cancellation date.
 * • A fixed-term subscription expires automatically after total_periods.
 */

import { ManageSubscriptionInputSchema } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

// ---------------------------------------------------------------------------
// Public output types
// ---------------------------------------------------------------------------

/** Status of the subscription at the evaluated timestamp. */
export type SubscriptionStatus =
  | 'active' // within a valid paid period, not overdue
  | 'overdue' // payment is past due (grace elapsed) but subscription not cancelled
  | 'cancelled' // subscriber cancelled; no further charges
  | 'expired' // fixed-term subscription fully elapsed
  | 'pending'; // before the first period has started

/** Representation of a single billing period in the schedule. */
export interface SubscriptionPeriod {
  /** Period number (1-based). */
  period: number;
  /** ISO-8601 date when this period becomes due (start of the billing interval). */
  due_date: string;
  /** ISO-8601 date when the grace window closes for this period. */
  grace_ends: string;
  /** Whether the merchant has already collected this period's payment. */
  collected: boolean;
  /** Whether this period is currently overdue (grace elapsed, not yet collected). */
  overdue: boolean;
}

/** Full output returned by manage_subscription. */
export interface ManageSubscriptionOutput {
  /** Evaluated subscription status. */
  status: SubscriptionStatus;
  /** Subscriber public key. */
  subscriber: string;
  /** Merchant public key. */
  merchant: string;
  /** Human-readable asset identifier, e.g. "USDC:G…" or "XLM". */
  asset: string;
  /** Amount charged per billing period (7 decimal places). */
  amount_per_period: string;
  /** Length of one billing period in seconds. */
  period_seconds: number;
  /** ISO-8601 subscription start date. */
  start_date: string;
  /** ISO-8601 subscription end date, or null for indefinite subscriptions. */
  end_date: string | null;
  /** ISO-8601 cancellation date, or null if not cancelled. */
  cancelled_date: string | null;
  /** Number of periods already collected by the merchant. */
  payments_collected: number;
  /** Number of periods that are due but not yet collected. */
  payments_outstanding: number;
  /** Total token amount already collected (7 decimal places). */
  total_collected_amount: string;
  /** Total token amount outstanding across all uncollected due periods (7 decimal places). */
  total_outstanding_amount: string;
  /** ISO-8601 due date of the next uncollected period, or null if none. */
  next_payment_due: string | null;
  /** ISO-8601 timestamp of the last collected payment, or null if none. */
  last_payment_date: string | null;
  /** ISO-8601 end of grace window for the oldest overdue period, or null. */
  grace_period_ends: string | null;
  /** Full billing schedule up to the current evaluation point. */
  schedule: SubscriptionPeriod[];
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export const manageSubscription: McpToolHandler<typeof ManageSubscriptionInputSchema> = async (
  input: unknown
): Promise<ManageSubscriptionOutput> => {
  // ── 1. Validate inputs ────────────────────────────────────────────────────
  const parsed = ManageSubscriptionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for manage_subscription', parsed.error.format());
  }

  const {
    subscriber,
    merchant,
    amount_per_period,
    asset_code,
    asset_issuer,
    period_seconds,
    start_timestamp,
    total_periods,
    cancelled_timestamp,
    payments_collected,
    grace_period_seconds,
    current_timestamp,
  } = parsed.data;

  // ── 2. Cross-field validation ─────────────────────────────────────────────
  if (subscriber === merchant) {
    throw new PulsarValidationError('subscriber and merchant must be different Stellar accounts');
  }

  if (cancelled_timestamp !== undefined && cancelled_timestamp < start_timestamp) {
    throw new PulsarValidationError('cancelled_timestamp must be after start_timestamp');
  }

  const now = current_timestamp ?? Math.floor(Date.now() / 1000);

  if (now < start_timestamp) {
    // Subscription hasn't started yet — return a minimal pending response.
    const asset = buildAssetLabel(asset_code, asset_issuer);
    const endDate =
      total_periods != null
        ? new Date((start_timestamp + total_periods * period_seconds) * 1000).toISOString()
        : null;

    return {
      status: 'pending',
      subscriber,
      merchant,
      asset,
      amount_per_period: amount_per_period.toFixed(7),
      period_seconds,
      start_date: new Date(start_timestamp * 1000).toISOString(),
      end_date: endDate,
      cancelled_date: null,
      payments_collected: 0,
      payments_outstanding: 0,
      total_collected_amount: (0).toFixed(7),
      total_outstanding_amount: (0).toFixed(7),
      next_payment_due: new Date(start_timestamp * 1000).toISOString(),
      last_payment_date: null,
      grace_period_ends: null,
      schedule: [],
    };
  }

  // ── 3. Derive how many periods have elapsed ───────────────────────────────
  const elapsed = now - start_timestamp;
  // Number of complete billing periods elapsed since start
  let periodsElapsed = Math.floor(elapsed / period_seconds);

  // Cap to total_periods for fixed-term subscriptions
  if (total_periods != null) {
    periodsElapsed = Math.min(periodsElapsed, total_periods);
  }

  // If cancelled: only periods up to (and including) the period containing the
  // cancellation date are ever collectible.
  const effectiveCancelPeriod =
    cancelled_timestamp !== undefined
      ? Math.min(
          Math.ceil((cancelled_timestamp - start_timestamp) / period_seconds),
          total_periods ?? Infinity
        )
      : null;

  const maxCollectiblePeriods =
    effectiveCancelPeriod != null
      ? Math.min(periodsElapsed, effectiveCancelPeriod)
      : periodsElapsed;

  // ── 4. Build the schedule ─────────────────────────────────────────────────
  const schedule: SubscriptionPeriod[] = [];

  for (let i = 1; i <= maxCollectiblePeriods; i++) {
    const dueDateTs = start_timestamp + (i - 1) * period_seconds;
    const graceEndsTs = dueDateTs + grace_period_seconds;
    const isCollected = i <= payments_collected;
    const isOverdue = !isCollected && now > graceEndsTs;

    schedule.push({
      period: i,
      due_date: new Date(dueDateTs * 1000).toISOString(),
      grace_ends: new Date(graceEndsTs * 1000).toISOString(),
      collected: isCollected,
      overdue: isOverdue,
    });
  }

  // ── 5. Aggregate metrics ──────────────────────────────────────────────────
  const collectibleCount = schedule.length;
  const actualCollected = Math.min(payments_collected, collectibleCount);
  const outstanding = collectibleCount - actualCollected;

  const totalCollected = actualCollected * amount_per_period;
  const totalOutstanding = outstanding * amount_per_period;

  // Next uncollected period due date
  const nextPeriod = schedule.find((p) => !p.collected);
  const nextPaymentDue = nextPeriod?.due_date ?? null;

  // Last collected payment date
  const lastCollectedPeriod = [...schedule].reverse().find((p) => p.collected);
  const lastPaymentDate = lastCollectedPeriod?.due_date ?? null;

  // Oldest overdue grace end
  const oldestOverdue = schedule.find((p) => p.overdue);
  const gracePeriodEnds = oldestOverdue?.grace_ends ?? null;

  // ── 6. Determine status ───────────────────────────────────────────────────
  const asset = buildAssetLabel(asset_code, asset_issuer);

  const endTimestamp =
    total_periods != null ? start_timestamp + total_periods * period_seconds : null;
  const endDate = endTimestamp != null ? new Date(endTimestamp * 1000).toISOString() : null;
  const cancelledDate =
    cancelled_timestamp != null ? new Date(cancelled_timestamp * 1000).toISOString() : null;

  let status: SubscriptionStatus;

  if (cancelled_timestamp !== undefined && now >= cancelled_timestamp) {
    status = 'cancelled';
  } else if (endTimestamp != null && now >= endTimestamp) {
    status = 'expired';
  } else if (oldestOverdue != null) {
    status = 'overdue';
  } else {
    status = 'active';
  }

  // ── 7. Return result ──────────────────────────────────────────────────────
  return {
    status,
    subscriber,
    merchant,
    asset,
    amount_per_period: amount_per_period.toFixed(7),
    period_seconds,
    start_date: new Date(start_timestamp * 1000).toISOString(),
    end_date: endDate,
    cancelled_date: cancelledDate,
    payments_collected: actualCollected,
    payments_outstanding: outstanding,
    total_collected_amount: totalCollected.toFixed(7),
    total_outstanding_amount: totalOutstanding.toFixed(7),
    next_payment_due: nextPaymentDue,
    last_payment_date: lastPaymentDate,
    grace_period_ends: gracePeriodEnds,
    schedule,
  };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Build a human-readable asset label for display in tool output.
 * e.g. "USDC:GABC…" for issued assets, or "XLM" for the native asset.
 */
function buildAssetLabel(code: string, issuer?: string): string {
  if (issuer) return `${code}:${issuer}`;
  return code;
}

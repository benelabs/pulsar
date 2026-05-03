import { xdr, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

// xdr.TimePoint, xdr.Duration, xdr.SequenceNumber are valid at runtime but
// not re-exported in the TypeScript namespace — access via the any escape hatch.
const xdrAny = xdr as any;

import { config } from '../config.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import logger from '../logger.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import type { BuildConditionalTransactionInput } from '../schemas/tools.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConditionValidationResult {
  condition: string;
  passed: boolean;
  reason: string;
}

export interface BuildConditionalTransactionOutput {
  status: 'ready' | 'conditions_not_met' | 'validation_skipped';
  modified_xdr: string;
  conditions_applied: {
    time_bounds?: { min_time: number; max_time: number };
    ledger_bounds?: { min_ledger: number; max_ledger: number };
    min_sequence_number?: string;
    min_sequence_age?: number;
    min_sequence_ledger_gap?: number;
  };
  validation?: {
    checked_at_ledger: number;
    checked_at_time: number;
    passed: boolean;
    results: ConditionValidationResult[];
  };
}

type Conditions = BuildConditionalTransactionInput['conditions'];

// ---------------------------------------------------------------------------
// Network helpers (mirrors existing tools)
// ---------------------------------------------------------------------------

function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}

// ---------------------------------------------------------------------------
// XDR precondition builder
// ---------------------------------------------------------------------------

export function buildXdrPreconditions(conditions: Conditions): xdr.Preconditions {
  const hasTimeBounds =
    conditions.time_bounds?.min_time !== undefined ||
    conditions.time_bounds?.max_time !== undefined;
  const hasLedgerBounds = conditions.ledger_bounds !== undefined;
  const hasMinSeq = conditions.min_sequence_number !== undefined;
  const hasMinSeqAge = conditions.min_sequence_age !== undefined;
  const hasMinSeqLedgerGap = conditions.min_sequence_ledger_gap !== undefined;
  const needsV2 = hasLedgerBounds || hasMinSeq || hasMinSeqAge || hasMinSeqLedgerGap;

  // Fast path: time bounds only → use the leaner precondTime variant
  if (hasTimeBounds && !needsV2) {
    const timeBounds = new xdr.TimeBounds({
      minTime: xdrAny.TimePoint.fromString(String(conditions.time_bounds!.min_time ?? 0)),
      maxTime: xdrAny.TimePoint.fromString(String(conditions.time_bounds!.max_time ?? 0)),
    });
    return xdr.Preconditions.precondTime(timeBounds);
  }

  // Full precondV2 path
  const timeBoundsXdr = hasTimeBounds
    ? new xdr.TimeBounds({
        minTime: xdrAny.TimePoint.fromString(String(conditions.time_bounds!.min_time ?? 0)),
        maxTime: xdrAny.TimePoint.fromString(String(conditions.time_bounds!.max_time ?? 0)),
      })
    : null;

  const ledgerBoundsXdr = hasLedgerBounds
    ? new xdr.LedgerBounds({
        minLedger: conditions.ledger_bounds!.min_ledger ?? 0,
        maxLedger: conditions.ledger_bounds!.max_ledger ?? 0,
      })
    : null;

  const minSeqNumXdr = hasMinSeq
    ? xdrAny.SequenceNumber.fromString(conditions.min_sequence_number!)
    : null;

  const precondV2 = new xdr.PreconditionsV2({
    timeBounds: timeBoundsXdr,
    ledgerBounds: ledgerBoundsXdr,
    minSeqNum: minSeqNumXdr,
    minSeqAge: xdrAny.Duration.fromString(String(conditions.min_sequence_age ?? 0)),
    minSeqLedgerGap: conditions.min_sequence_ledger_gap ?? 0,
    extraSigners: [],
  });

  return xdr.Preconditions.precondV2(precondV2);
}

// ---------------------------------------------------------------------------
// XDR envelope rebuilder
// ---------------------------------------------------------------------------

export function embedPreconditions(
  txXdr: string,
  networkPassphrase: string,
  conditions: Conditions
): string {
  let envelope: xdr.TransactionEnvelope;
  try {
    // Validate the XDR is parseable under the given network passphrase
    TransactionBuilder.fromXDR(txXdr, networkPassphrase);
    envelope = xdr.TransactionEnvelope.fromXDR(txXdr, 'base64');
  } catch (err) {
    throw new PulsarValidationError(`Failed to parse transaction XDR: ${(err as Error).message}`);
  }

  if (envelope.switch().name !== 'envelopeTypeTx') {
    throw new PulsarValidationError(
      'Only V1 transaction envelopes (envelopeTypeTx) support preconditions. ' +
        'Use a v1-format transaction XDR.'
    );
  }

  const v1 = envelope.v1();
  const innerTx = v1.tx();
  const newCond = buildXdrPreconditions(conditions);

  const newInnerTx = new xdr.Transaction({
    sourceAccount: innerTx.sourceAccount(),
    fee: innerTx.fee(),
    seqNum: innerTx.seqNum(),
    cond: newCond,
    memo: innerTx.memo(),
    operations: innerTx.operations(),
    ext: innerTx.ext(),
  });

  const newEnvelope = xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({
      tx: newInnerTx,
      signatures: v1.signatures(), // preserve existing signatures (will be invalidated after mutation)
    })
  );

  return newEnvelope.toXDR('base64');
}

// ---------------------------------------------------------------------------
// Condition validator (checks against live ledger)
// ---------------------------------------------------------------------------

export async function validateConditions(
  conditions: Conditions,
  network: string
): Promise<{
  checkedAtLedger: number;
  checkedAtTime: number;
  results: ConditionValidationResult[];
}> {
  const server = getSorobanServer(network);

  let latestLedger: Awaited<ReturnType<typeof server.getLatestLedger>>;
  try {
    latestLedger = await server.getLatestLedger();
  } catch (err) {
    throw new PulsarNetworkError(
      `Failed to fetch latest ledger for condition validation: ${(err as Error).message}`
    );
  }

  const currentLedger = latestLedger.sequence;
  // Soroban RPC returns `closeTime` as a Unix timestamp in seconds
  const currentTime =
    (latestLedger as unknown as { closeTime: number }).closeTime ?? Math.floor(Date.now() / 1000);

  const results: ConditionValidationResult[] = [];

  if (conditions.time_bounds) {
    const { min_time, max_time } = conditions.time_bounds;
    if (min_time !== undefined && min_time > 0) {
      const passed = currentTime >= min_time;
      results.push({
        condition: 'time_bounds.min_time',
        passed,
        reason: passed
          ? `Current time ${currentTime} ≥ min_time ${min_time}`
          : `Transaction not yet valid — current time ${currentTime} < min_time ${min_time}`,
      });
    }
    if (max_time !== undefined && max_time > 0) {
      const passed = currentTime <= max_time;
      results.push({
        condition: 'time_bounds.max_time',
        passed,
        reason: passed
          ? `Current time ${currentTime} ≤ max_time ${max_time}`
          : `Transaction has expired — current time ${currentTime} > max_time ${max_time}`,
      });
    }
  }

  if (conditions.ledger_bounds) {
    const { min_ledger, max_ledger } = conditions.ledger_bounds;
    if (min_ledger !== undefined && min_ledger > 0) {
      const passed = currentLedger >= min_ledger;
      results.push({
        condition: 'ledger_bounds.min_ledger',
        passed,
        reason: passed
          ? `Current ledger ${currentLedger} ≥ min_ledger ${min_ledger}`
          : `Too early — current ledger ${currentLedger} < min_ledger ${min_ledger}`,
      });
    }
    if (max_ledger !== undefined && max_ledger > 0) {
      const passed = currentLedger <= max_ledger;
      results.push({
        condition: 'ledger_bounds.max_ledger',
        passed,
        reason: passed
          ? `Current ledger ${currentLedger} ≤ max_ledger ${max_ledger}`
          : `Window closed — current ledger ${currentLedger} > max_ledger ${max_ledger}`,
      });
    }
  }

  // min_sequence_number, min_sequence_age, min_sequence_ledger_gap require
  // account-level data (sequence number, last modified ledger).  We surface
  // a note so callers know these weren't checked.
  for (const key of [
    'min_sequence_number',
    'min_sequence_age',
    'min_sequence_ledger_gap',
  ] as const) {
    if (conditions[key] !== undefined) {
      results.push({
        condition: key,
        passed: true,
        reason: `Embedded in envelope — runtime validation by the Stellar network. Fetch account data to pre-validate.`,
      });
    }
  }

  return {
    checkedAtLedger: currentLedger,
    checkedAtTime: currentTime,
    results,
  };
}

// ---------------------------------------------------------------------------
// Public tool handler
// ---------------------------------------------------------------------------

export async function buildConditionalTransaction(
  input: BuildConditionalTransactionInput
): Promise<BuildConditionalTransactionOutput> {
  const network = input.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);

  logger.debug(
    { conditions: input.conditions, network, validate_now: input.validate_now },
    'build_conditional_transaction: applying preconditions'
  );

  // 1. Embed preconditions into the transaction XDR
  const modifiedXdr = embedPreconditions(input.xdr, networkPassphrase, input.conditions);

  // 2. Build the conditions_applied summary for the response
  const conditionsApplied: BuildConditionalTransactionOutput['conditions_applied'] = {};

  if (input.conditions.time_bounds) {
    conditionsApplied.time_bounds = {
      min_time: input.conditions.time_bounds.min_time ?? 0,
      max_time: input.conditions.time_bounds.max_time ?? 0,
    };
  }
  if (input.conditions.ledger_bounds) {
    conditionsApplied.ledger_bounds = {
      min_ledger: input.conditions.ledger_bounds.min_ledger ?? 0,
      max_ledger: input.conditions.ledger_bounds.max_ledger ?? 0,
    };
  }
  if (input.conditions.min_sequence_number !== undefined) {
    conditionsApplied.min_sequence_number = input.conditions.min_sequence_number;
  }
  if (input.conditions.min_sequence_age !== undefined) {
    conditionsApplied.min_sequence_age = input.conditions.min_sequence_age;
  }
  if (input.conditions.min_sequence_ledger_gap !== undefined) {
    conditionsApplied.min_sequence_ledger_gap = input.conditions.min_sequence_ledger_gap;
  }

  // 3. Optionally validate conditions against live ledger
  if (!input.validate_now) {
    return {
      status: 'validation_skipped',
      modified_xdr: modifiedXdr,
      conditions_applied: conditionsApplied,
    };
  }

  const { checkedAtLedger, checkedAtTime, results } = await validateConditions(
    input.conditions,
    network
  );

  const allPassed = results.every((r) => r.passed);

  logger.info(
    { checkedAtLedger, allPassed, failures: results.filter((r) => !r.passed).length },
    'build_conditional_transaction: validation complete'
  );

  return {
    status: allPassed ? 'ready' : 'conditions_not_met',
    modified_xdr: modifiedXdr,
    conditions_applied: conditionsApplied,
    validation: {
      checked_at_ledger: checkedAtLedger,
      checked_at_time: checkedAtTime,
      passed: allPassed,
      results,
    },
  };
}

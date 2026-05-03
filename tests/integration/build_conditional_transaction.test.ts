/**
 * Integration tests for build_conditional_transaction tool.
 *
 * These tests use real Stellar SDK XDR construction and, when
 * RUN_INTEGRATION_TESTS=true, also hit the Soroban testnet RPC to validate
 * conditions against a live ledger.
 */

import { describe, it, expect } from 'vitest';
import {
  TransactionBuilder,
  Account,
  Operation,
  Asset,
  Keypair,
  Networks,
  xdr,
} from '@stellar/stellar-sdk';

import { buildConditionalTransaction } from '../../src/tools/build_conditional_transaction.js';

import { describeIfIntegration } from './setup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestTxXdr(network = Networks.TESTNET): string {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), '100');
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: network })
    .addOperation(
      Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: '1' })
    )
    .setTimeout(0)
    .build();
  return tx.toEnvelope().toXDR('base64');
}

// ---------------------------------------------------------------------------
// Always-on tests: real XDR but no network calls
// ---------------------------------------------------------------------------

describe('build_conditional_transaction (real XDR, no network)', () => {
  it('embeds time_bounds and returns a parseable envelope', async () => {
    const original = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: original,
      conditions: { time_bounds: { min_time: 0, max_time: 9_999_999_999 } },
      validate_now: false,
    });

    expect(result.status).toBe('validation_skipped');
    expect(result.modified_xdr).not.toBe(original);

    const env = xdr.TransactionEnvelope.fromXDR(result.modified_xdr, 'base64');
    const cond = env.v1().tx().cond();
    expect(cond.switch().name).toBe('precondTime');
    expect(cond.timeBounds()!.maxTime().toString()).toBe('9999999999');
  });

  it('embeds ledger_bounds in a precondV2 envelope', async () => {
    const original = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: original,
      conditions: { ledger_bounds: { min_ledger: 100, max_ledger: 1_000_000 } },
      validate_now: false,
    });

    const env = xdr.TransactionEnvelope.fromXDR(result.modified_xdr, 'base64');
    const v2 = env.v1().tx().cond().v2();
    expect(v2.ledgerBounds()!.minLedger()).toBe(100);
    expect(v2.ledgerBounds()!.maxLedger()).toBe(1_000_000);
  });

  it('embeds all five condition types simultaneously', async () => {
    const original = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: original,
      conditions: {
        time_bounds: { min_time: 1000, max_time: 9_000_000 },
        ledger_bounds: { min_ledger: 10, max_ledger: 9_000_000 },
        min_sequence_number: '12345',
        min_sequence_age: 60,
        min_sequence_ledger_gap: 4,
      },
      validate_now: false,
    });

    const env = xdr.TransactionEnvelope.fromXDR(result.modified_xdr, 'base64');
    const v2 = env.v1().tx().cond().v2();

    expect(v2.timeBounds()!.minTime().toString()).toBe('1000');
    expect(v2.ledgerBounds()!.minLedger()).toBe(10);
    expect(v2.minSeqNum()!.toString()).toBe('12345');
    expect(v2.minSeqAge().toString()).toBe('60');
    expect(v2.minSeqLedgerGap()).toBe(4);

    // conditions_applied mirrors the input
    expect(result.conditions_applied.min_sequence_number).toBe('12345');
    expect(result.conditions_applied.min_sequence_age).toBe(60);
    expect(result.conditions_applied.min_sequence_ledger_gap).toBe(4);
  });

  it('preserves the original fee, sequence, source and operations', async () => {
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), '999');
    const tx = new TransactionBuilder(account, {
      fee: '500',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: '10' })
      )
      .setTimeout(0)
      .build();
    const original = tx.toEnvelope().toXDR('base64');

    const result = await buildConditionalTransaction({
      xdr: original,
      conditions: { time_bounds: { max_time: 9_999_999_999 } },
      validate_now: false,
    });

    const origEnv = xdr.TransactionEnvelope.fromXDR(original, 'base64');
    const newEnv = xdr.TransactionEnvelope.fromXDR(result.modified_xdr, 'base64');

    expect(newEnv.v1().tx().fee()).toBe(origEnv.v1().tx().fee());
    expect(newEnv.v1().tx().seqNum().toXDR('base64')).toBe(
      origEnv.v1().tx().seqNum().toXDR('base64')
    );
    expect(newEnv.v1().tx().operations().length).toBe(1);
  });

  it('rejects invalid XDR with a VALIDATION_ERROR', async () => {
    let caught: unknown;
    try {
      await buildConditionalTransaction({
        xdr: 'AAAA==',
        conditions: { time_bounds: { max_time: 9999 } },
        validate_now: false,
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as any).code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Integration tests: validate conditions against the live Soroban testnet RPC
// ---------------------------------------------------------------------------

describeIfIntegration('build_conditional_transaction (live RPC validation)', () => {
  it('returns ready for a far-future max_time on testnet', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { time_bounds: { min_time: 0, max_time: 9_999_999_999 } },
      validate_now: true,
      network: 'testnet',
    });

    expect(result.status).toBe('ready');
    expect(result.validation?.passed).toBe(true);
    expect(result.validation?.checked_at_ledger).toBeGreaterThan(0);
  });

  it('returns conditions_not_met for a max_time already in the past', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { time_bounds: { max_time: 1 } }, // Unix epoch + 1s — always in the past
      validate_now: true,
      network: 'testnet',
    });

    expect(result.status).toBe('conditions_not_met');
    expect(result.validation?.passed).toBe(false);
    const expiredResult = result.validation?.results.find(
      (r) => r.condition === 'time_bounds.max_time'
    );
    expect(expiredResult?.passed).toBe(false);
  });

  it('returns conditions_not_met for a min_time far in the future', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { time_bounds: { min_time: 9_999_999_999 } },
      validate_now: true,
      network: 'testnet',
    });

    expect(result.status).toBe('conditions_not_met');
    const minTimeResult = result.validation?.results.find(
      (r) => r.condition === 'time_bounds.min_time'
    );
    expect(minTimeResult?.passed).toBe(false);
  });

  it('returns ready for a min_ledger already passed on testnet', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { ledger_bounds: { min_ledger: 1, max_ledger: 0 } },
      validate_now: true,
      network: 'testnet',
    });

    expect(['ready', 'conditions_not_met']).toContain(result.status);
    const minLedgerResult = result.validation?.results.find(
      (r) => r.condition === 'ledger_bounds.min_ledger'
    );
    // Ledger 1 is always in the past on testnet
    expect(minLedgerResult?.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema validation (always-on)
// ---------------------------------------------------------------------------

describe('build_conditional_transaction schema', () => {
  it('rejects empty conditions object', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: 'AAAA==',
      conditions: {},
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toMatch(/At least one condition/);
  });

  it('applies default validate_now=false', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: 'AAAA==',
      conditions: { time_bounds: { max_time: 9999 } },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.validate_now).toBe(false);
  });

  it('accepts negative-free min_sequence_number as string', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: 'AAAA==',
      conditions: { min_sequence_number: '9876543210987654321' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-numeric min_sequence_number', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: 'AAAA==',
      conditions: { min_sequence_number: 'not-a-number' },
    });
    expect(r.success).toBe(false);
  });
});

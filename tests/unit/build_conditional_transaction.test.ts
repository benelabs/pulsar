import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  xdr,
  Networks,
  TransactionBuilder,
  Account,
  Operation,
  Asset,
  Keypair,
} from '@stellar/stellar-sdk';

import {
  buildXdrPreconditions,
  embedPreconditions,
  validateConditions,
  buildConditionalTransaction,
} from '../../src/tools/build_conditional_transaction.js';
import { getSorobanServer } from '../../src/services/soroban-rpc.js';

vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestTxXdr(): string {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), '100');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: kp.publicKey(),
        asset: Asset.native(),
        amount: '1',
      })
    )
    .setTimeout(0)
    .build();
  return tx.toEnvelope().toXDR('base64');
}

// ---------------------------------------------------------------------------
// buildXdrPreconditions
// ---------------------------------------------------------------------------

describe('buildXdrPreconditions', () => {
  it('returns precondNone when no meaningful condition is given', () => {
    // min_time/max_time = 0 with nothing else → still builds timebounds
    // (edge case: caller should avoid this; schema requires at least one field)
    const cond = buildXdrPreconditions({ time_bounds: { min_time: 0, max_time: 0 } });
    // With only time_bounds present, uses precondTime path
    expect(cond.switch().name).toBe('precondTime');
  });

  it('uses precondTime when only time_bounds is present', () => {
    const cond = buildXdrPreconditions({
      time_bounds: { min_time: 1000, max_time: 9999 },
    });
    expect(cond.switch().name).toBe('precondTime');
    const timeBounds = cond.timeBounds();
    expect(timeBounds!.minTime().toString()).toBe('1000');
    expect(timeBounds!.maxTime().toString()).toBe('9999');
  });

  it('uses precondV2 when ledger_bounds is present', () => {
    const cond = buildXdrPreconditions({
      ledger_bounds: { min_ledger: 100, max_ledger: 200 },
    });
    expect(cond.switch().name).toBe('precondV2');
    const v2 = cond.v2();
    expect(v2.ledgerBounds()!.minLedger()).toBe(100);
    expect(v2.ledgerBounds()!.maxLedger()).toBe(200);
  });

  it('uses precondV2 when min_sequence_number is present', () => {
    const cond = buildXdrPreconditions({ min_sequence_number: '9876543210' });
    expect(cond.switch().name).toBe('precondV2');
    expect(cond.v2().minSeqNum()!.toString()).toBe('9876543210');
  });

  it('uses precondV2 when min_sequence_age is present', () => {
    const cond = buildXdrPreconditions({ min_sequence_age: 3600 });
    expect(cond.switch().name).toBe('precondV2');
    expect(cond.v2().minSeqAge().toString()).toBe('3600');
  });

  it('uses precondV2 when min_sequence_ledger_gap is present', () => {
    const cond = buildXdrPreconditions({ min_sequence_ledger_gap: 5 });
    expect(cond.switch().name).toBe('precondV2');
    expect(cond.v2().minSeqLedgerGap()).toBe(5);
  });

  it('combines time_bounds and ledger_bounds in precondV2', () => {
    const cond = buildXdrPreconditions({
      time_bounds: { min_time: 1000, max_time: 9999 },
      ledger_bounds: { min_ledger: 50, max_ledger: 100 },
    });
    expect(cond.switch().name).toBe('precondV2');
    const v2 = cond.v2();
    expect(v2.timeBounds()!.minTime().toString()).toBe('1000');
    expect(v2.ledgerBounds()!.minLedger()).toBe(50);
  });

  it('sets null for ledgerBounds when only time_bounds + other seq fields', () => {
    const cond = buildXdrPreconditions({
      time_bounds: { min_time: 0, max_time: 0 },
      min_sequence_age: 60,
    });
    expect(cond.switch().name).toBe('precondV2');
    expect(cond.v2().ledgerBounds()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// embedPreconditions
// ---------------------------------------------------------------------------

describe('embedPreconditions', () => {
  it('returns a valid base64 XDR string', () => {
    const txXdr = makeTestTxXdr();
    const result = embedPreconditions(txXdr, Networks.TESTNET, {
      time_bounds: { min_time: 0, max_time: 9999999999 },
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('embeds time_bounds so the rebuilt envelope has the correct precondition', () => {
    const txXdr = makeTestTxXdr();
    const result = embedPreconditions(txXdr, Networks.TESTNET, {
      time_bounds: { min_time: 1111, max_time: 9999 },
    });
    const env = xdr.TransactionEnvelope.fromXDR(result, 'base64');
    const cond = env.v1().tx().cond();
    expect(cond.switch().name).toBe('precondTime');
    expect(cond.timeBounds()!.minTime().toString()).toBe('1111');
    expect(cond.timeBounds()!.maxTime().toString()).toBe('9999');
  });

  it('embeds ledger_bounds in precondV2', () => {
    const txXdr = makeTestTxXdr();
    const result = embedPreconditions(txXdr, Networks.TESTNET, {
      ledger_bounds: { min_ledger: 10, max_ledger: 500 },
    });
    const env = xdr.TransactionEnvelope.fromXDR(result, 'base64');
    const v2 = env.v1().tx().cond().v2();
    expect(v2.ledgerBounds()!.minLedger()).toBe(10);
    expect(v2.ledgerBounds()!.maxLedger()).toBe(500);
  });

  it('preserves source account and operations from the original envelope', () => {
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), '200');
    const tx = new TransactionBuilder(account, {
      fee: '200',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({ destination: kp.publicKey(), asset: Asset.native(), amount: '5' })
      )
      .setTimeout(0)
      .build();
    const original = tx.toEnvelope().toXDR('base64');

    const result = embedPreconditions(original, Networks.TESTNET, {
      time_bounds: { min_time: 0, max_time: 9999999999 },
    });

    const origEnv = xdr.TransactionEnvelope.fromXDR(original, 'base64');
    const newEnv = xdr.TransactionEnvelope.fromXDR(result, 'base64');

    // Source account unchanged
    expect(newEnv.v1().tx().sourceAccount().toXDR('base64')).toBe(
      origEnv.v1().tx().sourceAccount().toXDR('base64')
    );
    // Operations unchanged
    expect(newEnv.v1().tx().operations().length).toBe(1);
  });

  it('throws PulsarValidationError for unparseable XDR', () => {
    let caught: unknown;
    try {
      embedPreconditions('not-valid-xdr', Networks.TESTNET, {
        time_bounds: { min_time: 0, max_time: 9999 },
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as any).code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// validateConditions
// ---------------------------------------------------------------------------

describe('validateConditions', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { getLatestLedger: vi.fn() };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer);
  });

  function mockLedger(sequence: number, closeTime: number) {
    mockServer.getLatestLedger.mockResolvedValue({ sequence, closeTime });
  }

  it('passes min_time when current time is at or after min_time', async () => {
    mockLedger(1000, 2000);
    const { results } = await validateConditions({ time_bounds: { min_time: 1500 } }, 'testnet');
    expect(results[0].condition).toBe('time_bounds.min_time');
    expect(results[0].passed).toBe(true);
  });

  it('fails min_time when current time is before min_time', async () => {
    mockLedger(1000, 1000);
    const { results } = await validateConditions({ time_bounds: { min_time: 2000 } }, 'testnet');
    expect(results[0].passed).toBe(false);
    expect(results[0].reason).toMatch(/not yet valid/);
  });

  it('passes max_time when current time is at or before max_time', async () => {
    mockLedger(1000, 5000);
    const { results } = await validateConditions({ time_bounds: { max_time: 9999 } }, 'testnet');
    expect(results[0].condition).toBe('time_bounds.max_time');
    expect(results[0].passed).toBe(true);
  });

  it('fails max_time when current time is after max_time', async () => {
    mockLedger(1000, 9999);
    const { results } = await validateConditions({ time_bounds: { max_time: 5000 } }, 'testnet');
    expect(results[0].passed).toBe(false);
    expect(results[0].reason).toMatch(/expired/);
  });

  it('passes min_ledger when current ledger meets requirement', async () => {
    mockLedger(500, 1000);
    const { results } = await validateConditions({ ledger_bounds: { min_ledger: 400 } }, 'testnet');
    expect(results[0].condition).toBe('ledger_bounds.min_ledger');
    expect(results[0].passed).toBe(true);
  });

  it('fails min_ledger when current ledger is too low', async () => {
    mockLedger(100, 1000);
    const { results } = await validateConditions({ ledger_bounds: { min_ledger: 500 } }, 'testnet');
    expect(results[0].passed).toBe(false);
    expect(results[0].reason).toMatch(/Too early/);
  });

  it('fails max_ledger when current ledger exceeds limit', async () => {
    mockLedger(600, 1000);
    const { results } = await validateConditions({ ledger_bounds: { max_ledger: 500 } }, 'testnet');
    expect(results[0].passed).toBe(false);
    expect(results[0].reason).toMatch(/Window closed/);
  });

  it('marks sequence-based conditions as passed with a note', async () => {
    mockLedger(100, 1000);
    const { results } = await validateConditions(
      { min_sequence_number: '999', min_sequence_age: 60, min_sequence_ledger_gap: 2 },
      'testnet'
    );
    expect(results).toHaveLength(3);
    results.forEach((r) => {
      expect(r.passed).toBe(true);
      expect(r.reason).toMatch(/runtime validation/);
    });
  });

  it('returns checkedAtLedger and checkedAtTime from the RPC response', async () => {
    mockLedger(777, 1234567890);
    const { checkedAtLedger, checkedAtTime } = await validateConditions(
      { time_bounds: { max_time: 9999999999 } },
      'testnet'
    );
    expect(checkedAtLedger).toBe(777);
    expect(checkedAtTime).toBe(1234567890);
  });

  it('throws PulsarNetworkError when getLatestLedger fails', async () => {
    mockServer.getLatestLedger.mockRejectedValue(new Error('RPC down'));
    let caught: unknown;
    try {
      await validateConditions({ time_bounds: { min_time: 100 } }, 'testnet');
    } catch (e) {
      caught = e;
    }
    expect((caught as any).code).toBe('NETWORK_ERROR');
  });
});

// ---------------------------------------------------------------------------
// buildConditionalTransaction (integration of all parts)
// ---------------------------------------------------------------------------

describe('buildConditionalTransaction', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = { getLatestLedger: vi.fn() };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer);
  });

  it('returns validation_skipped when validate_now is false', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { time_bounds: { min_time: 0, max_time: 9999999999 } },
      validate_now: false,
    });
    expect(result.status).toBe('validation_skipped');
    expect(result.modified_xdr).toBeTruthy();
    expect(result.validation).toBeUndefined();
  });

  it('returns ready when all conditions pass against the live ledger', async () => {
    mockServer.getLatestLedger.mockResolvedValue({ sequence: 100, closeTime: 5000 });
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: { time_bounds: { min_time: 1000, max_time: 9999999 } },
      validate_now: true,
    });
    expect(result.status).toBe('ready');
    expect(result.validation?.passed).toBe(true);
  });

  it('returns conditions_not_met when a condition fails', async () => {
    mockServer.getLatestLedger.mockResolvedValue({ sequence: 100, closeTime: 1 });
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      // max_time in the past
      conditions: { time_bounds: { max_time: 0, min_time: 9999999999 } },
      validate_now: true,
    });
    expect(result.status).toBe('conditions_not_met');
    expect(result.validation?.passed).toBe(false);
    expect(result.validation?.results.some((r) => !r.passed)).toBe(true);
  });

  it('populates conditions_applied correctly', async () => {
    const txXdr = makeTestTxXdr();
    const result = await buildConditionalTransaction({
      xdr: txXdr,
      conditions: {
        time_bounds: { min_time: 100, max_time: 200 },
        ledger_bounds: { min_ledger: 10, max_ledger: 50 },
        min_sequence_number: '42',
        min_sequence_age: 30,
        min_sequence_ledger_gap: 3,
      },
      validate_now: false,
    });
    expect(result.conditions_applied.time_bounds).toEqual({ min_time: 100, max_time: 200 });
    expect(result.conditions_applied.ledger_bounds).toEqual({ min_ledger: 10, max_ledger: 50 });
    expect(result.conditions_applied.min_sequence_number).toBe('42');
    expect(result.conditions_applied.min_sequence_age).toBe(30);
    expect(result.conditions_applied.min_sequence_ledger_gap).toBe(3);
  });

  it('schema rejects input with no conditions set', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: 'AAAA==',
      conditions: {},
    });
    expect(r.success).toBe(false);
  });

  it('schema rejects invalid XDR (non-base64)', async () => {
    const { BuildConditionalTransactionInputSchema } = await import('../../src/schemas/tools.js');
    const r = BuildConditionalTransactionInputSchema.safeParse({
      xdr: '!!!not base64!!!',
      conditions: { time_bounds: { max_time: 9999 } },
    });
    expect(r.success).toBe(false);
  });
});

/**
 * Integration tests for batch_events tool.
 *
 * These tests exercise the real Stellar SDK XDR encoding/decoding path using
 * programmatically constructed ContractEvent XDR — no live network required.
 * They are still gated behind RUN_INTEGRATION_TESTS for consistency with the
 * rest of the integration suite.
 */

import { describe, it, expect } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

import { batchEvents } from '../../src/tools/batch_events.js';

import { describeIfIntegration } from './setup.js';

// ---------------------------------------------------------------------------
// Helpers — build real ContractEvent XDR bytes
// ---------------------------------------------------------------------------

/**
 * Build a minimal ContractEvent XDR (base64) from raw parts.
 * Uses the Stellar SDK's xdr builder so the output is genuinely valid XDR.
 */
function buildContractEventXdr(opts: {
  contractIdHex: string;
  topicSymbols: string[];
  dataInt: number;
}): string {
  const topics = opts.topicSymbols.map((sym) => xdr.ScVal.scvSymbol(sym));
  const data = xdr.ScVal.scvU32(opts.dataInt);

  const v0 = new xdr.ContractEventV0({ topics, data });
  // Union constructors for stellar-base XDR use new ctor(armIndex, value)
  const body = new (xdr.ContractEventBody as any)(0, v0) as xdr.ContractEventBody;
  const ext = new (xdr.ExtensionPoint as any)(0) as xdr.ExtensionPoint;

  const contractIdBuf = Buffer.from(opts.contractIdHex.padEnd(64, '0').slice(0, 64), 'hex');

  const contractEvent = new xdr.ContractEvent({
    ext,
    contractId: contractIdBuf,
    type: xdr.ContractEventType.contract(),
    body,
  });

  return contractEvent.toXDR('base64');
}

// ---------------------------------------------------------------------------
// Integration suite
// ---------------------------------------------------------------------------

describeIfIntegration('batch_events (integration — real XDR)', () => {
  it('round-trips a single ContractEvent XDR without error', () => {
    const eventXdr = buildContractEventXdr({
      contractIdHex: 'aabbccdd',
      topicSymbols: ['transfer'],
      dataInt: 100,
    });

    const result = batchEvents({
      events: [eventXdr],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.status).toBe('ok');
    expect(result.original_count).toBe(1);
    expect(result.unique_count).toBe(1);
    expect(result.duplicate_count).toBe(0);
    expect(result.batches).toHaveLength(1);
    expect(result.unprocessed).toHaveLength(0);
  });

  it('deduplicates identical events across multiple occurrences', () => {
    const eventXdr = buildContractEventXdr({
      contractIdHex: 'aabbccdd',
      topicSymbols: ['transfer'],
      dataInt: 42,
    });

    const result = batchEvents({
      events: [eventXdr, eventXdr, eventXdr],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.original_count).toBe(3);
    expect(result.unique_count).toBe(1);
    expect(result.duplicate_count).toBe(2);
    expect(result.batches[0].events[0].occurrence_count).toBe(3);
  });

  it('keeps distinct events separate when same contract but different data', () => {
    const eventA = buildContractEventXdr({
      contractIdHex: 'aabbccdd',
      topicSymbols: ['transfer'],
      dataInt: 100,
    });
    const eventB = buildContractEventXdr({
      contractIdHex: 'aabbccdd',
      topicSymbols: ['transfer'],
      dataInt: 200,
    });

    const result = batchEvents({
      events: [eventA, eventB, eventA],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.original_count).toBe(3);
    expect(result.unique_count).toBe(2);
    expect(result.duplicate_count).toBe(1);

    const batch = result.batches[0];
    expect(batch.events).toHaveLength(2);
    const counts = batch.events.map((e) => e.occurrence_count).sort();
    expect(counts).toEqual([1, 2]);
  });

  it('groups events from different contracts into separate batches', () => {
    const event1 = buildContractEventXdr({
      contractIdHex: 'aabb0000',
      topicSymbols: ['mint'],
      dataInt: 1,
    });
    const event2 = buildContractEventXdr({
      contractIdHex: 'ccdd0000',
      topicSymbols: ['mint'],
      dataInt: 1,
    });

    const result = batchEvents({
      events: [event1, event2],
      group_by: 'contract',
      deduplicate: true,
    });

    expect(result.batches).toHaveLength(2);
  });

  it('groups events by topic across different contracts when group_by=topic', () => {
    const transferFromA = buildContractEventXdr({
      contractIdHex: 'aabb0000',
      topicSymbols: ['transfer'],
      dataInt: 10,
    });
    const transferFromB = buildContractEventXdr({
      contractIdHex: 'ccdd0000',
      topicSymbols: ['transfer'],
      dataInt: 20,
    });
    const mintFromA = buildContractEventXdr({
      contractIdHex: 'aabb0000',
      topicSymbols: ['mint'],
      dataInt: 5,
    });

    const result = batchEvents({
      events: [transferFromA, transferFromB, mintFromA],
      group_by: 'topic',
      deduplicate: true,
    });

    // "transfer" and "mint" → 2 topic-groups
    expect(result.batches).toHaveLength(2);
  });

  it('populates audit_log correctly', () => {
    const eventXdr = buildContractEventXdr({
      contractIdHex: 'deadbeef',
      topicSymbols: ['burn'],
      dataInt: 99,
    });

    const result = batchEvents({
      events: [eventXdr],
      group_by: 'topic',
      deduplicate: false,
    });

    expect(result.audit_log.group_strategy).toBe('topic');
    expect(result.audit_log.deduplicated).toBe(false);
    expect(result.audit_log.processed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records unparseable events in unprocessed without aborting the batch', () => {
    const validXdr = buildContractEventXdr({
      contractIdHex: 'aabbccdd',
      topicSymbols: ['transfer'],
      dataInt: 1,
    });

    const result = batchEvents({
      events: [validXdr, 'this-is-not-valid-xdr=='],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.original_count).toBe(2);
    expect(result.unprocessed).toHaveLength(1);
    expect(result.unprocessed[0].index).toBe(1);
    expect(result.unique_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Always-on smoke test (no live network, no XDR needed)
// ---------------------------------------------------------------------------

describe('batch_events schema validation', () => {
  it('rejects an empty events array', async () => {
    const { BatchEventsInputSchema } = await import('../../src/schemas/tools.js');
    const result = BatchEventsInputSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });

  it('accepts valid input with defaults applied', async () => {
    const { BatchEventsInputSchema } = await import('../../src/schemas/tools.js');
    const result = BatchEventsInputSchema.safeParse({ events: ['AAAA=='] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.group_by).toBe('contract_and_topic');
      expect(result.data.deduplicate).toBe(true);
    }
  });
});

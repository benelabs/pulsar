import { describe, it, expect, vi, beforeEach } from 'vitest';
import { xdr, StrKey } from '@stellar/stellar-sdk';

import {
  batchParsedEvents,
  batchEvents,
  tryParseContractEvent,
  parseContractEvent,
  type ParsedEvent,
} from '../../src/tools/batch_events.js';

// ---------------------------------------------------------------------------
// Mock Stellar SDK XDR so unit tests run without real XDR bytes
// ---------------------------------------------------------------------------
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    StrKey: {
      ...actual.StrKey,
      encodeContract: vi.fn((buf: Buffer) => `C_${buf.toString('hex')}`),
    },
    xdr: {
      ...actual.xdr,
      DiagnosticEvent: {
        fromXDR: vi.fn(),
      },
      ContractEvent: {
        fromXDR: vi.fn(),
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers to build ParsedEvent fixtures
// ---------------------------------------------------------------------------

function makeEvent(
  contractId: string | null,
  topicsXdr: string[],
  dataXdr: string,
  eventType = 'contract'
): ParsedEvent {
  return { contractId, eventType, topicsXdr, dataXdr };
}

// ---------------------------------------------------------------------------
// batchParsedEvents — pure batching logic
// ---------------------------------------------------------------------------

describe('batchParsedEvents', () => {
  describe('deduplication (deduplicate: true)', () => {
    it('collapses identical events into one entry with occurrence_count > 1', () => {
      const events = [
        makeEvent('CABC', ['topic1'], 'data1'),
        makeEvent('CABC', ['topic1'], 'data1'),
        makeEvent('CABC', ['topic1'], 'data1'),
      ];

      const { unique_count, duplicate_count, batches } = batchParsedEvents(
        events,
        'contract_and_topic',
        true
      );

      expect(unique_count).toBe(1);
      expect(duplicate_count).toBe(2);
      expect(batches).toHaveLength(1);
      expect(batches[0].events[0].occurrence_count).toBe(3);
    });

    it('keeps distinct data payloads as separate entries within the same batch', () => {
      const events = [
        makeEvent('CABC', ['topic1'], 'data1'),
        makeEvent('CABC', ['topic1'], 'data2'),
        makeEvent('CABC', ['topic1'], 'data1'),
      ];

      const { unique_count, duplicate_count, batches } = batchParsedEvents(
        events,
        'contract_and_topic',
        true
      );

      expect(unique_count).toBe(2);
      expect(duplicate_count).toBe(1);
      expect(batches[0].events).toHaveLength(2);
    });
  });

  describe('deduplication off (deduplicate: false)', () => {
    it('retains every event as a separate entry', () => {
      const events = [
        makeEvent('CABC', ['topic1'], 'data1'),
        makeEvent('CABC', ['topic1'], 'data1'),
      ];

      const { unique_count, duplicate_count, batches } = batchParsedEvents(
        events,
        'contract_and_topic',
        false
      );

      expect(unique_count).toBe(2);
      expect(duplicate_count).toBe(0);
      expect(batches[0].events).toHaveLength(2);
      batches[0].events.forEach((e) => expect(e.occurrence_count).toBe(1));
    });
  });

  describe('group_by strategies', () => {
    const mixedEvents = [
      makeEvent('CABC', ['topic1'], 'data1'),
      makeEvent('CXYZ', ['topic1'], 'data2'),
      makeEvent('CABC', ['topic2'], 'data3'),
    ];

    it('groups only by contract ID', () => {
      const { batches } = batchParsedEvents(mixedEvents, 'contract', true);
      // CABC and CXYZ → 2 batches
      expect(batches).toHaveLength(2);
      const abcBatch = batches.find((b) => b.contract_id === 'CABC')!;
      expect(abcBatch.events).toHaveLength(2); // data1 + data3 under same contract
    });

    it('groups only by topic', () => {
      const { batches } = batchParsedEvents(mixedEvents, 'topic', true);
      // topic1 and topic2 → 2 batches
      expect(batches).toHaveLength(2);
      const topic1Batch = batches.find((b) => b.topics_xdr[0] === 'topic1')!;
      expect(topic1Batch.events).toHaveLength(2); // data1 + data2
    });

    it('groups by contract AND topic (default)', () => {
      const { batches } = batchParsedEvents(mixedEvents, 'contract_and_topic', true);
      // CABC+topic1, CXYZ+topic1, CABC+topic2 → 3 batches
      expect(batches).toHaveLength(3);
    });
  });

  describe('total_occurrences', () => {
    it('sums occurrence counts across all entries in a batch', () => {
      const events = [
        makeEvent('CABC', ['t1'], 'd1'),
        makeEvent('CABC', ['t1'], 'd1'),
        makeEvent('CABC', ['t1'], 'd2'),
      ];

      const { batches } = batchParsedEvents(events, 'contract_and_topic', true);
      expect(batches[0].total_occurrences).toBe(3);
    });
  });

  describe('null contractId', () => {
    it('places events with no contract under __no_contract__ key', () => {
      const events = [
        makeEvent(null, ['sys_topic'], 'sys_data'),
        makeEvent(null, ['sys_topic'], 'sys_data'),
      ];

      const { batches, unique_count } = batchParsedEvents(events, 'contract_and_topic', true);

      expect(batches).toHaveLength(1);
      expect(batches[0].contract_id).toBeNull();
      expect(unique_count).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// tryParseContractEvent — XDR parsing (mocked)
// ---------------------------------------------------------------------------

describe('tryParseContractEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when both parsers throw', () => {
    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockImplementation(() => {
      throw new Error('bad XDR');
    });
    vi.mocked(xdr.ContractEvent.fromXDR).mockImplementation(() => {
      throw new Error('bad XDR');
    });

    expect(tryParseContractEvent('not-valid-xdr')).toBeNull();
  });

  it('returns ContractEvent from DiagnosticEvent wrapper', () => {
    const fakeContractEvent = { _tag: 'contractEvent' } as any;
    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockReturnValue({
      event: () => fakeContractEvent,
    } as any);

    const result = tryParseContractEvent('AAAA');
    expect(result).toBe(fakeContractEvent);
  });

  it('falls back to bare ContractEvent when DiagnosticEvent parse fails', () => {
    const fakeContractEvent = { _tag: 'contractEvent' } as any;
    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockImplementation(() => {
      throw new Error('not a diagnostic event');
    });
    vi.mocked(xdr.ContractEvent.fromXDR).mockReturnValue(fakeContractEvent as any);

    const result = tryParseContractEvent('AAAA');
    expect(result).toBe(fakeContractEvent);
  });
});

// ---------------------------------------------------------------------------
// parseContractEvent — field extraction
// ---------------------------------------------------------------------------

describe('parseContractEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('extracts contractId, eventType, topicsXdr, and dataXdr', () => {
    const contractIdBuf = Buffer.from('contractBytes');
    const fakeEvent = {
      contractId: () => contractIdBuf,
      type: () => ({ name: 'contract' }),
      body: () => ({
        v0: () => ({
          topics: () => [{ toXDR: () => 'topic_b64' }],
          data: () => ({ toXDR: () => 'data_b64' }),
        }),
      }),
    } as any;

    vi.mocked(StrKey.encodeContract).mockReturnValue('CCONTRACTSTRKEY');

    const result = parseContractEvent(fakeEvent);

    expect(result.contractId).toBe('CCONTRACTSTRKEY');
    expect(result.eventType).toBe('contract');
    expect(result.topicsXdr).toEqual(['topic_b64']);
    expect(result.dataXdr).toBe('data_b64');
  });

  it('returns null contractId when contractId() returns null', () => {
    const fakeEvent = {
      contractId: () => null,
      type: () => ({ name: 'system' }),
      body: () => ({
        v0: () => ({
          topics: () => [],
          data: () => ({ toXDR: () => '' }),
        }),
      }),
    } as any;

    const result = parseContractEvent(fakeEvent);
    expect(result.contractId).toBeNull();
  });

  it('falls back to hex when StrKey.encodeContract throws', () => {
    const contractIdBuf = Buffer.from([0xde, 0xad]);
    const fakeEvent = {
      contractId: () => contractIdBuf,
      type: () => ({ name: 'contract' }),
      body: () => ({
        v0: () => ({
          topics: () => [],
          data: () => ({ toXDR: () => '' }),
        }),
      }),
    } as any;

    vi.mocked(StrKey.encodeContract).mockImplementation(() => {
      throw new Error('encode failed');
    });

    const result = parseContractEvent(fakeEvent);
    expect(result.contractId).toBe('dead');
  });
});

// ---------------------------------------------------------------------------
// batchEvents — public handler (mocks XDR layer)
// ---------------------------------------------------------------------------

describe('batchEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMockEvent(contractIdBuf: Buffer | null, topicsXdr: string[], dataXdr: string) {
    const fakeContractEvent = {
      contractId: () => contractIdBuf,
      type: () => ({ name: 'contract' }),
      body: () => ({
        v0: () => ({
          topics: () => topicsXdr.map((t) => ({ toXDR: () => t })),
          data: () => ({ toXDR: () => dataXdr }),
        }),
      }),
    } as any;

    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockImplementation(() => {
      throw new Error('not diagnostic');
    });
    vi.mocked(xdr.ContractEvent.fromXDR).mockReturnValue(fakeContractEvent);
    vi.mocked(StrKey.encodeContract).mockReturnValue('CMOCKEDCONTRACT');
  }

  it('returns status ok with correct counts for a simple deduplicated batch', () => {
    setupMockEvent(Buffer.from('id'), ['t1'], 'd1');

    const result = batchEvents({
      events: ['XDR1', 'XDR1'],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.status).toBe('ok');
    expect(result.original_count).toBe(2);
    expect(result.unique_count).toBe(1);
    expect(result.duplicate_count).toBe(1);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].events[0].occurrence_count).toBe(2);
  });

  it('populates audit_log with strategy and deduplicate flag', () => {
    setupMockEvent(Buffer.from('id'), ['t1'], 'd1');

    const result = batchEvents({
      events: ['XDR1'],
      group_by: 'contract',
      deduplicate: false,
    });

    expect(result.audit_log.group_strategy).toBe('contract');
    expect(result.audit_log.deduplicated).toBe(false);
    expect(result.audit_log.processed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('records unprocessed entries for unparseable XDR without throwing', () => {
    // First call returns a valid event, second is unparseable
    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockImplementation(() => {
      throw new Error('not diagnostic');
    });
    vi.mocked(xdr.ContractEvent.fromXDR)
      .mockReturnValueOnce({
        contractId: () => null,
        type: () => ({ name: 'contract' }),
        body: () => ({
          v0: () => ({
            topics: () => [],
            data: () => ({ toXDR: () => 'd1' }),
          }),
        }),
      } as any)
      .mockImplementationOnce(() => {
        throw new Error('bad XDR');
      });

    const result = batchEvents({
      events: ['VALID_XDR', 'INVALID_XDR'],
      group_by: 'contract_and_topic',
      deduplicate: true,
    });

    expect(result.original_count).toBe(2);
    expect(result.unprocessed).toHaveLength(1);
    expect(result.unprocessed[0].index).toBe(1);
  });

  it('throws PulsarValidationError when ALL events are unparseable', () => {
    vi.mocked(xdr.DiagnosticEvent.fromXDR).mockImplementation(() => {
      throw new Error('bad');
    });
    vi.mocked(xdr.ContractEvent.fromXDR).mockImplementation(() => {
      throw new Error('bad');
    });

    let caught: unknown;
    try {
      batchEvents({ events: ['BAD1', 'BAD2'], group_by: 'contract_and_topic', deduplicate: true });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as any).code).toBe('VALIDATION_ERROR');
    expect((caught as any).message).toMatch(/None of the provided events/);
  });

  it('validates input via schema — rejects empty events array', async () => {
    const { BatchEventsInputSchema } = await import('../../src/schemas/tools.js');
    const result = BatchEventsInputSchema.safeParse({ events: [] });
    expect(result.success).toBe(false);
  });
});

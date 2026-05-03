import { xdr, StrKey } from '@stellar/stellar-sdk';

import { BatchEventsInput } from '../schemas/tools.js';
import { PulsarValidationError } from '../errors.js';
import logger from '../logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedEvent {
  contractId: string | null;
  eventType: string;
  topicsXdr: string[];
  dataXdr: string;
}

export interface BatchedEntry {
  data_xdr: string;
  occurrence_count: number;
}

export interface EventBatch {
  contract_id: string | null;
  event_type: string;
  topics_xdr: string[];
  events: BatchedEntry[];
  total_occurrences: number;
}

export interface BatchEventsOutput {
  status: 'ok';
  original_count: number;
  unique_count: number;
  duplicate_count: number;
  batches: EventBatch[];
  unprocessed: Array<{ index: number; reason: string }>;
  audit_log: {
    deduplicated: boolean;
    group_strategy: string;
    processed_at: string;
  };
}

type GroupStrategy = 'contract' | 'topic' | 'contract_and_topic';

// ---------------------------------------------------------------------------
// XDR parsing
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a ContractEvent from a base64 XDR string.
 * Tries DiagnosticEvent first (returned by simulateTransaction),
 * then falls back to bare ContractEvent (returned by submitTransaction).
 */
export function tryParseContractEvent(eventXdr: string): xdr.ContractEvent | null {
  try {
    const diagEvent = xdr.DiagnosticEvent.fromXDR(eventXdr, 'base64');
    return diagEvent.event();
  } catch {
    // not a DiagnosticEvent — try bare ContractEvent
  }

  try {
    return xdr.ContractEvent.fromXDR(eventXdr, 'base64');
  } catch {
    // unparseable
  }

  return null;
}

/**
 * Convert a raw ContractEvent into a flat, serialisable ParsedEvent.
 */
export function parseContractEvent(contractEvent: xdr.ContractEvent): ParsedEvent {
  const contractIdBytes = contractEvent.contractId();
  let contractId: string | null = null;
  if (contractIdBytes) {
    try {
      contractId = StrKey.encodeContract(contractIdBytes);
    } catch {
      contractId = contractIdBytes.toString('hex');
    }
  }

  const eventType = contractEvent.type().name;

  // body().v0() holds topics + data
  const v0 = contractEvent.body().v0();
  const topicsXdr = v0.topics().map((t) => t.toXDR('base64'));
  const dataXdr = v0.data().toXDR('base64');

  return { contractId, eventType, topicsXdr, dataXdr };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function batchKey(parsed: ParsedEvent, strategy: GroupStrategy): string {
  switch (strategy) {
    case 'contract':
      return parsed.contractId ?? '__no_contract__';
    case 'topic':
      return parsed.topicsXdr.join('|') || '__no_topics__';
    case 'contract_and_topic':
    default:
      return `${parsed.contractId ?? '__no_contract__'}::${parsed.topicsXdr.join('|') || '__no_topics__'}`;
  }
}

// ---------------------------------------------------------------------------
// Core batching — accepts pre-parsed events (testable without real XDR)
// ---------------------------------------------------------------------------

export function batchParsedEvents(
  parsed: ParsedEvent[],
  strategy: GroupStrategy,
  deduplicate: boolean
): Pick<BatchEventsOutput, 'unique_count' | 'duplicate_count' | 'batches'> {
  type BatchAccumulator = {
    contractId: string | null;
    eventType: string;
    topicsXdr: string[];
    dataMap: Map<string, { dataXdr: string; count: number }>;
  };

  const batchMap = new Map<string, BatchAccumulator>();
  let dedupeCounter = 0;

  for (const event of parsed) {
    const key = batchKey(event, strategy);

    if (!batchMap.has(key)) {
      batchMap.set(key, {
        contractId: event.contractId,
        eventType: event.eventType,
        topicsXdr: event.topicsXdr,
        dataMap: new Map(),
      });
    }

    const batch = batchMap.get(key)!;
    // When deduplication is off, make every entry unique with a monotonic suffix
    const dataKey = deduplicate ? event.dataXdr : `${event.dataXdr}__${dedupeCounter++}`;

    if (batch.dataMap.has(dataKey)) {
      batch.dataMap.get(dataKey)!.count++;
    } else {
      batch.dataMap.set(dataKey, { dataXdr: event.dataXdr, count: 1 });
    }
  }

  let uniqueCount = 0;
  let duplicateCount = 0;

  const batches: EventBatch[] = Array.from(batchMap.values()).map((b) => {
    const entries: BatchedEntry[] = Array.from(b.dataMap.values()).map((d) => {
      uniqueCount++;
      duplicateCount += d.count - 1;
      return { data_xdr: d.dataXdr, occurrence_count: d.count };
    });

    return {
      contract_id: b.contractId,
      event_type: b.eventType,
      topics_xdr: b.topicsXdr,
      events: entries,
      total_occurrences: entries.reduce((s, e) => s + e.occurrence_count, 0),
    };
  });

  return { unique_count: uniqueCount, duplicate_count: duplicateCount, batches };
}

// ---------------------------------------------------------------------------
// Public tool handler
// ---------------------------------------------------------------------------

export function batchEvents(input: BatchEventsInput): BatchEventsOutput {
  const strategy = input.group_by ?? 'contract_and_topic';
  const deduplicate = input.deduplicate ?? true;
  const processedAt = new Date().toISOString();

  const parsed: ParsedEvent[] = [];
  const unprocessed: BatchEventsOutput['unprocessed'] = [];

  for (let i = 0; i < input.events.length; i++) {
    const eventXdr = input.events[i];
    const contractEvent = tryParseContractEvent(eventXdr);

    if (!contractEvent) {
      logger.warn({ index: i }, 'batch_events: could not parse event XDR, skipping');
      unprocessed.push({
        index: i,
        reason: 'Could not parse as ContractEvent or DiagnosticEvent XDR',
      });
      continue;
    }

    try {
      parsed.push(parseContractEvent(contractEvent));
    } catch (err) {
      logger.warn(
        { index: i, error: (err as Error).message },
        'batch_events: error extracting event fields'
      );
      unprocessed.push({
        index: i,
        reason: `Failed to extract event fields: ${(err as Error).message}`,
      });
    }
  }

  if (parsed.length === 0 && input.events.length > 0) {
    throw new PulsarValidationError(
      'None of the provided events could be parsed as valid Soroban ContractEvent or DiagnosticEvent XDR.',
      { unprocessed }
    );
  }

  const { unique_count, duplicate_count, batches } = batchParsedEvents(
    parsed,
    strategy,
    deduplicate
  );

  return {
    status: 'ok',
    original_count: input.events.length,
    unique_count,
    duplicate_count,
    batches,
    unprocessed,
    audit_log: {
      deduplicated: deduplicate,
      group_strategy: strategy,
      processed_at: processedAt,
    },
  };
}

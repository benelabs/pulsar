import { scValToNative } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import { ObserveBridgeEventsInputSchema } from '../schemas/tools.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export interface ObserveBridgeEventsOutput {
  network: string;
  latest_ledger: number;
  events: Array<{
    id: string;
    type: string;
    ledger: number;
    ledger_closed_at: string;
    paging_token: string;
    in_successful_contract_call: boolean;
    tx_hash: string;
    contract_id?: string;
    topic_raw: string[];
    topic_native: any[];
    value_raw: string;
    value_native: any;
  }>;
}

function safeScValToNative(value: unknown) {
  try {
    return scValToNative(value as any);
  } catch (err: unknown) {
    return `Failed to decode SCVal: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function serializeEvent(event: any) {
  const topicRaw = Array.isArray(event.topic)
    ? event.topic.map((topic: any) => topic.toXDR('base64'))
    : [];

  return {
    id: event.id,
    type: event.type,
    ledger: event.ledger,
    ledger_closed_at: event.ledgerClosedAt,
    paging_token: event.pagingToken,
    in_successful_contract_call: event.inSuccessfulContractCall,
    tx_hash: event.txHash,
    ...(event.contractId ? { contract_id: String(event.contractId) } : {}),
    topic_raw: topicRaw,
    topic_native: topicRaw.map((_: string, index: number) => safeScValToNative(event.topic[index])),
    value_raw: event.value.toXDR('base64'),
    value_native: safeScValToNative(event.value),
  };
}

export const observeBridgeEvents: McpToolHandler<typeof ObserveBridgeEventsInputSchema> = async (
  input: unknown
) => {
  const parsed = ObserveBridgeEventsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError(
      'Invalid input for observe_bridge_events',
      parsed.error.format()
    );
  }

  const { contract_id, event_type, topic_filters, start_ledger, cursor, limit, network } =
    parsed.data;

  const server = getSorobanServer(network ?? config.stellarNetwork);

  const filter: {
    type?: string;
    contractIds?: string[];
    topics?: string[][];
  } = {};

  if (contract_id) filter.contractIds = [contract_id];
  if (event_type) filter.type = event_type;
  if (topic_filters) filter.topics = topic_filters;

  const request: Record<string, unknown> = {
    filters: Object.keys(filter).length ? [filter] : [],
  };

  if (typeof start_ledger === 'number') {
    request.startLedger = start_ledger;
  }

  if (cursor) {
    request.cursor = cursor;
  }

  if (typeof limit === 'number') {
    request.limit = limit;
  }

  try {
    const response = await server.getEvents(request as any);

    return {
      network: network ?? config.stellarNetwork,
      latest_ledger: response.latestLedger,
      events: response.events.map(serializeEvent),
    };
  } catch (err: unknown) {
    throw new PulsarNetworkError('Failed to fetch bridge events from Soroban RPC', {
      originalError: err,
    });
  }
};

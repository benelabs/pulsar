import { SorobanRpc, scValToNative } from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { GetContractEventsInputSchema } from "../schemas/tools.js";
import { getSorobanServer } from "../services/soroban-rpc.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ContractEvent {
  id: string;
  type: string;
  ledger: number;
  ledger_closed_at: string;
  contract_id: string;
  tx_hash: string;
  in_successful_contract_call: boolean;
  topics: string[];
  topics_decoded: unknown[];
  value: string;
  value_decoded: unknown;
  paging_token: string;
}

export interface GetContractEventsOutput {
  events: ContractEvent[];
  batch_size: number;
  has_more: boolean;
  next_cursor: string | null;
  latest_ledger: number;
  contracts_queried: string[];
  start_ledger: number | null;
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export const getContractEvents: McpToolHandler<
  typeof GetContractEventsInputSchema
> = async (input: unknown) => {
  const parsed = GetContractEventsInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError(
      "Invalid input for get_contract_events",
      parsed.error.format()
    );
  }

  const { contract_ids, start_ledger, event_type, topics, limit, cursor, network } = parsed.data;
  const net = network ?? config.stellarNetwork;
  const server = getSorobanServer(net);

  // Require either start_ledger (first page) or cursor (subsequent pages)
  if (!start_ledger && !cursor) {
    throw new PulsarValidationError(
      "Either start_ledger or cursor must be provided",
      { hint: "Pass start_ledger for the first page; use next_cursor from the previous response for subsequent pages" }
    );
  }

  // Build a single batched filter covering all contract_ids together.
  // Soroban RPC accepts up to 5 contractIds in one filter, so we batch
  // all requested contracts into one request instead of N separate calls.
  const filter: SorobanRpc.Api.EventFilter = {
    type: event_type === "all" ? undefined : (event_type as SorobanRpc.Api.EventType),
    contractIds: contract_ids,
    ...(topics ? { topics } : {}),
  };

  const requestParams: SorobanRpc.Server.GetEventsRequest = {
    filters: [filter],
    pagination: { limit },
    ...(cursor ? { pagination: { cursor, limit } } : {}),
    ...(start_ledger && !cursor ? { startLedger: start_ledger } : {}),
  };

  let response: SorobanRpc.Api.GetEventsResponse;
  try {
    response = await server.getEvents(requestParams);
  } catch (err: any) {
    throw new PulsarNetworkError(
      err.message || "Failed to fetch contract events from Soroban RPC",
      { originalError: err, network: net, contract_ids }
    );
  }

  // Deduplicate by event ID — a single event can match multiple filter
  // criteria if broad topic matchers are used; we emit it exactly once.
  const seen = new Set<string>();
  const events: ContractEvent[] = [];

  for (const raw of response.events) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);

    events.push(decodeEvent(raw));
  }

  const next_cursor = events.length > 0
    ? events[events.length - 1].paging_token
    : null;

  const result: GetContractEventsOutput = {
    events,
    batch_size: events.length,
    has_more: events.length === limit,
    next_cursor,
    latest_ledger: response.latestLedger,
    contracts_queried: contract_ids,
    start_ledger: start_ledger ?? null,
  };

  return result;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodeEvent(raw: SorobanRpc.Api.EventResponse): ContractEvent {
  // Decode topics: XDR ScVal → base64 string for transport, plus native JS
  const topics = raw.topic.map((t) => t.toXDR("base64"));
  const topics_decoded = raw.topic.map((t) => {
    try { return scValToNative(t); } catch { return null; }
  });

  // Decode value
  const value = raw.value.toXDR("base64");
  let value_decoded: unknown = null;
  try { value_decoded = scValToNative(raw.value); } catch { /* leave null */ }

  return {
    id: raw.id,
    type: raw.type,
    ledger: raw.ledger,
    ledger_closed_at: raw.ledgerClosedAt,
    contract_id: raw.contractId,
    tx_hash: raw.txHash,
    in_successful_contract_call: raw.inSuccessfulContractCall,
    topics,
    topics_decoded,
    value,
    value_decoded,
    paging_token: raw.pagingToken,
  };
}

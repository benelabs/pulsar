/**
 * Tool: analyze_contract_storage  (Issue #180)
 *
 * Analyses a Soroban contract's on-chain ledger storage footprint and
 * returns per-entry metrics together with actionable optimisation
 * recommendations that reduce ledger-rent costs for large datasets.
 *
 * Soroban storage primer
 * ──────────────────────
 * Every piece of state a contract writes lives as a ledger entry whose
 * rent is proportional to its byte size × TTL.  Three durability tiers:
 *
 *   • instance   – loaded on every call; cheapest per-byte but billed always
 *   • persistent – survives indefinitely while rent is paid; moderate cost
 *   • temporary  – expires after a short TTL; cheapest for ephemeral data
 *
 * Large maps stored in instance storage are the most common source of
 * runaway ledger costs because:
 *   1. The whole instance entry is read on every call.
 *   2. A map with N keys encodes as O(N × key_size + N × value_size) bytes.
 *
 * This tool identifies those hot spots and suggests concrete refactors.
 */

import { z } from 'zod';
import { Contract, xdr } from '@stellar/stellar-sdk';

import { ContractIdSchema, NetworkSchema } from '../schemas/index.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import { config } from '../config.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import type { McpResult } from '../types.js';
import logger from '../logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default byte threshold above which a ledger entry is flagged as oversized. */
export const DEFAULT_SIZE_THRESHOLD_BYTES = 1_024;

/**
 * Soroban ledger storage rent constants (approximate – see CAP-0046).
 * Used only for the illustrative fee estimate in the summary.
 */
const BYTES_PER_RENT_UNIT = 1_024;
const RENT_FEE_STROOPS_PER_UNIT_PER_100_LEDGERS = 10;

/**
 * ~17 280 ledgers per day (5-second average close time).
 * Used to convert ledger counts into human-readable day estimates.
 */
const LEDGERS_PER_DAY = 17_280;

// ─── Schemas ─────────────────────────────────────────────────────────────────

/**
 * Schema for analyze_contract_storage tool.
 *
 * Inputs:
 * - contract_id           Soroban contract address (C…, required)
 * - network               Optional network override
 * - additional_keys       Up to 50 extra base64 XDR ledger keys to include
 * - size_threshold_bytes  Entries larger than this are flagged (default: 1 024)
 * - include_recommendations  Whether to include the recommendations array (default: true)
 */
export const AnalyzeContractStorageInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  additional_keys: z
    .array(z.string().min(1, { message: 'Ledger key XDR cannot be empty' }))
    .max(50, { message: 'Cannot analyze more than 50 additional keys per call' })
    .optional()
    .describe('Optional base64-encoded XDR ledger keys to include alongside the instance entry'),
  size_threshold_bytes: z
    .number()
    .int()
    .positive({ message: 'size_threshold_bytes must be a positive integer' })
    .default(DEFAULT_SIZE_THRESHOLD_BYTES)
    .describe(
      `Entries larger than this (in bytes) are flagged as oversized (default: ${DEFAULT_SIZE_THRESHOLD_BYTES})`
    ),
  include_recommendations: z
    .boolean()
    .default(true)
    .describe('Include optimization recommendations in the response (default: true)'),
});

export type AnalyzeContractStorageInput = z.infer<typeof AnalyzeContractStorageInputSchema>;

// ─── Output types ─────────────────────────────────────────────────────────────

export interface StorageEntryMetrics {
  /** Base64-encoded XDR of the ledger key. */
  key_xdr: string;
  /** Discriminant name of the ledger entry type, e.g. "contractData". */
  key_type: string;
  /** Byte length of the full serialised ledger entry value. */
  value_size_bytes: number;
  /** Ledger sequence at which the entry expires, or null if unknown. */
  live_until_ledger: number | null;
  /** Ledger sequence when the entry was last written, or null if unknown. */
  last_modified_ledger: number | null;
  /** True when value_size_bytes > size_threshold_bytes. */
  is_oversized: boolean;
  /** Soroban storage durability tier. */
  storage_type: 'instance' | 'persistent' | 'temporary' | 'unknown';
  /** For map-valued entries: number of top-level map keys. */
  top_level_map_keys?: number;
  /** For map-valued entries: count of nested maps discovered recursively. */
  nested_maps?: number;
}

export interface StorageOptimizationRecommendation {
  /** Impact severity of not acting on this recommendation. */
  severity: 'high' | 'medium' | 'low';
  /** Optimisation category. */
  category: 'chunking' | 'ttl' | 'storage_type' | 'deduplication';
  /** Human-readable recommendation. */
  message: string;
  /** Truncated key XDR identifying the affected entry (for context). */
  affected_key?: string;
}

export interface AnalyzeContractStorageOutput {
  contract_id: string;
  network: string;
  latest_ledger: number;
  entries: StorageEntryMetrics[];
  summary: {
    total_entries: number;
    total_size_bytes: number;
    oversized_entries: number;
    instance_entries: number;
    persistent_entries: number;
    temporary_entries: number;
    /** Rough estimate — uses CAP-0046 constants, not a live fee quote. */
    estimated_rent_fee_100_ledgers_stroops: number;
  };
  recommendations: StorageOptimizationRecommendation[];
}

// ─── Helpers (exported for unit testing) ─────────────────────────────────────

/**
 * Builds the LedgerKey for a contract's instance storage entry.
 * Instance storage is always Persistent durability.
 */
export function buildContractInstanceKey(contractId: string): xdr.LedgerKey {
  const contract = new Contract(contractId);
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contract.address().toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
}

/**
 * Maps a ContractDataDurability discriminant to a storage-type label.
 * Instance entries are identified by the caller (not by durability alone).
 */
export function durabilityToStorageType(
  durability: xdr.ContractDataDurability
): 'persistent' | 'temporary' | 'unknown' {
  try {
    const name = durability.name;
    if (name === 'persistent') return 'persistent';
    if (name === 'temporary') return 'temporary';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Recursively inspects an ScVal for map structure.
 *
 * Handles two cases:
 *  - scvMap          – a direct key/value map stored as persistent/temporary data
 *  - scvContractInstance – the instance storage wrapper; its .storage() is the map
 *
 * Returns:
 *  - topLevelKeys: number of keys at the outermost map level (0 if not a map)
 *  - nestedMaps:   count of additional maps found at any depth inside the value
 */
export function analyzeScValMaps(val: xdr.ScVal): { topLevelKeys: number; nestedMaps: number } {
  try {
    const typeName = val.switch().name;

    if (typeName === 'scvMap') {
      const mapEntries = (val.map() as xdr.ScMapEntry[] | null) ?? [];
      let nestedMaps = 0;
      for (const entry of mapEntries) {
        const inner = analyzeScValMaps(entry.val());
        if (inner.topLevelKeys > 0) nestedMaps += 1 + inner.nestedMaps;
        else nestedMaps += inner.nestedMaps;
      }
      return { topLevelKeys: mapEntries.length, nestedMaps };
    }

    if (typeName === 'scvContractInstance') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const instance = (val as any).instance?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storage: any[] = (instance as any)?.storage?.() ?? [];
      let nestedMaps = 0;
      for (const entry of storage) {
        const inner = analyzeScValMaps(entry.val());
        if (inner.topLevelKeys > 0) nestedMaps += 1 + inner.nestedMaps;
        else nestedMaps += inner.nestedMaps;
      }
      return { topLevelKeys: storage.length, nestedMaps };
    }

    return { topLevelKeys: 0, nestedMaps: 0 };
  } catch {
    return { topLevelKeys: 0, nestedMaps: 0 };
  }
}

/**
 * Analyses a single raw ledger entry and returns StorageEntryMetrics.
 */
export function analyzeLedgerEntry(
  entry: {
    key: xdr.LedgerKey;
    val: xdr.LedgerEntry;
    liveUntilLedgerSeq?: number;
    lastModifiedLedgerSeq?: number;
  },
  sizeThresholdBytes: number,
  isInstance: boolean
): StorageEntryMetrics {
  const keyXdr = entry.key.toXDR('base64');
  const valBytes: Buffer = entry.val.toXDR();
  const valueSizeBytes = valBytes.length;

  let keyType = 'unknown';
  let storageType: StorageEntryMetrics['storage_type'] = 'unknown';
  let topLevelMapKeys: number | undefined;
  let nestedMaps: number | undefined;

  try {
    keyType = entry.key.switch().name;

    if (keyType === 'contractData') {
      const cd = entry.key.contractData();
      storageType = isInstance ? 'instance' : durabilityToStorageType(cd.durability());

      // Inspect the stored value for map structure
      const storedVal = entry.val.data().contractData().val();
      const mapInfo = analyzeScValMaps(storedVal);
      if (mapInfo.topLevelKeys > 0) {
        topLevelMapKeys = mapInfo.topLevelKeys;
        nestedMaps = mapInfo.nestedMaps;
      }
    }
  } catch (err) {
    logger.debug({ err }, 'analyze_contract_storage: partial entry analysis failed');
  }

  return {
    key_xdr: keyXdr,
    key_type: keyType,
    value_size_bytes: valueSizeBytes,
    live_until_ledger: entry.liveUntilLedgerSeq ?? null,
    last_modified_ledger: entry.lastModifiedLedgerSeq ?? null,
    is_oversized: valueSizeBytes > sizeThresholdBytes,
    storage_type: storageType,
    ...(topLevelMapKeys !== undefined ? { top_level_map_keys: topLevelMapKeys } : {}),
    ...(nestedMaps !== undefined ? { nested_maps: nestedMaps } : {}),
  };
}

/**
 * Generates optimisation recommendations from a set of analysed entries.
 */
export function generateRecommendations(
  entries: StorageEntryMetrics[],
  latestLedger: number,
  sizeThresholdBytes: number
): StorageOptimizationRecommendation[] {
  const recs: StorageOptimizationRecommendation[] = [];
  const truncateKey = (k: string) => (k.length > 60 ? k.substring(0, 57) + '...' : k);

  for (const entry of entries) {
    // ── Oversized entry → recommend chunked / paginated storage ─────────────
    if (entry.is_oversized) {
      recs.push({
        severity: entry.value_size_bytes > sizeThresholdBytes * 4 ? 'high' : 'medium',
        category: 'chunking',
        message:
          `Entry is ${entry.value_size_bytes.toLocaleString()} bytes ` +
          `(threshold: ${sizeThresholdBytes.toLocaleString()} bytes). ` +
          `Consider splitting large maps into paginated chunks stored under ` +
          `indexed keys (e.g. DATA_PAGE_0, DATA_PAGE_1) with a separate ` +
          `MAP_SIZE counter entry to reduce per-entry ledger rent.`,
        affected_key: truncateKey(entry.key_xdr),
      });
    }

    // ── Many map keys → recommend pagination ────────────────────────────────
    if (entry.top_level_map_keys !== undefined && entry.top_level_map_keys > 50) {
      recs.push({
        severity: entry.top_level_map_keys > 500 ? 'high' : 'medium',
        category: 'chunking',
        message:
          `Map contains ${entry.top_level_map_keys.toLocaleString()} top-level keys. ` +
          `Large maps increase per-entry ledger rent proportional to entry size. ` +
          `Adopt a paginated persistent storage pattern: store each page as a ` +
          `separate ledger entry keyed by e.g. \`Symbol("map_page_${0}")\` and ` +
          `maintain a \`Symbol("map_len")\` counter for O(1) size queries.`,
        affected_key: truncateKey(entry.key_xdr),
      });
    }

    // ── Expiry warning for non-temporary entries ─────────────────────────────
    if (entry.live_until_ledger !== null && entry.storage_type !== 'temporary') {
      const ledgersLeft = entry.live_until_ledger - latestLedger;
      if (ledgersLeft < 100_000) {
        recs.push({
          severity: ledgersLeft < 10_000 ? 'high' : 'low',
          category: 'ttl',
          message:
            `Entry expires in ${ledgersLeft.toLocaleString()} ledgers ` +
            `(~${Math.round(ledgersLeft / LEDGERS_PER_DAY)} days). ` +
            `Submit an \`extendFootprintTtl\` operation before expiry to avoid data ` +
            `loss, or bump TTL proactively inside contract logic using ` +
            `\`env.storage().extend_ttl(key, threshold, extend_to)\`.`,
          affected_key: truncateKey(entry.key_xdr),
        });
      }
    }

    // ── Persistent entry with short remaining TTL → suggest temporary ────────
    if (
      entry.storage_type === 'persistent' &&
      entry.live_until_ledger !== null &&
      entry.live_until_ledger - latestLedger < 200_000
    ) {
      const daysLeft = Math.round((entry.live_until_ledger - latestLedger) / LEDGERS_PER_DAY);
      recs.push({
        severity: 'low',
        category: 'storage_type',
        message:
          `Persistent entry has a relatively short TTL (~${daysLeft} days). ` +
          `If this data is short-lived (e.g. swap reserves, session tokens, ` +
          `nonces), consider \`Env::storage().temporary()\` instead of persistent ` +
          `storage to significantly cut rent costs — temporary entries are ` +
          `auto-expired without requiring explicit TTL-bump transactions.`,
        affected_key: truncateKey(entry.key_xdr),
      });
    }
  }

  // ── Instance storage is large → recommend moving data to persistent ────────
  const instanceEntry = entries.find((e) => e.storage_type === 'instance');
  if (instanceEntry && instanceEntry.value_size_bytes > 512) {
    recs.push({
      severity: 'medium',
      category: 'storage_type',
      message:
        `Contract instance storage is ${instanceEntry.value_size_bytes.toLocaleString()} bytes. ` +
        `Instance storage is loaded on every contract invocation regardless of ` +
        `which function is called. Move infrequently accessed data (large maps, ` +
        `historical records, configuration blobs) from \`storage().instance()\` ` +
        `to \`storage().persistent()\` to reduce per-call overhead and rent.`,
      affected_key: truncateKey(instanceEntry.key_xdr),
    });
  }

  return recs;
}

// ─── Tool handler ─────────────────────────────────────────────────────────────

/**
 * Analyses a Soroban contract's on-chain storage footprint.
 *
 * Always fetches the contract instance entry.  Optionally fetches
 * additional ledger entries supplied as base64 XDR keys.
 *
 * Returns per-entry metrics and actionable recommendations to reduce
 * ledger rent costs for large maps and datasets.
 */
export async function analyzeContractStorage(
  input: AnalyzeContractStorageInput
): Promise<McpResult> {
  const network = input.network ?? config.stellarNetwork;
  const server = getSorobanServer(network);

  logger.info(
    { contractId: input.contract_id, network },
    'analyze_contract_storage: starting analysis'
  );

  // ── Build the set of ledger keys to fetch ──────────────────────────────────
  const instanceKey = buildContractInstanceKey(input.contract_id);
  const keysToFetch: xdr.LedgerKey[] = [instanceKey];

  if (input.additional_keys?.length) {
    const seen = new Set<string>();
    for (const raw of input.additional_keys) {
      let parsed: xdr.LedgerKey;
      try {
        parsed = xdr.LedgerKey.fromXDR(raw, 'base64');
      } catch (err) {
        throw new PulsarValidationError(`Invalid ledger key XDR: "${raw.substring(0, 40)}…"`, {
          originalError: (err as Error).message,
        });
      }
      const canonical = parsed.toXDR('base64');
      if (!seen.has(canonical)) {
        seen.add(canonical);
        keysToFetch.push(parsed);
      }
    }
  }

  // ── Fetch entries from the RPC node ───────────────────────────────────────
  let rpcResponse: Awaited<ReturnType<typeof server.getLedgerEntries>>;
  try {
    rpcResponse = await server.getLedgerEntries(...keysToFetch);
  } catch (err) {
    throw new PulsarNetworkError(
      `Failed to fetch ledger entries for ${input.contract_id}: ${(err as Error).message}`,
      { contractId: input.contract_id, network }
    );
  }

  const instanceKeyXdr = instanceKey.toXDR('base64');
  const latestLedger = rpcResponse.latestLedger;

  // ── Analyse each returned entry ───────────────────────────────────────────
  const analysedEntries: StorageEntryMetrics[] = [];
  for (const entry of rpcResponse.entries) {
    const entryKeyXdr = entry.key.toXDR('base64');
    const isInstance = entryKeyXdr === instanceKeyXdr;
    const metrics = analyzeLedgerEntry(entry, input.size_threshold_bytes, isInstance);
    analysedEntries.push(metrics);
  }

  // ── Build summary ─────────────────────────────────────────────────────────
  const totalSizeBytes = analysedEntries.reduce((acc, e) => acc + e.value_size_bytes, 0);
  const summary = {
    total_entries: analysedEntries.length,
    total_size_bytes: totalSizeBytes,
    oversized_entries: analysedEntries.filter((e) => e.is_oversized).length,
    instance_entries: analysedEntries.filter((e) => e.storage_type === 'instance').length,
    persistent_entries: analysedEntries.filter((e) => e.storage_type === 'persistent').length,
    temporary_entries: analysedEntries.filter((e) => e.storage_type === 'temporary').length,
    estimated_rent_fee_100_ledgers_stroops: Math.ceil(
      (totalSizeBytes / BYTES_PER_RENT_UNIT) * RENT_FEE_STROOPS_PER_UNIT_PER_100_LEDGERS * 100
    ),
  };

  // ── Generate recommendations ──────────────────────────────────────────────
  const recommendations = input.include_recommendations
    ? generateRecommendations(analysedEntries, latestLedger, input.size_threshold_bytes)
    : [];

  const output: AnalyzeContractStorageOutput = {
    contract_id: input.contract_id,
    network,
    latest_ledger: latestLedger,
    entries: analysedEntries,
    summary,
    recommendations,
  };

  logger.info(
    {
      contractId: input.contract_id,
      totalEntries: summary.total_entries,
      totalBytes: totalSizeBytes,
      oversizedEntries: summary.oversized_entries,
      recommendationCount: recommendations.length,
    },
    'analyze_contract_storage: analysis complete'
  );

  return output as unknown as McpResult;
}

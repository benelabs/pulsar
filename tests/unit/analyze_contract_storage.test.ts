/**
 * Unit tests for analyze_contract_storage tool (Issue #180).
 *
 * Coverage targets:
 *  - AnalyzeContractStorageInputSchema  (all valid/invalid paths)
 *  - durabilityToStorageType            (all durability values)
 *  - analyzeScValMaps                   (scvMap, scvContractInstance, scalar, error)
 *  - analyzeLedgerEntry                 (instance, persistent, temporary, non-contractData)
 *  - generateRecommendations            (each recommendation category)
 *  - analyzeContractStorage handler     (happy path, additional keys, network error,
 *                                        invalid key XDR, no recommendations)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

import {
  AnalyzeContractStorageInputSchema,
  analyzeContractStorage,
  durabilityToStorageType,
  analyzeScValMaps,
  analyzeLedgerEntry,
  generateRecommendations,
  DEFAULT_SIZE_THRESHOLD_BYTES,
  type AnalyzeContractStorageOutput,
} from '../../src/tools/analyze_contract_storage.js';
import { getSorobanServer } from '../../src/services/soroban-rpc.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Mock the soroban-rpc service so no real network calls are made.
vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
}));

// Partially mock the Stellar SDK so we can control Contract / xdr behaviour.
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual: Record<string, unknown> = (await importOriginal()) as Record<string, unknown>;
  class MockContract {
    constructor(_contractId: string) {}
    address() {
      return {
        toScAddress: () => 'mock_sc_address',
      };
    }
  }
  return {
    ...actual,
    Contract: MockContract,
  };
});

// ─── Test constants ───────────────────────────────────────────────────────────

const VALID_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

// ─── Helpers: mock ledger entry builders ─────────────────────────────────────

/**
 * Creates a mock ledger entry object shaped like what SorobanRpc returns.
 * We use plain objects with `as unknown as` casts because we are testing
 * business logic, not XDR serialisation.
 */
function makeMockEntry(opts: {
  keyXdr?: string;
  sizeBytes?: number;
  durabilityName?: 'persistent' | 'temporary';
  keyTypeName?: string;
  liveUntilLedgerSeq?: number;
  lastModifiedLedgerSeq?: number;
  storedValTypeName?: string;
  mapKeyCount?: number;
}) {
  const {
    keyXdr = 'bW9ja19rZXlfYmFzZTY0', // "mock_key_base64"
    sizeBytes = 256,
    durabilityName = 'persistent',
    keyTypeName = 'contractData',
    liveUntilLedgerSeq,
    lastModifiedLedgerSeq,
    storedValTypeName = 'scvI64',
    mapKeyCount = 0,
  } = opts;

  // Build a minimal ScVal mock for the stored value
  const buildMapEntries = (count: number) =>
    Array.from({ length: count }, (_v, _i) => ({
      val: () => ({
        switch: () => ({ name: 'scvI64' }),
      }),
    }));

  const storedVal =
    storedValTypeName === 'scvMap'
      ? {
          switch: () => ({ name: 'scvMap' }),
          map: () => buildMapEntries(mapKeyCount),
        }
      : storedValTypeName === 'scvContractInstance'
        ? {
            switch: () => ({ name: 'scvContractInstance' }),
            instance: () => ({
              storage: () => buildMapEntries(mapKeyCount),
            }),
          }
        : {
            switch: () => ({ name: storedValTypeName }),
          };

  return {
    key: {
      toXDR: (_format: string) => keyXdr,
      switch: () => ({ name: keyTypeName }),
      contractData: () => ({
        durability: () => ({ name: durabilityName }),
      }),
    },
    val: {
      toXDR: () => Buffer.alloc(sizeBytes),
      data: () => ({
        contractData: () => ({
          val: () => storedVal,
        }),
      }),
    },
    liveUntilLedgerSeq,
    lastModifiedLedgerSeq,
  };
}

type MockEntry = ReturnType<typeof makeMockEntry>;

// ─── Schema validation ────────────────────────────────────────────────────────

describe('AnalyzeContractStorageInputSchema', () => {
  it('accepts minimal valid input (contract_id only)', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({ contract_id: VALID_CONTRACT_ID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.size_threshold_bytes).toBe(DEFAULT_SIZE_THRESHOLD_BYTES);
      expect(r.data.include_recommendations).toBe(true);
      expect(r.data.additional_keys).toBeUndefined();
    }
  });

  it('accepts all optional fields', () => {
    const input = {
      contract_id: VALID_CONTRACT_ID,
      network: 'testnet',
      additional_keys: ['AAAA'],
      size_threshold_bytes: 2048,
      include_recommendations: false,
    };
    const r = AnalyzeContractStorageInputSchema.safeParse(input);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.network).toBe('testnet');
      expect(r.data.size_threshold_bytes).toBe(2048);
      expect(r.data.include_recommendations).toBe(false);
    }
  });

  it('accepts all valid networks', () => {
    for (const network of ['mainnet', 'testnet', 'futurenet', 'custom']) {
      const r = AnalyzeContractStorageInputSchema.safeParse({
        contract_id: VALID_CONTRACT_ID,
        network,
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejects missing contract_id', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({ network: 'testnet' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid contract_id (does not start with C)', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid network', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      network: 'devnet',
    });
    expect(r.success).toBe(false);
  });

  it('rejects size_threshold_bytes of zero', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 0,
    });
    expect(r.success).toBe(false);
  });

  it('rejects size_threshold_bytes that is non-integer', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 512.5,
    });
    expect(r.success).toBe(false);
  });

  it('rejects more than 50 additional_keys', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      additional_keys: Array.from({ length: 51 }, () => 'AAAA'),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain('50');
    }
  });

  it('rejects empty string in additional_keys', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      additional_keys: [''],
    });
    expect(r.success).toBe(false);
  });

  it('accepts exactly 50 additional_keys', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      additional_keys: Array.from({ length: 50 }, () => 'AAAA'),
    });
    expect(r.success).toBe(true);
  });

  it('rejects include_recommendations as a non-boolean', () => {
    const r = AnalyzeContractStorageInputSchema.safeParse({
      contract_id: VALID_CONTRACT_ID,
      include_recommendations: 'yes',
    });
    expect(r.success).toBe(false);
  });
});

// ─── durabilityToStorageType ─────────────────────────────────────────────────

describe('durabilityToStorageType', () => {
  it('returns persistent for persistent durability', () => {
    const durability = { name: 'persistent' } as unknown as xdr.ContractDataDurability;
    expect(durabilityToStorageType(durability)).toBe('persistent');
  });

  it('returns temporary for temporary durability', () => {
    const durability = { name: 'temporary' } as unknown as xdr.ContractDataDurability;
    expect(durabilityToStorageType(durability)).toBe('temporary');
  });

  it('returns unknown for unrecognised durability name', () => {
    const durability = { name: 'exotic' } as unknown as xdr.ContractDataDurability;
    expect(durabilityToStorageType(durability)).toBe('unknown');
  });

  it('returns unknown when .name throws', () => {
    const durability = {
      get name(): never {
        throw new Error('no name');
      },
    } as unknown as xdr.ContractDataDurability;
    expect(durabilityToStorageType(durability)).toBe('unknown');
  });
});

// ─── analyzeScValMaps ─────────────────────────────────────────────────────────

describe('analyzeScValMaps', () => {
  it('returns zero counts for a scalar value', () => {
    const val = { switch: () => ({ name: 'scvI64' }) } as unknown as xdr.ScVal;
    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 0, nestedMaps: 0 });
  });

  it('counts top-level keys in a flat scvMap', () => {
    const entries = Array.from({ length: 10 }, () => ({
      val: () => ({ switch: () => ({ name: 'scvI64' }) }),
    }));
    const val = {
      switch: () => ({ name: 'scvMap' }),
      map: () => entries,
    } as unknown as xdr.ScVal;
    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 10, nestedMaps: 0 });
  });

  it('counts nested maps recursively', () => {
    const innerMapEntries = Array.from({ length: 5 }, () => ({
      val: () => ({ switch: () => ({ name: 'scvI64' }) }),
    }));
    const innerMap = {
      switch: () => ({ name: 'scvMap' }),
      map: () => innerMapEntries,
    };
    const outerEntries = [
      { val: () => innerMap },
      { val: () => ({ switch: () => ({ name: 'scvString' }) }) },
      { val: () => ({ switch: () => ({ name: 'scvBool' }) }) },
    ];
    const outerMap = {
      switch: () => ({ name: 'scvMap' }),
      map: () => outerEntries,
    } as unknown as xdr.ScVal;

    const result = analyzeScValMaps(outerMap);
    expect(result.topLevelKeys).toBe(3);
    expect(result.nestedMaps).toBe(1);
  });

  it('handles scvContractInstance with a storage map', () => {
    const storageEntries = Array.from({ length: 7 }, () => ({
      val: () => ({ switch: () => ({ name: 'scvI64' }) }),
    }));
    const val = {
      switch: () => ({ name: 'scvContractInstance' }),
      instance: () => ({
        storage: () => storageEntries,
      }),
    } as unknown as xdr.ScVal;

    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 7, nestedMaps: 0 });
  });

  it('handles scvContractInstance with no storage (null)', () => {
    const val = {
      switch: () => ({ name: 'scvContractInstance' }),
      instance: () => ({ storage: () => null }),
    } as unknown as xdr.ScVal;

    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 0, nestedMaps: 0 });
  });

  it('handles scvMap with null map() gracefully', () => {
    const val = {
      switch: () => ({ name: 'scvMap' }),
      map: () => null,
    } as unknown as xdr.ScVal;
    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 0, nestedMaps: 0 });
  });

  it('returns zeros when switch() throws', () => {
    const val = {
      get switch() {
        throw new Error('xdr error');
      },
    } as unknown as xdr.ScVal;
    expect(analyzeScValMaps(val)).toEqual({ topLevelKeys: 0, nestedMaps: 0 });
  });
});

// ─── analyzeLedgerEntry ───────────────────────────────────────────────────────

describe('analyzeLedgerEntry', () => {
  it('marks an instance entry correctly', () => {
    const entry = makeMockEntry({ sizeBytes: 512, durabilityName: 'persistent' });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      true
    );
    expect(metrics.storage_type).toBe('instance');
    expect(metrics.value_size_bytes).toBe(512);
    expect(metrics.is_oversized).toBe(false);
  });

  it('marks an oversized entry (above threshold)', () => {
    const entry = makeMockEntry({ sizeBytes: 2048 });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.is_oversized).toBe(true);
    expect(metrics.value_size_bytes).toBe(2048);
  });

  it('marks a persistent entry via durability', () => {
    const entry = makeMockEntry({ durabilityName: 'persistent' });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.storage_type).toBe('persistent');
  });

  it('marks a temporary entry via durability', () => {
    const entry = makeMockEntry({ durabilityName: 'temporary' });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.storage_type).toBe('temporary');
  });

  it('captures liveUntilLedgerSeq and lastModifiedLedgerSeq', () => {
    const entry = makeMockEntry({
      liveUntilLedgerSeq: 5_000_000,
      lastModifiedLedgerSeq: 4_000_000,
    });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.live_until_ledger).toBe(5_000_000);
    expect(metrics.last_modified_ledger).toBe(4_000_000);
  });

  it('returns null for missing TTL fields', () => {
    const entry = makeMockEntry({});
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.live_until_ledger).toBeNull();
    expect(metrics.last_modified_ledger).toBeNull();
  });

  it('detects top-level map keys in scvMap value', () => {
    const entry = makeMockEntry({ storedValTypeName: 'scvMap', mapKeyCount: 30 });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.top_level_map_keys).toBe(30);
    expect(metrics.nested_maps).toBe(0);
  });

  it('detects map keys in scvContractInstance value', () => {
    const entry = makeMockEntry({ storedValTypeName: 'scvContractInstance', mapKeyCount: 12 });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      true
    );
    expect(metrics.top_level_map_keys).toBe(12);
  });

  it('omits map fields when value is not a map', () => {
    const entry = makeMockEntry({ storedValTypeName: 'scvI64' });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.top_level_map_keys).toBeUndefined();
    expect(metrics.nested_maps).toBeUndefined();
  });

  it('sets key_type to unknown when switch() throws', () => {
    const entry: MockEntry = {
      ...makeMockEntry({}),
      key: {
        toXDR: (_f: string) => 'abc',
        switch: () => {
          throw new Error('xdr error');
        },
        contractData: () => ({ durability: () => ({ name: 'persistent' as const }) }),
      },
    };
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.key_type).toBe('unknown');
    expect(metrics.storage_type).toBe('unknown');
  });

  it('uses key_type from non-contractData entry without crashing', () => {
    const entry = makeMockEntry({ keyTypeName: 'account' });
    const metrics = analyzeLedgerEntry(
      entry as unknown as Parameters<typeof analyzeLedgerEntry>[0],
      1024,
      false
    );
    expect(metrics.key_type).toBe('account');
    expect(metrics.storage_type).toBe('unknown');
  });
});

// ─── generateRecommendations ─────────────────────────────────────────────────

describe('generateRecommendations', () => {
  const latestLedger = 1_000_000;

  it('returns no recommendations for a healthy small entry', () => {
    const entries = [
      {
        key_xdr: 'key1',
        key_type: 'contractData',
        value_size_bytes: 200,
        live_until_ledger: 2_000_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'instance' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    expect(recs).toHaveLength(0);
  });

  it('generates a medium-severity chunking recommendation for oversized entry', () => {
    const entries = [
      {
        key_xdr: 'key_oversized',
        key_type: 'contractData',
        value_size_bytes: 2000,
        live_until_ledger: null,
        last_modified_ledger: null,
        is_oversized: true,
        storage_type: 'persistent' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const chunking = recs.filter((r) => r.category === 'chunking');
    expect(chunking.length).toBeGreaterThanOrEqual(1);
    expect(chunking[0].severity).toBe('medium');
  });

  it('generates a high-severity chunking recommendation for very large entry (4x threshold)', () => {
    const entries = [
      {
        key_xdr: 'key_huge',
        key_type: 'contractData',
        value_size_bytes: 5000,
        live_until_ledger: null,
        last_modified_ledger: null,
        is_oversized: true,
        storage_type: 'persistent' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const chunking = recs.filter((r) => r.category === 'chunking' && r.severity === 'high');
    expect(chunking.length).toBeGreaterThanOrEqual(1);
  });

  it('generates a map pagination recommendation when top_level_map_keys > 50', () => {
    const entries = [
      {
        key_xdr: 'key_bigmap',
        key_type: 'contractData',
        value_size_bytes: 800,
        live_until_ledger: null,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'persistent' as const,
        top_level_map_keys: 100,
        nested_maps: 0,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const pagination = recs.filter(
      (r) => r.category === 'chunking' && r.message.includes('paginated')
    );
    expect(pagination.length).toBeGreaterThanOrEqual(1);
    expect(pagination[0].severity).toBe('medium');
  });

  it('generates a high-severity map pagination recommendation for > 500 keys', () => {
    const entries = [
      {
        key_xdr: 'key_massivemap',
        key_type: 'contractData',
        value_size_bytes: 800,
        live_until_ledger: null,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'persistent' as const,
        top_level_map_keys: 600,
        nested_maps: 0,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const highPag = recs.filter((r) => r.category === 'chunking' && r.severity === 'high');
    expect(highPag.length).toBeGreaterThanOrEqual(1);
  });

  it('generates a high-severity TTL warning when < 10 000 ledgers remain', () => {
    const entries = [
      {
        key_xdr: 'key_expiring_soon',
        key_type: 'contractData',
        value_size_bytes: 200,
        live_until_ledger: latestLedger + 5_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'persistent' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const ttl = recs.filter((r) => r.category === 'ttl' && r.severity === 'high');
    expect(ttl.length).toBeGreaterThanOrEqual(1);
  });

  it('generates a low-severity TTL warning when 10 000-100 000 ledgers remain', () => {
    const entries = [
      {
        key_xdr: 'key_expiring_medium',
        key_type: 'contractData',
        value_size_bytes: 200,
        live_until_ledger: latestLedger + 50_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'persistent' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const ttl = recs.filter((r) => r.category === 'ttl' && r.severity === 'low');
    expect(ttl.length).toBeGreaterThanOrEqual(1);
  });

  it('does not generate a TTL warning for temporary entries', () => {
    const entries = [
      {
        key_xdr: 'key_temp',
        key_type: 'contractData',
        value_size_bytes: 200,
        live_until_ledger: latestLedger + 1_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'temporary' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    expect(recs.filter((r) => r.category === 'ttl')).toHaveLength(0);
  });

  it('generates a storage_type recommendation for persistent entry with short TTL', () => {
    const entries = [
      {
        key_xdr: 'key_short_persist',
        key_type: 'contractData',
        value_size_bytes: 200,
        live_until_ledger: latestLedger + 100_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'persistent' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    expect(recs.filter((r) => r.category === 'storage_type').length).toBeGreaterThanOrEqual(1);
  });

  it('generates an instance storage recommendation when instance entry > 512 bytes', () => {
    const entries = [
      {
        key_xdr: 'key_instance',
        key_type: 'contractData',
        value_size_bytes: 700,
        live_until_ledger: 5_000_000,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'instance' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    const instanceRecs = recs.filter(
      (r) => r.category === 'storage_type' && r.message.includes('instance storage')
    );
    expect(instanceRecs.length).toBeGreaterThanOrEqual(1);
    expect(instanceRecs[0].severity).toBe('medium');
  });

  it('does not generate instance recommendation when instance entry <= 512 bytes', () => {
    const entries = [
      {
        key_xdr: 'key_instance_small',
        key_type: 'contractData',
        value_size_bytes: 100,
        live_until_ledger: null,
        last_modified_ledger: null,
        is_oversized: false,
        storage_type: 'instance' as const,
      },
    ];
    const recs = generateRecommendations(entries, latestLedger, 1024);
    expect(
      recs.filter((r) => r.category === 'storage_type' && r.message.includes('instance storage'))
    ).toHaveLength(0);
  });

  it('returns empty array when entries list is empty', () => {
    expect(generateRecommendations([], latestLedger, 1024)).toEqual([]);
  });
});

// ─── analyzeContractStorage handler ──────────────────────────────────────────

describe('analyzeContractStorage', () => {
  let mockServer: { getLedgerEntries: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = { getLedgerEntries: vi.fn() };
    vi.mocked(getSorobanServer).mockReturnValue(
      mockServer as unknown as ReturnType<typeof getSorobanServer>
    );

    const mockInstanceKey = {
      toXDR: (_fmt: string) => 'instance_key_xdr_base64==',
    };
    vi.spyOn(xdr.LedgerKey, 'contractData').mockReturnValue(
      mockInstanceKey as unknown as ReturnType<typeof xdr.LedgerKey.contractData>
    );
    vi.spyOn(xdr.ScVal, 'scvLedgerKeyContractInstance').mockReturnValue(
      {} as unknown as ReturnType<typeof xdr.ScVal.scvLedgerKeyContractInstance>
    );
    vi.spyOn(xdr.ContractDataDurability, 'persistent').mockReturnValue(
      {} as unknown as ReturnType<typeof xdr.ContractDataDurability.persistent>
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns analysis for a healthy contract with one instance entry', async () => {
    const entry = makeMockEntry({
      keyXdr: 'instance_key_xdr_base64==',
      sizeBytes: 400,
      durabilityName: 'persistent',
    });
    mockServer.getLedgerEntries.mockResolvedValue({
      entries: [entry],
      latestLedger: 1_000_000,
    });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: true,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.contract_id).toBe(VALID_CONTRACT_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].storage_type).toBe('instance');
    expect(result.entries[0].value_size_bytes).toBe(400);
    expect(result.summary.total_entries).toBe(1);
    expect(result.summary.total_size_bytes).toBe(400);
    expect(result.summary.oversized_entries).toBe(0);
    expect(result.summary.instance_entries).toBe(1);
  });

  it('returns empty entries array when contract has no stored entries', async () => {
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 900_000 });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: true,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.entries).toHaveLength(0);
    expect(result.summary.total_entries).toBe(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('suppresses recommendations when include_recommendations is false', async () => {
    const entry = makeMockEntry({ sizeBytes: 5000 });
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [entry], latestLedger: 1_000_000 });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: false,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.recommendations).toEqual([]);
  });

  it('uses the default network from config when none supplied', async () => {
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: false,
    });

    expect(getSorobanServer).toHaveBeenCalledTimes(1);
  });

  it('deduplicates additional_keys with same canonical XDR', async () => {
    const canonicalKey = 'Y2Fub25pY2FsX2tleQ==';
    const mockParsedKey = { toXDR: (_fmt: string) => canonicalKey };
    vi.spyOn(xdr.LedgerKey, 'fromXDR').mockReturnValue(
      mockParsedKey as unknown as ReturnType<typeof xdr.LedgerKey.fromXDR>
    );
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      additional_keys: [canonicalKey, canonicalKey],
      size_threshold_bytes: 1024,
      include_recommendations: false,
    });

    expect(mockServer.getLedgerEntries.mock.calls[0].length).toBe(2);
  });

  it('includes additional keys in the fetch batch', async () => {
    const extraKeyXdr = 'ZXh0cmFfa2V5';
    const mockParsedKey = { toXDR: (_fmt: string) => extraKeyXdr };
    vi.spyOn(xdr.LedgerKey, 'fromXDR').mockReturnValue(
      mockParsedKey as unknown as ReturnType<typeof xdr.LedgerKey.fromXDR>
    );
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      additional_keys: [extraKeyXdr],
      size_threshold_bytes: 1024,
      include_recommendations: false,
    });

    expect(mockServer.getLedgerEntries.mock.calls[0].length).toBe(2);
  });

  it('throws PulsarValidationError for an invalid XDR key', async () => {
    vi.spyOn(xdr.LedgerKey, 'fromXDR').mockImplementation(() => {
      throw new Error('bad XDR');
    });

    await expect(
      analyzeContractStorage({
        contract_id: VALID_CONTRACT_ID,
        additional_keys: ['!!!invalid!!!'],
        size_threshold_bytes: 1024,
        include_recommendations: false,
      })
    ).rejects.toMatchObject({ name: 'PulsarValidationError' });
  });

  it('throws PulsarNetworkError when getLedgerEntries rejects', async () => {
    mockServer.getLedgerEntries.mockRejectedValue(new Error('RPC unavailable'));

    await expect(
      analyzeContractStorage({
        contract_id: VALID_CONTRACT_ID,
        size_threshold_bytes: 1024,
        include_recommendations: false,
      })
    ).rejects.toMatchObject({ name: 'PulsarNetworkError' });
  });

  it('includes the estimated_rent_fee in the summary', async () => {
    const entry = makeMockEntry({ sizeBytes: 1024 });
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [entry], latestLedger: 1_000_000 });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: false,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.summary.estimated_rent_fee_100_ledgers_stroops).toBeGreaterThan(0);
  });

  it('correctly counts persistent and temporary entries in summary', async () => {
    const persistentEntry = makeMockEntry({
      keyXdr: 'persistent_key',
      sizeBytes: 200,
      durabilityName: 'persistent',
    });
    const temporaryEntry = makeMockEntry({
      keyXdr: 'temporary_key',
      sizeBytes: 100,
      durabilityName: 'temporary',
    });
    mockServer.getLedgerEntries.mockResolvedValue({
      entries: [persistentEntry, temporaryEntry],
      latestLedger: 1_000_000,
    });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: false,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.summary.instance_entries).toBe(0);
    expect(result.summary.persistent_entries).toBe(1);
    expect(result.summary.temporary_entries).toBe(1);
  });

  it('sets the latest_ledger from the RPC response', async () => {
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 7_654_321 });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      size_threshold_bytes: 1024,
      include_recommendations: false,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.latest_ledger).toBe(7_654_321);
  });

  it('reports the network in the output', async () => {
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });

    const result = (await analyzeContractStorage({
      contract_id: VALID_CONTRACT_ID,
      network: 'mainnet',
      size_threshold_bytes: 1024,
      include_recommendations: false,
    })) as unknown as AnalyzeContractStorageOutput;

    expect(result.network).toBe('mainnet');
  });
});

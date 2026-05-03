import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getNetworkParams } from '../../src/tools/get_network_params.js';
import { getSorobanServer } from '../../src/services/soroban-rpc.js';

// Mock the services
vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
  getRpcUrl: vi.fn((network?: string) => {
    const urls: Record<string, string> = {
      mainnet: 'https://soroban-rpc.stellar.org',
      testnet: 'https://soroban-testnet.stellar.org',
      futurenet: 'https://rpc-futurenet.stellar.org',
    };
    return urls[network || 'testnet'];
  }),
}));

describe('getNetworkParams', () => {
  let mockServer: {
    getLatestLedger: ReturnType<typeof vi.fn>;
    getNetwork: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getLatestLedger: vi.fn(),
      getNetwork: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getSorobanServer).mockReturnValue(mockServer as any);
  });

  it('returns network parameters successfully', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
      resourceLeasing: {
        cpuCostPerInstruction: {
          cpuIns: 100,
          memBytes: 1000,
          readEntry: 50,
          writeEntry: 100,
          createEntry: 150,
          txnData: 200,
        },
      },
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({ network: 'testnet' });

    expect(result.network).toBe('testnet');
    expect(result.ledger_sequence).toBe(12345);
    expect(result.protocol_version).toBe('20');
    expect(result.resource_weights).toBeDefined();
    expect(result.resource_weights.cpu_instructions).toBe('100');
    expect(result.resource_weights.memory_bytes).toBe('1000');
    expect(result.resource_weights.ledger_entry_read).toBe('50');
    expect(result.resource_weights.ledger_entry_write).toBe('100');
    expect(result.resource_weights.ledger_entry_create).toBe('150');
    expect(result.resource_weights.transmit_bytes).toBe('200');
    expect(result.fee_thresholds).toBeDefined();
    expect(result.fee_thresholds.min_resource_fee).toBe('100');
    expect(result.fee_thresholds.max_cpu_instructions).toBe('100000000');
    expect(result.inflation_params).toBeDefined();
    expect(result.inflation_params.base_reserve).toBe('500000000');
    expect(result.inflation_params.base_fee).toBe('100');
    expect(result.network_passphrase).toBe('Test SDF Network ; September 2015');
  });

  it('returns network parameters with default values when fields are missing', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({ network: 'testnet' });

    expect(result.resource_weights).toBeDefined();
    // Resource weights use defaults when missing from ledger
    expect(result.resource_weights.cpu_instructions).toBe('100');
    expect(result.fee_thresholds).toBeDefined();
    expect(result.inflation_params).toBeDefined();
  });

  it('uses mainnet passphrase for mainnet', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({ network: 'mainnet' });

    expect(result.network_passphrase).toBe('Public Global Stellar Network ; September 2015');
  });

  it('uses futurenet passphrase for futurenet', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({ network: 'futurenet' });

    expect(result.network_passphrase).toBe('Test SDF Future Network ; October 2022');
  });

  it('throws PulsarNetworkError when latest ledger is null', async () => {
    mockServer.getLatestLedger.mockResolvedValue(null);

    await expect(getNetworkParams({ network: 'testnet' })).rejects.toThrow(
      /Failed to retrieve latest ledger/
    );
  });

  it('throws PulsarNetworkError when RPC call fails', async () => {
    const error = new Error('Connection timeout');
    mockServer.getLatestLedger.mockRejectedValue(error);

    await expect(getNetworkParams({ network: 'testnet' })).rejects.toThrow(/Connection timeout/);
  });

  it('includes inflation parameters with default values', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({});

    expect(result.inflation_params.inflation_rate).toBe(1.0);
    expect(result.inflation_params.base_reserve).toBe('500000000');
    expect(result.inflation_params.base_fee).toBe('100');
  });

  it('includes fee thresholds with expected structure', async () => {
    const mockLedger = {
      sequence: 12345,
      protocolVersion: 20,
    };

    const mockNetwork = {
      baseReserve: '500000000',
      baseFee: '100',
    };

    mockServer.getLatestLedger.mockResolvedValue(mockLedger);
    mockServer.getNetwork.mockResolvedValue(mockNetwork);

    const result = await getNetworkParams({});

    expect(result.fee_thresholds.min_resource_fee).toBeDefined();
    expect(result.fee_thresholds.max_cpu_instructions).toBeDefined();
    expect(result.fee_thresholds.max_memory_bytes).toBeDefined();
    expect(result.fee_thresholds.ledger_entry_limits).toBeDefined();
    expect(result.fee_thresholds.ledger_entry_limits.max_read_bytes).toBeDefined();
    expect(result.fee_thresholds.ledger_entry_limits.max_write_bytes).toBeDefined();
    expect(result.fee_thresholds.ledger_entry_limits.max_create_bytes).toBeDefined();
  });
});

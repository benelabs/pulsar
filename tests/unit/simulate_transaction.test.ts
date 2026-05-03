import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SorobanRpc, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

import { simulateTransaction } from '../../src/tools/simulate_transaction.js';

// Mock the services
vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    TransactionBuilder: {
      fromXDR: vi.fn().mockReturnValue({
        hash: () => Buffer.from('dummy-hash'),
      }),
    },
  };
});

import { getSorobanServer } from '../../src/services/soroban-rpc.js';

// Dummy XDR for a transaction - using a valid-ish one if possible, or just a string if mocked
const DUMMY_XDR =
  'AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9AAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

describe('simulateTransaction', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      simulateTransaction: vi.fn(),
    };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer);
  });

  it('handles a successful simulation', async () => {
    const mockResult = {
      cost: { cpuIns: '123', memBytes: '456' },
      minResourceFee: '100',
      result: {
        retval: xdr.ScVal.scvVoid(),
      },
      transactionData: {
        build: () => ({
          resources: () => ({
            footprint: () => ({
              readOnly: () => [],
              readWrite: () => [],
            }),
          }),
        }),
      },
      events: [],
    };

    mockServer.simulateTransaction.mockResolvedValue(mockResult);
    // @ts-expect-error - legacy mock usage
    vi.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(true);

    const result = await simulateTransaction({ xdr: DUMMY_XDR });

    expect(result.status).toBe('SUCCESS');
    expect(result.cost.cpu_instructions).toBe('123');
    expect(result.min_resource_fee).toBe('100');
    expect(result.return_value_native).toBe(null); // scvVoid translates to null
  });

  it('handles a simulation error (contract panic)', async () => {
    const mockResult = {
      error: 'Contract panicked',
      events: [],
    };

    mockServer.simulateTransaction.mockResolvedValue(mockResult);
    // @ts-expect-error - legacy mock usage
    vi.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(false);
    // @ts-expect-error - legacy mock usage
    vi.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(true);

    const result = await simulateTransaction({ xdr: DUMMY_XDR });

    expect(result.status).toBe('ERROR');
    expect(result.error).toBe('Contract panicked');
  });

  it('handles a restore needed result', async () => {
    const mockResult = {
      // structure doesn't matter much if we mock the helper
    };

    mockServer.simulateTransaction.mockResolvedValue(mockResult);
    // @ts-expect-error - legacy mock usage
    vi.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(false);
    // @ts-expect-error - legacy mock usage
    vi.spyOn(SorobanRpc.Api, 'isSimulationError').mockReturnValue(false);
    // @ts-expect-error - legacy mock usage
    (SorobanRpc.Api as any).isSimulationRestore = vi.fn().mockReturnValue(true);

    const result = await simulateTransaction({ xdr: DUMMY_XDR });

    expect(result.status).toBe('RESTORE_NEEDED');
    expect(result.restore_needed).toBe(true);
    expect(result.error).toContain('ledger entry restoration');
  });

  it('throws when XDR is invalid', async () => {
    vi.mocked(TransactionBuilder.fromXDR).mockImplementationOnce(() => {
      throw new Error('invalid');
    });
    await expect(simulateTransaction({ xdr: 'invalid-xdr' })).rejects.toThrow(
      /Failed to parse XDR/
    );
  });
});

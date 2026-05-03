import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SorobanRpc, xdr } from '@stellar/stellar-sdk';

import { getTokenTransferFee } from '../../src/tools/get_token_transfer_fee.js';
import { getSorobanServer } from '../../src/services/soroban-rpc.js';

// Mock the services
vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
  getRpcUrl: vi.fn(),
}));

// Mock Contract and Address
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Address: {
      fromString: vi.fn().mockImplementation((_str: string) => {
        return {
          toScVal: () => actual.xdr.ScVal.scvSymbol('address'),
          toScAddress: () =>
            actual.xdr.ScAddress.scAddressTypeAccount(actual.Keypair.random().xdrPublicKey()),
        };
      }),
    },
    Contract: class {
      call = vi.fn().mockReturnValue({
        setTimeout: vi.fn().mockReturnThis(),
        build: vi.fn().mockReturnValue({
          toXDR: () => 'dummy-xdr',
        }),
      });
    },
    Account: class {
      public accountId: string;
      public sequence: string;
      constructor(accountId: string, sequence: string) {
        this.accountId = accountId;
        this.sequence = sequence;
      }
      sequenceNumber() {
        return this.sequence;
      }
    },
    TransactionBuilder: class {
      addOperation = vi.fn().mockReturnThis();
      setTimeout = vi.fn().mockReturnThis();
      build = vi.fn().mockReturnValue({
        toXDR: () => 'dummy-xdr',
      });
    },
  };
});

describe('getTokenTransferFee', () => {
  let mockServer: any;
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const from = 'GAAMU6CHLADGK2Z32PB6Y7B7F6Y7F6Y7F6Y7F6Y7F6Y7F6Y7F6Y7F6Y7';
  const to = 'GBBAA777777777777777777777777777777777777777777777777777';

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      simulateTransaction: vi.fn(),
      getLedgerEntries: vi.fn().mockResolvedValue({ entries: [] }),
    };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer);
  });

  it('calculates fee when Transfer event amount is less than requested', async () => {
    const amount = '1000';

    const mockResult = {
      events: [
        {
          contractId: () => contractId,
          topic: () => [
            xdr.ScVal.scvSymbol('Transfer'),
            xdr.ScVal.scvString(from),
            xdr.ScVal.scvString(to),
          ],
          value: () =>
            xdr.ScVal.scvI128(
              new xdr.Int128Parts({ hi: xdr.Int64.fromLowBits(0), lo: xdr.Uint64.fromLowBits(950) })
            ),
          toXDR: () => 'dummy-xdr',
        },
      ],
    };

    mockServer.simulateTransaction.mockResolvedValue(mockResult);
    // @ts-expect-error Mocking SDK helper
    vi.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(true);

    const result = await getTokenTransferFee({
      contract_id: contractId,
      amount,
      from,
      to,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.actual_received_amount).toBe('950');
    expect(result.fee_amount).toBe('50');
  });

  it('handles explicit Fee events', async () => {
    const amount = '1000';

    const mockResult = {
      events: [
        {
          contractId: () => contractId,
          topic: () => [
            xdr.ScVal.scvSymbol('Transfer'),
            xdr.ScVal.scvString(from),
            xdr.ScVal.scvString(to),
          ],
          value: () =>
            xdr.ScVal.scvI128(
              new xdr.Int128Parts({
                hi: xdr.Int64.fromLowBits(0),
                lo: xdr.Uint64.fromLowBits(1000),
              })
            ),
          toXDR: () => 'dummy-xdr',
        },
        {
          contractId: () => contractId,
          topic: () => [xdr.ScVal.scvSymbol('Fee'), xdr.ScVal.scvString(from)],
          value: () =>
            xdr.ScVal.scvI128(
              new xdr.Int128Parts({ hi: xdr.Int64.fromLowBits(0), lo: xdr.Uint64.fromLowBits(20) })
            ),
          toXDR: () => 'dummy-xdr',
        },
      ],
    };

    mockServer.simulateTransaction.mockResolvedValue(mockResult);
    // @ts-expect-error Mocking SDK helper
    vi.spyOn(SorobanRpc.Api, 'isSimulationSuccess').mockReturnValue(true);

    const result = await getTokenTransferFee({
      contract_id: contractId,
      amount,
      from,
      to,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.fee_amount).toBe('20');
  });
});

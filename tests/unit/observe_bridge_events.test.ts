import { describe, it, expect, vi, beforeEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

import { observeBridgeEvents } from '../../src/tools/observe_bridge_events.js';
import { getSorobanServer } from '../../src/services/soroban-rpc.js';

vi.mock('../../src/services/soroban-rpc.js', () => ({
  getSorobanServer: vi.fn(),
}));

const VALID_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('observeBridgeEvents', () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getEvents: vi.fn(),
    };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer);
  });

  it('returns decoded bridge events when the RPC response is valid', async () => {
    const mockEvent = {
      id: 'event-1',
      type: 'contract',
      ledger: 12345,
      ledgerClosedAt: '2026-01-01T00:00:00Z',
      pagingToken: '12345-1',
      inSuccessfulContractCall: true,
      txHash: 'abcd1234',
      contractId: VALID_CONTRACT_ID,
      topic: [xdr.ScVal.scvSymbol('bridge_event')],
      value: xdr.ScVal.scvU32(42),
    };

    mockServer.getEvents.mockResolvedValue({
      latestLedger: 12345,
      events: [mockEvent],
    });

    const result = (await observeBridgeEvents({
      contract_id: VALID_CONTRACT_ID,
      limit: 5,
      network: 'testnet',
    })) as {
      latest_ledger: number;
      events: Array<Record<string, unknown>>;
    };

    expect(result.latest_ledger).toBe(12345);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: 'event-1',
      type: 'contract',
      ledger: 12345,
      contract_id: VALID_CONTRACT_ID,
      value_native: 42,
    });
    expect(result.events[0].topic_raw).toHaveLength(1);
    expect(result.events[0].topic_native).toEqual(['bridge_event']);
  });

  it('rejects invalid inputs when required fields are malformed', async () => {
    await expect(
      observeBridgeEvents({
        contract_id: 'INVALID',
        limit: 5,
      })
    ).rejects.toThrow('Invalid input for observe_bridge_events');
  });

  it('passes query arguments through to Soroban RPC with startLedger and cursor', async () => {
    mockServer.getEvents.mockResolvedValue({ latestLedger: 1, events: [] });

    await observeBridgeEvents({
      contract_id: VALID_CONTRACT_ID,
      start_ledger: 100,
      cursor: '5',
      limit: 10,
    });

    expect(mockServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          {
            contractIds: [VALID_CONTRACT_ID],
          },
        ],
        startLedger: 100,
        cursor: '5',
        limit: 10,
      })
    );
  });
});

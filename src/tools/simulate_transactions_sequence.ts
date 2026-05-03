import { SimulateTransactionsSequenceInput } from '../schemas/tools.js';

import { simulateTransaction, SimulateTransactionOutput } from './simulate_transaction.js';

export async function simulateTransactionsSequence(
  input: SimulateTransactionsSequenceInput
): Promise<SimulateTransactionOutput[]> {
  const results: SimulateTransactionOutput[] = [];

  for (const xdr of input.xdrs) {
    try {
      const result = await simulateTransaction({
        xdr,
        network: input.network,
      });
      results.push(result);
    } catch (error) {
      results.push({
        status: 'ERROR',
        cost: {
          cpu_instructions: '0',
          memory_bytes: '0',
        },
        footprint: {
          read_only: [],
          read_write: [],
        },
        min_resource_fee: '0',
        events: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

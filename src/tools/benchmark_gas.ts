import { performance } from 'perf_hooks';

import { simulateTransaction } from '../tools/simulate_transaction.js';
import logger from '../logger.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param contractId - The contract to benchmark
 * @param method - The contract method to invoke
 * @param args - Arguments for the contract method
 * @param account - The account executing the contract
 */
export async function benchmarkGas({
  contractId,
  method,
  args = [],
  account,
}: {
  contractId: string;
  method: string;
  args?: any[];
  account: string;
}) {
  logger.info('Starting gas benchmarking...');
  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error;
  try {
    simulationResult = await simulateTransaction({ contractId, method, args, account } as any);
  } catch (e) {
    error = e;
    logger.error(e, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  let pulsarGas = (simulationResult as any)?.gas ?? null;
  logger.info(
    {
      cpuMs,
      memDelta,
      pulsarGas,
      error,
    },
    'Benchmark complete'
  );
  return {
    cpuMs,
    memDelta,
    pulsarGas,
    error,
    simulationResult,
  };
}

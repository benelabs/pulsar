import { performance } from 'perf_hooks';

import { simulateTransaction } from '../tools/simulate_transaction.js';
import logger from '../logger.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param xdr - The transaction XDR
 * @param network - The network to use
 */
export async function benchmarkGas({
  xdr,
  network,
}: {
  xdr: string;
  network?: 'mainnet' | 'testnet' | 'futurenet' | 'custom';
}) {
  logger.info('Starting gas benchmarking...');
  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error;
  try {
    simulationResult = await simulateTransaction({ xdr, network });
  } catch (e) {
    error = e;
    logger.error({ err: e }, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  let pulsarGas = simulationResult?.cost ?? null;
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

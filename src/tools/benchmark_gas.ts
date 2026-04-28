import { performance } from 'node:perf_hooks';

import logger from '../logger.js';
import { simulateTransaction } from '../tools/simulate_transaction.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param xdr - Base64 transaction envelope XDR to simulate
 * @param network - Optional Stellar network override
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
    logger.error({ error: e }, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  const pulsarGas = simulationResult?.cost?.cpu_instructions ?? null;
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

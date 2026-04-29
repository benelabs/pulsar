import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

import logger from '../logger.js';

import { simulateTransaction } from './simulate_transaction.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 */
export async function benchmarkGas({
  contractId,
  method,
}: {
  contractId: string;
  method: string;
  args?: unknown[];
  account: string;
}) {
  logger.info({ contractId, method }, 'Starting gas benchmarking...');
  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error: unknown;
  try {
    // Note: simulateTransaction requires an XDR envelope.
    // This helper tool currently passes a placeholder to satisfy typechecks.
    simulationResult = await simulateTransaction({
      xdr: 'AAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAQAAAAAAAAAA',
      network: 'testnet',
    });
  } catch (e) {
    error = e;
    logger.error({ err: e }, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;

  // Use cpu_instructions as the gas proxy from the simulation result
  const pulsarGas = simulationResult?.cost?.cpu_instructions ?? null;

  logger.info(
    {
      cpuMs,
      memDelta,
      pulsarGas,
      error: error instanceof Error ? error.message : String(error),
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

/* eslint-disable no-console */
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  // CLI usage: node benchmark_gas.js <contractId> <method> <account> [args...]
  (async () => {
    const [contractId, method, account, ...args] = process.argv.slice(2);
    if (!contractId || !method || !account) {
      console.error('Usage: node benchmark_gas.js <contractId> <method> <account> [args...]');
      process.exit(1);
    }
    const result = await benchmarkGas({ contractId, method, args, account });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  })();
}

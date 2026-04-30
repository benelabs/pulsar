import { performance } from 'perf_hooks';

import { simulateTransaction } from '../tools/simulate_transaction.js';
import logger from '../logger.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported resource usage with actual memory consumption.
 * @param xdr - Base64-encoded transaction envelope XDR to benchmark
 * @param network - Optional network override
 */
export async function benchmarkGas({ xdr, network }: { xdr: string; network?: string }) {
  logger.info('Starting gas benchmarking...');
  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error;
  try {
    simulationResult = await simulateTransaction({
      xdr,
      network: network as 'mainnet' | 'testnet' | 'futurenet' | 'custom' | undefined,
    });
  } catch (e) {
    error = e;
    logger.error({ error: e }, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  let pulsarGas = simulationResult?.cost?.cpu_instructions ?? null;
  logger.info({ cpuMs, memDelta, pulsarGas, error }, 'Benchmark complete');
  return {
    cpuMs,
    memDelta,
    pulsarGas,
    error,
    simulationResult,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI usage: node benchmark_gas.js <xdr> [network]
  (async () => {
    const [xdr, network] = process.argv.slice(2);
    const result = await benchmarkGas({ xdr, network });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  })();
}

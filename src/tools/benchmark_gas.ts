import { performance } from 'perf_hooks';

import logger from '../logger.js';

import { simulateTransaction } from './simulate_transaction.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param contractId - The contract to benchmark
 * @param method - The contract method to invoke
 * @param args - Arguments for the contract method
 * @param account - The account executing the contract
 */
export async function benchmarkGas({
  contractId: _contractId,
  method: _method,
  args: _args = [],
  account: _account,
}: {
  contractId: string;
  method: string;
  args?: unknown[];
  account: string;
}) {
  logger.info('Starting gas benchmarking...');
  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error;
  try {
    // Note: This is a placeholder - benchmark_gas needs proper XDR transaction
    // For now, we'll create a simple mock transaction
    const mockXdr = 'AAAAAgAAAABiBz+Jd8v+Ey1eFHrRgF7b...'; // truncated example
    simulationResult = await simulateTransaction({ xdr: mockXdr, network: 'testnet' });
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
    { cpuMs, memDelta, pulsarGas, error: error instanceof Error ? error.message : String(error) },
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

// Check if this module is being run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  // CLI usage: node benchmark_gas.js <contractId> <method> <account> [args...]
  (async () => {
    const [contractId, method, account, ...args] = process.argv.slice(2);
    const result = await benchmarkGas({ contractId, method, args, account });
    logger.info(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  })();
}

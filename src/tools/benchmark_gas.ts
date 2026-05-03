import { performance } from 'perf_hooks';

import { simulateTransaction } from '../tools/simulate_transaction.js';
import logger from '../logger.js';
import { fileURLToPath } from 'url';

import { simulateTransaction } from '../tools/simulate_transaction';
import { logger } from '../logger';

import { simulateTransaction } from '../tools/simulate_transaction.js';
import logger from '../logger.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported resource usage with actual memory consumption.
 * @param xdr - Base64-encoded transaction envelope XDR to benchmark
 * @param network - Optional network override
 */
export async function benchmarkGas({ xdr, network }: { xdr: string; network?: string }) {
import { performance } from 'node:perf_hooks';

import logger from '../logger.js';
import { simulateTransaction } from '../tools/simulate_transaction.js';
import { performance } from 'perf_hooks';

import logger from '../logger.js';

import { simulateTransaction } from './simulate_transaction.js';

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param xdr - The transaction XDR
 * @param network - The network to use
 * @param xdr - Base64 transaction envelope XDR to simulate
 * @param network - Optional Stellar network override
 */
export async function benchmarkGas({
  xdr,
  network,
}: {
  xdr: string;
  network?: 'mainnet' | 'testnet' | 'futurenet' | 'custom';
}: {
  xdr: string;
  network?: 'mainnet' | 'testnet' | 'futurenet' | 'custom';
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
    simulationResult = await simulateTransaction({ contractId, method, args, account } as any);
  } catch (e) {
    error = e;
    logger.error(e, 'Simulation failed');
    simulationResult = await simulateTransaction({
      xdr,
      network: network as 'mainnet' | 'testnet' | 'futurenet' | 'custom' | undefined,
    });
  } catch (e) {
    error = e;
    simulationResult = await simulateTransaction({ xdr, network });
  } catch (e) {
    error = e;
    logger.error({ err: e }, 'Simulation failed');
    // Note: This is a placeholder - benchmark_gas needs proper XDR transaction
    // For now, we'll create a simple mock transaction
    const mockXdr = 'AAAAAgAAAABiBz+Jd8v+Ey1eFHrRgF7b...'; // truncated example
    simulationResult = await simulateTransaction({ xdr: mockXdr, network: 'testnet' });
  } catch (e) {
    error = e;
    logger.error('Simulation failed', e);
    logger.error({ error: e }, 'Simulation failed');
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  let pulsarGas = (simulationResult as any)?.gas ?? null;
  let pulsarGas = simulationResult?.gas ?? null;
  logger.info('Benchmark complete', {
    cpuMs,
    memDelta,
    pulsarGas,
    error,
  });
  let pulsarGas = simulationResult?.cost?.cpu_instructions ?? null;
  logger.info({ cpuMs, memDelta, pulsarGas, error }, 'Benchmark complete');
  let pulsarGas = simulationResult?.cost ?? null;
  const pulsarGas = simulationResult?.cost?.cpu_instructions ?? null;
  logger.info(
    {
      cpuMs,
      memDelta,
      pulsarGas,
      error,
    },
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (import.meta.url === `file://${process.argv[1]}`) {
  // CLI usage: node benchmark_gas.js <xdr> [network]
  (async () => {
    const [xdr, network] = process.argv.slice(2);
    const result = await benchmarkGas({ xdr, network });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
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

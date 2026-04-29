import { logger } from "../logger.js";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";
import type { BenchmarkGasInput } from "../schemas/tools.js";

/**
 * Benchmarks gas (CPU/Memory) usage for a Stellar/Soroban contract execution.
 * Compares Pulsar-reported gas with actual resource usage.
 * @param contractId - The contract to benchmark
 * @param method - The contract method to invoke
 * @param args - Arguments for the contract method
 * @param account - The account executing the contract
 */
export async function benchmarkGas(input: BenchmarkGasInput) {
  const { contractId, method, args = [], account } = input;
  logger.info("Starting gas benchmarking...");
  
  // Lazy load the simulation tool to keep startup light
  const { simulateTransaction } = await import("./simulate_transaction.js");
  const { TransactionBuilder, Operation, nativeToScVal, Networks } = await import("@stellar/stellar-sdk");
  const { getHorizonServer } = await import("../services/horizon.js");
  const { config } = await import("../config.js");

  const startMem = process.memoryUsage().rss;
  const start = performance.now();
  let simulationResult;
  let error;
  try {
    const horizon = getHorizonServer(config.stellarNetwork);
    const sourceAccount = await horizon.loadAccount(account);
    
    const networkPassphrase = config.stellarNetwork === "mainnet" ? Networks.PUBLIC : 
                             config.stellarNetwork === "futurenet" ? Networks.FUTURENET : 
                             Networks.TESTNET;

    const tx = new TransactionBuilder(sourceAccount, { 
      fee: "100", 
      networkPassphrase 
    })
    .addOperation(Operation.invokeContractFunction({
      contract: contractId,
      function: method,
      args: args.map(arg => nativeToScVal(arg))
    }))
    .setTimeout(0)
    .build();

    simulationResult = await simulateTransaction({ xdr: tx.toXDR() });
  } catch (e) {
    error = e;
    logger.error("Simulation failed", e);
  }
  const end = performance.now();
  const endMem = process.memoryUsage().rss;
  const cpuMs = end - start;
  const memDelta = endMem - startMem;
  let pulsarGas = simulationResult?.gas ?? null;
  logger.info("Benchmark complete", {
    cpuMs,
    memDelta,
    pulsarGas,
    error,
  });
  return {
    cpuMs,
    memDelta,
    pulsarGas,
    error,
    simulationResult,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // CLI usage: node benchmark_gas.js <contractId> <method> <account> [args...]
  (async () => {
    const [contractId, method, account, ...args] = process.argv.slice(2);
    const result = await benchmarkGas({ contractId, method, args, account });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  })();
}

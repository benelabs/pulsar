# Gas (CPU/Memory) Benchmarking Tool

A tool to benchmark and compare Pulsar-reported gas usage with actual CPU and memory consumption during contract execution.

## Usage

### CLI

```
npm run ts-node src/tools/benchmark_gas.ts <contractId> <method> <account> [args...]
```

### Programmatic

```
import { benchmarkGas } from "../tools/benchmark_gas";

const result = await benchmarkGas({
  contractId: "...",
  method: "...",
  args: [...],
  account: "...",
});
```

## Output
- `cpuMs`: CPU time in milliseconds
- `memDelta`: Memory usage difference (bytes)
- `pulsarGas`: Gas reported by Pulsar
- `simulationResult`: Raw simulation result
- `error`: Any error encountered

## Testing

```
npm test src/tools/benchmark_gas.test.ts
```

## Notes
- Integrates with Pulsar toolsets and follows Stellar/Soroban best practices.
- Comprehensive error handling and diagnostics included.

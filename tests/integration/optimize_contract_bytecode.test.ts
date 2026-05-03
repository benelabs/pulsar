import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { optimizeContractBytecode } from '../../src/tools/optimize_contract_bytecode.js';

describe('optimize_contract_bytecode integration', () => {
  it('analyzes a generated wasm blob end-to-end', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulsar-optimize-'));
    const wasmPath = path.join(tempDir, 'mini.wasm');

    // Minimal valid WASM module (magic + version).
    await fs.writeFile(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));

    const result = await optimizeContractBytecode({
      wasm_path: wasmPath,
      max_size_kb: 256,
      strict_mode: false,
    });

    expect(result.wasm_path).toBe(wasmPath);
    expect(result.size_bytes).toBe(8);
    expect(result.exceeds_limit).toBe(false);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

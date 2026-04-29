import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

import { optimizeContractBytecode } from '../../src/tools/optimize_contract_bytecode.js';

function encodeLebU32(value: number): Buffer {
  const out: number[] = [];
  let current = value >>> 0;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current !== 0) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (current !== 0);
  return Buffer.from(out);
}

function createWasmWithSections(sections: Array<{ id: number; payload: Buffer }>): Buffer {
  const header = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  const sectionBuffers = sections.map(({ id, payload }) =>
    Buffer.concat([Buffer.from([id]), encodeLebU32(payload.length), payload])
  );

  return Buffer.concat([header, ...sectionBuffers]);
}

function createCustomSection(name: string, payloadSize: number): Buffer {
  const nameBytes = Buffer.from(name, 'utf8');
  const payload = Buffer.alloc(Math.max(0, payloadSize), 0xaa);
  return Buffer.concat([encodeLebU32(nameBytes.length), nameBytes, payload]);
}

describe('optimizeContractBytecode', () => {
  it('returns diagnostics and recommendations for valid wasm', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulsar-wasm-'));
    const wasmPath = path.join(tempDir, 'contract.wasm');

    const wasm = createWasmWithSections([
      { id: 0, payload: createCustomSection('name', 40) },
      { id: 10, payload: Buffer.alloc(300, 0xbb) },
      { id: 11, payload: Buffer.alloc(64, 0xcc) },
    ]);

    await fs.writeFile(wasmPath, wasm);

    const result = await optimizeContractBytecode({
      wasm_path: wasmPath,
      max_size_kb: 512,
      strict_mode: false,
    });

    expect(result.file_name).toBe('contract.wasm');
    expect(result.exceeds_limit).toBe(false);
    expect(result.diagnostics.code_section_bytes).toBe(300);
    expect(result.diagnostics.custom_section_bytes).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.suggested_commands).toContain(
      'stellar contract optimize --wasm <input.wasm> --wasm-out <optimized.wasm>'
    );
  });

  it('marks wasm as exceeding limit and throws in strict mode', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulsar-wasm-'));
    const wasmPath = path.join(tempDir, 'big.wasm');

    const wasm = createWasmWithSections([{ id: 10, payload: Buffer.alloc(20 * 1024, 0xdd) }]);
    await fs.writeFile(wasmPath, wasm);

    const nonStrictResult = await optimizeContractBytecode({
      wasm_path: wasmPath,
      max_size_kb: 4,
      strict_mode: false,
    });
    expect(nonStrictResult.exceeds_limit).toBe(true);

    await expect(
      optimizeContractBytecode({
        wasm_path: wasmPath,
        max_size_kb: 4,
        strict_mode: true,
      })
    ).rejects.toThrow('WASM bytecode size exceeds the configured max_size_kb threshold');
  });

  it('throws on invalid wasm header', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulsar-wasm-'));
    const wasmPath = path.join(tempDir, 'invalid.wasm');
    await fs.writeFile(wasmPath, Buffer.from('not-wasm'));

    await expect(
      optimizeContractBytecode({
        wasm_path: wasmPath,
        max_size_kb: 256,
        strict_mode: false,
      })
    ).rejects.toThrow('Invalid WASM file header');
  });

  it('throws when file does not exist', async () => {
    await expect(
      optimizeContractBytecode({
        wasm_path: '/tmp/does-not-exist/pulsar-contract.wasm',
        max_size_kb: 256,
        strict_mode: false,
      })
    ).rejects.toThrow('Unable to read wasm file');
  });
});

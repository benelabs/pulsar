import { promises as fs } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { PulsarValidationError } from '../errors.js';

export const optimizeContractBytecodeSchema = z.object({
  wasm_path: z.string().min(1, { message: 'wasm_path is required' }),
  max_size_kb: z
    .number()
    .int()
    .positive({ message: 'max_size_kb must be greater than 0' })
    .optional()
    .default(256),
  strict_mode: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, throw an error when bytecode exceeds max_size_kb'),
});

export type OptimizeContractBytecodeInput = z.infer<typeof optimizeContractBytecodeSchema>;

type RecommendationPriority = 'high' | 'medium' | 'low';

interface Recommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  rationale: string;
  action: string;
}

interface SectionSummary {
  id: number;
  name: string;
  size_bytes: number;
  percentage_of_total: number;
}

interface WasmSection {
  id: number;
  name: string;
  sizeBytes: number;
}

export interface OptimizeContractBytecodeOutput {
  wasm_path: string;
  file_name: string;
  size_bytes: number;
  size_kb: number;
  max_size_kb: number;
  max_size_bytes: number;
  exceeds_limit: boolean;
  estimated_reduction_bytes_range: {
    min: number;
    max: number;
  };
  diagnostics: {
    custom_section_bytes: number;
    code_section_bytes: number;
    data_section_bytes: number;
    section_breakdown: SectionSummary[];
  };
  suggested_cargo_profile: {
    release: {
      opt_level: 'z';
      lto: boolean;
      codegen_units: number;
      panic: 'abort';
      strip: 'symbols';
      overflow_checks: boolean;
    };
  };
  suggested_commands: string[];
  recommendations: Recommendation[];
}

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
const WASM_VERSION_1 = Buffer.from([0x01, 0x00, 0x00, 0x00]);

const SECTION_NAMES: Record<number, string> = {
  0: 'custom',
  1: 'type',
  2: 'import',
  3: 'function',
  4: 'table',
  5: 'memory',
  6: 'global',
  7: 'export',
  8: 'start',
  9: 'element',
  10: 'code',
  11: 'data',
  12: 'data_count',
};

export async function optimizeContractBytecode(
  input: OptimizeContractBytecodeInput
): Promise<OptimizeContractBytecodeOutput> {
  const parsed = optimizeContractBytecodeSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError(
      'Invalid input for optimize_contract_bytecode',
      parsed.error.format()
    );
  }

  const data = parsed.data;
  const wasmPath = path.resolve(data.wasm_path);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await fs.readFile(wasmPath);
  } catch (error) {
    throw new PulsarValidationError('Unable to read wasm file', {
      wasm_path: wasmPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  validateWasmHeader(fileBuffer, wasmPath);

  const sections = parseWasmSections(fileBuffer, wasmPath);
  const sizeBytes = fileBuffer.byteLength;
  const maxSizeBytes = (data.max_size_kb ?? 256) * 1024;
  const exceedsLimit = sizeBytes > maxSizeBytes;

  const customSectionBytes = getSectionBytes(sections, 'custom');
  const codeSectionBytes = getSectionBytes(sections, 'code');
  const dataSectionBytes = getSectionBytes(sections, 'data');

  const recommendations = buildRecommendations({
    exceedsLimit,
    sizeBytes,
    maxSizeBytes,
    customSectionBytes,
    codeSectionBytes,
    dataSectionBytes,
  });

  const output: OptimizeContractBytecodeOutput = {
    wasm_path: wasmPath,
    file_name: path.basename(wasmPath),
    size_bytes: sizeBytes,
    size_kb: Number((sizeBytes / 1024).toFixed(2)),
    max_size_kb: data.max_size_kb ?? 256,
    max_size_bytes: maxSizeBytes,
    exceeds_limit: exceedsLimit,
    estimated_reduction_bytes_range: estimateReductionRange(
      customSectionBytes,
      codeSectionBytes,
      dataSectionBytes
    ),
    diagnostics: {
      custom_section_bytes: customSectionBytes,
      code_section_bytes: codeSectionBytes,
      data_section_bytes: dataSectionBytes,
      section_breakdown: sections
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .map((s) => ({
          id: s.id,
          name: s.name,
          size_bytes: s.sizeBytes,
          percentage_of_total: Number(((s.sizeBytes / sizeBytes) * 100).toFixed(2)),
        })),
    },
    suggested_cargo_profile: {
      release: {
        opt_level: 'z',
        lto: true,
        codegen_units: 1,
        panic: 'abort',
        strip: 'symbols',
        overflow_checks: false,
      },
    },
    suggested_commands: [
      'cargo build --release --target wasm32v1-none',
      'stellar contract optimize --wasm <input.wasm> --wasm-out <optimized.wasm>',
      'wasm-opt -Oz -o <optimized.wasm> <input.wasm>',
    ],
    recommendations,
  };

  if (data.strict_mode && exceedsLimit) {
    throw new PulsarValidationError(
      'WASM bytecode size exceeds the configured max_size_kb threshold',
      {
        size_bytes: sizeBytes,
        max_size_bytes: maxSizeBytes,
        recommendations,
      }
    );
  }

  return output;
}

function validateWasmHeader(buffer: Buffer, wasmPath: string): void {
  if (buffer.byteLength < 8) {
    throw new PulsarValidationError('Invalid WASM file: too small', {
      wasm_path: wasmPath,
      size_bytes: buffer.byteLength,
    });
  }

  const magic = buffer.subarray(0, 4);
  const version = buffer.subarray(4, 8);
  if (!magic.equals(WASM_MAGIC) || !version.equals(WASM_VERSION_1)) {
    throw new PulsarValidationError('Invalid WASM file header', {
      wasm_path: wasmPath,
      magic: magic.toString('hex'),
      version: version.toString('hex'),
    });
  }
}

function parseWasmSections(buffer: Buffer, wasmPath: string): WasmSection[] {
  let offset = 8;
  const sections: WasmSection[] = [];

  while (offset < buffer.length) {
    const sectionId = buffer[offset];
    offset += 1;

    const lengthInfo = readLebU32(buffer, offset);
    offset = lengthInfo.nextOffset;

    const sectionStart = offset;
    const sectionEnd = sectionStart + lengthInfo.value;

    if (sectionEnd > buffer.length) {
      throw new PulsarValidationError('Malformed WASM section: truncated payload', {
        wasm_path: wasmPath,
        section_id: sectionId,
        declared_length: lengthInfo.value,
      });
    }

    let sectionName = SECTION_NAMES[sectionId] ?? `unknown_${sectionId}`;

    if (sectionId === 0) {
      const customNameInfo = readLebU32(buffer, sectionStart);
      const customNameStart = customNameInfo.nextOffset;
      const customNameEnd = customNameStart + customNameInfo.value;
      if (customNameEnd <= sectionEnd) {
        const customName = buffer.subarray(customNameStart, customNameEnd).toString('utf8').trim();
        if (customName) {
          sectionName = `custom:${customName}`;
        }
      }
    }

    sections.push({
      id: sectionId,
      name: sectionName,
      sizeBytes: lengthInfo.value,
    });

    offset = sectionEnd;
  }

  return sections;
}

function readLebU32(
  buffer: Buffer,
  startOffset: number
): {
  value: number;
  nextOffset: number;
} {
  let result = 0;
  let shift = 0;
  let offset = startOffset;

  for (let i = 0; i < 5; i += 1) {
    if (offset >= buffer.length) {
      throw new PulsarValidationError('Malformed WASM: unterminated LEB128 number');
    }

    const byte = buffer[offset];
    offset += 1;

    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: offset };
    }
    shift += 7;
  }

  throw new PulsarValidationError('Malformed WASM: LEB128 value exceeds u32 bounds');
}

function getSectionBytes(sections: WasmSection[], prefix: string): number {
  return sections
    .filter((section) => section.name === prefix || section.name.startsWith(`${prefix}:`))
    .reduce((sum, section) => sum + section.sizeBytes, 0);
}

function estimateReductionRange(
  customSectionBytes: number,
  codeSectionBytes: number,
  dataSectionBytes: number
): { min: number; max: number } {
  const min = Math.max(0, Math.floor(customSectionBytes + codeSectionBytes * 0.05));
  const max = Math.max(
    min,
    Math.floor(customSectionBytes + codeSectionBytes * 0.2 + dataSectionBytes * 0.1)
  );
  return { min, max };
}

function buildRecommendations({
  exceedsLimit,
  sizeBytes,
  maxSizeBytes,
  customSectionBytes,
  codeSectionBytes,
  dataSectionBytes,
}: {
  exceedsLimit: boolean;
  sizeBytes: number;
  maxSizeBytes: number;
  customSectionBytes: number;
  codeSectionBytes: number;
  dataSectionBytes: number;
}): Recommendation[] {
  const recs: Recommendation[] = [];

  if (exceedsLimit) {
    recs.push({
      id: 'size-limit',
      priority: 'high',
      title: 'WASM exceeds configured size limit',
      rationale: `Current size is ${sizeBytes} bytes and max allowed is ${maxSizeBytes} bytes.`,
      action:
        'Apply release profile optimization flags and run `stellar contract optimize` before deployment.',
    });
  }

  if (customSectionBytes > 0) {
    recs.push({
      id: 'strip-custom-sections',
      priority: 'high',
      title: 'Strip debug/custom sections',
      rationale:
        'Custom/debug sections increase binary size and are not needed for on-chain execution.',
      action:
        'Enable symbol stripping and optimization pass to remove custom sections from the final WASM artifact.',
    });
  }

  if (codeSectionBytes > 0) {
    recs.push({
      id: 'optimize-codegen',
      priority: 'medium',
      title: 'Optimize code generation for size',
      rationale:
        'Code section is typically the largest contributor to contract size in Soroban builds.',
      action:
        "Use `[profile.release] opt-level = 'z', lto = true, codegen-units = 1, panic = 'abort'`.",
    });
  }

  if (dataSectionBytes > 0) {
    recs.push({
      id: 'reduce-static-data',
      priority: 'medium',
      title: 'Reduce static data footprint',
      rationale: 'Large static arrays/constants in data segments inflate WASM size.',
      action:
        'Move large constants to compact forms and avoid embedding large lookup tables directly.',
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: 'size-healthy',
      priority: 'low',
      title: 'Contract bytecode size is healthy',
      rationale: 'No major size risk patterns were detected.',
      action:
        'Keep current release profile settings and enforce size checks in CI for regression prevention.',
    });
  }

  return recs;
}

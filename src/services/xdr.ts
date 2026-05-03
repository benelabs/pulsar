import { spawn } from 'child_process';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib';

import { config } from '../config.js';

export interface XdrDecodeResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface LedgerEntryDecodeResult {
  entry_type: string;
  decoded: unknown;
  raw_xdr: string;
  compression?: CompressionDecodeSummary;
}

export interface XdrDecodeError {
  error: string;
  code: string;
  diagnostics?: Record<string, unknown>;
}

export type CompressionAlgorithm = 'auto' | 'gzip' | 'deflate' | 'brotli';

export interface CompressionDecodeOptions {
  enabled?: boolean;
  algorithm?: CompressionAlgorithm;
  /**
   * Dot-separated object paths to inspect for base64-compressed blobs.
   * If omitted, a conservative auto-discovery pass is used.
   */
  fields?: string[];
}

export interface CompressionFieldResult {
  path: string;
  algorithm: Exclude<CompressionAlgorithm, 'auto'>;
  utf8: string;
  byte_length: number;
}

export interface CompressionDecodeSummary {
  enabled: boolean;
  requested_algorithm: CompressionAlgorithm;
  inspected_fields: string[];
  decompressed_fields: CompressionFieldResult[];
  skipped_fields: string[];
}

/**
 * Decodes a base64-encoded XDR ledger entry using the Stellar CLI.
 *
 * @param xdr - The base64-encoded XDR ledger entry
 * @param entryType - Optional hint for the entry type (account, trustline, contract_data, etc.)
 * @returns The decoded ledger entry result
 */
export async function decodeLedgerEntry(
  xdr: string,
  entryType?: string,
  compression: CompressionDecodeOptions = {}
): Promise<LedgerEntryDecodeResult | XdrDecodeError> {
  try {
    // Validate XDR is base64
    if (!isValidBase64(xdr)) {
      return {
        error: 'Invalid XDR: not a valid base64 string',
        code: 'INVALID_XDR',
      };
    }

    const args = [
      'xdr',
      'decode',
      '--type',
      'LedgerEntry',
      '--input',
      'base64',
      '--output',
      'json',
    ];

    const result = await runStellarCli(args, xdr);

    if (!result.success) {
      return {
        error: result.error || 'Failed to decode XDR',
        code: 'DECODE_ERROR',
      };
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(result.data as string);
    } catch {
      return {
        error: 'Failed to parse decoded XDR JSON',
        code: 'PARSE_ERROR',
      };
    }

    return {
      entry_type: entryType || detectEntryType(decoded),
      decoded,
      raw_xdr: xdr,
      compression: decodeCompressedFields(decoded, compression),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error decoding XDR',
      code: 'UNKNOWN_ERROR',
    };
  }
}

function decodeCompressedFields(
  decoded: unknown,
  options: CompressionDecodeOptions
): CompressionDecodeSummary | undefined {
  if (!options.enabled) {
    return undefined;
  }

  const requestedAlgorithm = options.algorithm || 'auto';
  const inspectedFields =
    options.fields && options.fields.length > 0 ? options.fields : discoverCandidatePaths(decoded);
  const decompressedFields: CompressionFieldResult[] = [];
  const skippedFields: string[] = [];

  for (const path of inspectedFields) {
    const value = getValueAtPath(decoded, path);
    if (typeof value !== 'string' || !isValidBase64(value)) {
      skippedFields.push(path);
      continue;
    }

    const result = tryDecompressBase64(value, requestedAlgorithm);
    if (!result) {
      skippedFields.push(path);
      continue;
    }

    decompressedFields.push({
      path,
      algorithm: result.algorithm,
      utf8: result.utf8,
      byte_length: result.byteLength,
    });
  }

  return {
    enabled: true,
    requested_algorithm: requestedAlgorithm,
    inspected_fields: inspectedFields,
    decompressed_fields: decompressedFields,
    skipped_fields: skippedFields,
  };
}

function discoverCandidatePaths(decoded: unknown): string[] {
  if (!decoded || typeof decoded !== 'object') {
    return [];
  }

  const candidates = new Set<string>();
  const stack: Array<{ value: unknown; path: string }> = [{ value: decoded, path: '' }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current.value !== 'object' || current.value === null) {
      continue;
    }
    for (const [key, value] of Object.entries(current.value)) {
      const nextPath = current.path ? `${current.path}.${key}` : key;
      if (
        typeof value === 'string' &&
        (key === 'val' || key === 'value' || key === 'data' || key === 'bytes')
      ) {
        candidates.add(nextPath);
      } else if (typeof value === 'object' && value !== null) {
        stack.push({ value, path: nextPath });
      }
    }
  }

  return [...candidates];
}

function getValueAtPath(data: unknown, path: string): unknown {
  if (!path) {
    return undefined;
  }
  const keys = path.split('.');
  let current: unknown = data;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function tryDecompressBase64(
  value: string,
  algorithm: CompressionAlgorithm
): { algorithm: Exclude<CompressionAlgorithm, 'auto'>; utf8: string; byteLength: number } | null {
  const compressed = Buffer.from(value, 'base64');

  const attempts: Array<Exclude<CompressionAlgorithm, 'auto'>> =
    algorithm === 'auto' ? ['gzip', 'deflate', 'brotli'] : [algorithm];

  for (const attempt of attempts) {
    try {
      const uncompressed = decompressBuffer(compressed, attempt);
      return {
        algorithm: attempt,
        utf8: uncompressed.toString('utf8'),
        byteLength: uncompressed.byteLength,
      };
    } catch {
      // Continue trying algorithms in auto mode.
    }
  }

  return null;
}

function decompressBuffer(
  compressed: Buffer,
  algorithm: Exclude<CompressionAlgorithm, 'auto'>
): Buffer {
  switch (algorithm) {
    case 'gzip':
      return gunzipSync(compressed);
    case 'deflate':
      return inflateSync(compressed);
    case 'brotli':
      return brotliDecompressSync(compressed);
    default:
      return compressed;
  }
}

/**
 * Runs the Stellar CLI with the given arguments and input.
 *
 * @param args - The CLI arguments
 * @param input - Optional input to pipe to stdin
 * @returns The result of the CLI execution
 */
function runStellarCli(args: string[], input?: string): Promise<XdrDecodeResult> {
  return new Promise((resolve) => {
    const child = spawn(config.stellarCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      } else {
        resolve({
          success: true,
          data: stdout.trim(),
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        error: `Failed to spawn stellar CLI: ${error.message}`,
      });
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

/**
 * Validates if a string is valid base64.
 *
 * @param str - The string to validate
 * @returns True if valid base64
 */
function isValidBase64(str: string): boolean {
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }
  try {
    // Check length is valid (must be multiple of 4)
    if (str.length % 4 !== 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to detect the entry type from the decoded data.
 *
 * @param decoded - The decoded data
 * @returns The detected entry type or 'unknown'
 */
function detectEntryType(decoded: unknown): string {
  if (typeof decoded !== 'object' || decoded === null) {
    return 'unknown';
  }

  const data = decoded as Record<string, unknown>;

  // Check for AccountEntry
  if ('account' in data || 'seq_num' in data) {
    return 'account';
  }

  // Check for TrustLineEntry
  if ('asset' in data && 'limit' in data) {
    return 'trustline';
  }

  // Check for ContractDataEntry
  if ('contract' in data && 'key' in data && 'durability' in data) {
    return 'contract_data';
  }

  // Check for ContractCodeEntry
  if ('hash' in data && 'code' in data) {
    return 'contract_code';
  }

  // Check for OfferEntry
  if ('offer_id' in data || ('selling' in data && 'buying' in data)) {
    return 'offer';
  }

  // Check for DataEntry
  if ('data_name' in data || ('name' in data && 'value' in data)) {
    return 'data';
  }

  return 'unknown';
}

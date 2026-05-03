import process from 'node:process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Readable, Writable } from 'node:stream';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

import { PulsarValidationError } from '../errors.js';

const AES_ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

class LineBuffer {
  private buffer?: Buffer;

  append(chunk: Buffer): void {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
  }

  readLine(): string | null {
    if (!this.buffer) return null;
    const index = this.buffer.indexOf('\n');
    if (index === -1) return null;
    const line = this.buffer.toString('utf8', 0, index).replace(/\r$/, '');
    this.buffer = this.buffer.subarray(index + 1);
    return line;
  }

  clear(): void {
    this.buffer = undefined;
  }
}

type EncryptedEnvelope = {
  v: number;
  nonce: string;
  ciphertext: string;
  tag: string;
};

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === ENVELOPE_VERSION &&
    typeof record.nonce === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof record.tag === 'string'
  );
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(fallback);
}

function decryptEnvelope(line: string, key: Buffer): JSONRPCMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('Invalid encrypted stdio frame');
  }

  if (!isEncryptedEnvelope(parsed)) {
    throw new Error('Invalid encrypted stdio frame');
  }

  const nonce = Buffer.from(parsed.nonce, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');

  if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Invalid encrypted stdio frame');
  }

  const decipher = createDecipheriv(AES_ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Invalid encrypted stdio payload');
  }

  try {
    return JSONRPCMessageSchema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw new Error('Invalid encrypted stdio payload');
  }
}

function encryptMessage(message: JSONRPCMessage, key: Buffer): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, key, nonce);
  const plaintext = Buffer.from(JSON.stringify(message), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return (
    JSON.stringify({
      v: ENVELOPE_VERSION,
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64'),
    }) + '\n'
  );
}

export function parseIpcEncryptionKey(rawKey: string): Buffer {
  const key = rawKey.trim();
  if (!key) {
    throw new PulsarValidationError('PULSAR_IPC_ENCRYPTION_KEY must not be empty');
  }

  if (HEX_KEY_REGEX.test(key)) {
    return Buffer.from(key, 'hex');
  }

  const decoded = Buffer.from(key, 'base64');
  const normalized = decoded.toString('base64').replace(/=+$/, '');
  const normalizedInput = key.replace(/=+$/, '');

  if (decoded.length === 32 && normalized === normalizedInput) {
    return decoded;
  }

  throw new PulsarValidationError(
    'PULSAR_IPC_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).'
  );
}

export class EncryptedStdioServerTransport implements Transport {
  private readonly stdin: Readable;
  private readonly stdout: Writable;
  private readonly key: Buffer;
  private readonly readBuffer = new LineBuffer();
  private started = false;

  constructor({
    key,
    stdin = process.stdin,
    stdout = process.stdout,
  }: {
    key: Buffer;
    stdin?: Readable;
    stdout?: Writable;
  }) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.key = key;
  }

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;

  private onData = (chunk: Buffer) => {
    this.readBuffer.append(chunk);
    this.processReadBuffer();
  };

  private onError = (error: Error) => {
    this.onerror?.(error);
  };

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('EncryptedStdioServerTransport already started.');
    }
    this.started = true;
    this.stdin.on('data', this.onData);
    this.stdin.on('error', this.onError);
  }

  private processReadBuffer(): void {
    let line = this.readBuffer.readLine();
    while (line !== null) {
      if (line.length > 0) {
        try {
          const message = decryptEnvelope(line, this.key);
          this.onmessage?.(message);
        } catch (error) {
          this.onerror?.(toError(error, 'Invalid encrypted stdio frame'));
          void this.close();
          return;
        }
      }
      line = this.readBuffer.readLine();
    }
  }

  async close(): Promise<void> {
    this.stdin.off('data', this.onData);
    this.stdin.off('error', this.onError);

    const remainingDataListeners = this.stdin.listenerCount('data');
    if (remainingDataListeners === 0) {
      this.stdin.pause();
    }

    this.readBuffer.clear();
    this.onclose?.();
  }

  send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    return new Promise((resolve) => {
      const encryptedLine = encryptMessage(message, this.key);
      if (this.stdout.write(encryptedLine)) {
        resolve();
      } else {
        this.stdout.once('drain', resolve);
      }
    });
  }
}

export type StdioTransportOptions = {
  encryptionKey?: string;
  stdin?: Readable;
  stdout?: Writable;
};

export function createStdioTransport(options: StdioTransportOptions = {}): Transport {
  if (!options.encryptionKey) {
    return new StdioServerTransport(options.stdin, options.stdout);
  }

  const key = parseIpcEncryptionKey(options.encryptionKey);
  return new EncryptedStdioServerTransport({ key, stdin: options.stdin, stdout: options.stdout });
}

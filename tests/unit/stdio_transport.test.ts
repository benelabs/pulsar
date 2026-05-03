import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  createStdioTransport,
  EncryptedStdioServerTransport,
  parseIpcEncryptionKey,
} from '../../src/transport/stdio.js';

describe('stdio transport encryption', () => {
  it('parses hex encryption keys', () => {
    const raw = randomBytes(32).toString('hex');
    const key = parseIpcEncryptionKey(raw);

    expect(key.length).toBe(32);
    expect(key.toString('hex')).toBe(raw);
  });

  it('parses base64 encryption keys', () => {
    const raw = randomBytes(32).toString('base64');
    const key = parseIpcEncryptionKey(raw);

    expect(key.length).toBe(32);
    expect(key.toString('base64').replace(/=+$/, '')).toBe(raw.replace(/=+$/, ''));
  });

  it('rejects invalid encryption keys', () => {
    expect(() => parseIpcEncryptionKey('not-a-key')).toThrow(/PULSAR_IPC_ENCRYPTION_KEY/);
  });

  it('rejects empty encryption keys', () => {
    expect(() => parseIpcEncryptionKey('')).toThrow(/PULSAR_IPC_ENCRYPTION_KEY/);
  });

  it('rejects whitespace-only encryption keys', () => {
    expect(() => parseIpcEncryptionKey('   ')).toThrow(/PULSAR_IPC_ENCRYPTION_KEY/);
  });

  it('creates a standard stdio transport without encryption', () => {
    const transport = createStdioTransport();
    expect(transport).toBeInstanceOf(StdioServerTransport);
  });

  it('creates an encrypted stdio transport when key is provided', () => {
    const raw = randomBytes(32).toString('hex');
    const transport = createStdioTransport({ encryptionKey: raw });

    expect(transport).toBeInstanceOf(EncryptedStdioServerTransport);
  });

  it('encrypts and decrypts stdio frames', async () => {
    const key = randomBytes(32);
    const wire = new PassThrough();
    const receiverOut = new PassThrough();
    const receiver = new EncryptedStdioServerTransport({ key, stdin: wire, stdout: receiverOut });

    const received: Array<Record<string, unknown>> = [];
    receiver.onmessage = (message) => received.push(message as Record<string, unknown>);

    await receiver.start();

    const sender = new EncryptedStdioServerTransport({
      key,
      stdin: new PassThrough(),
      stdout: wire,
    });

    const message = { jsonrpc: '2.0' as const, id: 1, method: 'tools/list' };
    await sender.send(message);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual([message]);
  });

  it('rejects plaintext frames when encryption is enabled', async () => {
    const key = randomBytes(32);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new EncryptedStdioServerTransport({ key, stdin, stdout });

    const errors: Error[] = [];
    const messages: Array<Record<string, unknown>> = [];

    transport.onerror = (error) => errors.push(error);
    transport.onmessage = (message) => messages.push(message as Record<string, unknown>);

    await transport.start();

    stdin.write('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(messages).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('rejects frames encrypted with a different key', async () => {
    const keyA = randomBytes(32);
    const keyB = randomBytes(32);
    const wire = new PassThrough();
    const receiverOut = new PassThrough();

    const sender = new EncryptedStdioServerTransport({
      key: keyA,
      stdin: new PassThrough(),
      stdout: wire,
    });

    const receiver = new EncryptedStdioServerTransport({
      key: keyB,
      stdin: wire,
      stdout: receiverOut,
    });

    const errors: Error[] = [];
    const messages: Array<Record<string, unknown>> = [];
    receiver.onerror = (error) => errors.push(error);
    receiver.onmessage = (message) => messages.push(message as Record<string, unknown>);

    await receiver.start();
    await sender.send({ jsonrpc: '2.0' as const, id: 1, method: 'tools/list' });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(messages).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Invalid encrypted stdio/);
  });

  it('throws when started twice', async () => {
    const key = randomBytes(32);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new EncryptedStdioServerTransport({ key, stdin, stdout });

    await transport.start();
    await expect(transport.start()).rejects.toThrow(/already started/);
  });

  it('removes stdin listeners on close', async () => {
    const key = randomBytes(32);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new EncryptedStdioServerTransport({ key, stdin, stdout });

    await transport.start();
    expect(stdin.listenerCount('data')).toBe(1);

    await transport.close();
    expect(stdin.listenerCount('data')).toBe(0);
  });
});

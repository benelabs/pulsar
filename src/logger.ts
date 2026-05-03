import { AsyncLocalStorage } from 'node:async_hooks';

import pino from 'pino';

import { config } from './config.js';

/**
 * requestContext provides an async storage for request-specific metadata
 * like request_id to enable tracing across the call stack.
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/**
 * Redacts sensitive fields from the logs, like private keys.
 */
const redactPaths = [
  'STELLAR_SECRET_KEY',
  'PULSAR_IPC_ENCRYPTION_KEY',
  'secret',
  'privateKey',
  'raw_secret',
  'envelope_xdr', // While not strictly secret, it might contain sensitive info
];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: redactPaths,
  mixin() {
    const store = requestContext.getStore();
    return store ? { request_id: store.requestId } : {};
  },
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      destination: 2, // Write to stderr to avoid corrupting MCP stdout stream
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
const logger = pino(
  {
    level: config.logLevel,
    redact: redactPaths,
    base: null,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  pino.destination(2),
);

export { logger };
export default logger;

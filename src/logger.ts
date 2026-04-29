import pino from 'pino';

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
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      destination: 2, // Write to stderr to avoid corrupting MCP stdout stream
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;

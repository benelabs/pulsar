import pino from 'pino';

import { config } from './config.js';

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

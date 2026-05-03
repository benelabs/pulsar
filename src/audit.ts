import { promises as fs } from 'fs';
import { createHash } from 'crypto';

import { config } from './config.js';
import logger from './logger.js';

const REDACT_PATHS = [
  'STELLAR_SECRET_KEY',
  'secret',
  'privateKey',
  'raw_secret',
  'envelope_xdr',
  'xdr',
];

/**
 * Anonymizes data by redacting sensitive keys and hashing Stellar/Soroban identifiers.
 */
export function anonymize(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Check if the string matches a Stellar Public Key, Secret Key, or Contract ID
    const stellarRegex = /([GSC][A-Z2-7]{55})/g;
    return data.replace(stellarRegex, (match) => {
      const hash = createHash('sha256').update(match).digest('hex');
      return `${match[0]}...${hash.substring(0, 8)}`;
    });
  }

  if (Array.isArray(data)) {
    return data.map((item) => anonymize(item));
  }

  if (typeof data === 'object') {
    const anonymizedObj: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (REDACT_PATHS.includes(key)) {
          anonymizedObj[key] = '[REDACTED]';
        } else {
          anonymizedObj[key] = anonymize(data[key]);
        }
      }
    }
    return anonymizedObj;
  }

  return data;
}

export interface AuditLogEntry {
  timestamp: string;
  tool: string;
  inputs: any;
  outcome: 'success' | 'error';
  result?: any;
  error?: any;
}

export async function logToolExecution(
  tool: string,
  inputs: any,
  outcome: 'success' | 'error',
  response: any
): Promise<void> {
  try {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      tool,
      inputs: anonymize(inputs),
      outcome,
    };

    if (outcome === 'success') {
      entry.result = anonymize(response);
    } else {
      entry.error = anonymize(response);
    }

    const logLine = JSON.stringify(entry) + '\n';
    await fs.appendFile(config.auditLogPath, logLine, 'utf8');
  } catch (err) {
    logger.error({ error: err, tool }, 'Failed to write to audit log');
  }
}

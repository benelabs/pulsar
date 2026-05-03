import dotenv from 'dotenv';
import { z } from 'zod';

import logger from './logger.js';

// Load .env if present
dotenv.config();

const configSchema = z.object({
  stellarNetwork: z.enum(['mainnet', 'testnet', 'futurenet', 'custom']).default('testnet'),
  horizonUrl: z.string().url().optional(),
  sorobanRpcUrl: z.string().url().optional(),
  sorobanRpcUrls: z.array(z.string().url()).optional().describe("Array of Soroban RPC endpoints for latency-based routing (preferred over sorobanRpcUrl)"),
  stellarSecretKey: z.string().startsWith('S').length(56).optional(),
  stellarCliPath: z.string().default('stellar'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  auditLogPath: z.string().default('audit.log'),
  rpcHealthCheckIntervalMs: z.number().int().min(5000).max(300000).default(30000).optional(),
  rpcLatencyThresholdMs: z.number().int().min(100).max(10000).default(2000).optional(),
  ipcEncryptionKey: z.string().optional(),
  language: z.enum(['en', 'es']).default('en'),
  metricsEnabled: z.boolean().default(true),
  metricsPort: z.number().int().min(1).max(65535).default(9090),
  restrictedAddresses: z.string().optional(),
  restrictedAddressesFile: z.string().optional(),
  rateLimitMax: z.coerce.number().int().positive().default(10),
  rateLimitWindowMs: z.coerce.number().int().positive().default(60000),
  ipcEncryptionKey: z.string().optional(),
  language: z.enum(['en', 'es']).default('en'),
  auditLogPath: z.string().default('audit.log'),
  sorobanRpcUrls: z.array(z.string().url()).optional().describe("Array of Soroban RPC endpoints for latency-based routing (preferred over sorobanRpcUrl)"),
  stellarSecretKey: z.string().startsWith("S").length(56).optional(),
  stellarCliPath: z.string().default("stellar"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  rpcHealthCheckIntervalMs: z.number().int().min(5000).max(300000).default(30000).optional(),
  rpcLatencyThresholdMs: z.number().int().min(100).max(10000).default(2000).optional(),
  stellarSecretKey: z.string().startsWith('S').length(56).optional(),
  stellarCliPath: z.string().default('stellar'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  stellarSecretKey: z.string().startsWith("S").length(56).optional(),
  stellarCliPath: z.string().default("stellar"),
  logLevel: z.enum(["error", "warn", "info", "debug", "trace"]).default("info"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  metricsEnabled: z.boolean().default(true),
  metricsPort: z.number().int().min(1).max(65535).default(9090),
  restrictedAddresses: z.string().optional(),
  restrictedAddressesFile: z.string().optional(),
});

const rawConfig = {
  stellarNetwork: process.env.STELLAR_NETWORK,
  horizonUrl: process.env.HORIZON_URL || undefined,
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || undefined,
  sorobanRpcUrls: process.env.SOROBAN_RPC_URLS ? process.env.SOROBAN_RPC_URLS.split(",").map((u: string) => u.trim()).filter((u: string) => u.length > 0) : undefined,
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || undefined,
  stellarCliPath: process.env.STELLAR_CLI_PATH || 'stellar',
  logLevel: process.env.LOG_LEVEL || 'info',
  auditLogPath: process.env.AUDIT_LOG_PATH || 'audit.log',
  ipcEncryptionKey: process.env.PULSAR_IPC_ENCRYPTION_KEY || undefined,
  language: process.env.LANGUAGE || 'en',
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  metricsPort: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 9090,
  rpcHealthCheckIntervalMs: process.env.RPC_HEALTH_CHECK_INTERVAL_MS ? parseInt(process.env.RPC_HEALTH_CHECK_INTERVAL_MS, 10) : undefined,
  rpcLatencyThresholdMs: process.env.RPC_LATENCY_THRESHOLD_MS ? parseInt(process.env.RPC_LATENCY_THRESHOLD_MS, 10) : undefined,
  restrictedAddresses: process.env.RESTRICTED_ADDRESSES || undefined,
  restrictedAddressesFile: process.env.RESTRICTED_ADDRESSES_FILE || undefined,
  rateLimitMax: process.env.RATE_LIMIT_MAX,
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  ipcEncryptionKey: process.env.PULSAR_IPC_ENCRYPTION_KEY || undefined,
  language: process.env.LANGUAGE || 'en',
  auditLogPath: process.env.AUDIT_LOG_PATH || 'audit.log',
  stellarCliPath: process.env.STELLAR_CLI_PATH || "stellar",
  logLevel: process.env.LOG_LEVEL || "info",
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  metricsPort: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 9090,
  rpcHealthCheckIntervalMs: process.env.RPC_HEALTH_CHECK_INTERVAL_MS ? parseInt(process.env.RPC_HEALTH_CHECK_INTERVAL_MS, 10) : undefined,
  rpcLatencyThresholdMs: process.env.RPC_LATENCY_THRESHOLD_MS ? parseInt(process.env.RPC_LATENCY_THRESHOLD_MS, 10) : undefined,
  restrictedAddresses: process.env.RESTRICTED_ADDRESSES || undefined,
  restrictedAddressesFile: process.env.RESTRICTED_ADDRESSES_FILE || undefined,
};

// Validate environment variables
const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment variables:',
    JSON.stringify(parsed.error.format(), null, 2)
  );
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  logger.fatal({ validationErrors: parsed.error.format() }, 'Invalid environment variables');
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof configSchema>;

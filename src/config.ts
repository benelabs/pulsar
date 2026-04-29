import dotenv from "dotenv";
import { z } from "zod";

// Load .env if present
dotenv.config();

const configSchema = z.object({
  stellarNetwork: z.enum(["mainnet", "testnet", "futurenet", "custom"]).default("testnet"),
  horizonUrl: z.string().url().optional(),
  sorobanRpcUrl: z.string().url().optional(),
  sorobanRpcUrls: z.array(z.string().url()).optional().describe("Array of Soroban RPC endpoints for latency-based routing (preferred over sorobanRpcUrl)"),
  stellarSecretKey: z.string().startsWith("S").length(56).optional(),
  stellarCliPath: z.string().default("stellar"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  rpcHealthCheckIntervalMs: z.number().int().min(5000).max(300000).default(30000).optional(),
  rpcLatencyThresholdMs: z.number().int().min(100).max(10000).default(2000).optional(),
});

const rawConfig = {
  stellarNetwork: process.env.STELLAR_NETWORK,
  horizonUrl: process.env.HORIZON_URL || undefined,
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || undefined,
  sorobanRpcUrls: process.env.SOROBAN_RPC_URLS ? process.env.SOROBAN_RPC_URLS.split(",").map((u: string) => u.trim()).filter((u: string) => u.length > 0) : undefined,
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || undefined,
  stellarCliPath: process.env.STELLAR_CLI_PATH || "stellar",
  logLevel: process.env.LOG_LEVEL || "info",
  rpcHealthCheckIntervalMs: process.env.RPC_HEALTH_CHECK_INTERVAL_MS ? parseInt(process.env.RPC_HEALTH_CHECK_INTERVAL_MS, 10) : undefined,
  rpcLatencyThresholdMs: process.env.RPC_LATENCY_THRESHOLD_MS ? parseInt(process.env.RPC_LATENCY_THRESHOLD_MS, 10) : undefined,
};

// Validate environment variables
const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof configSchema>;

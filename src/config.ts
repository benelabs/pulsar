import dotenv from "dotenv";
import { z } from "zod";

// Load .env if present
dotenv.config();

const configSchema = z.object({
  stellarNetwork: z.enum(["mainnet", "testnet", "futurenet", "custom"]).default("testnet"),
  horizonUrl: z.string().url().optional(),
  sorobanRpcUrl: z.string().url().optional(),
  stellarSecretKey: z.string().startsWith("S").length(56).optional(),
  stellarCliPath: z.string().default("stellar"),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  metricsEnabled: z.boolean().default(true),
  metricsPort: z.number().int().min(1).max(65535).default(9090),
});

const rawConfig = {
  stellarNetwork: process.env.STELLAR_NETWORK,
  horizonUrl: process.env.HORIZON_URL || undefined,
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || undefined,
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || undefined,
  stellarCliPath: process.env.STELLAR_CLI_PATH || "stellar",
  logLevel: process.env.LOG_LEVEL || "info",
  metricsEnabled: process.env.METRICS_ENABLED !== "false",
  metricsPort: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT, 10) : 9090,
};

// Validate environment variables
const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;

export type Config = z.infer<typeof configSchema>;

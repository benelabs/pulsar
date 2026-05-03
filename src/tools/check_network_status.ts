/**
 * Tool: check_network_status
 *
 * Probes Horizon and Soroban RPC connectivity for the configured (or specified)
 * network and returns a structured diagnostic report. Useful for debugging
 * connectivity issues before submitting or simulating transactions.
 */

import { config } from "../config.js";
import { CheckNetworkStatusInputSchema } from "../schemas/tools.js";
import { checkNetworkStatus } from "../services/network-monitor.js";
import { PulsarValidationError, PulsarPartitionError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export const checkNetworkStatusTool: McpToolHandler<
  typeof CheckNetworkStatusInputSchema
> = async (input: unknown) => {
  const validatedInput = CheckNetworkStatusInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for check_network_status",
      validatedInput.error.format()
    );
  }

  const { network, timeout_ms } = validatedInput.data;
  const resolvedNetwork = network ?? config.stellarNetwork;

  const result = await checkNetworkStatus(resolvedNetwork, timeout_ms);

  // Surface a PulsarPartitionError so callers can distinguish partition failures
  // from other errors — but still return the full diagnostic payload.
  if (result.partition_severity === "full") {
    throw new PulsarPartitionError(result.summary, {
      partition_severity: result.partition_severity,
      horizon: result.horizon,
      soroban_rpc: result.soroban_rpc,
      remediation: result.remediation,
      network: result.network,
    });
  }

  return {
    status: result.partition_severity === "none" ? "healthy" : "degraded",
    ...result,
  };
};

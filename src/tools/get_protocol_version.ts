import { config } from "../config.js";
import { GetProtocolVersionInputSchema } from "../schemas/tools.js";
import { getHorizonServer } from "../services/horizon.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import type { McpToolHandler } from "../types.js";

export interface ProtocolVersionInfo {
  protocol_version: number;
  horizon_version: string;
  network: string;
  core_version?: string;
  timestamp: string;
}

export interface GetProtocolVersionOutput {
  network: string;
  protocol_version: number;
  horizon_version: string;
  core_version?: string;
  supported_features: string[];
  timestamp: string;
}

/**
 * Tool: get_protocol_version
 * Queries Horizon for the current Stellar protocol version and network information.
 * Returns structured JSON with version details and supported features.
 */
export const getProtocolVersion: McpToolHandler<
  typeof GetProtocolVersionInputSchema
> = async (input: unknown) => {
  // Validate input schema
  const validatedInput = GetProtocolVersionInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for get_protocol_version",
      validatedInput.error.format()
    );
  }

  const { network } = validatedInput.data;
  const server = getHorizonServer(network ?? config.stellarNetwork);
  const targetNetwork = network ?? config.stellarNetwork;

  try {
    // Get the latest ledger to extract protocol version
    const latestLedger = await server
      .ledgers()
      .order("desc")
      .limit(1)
      .call();

    if (!latestLedger || latestLedger.records.length === 0) {
      throw new PulsarNetworkError(
        "Unable to retrieve latest ledger information",
        { network: targetNetwork }
      );
    }

    const ledger = latestLedger.records[0];
    const protocolVersion = ledger.protocol_version;
    
    // Get Horizon server information
    const horizonResponse = await server.root();
    const horizonVersion = horizonResponse.horizon_version || "unknown";
    const coreVersion = horizonResponse.core_version;

    // Determine supported features based on protocol version
    const supportedFeatures = getSupportedFeatures(protocolVersion);

    return {
      network: targetNetwork,
      protocol_version: protocolVersion,
      horizon_version: horizonVersion,
      core_version: coreVersion,
      supported_features: supportedFeatures,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    if (err instanceof PulsarValidationError) {
      throw err;
    }

    // Handle network connectivity issues
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      throw new PulsarNetworkError(
        `Unable to connect to Horizon server for network: ${targetNetwork}`,
        { network: targetNetwork, originalError: err }
      );
    }

    // Handle API rate limiting
    if (err.response && err.response.status === 429) {
      throw new PulsarNetworkError(
        "Horizon API rate limit exceeded. Please try again later.",
        { status: 429, network: targetNetwork }
      );
    }

    // Handle other HTTP errors
    if (err.response) {
      throw new PulsarNetworkError(
        `Horizon API error: ${err.response.statusText || 'Unknown error'}`,
        { 
          status: err.response.status, 
          network: targetNetwork,
          originalError: err 
        }
      );
    }

    throw new PulsarNetworkError(
      err.message || "Failed to retrieve protocol version information",
      { network: targetNetwork, originalError: err }
    );
  }
};

/**
 * Returns a list of supported features based on protocol version
 */
function getSupportedFeatures(protocolVersion: number): string[] {
  const features: string[] = [];
  
  // Base features available in all modern protocols
  features.push("basic_transactions", "multi_signature", "payment_channels");
  
  // Protocol 11+ features
  if (protocolVersion >= 11) {
    features.push("soroban_smart_contracts", "footprint_expiration", "fee_bumps");
  }
  
  // Protocol 12+ features  
  if (protocolVersion >= 12) {
    features.push("liquidity_pools", "claimable_balances");
  }
  
  // Protocol 13+ features
  if (protocolVersion >= 13) {
    features.push("contract_data_ttl", "contract_instance_storage");
  }
  
  // Protocol 14+ features
  if (protocolVersion >= 14) {
    features.push("smart_contract_auth", "envelope_types");
  }
  
  // Protocol 15+ features
  if (protocolVersion >= 15) {
    features.push("contract_cost_model", "cpu_instructions");
  }
  
  // Protocol 16+ features
  if (protocolVersion >= 16) {
    features.push("stellar_asset_contract", "wasm_v2");
  }
  
  // Protocol 17+ features (latest as of 2024)
  if (protocolVersion >= 17) {
    features.push("complex_contract_auth", "enhanced_fee_structures");
  }
  
  return features;
}

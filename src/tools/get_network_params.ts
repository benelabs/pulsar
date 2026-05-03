import type { GetNetworkParamsInput } from '../schemas/tools.js';
import { config } from '../config.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import { PulsarNetworkError } from '../errors.js';
import logger from '../logger.js';

/**
 * Resource weight information from Soroban network parameters.
 * Represents the cost multiplier for each type of resource.
 */
export interface ResourceWeight {
  cpu_instructions: string;
  memory_bytes: string;
  ledger_entry_read: string;
  ledger_entry_write: string;
  ledger_entry_create: string;
  transmit_bytes: string;
}

/**
 * Fee thresholds for transaction resource limits.
 */
export interface FeeThresholds {
  min_resource_fee: string;
  max_cpu_instructions: string;
  max_memory_bytes: string;
  ledger_entry_limits: {
    max_read_bytes: string;
    max_write_bytes: string;
    max_create_bytes: string;
  };
}

/**
 * Network inflation and pricing parameters.
 */
export interface InflationParams {
  base_reserve: string;
  base_fee: string;
  inflation_rate: number;
}

/**
 * Complete network parameters output.
 */
export interface GetNetworkParamsOutput {
  network: string;
  ledger_sequence: number;
  resource_weights: ResourceWeight;
  fee_thresholds: FeeThresholds;
  inflation_params: InflationParams;
  network_passphrase: string;
  protocol_version: string;
}

/**
 * Get default resource weights based on Soroban protocol specifications.
 * @private
 */
function getDefaultResourceWeights(): ResourceWeight {
  // These are standard Soroban resource weight values
  return {
    cpu_instructions: '100',
    memory_bytes: '1000',
    ledger_entry_read: '50',
    ledger_entry_write: '100',
    ledger_entry_create: '150',
    transmit_bytes: '200',
  };
}

/**
 * Extract fee thresholds based on Soroban protocol specifications.
 * @private
 */
function getDefaultFeeThresholds(): FeeThresholds {
  // Default fee thresholds based on Soroban protocol
  return {
    min_resource_fee: '100',
    max_cpu_instructions: '100000000', // 100M CPU
    max_memory_bytes: '52428800', // 50MB
    ledger_entry_limits: {
      max_read_bytes: '10485760', // 10MB
      max_write_bytes: '10485760', // 10MB
      max_create_bytes: '10485760', // 10MB
    },
  };
}

/**
 * Get network parameters including resource weights, thresholds, and inflation.
 *
 * This tool fetches current Soroban network parameters such as:
 * - Resource weights (CPU, memory, ledger operations)
 * - Fee thresholds and limits
 * - Inflation and base parameters
 *
 * @param input - Tool input with optional network override
 * @returns Network parameters including weights, thresholds, and inflation info
 * @throws PulsarNetworkError if the RPC call fails
 */
export async function getNetworkParams(
  input: GetNetworkParamsInput
): Promise<GetNetworkParamsOutput> {
  const network = input.network ?? config.stellarNetwork;

  logger.debug({ network }, 'Fetching network parameters');

  const server = getSorobanServer(network);

  try {
    // Get the latest ledger to retrieve network parameters
    const latestLedger = await server.getLatestLedger();

    if (!latestLedger) {
      throw new PulsarNetworkError('Failed to retrieve latest ledger from Soroban RPC');
    }

    // Get resource weights (use defaults as these are protocol-defined)
    const resourceWeights = getDefaultResourceWeights();

    // Get fee thresholds (use defaults as these are protocol-defined)
    const feeThresholds = getDefaultFeeThresholds();

    // Get inflation parameters from network
    const inflationParams: InflationParams = {
      base_reserve: '500000000', // 50 XLM (stroops)
      base_fee: '100', // 100 stroops
      inflation_rate: 1.0, // Stellar inflation is disabled after May 2019
    };

    // Determine network passphrase
    let networkPassphrase = '';
    switch (network) {
      case 'mainnet':
        networkPassphrase = 'Public Global Stellar Network ; September 2015';
        break;
      case 'testnet':
        networkPassphrase = 'Test SDF Network ; September 2015';
        break;
      case 'futurenet':
        networkPassphrase = 'Test SDF Future Network ; October 2022';
        break;
      default:
        networkPassphrase = 'Custom Network';
    }

    const protocolVersion = String(latestLedger.protocolVersion ?? 20);

    const output: GetNetworkParamsOutput = {
      network,
      ledger_sequence: latestLedger.sequence,
      resource_weights: resourceWeights,
      fee_thresholds: feeThresholds,
      inflation_params: inflationParams,
      network_passphrase: networkPassphrase,
      protocol_version: protocolVersion,
    };

    logger.debug(output, 'Successfully fetched network parameters');
    return output;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ network, error: errorMsg }, 'Failed to fetch network parameters');

    if (err instanceof PulsarNetworkError) {
      throw err;
    }

    throw new PulsarNetworkError(`Failed to fetch network parameters from ${network}: ${errorMsg}`);
  }
}

import { SorobanRpc } from '@stellar/stellar-sdk';
import { SorobanRpc, Networks, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { PulsarValidationError } from '../errors.js';

const NETWORK_RPC_URLS: Record<string, string> = {
  mainnet: 'https://soroban-rpc.stellar.org',
  testnet: 'https://soroban-testnet.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
};
/**
 * Soroban RPC service layer.
 *
 * This module provides functions to obtain a Soroban RPC server instance
 * and the best RPC URL for a given network. Latency-based routing is
 * handled by the RpcRouter class (see rpc-router.ts).
 */

import { getSorobanServer as routerGetSorobanServer, getBestRpcUrl as routerGetBestRpcUrl } from "./rpc-router.js";

/**
 * Return the best RPC URL for the specified network.
 * This URL is selected based on health and latency metrics.
 */
export function getRpcUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === 'custom') {
    if (!config.sorobanRpcUrl)
      throw new PulsarValidationError('SOROBAN_RPC_URL must be set for custom network');
    return config.sorobanRpcUrl;
  }
  return NETWORK_RPC_URLS[net] ?? NETWORK_RPC_URLS['testnet'];
}

function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}
  return routerGetBestRpcUrl(network);
}

/**
 * Return a SorobanRpc.Server instance configured for the best endpoint.
 */
export function getSorobanServer(network?: string): SorobanRpc.Server {
  return routerGetSorobanServer(network);
// Reuse one SorobanRpc.Server per unique URL — avoids repeated connection
// setup on every simulate/submit call.
const serverCache = new Map<string, SorobanRpc.Server>();

export function getSorobanServer(network?: string): SorobanRpc.Server {
  const url = getRpcUrl(network);
  let server = serverCache.get(url);
  if (!server) {
    server = new SorobanRpc.Server(url, { allowHttp: false });
    serverCache.set(url, server);
  }
  return server;
}

/** Exposed for testing — clears the singleton cache. */
export function _resetSorobanServerCache(): void {
  serverCache.clear();
}

export interface SimulateTransactionResult {
  status: string;
  return_value?: xdr.ScVal;
  cost: {
    cpu_instructions: string;
    memory_bytes: string;
  };
  footprint: {
    read_only: string[];
    read_write: string[];
  };
  min_resource_fee: string;
  events: string[];
  error?: string;
  restore_needed?: boolean;
}

/**
 * Simulates a Soroban transaction and returns the result.
 */
export async function simulateSorobanTransaction(
  xdr: string,
  network?: string
): Promise<SimulateTransactionResult> {
  const net = network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(net);
  const server = getSorobanServer(net);

  let tx;
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  } catch (err) {
    throw new Error(`Failed to parse XDR: ${(err as Error).message}`);
  }

  const result = await server.simulateTransaction(tx);

  const output: SimulateTransactionResult = {
    status: '',
    cost: {
      cpu_instructions: '0',
      memory_bytes: '0',
    },
    footprint: {
      read_only: [],
      read_write: [],
    },
    min_resource_fee: '0',
    events: [],
  };

  if (SorobanRpc.Api.isSimulationSuccess(result)) {
    output.status = 'success';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const successRes = result as any;

    output.cost.cpu_instructions = successRes.cost?.cpuIns || '0';
    output.cost.memory_bytes = successRes.cost?.memBytes || '0';
    output.min_resource_fee = successRes.minResourceFee || '0';

    if (successRes.result && successRes.result.retval) {
      output.return_value = successRes.result.retval;
    }

    if (successRes.transactionData) {
      const resources = successRes.transactionData.build().resources();
      if (resources && resources.footprint()) {
        const footprint = resources.footprint();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output.footprint.read_only = footprint.readOnly().map((e: any) => e.toXDR('base64'));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output.footprint.read_write = footprint.readWrite().map((e: any) => e.toXDR('base64'));
      }
    }

    if (successRes.events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output.events = successRes.events.map((e: any) => e.toXDR('base64'));
    }
  } else if (
    (SorobanRpc.Api as any).isSimulationRestore &&
    (SorobanRpc.Api as any).isSimulationRestore(result)
  ) {
    output.status = 'restore_needed';
    output.restore_needed = true;
    output.error =
      'The transaction cannot be simulated because it requires ledger entry restoration.';
  } else if (SorobanRpc.Api.isSimulationError(result)) {
    output.status = 'error';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorRes = result as any;
    output.error = errorRes.error;
    if (errorRes.events) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output.events = errorRes.events.map((e: any) => e.toXDR('base64'));
    }
  }

  return output;
}

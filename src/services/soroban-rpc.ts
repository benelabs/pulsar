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
  return routerGetBestRpcUrl(network);
}

/**
 * Return a SorobanRpc.Server instance configured for the best endpoint.
 */
export function getSorobanServer(network?: string): SorobanRpc.Server {
  return routerGetSorobanServer(network);
}

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

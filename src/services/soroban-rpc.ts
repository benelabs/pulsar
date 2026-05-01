import { SorobanRpc } from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { PulsarValidationError } from "../errors.js";

const NETWORK_RPC_URLS: Record<string, string> = {
  mainnet: "https://soroban-rpc.stellar.org",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

export function getRpcUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === "custom") {
    if (!config.sorobanRpcUrl) throw new PulsarValidationError("SOROBAN_RPC_URL must be set for custom network");
    return config.sorobanRpcUrl;
  }
  return NETWORK_RPC_URLS[net] ?? NETWORK_RPC_URLS["testnet"];
}

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

import { SorobanRpc } from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { PulsarValidationError } from "../errors.js";

const NETWORK_RPC_URLS: Record<string, string> = {
  mainnet: "https://soroban-rpc.stellar.org",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

const rpcCache = new Map<string, SorobanRpc.Server>();

export function getRpcUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === "custom") {
    if (!config.sorobanRpcUrl) throw new PulsarValidationError("SOROBAN_RPC_URL must be set for custom network");
    return config.sorobanRpcUrl;
  }
  return NETWORK_RPC_URLS[net] ?? NETWORK_RPC_URLS["testnet"];
}


export function getSorobanServer(network?: string): SorobanRpc.Server {
  const net = network ?? config.stellarNetwork;
  const cacheKey = net;

  if (!rpcCache.has(cacheKey)) {
    const server = new SorobanRpc.Server(getRpcUrl(network), { allowHttp: false });
    rpcCache.set(cacheKey, server);
  }

  return rpcCache.get(cacheKey)!;
}

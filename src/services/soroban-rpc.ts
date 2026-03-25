import { SorobanRpc } from "@stellar/stellar-sdk";
import { config } from "../config.js";

const NETWORK_RPC_URLS: Record<string, string> = {
  mainnet: "https://soroban-rpc.stellar.org",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

export function getRpcUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === "custom") {
    if (!config.sorobanRpcUrl) throw new Error("SOROBAN_RPC_URL must be set for custom network");
    return config.sorobanRpcUrl;
  }
  return NETWORK_RPC_URLS[net] ?? NETWORK_RPC_URLS["testnet"];
}

export function getSorobanServer(network?: string): SorobanRpc.Server {
  return new SorobanRpc.Server(getRpcUrl(network), { allowHttp: false });
}

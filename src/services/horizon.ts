import { Horizon } from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { PulsarValidationError } from "../errors.js";

const NETWORK_HORIZON_URLS: Record<string, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
};

const horizonCache = new Map<string, Horizon.Server>();

export function getHorizonUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === "custom") {
    if (!config.horizonUrl) throw new PulsarValidationError("HORIZON_URL must be set for custom network");
    return config.horizonUrl;
  }
  return NETWORK_HORIZON_URLS[net] ?? NETWORK_HORIZON_URLS["testnet"];
}

export function getHorizonServer(network?: string): Horizon.Server {
  const net = network ?? config.stellarNetwork;
  const cacheKey = net;

  if (!horizonCache.has(cacheKey)) {
    const server = new Horizon.Server(getHorizonUrl(network), { allowHttp: true });
    horizonCache.set(cacheKey, server);
  }

  return horizonCache.get(cacheKey)!;
}

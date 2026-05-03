import { Horizon } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { PulsarValidationError } from '../errors.js';

const NETWORK_HORIZON_URLS: Record<string, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
  futurenet: 'https://horizon-futurenet.stellar.org',
};

export function getHorizonUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  if (net === 'custom') {
    if (!config.horizonUrl)
      throw new PulsarValidationError('HORIZON_URL must be set for custom network');
    return config.horizonUrl;
  }
  return NETWORK_HORIZON_URLS[net] ?? NETWORK_HORIZON_URLS['testnet'];
}

// Reuse one Horizon.Server per unique URL — avoids repeated TLS handshakes
// and connection pool creation on every tool call.
const serverCache = new Map<string, Horizon.Server>();

export function getHorizonServer(network?: string): Horizon.Server {
  const url = getHorizonUrl(network);
  let server = serverCache.get(url);
  if (!server) {
    server = new Horizon.Server(url, { allowHttp: true });
    serverCache.set(url, server);
  }
  return server;
}

/** Exposed for testing — clears the singleton cache. */
export function _resetHorizonServerCache(): void {
  serverCache.clear();
}

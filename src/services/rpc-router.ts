import { config } from "../config.js";
import { PulsarValidationError } from "../errors.js";
import { SorobanRpc } from "@stellar/stellar-sdk";

const NETWORK_RPC_URLS: Record<string, string> = {
  mainnet: "https://soroban-rpc.stellar.org",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

interface EndpointInfo {
  url: string;
  healthy: boolean;
  lastLatencyMs: number;
  lastCheck: number;
  error?: string;
}

type HealthCheckFn = (server: SorobanRpc.Server) => Promise<boolean>;

export class RpcRouter {
  private endpoints: EndpointInfo[];
  private healthCheckIntervalId?: NodeJS.Timeout;
  private readonly healthCheckIntervalMs: number;
  private readonly latencyThresholdMs: number;
  private readonly network: string;

  constructor(network: string, endpoints: string[], healthCheckIntervalMs: number, latencyThresholdMs: number) {
    this.network = network;
    this.endpoints = endpoints.map((url) => ({
      url,
      healthy: true,
      lastLatencyMs: 0,
      lastCheck: 0,
    }));
    this.healthCheckIntervalMs = healthCheckIntervalMs;
    this.latencyThresholdMs = latencyThresholdMs;

    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Run the health check for a single endpoint.
   * Updates the endpoint's health and latency metrics.
   */
  private async healthCheck(endpoint: EndpointInfo): Promise<void> {
    // Use SorobanRpc.Server to make a lightweight RPC call
    const server = new SorobanRpc.Server(endpoint.url, { allowHttp: false });
    const start = Date.now();
    try {
      // Use a timeout to avoid hanging on dead endpoints
      const timeoutMs = Math.min(this.latencyThresholdMs * 2, 5000);
      const result = await Promise.race([
        server.getLatestLedger(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
      ]);

      // If we got a response, even if it's error-like, we consider it reachable
      const latency = Date.now() - start;
      endpoint.lastLatencyMs = latency;
      endpoint.healthy = latency <= this.latencyThresholdMs && latency > 0;
      endpoint.error = undefined;
    } catch (err: any) {
      endpoint.healthy = false;
      endpoint.lastLatencyMs = Infinity;
      endpoint.error = err?.message ?? "Health check failed";
    } finally {
      endpoint.lastCheck = Date.now();
    }
  }

  /**
   * Perform asynchronous health checks on all endpoints.
   * Errors are caught per-endpoint; they don't abort the batch.
   */
  private async healthCheckAll(): Promise<void> {
    await Promise.all(this.endpoints.map((ep) => this.healthCheck(ep).catch(() => {})));
  }

  /**
   * Start the periodic health check loop.
   * The initial check runs after a brief delay to avoid blocking construction.
   */
  private startHealthChecks(): void {
    // Run first health check quickly (1s) to get initial metrics
    setTimeout(() => {
      this.healthCheckAll().catch(() => {});
    }, 1000);

    // Schedule recurring health checks
    this.healthCheckIntervalId = setInterval(() => {
      this.healthCheckAll().catch(() => {});
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop health checks (for testing or shutdown).
   */
  stop(): void {
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = undefined;
    }
  }

  /**
   * Return the URL of the fastest healthy endpoint.
   * If no endpoints are currently healthy, returns the first endpoint URL.
   */
  getBestUrl(): string {
    const healthy = this.endpoints.filter((ep) => ep.healthy);
    const candidates = healthy.length > 0 ? healthy : this.endpoints;

    if (candidates.length === 0) {
      // Fallback to network default
      return NETWORK_RPC_URLS[this.network] ?? NETWORK_RPC_URLS.testnet;
    }

    // Sort by latency (ascending) and return the fastest
    candidates.sort((a, b) => a.lastLatencyMs - b.lastLatencyMs);
    return candidates[0].url;
  }

  /**
   * Return a new SorobanRpc.Server instance pointed at the best endpoint.
   */
  getServer(): SorobanRpc.Server {
    const url = this.getBestUrl();
    return new SorobanRpc.Server(url, { allowHttp: false });
  }

  /**
   * Return raw metrics for diagnostic purposes.
   */
  getMetrics(): EndpointInfo[] {
    return [...this.endpoints];
  }
}

/**
 * Global registry of routers per network.
 */
const routers = new Map<string, RpcRouter>();

/**
 * Get or create the RPC router for a given network.
 */
function getRouter(network: string): RpcRouter {
  // Validate custom network configuration
  if (network === "custom") {
    if (!config.sorobanRpcUrl && (!config.sorobanRpcUrls || config.sorobanRpcUrls.length === 0)) {
      throw new PulsarValidationError("SOROBAN_RPC_URL must be set for custom network");
    }
  }

  let router = routers.get(network);
  if (!router) {
    const healthCheckIntervalMs = config.rpcHealthCheckIntervalMs ?? 30000;
    const latencyThresholdMs = config.rpcLatencyThresholdMs ?? 2000;

    // Build candidate endpoint list:
    // 1. If config.sorobanRpcUrls (array) is provided, use it.
    // 2. Else if config.sorobanRpcUrl is provided, wrap in array.
    // 3. Else fall back to the predefined network default.
    let endpoints: string[];
    if (config.sorobanRpcUrls && config.sorobanRpcUrls.length > 0) {
      endpoints = config.sorobanRpcUrls;
    } else if (config.sorobanRpcUrl) {
      endpoints = [config.sorobanRpcUrl];
    } else {
      // For non-custom networks this is safe; custom already validated above
      const defaultUrl = NETWORK_RPC_URLS[network] ?? NETWORK_RPC_URLS.testnet;
      endpoints = [defaultUrl];
    }

    router = new RpcRouter(network, endpoints, healthCheckIntervalMs, latencyThresholdMs);
    routers.set(network, router);
  }
  return router;
}

/**
 * Return the best RPC URL for the specified network.
 * This function is exported and used by other modules.
 */
export function getBestRpcUrl(network?: string): string {
  const net = network ?? config.stellarNetwork;
  return getRouter(net).getBestUrl();
}

/**
 * Return a SorobanRpc.Server instance pointed at the best RPC endpoint for the network.
 */
export function getSorobanServer(network?: string): SorobanRpc.Server {
  return getRouter(network ?? config.stellarNetwork).getServer();
}

/**
 * Network Partition Detection Service
 *
 * Probes Horizon and Soroban RPC endpoints to detect connectivity issues,
 * classify failure modes, and surface actionable diagnostics for AI assistants.
 *
 * Design principles:
 * - All probes are time-bounded (configurable timeout, default 8 s)
 * - No secrets are logged or returned
 * - Results are structured for direct AI consumption
 * - Follows existing service patterns (getRpcUrl / getHorizonUrl)
 */

import { getHorizonUrl } from "./horizon.js";
import { getRpcUrl } from "./soroban-rpc.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type EndpointStatus = "reachable" | "timeout" | "unreachable" | "degraded";

export interface EndpointProbeResult {
  /** Human-readable endpoint URL (no secrets) */
  url: string;
  /** Connectivity verdict */
  status: EndpointStatus;
  /** Round-trip latency in milliseconds, or null when unreachable */
  latency_ms: number | null;
  /** HTTP status code returned by the endpoint, or null */
  http_status: number | null;
  /** Short diagnostic message */
  message: string;
  /** ISO-8601 timestamp of the probe */
  probed_at: string;
}

export type PartitionSeverity = "none" | "partial" | "full";

export interface NetworkStatusResult {
  /** Overall partition severity */
  partition_severity: PartitionSeverity;
  /** True when at least one endpoint is reachable */
  any_reachable: boolean;
  /** Horizon probe result */
  horizon: EndpointProbeResult;
  /** Soroban RPC probe result */
  soroban_rpc: EndpointProbeResult;
  /** Human-readable summary for AI assistants */
  summary: string;
  /** Actionable remediation steps when issues are detected */
  remediation: string[];
  /** Network that was probed */
  network: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROBE_TIMEOUT_MS = 8_000;

/**
 * Classify a raw fetch error into an EndpointStatus.
 * Covers ECONNREFUSED, ENOTFOUND, AbortError (timeout), and generic failures.
 */
function classifyFetchError(err: unknown): { status: EndpointStatus; message: string } {
  if (err instanceof Error) {
    const name = err.name;
    const msg = err.message.toLowerCase();

    if (name === "AbortError" || msg.includes("aborted") || msg.includes("timeout")) {
      return { status: "timeout", message: "Request timed out — endpoint may be overloaded or unreachable" };
    }
    if (
      msg.includes("econnrefused") ||
      msg.includes("connection refused") ||
      msg.includes("enotfound") ||
      msg.includes("failed to fetch") ||
      msg.includes("network request failed") ||
      msg.includes("fetch failed")
    ) {
      return { status: "unreachable", message: `Connection failed: ${err.message}` };
    }
    return { status: "unreachable", message: err.message };
  }
  return { status: "unreachable", message: String(err) };
}

/**
 * Probe a single HTTP endpoint.
 *
 * For Horizon we hit /fee_stats (lightweight, always available).
 * For Soroban RPC we send a minimal JSON-RPC getHealth request.
 */
async function probeEndpoint(
  url: string,
  kind: "horizon" | "soroban_rpc",
  timeoutMs: number
): Promise<EndpointProbeResult> {
  const probed_at = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();

  try {
    let response: Response;

    if (kind === "horizon") {
      // Lightweight Horizon health probe
      response = await fetch(`${url}/fee_stats`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } else {
      // Soroban RPC JSON-RPC health probe
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] }),
      });
    }

    const latency_ms = Date.now() - start;
    clearTimeout(timer);

    if (response.ok) {
      return {
        url,
        status: "reachable",
        latency_ms,
        http_status: response.status,
        message: `Endpoint healthy (${latency_ms} ms)`,
        probed_at,
      };
    }

    // 5xx → degraded; 4xx → unreachable (misconfigured)
    const status: EndpointStatus = response.status >= 500 ? "degraded" : "unreachable";
    return {
      url,
      status,
      latency_ms,
      http_status: response.status,
      message: `Unexpected HTTP ${response.status}`,
      probed_at,
    };
  } catch (err) {
    clearTimeout(timer);
    const latency_ms = Date.now() - start;
    const { status, message } = classifyFetchError(err);
    logger.debug({ url, kind, status, message }, "Network probe failed");
    return {
      url,
      status,
      latency_ms: status === "timeout" ? latency_ms : null,
      http_status: null,
      message,
      probed_at,
    };
  }
}

/**
 * Derive partition severity from two probe results.
 *
 * - none    → both reachable
 * - partial → exactly one reachable
 * - full    → neither reachable
 */
function derivePartitionSeverity(
  horizon: EndpointProbeResult,
  soroban: EndpointProbeResult
): PartitionSeverity {
  const horizonOk = horizon.status === "reachable";
  const sorobanOk = soroban.status === "reachable";

  if (horizonOk && sorobanOk) return "none";
  if (horizonOk || sorobanOk) return "partial";
  return "full";
}

/**
 * Build a human-readable summary and remediation list from probe results.
 */
function buildDiagnostics(
  network: string,
  horizon: EndpointProbeResult,
  soroban: EndpointProbeResult,
  severity: PartitionSeverity
): { summary: string; remediation: string[] } {
  if (severity === "none") {
    return {
      summary: `All endpoints on ${network} are reachable. No partition detected.`,
      remediation: [],
    };
  }

  const issues: string[] = [];
  const remediation: string[] = [];

  if (horizon.status !== "reachable") {
    issues.push(`Horizon (${horizon.url}) is ${horizon.status}: ${horizon.message}`);
    remediation.push(
      horizon.status === "timeout"
        ? "Horizon is slow or overloaded — retry in a few seconds or switch to a fallback Horizon URL via HORIZON_URL."
        : "Check HORIZON_URL configuration and ensure the Horizon server is running and accessible."
    );
  }

  if (soroban.status !== "reachable") {
    issues.push(`Soroban RPC (${soroban.url}) is ${soroban.status}: ${soroban.message}`);
    remediation.push(
      soroban.status === "timeout"
        ? "Soroban RPC is slow or overloaded — retry in a few seconds or switch to a fallback RPC URL via SOROBAN_RPC_URL."
        : "Check SOROBAN_RPC_URL configuration and ensure the Soroban RPC node is running and accessible."
    );
  }

  if (severity === "full") {
    remediation.push(
      "Both endpoints are unreachable. Verify network connectivity, firewall rules, and DNS resolution.",
      `Confirm the correct network is configured (current: ${network}).`
    );
  }

  const summary =
    severity === "full"
      ? `Full network partition detected on ${network}: ${issues.join("; ")}`
      : `Partial network partition detected on ${network}: ${issues.join("; ")}`;

  return { summary, remediation };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Probe both Horizon and Soroban RPC endpoints for the given network and
 * return a structured NetworkStatusResult.
 *
 * @param network  - Stellar network name (mainnet | testnet | futurenet | custom)
 * @param timeoutMs - Per-probe timeout in milliseconds (default: 8 000)
 */
export async function checkNetworkStatus(
  network: string,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS
): Promise<NetworkStatusResult> {
  const horizonUrl = getHorizonUrl(network);
  const rpcUrl = getRpcUrl(network);

  logger.debug({ network, horizonUrl, rpcUrl, timeoutMs }, "Starting network partition detection probes");

  // Run both probes concurrently
  const [horizon, soroban_rpc] = await Promise.all([
    probeEndpoint(horizonUrl, "horizon", timeoutMs),
    probeEndpoint(rpcUrl, "soroban_rpc", timeoutMs),
  ]);

  const partition_severity = derivePartitionSeverity(horizon, soroban_rpc);
  const any_reachable = horizon.status === "reachable" || soroban_rpc.status === "reachable";
  const { summary, remediation } = buildDiagnostics(network, horizon, soroban_rpc, partition_severity);

  logger.info(
    { network, partition_severity, horizon_status: horizon.status, soroban_status: soroban_rpc.status },
    "Network partition detection complete"
  );

  return {
    partition_severity,
    any_reachable,
    horizon,
    soroban_rpc,
    summary,
    remediation,
    network,
  };
}

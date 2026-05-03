import * as promClient from 'prom-client';
import logger from '../logger.js';

/**
 * Prometheus metrics service for monitoring Pulsar MCP server.
 * Tracks tool invocations, errors, duration, and system metrics.
 */

// Default metrics (includes process metrics)
promClient.collectDefaultMetrics({ prefix: 'pulsar_' });

// ─── Tool Metrics ────────────────────────────────────────────────────────────

/**
 * Counter for total tool invocations
 */
export const toolInvocationsTotal = new promClient.Counter({
  name: 'pulsar_tool_invocations_total',
  help: 'Total number of tool invocations',
  labelNames: ['tool_name', 'status'],
});

/**
 * Histogram for tool execution duration in seconds
 */
export const toolDurationSeconds = new promClient.Histogram({
  name: 'pulsar_tool_duration_seconds',
  help: 'Tool execution duration in seconds',
  labelNames: ['tool_name'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

/**
 * Counter for tool execution errors
 */
export const toolErrorsTotal = new promClient.Counter({
  name: 'pulsar_tool_errors_total',
  help: 'Total number of tool execution errors',
  labelNames: ['tool_name', 'error_type'],
});

// ─── Validation Metrics ──────────────────────────────────────────────────────

/**
 * Counter for input validation errors
 */
export const validationErrorsTotal = new promClient.Counter({
  name: 'pulsar_validation_errors_total',
  help: 'Total number of input validation errors',
  labelNames: ['tool_name'],
});

// ─── Request Metrics ─────────────────────────────────────────────────────────

/**
 * Counter for total MCP requests processed
 */
export const mcpRequestsTotal = new promClient.Counter({
  name: 'pulsar_mcp_requests_total',
  help: 'Total number of MCP requests processed',
  labelNames: ['request_type'],
});

/**
 * Gauge for active tool invocations
 */
export const activeToolInvocations = new promClient.Gauge({
  name: 'pulsar_active_tool_invocations',
  help: 'Current number of active tool invocations',
  labelNames: ['tool_name'],
});

// ─── Memory Metrics ──────────────────────────────────────────────────────────

/**
 * Gauge for heap memory used in bytes
 */
export const heapMemoryUsedBytes = new promClient.Gauge({
  name: 'pulsar_heap_memory_used_bytes',
  help: 'Heap memory used in bytes',
});

/**
 * Gauge for total heap size in bytes
 */
export const heapMemoryTotalBytes = new promClient.Gauge({
  name: 'pulsar_heap_memory_total_bytes',
  help: 'Total heap memory size in bytes',
});

// ─── Network Metrics ─────────────────────────────────────────────────────────

/**
 * Counter for network requests made by the server
 */
export const networkRequestsTotal = new promClient.Counter({
  name: 'pulsar_network_requests_total',
  help: 'Total number of network requests made',
  labelNames: ['service', 'status'],
});

/**
 * Histogram for network request duration in seconds
 */
export const networkDurationSeconds = new promClient.Histogram({
  name: 'pulsar_network_duration_seconds',
  help: 'Network request duration in seconds',
  labelNames: ['service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

// ─── Metrics Management ──────────────────────────────────────────────────────

export interface MetricsSnapshot {
  timestamp: string;
  uptime_seconds: number;
  memory: {
    heap_used_bytes: number;
    heap_total_bytes: number;
    external_bytes: number;
    rss_bytes: number;
  };
  tools: Record<string, {
    invocations_total: number;
    errors_total: number;
    validation_errors: number;
    active_invocations: number;
    average_duration_ms: number;
  }>;
  mcp_requests_total: number;
}

/**
 * Get a snapshot of current metrics
 */
export function getMetricsSnapshot(): MetricsSnapshot {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  return {
    timestamp: new Date().toISOString(),
    uptime_seconds: uptime,
    memory: {
      heap_used_bytes: memUsage.heapUsed,
      heap_total_bytes: memUsage.heapTotal,
      external_bytes: memUsage.external,
      rss_bytes: memUsage.rss,
    },
    tools: {},
    mcp_requests_total: 0,
  };
}

/**
 * Record metrics to track memory usage periodically
 */
export function recordMemoryMetrics() {
  const memUsage = process.memoryUsage();
  heapMemoryUsedBytes.set(memUsage.heapUsed);
  heapMemoryTotalBytes.set(memUsage.heapTotal);
}

/**
 * Initialize periodic memory metrics recording
 */
export function startMetricsRecording() {
  // Record memory metrics every 10 seconds
  const interval = setInterval(() => {
    try {
      recordMemoryMetrics();
    } catch (error) {
      logger.warn({ error }, 'Failed to record memory metrics');
    }
  }, 10000);

  return interval;
}

/**
 * Get Prometheus metrics in text format
 */
export async function getPrometheusMetrics(): Promise<string> {
  recordMemoryMetrics();
  return promClient.register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  promClient.register.resetMetrics();
}

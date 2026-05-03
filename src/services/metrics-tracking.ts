import {
  toolInvocationsTotal,
  toolDurationSeconds,
  toolErrorsTotal,
  validationErrorsTotal,
  activeToolInvocations,
  networkRequestsTotal,
  networkDurationSeconds,
} from './metrics.js';
import { PulsarValidationError } from '../errors.js';

/**
 * Tracks a tool execution with timing and error reporting
 */
export async function trackToolExecution<T>(
  toolName: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  activeToolInvocations.labels(toolName).inc();

  try {
    const result = await handler();
    const duration = (Date.now() - startTime) / 1000;
    toolDurationSeconds.labels(toolName).observe(duration);
    toolInvocationsTotal.labels(toolName, 'success').inc();
    return result;
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    toolDurationSeconds.labels(toolName).observe(duration);

    // Categorize error types
    let errorType = 'unknown';
    if (error instanceof PulsarValidationError) {
      errorType = 'validation';
      validationErrorsTotal.labels(toolName).inc();
    } else if (error instanceof Error) {
      errorType = error.constructor.name;
    }

    toolErrorsTotal.labels(toolName, errorType).inc();
    toolInvocationsTotal.labels(toolName, 'error').inc();

    throw error;
  } finally {
    activeToolInvocations.labels(toolName).dec();
  }
}

export interface NetworkCall {
  service: string;
  duration_ms: number;
  status: 'success' | 'error';
}

/**
 * Tracks a network request (e.g., to Horizon or Soroban RPC)
 */
export function trackNetworkRequest(call: NetworkCall): void {
  const durationSeconds = call.duration_ms / 1000;
  networkDurationSeconds.labels(call.service).observe(durationSeconds);
  networkRequestsTotal.labels(call.service, call.status).inc();
}

/**
 * Wraps a network call with timing and error tracking
 */
export async function withNetworkTracking<T>(
  service: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await handler();
    trackNetworkRequest({
      service,
      duration_ms: Date.now() - startTime,
      status: 'success',
    });
    return result;
  } catch (error) {
    trackNetworkRequest({
      service,
      duration_ms: Date.now() - startTime,
      status: 'error',
    });
    throw error;
  }
}

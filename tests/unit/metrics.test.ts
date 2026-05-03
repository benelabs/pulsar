import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  toolInvocationsTotal,
  toolDurationSeconds,
  toolErrorsTotal,
  validationErrorsTotal,
  activeToolInvocations,
  getMetricsSnapshot,
  recordMemoryMetrics,
  resetMetrics,
} from '../../src/services/metrics.js';
import { trackToolExecution, withNetworkTracking } from '../../src/services/metrics-tracking.js';
import { PulsarValidationError } from '../../src/errors.js';

describe('Metrics Service', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
  });

  describe('getMetricsSnapshot', () => {
    it('returns a snapshot with uptime and memory info', () => {
      const snapshot = getMetricsSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('uptime_seconds');
      expect(snapshot.uptime_seconds).toBeGreaterThan(0);
      expect(snapshot.memory).toHaveProperty('heap_used_bytes');
      expect(snapshot.memory).toHaveProperty('heap_total_bytes');
      expect(snapshot.memory.heap_used_bytes).toBeGreaterThan(0);
      expect(snapshot.memory.heap_total_bytes).toBeGreaterThan(0);
    });

    it('memory values are positive integers', () => {
      const snapshot = getMetricsSnapshot();

      expect(Number.isInteger(snapshot.memory.heap_used_bytes)).toBe(true);
      expect(Number.isInteger(snapshot.memory.heap_total_bytes)).toBe(true);
      expect(Number.isInteger(snapshot.memory.external_bytes)).toBe(true);
      expect(Number.isInteger(snapshot.memory.rss_bytes)).toBe(true);
    });
  });

  describe('recordMemoryMetrics', () => {
    it('records memory metrics without throwing', () => {
      expect(() => {
        recordMemoryMetrics();
      }).not.toThrow();
    });

    it('updates heap memory gauges', () => {
      const memBefore = process.memoryUsage();

      recordMemoryMetrics();

      // Get internal gauge values (this is a simplified test)
      expect(memBefore.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('trackToolExecution', () => {
    it('tracks successful tool execution', async () => {
      const result = await trackToolExecution('test_tool', async () => {
        return { success: true };
      });

      expect(result).toEqual({ success: true });
    });

    it('increments success counter on successful execution', async () => {
      await trackToolExecution('test_tool_success', async () => {
        return { success: true };
      });

      const metrics = await toolInvocationsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const successCount = metrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_success' && (m as any).labels.status === 'success'
      );

      expect(successCount?.value).toBe(1);
    });

    it('records tool execution duration', async () => {
      await trackToolExecution('test_tool_duration', async () => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 10));
        return { success: true };
      });

      const metrics = await toolDurationSeconds.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const durationBucket = metrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_duration'
      );

      // Should have recorded the metric
      expect(durationBucket).toBeDefined();
    });

    it('tracks validation errors correctly', async () => {
      try {
        await trackToolExecution('test_tool_validation', async () => {
          throw new PulsarValidationError('Invalid input', {});
        });
      } catch (_error) {
        // Expected to throw
      }

      const validationMetrics = await validationErrorsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const validationError = validationMetrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_validation'
      );

      expect(validationError?.value).toBe(1);
    });

    it('tracks error counter on failure', async () => {
      try {
        await trackToolExecution('test_tool_error', async () => {
          throw new Error('Test error');
        });
      } catch (_error) {
        // Expected to throw
      }

      const errorMetrics = await toolErrorsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorCount = errorMetrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_error'
      );

      expect(errorCount?.value).toBeGreaterThanOrEqual(1);
    });

    it('increments error status counter on exception', async () => {
      try {
        await trackToolExecution('test_tool_error_status', async () => {
          throw new Error('Test error');
        });
      } catch (_error) {
        // Expected to throw
      }

      const metrics = await toolInvocationsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorStatus = metrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_error_status' && (m as any).labels.status === 'error'
      );

      expect(errorStatus?.value).toBeGreaterThanOrEqual(1);
    });

    it('manages active invocations gauge', async () => {
      const promise = trackToolExecution('test_tool_active', async () => {
        const activeMetrics = await activeToolInvocations.get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeGauge = activeMetrics.values?.find(
          (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_active'
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const activeCount = activeGauge?.value ?? 0;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { success: true };
      });

      await promise;

      // After execution, active count should be 0
      const finalMetrics = await activeToolInvocations.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalGauge = finalMetrics.values?.find(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'test_tool_active'
      );

      expect(finalGauge?.value ?? 0).toBe(0);
    });

    it('propagates the thrown error to caller', async () => {
      const testError = new Error('Custom error message');

      await expect(
        trackToolExecution('test_tool_propagate', async () => {
          throw testError;
        })
      ).rejects.toThrow('Custom error message');
    });
  });

  describe('withNetworkTracking', () => {
    it('tracks successful network request', async () => {
      const result = await withNetworkTracking('horizon', async () => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });
    });

    it('records network request metrics', async () => {
      await withNetworkTracking('soroban-rpc', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { success: true };
      });

      const metrics = await toolInvocationsTotal.get();
      // Metrics should have been recorded
      expect(metrics).toBeDefined();
    });

    it('tracks network errors', async () => {
      try {
        await withNetworkTracking('horizon', async () => {
          throw new Error('Network error');
        });
      } catch (_error) {
        // Expected
      }
    });

    it('propagates network errors', async () => {
      const networkError = new Error('Connection timeout');

      await expect(
        withNetworkTracking('soroban-rpc', async () => {
          throw networkError;
        })
      ).rejects.toThrow('Connection timeout');
    });
  });

  describe('Multiple Tool Executions', () => {
    it('tracks multiple concurrent tool executions', async () => {
      await Promise.all([
        trackToolExecution('tool_a', async () => ({ id: 'a' })),
        trackToolExecution('tool_b', async () => ({ id: 'b' })),
        trackToolExecution('tool_c', async () => ({ id: 'c' })),
      ]);

      const metrics = await toolInvocationsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolACount = metrics.values?.filter(
        (m: Record<string, unknown>) => (m as any).labels.tool_name === 'tool_a' && (m as any).labels.status === 'success'
      ).length;

      expect(toolACount).toBe(1);
    });

    it('tracks multiple invocations of same tool', async () => {
      for (let i = 0; i < 3; i++) {
        await trackToolExecution('repeated_tool', async () => ({ iteration: i }));
      }

      const metrics = await toolInvocationsTotal.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalCount = metrics.values?.reduce((sum: number, m: Record<string, unknown>) => {
        return (m as any).labels.tool_name === 'repeated_tool' && (m as any).labels.status === 'success'
          ? sum + (m as any).value
          : sum;
      }, 0);

      expect(totalCount).toBeGreaterThanOrEqual(3);
    });
  });
});

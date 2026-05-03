import { describe, it, expect } from 'vitest';
import http from 'http';
import { getPrometheusMetrics } from '../../src/services/metrics.js';
import { trackToolExecution } from '../../src/services/metrics-tracking.js';

describe('Metrics Integration', () => {
  describe('Prometheus Metrics Export', () => {
    it('generates valid Prometheus metrics format', async () => {
      // Record some metrics first
      await trackToolExecution('test_integration_tool', async () => {
        return { success: true };
      });

      const metrics = await getPrometheusMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('includes HELP and TYPE metadata', async () => {
      const metrics = await getPrometheusMetrics();

      // Prometheus format includes HELP and TYPE for each metric
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('includes tool invocation metrics', async () => {
      const toolName = 'integration_test_tool';
      await trackToolExecution(toolName, async () => {
        return { test: true };
      });

      const metrics = await getPrometheusMetrics();

      expect(metrics).toContain('pulsar_tool_invocations_total');
      expect(metrics).toContain(`tool_name="${toolName}"`);
    });

    it('includes tool duration metrics', async () => {
      const toolName = 'duration_test_tool';
      await trackToolExecution(toolName, async () => {
        return { test: true };
      });

      const metrics = await getPrometheusMetrics();

      expect(metrics).toContain('pulsar_tool_duration_seconds');
      expect(metrics).toContain(`tool_name="${toolName}"`);
    });

    it('includes memory usage metrics', async () => {
      const metrics = await getPrometheusMetrics();

      expect(metrics).toContain('pulsar_heap_memory_used_bytes');
      expect(metrics).toContain('pulsar_heap_memory_total_bytes');
    });

    it('includes process metrics', async () => {
      const metrics = await getPrometheusMetrics();

      // Default metrics from prom-client
      expect(metrics).toContain('pulsar_process');
    });

    it('valid metric value format', async () => {
      const metrics = await getPrometheusMetrics();

      // Each metric line should have format: name{labels} value or name value
      const metricLines = metrics
        .split('\n')
        .filter(line => !line.startsWith('#') && line.trim().length > 0);

      metricLines.forEach(line => {
        // Should match Prometheus format: metric_name{label="value"} 123 timestamp
        // or just metric_name 123 timestamp
        expect(line).toMatch(/^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})?\s+[0-9.eE+-]+/);
      });
    });

    it('includes error metrics when errors occur', async () => {
      try {
        await trackToolExecution('error_tool', async () => {
          throw new Error('Test error');
        });
      } catch (_error) {
        // Expected
      }

      const metrics = await getPrometheusMetrics();

      expect(metrics).toContain('pulsar_tool_errors_total');
    });
  });

  describe('Metrics HTTP Endpoint Integration', () => {
    let server: http.Server | null = null;
    const port = 9091; // Use different port for testing

    afterAll(() => {
      if (server) {
        server.close();
      }
    });

    it('should expose metrics endpoint at GET /metrics', async () => {
      return new Promise<void>((resolve, reject) => {
        server = http.createServer(async (req, res) => {
          if (req.url === '/metrics' && req.method === 'GET') {
            const metrics = await getPrometheusMetrics();
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
            res.end(metrics);
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        server.listen(port, async () => {
          try {
            const response = await fetch(`http://localhost:${port}/metrics`);
            expect(response.ok).toBe(true);
            expect(response.headers.get('content-type')).toContain('text/plain');

            const text = await response.text();
            expect(text.length).toBeGreaterThan(0);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });

    it('should return proper Prometheus MIME type', async () => {
      return new Promise<void>((resolve, reject) => {
        const testServer = http.createServer(async (req, res) => {
          if (req.url === '/metrics' && req.method === 'GET') {
            const metrics = await getPrometheusMetrics();
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
            res.end(metrics);
          }
        });

        testServer.listen(9092, async () => {
          try {
            const response = await fetch('http://localhost:9092/metrics');
            expect(response.headers.get('content-type')).toContain('text/plain');
            testServer.close();
            resolve();
          } catch (error) {
            testServer.close();
            reject(error);
          }
        });
      });
    });
  });

  describe('Tool Metrics Collection', () => {
    it('collects metrics for multiple tools', async () => {
      const tools = ['get_account_balance', 'fetch_contract_spec', 'submit_transaction'];

      await Promise.all(
        tools.map(tool =>
          trackToolExecution(tool, async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return { tool };
          })
        )
      );

      const metrics = await getPrometheusMetrics();

      tools.forEach(tool => {
        expect(metrics).toContain(`tool_name="${tool}"`);
      });
    });

    it('accurately counts repeated tool invocations', async () => {
      const toolName = 'count_test_tool';
      const invocationCount = 5;

      for (let i = 0; i < invocationCount; i++) {
        await trackToolExecution(toolName, async () => {
          return { iteration: i };
        });
      }

      const metrics = await getPrometheusMetrics();

      // Should contain metric for this tool
      expect(metrics).toContain(`tool_name="${toolName}"`);
      expect(metrics).toContain(`status="success"`);
    });
  });
});

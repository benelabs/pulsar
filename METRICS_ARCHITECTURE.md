# Prometheus Metrics - Technical Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Coding Assistant                           │
│              (Cursor / Claude / Windsurf)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP (stdio)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pulsar MCP Server                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Tool Execution Layer                             │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ CallToolRequest Handler                            │  │   │
│  │  │ ├─ trackToolExecution() [METRICS TRACKING]         │  │   │
│  │  │ │  ├─ Start timer                                  │  │   │
│  │  │ │  ├─ Increment active_tool_invocations gauge      │  │   │
│  │  │ │  ├─ Execute tool handler                         │  │   │
│  │  │ │  ├─ Record duration in histogram                 │  │   │
│  │  │ │  ├─ Increment success/error counter              │  │   │
│  │  │ │  └─ Decrement active_tool_invocations gauge      │  │   │
│  │  │ │                                                   │  │   │
│  │  │ └─ get_account_balance()                            │  │   │
│  │  │    └─ withNetworkTracking('horizon', ...)          │  │   │
│  │  │       └─ Track network request metrics             │  │   │
│  │  │                                                     │  │   │
│  │  │ └─ submit_transaction()                             │  │   │
│  │  │ └─ simulate_transaction()                           │  │   │
│  │  │ └─ fetch_contract_spec()                            │  │   │
│  │  │ └─ deploy_contract()                                │  │   │
│  │  │ └─ compute_vesting_schedule()                       │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         Service Layer                                   │   │
│  │  ├─ Horizon (REST API)                                  │   │
│  │  ├─ Soroban RPC (JSON-RPC)                              │   │
│  │  ├─ XDR Codec                                           │   │
│  │  └─ Stellar CLI                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │    Metrics Service (NEW)                                │   │
│  │  ├─ Prometheus Metrics Registry                         │   │
│  │  ├─ Tool Metrics                                        │   │
│  │  │  ├─ toolInvocationsTotal (counter)                   │   │
│  │  │  ├─ toolDurationSeconds (histogram)                  │   │
│  │  │  ├─ toolErrorsTotal (counter)                        │   │
│  │  │  └─ activeToolInvocations (gauge)                    │   │
│  │  ├─ Memory Metrics                                      │   │
│  │  │  ├─ heapMemoryUsedBytes (gauge)                      │   │
│  │  │  └─ heapMemoryTotalBytes (gauge)                     │   │
│  │  ├─ Network Metrics                                     │   │
│  │  │  ├─ networkRequestsTotal (counter)                   │   │
│  │  │  └─ networkDurationSeconds (histogram)               │   │
│  │  └─ Recording (periodic every 10s)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │    HTTP Metrics Endpoint (NEW)                          │   │
│  │  ├─ GET /metrics - Prometheus format                    │   │
│  │  └─ GET /health - Health check                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                             │ HTTP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Monitoring Stack                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Prometheus                                               │   │
│  │  ├─ Scrapes /metrics every 15s                           │   │
│  │  ├─ Stores metrics with timestamps                       │   │
│  │  └─ Provides query language (PromQL)                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Grafana / Alertmanager / Custom Dashboards              │   │
│  │  ├─ Visualize metrics over time                          │   │
│  │  ├─ Alert on thresholds                                  │   │
│  │  └─ Analyze trends                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Tool Execution with Metrics

### Example: `get_account_balance` call

```
1. AI Assistant sends MCP tool call request (stdio)
   ↓
2. PulsarServer.CallToolRequestHandler receives request
   ↓
3. Input Zod validation
   ↓
4. trackToolExecution('get_account_balance', async () => { ... })
   │
   ├─ metrics.activeToolInvocations.labels('get_account_balance').inc()
   │  └─ Gauge increases to 1
   │
   ├─ const startTime = Date.now()
   │
   ├─ Call getAccountBalance(args)
   │  │
   │  └─ withNetworkTracking('horizon', async () => {
   │     ├─ Horizon.loadAccount()
   │     └─ Track duration and status
   │     └─ metrics.networkRequestsTotal.labels('horizon', 'success').inc()
   │
   ├─ Calculate duration: (Date.now() - startTime) / 1000
   │
   ├─ metrics.toolDurationSeconds.labels('get_account_balance').observe(duration)
   │  └─ Histogram bucket +1
   │
   ├─ metrics.toolInvocationsTotal.labels('get_account_balance', 'success').inc()
   │  └─ Counter +1
   │
   └─ metrics.activeToolInvocations.labels('get_account_balance').dec()
      └─ Gauge decreases back to 0

5. Return result to AI Assistant (stdio)
   ↓
6. Metrics are scraped by Prometheus at next interval
```

---

## Metrics Details

### Tool Execution Metrics

**pulsar_tool_invocations_total**
- Type: Counter
- Labels: `tool_name`, `status` (success|error)
- Description: Total number of tool invocations
- Example query: `sum by (tool_name, status) (rate(pulsar_tool_invocations_total[5m]))`

**pulsar_tool_duration_seconds**
- Type: Histogram
- Labels: `tool_name`
- Buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10] seconds
- Description: Tool execution latency
- Example query: `histogram_quantile(0.95, rate(pulsar_tool_duration_seconds_bucket[5m]))`

**pulsar_tool_errors_total**
- Type: Counter
- Labels: `tool_name`, `error_type`
- Description: Categorized errors (PulsarValidationError, PulsarNetworkError, etc.)
- Example query: `sum by (tool_name, error_type) (pulsar_tool_errors_total)`

**pulsar_active_tool_invocations**
- Type: Gauge
- Labels: `tool_name`
- Description: Current active (in-flight) tool executions
- Example query: `sum(pulsar_active_tool_invocations)`

### Memory Metrics

**pulsar_heap_memory_used_bytes**
- Type: Gauge
- Description: Current heap memory in use
- Updated: Every 10 seconds
- Example query: `pulsar_heap_memory_used_bytes / 1024 / 1024` (MB)

**pulsar_heap_memory_total_bytes**
- Type: Gauge
- Description: Total heap memory allocated
- Example query: `pulsar_heap_memory_total_bytes / 1024 / 1024` (MB)

### Network Metrics

**pulsar_network_requests_total**
- Type: Counter
- Labels: `service`, `status` (success|error)
- Services: `horizon`, `soroban-rpc`
- Example query: `sum by (service, status) (pulsar_network_requests_total)`

**pulsar_network_duration_seconds**
- Type: Histogram
- Labels: `service`
- Example query: `rate(pulsar_network_duration_seconds_sum[5m]) / rate(pulsar_network_duration_seconds_count[5m])`

---

## Configuration Flow

```
Environment Variables
├─ METRICS_ENABLED (default: true)
├─ METRICS_PORT (default: 9090)
└─ LOG_LEVEL (includes debug logging for metrics)
   ↓
config.ts (Zod validation)
├─ Validates boolean for METRICS_ENABLED
├─ Validates port range (1-65535)
└─ Exports typed Config object
   ↓
index.ts (Server initialization)
├─ if (config.metricsEnabled)
│  ├─ startMetricsRecording() - Periodic memory metrics
│  └─ startMetricsServer() - HTTP server on METRICS_PORT
└─ Connect MCP stdio transport
```

---

## Memory Usage Estimates

### Metrics Overhead

Per-metric object:
- Counter: ~50 bytes
- Histogram: ~500 bytes (includes bucket storage)
- Gauge: ~50 bytes

Total for standard metrics set:
- Tool metrics: ~2 KB
- Memory metrics: ~100 bytes
- Network metrics: ~1 KB
- Process metrics (prom-client default): ~2 KB
- **Total baseline: ~5-6 KB**

Per tool execution tracked:
- Labels stored for each unique combination: ~50 bytes
- Small constant overhead per call: <1 byte

### Memory Recording (10s interval)

- Function call: ~1 KB
- Gauge updates: ~100 bytes
- No allocation: Uses existing memory info from process.memoryUsage()

---

## Error Tracking

Errors are automatically categorized:

```
Error occurs in tool handler
      ↓
trackToolExecution() catches it
      ├─ Check: instanceof PulsarValidationError?
      │  └─ yes → validationErrorsTotal.inc()
      │  └─ no  → continue
      │
      ├─ Extract error.constructor.name
      │  └─ PulsarNetworkError → 'PulsarNetworkError'
      │  └─ PulsarError → 'PulsarError'
      │  └─ Error → 'Error'
      │  └─ etc.
      │
      ├─ toolErrorsTotal.labels(toolName, errorType).inc()
      │
      ├─ toolInvocationsTotal.labels(toolName, 'error').inc()
      │
      └─ Re-throw (error propagates to caller)
```

---

## Testing Strategy

### Unit Tests
- Mock prom-client registry
- Verify metric increment/decrement
- Test error categorization logic
- Test timing calculations
- 100% code path coverage

### Integration Tests
- Start actual metrics server
- HTTP endpoint validation
- Prometheus format validation
- End-to-end metric flow

### Performance Tests
- Baseline latency without metrics
- Latency with metrics enabled
- Memory impact measurement
- Concurrent execution tracking

---

## Best Practices for Adding New Metrics

1. Define metric in `src/services/metrics.ts`:
```typescript
export const myMetric = new promClient.Counter({
  name: 'pulsar_my_metric_total',
  help: 'Description for Prometheus',
  labelNames: ['relevant', 'labels'],
});
```

2. Use in `src/services/metrics-tracking.ts`:
```typescript
myMetric.labels(labelValue1, labelValue2).inc();
```

3. Add unit test in `tests/unit/metrics.test.ts`

4. Document in README.md Monitoring section

5. Export in Prometheus format automatically

---

## Prometheus Query Examples

```promql
# 1. Tool Error Rate (per minute)
rate(pulsar_tool_errors_total[1m])

# 2. P95 Latency by Tool
histogram_quantile(0.95, rate(pulsar_tool_duration_seconds_bucket[5m]))

# 3. Memory Growth Trend
delta(pulsar_heap_memory_used_bytes[1h])

# 4. Tool Throughput (requests per second)
rate(pulsar_tool_invocations_total{status="success"}[5m])

# 5. Network Timeout Rate
rate(pulsar_network_requests_total{status="error"}[5m]) / 
  rate(pulsar_network_requests_total[5m])

# 6. Active Concurrent Executions
sum(pulsar_active_tool_invocations)

# 7. Most Errorful Tools (last hour)
topk(5, sum by (tool_name) (increase(pulsar_tool_errors_total[1h])))

# 8. Least Performant Tools (P99)
topk(5, histogram_quantile(0.99, rate(pulsar_tool_duration_seconds_bucket[5m])))
```

---

## Monitoring Alerts (Example Prometheus Rules)

```yaml
groups:
  - name: pulsar_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(pulsar_tool_errors_total[5m]) > 0.05
        for: 2m
        annotations:
          summary: "Pulsar error rate > 5%"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(pulsar_tool_duration_seconds_bucket[5m])) > 5
        for: 5m
        annotations:
          summary: "P95 tool latency > 5s"

      - alert: HighMemory
        expr: pulsar_heap_memory_used_bytes / pulsar_heap_memory_total_bytes > 0.85
        for: 10m
        annotations:
          summary: "Heap memory > 85% utilized"

      - alert: MetricsEndpointDown
        expr: up{job="pulsar"} == 0
        for: 1m
        annotations:
          summary: "Pulsar metrics endpoint is down"
```

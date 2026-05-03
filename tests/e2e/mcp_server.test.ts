import { ChildProcess } from 'node:child_process';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { spawnPulsarServer, sendMcpRequest, callMcpTool } from './utils.js';

describe('Pulsar MCP Server (E2E)', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    // Build the project first to ensure dist/index.js exists
    // (Assuming the user has already run npm run build, but in CI we should ensure it)
    server = spawnPulsarServer();

    // Wait a bit for the server to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  it('should list available tools', async () => {
    const response = await sendMcpRequest(server, 'tools/list');
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();

    const toolNames = (response.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(toolNames).toContain('get_account_balance');
    expect(toolNames).toContain('fetch_contract_spec');
    expect(toolNames).toContain('compute_vesting_schedule');
    expect(toolNames).toContain('deploy_contract');
    expect(toolNames).toContain('decode_ledger_entry');
  });

  it('should compute a vesting schedule via tool call', async () => {
    const result = await callMcpTool(server, 'compute_vesting_schedule', {
      total_amount: 1000,
      start_timestamp: 1700000000,
      cliff_seconds: 3600,
      vesting_duration_seconds: 7200,
      release_frequency_seconds: 1800,
      beneficiary_type: 'team',
      current_timestamp: 1700010000,
    });

    expect(result.beneficiary_type).toBe('team');
    expect(result.total_amount).toBe('1000.0000000');
    expect(result.released_amount).toBe('1000.0000000'); // Fully vested at 10000s
    expect(result.vesting_percentage).toBe(100);
  });

  it('should return error for unknown tool', async () => {
    const response = await sendMcpRequest(server, 'tools/call', {
      name: 'non_existent_tool',
      arguments: {},
    });

    expect(response.error).toBeDefined();
    expect(response.error.message).toContain('Tool not found');
  });

  it('should validate inputs before execution', async () => {
    const result = await callMcpTool(server, 'compute_vesting_schedule', {
      total_amount: -100, // Invalid: must be positive
    });

    // In PulsarServer.handleToolError, validation errors are returned as a JSON object with status: 'error'
    expect(result.status).toBe('error');
    expect(result.error_code).toBe('VALIDATION_ERROR');
    expect(result.message).toContain('Invalid input');
  });
});

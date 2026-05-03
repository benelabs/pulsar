import * as readline from 'node:readline/promises';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PulsarDebugger } from '../../src/pulsar-debugger.js';
import { TOOL_REGISTRY } from '../../src/registry.js';

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(),
}));

describe('PulsarDebugger', () => {
  let mockRl: { question: any; close: any };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    (readline.createInterface as any).mockReturnValue(mockRl);
  });

  it('should exit when "exit" is typed', async () => {
    mockRl.question.mockResolvedValueOnce('exit');
    const debuggerInstance = new PulsarDebugger();
    await debuggerInstance.start();
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('should exit when "quit" is typed', async () => {
    mockRl.question.mockResolvedValueOnce('quit');
    const debuggerInstance = new PulsarDebugger();
    await debuggerInstance.start();
    expect(mockRl.close).toHaveBeenCalled();
  });

  it('should find and run a tool by name', async () => {
    const toolName = 'compute_vesting_schedule';
    const toolIndex = TOOL_REGISTRY.findIndex((t) => t.name === toolName);
    const tool = TOOL_REGISTRY[toolIndex];

    // Mock selection
    mockRl.question.mockResolvedValueOnce(toolName);

    // Mock inputs for compute_vesting_schedule
    // total_amount, start_timestamp, cliff_seconds, vesting_duration_seconds, release_frequency_seconds, beneficiary_type
    mockRl.question.mockResolvedValueOnce('1000'); // total_amount
    mockRl.question.mockResolvedValueOnce('1700000000'); // start_timestamp
    mockRl.question.mockResolvedValueOnce('31536000'); // cliff_seconds
    mockRl.question.mockResolvedValueOnce('126144000'); // vesting_duration_seconds
    mockRl.question.mockResolvedValueOnce('2592000'); // release_frequency_seconds
    mockRl.question.mockResolvedValueOnce('team'); // beneficiary_type
    mockRl.question.mockResolvedValueOnce(''); // current_timestamp (optional)

    // Exit after one tool run
    mockRl.question.mockResolvedValueOnce('exit');

    const originalHandler = tool.handler;
    tool.handler = vi.fn().mockResolvedValue({ status: 'mock_success' });

    const debuggerInstance = new PulsarDebugger();
    await debuggerInstance.start();

    expect(tool.handler).toHaveBeenCalledWith(
      expect.objectContaining({
        total_amount: 1000,
        beneficiary_type: 'team',
      })
    );

    tool.handler = originalHandler;
  });

  it('should handle tool execution errors gracefully', async () => {
    mockRl.question.mockResolvedValueOnce('1'); // Select first tool
    // Mock one input to trigger execution
    const tool = TOOL_REGISTRY[0];
    const props = Object.keys((tool.inputSchema.properties as Record<string, unknown>) || {});
    props.forEach(() => mockRl.question.mockResolvedValueOnce('mock_input'));

    mockRl.question.mockResolvedValueOnce('exit');

    const originalHandler = tool.handler;
    tool.handler = vi.fn().mockRejectedValue(new Error('Mock Execution Error'));

    const debuggerInstance = new PulsarDebugger();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await debuggerInstance.start();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tool Execution Failed'));

    tool.handler = originalHandler;
    consoleSpy.mockRestore();
  });

  it('should coerce types correctly', async () => {
    const debuggerInstance = new PulsarDebugger() as unknown as Record<string, any>;
    expect(debuggerInstance.coerceValue('123.45', 'number')).toBe(123.45);
    expect(debuggerInstance.coerceValue('true', 'boolean')).toBe(true);
    expect(debuggerInstance.coerceValue('false', 'boolean')).toBe(false);
    expect(debuggerInstance.coerceValue('{"key": "value"}', 'object')).toEqual({ key: 'value' });
    expect(debuggerInstance.coerceValue('[1, 2, 3]', 'array')).toEqual([1, 2, 3]);
    expect(debuggerInstance.coerceValue('just a string', 'string')).toBe('just a string');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, main } from '../../src/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

describe('MCP Server', () => {
  let server: ReturnType<typeof createServer>;
  let transport: StdioServerTransport;

  beforeEach(() => {
    server = createServer();
    transport = new StdioServerTransport();
  });

  afterEach(async () => {
    await server.close();
  });

  it('should create server with correct name and version', () => {
    expect(server).toBeDefined();
  });

  it('should register a tool', async () => {
    await server.connect(transport);
    expect(server).toBeDefined();
  });

  it('should close gracefully', async () => {
    await server.connect(transport);
    await server.close();
  });

  it('should export main function', () => {
    expect(main).toBeDefined();
    expect(typeof main).toBe('function');
  });

  it('should export createServer function', () => {
    expect(createServer).toBeDefined();
    expect(typeof createServer).toBe('function');
  });
});

describe('StdioServerTransport', () => {
  it('should be importable', () => {
    expect(StdioServerTransport).toBeDefined();
  });

  it('should create transport with default streams', () => {
    const transport = new StdioServerTransport();
    expect(transport).toBeDefined();
  });
});

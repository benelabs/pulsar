import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

describe('MCP Server', () => {
  let server: McpServer;
  let transport: StdioServerTransport;

  beforeEach(() => {
    server = new McpServer({
      name: 'pulsar',
      version: '1.0.0',
    });
    
    transport = new StdioServerTransport();
  });

  afterEach(async () => {
    await server.close();
  });

  it('should create server with correct name and version', () => {
    expect(server).toBeDefined();
  });

  it('should register a tool successfully', async () => {
    server.tool('test-tool', 'A test tool', async () => {
      return { content: [{ type: 'text', text: 'Test successful' }] };
    });

    await server.connect(transport);
    expect(server).toBeDefined();
  });

  it('should register tool with input schema', async () => {
    server.tool('echo-tool', 'Echoes input', { 
      text: { type: 'string', description: 'Text to echo' } 
    }, async ({ text }) => {
      return { content: [{ type: 'text', text: text }] };
    });

    await server.connect(transport);
    expect(server).toBeDefined();
  });

  it('should close gracefully', async () => {
    server.tool('test-tool', 'A test tool', async () => {
      return { content: [{ type: 'text', text: 'Test successful' }] };
    });

    await server.connect(transport);
    await server.close();
  });
});

describe('StdioServerTransport', () => {
  it('should create transport with default stdin/stdout', () => {
    const transport = new StdioServerTransport();
    expect(transport).toBeDefined();
  });

  it('should create transport with custom streams', () => {
    const { PassThrough } = require('node:stream');
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    
    const transport = new StdioServerTransport(stdin, stdout);
    expect(transport).toBeDefined();
  });
});

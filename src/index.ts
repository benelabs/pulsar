import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'pulsar',
    version: '1.0.0',
  });

  server.tool('test-tool', 'A test tool', async () => {
    return { content: [{ type: 'text', text: 'Test successful' }] };
  });

  return server;
}

export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Server error:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

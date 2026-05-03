import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../../dist/src/index.js');

export interface McpResponse {
  jsonrpc: string;
  id: number | string;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

/**
 * Spawns the Pulsar MCP server as a child process.
 */
export function spawnPulsarServer(env: Record<string, string> = {}): ChildProcess {
  return spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      ...env,
      LOG_LEVEL: 'error', // Keep logs clean during tests
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

/**
 * Sends a JSON-RPC request to the MCP server and waits for a response.
 */
export function sendMcpRequest(
  server: ChildProcess,
  method: string,
  params: Record<string, unknown> = {},
  id: number | string = 1
): Promise<McpResponse> {
  return new Promise((resolve, reject) => {
    const request =
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n';

    const onData = (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString()) as McpResponse;
        if (response.id === id) {
          server.stdout?.removeListener('data', onData);
          resolve(response);
        }
      } catch {
        // Ignore partial/invalid JSON chunks
      }
    };

    server.stdout?.on('data', onData);
    server.stdin?.write(request);

    // Timeout after 10 seconds
    setTimeout(() => {
      server.stdout?.removeListener('data', onData);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 10000);
  });
}

/**
 * Calls a tool on the MCP server.
 */
export async function callMcpTool(
  server: ChildProcess,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const response = await sendMcpRequest(server, 'tools/call', {
    name,
    arguments: args,
  });

  if (response.error) {
    throw new Error(`MCP Tool Error (${name}): ${JSON.stringify(response.error)}`);
  }

  // MCP tool results are in result.content[0].text (stringified JSON)
  const content = (response.result?.content as { type: string; text: string }[] | undefined)?.[0];
  if (content?.type === 'text') {
    try {
      return JSON.parse(content.text);
    } catch {
      return content.text;
    }
  }

  return response.result;
}

#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { TOOL_REGISTRY } from './registry.js';
import logger from './logger.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError } from './errors.js';
import { PulsarDebugger } from './pulsar-debugger.js';

/**
 * Initialize the pulsar MCP server.
 * Communicates with AI assistants via stdio (stdin/stdout).
 * Every tool input/output is validated with Zod.
 */
class PulsarServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'pulsar',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.handleErrors();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_REGISTRY.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const tool = TOOL_REGISTRY.find((t) => t.name === name);

      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
      }

      try {
        logger.debug({ tool: name, arguments: args }, `Executing tool: ${name}`);

        const parsed = tool.zodSchema.safeParse(args);
        if (!parsed.success) {
          throw new PulsarValidationError(`Invalid input for ${name}`, parsed.error.format());
        }

        const result = await tool.handler(parsed.data);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return this.handleToolError(error, name);
      }
    });
  }

  private handleToolError(error: unknown, toolName: string) {
    let pulsarError: PulsarError;

    if (error instanceof PulsarError) {
      pulsarError = error;
    } else if (error instanceof McpError) {
      throw error;
    } else {
      pulsarError = new PulsarNetworkError(error instanceof Error ? error.message : String(error), {
        originalError: error,
      });
    }

    logger.error(
      {
        tool: toolName,
        errorCode: pulsarError.code,
        error: pulsarError.message,
        details: pulsarError.details,
      },
      `Error executing tool ${toolName}`
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            error_code: pulsarError.code,
            message: pulsarError.message,
            details: pulsarError.details,
          }),
        },
      ],
      isError: true,
    };
  }

  private handleErrors() {
    this.server.onerror = (error) => {
      logger.error({ error }, '[MCP Error]');
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(`pulsar MCP server v1.0.0 is running on ${config.stellarNetwork}...`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--debug') || args.includes('-d')) {
  const debuggerInstance = new PulsarDebugger();
  debuggerInstance.start().catch((error) => {
    /* eslint-disable-next-line no-console */
    console.error('❌ Fatal error in pulsar debugger:', error);
    process.exit(1);
  });
} else {
  const server = new PulsarServer();
  server.run().catch((error) => {
    logger.fatal({ error }, '❌ Fatal error in pulsar server');
    process.exit(1);
  });
}

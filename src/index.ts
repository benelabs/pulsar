#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { fetchContractSpec, fetchContractSpecSchema } from "./tools/fetch_contract_spec.js";
import { submitTransaction } from './tools/submit_transaction.js';
import { simulateTransaction } from './tools/simulate_transaction.js';
import {
  GetAccountBalanceInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
} from './schemas/tools.js';

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
      },
    );

    this.setupHandlers();
    this.handleErrors();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_account_balance',
          description: 'Get the current XLM and issued asset balances for a Stellar account.',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: {
                type: 'string',
                description: 'The Stellar public key (G...)',
              },
            },
            required: ['account_id'],
          },
        },
        {
          name: 'submit_transaction',
          description:
            '⚠️ IRREVERSIBLE. Always simulate first.\n\n' +
            'Submits a signed transaction envelope (XDR) to the Stellar network via Horizon. ' +
            'Optionally signs the transaction in-process using the configured STELLAR_SECRET_KEY ' +
            '(the key is never logged or passed as a CLI argument). ' +
            'Optionally waits up to 30 s for a SUCCESS or FAILED result from the Soroban RPC.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: {
                type: 'string',
                description: 'Base64-encoded XDR of the transaction envelope.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
              sign: {
                type: 'boolean',
                default: false,
                description:
                  'Sign the transaction in-process before submitting. Requires STELLAR_SECRET_KEY to be configured.',
              },
              wait_for_result: {
                type: 'boolean',
                default: false,
                description: 'Poll until SUCCESS or FAILED (max 30 s).',
              },
              wait_timeout_ms: {
                type: 'number',
                default: 30000,
                description: 'Polling timeout in milliseconds (1 000 – 120 000).',
              },
            },
            required: ['xdr'],
          },
        },
        {
          name: "fetch_contract_spec",
          description:
            "Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.",
          inputSchema: {
            type: "object",
            properties: {
              contract_id: {
                type: "string",
                description: "The Soroban contract address (C...)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "testnet", "futurenet", "custom"],
                description: "Override the active network for this call.",
              },
            },
            required: ["contract_id"],
          },
        },
        {
          name: 'simulate_transaction',
          description: 'Simulates a transaction on the Soroban RPC and returns results, footprint, fees, and events.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: {
                type: 'string',
                description: 'Base64-encoded XDR of the transaction envelope.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['xdr'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'get_account_balance') {
        const parsed = GetAccountBalanceInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid input for get_account_balance: ${JSON.stringify(parsed.error.format())}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: 'get_account_balance is not yet implemented',
                input: parsed.data,
              }),
            },
          ],
        };
      }

      if (name === "fetch_contract_spec") {
        const parsed = fetchContractSpecSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid input: ${JSON.stringify(parsed.error.format())}`);
        }
        const result = await fetchContractSpec(parsed.data);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      if (name === 'submit_transaction') {
        const parsed = SubmitTransactionInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid input for submit_transaction: ${JSON.stringify(parsed.error.format())}`);
        }
        const result = await submitTransaction(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      if (name === 'simulate_transaction') {
        const parsed = SimulateTransactionInputSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid input for simulate_transaction: ${JSON.stringify(parsed.error.format())}`);
        }
        const result = await simulateTransaction(parsed.data);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    });
  }

  private handleErrors() {
    this.server.onerror = (error) => {
      console.error(`[MCP Error] ${error.message}`);
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(
      `pulsar MCP server v1.0.0 is running on ${config.stellarNetwork}...`,
    );
  }
}

const pulsar = new PulsarServer();
pulsar.run().catch((error) => {
  console.error('❌ Fatal error in pulsar server:', error);
  process.exit(1);
});


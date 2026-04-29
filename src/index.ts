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
import { fetchContractSpec, fetchContractSpecSchema } from './tools/fetch_contract_spec.js';
import { submitTransaction } from './tools/submit_transaction.js';
import { simulateTransaction } from './tools/simulate_transaction.js';
import { getAccountBalance } from './tools/get_account_balance.js';
import { getAccountBalances } from './tools/get_account_balances.js';
import { computeVestingSchedule } from './tools/compute_vesting_schedule.js';
import { deployContract } from './tools/deploy_contract.js';
import {
  GetAccountBalanceInputSchema,
  GetAccountBalancesInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
  ComputeVestingScheduleInputSchema,
  DeployContractInputSchema,
} from './schemas/tools.js';
import logger from './logger.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError } from './errors.js';

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
      tools: [
        {
          name: 'get_account_balance',
          description:
            'Get the current XLM and issued asset balances for a Stellar account. Optionally filter by asset code and/or issuer.',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: {
                type: 'string',
                description: 'The Stellar public key (G...)',
              },
              asset_code: {
                type: 'string',
                description: 'Optional: Filter by asset code (e.g. USDC)',
              },
              asset_issuer: {
                type: 'string',
                description: 'Optional: Filter by asset issuer (G...)',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['account_id'],
          },
        },
        {
          name: 'get_account_balances',
          description:
            'Fetch balances for multiple Stellar accounts in one tool call using concurrent Horizon requests. Returns per-account successes and errors with batch diagnostics.',
          inputSchema: {
            type: 'object',
            properties: {
              account_ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description:
                  'A list of Stellar public keys (G...). Supports 1 to 25 unique accounts per call.',
              },
              asset_code: {
                type: 'string',
                description: 'Optional: Filter every account result by asset code (e.g. USDC)',
              },
              asset_issuer: {
                type: 'string',
                description: 'Optional: Filter every account result by asset issuer (G...)',
              },
              max_concurrency: {
                type: 'number',
                default: 5,
                description:
                  'Optional: Maximum number of concurrent Horizon requests to run at once (1-10).',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['account_ids'],
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
          name: 'fetch_contract_spec',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: {
                type: 'string',
                description: 'The Soroban contract address (C...)',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the active network for this call.',
              },
            },
            required: ['contract_id'],
          },
        },
        {
          name: 'simulate_transaction',
          description:
            'Simulates a transaction on the Soroban RPC and returns results, footprint, fees, and events.',
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
        {
          name: 'compute_vesting_schedule',
          description:
            'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
          inputSchema: {
            type: 'object',
            properties: {
              total_amount: {
                type: 'number',
                description: 'Total token amount to vest.',
              },
              start_timestamp: {
                type: 'number',
                description: 'Unix timestamp when vesting begins.',
              },
              cliff_seconds: {
                type: 'number',
                description: 'Seconds before any tokens unlock (cliff period).',
              },
              vesting_duration_seconds: {
                type: 'number',
                description: 'Total vesting period in seconds.',
              },
              release_frequency_seconds: {
                type: 'number',
                description: 'How often tokens unlock after cliff (e.g. 2592000 for monthly).',
              },
              beneficiary_type: {
                type: 'string',
                enum: ['team', 'investor', 'advisor', 'other'],
                description: 'Category of beneficiary.',
              },
              current_timestamp: {
                type: 'number',
                description: 'Optional override for current time as Unix timestamp.',
              },
            },
            required: [
              'total_amount',
              'start_timestamp',
              'cliff_seconds',
              'vesting_duration_seconds',
              'release_frequency_seconds',
              'beneficiary_type',
            ],
          },
        },
        {
          name: 'deploy_contract',
          description:
            "Builds a Stellar transaction for deploying a Soroban smart contract. Supports 'direct' mode (built-in deployer) or 'factory' mode (via a factory contract). Returns the unsigned transaction XDR and, for direct mode, the predicted deterministic contract address. Simulate before submitting.",
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['direct', 'factory'],
                description:
                  "Deployment mode: 'direct' (built-in deployer) or 'factory' (via factory contract)",
              },
              source_account: {
                type: 'string',
                description:
                  'Stellar public key (G...) that will deploy the contract and pay fees.',
              },
              wasm_hash: {
                type: 'string',
                description:
                  'SHA-256 hash of the uploaded WASM as 64 hex characters. Required for direct mode.',
              },
              salt: {
                type: 'string',
                description:
                  'Optional 32-byte salt as 64 hex characters for deterministic address. Random if omitted.',
              },
              factory_contract_id: {
                type: 'string',
                description:
                  'Soroban contract ID (C...) of the factory contract. Required for factory mode.',
              },
              deploy_function: {
                type: 'string',
                description: "Factory deploy function name. Default: 'deploy'.",
              },
              deploy_args: {
                type: 'array',
                description:
                  "Arguments for factory deploy function as typed SCVal objects. Each item: { type?: 'symbol'|'string'|'u32'|'i32'|'u64'|'i64'|'u128'|'i128'|'bool'|'address'|'bytes'|'void', value: any }",
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['mode', 'source_account'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.debug({ tool: name, arguments: args }, `Executing tool: ${name}`);

        switch (name) {
          case 'get_account_balance': {
            const parsed = GetAccountBalanceInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_account_balance`,
                parsed.error.format()
              );
            }
            const result = await getAccountBalance(parsed.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_account_balances': {
            const parsed = GetAccountBalancesInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_account_balances`,
                parsed.error.format()
              );
            }
            const result = await getAccountBalances(parsed.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'fetch_contract_spec': {
            const parsed = fetchContractSpecSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for fetch_contract_spec`,
                parsed.error.format()
              );
            }
            const result = await fetchContractSpec(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'submit_transaction': {
            const parsed = SubmitTransactionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for submit_transaction`,
                parsed.error.format()
              );
            }
            const result = await submitTransaction(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'simulate_transaction': {
            const parsed = SimulateTransactionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for simulate_transaction`,
                parsed.error.format()
              );
            }
            const result = await simulateTransaction(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'compute_vesting_schedule': {
            const parsed = ComputeVestingScheduleInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for compute_vesting_schedule`,
                parsed.error.format()
              );
            }
            const result = await computeVestingSchedule(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'deploy_contract': {
            const parsed = DeployContractInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for deploy_contract`,
                parsed.error.format()
              );
            }
            const result = await deployContract(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
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
      // Pass through MCP errors directly if they are already well-formed
      throw error;
    } else {
      // Convert unknown errors to PulsarNetworkError as per requirements
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

const pulsar = new PulsarServer();
pulsar.run().catch((error) => {
  logger.fatal({ error }, '❌ Fatal error in pulsar server');
  process.exit(1);
});

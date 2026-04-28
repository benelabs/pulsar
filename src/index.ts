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
import { computeVestingSchedule } from './tools/compute_vesting_schedule.js';
import { deployContract } from './tools/deploy_contract.js';
import { manageSubscription } from './tools/manage_subscription.js';
import { analyzeContractStorage } from './tools/analyze_contract_storage.js';
import { verifyEscrowConditions } from './tools/verify_escrow_conditions.js';
import {
  GetAccountBalanceInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
  ComputeVestingScheduleInputSchema,
  DeployContractInputSchema,
  ManageSubscriptionInputSchema,
  AnalyzeContractStorageInputSchema,
  VerifyEscrowConditionsInputSchema,
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
        {
          name: 'manage_subscription',
          description:
            'Compute the current state of a pull-payment recurring subscription between a subscriber and a merchant on the Stellar network. ' +
            'Returns the subscription status (active / overdue / cancelled / expired / pending), a full billing schedule, amounts collected and outstanding, ' +
            'and the next payment due date. Use the output to decide when to invoke submit_transaction to pull the next recurring fee. ' +
            'No network call is made — all computation is deterministic from the supplied plan parameters.',
          inputSchema: {
            type: 'object',
            properties: {
              subscriber: {
                type: 'string',
                description: 'Stellar public key (G...) of the subscribing account.',
              },
              merchant: {
                type: 'string',
                description: 'Stellar public key (G...) of the merchant / service provider.',
              },
              amount_per_period: {
                type: 'number',
                description: 'Token amount charged per billing period (must be positive).',
              },
              asset_code: {
                type: 'string',
                description: 'Asset code, e.g. "USDC" or "XLM".',
              },
              asset_issuer: {
                type: 'string',
                description: 'Issuer public key (G...) for non-native assets. Omit for XLM.',
              },
              period_seconds: {
                type: 'number',
                description: 'Length of one billing period in seconds, e.g. 2592000 for monthly.',
              },
              start_timestamp: {
                type: 'number',
                description: 'Unix timestamp (seconds) when the subscription starts.',
              },
              total_periods: {
                type: 'number',
                description:
                  'Maximum number of billing periods for fixed-term subscriptions. Omit for indefinite.',
              },
              cancelled_timestamp: {
                type: 'number',
                description: 'Unix timestamp when the subscriber cancelled. Omit if still active.',
              },
              payments_collected: {
                type: 'number',
                default: 0,
                description: 'Number of periods already collected by the merchant (default: 0).',
              },
              grace_period_seconds: {
                type: 'number',
                default: 0,
                description:
                  'Extra seconds after a period due-date before the subscription is marked overdue (default: 0).',
              },
              current_timestamp: {
                type: 'number',
                description:
                  'Optional override for current time as Unix timestamp; defaults to wall-clock.',
              },
            },
            required: [
              'subscriber',
              'merchant',
              'amount_per_period',
              'asset_code',
              'period_seconds',
              'start_timestamp',
            ],
          },
        },
        {
          name: 'analyze_contract_storage',
          description:
            "Analyses a deployed Soroban contract's on-chain ledger storage footprint. " +
            'Fetches the contract instance entry (and optional additional ledger keys) from the ' +
            'Soroban RPC, measures per-entry byte sizes and TTLs, and returns actionable ' +
            'optimisation recommendations to reduce ledger-rent costs for large maps and datasets. ' +
            'Common recommendations include: chunked/paginated map storage, TTL extension warnings, ' +
            'and migration from instance to persistent storage for infrequently accessed data.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: {
                type: 'string',
                description: 'The Soroban contract address (C…, 56 chars).',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
              additional_keys: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Optional list of base64-encoded XDR ledger keys to include in the analysis ' +
                  '(max 50). Use this to analyse specific persistent/temporary entries beyond ' +
                  'the default instance entry.',
              },
              size_threshold_bytes: {
                type: 'number',
                default: 1024,
                description:
                  'Entries larger than this byte count are flagged as oversized (default: 1 024).',
              },
              include_recommendations: {
                type: 'boolean',
                default: true,
                description: 'Whether to include optimisation recommendations (default: true).',
              },
            },
            required: ['contract_id'],
          },
        },
        {
          name: 'verify_escrow_conditions',
          description:
            'Formally verifies the correctness of a Soroban escrow contract state against 8 ' +
            'critical properties: (P1) conservation law, (P2) FSM state-machine validity, ' +
            '(P3) access-control invariants, (P4) no double-spend, (P5) arbiter neutrality, ' +
            '(P6) conditions coherence, (P7) timelock integrity, and (P8) dispute window. ' +
            'Pure computation — no network calls. Returns a structured verification report ' +
            'with per-property pass/fail findings and an overall verified flag.',
          inputSchema: {
            type: 'object',
            properties: {
              escrow_id: {
                type: 'string',
                description: 'Unique identifier for the escrow contract instance.',
              },
              depositor: {
                type: 'string',
                description: 'Stellar public key (G...) of the depositing party.',
              },
              beneficiary: {
                type: 'string',
                description: 'Stellar public key (G...) of the receiving party.',
              },
              arbiter: {
                type: 'string',
                description:
                  'Optional Stellar public key (G...) of the neutral arbiter. ' +
                  'Must differ from both depositor and beneficiary.',
              },
              asset_code: {
                type: 'string',
                description: 'Asset code of escrowed funds, e.g. "XLM" or "USDC".',
              },
              asset_issuer: {
                type: 'string',
                description: 'Issuer public key for non-native assets; omit for XLM.',
              },
              deposited_amount: {
                type: 'number',
                description: 'Total amount deposited into the escrow.',
              },
              released_amount: {
                type: 'number',
                default: 0,
                description: 'Amount already released to the beneficiary (default: 0).',
              },
              refunded_amount: {
                type: 'number',
                default: 0,
                description: 'Amount already refunded to the depositor (default: 0).',
              },
              state: {
                type: 'string',
                enum: ['pending', 'funded', 'released', 'refunded', 'disputed', 'resolved'],
                description: 'Current FSM state of the escrow.',
              },
              prior_state: {
                type: 'string',
                enum: ['pending', 'funded', 'released', 'refunded', 'disputed', 'resolved'],
                description:
                  'Previous FSM state. When provided, the state transition is validated ' +
                  'against the legal Soroban escrow FSM graph.',
              },
              conditions: {
                type: 'array',
                default: [],
                description: 'Release conditions that must all be fulfilled before funds release.',
                items: {
                  type: 'object',
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['timelock', 'multisig', 'oracle', 'manual'],
                    },
                    description: { type: 'string' },
                    fulfilled: { type: 'boolean' },
                    required_timestamp: { type: 'number' },
                  },
                  required: ['kind', 'description', 'fulfilled'],
                },
              },
              dispute_window_seconds: {
                type: 'number',
                description:
                  'Seconds after funding during which a dispute may be raised. ' +
                  'Omit to allow disputes at any time while funded.',
              },
              funded_timestamp: {
                type: 'number',
                description: 'Unix timestamp when the escrow was funded.',
              },
              current_timestamp: {
                type: 'number',
                description: 'Optional override for "now" as Unix timestamp.',
              },
            },
            required: [
              'escrow_id',
              'depositor',
              'beneficiary',
              'asset_code',
              'deposited_amount',
              'state',
            ],
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

          case 'manage_subscription': {
            const parsed = ManageSubscriptionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for manage_subscription`,
                parsed.error.format()
              );
            }
            const result = await manageSubscription(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'analyze_contract_storage': {
            const parsed = AnalyzeContractStorageInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for analyze_contract_storage`,
                parsed.error.format()
              );
            }
            const result = await analyzeContractStorage(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'verify_escrow_conditions': {
            const parsed = VerifyEscrowConditionsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for verify_escrow_conditions`,
                parsed.error.format()
              );
            }
            const result = await verifyEscrowConditions(parsed.data);
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

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
import { manageRestrictedAddresses, ManageRestrictedAddressesInputSchema } from './tools/manage_restricted_addresses.js';
import { emergencyPause } from './tools/emergency_pause.js';
import { generateContractDocs } from './tools/generate_contract_docs.js';
import { sorobanMath } from './tools/soroban_math.js';

// ✅ merged imports (FIXED)
import { decodeLedgerEntryTool, decodeLedgerEntrySchema } from './tools/decode_ledger_entry.js';
import { computeVestingSchedule } from './tools/compute_vesting_schedule.js';
import { deployContract } from './tools/deploy_contract.js';
import { buildConditionalTransaction } from './tools/build_conditional_transaction.js';
import { batchEvents } from './tools/batch_events.js';

import {
  GetAccountBalanceInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
  EmergencyPauseInputSchema,
  GenerateContractDocsInputSchema,
  SorobanMathInputSchema,
  ComputeVestingScheduleInputSchema,
  DeployContractInputSchema,
  BuildConditionalTransactionInputSchema,
  BatchEventsInputSchema,
} from './schemas/tools.js';

import logger from './logger.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError, PulsarRestrictedAddressError } from './errors.js';
import { addressRegistry } from './services/address-registry.js';
import { checkToolInput } from './services/address-guard.js';

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
      { name: 'pulsar', version: '1.0.0' },
      { capabilities: { tools: {} } }
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
          description: 'Get balances for a Stellar account.',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: { type: 'string' },
            },
            required: ['account_id'],
          },
        },
        {
          name: 'decode_ledger_entry',
          description: 'Decode LedgerEntry XDR to JSON.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: { type: 'string' },
            },
            required: ['xdr'],
          },
        },
        {
          name: 'submit_transaction',
          description: 'Submit a signed transaction.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: { type: 'string' },
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
          description: 'Fetch contract ABI/spec.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: { type: 'string' },
            },
            required: ['contract_id'],
          },
        },
        {
          name: 'simulate_transaction',
          description:
            'Simulates a transaction on the Soroban RPC and returns results, footprint, fees, and events.',
          description: 'Simulate transaction.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: { type: 'string' },
            },
            required: ['xdr'],
          },
        },
        {
          name: 'fetch_contract_spec',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          name: 'emergency_pause',
          description:
            'Circuit breaker: inspect a Soroban contract for pause/unpause capability and generate the recommended invocation. ' +
            'Use action=inspect to check support, action=pause/unpause to get the invocation args. ' +
            'Does NOT submit transactions — use submit_transaction to execute.',
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
                description: 'Override the configured network for this call.',
              },
              action: {
                type: 'string',
                enum: ['inspect', 'pause', 'unpause'],
                default: 'inspect',
                description: 'inspect: report pause capability; pause/unpause: return recommended invocation args.',
              },
              admin_address: {
                type: 'string',
                description: 'Optional admin/owner address to include in the recommended invocation.',
              },
            },
            required: ['contract_id'],
          },
        },
        {
          name: 'simulate_transaction',
          description:
            'Simulates a transaction on the Soroban RPC and returns results, footprint, fees, and events.',
          name: 'generate_contract_docs',
          description:
            'Generate human-readable documentation for a Soroban contract. ' +
            'Extracts function signatures, doc-comments, parameter types, and emitted event schemas from the contract ABI.',
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
                description: 'Override the configured network for this call.',
              },
              format: {
                type: 'string',
                enum: ['markdown', 'text'],
                default: 'markdown',
                description: 'Output format: markdown (default) or plain text.',
              },
              include_events: {
                type: 'boolean',
                default: true,
                description: 'Include emitted event schemas in the output.',
              },
            },
            required: ['contract_id'],
          name: 'compute_vesting_schedule',
          description:
            'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
          description: 'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
          name: 'soroban_math',
          description:
            'Perform financial math on Soroban fixed-point integers (scaled by 10^decimals, default 7). ' +
            'Operations: fixed_add, fixed_sub, fixed_mul, fixed_div (fixed-point arithmetic); ' +
            'mean, weighted_mean, std_dev (statistics); twap (time-weighted average price); ' +
            'compound_interest (compound growth using basis-point rate); ' +
            'basis_points_to_percent, percent_to_basis_points (unit conversions). ' +
            'All integer arguments are passed as decimal strings to preserve BigInt precision.',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: [
                  'fixed_add',
                  'fixed_sub',
                  'fixed_mul',
                  'fixed_div',
                  'mean',
                  'weighted_mean',
                  'std_dev',
                  'twap',
                  'compound_interest',
                  'basis_points_to_percent',
                  'percent_to_basis_points',
                ],
                description: 'The math operation to perform.',
              },
              a: { type: 'string', description: 'First operand (fixed-point ops).' },
              b: { type: 'string', description: 'Second operand (fixed-point ops).' },
              decimals: {
                type: 'number',
                description: 'Decimal places in the fixed-point scale (default 7).',
              },
              values: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Array of fixed-point values as strings (mean, weighted_mean, std_dev).',
              },
              weights: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of weights as strings (weighted_mean).',
              },
              prices: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    price: { type: 'string' },
                    timestamp: { type: 'number' },
                  },
                  required: ['price', 'timestamp'],
                },
                description: 'Array of {price, timestamp} entries for TWAP.',
              },
              principal: {
                type: 'string',
                description: 'Principal amount as fixed-point string (compound_interest).',
              },
              rate_bps: {
                type: 'number',
                description: 'Annual rate in basis points, e.g. 500 = 5% (compound_interest).',
              },
              periods: { type: 'number', description: 'Number of periods (compound_interest).' },
              compounds_per_period: {
                type: 'number',
                description: 'Compounding frequency per period, default 1 (compound_interest).',
              },
              value: { type: 'number', description: 'Numeric value for basis-point conversion.' },
            },
            required: ['operation'],
          name: 'compute_vesting_schedule',
          description: 'Calculate vesting schedule.',
          inputSchema: {
            type: 'object',
            properties: {
              total_amount: { type: 'number' },
              start_timestamp: { type: 'number' },
              cliff_seconds: { type: 'number' },
              vesting_duration_seconds: { type: 'number' },
              release_frequency_seconds: { type: 'number' },
              beneficiary_type: { type: 'string' },
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
          name: 'batch_events',
          description:
            'Batch, deduplicate, and group Soroban contract events from simulate or submit results. ' +
            'Reduces noise in multi-transaction workflows while preserving a full audit trail. ' +
            'Accepts an array of base64 XDR ContractEvent or DiagnosticEvent strings.',
          inputSchema: {
            type: 'object',
            properties: {
              events: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Array of base64 XDR Soroban ContractEvent or DiagnosticEvent strings.',
              },
              group_by: {
                type: 'string',
                enum: ['contract', 'topic', 'contract_and_topic'],
                default: 'contract_and_topic',
                description:
                  "Grouping strategy: 'contract', 'topic', or 'contract_and_topic' (default).",
              },
              deduplicate: {
                type: 'boolean',
                default: true,
                description:
                  'Collapse identical events into a single entry with an occurrence_count.',
              },
            },
            required: ['events'],
          },
        },
        {
          name: 'deploy_contract',
          description: 'Build deploy transaction.',
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
              mode: { type: 'string' },
              source_account: { type: 'string' },
            },
            required: ['mode', 'source_account'],
          },
        },
        {
          name: 'manage_restricted_addresses',
          description: 'Add, remove, list, or check restricted Stellar/Soroban addresses. Restricted addresses are blocked from all tool calls.',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['add', 'remove', 'list', 'check'],
                description: 'Action to perform on the restricted address list.',
              },
              deploy_args: {
                type: 'array',
                description:
                  "Arguments for factory deploy function as typed SCVal objects. Each item: { type?: 'symbol'|'string'|'u32'|'i32'|'u64'|'i64'|'u128'|'i128'|'bool'|'address'|'bytes'|'void', value: any }",
              },
              network: {
              address: {
                type: 'string',
                description: 'Stellar public key (G...) or Soroban contract ID (C...). Required for add, remove, check.',
              },
            },
            required: ['action'],
          },
        },
        {
          name: 'build_conditional_transaction',
          description:
            'Embeds Stellar-native preconditions (time bounds, ledger bounds, minimum sequence guards) ' +
            'into an existing unsigned transaction XDR. The modified transaction is only accepted by the ' +
            'network when every condition is satisfied at submission time. ' +
            'Optionally validates conditions against the current ledger before returning.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: {
                type: 'string',
                description: 'Base64-encoded XDR of the unsigned transaction envelope (v1 format).',
              },
              conditions: {
                type: 'object',
                description: 'Preconditions to embed. At least one field is required.',
                properties: {
                  time_bounds: {
                    type: 'object',
                    description: 'Validity window as Unix timestamps.',
                    properties: {
                      min_time: { type: 'number', description: 'Earliest valid Unix timestamp.' },
                      max_time: {
                        type: 'number',
                        description: 'Latest valid Unix timestamp (0 = no expiry).',
                      },
                    },
                  },
                  ledger_bounds: {
                    type: 'object',
                    description: 'Validity window as ledger sequence numbers.',
                    properties: {
                      min_ledger: { type: 'number', description: 'Minimum valid ledger sequence.' },
                      max_ledger: {
                        type: 'number',
                        description: 'Maximum valid ledger sequence (0 = no cap).',
                      },
                    },
                  },
                  min_sequence_number: {
                    type: 'string',
                    description: 'Source account must have at least this sequence number.',
                  },
                  min_sequence_age: {
                    type: 'number',
                    description:
                      'Minimum seconds since the source account last bumped its sequence.',
                  },
                  min_sequence_ledger_gap: {
                    type: 'number',
                    description:
                      'Minimum ledgers closed since the source account last bumped its sequence.',
                  },
                },
              },
              validate_now: {
                type: 'boolean',
                default: false,
                description:
                  'Check conditions against the current ledger and report pass/fail for each.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['xdr', 'conditions'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.debug({ tool: name, arguments: args }, `Executing tool: ${name}`);

        // Guard: check all address fields against the restricted list before any network call
        const guardResult = checkToolInput(name, (args ?? {}) as Record<string, unknown>, addressRegistry);
        if (guardResult.blocked) {
          logger.warn({ tool: name, address: guardResult.address }, 'Restricted address detected in tool call');
          throw new PulsarRestrictedAddressError(guardResult.address!, name);
        }

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
            const parsed = GetAccountBalanceInputSchema.parse(args);
            const result = await getAccountBalance(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'fetch_contract_spec': {
            const parsed = fetchContractSpecSchema.parse(args);
            const result = await fetchContractSpec(parsed);
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
            const parsed = SubmitTransactionInputSchema.parse(args);
            const result = await submitTransaction(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'emergency_pause': {
            const parsed = EmergencyPauseInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for emergency_pause`, parsed.error.format());
            }
            const result = await emergencyPause(parsed.data);
          case 'compute_vesting_schedule': {
            const parsed = ComputeVestingScheduleInputSchema.safeParse(args);
          case 'decode_ledger_entry': {
            const parsed = decodeLedgerEntrySchema.parse(args);
            const result = await decodeLedgerEntryTool(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'simulate_transaction': {
            const parsed = SimulateTransactionInputSchema.parse(args);
            const result = await simulateTransaction(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'soroban_math': {
            const parsed = SorobanMathInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for compute_vesting_schedule`,
                `Invalid input for soroban_math`,
                parsed.error.format()
              );
            }
            const result = await sorobanMath(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          case 'compute_vesting_schedule': {
            const parsed = ComputeVestingScheduleInputSchema.parse(args);
            const result = await computeVestingSchedule(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'batch_events': {
            const parsed = BatchEventsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for batch_events`,
                parsed.error.format()
              );
            }
            const result = batchEvents(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'generate_contract_docs': {
            const parsed = GenerateContractDocsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for generate_contract_docs`, parsed.error.format());
            }
            const result = await generateContractDocs(parsed.data);
          case 'deploy_contract': {
            const parsed = DeployContractInputSchema.parse(args);
            const result = await deployContract(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'manage_restricted_addresses': {
            const parsed = ManageRestrictedAddressesInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for deploy_contract`,
                parsed.error.format()
              );
              throw new PulsarValidationError(`Invalid input for manage_restricted_addresses`, parsed.error.format());
            }
            const result = await manageRestrictedAddresses(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'build_conditional_transaction': {
            const parsed = BuildConditionalTransactionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for build_conditional_transaction`,
                parsed.error.format()
              );
            }
            const result = await buildConditionalTransaction(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
      } catch (error) {
        logger.error(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }),
            },
          ],
          isError: true,
        };
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
    await addressRegistry.load();
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
    logger.info(`pulsar MCP server running on ${config.stellarNetwork}`);
  }
}

new PulsarServer().run();

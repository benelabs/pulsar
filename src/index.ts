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

import { config } from './config.js';

import { config } from './config.js';
import { TOOL_REGISTRY } from './registry.js';
import logger from './logger.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError } from './errors.js';
import { PulsarDebugger } from './pulsar-debugger.js';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { fetchContractSpec } from './tools/fetch_contract_spec.js';
import { fetchContractSpec, fetchContractSpecSchema } from './tools/fetch_contract_spec.js';
import { submitTransaction } from './tools/submit_transaction.js';
import { simulateTransaction } from './tools/simulate_transaction.js';
import { simulateTransactionsSequence } from './tools/simulate_transactions_sequence.js';
import { getAccountBalance } from './tools/get_account_balance.js';
import { getAccountBalances } from './tools/get_account_balances.js';
import { manageRestrictedAddresses, ManageRestrictedAddressesInputSchema } from './tools/manage_restricted_addresses.js';
import { emergencyPause } from './tools/emergency_pause.js';
import { generateContractDocs } from './tools/generate_contract_docs.js';
import { sorobanMath } from './tools/soroban_math.js';

// ✅ merged imports (FIXED)
import { decodeLedgerEntryTool, decodeLedgerEntrySchema } from './tools/decode_ledger_entry.js';
import { computeVestingSchedule } from './tools/compute_vesting_schedule.js';
import { deployContract } from './tools/deploy_contract.js';
import { estimateTokenFees } from './tools/estimate_token_fees.js';
import { getOrderbook } from './tools/get_orderbook.js';
import { decodeLedgerEntryTool, decodeLedgerEntrySchema } from './tools/decode_ledger_entry.js';
import { getPriceFeed } from './tools/get_price_feed.js';
import {
  calculateDutchAuctionPrice,
  calculateEnglishAuctionState,
} from './tools/auction_compute.js';
import { safeMathCompute } from './tools/safe_math_tool.js';
import { calculateDutchAuctionPrice, calculateEnglishAuctionState } from './tools/auction_compute.js';
import { manageDaoTreasury } from './tools/manage_dao_treasury.js';
import { computeInterestRates, calculateBorrowingCapacity } from './tools/lending_compute.js';
import { trackLedgerConsensusTime } from './tools/track_ledger_consensus_time.js';
import { manageSubscription } from './tools/manage_subscription.js';
import { analyzeContractStorage } from './tools/analyze_contract_storage.js';
import { verifyEscrowConditions } from './tools/verify_escrow_conditions.js';
import { getNetworkParams } from './tools/get_network_params.js';
import { getContractStorage } from "./tools/get_contract_storage.js";
import { getLiquidityPool, GetLiquidityPoolInputSchema } from './tools/get_liquidity_pool.js';
import { getFeeStats, GetFeeStatsInputSchema } from './tools/get_fee_stats.js';
import { optimizeContractBytecode } from './tools/optimize_contract_bytecode.js';
import { getProtocolVersion } from './tools/get_protocol_version.js';
import { exportData } from './tools/export_data.js';
import { checkNetworkStatusTool } from './tools/check_network_status.js';
import { buildTransaction } from './tools/build_transaction.js';
import { getClaimableBalance } from './tools/get_claimable_balance.js';
import { searchAssets } from './tools/search_assets.js';
import { ammTool } from './tools/amm.js';
import { getTokenTransferFee } from './tools/get_token_transfer_fee.js';
import { generateContractClient } from './tools/generate_contract_client.js';
import { buildConditionalTransaction } from './tools/build_conditional_transaction.js';
import { batchEvents } from './tools/batch_events.js';

import {
  FetchContractSpecInputSchema,
  GetAccountBalanceInputSchema,
  GetAccountBalancesInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
  SimulateTransactionsSequenceInputSchema,
  EmergencyPauseInputSchema,
  GenerateContractDocsInputSchema,
  SorobanMathInputSchema,
  ComputeVestingScheduleInputSchema,
  DeployContractInputSchema,
  EstimateTokenFeesInputSchema,
  GetOrderbookInputSchema,
  GetPriceFeedInputSchema,
  CalculateDutchAuctionPriceInputSchema,
  CalculateEnglishAuctionStateInputSchema,
  SafeMathComputeInputSchema,
} from './schemas/tools.js';
  ManageDaoTreasuryInputSchema,
  ComputeInterestRatesInputSchema,
  CalculateBorrowingCapacityInputSchema,
  TrackLedgerConsensusTimeInputSchema,
  ManageSubscriptionInputSchema,
  AnalyzeContractStorageInputSchema,
  VerifyEscrowConditionsInputSchema,
  GetNetworkParamsInputSchema,
  ToolErrorOutputSchema,
  ToolNameSchema,
  TOOL_OUTPUT_SCHEMAS,
  GetContractStorageInputSchema,
  OptimizeContractBytecodeInputSchema,
  GetProtocolVersionInputSchema,
  ExportDataInputSchema,
  CheckNetworkStatusInputSchema,
  BuildTransactionInputSchema,
  GetClaimableBalanceInputSchema,
  SearchAssetsInputSchema,
  GetTokenTransferFeeInputSchema,
  GenerateContractClientInputSchema,
  SoulboundTokenInputSchema,
  BuildConditionalTransactionInputSchema,
  BatchEventsInputSchema,
} from './schemas/tools.js';
import {
  AMMSwapInputSchema,
  AMMAddLiquidityInputSchema,
  AMMRemoveLiquidityInputSchema,
  AMMGetQuoteInputSchema,
  AMMGetPoolInfoInputSchema,
} from './schemas/amm.js';

import logger from './logger.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError } from './errors.js';
import { applyFieldProjection } from './schemas/index.js';
import { initializeI18n } from './i18n/index.js';
import { logToolExecution } from './audit.js';
import { validateToolOutput } from './utils/output-validation.js';
import type { ToolName } from './constants/tools.js';
import { startMetricsRecording, getPrometheusMetrics } from './services/metrics.js';
import { trackToolExecution } from './services/metrics-tracking.js';
import { PulsarError, PulsarNetworkError, PulsarValidationError, PulsarRestrictedAddressError } from './errors.js';
import { addressRegistry } from './services/address-registry.js';
import { checkToolInput } from './services/address-guard.js';

class PulsarServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: 'pulsar', version: '1.0.0' },
      { capabilities: { tools: {} } },
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
      tools: TOOL_REGISTRY.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
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
          name: 'search_assets',
          description:
            'Search for Stellar assets by code, issuer, or minimum reputation score. Returns a list of matching assets.',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: { type: 'string', description: 'The Stellar public key (G...)' },
              asset_code: { type: 'string', description: 'Optional: Filter by asset code (e.g. USDC)' },
              asset_issuer: { type: 'string', description: 'Optional: Filter by asset issuer (G...)' },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the configured network for this call.' },
              asset_code: {
                type: 'string',
                description: 'Optional: Filter by asset code (e.g. USDC)',
              },
              asset_issuer: {
                type: 'string',
                description: 'Optional: Filter by asset issuer public key (G...)',
              },
              min_reputation_score: {
                type: 'number',
                description:
                  'Optional: Minimum reputation score/rating (0-10 or 0-100) to filter by.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: [],
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
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
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
          name: 'get_liquidity_pool',
          description: 'Query AMM liquidity pool reserves, total shares, fee (in basis points), and pool type from Horizon.',
          inputSchema: {
            type: 'object',
            properties: {
              liquidity_pool_id: {
                type: 'string',
                description: 'The liquidity pool ID (e.g. POOL_...)',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['liquidity_pool_id'],
          },
        },
        {
          name: 'get_fee_stats',
          description: 'Retrieve recent network fee statistics (min, max, avg, percentiles) from Horizon to estimate optimal transaction fees.',
          inputSchema: {
            type: 'object',
            properties: {
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
          },
        },
        {
          name: 'submit_transaction',
          description: '⚠️ IRREVERSIBLE. Always simulate first.\n\nSubmits a signed transaction envelope (XDR) to the Stellar network via Horizon. Optionally signs the transaction in-process using the configured STELLAR_SECRET_KEY (the key is never logged or passed as a CLI argument). Optionally waits up to 30 s for a SUCCESS or FAILED result from the Soroban RPC.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: { type: 'string', description: 'Base64-encoded XDR of the transaction envelope.' },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the configured network for this call.' },
              sign: { type: 'boolean', default: false, description: 'Sign the transaction in-process before submitting. Requires STELLAR_SECRET_KEY to be configured.' },
              wait_for_result: { type: 'boolean', default: false, description: 'Poll until SUCCESS or FAILED (max 30 s).' },
              wait_timeout_ms: { type: 'number', default: 30000, description: 'Polling timeout in milliseconds (1000 – 120000).' },
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
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
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
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          inputSchema: {
            type: 'object',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description: 'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: { type: 'string', description: 'The Soroban contract address (C...)' },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the active network for this call.' },
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
          description:
            'Fetch the ABI/interface spec of a deployed Soroban contract. Returns decoded function signatures, parameter types, and emitted event schemas.',
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
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
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
          name: 'get_contract_storage',
          description:
            'Fetch a contract storage entry by durability (instance, persistent, temporary) and key. Returns ledger entry XDR plus TTL metadata when available.',
          inputSchema: {
            type: 'object',
            properties: {
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
              xdr: { type: 'string', description: 'Base64-encoded XDR of the transaction envelope.' },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the configured network for this call.' },
              contract_id: {
                type: 'string',
                description: 'The Soroban contract address (C...)',
              },
              storage_type: {
                type: 'string',
                enum: ['instance', 'persistent', 'temporary'],
                description: 'Which storage durability to read.',
              },
              key: {
                type: 'object',
                description:
                  'Typed SCVal key for persistent/temporary storage. Example: { type: "symbol", value: "Balance" }',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
              },
            },
            required: ['contract_id', 'storage_type'],
          },
        },
        {
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
              total_amount: { type: 'number', description: 'Total token amount to vest.' },
              start_timestamp: { type: 'number', description: 'Unix timestamp when vesting begins.' },
              cliff_seconds: { type: 'number', description: 'Seconds before any tokens unlock (cliff period).' },
              vesting_duration_seconds: { type: 'number', description: 'Total vesting period in seconds.' },
              release_frequency_seconds: { type: 'number', description: 'How often tokens unlock after cliff (e.g. 2592000 for monthly).' },
              beneficiary_type: { type: 'string', enum: ['team', 'investor', 'advisor', 'other'], description: 'Category of beneficiary.' },
              current_timestamp: { type: 'number', description: 'Optional override for current time as Unix timestamp.' },
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
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
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
            required: ['total_amount', 'start_timestamp', 'cliff_seconds', 'vesting_duration_seconds', 'release_frequency_seconds', 'beneficiary_type'],
          },
        },
        {
          name: 'deploy_contract',
          description: "Builds a Stellar transaction for deploying a Soroban smart contract. Supports 'direct' mode (built-in deployer) or 'factory' mode (via a factory contract). Returns the unsigned transaction XDR and, for direct mode, the predicted deterministic contract address. Simulate before submitting.",
          inputSchema: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['direct', 'factory'], description: "Deployment mode: 'direct' (built-in deployer) or 'factory' (via factory contract)" },
              source_account: { type: 'string', description: 'Stellar public key (G...) that will deploy the contract and pay fees.' },
              wasm_hash: { type: 'string', description: 'SHA-256 hash of the uploaded WASM as 64 hex characters. Required for direct mode.' },
              salt: { type: 'string', description: 'Optional 32-byte salt as 64 hex characters for deterministic address. Random if omitted.' },
              factory_contract_id: { type: 'string', description: 'Soroban contract ID (C...) of the factory contract. Required for factory mode.' },
              deploy_function: { type: 'string', description: "Factory deploy function name. Default: 'deploy'." },
              deploy_args: { type: 'array', description: "Arguments for factory deploy function as typed SCVal objects." },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the configured network for this call.' },
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
              optimize_cross_contract_call: {
                type: 'boolean',
                default: false,
                description:
                  'Factory mode only. Simulate and assemble the transaction to minimize cross-contract call resource overhead before returning XDR.',
              network: {
              address: {
                type: 'string',
                description: 'Stellar public key (G...) or Soroban contract ID (C...). Required for add, remove, check.',
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Subset of top-level response fields to return. Omit to receive the full response.',
              },
            },
            required: ['action'],
          },
        },
        {
          name: 'estimate_token_fees',
          description: 'Estimate the Soroban resource costs (CPU, memory, fees) for minting or burning tokens on a Stellar Asset Contract (SAC).',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: {
                type: 'string',
                description: 'The SAC contract address (C...)',
              },
              amount: {
                type: 'string',
                description: 'Amount to mint or burn (i128 string)',
              },
              address: {
                type: 'string',
                description: 'The address receiving (mint) or losing (burn) tokens',
              },
              op: {
                type: 'string',
                enum: ['mint', 'burn'],
                description: 'Operation: mint or burn',
              },
              source_account: {
                type: 'string',
                description: 'The account invoking the operation',
          name: 'get_orderbook',
          description:
            'Retrieve and analyze the Stellar DEX orderbook for a trading pair. Returns raw bids/asks plus derived analytics including spread, mid price, liquidity depth, and orderbook imbalance. Useful for market making, arbitrage detection, and liquidity analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              selling_asset_code: {
                type: 'string',
                description: 'Asset code being sold (e.g. XLM, USDC)',
              },
              selling_asset_issuer: {
                type: 'string',
                description: 'Issuer account for selling asset. Omit for XLM native.',
              },
              buying_asset_code: {
                type: 'string',
                description: 'Asset code being bought',
              },
              buying_asset_issuer: {
                type: 'string',
                description: 'Issuer account for buying asset. Omit for XLM native.',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 200,
                default: 20,
                description: 'Number of price levels to return per side (1-200)',
              },
              depth_levels: {
                type: 'array',
                items: { type: 'number' },
                description: 'Price percentage levels for depth analysis',
                default: [1, 2, 5],
          name: 'soulbound_token',
          description:
            'Build an unsigned Soroban transaction XDR for Soulbound Token (SBT) operations on a deployed SBT contract. ' +
            'SBTs are non-transferable identity/reputation tokens. ' +
            'Actions: mint (issue token to recipient), revoke (invalidate token by ID), query (check ownership — simulate to read result). ' +
            'Sign and submit the returned XDR via submit_transaction.',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['mint', 'revoke', 'query'],
                description: 'SBT operation to perform.',
              },
              contract_id: {
                type: 'string',
                description: 'Deployed SBT contract address (C...).',
              },
              source_account: {
                type: 'string',
                description: 'Stellar public key (G...) that signs and pays fees.',
              },
              recipient: {
                type: 'string',
                description: 'Recipient public key (G...). Required for mint and query.',
              },
              token_id: {
                type: 'string',
                description:
                  'Unique token identifier. Required for revoke; auto-generated for mint if omitted.',
              },
              metadata: {
                type: 'string',
                description:
                  'Arbitrary metadata string (e.g. JSON) attached to the token. Required for mint.',
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
            required: ['mode', 'source_account'],
          },
        },
        {
          name: 'decode_ledger_entry',
          description:
            'Decode a raw base64-encoded XDR ledger entry into a human-readable JSON structure.',
          inputSchema: {
            type: 'object',
            properties: {
              xdr: {
                type: 'string',
                description: 'Base64-encoded XDR of the ledger entry (key or value).',
              },
              entry_type: {
                type: 'string',
                enum: ['account', 'trustline', 'contract_data', 'contract_code', 'offer', 'data'],
                description:
                  'Hint for decoding: account, trustline, contract_data, contract_code, offer, data.',
              },
            },
            required: ['xdr'],
          name: 'get_price_feed',
          description:
            'Queries a decentralized oracle contract for the price of a base asset in terms of a quote asset. Assumes the oracle implements a standard interface with a get_price(base_asset: Symbol, quote_asset: Symbol) -> i128 function.',
          name: 'calculate_dutch_auction_price',
          description:
            'Calculate the current price of an asset in a Dutch auction (linear price decay). Useful for NFT drops or fair price discovery.',
          inputSchema: {
            type: 'object',
            properties: {
              start_price: { type: 'number', description: 'Initial auction price.' },
              reserve_price: { type: 'number', description: 'Minimum/floor price.' },
              start_timestamp: { type: 'number', description: 'Unix timestamp when decay begins.' },
              end_timestamp: {
                type: 'number',
                description: 'Unix timestamp when price reaches reserve.',
              },
              current_timestamp: {
                type: 'number',
                description: 'Optional override for current time.',
              },
            },
            required: ['start_price', 'reserve_price', 'start_timestamp', 'end_timestamp'],
          },
        },
        {
          name: 'calculate_english_auction_state',
          description: 'Calculate the next bid requirements and state for an English auction.',
          inputSchema: {
            type: 'object',
            properties: {
              current_highest_bid: {
                type: 'number',
                description: 'Current top bid (0 if no bids).',
              },
              reserve_price: { type: 'number', description: 'Minimum bid to win/start.' },
              bid_increment: {
                type: 'number',
                description: 'Required increase over the current bid.',
              },
              bid_increment_type: {
                type: 'string',
                enum: ['absolute', 'percentage'],
                default: 'absolute',
              },
              end_timestamp: { type: 'number', description: 'Unix timestamp when auction ends.' },
              current_timestamp: {
                type: 'number',
                description: 'Optional override for current time.',
              },
            },
          },
        },
        {
          name: 'safe_math_compute',
          description:
            'Perform safe integer arithmetic with overflow/underflow protection and Soroban-compatible bounds checking (u64, i128, etc.).',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'string', description: 'First operand (as string).' },
              b: { type: 'string', description: 'Second operand (as string).' },
              operation: {
                type: 'string',
                enum: ['add', 'sub', 'mul', 'div'],
                description: 'Arithmetic operation.',
              },
              bounds: {
                type: 'string',
                enum: ['u32', 'i32', 'u64', 'i64', 'u128', 'i128', 'none'],
                default: 'none',
                description: 'Target integer bounds.',
              },
            },
            required: ['a', 'b', 'operation'],
      required: ['mode', 'source_account'],
    },
  },
  {
    name: 'calculate_dutch_auction_price',
    description: 'Calculate the current price of an asset in a Dutch auction (linear price decay). Useful for NFT drops or fair price discovery.',
    inputSchema: {
      type: 'object',
      properties: {
        start_price: { type: 'number', description: 'Initial auction price.' },
        reserve_price: { type: 'number', description: 'Minimum/floor price.' },
        start_timestamp: { type: 'number', description: 'Unix timestamp when decay begins.' },
        end_timestamp: { type: 'number', description: 'Unix timestamp when price reaches reserve.' },
        current_timestamp: { type: 'number', description: 'Optional override for current time.' },
      },
      required: ['start_price', 'reserve_price', 'start_timestamp', 'end_timestamp'],
    },
  },
  {
    name: 'calculate_english_auction_state',
    description: 'Calculate the next bid requirements and state for an English auction.',
    inputSchema: {
      type: 'object',
      properties: {
        current_highest_bid: { type: 'number', description: 'Current top bid (0 if no bids).' },
        reserve_price: { type: 'number', description: 'Minimum bid to win/start.' },
        bid_increment: { type: 'number', description: 'Required increase over the current bid.' },
        bid_increment_type: { type: 'string', enum: ['absolute', 'percentage'], default: 'absolute' },
        end_timestamp: { type: 'number', description: 'Unix timestamp when auction ends.' },
        current_timestamp: { type: 'number', description: 'Optional override for current time.' },
      },
      required: ['current_highest_bid', 'reserve_price', 'bid_increment', 'end_timestamp'],
    },
  },
],
    name: 'compute_interest_rates',
    description: 'Calculate borrow and supply interest rates using a Jump Rate Model (standard for protocols like Aave). Useful for simulating lending pool dynamics.',
    inputSchema: {
      type: 'object',
      properties: {
        utilization_rate: { type: 'number', description: 'Pool utilization (debt / liquidity), 0 to 1.' },
        base_rate: { type: 'number', description: 'Base borrow rate (e.g. 0.02 for 2%).' },
        multiplier: { type: 'number', description: 'Interest rate slope below kink.' },
        jump_multiplier: { type: 'number', description: 'Interest rate slope above kink.' },
        kink: { type: 'number', description: 'Utilization threshold for jump multiplier (default 0.8).', default: 0.8 },
      },
      required: ['utilization_rate', 'base_rate', 'multiplier', 'jump_multiplier'],
    },
  },
  {
    name: 'calculate_borrowing_capacity',
    description: 'Calculate max borrow amount, health factor, and liquidation price for a collateralized position.',
    inputSchema: {
      type: 'object',
      properties: {
        collateral_amount: { type: 'number' },
        collateral_price: { type: 'number', description: 'Asset price in USD.' },
        debt_price: { type: 'number', description: 'Asset price in USD.' },
        ltv: { type: 'number', description: 'Loan-to-Value ratio, 0 to 1.' },
        liquidation_threshold: { type: 'number', description: 'Threshold where liquidation occurs, 0 to 1.' },
        current_debt: { type: 'number', description: 'Existing debt in asset units (default 0).', default: 0 },
      },
      required: ['collateral_amount', 'collateral_price', 'debt_price', 'ltv', 'liquidation_threshold'],
    },
  },
],
            required: ['action', 'contract_id', 'source_account'],
            required: ['xdr', 'conditions'],
          },
        },
        {
          name: 'manage_dao_treasury',
          description:
            'Manages DAO treasury operations: deposit funds, allocate budgets by category, spend/transfer funds, check balances, and view transaction history. Supports multiple treasuries with budget tracking and role-based access.',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['deposit', 'allocate', 'spend', 'balance', 'history'],
                description:
                  "Treasury operation: 'deposit' (add funds), 'allocate' (budget for category), 'spend' (transfer), 'balance' (check balance), 'history' (view transactions)",
              },
              treasury_address: {
                type: 'string',
                description: 'Treasury contract ID (C...) or account (G...)',
              },
              amount: {
                type: 'string',
                description:
                  'Amount to deposit, allocate, or spend (positive decimal, max 7 decimals)',
              },
              asset: {
                type: 'string',
                description: 'Asset code, e.g., XLM, USDC (default: XLM)',
              },
              recipient: {
                type: 'string',
                description: 'Recipient address for allocations or spending (G... or C...)',
              },
              description: {
                type: 'string',
                description: 'Memo/description for the transaction (max 256 chars)',
              },
              budget_category: {
                type: 'string',
                enum: ['grants', 'operations', 'development', 'marketing', 'legal', 'other'],
                description: 'Budget category for allocation',
              },
              limit: {
                type: 'number',
                description: 'Max history entries to return (default: 10, max: 100)',
              },
          name: 'track_ledger_consensus_time',
          description:
            'Tracks and reports the average time it takes for ledger consensus on the Stellar network. ' +
            'Samples N recent ledgers from Horizon and computes average, min, max, and standard deviation ' +
            'of inter-ledger close times. Useful for detecting network congestion or validator slowdowns. ' +
            'Stellar targets ~5 s per ledger.',
          inputSchema: {
            type: 'object',
            properties: {
              sample_size: {
                type: 'number',
                default: 10,
                description: 'Number of recent ledgers to sample (2–100). Default: 10.',
              },
          name: 'generate_contract_client',
          description:
            'Generate a fully-typed TypeScript client class for a deployed Soroban contract. ' +
            'Provide a contract_id to fetch the spec automatically, or pass a pre-fetched contract_spec. ' +
            'Returns the generated TypeScript source code ready to drop into any project.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: {
                type: 'string',
                description: 'Soroban contract ID (C...). Provide this OR contract_spec.',
              },
              contract_spec: {
                type: 'object',
                description:
                  'Pre-fetched contract spec (output of fetch_contract_spec). Provide this OR contract_id.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Network to use when fetching spec via contract_id.',
              },
              class_name: {
                type: 'string',
                description:
                  'Override the generated TypeScript class name (default: derived from contract_id).',
              },
            },
          },
        },
        {
          name: 'get_token_transfer_fee',
          description:
            'Simulates a Soroban token transfer to detect any Fee-on-Transfer (FoT) logic and calculate the net received amount.',
          inputSchema: {
            type: 'object',
            properties: {
              contract_id: {
                type: 'string',
                description: 'The Soroban token contract ID (C...)',
              },
              amount: {
                type: 'string',
                description: 'Amount to transfer (numeric string in smallest unit)',
              },
              from: {
                type: 'string',
                description: 'Stellar address of the sender (G... or C...)',
              },
              to: {
                type: 'string',
                description: 'Stellar address of the recipient (G... or C...)',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['contract_id', 'amount', 'from', 'to'],
          },
        },
        {
          name: 'amm',
          description:
            'Automated Market Maker (AMM) operations for constant-product (x*y=k) pools. '
            + 'Supports token swaps, liquidity provision/removal, and pool queries. '
            + 'Actions: swap, add_liquidity, remove_liquidity, get_quote, get_pool_info.',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['swap', 'add_liquidity', 'remove_liquidity', 'get_quote', 'get_pool_info'],
                description: 'AMM operation to perform',
              },
              params: {
                type: 'object',
                description: 'Parameters for the AMM action (varies by action type)',
              },
            },
            required: ['action', 'params'],
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
          name: 'simulate_transaction',
          description:
            'Simulates a transaction on the Soroban RPC and returns results, footprint, fees, and events.',
          name: 'get_claimable_balance',
          description: 'Query claimable balances on Stellar. Returns claimable balances for a specific account (by public key) or a single balance (by balance ID). Includes claimant details, predicates, amounts, and sponsor information.',
          inputSchema: {
            type: 'object',
            properties: {
              account_id: { type: 'string', description: 'The Stellar public key (G...) to fetch claimable balances for.' },
              balance_id: { type: 'string', description: 'A specific claimable balance ID (72 hex chars).' },
              network: { type: 'string', enum: ['mainnet', 'testnet', 'futurenet', 'custom'], description: 'Override the configured network for this call.' },
            },
            required: [],
          },
        },
        {
          name: 'build_transaction',
          description: 'Construct common Stellar transaction types (payment, trustline, manage data, set options, account merge, create account) without raw XDR. Returns unsigned transaction XDR ready for simulation and submission.',
          inputSchema: {
            type: 'object',
            properties: {
              source_account: {
                type: 'string',
                description: 'Stellar public key (G...) that will sign the transaction and pay fees.',
              },
              operations: {
                type: 'array',
                description: 'Array of operations to include in the transaction. Each operation has a type and type-specific parameters.',
                items: {
                  type: 'object',
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['payment'] },
                        destination: { type: 'string', description: 'Destination account (G...)' },
                        amount: { type: 'number', description: 'Amount to send' },
                        asset_code: { type: 'string', description: 'Asset code (e.g., USDC). Omit for native XLM' },
                        asset_issuer: { type: 'string', description: 'Asset issuer (G...). Required if asset_code provided' },
                      },
                      required: ['type', 'destination', 'amount'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['change_trust'] },
                        asset_code: { type: 'string', description: 'Asset code to create trustline for (e.g., USDC)' },
                        asset_issuer: { type: 'string', description: 'Asset issuer (G...)' },
                        limit: { type: 'string', description: 'Trustline limit. Default: maximum uint64' },
                      },
                      required: ['type', 'asset_code', 'asset_issuer'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['manage_data'] },
                        name: { type: 'string', description: 'Data entry name (1-64 bytes)' },
                        value: { description: 'Value to set. Omit to clear entry' },
                      },
                      required: ['type', 'name'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['set_options'] },
                        inflation_destination: { type: 'string' },
                        clear_flags: { type: 'number' },
                        set_flags: { type: 'number' },
                        master_weight: { type: 'number' },
                        low_threshold: { type: 'number' },
                        med_threshold: { type: 'number' },
                        high_threshold: { type: 'number' },
                        home_domain: { type: 'string' },
                        signer_address: { type: 'string' },
                        signer_type: { type: 'string', enum: ['ed25519_public_key', 'pre_auth_tx', 'sha256_hash'] },
                        signer_weight: { type: 'number' },
                      },
                      required: ['type'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['account_merge'] },
                        destination: { type: 'string', description: 'Destination account to merge into' },
                      },
                      required: ['type', 'destination'],
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['create_account'] },
                        destination: { type: 'string', description: 'New account to create' },
                        starting_balance: { type: 'number', description: 'Starting balance in XLM (minimum 1)' },
                      },
                      required: ['type', 'destination', 'starting_balance'],
                    },
                  ],
                },
              },
              fee: {
                type: 'number',
                description: 'Base fee in stroops per operation. Default: 100000',
              },
              timeout: {
                type: 'number',
                description: 'Transaction timeout in seconds. Default: 30',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['contract_id', 'amount', 'address', 'op', 'source_account'],
            required: ['source_account', 'operations'],
          },
        },
        {
          name: 'compute_vesting_schedule',
          description:
            'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
          name: 'simulate_transactions_sequence',
          description:
            'Simulates a sequence of transactions on the Soroban RPC sequentially and returns an array of results, footprints, fees, and events.',
          inputSchema: {
            type: 'object',
            properties: {
              xdrs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of base64-encoded XDRs of the transaction envelopes.',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['xdrs'],
          },
        },
        {
          name: 'compute_vesting_schedule',
          description:
            'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
          name: 'check_network_status',
          description:
            'Probes Horizon and Soroban RPC connectivity for the configured (or specified) network. ' +
            'Returns a structured diagnostic report including per-endpoint latency, HTTP status, ' +
            'partition severity (none | partial | full), and actionable remediation steps. ' +
            'Run this tool first when transactions fail unexpectedly.',
          inputSchema: {
            type: 'object',
            properties: {
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this probe.',
              },
              timeout_ms: {
                type: 'number',
                default: 8000,
                description: 'Per-probe timeout in milliseconds (500 – 30 000). Default: 8 000.',
              },
            },
            required: [],
          },
        },
        {
          name: 'export_data',
          description:
            'Export data to CSV or JSON format files. Useful for saving tool results like account balances, transaction history, or contract data for analysis or reporting.',
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['direct', 'factory'],
                description:
                  "Deployment mode: 'direct' (built-in deployer) or 'factory' (via factory contract)",
              data: {
                type: ['array', 'object'],
                description: 'Data to export - can be an array of objects or a single object',
              },
              format: {
                type: 'string',
                description:
                  'Stellar public key (G...) that will deploy the contract and pay fees.',
                enum: ['csv', 'json'],
                description: 'Export format: csv or json',
              },
              filename: {
                type: 'string',
                description:
                  'SHA-256 hash of the uploaded WASM as 64 hex characters. Required for direct mode.',
              },
              salt: {
                type: 'string',
                description:
                  'Optional 32-byte salt as 64 hex characters for deterministic address. Random if omitted.',
                description: 'Optional filename (without extension). Default: export_{timestamp}',
              },
              include_timestamp: {
                type: 'boolean',
                default: true,
                description: 'Whether to include export timestamp in the output',
              },
            },
            required: ['data', 'format'],
          },
        },
        {
          name: 'get_protocol_version',
          description: 'Get the current Stellar protocol version and network information. Returns protocol version, Horizon version, supported features, and upgrade status.',
          inputSchema: {
            type: 'object',
            properties: {
              network: {
                type: 'string',
                description:
                  'Soroban contract ID (C...) of the factory contract. Required for factory mode.',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
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
                description: 'The Soroban oracle contract address (C...).',
              },
              base_asset: {
                type: 'string',
                description: 'Base asset symbol (e.g., USD).',
              },
              quote_asset: {
                type: 'string',
                description: 'Quote asset symbol (e.g., XLM).',
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
          name: 'optimize_contract_bytecode',
          description:
            'Analyze a Soroban contract WASM file for bytecode size risk and return optimization actions, diagnostics, and CI-friendly size checks.',
          inputSchema: {
            type: 'object',
            properties: {
              wasm_path: {
                type: 'string',
                description: 'Path to the contract WASM file to analyze.',
              },
              deploy_args: {
                type: 'array',
                description:
                  "Arguments for factory deploy function as typed SCVal objects. Each item: { type?: 'symbol'|'string'|'u32'|'i32'|'u64'|'i64'|'u128'|'i128'|'bool'|'address'|'bytes'|'void', value: any }",
              max_size_kb: {
                type: 'number',
                default: 256,
                description: 'Maximum allowed bytecode size in KB.',
              },
              strict_mode: {
                type: 'boolean',
                default: false,
                description: 'If true, returns an error when bytecode size exceeds max_size_kb.',
              },
            },
            required: ['wasm_path'],
          },
        },
        {
          name: 'get_network_params',
          description:
            'Fetch current Soroban network parameters including resource weights (CPU, memory, ledger operations), fee thresholds and transaction limits, and inflation/base network parameters. Use this to understand resource pricing and network constraints.',
          inputSchema: {
            type: 'object',
            properties: {
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['action', 'treasury_address'],
            required: [],
          },
        },
        {
          name: 'compute_vesting_schedule',
          description:
            'Calculate a token vesting / timelock release schedule for team, investors, or advisors. Returns released and unreleased amounts plus a period-by-period breakdown.',
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
              contract_id: {
                type: 'string',
                description: 'The Soroban contract address (C…, 56 chars).',
              },
              network: {
                type: 'string',
                enum: ['mainnet', 'testnet', 'futurenet', 'custom'],
                description: 'Override the configured network for this call.',
              },
            },
            required: ['selling_asset_code', 'buying_asset_code'],
            required: ['contract_id', 'base_asset', 'quote_asset'],
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

      try {
        logger.debug({ tool: name, arguments: args }, `Executing tool: ${name}`);

        switch (name) {
          case 'get_account_balance': {
            const parsed = GetAccountBalanceInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_account_balance`, parsed.error.format());
            }
            const result = await getAccountBalance(parsed.data);
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
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
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
              throw new PulsarValidationError(`Invalid input for get_account_balance`, parsed.error.format());
            }
            const result = await getAccountBalance(parsed.data);
      try {
        const parsedToolName = ToolNameSchema.safeParse(name);
        if (!parsedToolName.success) {
          throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }
        const toolName = parsedToolName.data;
        logger.debug({ tool: name, arguments: args }, `Executing tool: ${name}`);

        let result: any;

        switch (name) {
          case 'get_account_balance': {
            const parsed = GetAccountBalanceInputSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for get_account_balance`, parsed.error.format());

        // Guard: check all address fields against the restricted list before any network call
        const guardResult = checkToolInput(name, (args ?? {}) as Record<string, unknown>, addressRegistry);
        if (guardResult.blocked) {
          logger.warn({ tool: name, address: guardResult.address }, 'Restricted address detected in tool call');
          throw new PulsarRestrictedAddressError(guardResult.address!, name);
        }

        switch (toolName) {
          case 'get_account_balance': {
            const parsed = GetAccountBalanceInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_account_balance`,
                parsed.error.format()
              );
            }
            const result = await getAccountBalance(parsed.data);
            result = await getAccountBalance(parsed.data);
            break;
            const result = await trackToolExecution('get_account_balance', () => getAccountBalance(parsed.data));
            const result = await getAccountBalance(parsed.data);
            return this.successResponse(toolName, result);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'fetch_contract_spec': {
            const parsed = fetchContractSpecSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for fetch_contract_spec`, parsed.error.format());
            const result = await fetchContractSpec(parsed.data);

          case 'search_assets': {
            const parsed = SearchAssetsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for search_assets`,
                parsed.error.format()
              );
            }
            const result = await searchAssets(parsed.data);
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
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
                },
              ],
            };
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
            }
            const result = await fetchContractSpec(parsed.data);
            }
            const result = await fetchContractSpec(parsed.data);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
            const parsed = FetchContractSpecInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for fetch_contract_spec`,
                parsed.error.format()
              );
            }
            const result = await fetchContractSpec(parsed.data);
            result = await fetchContractSpec(parsed.data);
            break;
            const result = await fetchContractSpec(parsed.data);
            return this.successResponse(toolName, result);
            const result = await trackToolExecution('fetch_contract_spec', () => fetchContractSpec(parsed.data));
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for submit_transaction`, parsed.error.format());
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for submit_transaction`,
                parsed.error.format()
              );
            }
            result = await submitTransaction(parsed.data);
            break;
            const result = await submitTransaction(parsed.data);
            return this.successResponse(toolName, result);
            const result = await trackToolExecution('submit_transaction', () => submitTransaction(parsed.data));
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
                },
              ],
            };
            const result = await submitTransaction(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'simulate_transaction': {
            const parsed = SimulateTransactionInputSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for simulate_transaction`, parsed.error.format());
            const result = await simulateTransaction(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'compute_vesting_schedule': {
            const parsed = ComputeVestingScheduleInputSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for compute_vesting_schedule`, parsed.error.format());
            const result = await computeVestingSchedule(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'deploy_contract': {
            const parsed = DeployContractInputSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for deploy_contract`, parsed.error.format());
            const result = await deployContract(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'get_claimable_balance': {
            const parsed = GetClaimableBalanceInputSchema.safeParse(args);
            if (!parsed.success) throw new PulsarValidationError(`Invalid input for get_claimable_balance`, parsed.error.format());
            const result = await getClaimableBalance(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for simulate_transaction`,
                parsed.error.format()
              );
            }
            result = await simulateTransaction(parsed.data);
            break;
            const result = await simulateTransaction(parsed.data);
            return this.successResponse(toolName, result);
            const result = await trackToolExecution('simulate_transaction', () => simulateTransaction(parsed.data));
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
            const parsed = SubmitTransactionInputSchema.parse(args);
            const result = await submitTransaction(parsed);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'get_contract_storage': {
            const parsed = GetContractStorageInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_contract_storage`, parsed.error.format());
            }
            const result = await getContractStorage(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'simulate_transactions_sequence': {
            const parsed = SimulateTransactionsSequenceInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for simulate_transactions_sequence`,
                parsed.error.format()
              );
            }
            const result = await simulateTransactionsSequence(parsed.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
                },
              ],
            };
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
                parsed.error.format()
              );
            }
            result = await computeVestingSchedule(parsed.data);
            break;
            const result = await computeVestingSchedule(parsed.data);
            return this.successResponse(toolName, result);
                `Invalid input for soroban_math`,
                parsed.error.format()
              );
            }
            const result = await trackToolExecution('compute_vesting_schedule', () => computeVestingSchedule(parsed.data));
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
                `Invalid input for compute_vesting_schedule`,
                `Invalid input for batch_events`,
                parsed.error.format()
              );
            }
            const result = batchEvents(parsed.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
                },
              ],
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
            }
            result = await deployContract(parsed.data);
            break;
            const result = await deployContract(parsed.data);
            return this.successResponse(toolName, result);
              throw new PulsarValidationError(`Invalid input for manage_restricted_addresses`, parsed.error.format());
            }
            const result = await trackToolExecution('deploy_contract', () => deployContract(parsed.data));
            const result = await manageRestrictedAddresses(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'export_data': {
            const parsed = ExportDataInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for export_data`,
                parsed.error.format()
              );
            }
            const result = await exportData(parsed.data);
          case 'check_network_status': {
            const parsed = CheckNetworkStatusInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for check_network_status`, parsed.error.format());
            }
            const result = await checkNetworkStatusTool(parsed.data);
          case 'soulbound_token': {
            const parsed = SoulboundTokenInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for soulbound_token`,
                parsed.error.format()
              );
            }
            const result = await soulboundToken(parsed.data);
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

          case 'generate_contract_client': {
            const parsed = GenerateContractClientInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for deploy_contract`,
                `Invalid input for generate_contract_client`,
                parsed.error.format()
              );
            }
            const result = await generateContractClient(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'manage_dao_treasury': {
            const parsed = ManageDaoTreasuryInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for manage_dao_treasury`,
                parsed.error.format()
              );
            }
            const result = await manageDaoTreasury(parsed.data);
          case 'get_token_transfer_fee': {
            const parsed = GetTokenTransferFeeInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_token_transfer_fee`,
                parsed.error.format()
              );
            }
            const result = await getTokenTransferFee(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'build_transaction': {
            const parsed = BuildTransactionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for build_transaction`, parsed.error.format());
            }
            const result = await buildTransaction(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          case 'amm': {
            const action = args?.action;
            const params = args?.params;

            if (!action || !params) {
              throw new PulsarValidationError('AMM tool requires action and params');
            }

            // Validate params based on action
            switch (action) {
              case 'swap': {
                const parsed = AMMSwapInputSchema.safeParse(params);
                if (!parsed.success) {
                  throw new PulsarValidationError(`Invalid input for amm swap`, parsed.error.format());
                }
                const result = await ammTool({ action, params: parsed.data });
                return {
                  content: [{ type: 'text', text: JSON.stringify(result) }],
                };
              }
              case 'add_liquidity': {
                const parsed = AMMAddLiquidityInputSchema.safeParse(params);
                if (!parsed.success) {
                  throw new PulsarValidationError(`Invalid input for amm add_liquidity`, parsed.error.format());
                }
                const result = await ammTool({ action, params: parsed.data });
                return {
                  content: [{ type: 'text', text: JSON.stringify(result) }],
                };
              }
              case 'remove_liquidity': {
                const parsed = AMMRemoveLiquidityInputSchema.safeParse(params);
                if (!parsed.success) {
                  throw new PulsarValidationError(`Invalid input for amm remove_liquidity`, parsed.error.format());
                }
                const result = await ammTool({ action, params: parsed.data });
                return {
                  content: [{ type: 'text', text: JSON.stringify(result) }],
                };
              }
              case 'get_quote': {
                const parsed = AMMGetQuoteInputSchema.safeParse(params);
                if (!parsed.success) {
                  throw new PulsarValidationError(`Invalid input for amm get_quote`, parsed.error.format());
                }
                const result = await ammTool({ action, params: parsed.data });
                return {
                  content: [{ type: 'text', text: JSON.stringify(result) }],
                };
              }
              case 'get_pool_info': {
                const parsed = AMMGetPoolInfoInputSchema.safeParse(params);
                if (!parsed.success) {
                  throw new PulsarValidationError(`Invalid input for amm get_pool_info`, parsed.error.format());
                }
                const result = await ammTool({ action, params: parsed.data });
                return {
                  content: [{ type: 'text', text: JSON.stringify(result) }],
                };
              }
              default:
                throw new PulsarValidationError(`Invalid AMM action: ${action}`);
            }
          }

          case 'get_protocol_version': {
            const parsed = GetProtocolVersionInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_protocol_version`, parsed.error.format());
            }
            const result = await getProtocolVersion(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'optimize_contract_bytecode': {
            const parsed = OptimizeContractBytecodeInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for optimize_contract_bytecode`,
                parsed.error.format()
              );
            }
            const result = await optimizeContractBytecode(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'get_liquidity_pool': {
            const parsed = GetLiquidityPoolInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_liquidity_pool`, parsed.error.format());
            }
            const result = await getLiquidityPool(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'get_network_params': {
            const parsed = GetNetworkParamsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_network_params`,
                parsed.error.format()
              );
            }
            const result = await getNetworkParams(parsed.data);
          case 'get_fee_stats': {
            const parsed = GetFeeStatsInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_fee_stats`, parsed.error.format());
            }
            const result = await getFeeStats(parsed.data);
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

          case 'track_ledger_consensus_time': {
            const parsed = TrackLedgerConsensusTimeInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for track_ledger_consensus_time`, parsed.error.format());
            }
            const result = await trackLedgerConsensusTime(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'get_price_feed': {
            const parsed = GetPriceFeedInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for get_price_feed`,
                parsed.error.format()
              );
            }
            const result = await getPriceFeed(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          case 'calculate_dutch_auction_price': {
            const parsed = CalculateDutchAuctionPriceInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for calculate_dutch_auction_price`,
                parsed.error.format()
              );
            }
            const result = await calculateDutchAuctionPrice(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'calculate_english_auction_state': {
            const parsed = CalculateEnglishAuctionStateInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for calculate_english_auction_state`,
                parsed.error.format()
              );
            }
            const result = await calculateEnglishAuctionState(parsed.data);
          case 'compute_interest_rates': {
            const parsed = ComputeInterestRatesInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for compute_interest_rates`, parsed.error.format());
            }
            const result = await computeInterestRates(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'calculate_borrowing_capacity': {
            const parsed = CalculateBorrowingCapacityInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for calculate_borrowing_capacity`, parsed.error.format());
            }
            const result = await calculateBorrowingCapacity(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }

          case 'safe_math_compute': {
            const parsed = SafeMathComputeInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for safe_math_compute`,
                parsed.error.format()
              );
            }
            const result = await safeMathCompute(parsed.data);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
          }
          case 'decode_ledger_entry': {
            const parsed = decodeLedgerEntrySchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(
                `Invalid input for decode_ledger_entry`,
                parsed.error.format()
              );
            }
            const result = await decodeLedgerEntryTool(parsed.data);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(applyFieldProjection(result, parsed.data.fields)),
                },
              ],
            };
          }

          case 'get_orderbook': {
            const parsed = GetOrderbookInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for get_orderbook`, parsed.error.format());
            }
            const result = await getOrderbook(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          case 'estimate_token_fees': {
            const parsed = EstimateTokenFeesInputSchema.safeParse(args);
            if (!parsed.success) {
              throw new PulsarValidationError(`Invalid input for estimate_token_fees`, parsed.error.format());
            }
            const result = await estimateTokenFees(parsed.data);
            return {
              content: [{ type: 'text', text: JSON.stringify(result) }],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }

        await logToolExecution(name, args, 'success', result);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      } catch (error) {
        return await this.handleToolError(error, name, args);
      }
    });
  }

  private async handleToolError(error: unknown, toolName: string, inputs: any) {
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

  private successResponse(toolName: ToolName, result: unknown) {
    const outputSchema = TOOL_OUTPUT_SCHEMAS[toolName];
    const validatedResult = validateToolOutput(toolName, outputSchema, result);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(validatedResult),
        },
      ],
    };
  }

  private handleToolError(error: unknown, toolName: string) {
    let pulsarError: PulsarError;
    if (error instanceof PulsarError) {
      pulsarError = error;
    } else if (error instanceof McpError) {
      throw error;
    } else {
      // Log MCP errors (e.g. MethodNotFound) before passing through
      await logToolExecution(toolName, inputs, 'error', {
        status: 'error',
        error_code: error.code,
        message: error.message,
      });
      throw error;
    } else {
      pulsarError = new PulsarNetworkError(error instanceof Error ? error.message : String(error), { originalError: error });
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

    const errorResponse = {
    const errorPayload = validateToolOutput('tool_error', ToolErrorOutputSchema, {
      status: 'error',
      error_code: pulsarError.code,
      message: pulsarError.message,
      details: pulsarError.details,
    };

    await logToolExecution(toolName, inputs, 'error', errorResponse);
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse),
          text: JSON.stringify(errorPayload),
        },
      ],
    logger.error({ tool: toolName, errorCode: pulsarError.code, error: pulsarError.message, details: pulsarError.details }, `Error executing tool ${toolName}`);
    return {
      content: [{ type: 'text', text: JSON.stringify({ status: 'error', error_code: pulsarError.code, message: pulsarError.message, details: pulsarError.details }) }],
      isError: true,
    };
  }

  private handleErrors() {
    this.server.onerror = (error) => { logger.error({ error }, '[MCP Error]'); };
  }

  private startMetricsServer(): http.Server | null {
    if (!config.metricsEnabled) {
      logger.info('Metrics disabled via METRICS_ENABLED=false');
      return null;
    }

    const metricsServer = http.createServer(async (req, res) => {
      if (req.url === '/metrics' && req.method === 'GET') {
        try {
          const metrics = await getPrometheusMetrics();
          res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
          res.end(metrics);
        } catch (error) {
          logger.error({ error }, 'Failed to generate metrics');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to generate metrics' }));
        }
      } else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    metricsServer.listen(config.metricsPort, () => {
      logger.info(`Metrics server listening on http://localhost:${config.metricsPort}/metrics`);
    });

    metricsServer.on('error', (error) => {
      logger.error({ error }, `Failed to start metrics server on port ${config.metricsPort}`);
    });

    return metricsServer;
  }

  async run() {
    // Start metrics recording and endpoint
    if (config.metricsEnabled) {
      const metricsInterval = startMetricsRecording();
      this.startMetricsServer();

      // Cleanup on exit
      process.on('exit', () => {
        clearInterval(metricsInterval);
      });
    }

    await addressRegistry.load();
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
const pulsar = new PulsarServer();
initializeI18n({ language: config.language });
pulsar.run().catch((error) => {
  logger.fatal({ error }, 'Fatal error in pulsar server');
  process.exit(1);
});
});
    logger.info(`pulsar MCP server running on ${config.stellarNetwork}`);
  }
}

new PulsarServer().run();

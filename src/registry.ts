import { z } from 'zod';

import { fetchContractSpec, fetchContractSpecSchema } from './tools/fetch_contract_spec.js';
import { submitTransaction } from './tools/submit_transaction.js';
import { simulateTransaction } from './tools/simulate_transaction.js';
import { getAccountBalance } from './tools/get_account_balance.js';
import { computeVestingSchedule } from './tools/compute_vesting_schedule.js';
import { deployContract } from './tools/deploy_contract.js';
import {
  GetAccountBalanceInputSchema,
  SubmitTransactionInputSchema,
  SimulateTransactionInputSchema,
  ComputeVestingScheduleInputSchema,
  DeployContractInputSchema,
} from './schemas/tools.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // MCP-compatible JSON schema
  zodSchema: z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any) => Promise<unknown>;
}

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'get_account_balance',
    description:
      'Get the current XLM and issued asset balances for a Stellar account. Optionally filter by asset code and/or issuer.',
    zodSchema: GetAccountBalanceInputSchema,
    handler: getAccountBalance,
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'The Stellar public key (G...)' },
        asset_code: { type: 'string', description: 'Optional: Filter by asset code (e.g. USDC)' },
        asset_issuer: { type: 'string', description: 'Optional: Filter by asset issuer (G...)' },
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
      '⚠️ IRREVERSIBLE. Always simulate first.\n\nSubmits a signed transaction envelope (XDR) to the Stellar network via Horizon.',
    zodSchema: SubmitTransactionInputSchema,
    handler: submitTransaction,
    inputSchema: {
      type: 'object',
      properties: {
        xdr: { type: 'string', description: 'Base64-encoded XDR of the transaction envelope.' },
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
    description: 'Fetch the ABI/interface spec of a deployed Soroban contract.',
    zodSchema: fetchContractSpecSchema,
    handler: fetchContractSpec,
    inputSchema: {
      type: 'object',
      properties: {
        contract_id: { type: 'string', description: 'The Soroban contract address (C...)' },
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
    zodSchema: SimulateTransactionInputSchema,
    handler: simulateTransaction,
    inputSchema: {
      type: 'object',
      properties: {
        xdr: { type: 'string', description: 'Base64-encoded XDR of the transaction envelope.' },
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
      'Calculate a token vesting / timelock release schedule for team, investors, or advisors.',
    zodSchema: ComputeVestingScheduleInputSchema,
    handler: computeVestingSchedule,
    inputSchema: {
      type: 'object',
      properties: {
        total_amount: { type: 'number', description: 'Total token amount to vest.' },
        start_timestamp: { type: 'number', description: 'Unix timestamp when vesting begins.' },
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
    description: 'Builds a Stellar transaction for deploying a Soroban smart contract.',
    zodSchema: DeployContractInputSchema,
    handler: deployContract,
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
          description: 'Stellar public key (G...) that will deploy the contract and pay fees.',
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
];

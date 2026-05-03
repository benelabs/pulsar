/**
 * Unit tests for per-tool input schemas.
 * 100% coverage of all tool-specific validators.
 */

import { describe, it, expect } from 'vitest';

import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  StellarPublicKeySchema,
  ContractIdSchema,
  XdrBase64Schema,
  NetworkSchema,
} from "./index.js";
import {
  ComputeVestingScheduleOutputSchema,
  DeployContractOutputSchema,
  FetchContractSpecInputSchema,
  FetchContractSpecOutputSchema,
  GetAccountBalanceInputSchema,
  GetAccountBalancesInputSchema,
  GetAccountBalanceOutputSchema,
  SimulateTransactionOutputSchema,
  SubmitTransactionInputSchema,
  SubmitTransactionOutputSchema,
  TOOL_OUTPUT_SCHEMAS,
  ToolErrorOutputSchema,
  ToolNameSchema,
  ContractReadInputSchema,
} from './tools.js';
  GetContractStorageInputSchema,
  BuildTransactionInputSchema,
} from "./tools.js";

// ============================================================================
// GetAccountBalanceInputSchema
// ============================================================================

describe('GetAccountBalanceInputSchema', () => {
  it('accepts valid account_id alone', () => {
    const input = {
      account_id: 'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234',
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts valid account_id with network override', () => {
    const input = {
      account_id: 'GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ',
      network: 'testnet',
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBe('testnet');
    }
  });

  it('accepts all valid networks', () => {
    const networks = ['mainnet', 'testnet', 'futurenet', 'custom'];
    networks.forEach((network) => {
      const input = {
        account_id: 'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234',
        network,
      };
      const result = GetAccountBalanceInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  it('rejects missing account_id', () => {
    const input = { network: 'testnet' };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid account_id', () => {
    const input = {
      account_id: 'INVALID_KEY',
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid network', () => {
    const input = {
      account_id: 'GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7',
      network: 'unknown',
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('makes network optional', () => {
    const input = {
      account_id: 'GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7',
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBeUndefined();
    }
  });
});

// ============================================================================
// GetAccountBalancesInputSchema
// ============================================================================

describe('GetAccountBalancesInputSchema', () => {
  const accountIds = [
    'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234',
    'GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ',
  ];

  it('accepts valid account_ids with defaults', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_concurrency).toBe(5);
    }
  });

  it('accepts an explicit network, filters, and concurrency', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      network: 'testnet',
      asset_code: 'USDC',
      asset_issuer: 'GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7',
      max_concurrency: 3,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBe('testnet');
      expect(result.data.asset_code).toBe('USDC');
      expect(result.data.max_concurrency).toBe(3);
    }
  });

  it('rejects an empty account_ids array', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects duplicate account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: [accountIds[0], accountIds[0]],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Duplicate');
    }
  });

  it('rejects invalid account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: ['INVALID_KEY'],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than 25 account_ids', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: Array.from({ length: 26 }, (_, index) =>
        `G${String(index).padStart(55, 'A')}`.slice(0, 56)
      ),
    });

    expect(result.success).toBe(false);
  });

  it('rejects max_concurrency below the lower bound', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      max_concurrency: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('at least 1');
    }
  });

  it('rejects max_concurrency above the upper bound', () => {
    const result = GetAccountBalancesInputSchema.safeParse({
      account_ids: accountIds,
      max_concurrency: 11,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('must not exceed');
    }
  });
});

// ============================================================================
// SubmitTransactionInputSchema
// ============================================================================

describe('SubmitTransactionInputSchema', () => {
  const validXdr = 'AAAAAgAAAABvalidXDRbase64==';

  it('accepts minimal input with just XDR', () => {
    const input = { xdr: validXdr };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.xdr).toBe(validXdr);
      expect(result.data.sign).toBe(false); // default
      expect(result.data.wait_for_result).toBe(false); // default
      expect(result.data.wait_timeout_ms).toBe(30_000); // default
    }
  });

  it('accepts valid XDR with all optional fields', () => {
    const input = {
      xdr: validXdr,
      network: 'testnet',
      sign: true,
      wait_for_result: true,
      wait_timeout_ms: 60_000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBe('testnet');
      expect(result.data.sign).toBe(true);
      expect(result.data.wait_for_result).toBe(true);
      expect(result.data.wait_timeout_ms).toBe(60_000);
    }
  });

  it('rejects missing XDR', () => {
    const input = { network: 'testnet' };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid XDR', () => {
    const input = { xdr: '!!!invalid base64!!!' };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty XDR', () => {
    const input = { xdr: '' };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects wait_timeout_ms less than 1000 ms', () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 999,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('1000');
    }
  });

  it('rejects wait_timeout_ms greater than 120000 ms', () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 120_001,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('120000');
    }
  });

  it('accepts wait_timeout_ms at lower bound (1000)', () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 1000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_timeout_ms).toBe(1000);
    }
  });

  it('accepts wait_timeout_ms at upper bound (120000)', () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 120_000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_timeout_ms).toBe(120_000);
    }
  });

  it('rejects non-integer wait_timeout_ms', () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 30.5,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid network', () => {
    const input = {
      xdr: validXdr,
      network: 'unknown',
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('handles sign as boolean', () => {
    const input = { xdr: validXdr, sign: false };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sign).toBe(false);
    }
  });

  it('rejects sign as non-boolean', () => {
    const input = { xdr: validXdr, sign: 'yes' };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('handles wait_for_result as boolean', () => {
    const input = { xdr: validXdr, wait_for_result: true };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_for_result).toBe(true);
    }
  });

  it('rejects wait_for_result as non-boolean', () => {
    const input = { xdr: validXdr, wait_for_result: 'definitely' };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ContractReadInputSchema
// ============================================================================

describe('ContractReadInputSchema', () => {
  const validContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

  it('accepts valid contract_id and method', () => {
    const input = {
      contract_id: validContractId,
      method: 'get_value',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts valid contract_id, method, and args', () => {
    const input = {
      contract_id: validContractId,
      method: 'transfer',
      args: {
        to: 'GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234',
        amount: '1000',
      },
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toEqual({
        to: expect.any(String),
        amount: '1000',
      });
    }
  });

  it('rejects missing contract_id', () => {
    const input = { method: 'get_value' };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid contract_id', () => {
    const input = {
      contract_id: 'INVALID_CONTRACT',
      method: 'get_value',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects missing method', () => {
    const input = { contract_id: validContractId };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty method', () => {
    const input = {
      contract_id: validContractId,
      method: '',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('empty');
    }
  });

  it('rejects method with invalid characters (hyphens)', () => {
    const input = {
      contract_id: validContractId,
      method: 'get-value',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('identifier');
    }
  });

  it('rejects method starting with number', () => {
    const input = {
      contract_id: validContractId,
      method: '123method',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts valid method names with underscores', () => {
    const input = {
      contract_id: validContractId,
      method: 'get_current_value',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts valid method names starting with underscore', () => {
    const input = {
      contract_id: validContractId,
      method: '_internal_method',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('makes args optional', () => {
    const input = {
      contract_id: validContractId,
      method: 'get_value',
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toBeUndefined();
    }
  });

  it('accepts empty args object', () => {
    const input = {
      contract_id: validContractId,
      method: 'get_value',
      args: {},
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts args with various value types', () => {
    const input = {
      contract_id: validContractId,
      method: 'complex_method',
      method: "complex_method",
      args: {
        string_arg: 'value',
        number_arg: 42,
        boolean_arg: true,
        null_arg: null,
        array_arg: [1, 2, 3],
        object_arg: { nested: 'value' },
      },
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('tool output schemas', () => {
  it('validates get_account_balance output', () => {
    const result = GetAccountBalanceOutputSchema.safeParse({
      account_id: 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG',
      balances: [{ asset_type: 'native', balance: '100.0' }],
    });
    expect(result.success).toBe(true);
  });

  it('validates fetch_contract_spec output', () => {
    const result = FetchContractSpecOutputSchema.safeParse({
      contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      network: 'testnet',
      functions: [],
      events: [],
      raw_xdr: '',
    });
    expect(result.success).toBe(true);
  });

  it('validates submit_transaction output union', () => {
    const result = SubmitTransactionOutputSchema.safeParse({
      status: 'SUBMITTED',
      hash: 'abc123',
      ledger: null,
      fee_charged: null,
      envelope_xdr: null,
      result_xdr: null,
      result_meta_xdr: null,
    });
    expect(result.success).toBe(true);
  });

  it('validates simulate_transaction output', () => {
    const result = SimulateTransactionOutputSchema.safeParse({
      status: 'SUCCESS',
      cost: { cpu_instructions: '1', memory_bytes: '2' },
      footprint: { read_only: [], read_write: [] },
      min_resource_fee: '0',
      events: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates compute_vesting_schedule output', () => {
    const result = ComputeVestingScheduleOutputSchema.safeParse({
      beneficiary_type: 'team',
      total_amount: '1.0',
      start_date: new Date().toISOString(),
      cliff_date: new Date().toISOString(),
      end_date: new Date().toISOString(),
      released_amount: '0.0',
      unreleased_amount: '1.0',
      vesting_percentage: 0,
      schedule: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates deploy_contract output', () => {
    const result = DeployContractOutputSchema.safeParse({
      mode: 'direct',
      transaction_xdr: 'AAAA',
      predicted_contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      network: 'testnet',
      source_account: 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG',
    });
    expect(result.success).toBe(true);
  });

  it('validates tool error output', () => {
    const result = ToolErrorOutputSchema.safeParse({
      status: 'error',
      error_code: 'VALIDATION_ERROR',
      message: 'invalid input',
      details: {},
    });
    expect(result.success).toBe(true);
  });

  it('exports output schema map for all tool names', () => {
    const names = ToolNameSchema.options;
    for (const name of names) {
      expect(TOOL_OUTPUT_SCHEMAS[name]).toBeDefined();
    }
  });
});

describe('FetchContractSpecInputSchema', () => {
  it('accepts valid contract and optional network', () => {
    const result = FetchContractSpecInputSchema.safeParse({
      contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      network: 'testnet',
    });
    expect(result.success).toBe(true);
// ============================================================================
// GetContractStorageInputSchema
// ============================================================================

describe("GetContractStorageInputSchema", () => {
  const validContractId =
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  it("accepts instance storage without key", () => {
    const input = {
      contract_id: validContractId,
      storage_type: "instance",
    };
    const result = GetContractStorageInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts persistent storage with key", () => {
    const input = {
      contract_id: validContractId,
      storage_type: "persistent",
      key: { type: "symbol", value: "Balance" },
    };
    const result = GetContractStorageInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts temporary storage with key", () => {
    const input = {
      contract_id: validContractId,
      storage_type: "temporary",
      key: { value: 123 },
    };
    const result = GetContractStorageInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects persistent storage without key", () => {
    const input = {
      contract_id: validContractId,
      storage_type: "persistent",
    };
    const result = GetContractStorageInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects instance storage with key", () => {
    const input = {
      contract_id: validContractId,
      storage_type: "instance",
      key: { value: "ignored" },
    };
    const result = GetContractStorageInputSchema.safeParse(input);
    expect(result.success).toBe(false);
// BuildTransactionInputSchema
// ============================================================================

describe("BuildTransactionInputSchema", () => {
  const validSourceAccount = "GD5DJOWB5G4H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6H6";

  describe("Basic Validation", () => {
    it("accepts minimal input with payment operation", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects missing source_account", () => {
      const input = {
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects empty operations array", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("accepts optional network override", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        network: "mainnet",
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.network).toBe("mainnet");
      }
    });

    it("accepts optional fee", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        fee: 50000,
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fee).toBe(50000);
      }
    });

    it("accepts optional timeout", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        timeout: 60,
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timeout).toBe(60);
      }
    });
  });

  describe("Payment Operations", () => {
    it("accepts native XLM payment", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts asset payment with issuer", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
            asset_code: "USDC",
            asset_issuer: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects payment with negative amount", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: -100,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects payment with zero amount", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 0,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Change Trust Operations", () => {
    it("accepts change trust operation", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "change_trust",
            asset_code: "USDC",
            asset_issuer: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts change trust with limit", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "change_trust",
            asset_code: "USDC",
            asset_issuer: validSourceAccount,
            limit: "1000000",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects change trust without asset_code", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "change_trust",
            asset_issuer: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects change trust without asset_issuer", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "change_trust",
            asset_code: "USDC",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Manage Data Operations", () => {
    it("accepts manage data with string value", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            name: "test_key",
            value: "test_value",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts manage data with object value", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            name: "test_key",
            value: { nested: "value" },
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts manage data without value (clear operation)", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            name: "test_key",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects manage data without name", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            value: "test_value",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects manage data with empty name", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            name: "",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects manage data with name too long", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "manage_data",
            name: "a".repeat(65), // 65 bytes, max is 64
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Set Options Operations", () => {
    it("accepts minimal set options", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "set_options",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts set options with all fields", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "set_options",
            inflation_destination: validSourceAccount,
            clear_flags: 1,
            set_flags: 2,
            master_weight: 1,
            low_threshold: 2,
            med_threshold: 3,
            high_threshold: 4,
            home_domain: "example.com",
            signer_address: validSourceAccount,
            signer_type: "ed25519_public_key",
            signer_weight: 1,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects set options with invalid signer_type", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "set_options",
            signer_address: validSourceAccount,
            signer_type: "invalid_type",
            signer_weight: 1,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects set options with clear_flags out of range", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "set_options",
            clear_flags: 8, // max is 7
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects set options with home_domain too long", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "set_options",
            home_domain: "a".repeat(33), // 33 chars, max is 32
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Account Merge Operations", () => {
    it("accepts account merge operation", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "account_merge",
            destination: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects account merge without destination", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "account_merge",
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Create Account Operations", () => {
    it("accepts create account operation", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "create_account",
            destination: validSourceAccount,
            starting_balance: 1.5,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects create account without destination", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "create_account",
            starting_balance: 2,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects create account without starting_balance", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "create_account",
            destination: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects create account with insufficient balance", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "create_account",
            destination: validSourceAccount,
            starting_balance: 0.5,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects create account with negative balance", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "create_account",
            destination: validSourceAccount,
            starting_balance: -1,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Multiple Operations", () => {
    it("accepts multiple operations", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
          {
            type: "change_trust",
            asset_code: "USDC",
            asset_issuer: validSourceAccount,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operations).toHaveLength(2);
      }
    });
  });

  describe("Fee and Timeout Validation", () => {
    it("rejects fee below minimum", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        fee: 99, // minimum is 100
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects negative timeout", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        timeout: -1,
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects timeout above maximum", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "payment",
            destination: validSourceAccount,
            amount: 100,
          },
        ],
        timeout: 65536, // max is 65535
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("Invalid Operation Types", () => {
    it("rejects unknown operation type", () => {
      const input = {
        source_account: validSourceAccount,
        operations: [
          {
            type: "unknown_operation" as any,
          },
        ],
      };
      const result = BuildTransactionInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

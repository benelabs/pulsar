/**
 * Unit tests for per-tool input schemas.
 * 100% coverage of all tool-specific validators.
 */

import { describe, it, expect } from 'vitest';

import {
  ComputeVestingScheduleOutputSchema,
  DeployContractOutputSchema,
  FetchContractSpecInputSchema,
  FetchContractSpecOutputSchema,
  GetAccountBalanceInputSchema,
  GetAccountBalanceOutputSchema,
  SimulateTransactionOutputSchema,
  SubmitTransactionInputSchema,
  SubmitTransactionOutputSchema,
  TOOL_OUTPUT_SCHEMAS,
  ToolErrorOutputSchema,
  ToolNameSchema,
  ContractReadInputSchema,
} from './tools.js';

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
  });
});

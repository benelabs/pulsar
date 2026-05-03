import { describe, expect, it } from 'vitest';

import { GetAccountBalanceOutputSchema, ToolErrorOutputSchema } from '../../src/schemas/tools.js';
import { validateToolOutput } from '../../src/utils/output-validation.js';

describe('validateToolOutput', () => {
  it('returns parsed output when schema matches', () => {
    const result = validateToolOutput('get_account_balance', GetAccountBalanceOutputSchema, {
      account_id: 'GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG',
      balances: [{ asset_type: 'native', balance: '1.0' }],
    });

    expect(result.account_id).toBe('GDH6TOWBDPXG7H5XQAWY2236P44XGHYYND43NHN7Q4XQAWY2236P44XG');
    expect(result.balances).toHaveLength(1);
  });

  it('throws PulsarValidationError when schema does not match', () => {
    expect(() =>
      validateToolOutput('get_account_balance', GetAccountBalanceOutputSchema, {
        account_id: 'invalid',
        balances: [],
      })
    ).toThrow('Invalid output for get_account_balance');
  });

  it('validates tool error envelope', () => {
    const result = validateToolOutput('tool_error', ToolErrorOutputSchema, {
      status: 'error',
      error_code: 'NETWORK_ERROR',
      message: 'network unavailable',
      details: { retry: true },
    });

    expect(result.status).toBe('error');
    expect(result.error_code).toBe('NETWORK_ERROR');
  });
});

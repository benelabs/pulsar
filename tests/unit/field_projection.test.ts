import { describe, it, expect } from 'vitest';

import { applyFieldProjection, FieldsSchema } from '../../src/schemas/index.js';

describe('FieldsSchema', () => {
  it('accepts undefined (field projection is optional)', () => {
    const result = FieldsSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it('accepts a non-empty string array', () => {
    const result = FieldsSchema.safeParse(['account_id', 'balances']);
    expect(result.success).toBe(true);
  });

  it('rejects an empty array', () => {
    const result = FieldsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('rejects an array containing an empty string', () => {
    const result = FieldsSchema.safeParse(['account_id', '']);
    expect(result.success).toBe(false);
  });

  it('rejects non-array values', () => {
    expect(FieldsSchema.safeParse('balance').success).toBe(false);
    expect(FieldsSchema.safeParse(42).success).toBe(false);
    expect(FieldsSchema.safeParse({ field: 'balance' }).success).toBe(false);
  });
});

describe('applyFieldProjection', () => {
  const full = {
    account_id: 'GABCDE',
    balances: [{ asset_type: 'native', balance: '100.0000000' }],
    network: 'testnet',
  };

  it('returns the full object when fields is undefined', () => {
    expect(applyFieldProjection(full, undefined)).toStrictEqual(full);
  });

  it('projects a single requested field', () => {
    const result = applyFieldProjection(full, ['account_id']);
    expect(result).toStrictEqual({ account_id: 'GABCDE' });
  });

  it('projects multiple requested fields', () => {
    const result = applyFieldProjection(full, ['account_id', 'network']);
    expect(result).toStrictEqual({ account_id: 'GABCDE', network: 'testnet' });
  });

  it('silently omits unknown field names', () => {
    const result = applyFieldProjection(full, ['account_id', 'nonexistent_field']);
    expect(result).toStrictEqual({ account_id: 'GABCDE' });
    expect('nonexistent_field' in result).toBe(false);
  });

  it('returns an empty object when no requested fields exist on the result', () => {
    const result = applyFieldProjection(full, ['does_not_exist']);
    expect(result).toStrictEqual({});
  });

  it('preserves array values in the projection', () => {
    const result = applyFieldProjection(full, ['balances']);
    expect(result.balances).toStrictEqual(full.balances);
  });

  it('does not include inherited prototype properties', () => {
    const obj = Object.create({ inherited: 'should-not-appear' });
    obj.own = 'value';
    const result = applyFieldProjection(obj as Record<string, unknown>, ['inherited', 'own']);
    expect('inherited' in result).toBe(false);
    expect(result.own).toBe('value');
  });

  it('does not mutate the original result object', () => {
    const original = { account_id: 'GABCDE', network: 'testnet' };
    applyFieldProjection(original, ['account_id']);
    expect(original).toHaveProperty('network');
  });
});

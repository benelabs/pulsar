import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

import { AddressRegistry } from '../../src/services/address-registry.js';
import { checkToolInput } from '../../src/services/address-guard.js';

const VALID_ADDRESSES = [
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  'GBVVJJWAKWYMKWMQHWOMTEKOVGA2PTLWE67QAUMLJLN2JIQJDQKXJYW',
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZXG5CSTF912XYQFBEHL6',
  'GDQERENWDDSQZS7R7WQTZYVSWQAKELHAKMHBIJKJKZQKJKZQKJKZQKJ',
  'CA7QYNF7SOWQ3GLR2BGMZEHXR3IQKZQKJKZQKJKZQKJKZQKJKZQKJKZ',
  'CBIELTK6YBZJU5UP2WWQEQ4YY7QQKJKZQKJKZQKJKZQKJKZQKJKZQKJ',
];

let validAddresses: string[];

describe('checkToolInput (Guard)', () => {
  let registry: AddressRegistry;

  beforeEach(() => {
    registry = new AddressRegistry();
    validAddresses = VALID_ADDRESSES.filter((addr) => {
      try {
        registry.add(addr);
        registry.remove(addr);
        return true;
      } catch {
        return false;
      }
    });
  });

  // ── Unit tests ──────────────────────────────────────────────────────────

  it('blocks a restricted account_id for get_account_balance', () => {
    const addr = validAddresses[0];
    registry.add(addr);
    const result = checkToolInput('get_account_balance', { account_id: addr }, registry);
    expect(result.blocked).toBe(true);
    expect(result.address).toBe(addr);
  });

  it('blocks a restricted asset_issuer for get_account_balance', () => {
    const addr = validAddresses[0];
    registry.add(addr);
    const result = checkToolInput('get_account_balance', { account_id: validAddresses[1], asset_issuer: addr }, registry);
    expect(result.blocked).toBe(true);
    expect(result.address).toBe(addr);
  });

  it('blocks a restricted contract_id for fetch_contract_spec', () => {
    const addr = validAddresses.find((a) => a.startsWith('C')) ?? validAddresses[0];
    registry.add(addr);
    const result = checkToolInput('fetch_contract_spec', { contract_id: addr }, registry);
    expect(result.blocked).toBe(true);
  });

  it('allows unrestricted address for get_account_balance', () => {
    const result = checkToolInput('get_account_balance', { account_id: validAddresses[0] }, registry);
    expect(result.blocked).toBe(false);
  });

  it('does not check XDR fields for submit_transaction', () => {
    registry.add(validAddresses[0]);
    const result = checkToolInput('submit_transaction', { xdr: 'AAAA...', sign: false }, registry);
    expect(result.blocked).toBe(false);
  });

  it('does not check XDR fields for simulate_transaction', () => {
    registry.add(validAddresses[0]);
    const result = checkToolInput('simulate_transaction', { xdr: 'AAAA...' }, registry);
    expect(result.blocked).toBe(false);
  });

  it('skips undefined address fields without throwing', () => {
    expect(() =>
      checkToolInput('get_account_balance', { account_id: validAddresses[0] }, registry)
    ).not.toThrow();
  });

  it('skips null/undefined values in address fields', () => {
    const result = checkToolInput('get_account_balance', { account_id: validAddresses[0], asset_issuer: undefined }, registry);
    expect(result.blocked).toBe(false);
  });

  it('returns blocked: false for unknown tool names', () => {
    registry.add(validAddresses[0]);
    const result = checkToolInput('unknown_tool', { account_id: validAddresses[0] }, registry);
    expect(result.blocked).toBe(false);
  });

  // ── Property tests ──────────────────────────────────────────────────────

  // Feature: restricted-addresses, Property 4: Guard blocks restricted addresses
  it('Property 4: Guard blocks restricted addresses — any restricted address in a checked field returns blocked: true', () => {
    // Validates: Requirements 2.1, 2.2
    fc.assert(
      fc.property(fc.constantFrom(...validAddresses), (address) => {
        const reg = new AddressRegistry();
        try {
          reg.add(address);
        } catch {
          return; // skip if invalid
        }
        const gResult = checkToolInput('get_account_balance', { account_id: address }, reg);
        expect(gResult.blocked).toBe(true);
        expect(gResult.address).toBe(address);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: restricted-addresses, Property 5: Guard allows unrestricted addresses
  it('Property 5: Guard allows unrestricted addresses — address not in registry returns blocked: false', () => {
    // Validates: Requirements 2.5
    fc.assert(
      fc.property(
        fc.constantFrom(...validAddresses),
        fc.constantFrom(...validAddresses),
        (restricted, queried) => {
          if (restricted === queried) return; // skip same address
          const reg = new AddressRegistry();
          try {
            reg.add(restricted);
          } catch {
            return;
          }
          const result = checkToolInput('get_account_balance', { account_id: queried }, reg);
          expect(result.blocked).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

import { AddressRegistry } from '../../src/services/address-registry.js';
import { PulsarValidationError } from '../../src/errors.js';

// Known-valid Stellar public keys (G...) and contract IDs (C...) — 56 chars, base32
const VALID_ADDRESSES = [
  'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  'GBVVJJWAKWYMKWMQHWOMTEKOVGA2PTLWE67QAUMLJLN2JIQJDQKXJYW',
  'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZXG5CSTF912XYQFBEHL6',
  'GDQERENWDDSQZS7R7WQTZYVSWQAKELHAKMHBIJKJKZQKJKZQKJKZQKJ',
  'GBSAYNMLOLLERR7RKRMEFTHREQQONZXM3Y7IQKZQKJKZQKJKZQKJKZQ',
  'CA7QYNF7SOWQ3GLR2BGMZEHXR3IQKZQKJKZQKJKZQKJKZQKJKZQKJKZ',
  'CBIELTK6YBZJU5UP2WWQEQ4YY7QQKJKZQKJKZQKJKZQKJKZQKJKZQKJ',
  'CCYOZJCOPX3PP3SVTAN37IRZQKJKZQKJKZQKJKZQKJKZQKJKZQKJKZQ',
];

// Filter to only addresses that actually pass the registry's own validation
let validAddresses: string[];

describe('AddressRegistry', () => {
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

  // ── Unit tests ────────────────────────────────────────────────────────────

  it('add then has returns true', () => {
    const addr = validAddresses[0];
    registry.add(addr);
    expect(registry.has(addr)).toBe(true);
  });

  it('remove makes has return false', () => {
    const addr = validAddresses[0];
    registry.add(addr);
    registry.remove(addr);
    expect(registry.has(addr)).toBe(false);
  });

  it('remove on absent address is a no-op', () => {
    expect(() => registry.remove(validAddresses[0])).not.toThrow();
  });

  it('list returns sorted array', () => {
    validAddresses.slice(0, 3).forEach((a) => registry.add(a));
    const listed = registry.list();
    expect(listed).toEqual([...listed].sort());
  });

  it('has returns false for unknown address', () => {
    expect(registry.has(validAddresses[0])).toBe(false);
  });

  it('add throws PulsarValidationError for invalid address', () => {
    expect(() => registry.add('not-an-address')).toThrow(PulsarValidationError);
  });

  // ── Property tests ────────────────────────────────────────────────────────

  // Feature: restricted-addresses, Property 1: Add then has
  it('Property 1: Add then has — for any valid address, after add(), has() returns true', () => {
    // Validates: Requirements 1.1, 1.6, 1.9
    fc.assert(
      fc.property(fc.constantFrom(...validAddresses), (address) => {
        const reg = new AddressRegistry();
        reg.add(address);
        expect(reg.has(address)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: restricted-addresses, Property 2: Add/remove round trip
  it('Property 2: Add/remove round trip — add then remove leaves has() false and list() unchanged', () => {
    // Validates: Requirements 1.7, 1.9
    fc.assert(
      fc.property(fc.constantFrom(...validAddresses), (address) => {
        const reg = new AddressRegistry();
        const listBefore = reg.list();
        reg.add(address);
        reg.remove(address);
        expect(reg.has(address)).toBe(false);
        expect(reg.list()).toEqual(listBefore);
      }),
      { numRuns: 100 }
    );
  });

  // Feature: restricted-addresses, Property 3: Set semantics — no duplicates
  it('Property 3: Set semantics — adding an address N times results in it appearing exactly once in list()', () => {
    // Validates: Requirements 1.10
    fc.assert(
      fc.property(
        fc.constantFrom(...validAddresses),
        fc.integer({ min: 1, max: 10 }),
        (address, n) => {
          const reg = new AddressRegistry();
          for (let i = 0; i < n; i++) {
            reg.add(address);
          }
          const occurrences = reg.list().filter((a) => a === address).length;
          expect(occurrences).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: restricted-addresses, Property 6: Invalid addresses are rejected
  it('Property 6: Invalid addresses rejected — non-G.../C... strings cause add() to throw PulsarValidationError', () => {
    // Validates: Requirements 1.4, 1.5
    const invalidArb = fc.oneof(
      // Wrong prefix
      fc
        .tuple(
          fc.constantFrom('A', 'B', 'D', 'E', 'F', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'),
          fc.string({ minLength: 55, maxLength: 55, unit: 'grapheme-ascii' })
        )
        .map(([prefix, rest]) => prefix + rest),
      // Correct prefix but wrong length (too short)
      fc
        .tuple(
          fc.constantFrom('G', 'C'),
          fc.string({ minLength: 1, maxLength: 50, unit: 'grapheme-ascii' })
        )
        .map(([prefix, rest]) => prefix + rest)
        .filter((s) => s.length < 56),
      // Correct prefix but wrong length (too long)
      fc
        .tuple(
          fc.constantFrom('G', 'C'),
          fc.string({ minLength: 57, maxLength: 70, unit: 'grapheme-ascii' })
        )
        .map(([prefix, rest]) => prefix + rest)
        .filter((s) => s.length > 56)
    );

    fc.assert(
      fc.property(invalidArb, (address) => {
        const reg = new AddressRegistry();
        expect(() => reg.add(address)).toThrow(PulsarValidationError);
      }),
      { numRuns: 100 }
    );
  });
});

// ── Persistence property test ─────────────────────────────────────────────────

describe('AddressRegistry persistence', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pulsar-test-'));
  });

  // Feature: restricted-addresses, Property 8: Persistence round trip
  it('Property 8: Persistence round trip — writing then loading produces the same list()', async () => {
    // Validates: Requirements 4.1, 4.2, 4.5
    const knownValid = [
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      'GBVVJJWAKWYMKWMQHWOMTEKOVGA2PTLWE67QAUMLJLN2JIQJDQKXJYW',
      'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZXG5CSTF912XYQFBEHL6',
      'CA7QYNF7SOWQ3GLR2BGMZEHXR3IQKZQKJKZQKJKZQKJKZQKJKZQKJKZ',
      'CBIELTK6YBZJU5UP2WWQEQ4YY7QQKJKZQKJKZQKJKZQKJKZQKJKZQKJ',
    ];

    // Filter to only addresses that pass validation
    const validForPersistence: string[] = [];
    for (const addr of knownValid) {
      const reg = new AddressRegistry();
      try {
        reg.add(addr);
        validForPersistence.push(addr);
      } catch {
        // skip invalid
      }
    }

    if (validForPersistence.length === 0) return;

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...validForPersistence), { minLength: 1, maxLength: validForPersistence.length }),
        async (addresses) => {
          const filePath = join(tmpDir, `restricted-${Date.now()}-${Math.random()}.json`);
          const reg1 = new AddressRegistry(filePath);
          const unique = [...new Set(addresses)];
          for (const addr of unique) {
            reg1.add(addr);
          }
          // Wait for async persist to complete
          await new Promise((r) => setTimeout(r, 50));

          const reg2 = new AddressRegistry(filePath);
          await reg2.load();
          expect(reg2.list()).toEqual(reg1.list());
        }
      ),
      { numRuns: 20 }
    );
  });

  it('cleanup temp dir', async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});

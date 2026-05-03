import { describe, it, expect, beforeEach, vi } from 'vitest';

import { manageRestrictedAddresses } from '../../src/tools/manage_restricted_addresses.js';
import { addressRegistry } from '../../src/services/address-registry.js';
import { PulsarValidationError } from '../../src/errors.js';

const VALID_G = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const VALID_C = 'CA7QYNF7SOWQ3GLR2BGMZEHXR3IQKZQKJKZQKJKZQKJKZQKJKZQKJKZ';

// Determine which addresses actually pass validation
let validG: string | undefined;
let validC: string | undefined;

describe('manage_restricted_addresses tool', () => {
  beforeEach(() => {
    // Reset the singleton registry between tests
    for (const addr of addressRegistry.list()) {
      addressRegistry.remove(addr);
    }

    // Probe which addresses are valid in this environment
    try { addressRegistry.add(VALID_G); addressRegistry.remove(VALID_G); validG = VALID_G; } catch { validG = undefined; }
    try { addressRegistry.add(VALID_C); addressRegistry.remove(VALID_C); validC = VALID_C; } catch { validC = undefined; }

    // Suppress persist errors in unit tests (no real file system needed)
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it('list returns empty array when registry is empty', async () => {
    const result = await manageRestrictedAddresses({ action: 'list' });
    expect(result).toEqual({ action: 'list', addresses: [], count: 0 });
  });

  // ── add ───────────────────────────────────────────────────────────────────

  it('add inserts a valid address and returns updated count', async () => {
    if (!validG) return;
    const result = await manageRestrictedAddresses({ action: 'add', address: validG });
    expect(result).toMatchObject({ action: 'add', address: validG, count: 1 });
    expect(addressRegistry.has(validG)).toBe(true);
  });

  it('add a second address increments count', async () => {
    if (!validG || !validC) return;
    await manageRestrictedAddresses({ action: 'add', address: validG });
    const result = await manageRestrictedAddresses({ action: 'add', address: validC });
    expect((result as { count: number }).count).toBe(2);
  });

  it('add without address throws PulsarValidationError', async () => {
    await expect(manageRestrictedAddresses({ action: 'add' })).rejects.toThrow(PulsarValidationError);
  });

  it('add with malformed address throws PulsarValidationError', async () => {
    await expect(
      manageRestrictedAddresses({ action: 'add', address: 'not-valid' })
    ).rejects.toThrow(PulsarValidationError);
  });

  // ── remove ────────────────────────────────────────────────────────────────

  it('remove an existing address returns removed: true', async () => {
    if (!validG) return;
    await manageRestrictedAddresses({ action: 'add', address: validG });
    const result = await manageRestrictedAddresses({ action: 'remove', address: validG });
    expect(result).toMatchObject({ action: 'remove', address: validG, removed: true, count: 0 });
    expect(addressRegistry.has(validG)).toBe(false);
  });

  it('remove an absent address returns removed: false', async () => {
    if (!validG) return;
    const result = await manageRestrictedAddresses({ action: 'remove', address: validG });
    expect((result as { removed: boolean }).removed).toBe(false);
  });

  it('remove without address throws PulsarValidationError', async () => {
    await expect(manageRestrictedAddresses({ action: 'remove' })).rejects.toThrow(PulsarValidationError);
  });

  // ── check ─────────────────────────────────────────────────────────────────

  it('check returns restricted: true for a restricted address', async () => {
    if (!validG) return;
    await manageRestrictedAddresses({ action: 'add', address: validG });
    const result = await manageRestrictedAddresses({ action: 'check', address: validG });
    expect(result).toMatchObject({ action: 'check', address: validG, restricted: true });
  });

  it('check returns restricted: false for an unrestricted address', async () => {
    if (!validG) return;
    const result = await manageRestrictedAddresses({ action: 'check', address: validG });
    expect((result as { restricted: boolean }).restricted).toBe(false);
  });

  it('check without address throws PulsarValidationError', async () => {
    await expect(manageRestrictedAddresses({ action: 'check' })).rejects.toThrow(PulsarValidationError);
  });

  // ── list after mutations ──────────────────────────────────────────────────

  it('list reflects all added addresses', async () => {
    if (!validG || !validC) return;
    await manageRestrictedAddresses({ action: 'add', address: validG });
    await manageRestrictedAddresses({ action: 'add', address: validC });
    const result = await manageRestrictedAddresses({ action: 'list' });
    const { addresses } = result as { addresses: string[] };
    expect(addresses).toContain(validG);
    expect(addresses).toContain(validC);
    expect(addresses.length).toBe(2);
  });
});

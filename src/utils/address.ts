/**
 * Address handling utilities for Stellar/Soroban accounts and contracts.
 *
 * Provides:
 *  - normalizeAddress: trim + uppercase before validation so callers don't
 *    have to worry about whitespace or mixed-case input.
 *  - AddressCache: a generic TTL Map keyed by address (or composite key)
 *    that prevents redundant network fetches for the same address within
 *    a short window.
 */

/**
 * Normalize a Stellar public key or contract ID:
 * strip surrounding whitespace and convert to uppercase.
 *
 * Downstream Zod schemas expect exactly this form, so normalizing once
 * here avoids scattered .trim()/.toUpperCase() calls throughout the code.
 */
export function normalizeAddress(address: string): string {
  return address.trim().toUpperCase();
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Generic TTL-based Map cache keyed by a string (typically an address or
 * composite address+network key).
 *
 * Uses a plain Map for O(1) lookup — appropriate for the number of unique
 * addresses a single server process will ever see.  Expired entries are
 * evicted lazily on get() rather than eagerly via timers, keeping the
 * implementation simple and allocation-free.
 */
export class AddressCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { normalizeAddress, AddressCache } from "../../src/utils/address.js";

// ---------------------------------------------------------------------------
// normalizeAddress
// ---------------------------------------------------------------------------

describe("normalizeAddress", () => {
  it("uppercases lowercase input", () => {
    expect(normalizeAddress("gabcdefg")).toBe("GABCDEFG");
  });

  it("strips leading and trailing whitespace", () => {
    expect(normalizeAddress("  GABC  ")).toBe("GABC");
  });

  it("is idempotent on already-normalized addresses", () => {
    const addr = "GDTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ2345678901234";
    expect(normalizeAddress(addr)).toBe(addr);
  });

  it("handles mixed case with surrounding whitespace", () => {
    expect(normalizeAddress(" gAbCdEfG ")).toBe("GABCDEFG");
  });
});

// ---------------------------------------------------------------------------
// AddressCache
// ---------------------------------------------------------------------------

describe("AddressCache", () => {
  const TTL = 100; // 100 ms — short enough to test expiry quickly
  let cache: AddressCache<string>;

  beforeEach(() => {
    cache = new AddressCache<string>(TTL);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a missing key", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value", () => {
    cache.set("testnet:GABC", "some-data");
    expect(cache.get("testnet:GABC")).toBe("some-data");
  });

  it("returns undefined after TTL expires", () => {
    cache.set("testnet:GABC", "some-data");
    vi.advanceTimersByTime(TTL + 1);
    expect(cache.get("testnet:GABC")).toBeUndefined();
  });

  it("returns the value before TTL expires", () => {
    cache.set("testnet:GABC", "some-data");
    vi.advanceTimersByTime(TTL - 1);
    expect(cache.get("testnet:GABC")).toBe("some-data");
  });

  it("evicts the expired entry from the store on get()", () => {
    cache.set("testnet:GABC", "some-data");
    vi.advanceTimersByTime(TTL + 1);
    cache.get("testnet:GABC"); // triggers lazy eviction
    expect(cache.size).toBe(0);
  });

  it("invalidate() removes a specific key", () => {
    cache.set("testnet:GABC", "data-a");
    cache.set("testnet:GXYZ", "data-b");
    cache.invalidate("testnet:GABC");
    expect(cache.get("testnet:GABC")).toBeUndefined();
    expect(cache.get("testnet:GXYZ")).toBe("data-b");
  });

  it("clear() removes all entries", () => {
    cache.set("k1", "v1");
    cache.set("k2", "v2");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("overwrites an existing entry on set()", () => {
    cache.set("testnet:GABC", "old");
    cache.set("testnet:GABC", "new");
    expect(cache.get("testnet:GABC")).toBe("new");
  });

  it("refreshes TTL when entry is overwritten", () => {
    cache.set("testnet:GABC", "first");
    vi.advanceTimersByTime(TTL - 10); // almost expired
    cache.set("testnet:GABC", "refreshed"); // reset TTL
    vi.advanceTimersByTime(TTL - 10); // original would be gone, new is still valid
    expect(cache.get("testnet:GABC")).toBe("refreshed");
  });
});

// ---------------------------------------------------------------------------
// Integration: AddressCache with composite keys (address+network pattern)
// ---------------------------------------------------------------------------

describe("AddressCache composite key pattern", () => {
  it("differentiates entries by network segment", () => {
    const cache = new AddressCache<number>(5_000);
    cache.set("mainnet:GABC", 1);
    cache.set("testnet:GABC", 2);

    expect(cache.get("mainnet:GABC")).toBe(1);
    expect(cache.get("testnet:GABC")).toBe(2);
  });

  it("differentiates entries by asset_code segment", () => {
    const cache = new AddressCache<string>(5_000);
    cache.set("testnet:GABC::USDC:", "usdc-result");
    cache.set("testnet:GABC::", "all-balances");

    expect(cache.get("testnet:GABC::USDC:")).toBe("usdc-result");
    expect(cache.get("testnet:GABC::")).toBe("all-balances");
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RateLimiter } from '../../src/services/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  const MAX_REQUESTS = 3;
  const WINDOW_MS = 1000;

  beforeEach(() => {
    rateLimiter = new RateLimiter(MAX_REQUESTS, WINDOW_MS);
    vi.useFakeTimers();
  });

  it('should allow requests within the limit', () => {
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
  });

  it('should reject requests exceeding the limit', () => {
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(false);
  });

  it('should isolate limits between different clients', () => {
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(false);

    expect(rateLimiter.isAllowed('client2')).toBe(true);
    expect(rateLimiter.isAllowed('client2')).toBe(true);
    expect(rateLimiter.isAllowed('client2')).toBe(true);
    expect(rateLimiter.isAllowed('client2')).toBe(false);
  });

  it('should reset the limit after the window duration', () => {
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(false);

    // Advance time beyond window
    vi.setSystemTime(Date.now() + WINDOW_MS + 1);

    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
    expect(rateLimiter.isAllowed('client1')).toBe(true);
  });

  it('should provide accurate stats', () => {
    rateLimiter.isAllowed('client1');
    rateLimiter.isAllowed('client1');

    const stats = rateLimiter.getStats('client1');
    expect(stats.tokens).toBe(1); // 3 - 2 = 1
    expect(stats.remaining).toBe(1);
    expect(stats.lastRefill).toBeInstanceOf(Date);
  });

  it('should prune expired buckets', () => {
    rateLimiter.isAllowed('client1');
    rateLimiter.isAllowed('client2');

    vi.setSystemTime(Date.now() + WINDOW_MS + 1);

    rateLimiter.prune();

    // Stats for client1 should now show default values as it was pruned
    const stats = rateLimiter.getStats('client1');
    expect(stats.tokens).toBe(MAX_REQUESTS);
  });
});

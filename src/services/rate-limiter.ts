import { config } from '../config.js';
import logger from '../logger.js';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * RateLimiter implements a Token Bucket algorithm to manage per-client rate limits.
 * This approach is superior to Fixed Window as it handles bursts more gracefully
 * and provides a smoother refill rate.
 *
 * Time Complexity: O(1) for both isAllowed and refill operations.
 * Space Complexity: O(C) where C is the number of active clients.
 */
export class RateLimiter {
  private buckets: Map<string, Bucket> = new Map();
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms
  private readonly windowMs: number;

  constructor(maxRequests?: number, windowMs?: number) {
    this.maxTokens = maxRequests ?? config.rateLimitMax;
    this.windowMs = windowMs ?? config.rateLimitWindowMs;
    // Rate at which tokens are added back to the bucket
    this.refillRate = this.maxTokens / this.windowMs;
  }

  /**
   * Checks if a client is allowed to make a request and consumes a token.
   * Uses Token Bucket algorithm to allow for bursts up to maxTokens.
   */
  public isAllowed(clientId: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      // First request: fill bucket, consume one, and store
      bucket = {
        tokens: this.maxTokens - 1,
        lastRefill: now,
      };
      this.buckets.set(clientId, bucket);
      return true;
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = elapsed * this.refillRate;

    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    logger.warn({ clientId, tokens: bucket.tokens }, 'Rate limit exceeded');
    return false;
  }

  /**
   * Cleans up idle buckets to free memory.
   */
  public prune(): void {
    const now = Date.now();
    for (const [clientId, bucket] of this.buckets.entries()) {
      // If a bucket has been idle for more than one full window, it can be safely removed
      if (now - bucket.lastRefill > this.windowMs) {
        this.buckets.delete(clientId);
      }
    }
  }

  /**
   * Gets current stats for a client.
   */
  public getStats(clientId: string) {
    const bucket = this.buckets.get(clientId);
    if (!bucket) return { tokens: this.maxTokens, remaining: this.maxTokens };

    return {
      tokens: Math.floor(bucket.tokens),
      remaining: Math.floor(bucket.tokens),
      lastRefill: new Date(bucket.lastRefill),
    };
  }
}

// Singleton instance for the server
export const rateLimiter = new RateLimiter();

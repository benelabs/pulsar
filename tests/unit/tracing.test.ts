import { describe, it, expect, vi, beforeEach } from 'vitest';

import { requestContext } from '../../src/logger.js';

// Isolate each test
beforeEach(() => {
  vi.clearAllMocks();
});

describe('Request ID Tracing', () => {
  it('should have no store outside of a request context', () => {
    const store = requestContext.getStore();
    expect(store).toBeUndefined();
  });

  it('should expose the requestId within a run() call', () => {
    const requestId = 'test-request-id-abc123';
    requestContext.run({ requestId }, () => {
      const store = requestContext.getStore();
      expect(store).toBeDefined();
      expect(store?.requestId).toBe(requestId);
    });
  });

  it('should isolate requestId between concurrent contexts', async () => {
    const id1 = 'request-id-1';
    const id2 = 'request-id-2';

    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        requestContext.run({ requestId: id1 }, async () => {
          // Simulate async work
          await new Promise((r) => setTimeout(r, 10));
          results.push(requestContext.getStore()!.requestId);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        requestContext.run({ requestId: id2 }, async () => {
          // Simulate async work (resolves first)
          await new Promise((r) => setTimeout(r, 5));
          results.push(requestContext.getStore()!.requestId);
          resolve();
        });
      }),
    ]);

    // Both IDs should be present, each in its own isolated context
    expect(results).toContain(id1);
    expect(results).toContain(id2);
    // Verify isolation: each async branch read its own ID, not the other's
    expect(results).toHaveLength(2);
    expect(results[0]).not.toBe(results[1]);
  });

  it('should return undefined after run() completes', () => {
    const requestId = 'ephemeral-id';
    requestContext.run({ requestId }, () => {
      // Inside the context
      expect(requestContext.getStore()?.requestId).toBe(requestId);
    });
    // Outside the context
    expect(requestContext.getStore()).toBeUndefined();
  });
});

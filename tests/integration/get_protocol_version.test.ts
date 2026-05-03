import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { getProtocolVersion } from "../../src/tools/get_protocol_version.js";

describe("getProtocolVersion Integration Tests", () => {
  // Note: These tests require network connectivity to Stellar's testnet
  // They can be run manually but should be skipped in CI environments
  
  const TEST_TIMEOUT = 30000; // 30 seconds

  it.skip("should retrieve protocol version from testnet", async () => {
    const result = await getProtocolVersion({ network: "testnet" });

    expect(result).toHaveProperty("network", "testnet");
    expect(result).toHaveProperty("protocol_version");
    expect(result).toHaveProperty("horizon_version");
    expect(result).toHaveProperty("supported_features");
    expect(result).toHaveProperty("timestamp");

    expect(typeof result.protocol_version).toBe("number");
    expect(typeof result.horizon_version).toBe("string");
    expect(Array.isArray(result.supported_features)).toBe(true);
    expect(result.supported_features.length).toBeGreaterThan(0);
    expect(typeof result.timestamp).toBe("string");

    // Verify basic features are always included
    expect(result.supported_features).toContain("basic_transactions");
    expect(result.supported_features).toContain("multi_signature");
    expect(result.supported_features).toContain("payment_channels");
  }, TEST_TIMEOUT);

  it.skip("should retrieve protocol version from mainnet", async () => {
    const result = await getProtocolVersion({ network: "mainnet" });

    expect(result).toHaveProperty("network", "mainnet");
    expect(result).toHaveProperty("protocol_version");
    expect(result).toHaveProperty("horizon_version");
    expect(result).toHaveProperty("supported_features");
    expect(result).toHaveProperty("timestamp");

    // Mainnet should have a stable protocol version
    expect(result.protocol_version).toBeGreaterThan(0);
    expect(result.horizon_version).toMatch(/^\d+\.\d+\.\d+$/);
  }, TEST_TIMEOUT);

  it.skip("should handle futurenet network", async () => {
    const result = await getProtocolVersion({ network: "futurenet" });

    expect(result).toHaveProperty("network", "futurenet");
    expect(result).toHaveProperty("protocol_version");
    expect(result).toHaveProperty("horizon_version");
    expect(result).toHaveProperty("supported_features");
    expect(result).toHaveProperty("timestamp");

    // Futurenet might have newer protocol versions
    expect(result.protocol_version).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  it.skip("should use default network when none specified", async () => {
    const result = await getProtocolVersion({});

    expect(result).toHaveProperty("network");
    expect(result).toHaveProperty("protocol_version");
    expect(result).toHaveProperty("horizon_version");
    expect(result).toHaveProperty("supported_features");
    expect(result).toHaveProperty("timestamp");

    // Should default to testnet based on config
    expect(["testnet", "mainnet", "futurenet"]).toContain(result.network);
  }, TEST_TIMEOUT);

  it.skip("should return consistent results for multiple calls", async () => {
    const result1 = await getProtocolVersion({ network: "testnet" });
    const result2 = await getProtocolVersion({ network: "testnet" });

    expect(result1.protocol_version).toBe(result2.protocol_version);
    expect(result1.horizon_version).toBe(result2.horizon_version);
    expect(result1.network).toBe(result2.network);
    expect(result1.supported_features).toEqual(result2.supported_features);
  }, TEST_TIMEOUT);

  it.skip("should handle network errors gracefully", async () => {
    // Test with an invalid network that should fail
    await expect(getProtocolVersion({ network: "invalid-network" }))
      .rejects.toThrow();
  });

  // Performance test
  it.skip("should complete within acceptable time limits", async () => {
    const startTime = Date.now();
    await getProtocolVersion({ network: "testnet" });
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete within 10 seconds
    expect(duration).toBeLessThan(10000);
  }, TEST_TIMEOUT);
});

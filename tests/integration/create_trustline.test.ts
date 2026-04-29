import { describe, it, expect, beforeAll } from "vitest";
import { createTrustline } from "../../src/tools/create_trustline.js";
import {
  describeIfIntegration,
  fundWithFriendbot,
  TEST_ACCOUNT_PUBLIC_KEY,
} from "./setup.js";

/**
 * Integration tests for create_trustline tool.
 *
 * These tests hit the real Stellar Testnet.
 * Set RUN_INTEGRATION_TESTS=true to run them.
 */

describeIfIntegration("create_trustline (Integration)", () => {
  // Test asset configuration for testnet
  const TEST_ASSET_CODE = "TEST";
  const TEST_ASSET_ISSUER = "GBV3Y3CRDBHCBK4KZ7Q5MZ7CJFS7K3LYKX3LKF2Q4LHMVZ7MNTB6UQHP";

  // Ensure test account is funded before tests
  beforeAll(async () => {
    try {
      await fundWithFriendbot(TEST_ACCOUNT_PUBLIC_KEY);
      // Wait a moment for the funding transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("Setup: Account may already be funded or funding failed:", error);
    }
  });

  it("creates a trustline for a valid asset", async () => {
    const result = (await createTrustline({
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      asset_code: TEST_ASSET_CODE,
      asset_issuer: TEST_ASSET_ISSUER,
      network: "testnet",
    })) as any;

    expect(result.transaction_xdr).toBeTruthy();
    expect(result.source_account).toBe(TEST_ACCOUNT_PUBLIC_KEY);
    expect(result.asset.code).toBe(TEST_ASSET_CODE);
    expect(result.asset.issuer).toBe(TEST_ASSET_ISSUER);
    expect(result.network).toBe("testnet");
  });

  it("creates a trustline with a custom limit", async () => {
    const result = (await createTrustline({
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      asset_code: TEST_ASSET_CODE,
      asset_issuer: TEST_ASSET_ISSUER,
      limit: "1000000",
      network: "testnet",
    })) as any;

    expect(result.limit).toBe("1000000");
    expect(result.transaction_xdr).toBeTruthy();
  });

  it("returns a transaction that can be simulated later", async () => {
    const result = (await createTrustline({
      source_account: TEST_ACCOUNT_PUBLIC_KEY,
      asset_code: TEST_ASSET_CODE,
      asset_issuer: TEST_ASSET_ISSUER,
      network: "testnet",
    })) as any;

    // The transaction XDR should be a valid base64 string
    expect(() => {
      Buffer.from(result.transaction_xdr, "base64");
    }).not.toThrow();

    // Verify the XDR length is reasonable (should be > 300 bytes base64-encoded)
    expect(result.transaction_xdr.length).toBeGreaterThan(300);
  });

  it("fails gracefully with an unfunded account", async () => {
    const unfundedAccount = "GCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXCXC77LQ";

    await expect(
      createTrustline({
        source_account: unfundedAccount,
        asset_code: TEST_ASSET_CODE,
        asset_issuer: TEST_ASSET_ISSUER,
        network: "testnet",
      })
    ).rejects.toThrow("not found");
  });
});

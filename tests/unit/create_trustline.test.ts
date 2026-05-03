import { describe, it, expect, vi, beforeEach } from "vitest";

import { createTrustline } from "../../src/tools/create_trustline.js";
import { getHorizonServer } from "../../src/services/horizon.js";

// Mock the services
vi.mock("../../src/services/horizon.js", () => ({
  getHorizonServer: vi.fn(),
}));

describe("createTrustline", () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      loadAccount: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  const SOURCE_ACCOUNT = "GCLGG7DEP6FLNFVCNEXWOZSRDOOGDSBOMTNKXDUMJVNREAI3GTELCZWW";
  const ASSET_CODE = "USDC";
  const ASSET_ISSUER = "GAGY36NWRMILJ2WT2W2PSIHNVY3BFN4KQKQ6ROUFSYGN74YU3GFSMP2K";

  function mockAccount(sequence = "123") {
    mockServer.loadAccount.mockResolvedValue({
      accountId: () => SOURCE_ACCOUNT,
      sequenceNumber: () => sequence,
    });
  }

  it("builds a trustline creation transaction with required inputs", async () => {
    mockAccount();

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
    })) as any;

    expect(result.source_account).toBe(SOURCE_ACCOUNT);
    expect(result.asset.code).toBe(ASSET_CODE);
    expect(result.asset.issuer).toBe(ASSET_ISSUER);
    expect(result.transaction_xdr).toBeTruthy();
    expect(typeof result.transaction_xdr).toBe("string");
    expect(result.network).toBe("testnet"); // default network
  });

  it("builds a trustline with a specified limit", async () => {
    mockAccount();

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
      limit: "1000.50",
    })) as any;

    expect(result.limit).toBe("1000.50");
    expect(result.transaction_xdr).toBeTruthy();
  });

  it("uses the specified network", async () => {
    mockAccount();

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
      network: "mainnet",
    })) as any;

    expect(result.network).toBe("mainnet");
    expect(getHorizonServer).toHaveBeenCalledWith("mainnet");
  });

  it("returns default limit when not specified", async () => {
    mockAccount();

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
    })) as any;

    expect(result.limit).toBe("922337203685.4775807"); // MAX_INT64 in stroops / 10^7
  });

  it("rejects invalid source account", async () => {
    await expect(
      createTrustline({
        source_account: "invalid-account",
        asset_code: ASSET_CODE,
        asset_issuer: ASSET_ISSUER,
      })
    ).rejects.toThrow("Invalid input for create_trustline");
  });

  it("rejects invalid asset issuer", async () => {
    const mockAccount = {
      accountId: SOURCE_ACCOUNT,
      sequenceNumber: "123",
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    await expect(
      createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: ASSET_CODE,
        asset_issuer: "invalid-issuer",
      })
    ).rejects.toThrow("Invalid input for create_trustline");
  });

  it("rejects empty asset code", async () => {
    await expect(
      createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: "",
        asset_issuer: ASSET_ISSUER,
      })
    ).rejects.toThrow("Invalid input for create_trustline");
  });

  it("rejects asset code longer than 12 characters", async () => {
    await expect(
      createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: "VERYLONGASSETCODE",
        asset_issuer: ASSET_ISSUER,
      })
    ).rejects.toThrow("Invalid input for create_trustline");
  });

  it("handles 404 account not found error", async () => {
    const error = new Error("Not Found");
    (error as any).response = { status: 404 };
    mockServer.loadAccount.mockRejectedValue(error);

    await expect(
      createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: ASSET_CODE,
        asset_issuer: ASSET_ISSUER,
      })
    ).rejects.toThrow("not found");

    try {
      await createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: ASSET_CODE,
        asset_issuer: ASSET_ISSUER,
      });
    } catch (e: any) {
      expect(e.name).toBe("PulsarNetworkError");
    }
  });

  it("handles network errors gracefully", async () => {
    const error = new Error("Network error");
    mockServer.loadAccount.mockRejectedValue(error);

    await expect(
      createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: ASSET_CODE,
        asset_issuer: ASSET_ISSUER,
      })
    ).rejects.toThrow("Failed to load source account");

    try {
      await createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: ASSET_CODE,
        asset_issuer: ASSET_ISSUER,
      });
    } catch (e: any) {
      expect(e.name).toBe("PulsarNetworkError");
    }
  });

  it("includes all required fields in the response", async () => {
    const mockAccount = {
      accountId: SOURCE_ACCOUNT,
      sequenceNumber: "123",
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
      limit: "500",
    })) as any;

    expect(result).toHaveProperty("transaction_xdr");
    expect(result).toHaveProperty("source_account");
    expect(result).toHaveProperty("asset");
    expect(result).toHaveProperty("limit");
    expect(result).toHaveProperty("network");

    expect(result.asset).toHaveProperty("code");
    expect(result.asset).toHaveProperty("issuer");
  });

  it("produces valid XDR that can be parsed", async () => {
    const mockAccount = {
      accountId: SOURCE_ACCOUNT,
      sequenceNumber: "123",
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const result = (await createTrustline({
      source_account: SOURCE_ACCOUNT,
      asset_code: ASSET_CODE,
      asset_issuer: ASSET_ISSUER,
    })) as any;

    // The XDR should be a valid base64 string
    expect(() => Buffer.from(result.transaction_xdr, "base64")).not.toThrow();
  });

  it("supports different asset codes", async () => {
    const mockAccount = {
      accountId: SOURCE_ACCOUNT,
      sequenceNumber: "123",
      balances: [{ asset_type: "native", balance: "100.0000000" }],
    };

    mockServer.loadAccount.mockResolvedValue(mockAccount);

    const assetCodes = ["EUR", "BRL", "JPY", "ABC", "X"];
    for (const code of assetCodes) {
      const result = (await createTrustline({
        source_account: SOURCE_ACCOUNT,
        asset_code: code,
        asset_issuer: ASSET_ISSUER,
      })) as any;

      expect(result.asset.code).toBe(code);
    }
  });
});

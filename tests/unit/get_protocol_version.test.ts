import { describe, it, expect, vi, beforeEach } from "vitest";

import { getProtocolVersion } from "../../src/tools/get_protocol_version.js";
import { getHorizonServer } from "../../src/services/horizon.js";

// Mock the services
vi.mock("../../src/services/horizon.js", () => ({
  getHorizonServer: vi.fn(),
}));

describe("getProtocolVersion", () => {
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      ledgers: vi.fn(),
      root: vi.fn(),
    };
    vi.mocked(getHorizonServer).mockReturnValue(mockServer);
  });

  it("returns protocol version information for testnet", async () => {
    const mockLedgerResponse = {
      records: [
        {
          protocol_version: 20,
          id: "12345",
          closed_at: "2024-01-01T00:00:00Z",
        },
      ],
    };

    const mockRootResponse = {
      horizon_version: "4.0.0",
      core_version: "stellar-core 20.0.0",
      network_passphrase: "Test SDF Network ; September 2015",
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockResolvedValue(mockLedgerResponse),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);
    mockServer.root.mockResolvedValue(mockRootResponse);

    const result = (await getProtocolVersion({ network: "testnet" })) as any;

    expect(result.network).toBe("testnet");
    expect(result.protocol_version).toBe(20);
    expect(result.horizon_version).toBe("4.0.0");
    expect(result.core_version).toBe("stellar-core 20.0.0");
    expect(result.supported_features).toContain("basic_transactions");
    expect(result.supported_features).toContain("soroban_smart_contracts");
    expect(result.supported_features).toContain("stellar_asset_contract");
    expect(result.timestamp).toBeDefined();
  });

  it("returns appropriate features for protocol version 11", async () => {
    const mockLedgerResponse = {
      records: [
        {
          protocol_version: 11,
          id: "12345",
        },
      ],
    };

    const mockRootResponse = {
      horizon_version: "3.12.0",
      core_version: "stellar-core 11.0.0",
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockResolvedValue(mockLedgerResponse),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);
    mockServer.root.mockResolvedValue(mockRootResponse);

    const result = (await getProtocolVersion({})) as any;

    expect(result.protocol_version).toBe(11);
    expect(result.supported_features).toContain("basic_transactions");
    expect(result.supported_features).toContain("soroban_smart_contracts");
    expect(result.supported_features).toContain("fee_bumps");
    expect(result.supported_features).not.toContain("liquidity_pools");
  });

  it("returns appropriate features for protocol version 12", async () => {
    const mockLedgerResponse = {
      records: [
        {
          protocol_version: 12,
          id: "12345",
        },
      ],
    };

    const mockRootResponse = {
      horizon_version: "3.13.0",
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockResolvedValue(mockLedgerResponse),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);
    mockServer.root.mockResolvedValue(mockRootResponse);

    const result = (await getProtocolVersion({ network: "mainnet" })) as any;

    expect(result.protocol_version).toBe(12);
    expect(result.supported_features).toContain("liquidity_pools");
    expect(result.supported_features).toContain("claimable_balances");
  });

  it("handles missing core version gracefully", async () => {
    const mockLedgerResponse = {
      records: [
        {
          protocol_version: 15,
          id: "12345",
        },
      ],
    };

    const mockRootResponse = {
      horizon_version: "3.15.0",
      // core_version is missing
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockResolvedValue(mockLedgerResponse),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);
    mockServer.root.mockResolvedValue(mockRootResponse);

    const result = (await getProtocolVersion({})) as any;

    expect(result.protocol_version).toBe(15);
    expect(result.horizon_version).toBe("3.15.0");
    expect(result.core_version).toBeUndefined();
  });

  it("handles empty ledger records", async () => {
    const mockLedgerResponse = {
      records: [],
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockResolvedValue(mockLedgerResponse),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);

    await expect(getProtocolVersion({}))
      .rejects.toThrow("Unable to retrieve latest ledger information");
  });

  it("handles network connection errors", async () => {
    const connectionError = new Error("ECONNREFUSED");
    (connectionError as any).code = "ECONNREFUSED";

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockRejectedValue(connectionError),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);

    await expect(getProtocolVersion({ network: "mainnet" }))
      .rejects.toThrow("Unable to connect to Horizon server for network: mainnet");
  });

  it("handles API rate limiting", async () => {
    const rateLimitError = new Error("Too Many Requests");
    (rateLimitError as any).response = { status: 429 };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockRejectedValue(rateLimitError),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);

    await expect(getProtocolVersion({}))
      .rejects.toThrow("Horizon API rate limit exceeded");
  });

  it("handles HTTP errors with status", async () => {
    const httpError = new Error("Gateway Timeout");
    (httpError as any).response = { 
      status: 504, 
      statusText: "Gateway Timeout" 
    };

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockRejectedValue(httpError),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);

    await expect(getProtocolVersion({}))
      .rejects.toThrow("Horizon API error: Gateway Timeout");
  });

  it("handles timeout errors", async () => {
    const timeoutError = new Error("ETIMEDOUT");
    (timeoutError as any).code = "ETIMEDOUT";

    const mockLedgersCall = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      call: vi.fn().mockRejectedValue(timeoutError),
    };

    mockServer.ledgers.mockReturnValue(mockLedgersCall);

    await expect(getProtocolVersion({}))
      .rejects.toThrow("Unable to connect to Horizon server");
  });

  it("validates input schema", async () => {
    // Test with invalid network
    await expect(getProtocolVersion({ network: "invalid" }))
      .rejects.toThrow("Invalid input for get_protocol_version");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

import { getContractStorage } from "../../src/tools/get_contract_storage.js";
import { getSorobanServer } from "../../src/services/soroban-rpc.js";

vi.mock("../../src/services/soroban-rpc.js", () => ({
  getSorobanServer: vi.fn(),
}));

describe("getContractStorage", () => {
  const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  let mockServer: { getLedgerEntries: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      getLedgerEntries: vi.fn(),
    };
    vi.mocked(getSorobanServer).mockReturnValue(mockServer as any);
  });

  it("returns persistent storage entry metadata", async () => {
    mockServer.getLedgerEntries.mockResolvedValue({
      entries: [
        {
          key: "AAAAAgAAAA...",
          xdr: "AAAABgAAAAEA...",
          lastModifiedLedgerSeq: 123,
          liveUntilLedgerSeq: 456,
        },
      ],
    });

    const result = await getContractStorage({
      contract_id: CONTRACT_ID,
      storage_type: "persistent",
      key: { type: "symbol", value: "Balance" },
    });

    expect(mockServer.getLedgerEntries).toHaveBeenCalledTimes(1);
    const [keys] = mockServer.getLedgerEntries.mock.calls[0];
    expect(Array.isArray(keys)).toBe(true);
    expect(typeof keys[0]).toBe("string");

    expect(result.storage_type).toBe("persistent");
    expect(result.entries).toEqual([
      {
        key_xdr: "AAAAAgAAAA...",
        entry_xdr: "AAAABgAAAAEA...",
        last_modified_ledger: 123,
        live_until_ledger: 456,
      },
    ]);
  });

  it("returns instance storage entry metadata", async () => {
    mockServer.getLedgerEntries.mockResolvedValue({
      entries: [
        {
          key: "AAAAAgAAAA...",
          xdr: "AAAABgAAAAEA...",
        },
      ],
    });

    const result = await getContractStorage({
      contract_id: CONTRACT_ID,
      storage_type: "instance",
    });

    expect(result.storage_type).toBe("instance");
    expect(result.key).toBeNull();
    expect(result.entries[0].entry_xdr).toBe("AAAABgAAAAEA...");
  });

  it("throws when no entries are found", async () => {
    mockServer.getLedgerEntries.mockResolvedValue({ entries: [] });

    await expect(
      getContractStorage({
        contract_id: CONTRACT_ID,
        storage_type: "persistent",
        key: { value: "Missing" },
      })
    ).rejects.toThrow("Contract storage entry not found");
  });
});

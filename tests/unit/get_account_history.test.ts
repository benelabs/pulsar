import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAccountHistory } from "../../src/tools/get_account_history.js";
import * as horizonModule from "../../src/services/horizon.js";


// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ACCOUNT = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const mockTx = (overrides = {}) => ({
  id: "tx_001",
  hash: "abc123def456",
  ledger: 48_000_000,
  created_at: "2026-04-01T12:00:00Z",
  source_account: VALID_ACCOUNT,
  fee_charged: "100",
  operation_count: 1,
  memo_type: "none",
  memo: undefined,
  successful: true,
  paging_token: "token_001",
  ...overrides,
});

function makeHorizonMock(records: ReturnType<typeof mockTx>[]) {
  const callMock = vi.fn().mockResolvedValue({ records });
  const cursorMock = vi.fn().mockReturnThis();
  const orderMock = vi.fn().mockReturnThis();
  const limitMock = vi.fn().mockReturnThis();
  const forAccountMock = vi.fn().mockReturnValue({
    limit: limitMock,
    order: orderMock,
    cursor: cursorMock,
    call: callMock,
  });

  return {
    loadAccount: vi.fn().mockResolvedValue({}),
    transactions: vi.fn().mockReturnValue({ forAccount: forAccountMock }),
    _mocks: { forAccountMock, limitMock, orderMock, cursorMock, callMock },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getAccountHistory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns structured history for a valid account", async () => {
    const horizonMock = makeHorizonMock([mockTx()]);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    const result = await getAccountHistory({
      account_id: VALID_ACCOUNT,
    });

    expect(result).toMatchObject({
      account_id: VALID_ACCOUNT,
      transaction_count: 1,
    });
    const txs = (result as any).transactions as any[];
    expect(txs).toHaveLength(1);
    expect(txs[0].hash).toBe("abc123def456");
    expect(txs[0].successful).toBe(true);
  });

  it("respects the limit parameter", async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      mockTx({ id: `tx_00${i}`, paging_token: `token_00${i}` })
    );
    const horizonMock = makeHorizonMock(records);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    const result = await getAccountHistory({
      account_id: VALID_ACCOUNT,
      limit: 5,
    });

    expect((result as any).transaction_count).toBe(5);
    expect(horizonMock._mocks.limitMock).toHaveBeenCalledWith(5);
  });

  it("passes cursor to Horizon when provided", async () => {
    const horizonMock = makeHorizonMock([mockTx()]);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    await getAccountHistory({
      account_id: VALID_ACCOUNT,
      cursor: "token_042",
    });

    expect(horizonMock._mocks.cursorMock).toHaveBeenCalledWith("token_042");
  });

  it("includes next cursor when a full page is returned", async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      mockTx({ id: `tx_${i}`, paging_token: `page_token_${i}` })
    );
    const horizonMock = makeHorizonMock(records);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    const result = await getAccountHistory({ account_id: VALID_ACCOUNT });

    expect((result as any).cursor).toBe("page_token_9");
  });

  it("omits cursor when fewer records than limit are returned", async () => {
    const horizonMock = makeHorizonMock([mockTx()]);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    const result = await getAccountHistory({ account_id: VALID_ACCOUNT });

    expect((result as any).cursor).toBeUndefined();
  });

  it("handles asc order correctly", async () => {
    const horizonMock = makeHorizonMock([mockTx()]);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    await getAccountHistory({ account_id: VALID_ACCOUNT, order: "asc" });

    expect(horizonMock._mocks.orderMock).toHaveBeenCalledWith("asc");
  });

  it("throws PulsarNetworkError when account is not found (404)", async () => {
    const horizonMock = {
      loadAccount: vi.fn().mockRejectedValue({ response: { status: 404 } }),
      transactions: vi.fn(),
    };
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    await expect(
      getAccountHistory({ account_id: VALID_ACCOUNT })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("throws PulsarValidationError on invalid account_id", async () => {
    await expect(
      getAccountHistory({ account_id: "NOT_A_VALID_KEY" } as any)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("throws PulsarNetworkError on generic Horizon failure", async () => {
    const horizonMock = {
      loadAccount: vi.fn().mockResolvedValue({}),
      transactions: vi.fn().mockReturnValue({
        forAccount: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          cursor: vi.fn().mockReturnThis(),
          call: vi.fn().mockRejectedValue(new Error("Network timeout")),
        }),
      }),
    };
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    await expect(
      getAccountHistory({ account_id: VALID_ACCOUNT })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("returns empty transactions array when account has no history", async () => {
    const horizonMock = makeHorizonMock([]);
    vi.spyOn(horizonModule, "getHorizonServer").mockReturnValue(horizonMock as any);

    const result = await getAccountHistory({ account_id: VALID_ACCOUNT });

    expect((result as any).transaction_count).toBe(0);
    expect((result as any).transactions).toHaveLength(0);
    expect((result as any).cursor).toBeUndefined();
  });
});

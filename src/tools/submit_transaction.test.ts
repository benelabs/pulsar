import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We mock the config module so we can control stellarSecretKey per test.
// ---------------------------------------------------------------------------
vi.mock("../config.js", () => ({
  config: {
    stellarNetwork: "testnet",
    horizonUrl: undefined,
    sorobanRpcUrl: undefined,
    stellarSecretKey: undefined, // overridden per test
    stellarCliPath: "stellar",
    logLevel: "info",
  },
}));

// ---------------------------------------------------------------------------
// Mock @stellar/stellar-sdk
// ---------------------------------------------------------------------------
const mockSign = vi.fn();
const mockSubmitTransaction = vi.fn();
const mockGetTransaction = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const Networks = {
    PUBLIC: "Public Global Stellar Network ; September 2015",
    TESTNET: "Test SDF Network ; September 2015",
    FUTURENET: "Test SDF Future Network ; October 2022",
  };

  class FakeTx {
    sign = mockSign;
  }

  const TransactionBuilder = {
    fromXDR: vi.fn(() => new FakeTx()),
  };

  const Keypair = {
    fromSecret: vi.fn(() => ({ publicKey: () => "GPUBKEY" })),
  };

  const Horizon = {
    Server: vi.fn(() => ({
      submitTransaction: mockSubmitTransaction,
    })),
    HorizonApi: {},
  };

  const GetTransactionStatus = {
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    NOT_FOUND: "NOT_FOUND",
  };

  const rpc = {
    Server: vi.fn(() => ({
      getTransaction: mockGetTransaction,
    })),
    Api: { GetTransactionStatus },
  };

  return { Networks, TransactionBuilder, Keypair, Horizon, rpc, FeeBumpTransaction: class {} };
});

// ---------------------------------------------------------------------------
// Import AFTER mocks are set up
// ---------------------------------------------------------------------------
import { submitTransaction } from "./submit_transaction.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const FAKE_XDR = "AAAAAgAAAABvalidXDRbase64==";
const FAKE_HASH = "abc123deadbeef";

describe("submitTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // sign: true without a configured key → clean error, no crash
  // -------------------------------------------------------------------------
  it("returns a clean error when sign:true but no secret key is configured", async () => {
    (config as Record<string, unknown>).stellarSecretKey = undefined;

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: true,
      wait_for_result: false,
    });

    expect(result).toMatchObject({
      error: {
        code: 400,
        message: expect.stringContaining("STELLAR_SECRET_KEY is not configured"),
      },
    });
    // Horizon submit must NOT have been called
    expect(mockSubmitTransaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Successful submission without waiting
  // -------------------------------------------------------------------------
  it("returns hash and ledger on successful submission (wait_for_result: false)", async () => {
    (config as Record<string, unknown>).stellarSecretKey = undefined;

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: FAKE_HASH,
      ledger: 12345,
      fee_charged: "100",
      envelope_xdr: FAKE_XDR,
      result_xdr: "resultXDR==",
      result_meta_xdr: "metaXDR==",
    });

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: false,
      wait_for_result: false,
    });

    expect(result).toMatchObject({
      hash: FAKE_HASH,
      ledger: 12345,
      status: "SUBMITTED",
    });
  });

  // -------------------------------------------------------------------------
  // Successful submission WITH wait_for_result → polls to SUCCESS
  // -------------------------------------------------------------------------
  it("polls and returns SUCCESS status when wait_for_result: true", async () => {
    (config as Record<string, unknown>).stellarSecretKey = undefined;

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: FAKE_HASH,
      ledger: null,
      envelope_xdr: FAKE_XDR,
      result_xdr: null,
      result_meta_xdr: null,
    });

    // First poll: NOT_FOUND, second poll: SUCCESS
    mockGetTransaction
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({
        status: "SUCCESS",
        ledger: 12346,
        feeCharged: "200",
        returnValue: { toXDR: () => "returnValueXDR==" },
        resultMetaXdr: { toXDR: () => "metaXDR==" },
      });

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: false,
      wait_for_result: true,
      wait_timeout_ms: 10_000,
    });

    expect(result).toMatchObject({
      hash: FAKE_HASH,
      status: "SUCCESS",
      ledger: 12346,
      return_value: "returnValueXDR==",
    });
  });

  // -------------------------------------------------------------------------
  // Failed submission (Horizon throws)
  // -------------------------------------------------------------------------
  it("returns structured error when Horizon rejects the transaction", async () => {
    (config as Record<string, unknown>).stellarSecretKey = undefined;

    mockSubmitTransaction.mockRejectedValueOnce({
      response: {
        data: {
          title: "Transaction Failed",
          detail: "tx_bad_seq",
          extras: { result_codes: { transaction: "tx_bad_seq" } },
        },
      },
    });

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: false,
      wait_for_result: false,
    });

    expect(result).toMatchObject({
      error: {
        code: 400,
        message: "Transaction Failed",
        data: {
          detail: "tx_bad_seq",
          extras: { result_codes: { transaction: "tx_bad_seq" } },
        },
      },
    });
  });

  // -------------------------------------------------------------------------
  // wait_for_result times out gracefully
  // -------------------------------------------------------------------------
  it("returns TIMEOUT status when polling exceeds wait_timeout_ms", async () => {
    (config as Record<string, unknown>).stellarSecretKey = undefined;

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: FAKE_HASH,
      ledger: null,
      envelope_xdr: FAKE_XDR,
      result_xdr: null,
      result_meta_xdr: null,
    });

    // Always return NOT_FOUND so we exhaust the timeout
    mockGetTransaction.mockResolvedValue({ status: "NOT_FOUND" });

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: false,
      wait_for_result: true,
      wait_timeout_ms: 1_000, // very short for the test
    });

    expect(result).toMatchObject({
      hash: FAKE_HASH,
      status: "TIMEOUT",
      message: expect.stringContaining(FAKE_HASH),
    });
  }, 10_000);

  // -------------------------------------------------------------------------
  // sign: true with key configured → signs before submitting
  // -------------------------------------------------------------------------
  it("signs the transaction when sign:true and secret key is configured", async () => {
    (config as Record<string, unknown>).stellarSecretKey =
      "SCZANGBA5AKIA7OQKFLAEN5RNHOFP5XPFBMFKNDLN7QIJXJYXHSTNPV";

    mockSubmitTransaction.mockResolvedValueOnce({
      hash: FAKE_HASH,
      ledger: 99,
      envelope_xdr: FAKE_XDR,
      result_xdr: null,
      result_meta_xdr: null,
    });

    const result = await submitTransaction({
      xdr: FAKE_XDR,
      sign: true,
      wait_for_result: false,
    });

    expect(mockSign).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ hash: FAKE_HASH, status: "SUBMITTED" });
  });
});

/**
 * Unit tests for per-tool input schemas.
 * 100% coverage of all tool-specific validators.
 */

import { describe, it, expect } from "vitest";
import {
  GetAccountBalanceInputSchema,
  SubmitTransactionInputSchema,
  ContractReadInputSchema,
} from "./tools.js";

// ============================================================================
// GetAccountBalanceInputSchema
// ============================================================================

describe("GetAccountBalanceInputSchema", () => {
  it("accepts valid account_id alone", () => {
    const input = {
      account_id: "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid account_id with network override", () => {
    const input = {
      account_id: "GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ",
      network: "testnet",
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBe("testnet");
    }
  });

  it("accepts all valid networks", () => {
    const networks = ["mainnet", "testnet", "futurenet", "custom"];
    networks.forEach((network) => {
      const input = {
        account_id: "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
        network,
      };
      const result = GetAccountBalanceInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  it("rejects missing account_id", () => {
    const input = { network: "testnet" };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid account_id", () => {
    const input = {
      account_id: "INVALID_KEY",
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid network", () => {
    const input = {
      account_id: "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7",
      network: "unknown",
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("makes network optional", () => {
    const input = {
      account_id: "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7",
    };
    const result = GetAccountBalanceInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBeUndefined();
    }
  });
});

// ============================================================================
// SubmitTransactionInputSchema
// ============================================================================

describe("SubmitTransactionInputSchema", () => {
  const validXdr = "AAAAAgAAAABvalidXDRbase64==";
  const validPubKey =
    "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234";

  it("accepts minimal input with just XDR", () => {
    const input = { xdr: validXdr };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.xdr).toBe(validXdr);
      expect(result.data.sign).toBe(false); // default
      expect(result.data.wait_for_result).toBe(false); // default
      expect(result.data.wait_timeout_ms).toBe(30_000); // default
    }
  });

  it("accepts valid XDR with all optional fields", () => {
    const input = {
      xdr: validXdr,
      network: "testnet",
      sign: true,
      wait_for_result: true,
      wait_timeout_ms: 60_000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.network).toBe("testnet");
      expect(result.data.sign).toBe(true);
      expect(result.data.wait_for_result).toBe(true);
      expect(result.data.wait_timeout_ms).toBe(60_000);
    }
  });

  it("rejects missing XDR", () => {
    const input = { network: "testnet" };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid XDR", () => {
    const input = { xdr: "!!!invalid base64!!!" };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty XDR", () => {
    const input = { xdr: "" };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects wait_timeout_ms less than 1000 ms", () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 999,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("1000");
    }
  });

  it("rejects wait_timeout_ms greater than 120000 ms", () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 120_001,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("120000");
    }
  });

  it("accepts wait_timeout_ms at lower bound (1000)", () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 1000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_timeout_ms).toBe(1000);
    }
  });

  it("accepts wait_timeout_ms at upper bound (120000)", () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 120_000,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_timeout_ms).toBe(120_000);
    }
  });

  it("rejects non-integer wait_timeout_ms", () => {
    const input = {
      xdr: validXdr,
      wait_timeout_ms: 30.5,
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid network", () => {
    const input = {
      xdr: validXdr,
      network: "unknown",
    };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("handles sign as boolean", () => {
    const input = { xdr: validXdr, sign: false };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sign).toBe(false);
    }
  });

  it("rejects sign as non-boolean", () => {
    const input = { xdr: validXdr, sign: "yes" };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("handles wait_for_result as boolean", () => {
    const input = { xdr: validXdr, wait_for_result: true };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.wait_for_result).toBe(true);
    }
  });

  it("rejects wait_for_result as non-boolean", () => {
    const input = { xdr: validXdr, wait_for_result: "definitely" };
    const result = SubmitTransactionInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ContractReadInputSchema
// ============================================================================

describe("ContractReadInputSchema", () => {
  const validContractId =
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  it("accepts valid contract_id and method", () => {
    const input = {
      contract_id: validContractId,
      method: "get_value",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid contract_id, method, and args", () => {
    const input = {
      contract_id: validContractId,
      method: "transfer",
      args: {
        to: "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
        amount: "1000",
      },
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toEqual({
        to: expect.any(String),
        amount: "1000",
      });
    }
  });

  it("rejects missing contract_id", () => {
    const input = { method: "get_value" };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid contract_id", () => {
    const input = {
      contract_id: "INVALID_CONTRACT",
      method: "get_value",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing method", () => {
    const input = { contract_id: validContractId };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty method", () => {
    const input = {
      contract_id: validContractId,
      method: "",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("empty");
    }
  });

  it("rejects method with invalid characters (hyphens)", () => {
    const input = {
      contract_id: validContractId,
      method: "get-value",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("identifier");
    }
  });

  it("rejects method starting with number", () => {
    const input = {
      contract_id: validContractId,
      method: "123method",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts valid method names with underscores", () => {
    const input = {
      contract_id: validContractId,
      method: "get_current_value",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts valid method names starting with underscore", () => {
    const input = {
      contract_id: validContractId,
      method: "_internal_method",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("makes args optional", () => {
    const input = {
      contract_id: validContractId,
      method: "get_value",
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args).toBeUndefined();
    }
  });

  it("accepts empty args object", () => {
    const input = {
      contract_id: validContractId,
      method: "get_value",
      args: {},
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts args with various value types", () => {
    const input = {
      contract_id: validContractId,
      method: "complex_method",
      args: {
        string_arg: "value",
        number_arg: 42,
        boolean_arg: true,
        null_arg: null,
        array_arg: [1, 2, 3],
        object_arg: { nested: "value" },
      },
    };
    const result = ContractReadInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

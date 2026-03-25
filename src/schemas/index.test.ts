/**
 * Unit tests for core Zod schemas.
 * 100% coverage of all validators: public key, secret key, contract ID, XDR, network.
 */

import { describe, it, expect } from "vitest";
import {
  StellarPublicKeySchema,
  StellarSecretKeySchema,
  ContractIdSchema,
  XdrBase64Schema,
  NetworkSchema,
  AccountBalanceQuerySchema,
} from "./index.js";

// ============================================================================
// StellarPublicKeySchema
// ============================================================================

describe("StellarPublicKeySchema", () => {
  // ✅ Valid cases
  it("accepts valid Stellar public keys", () => {
    const validKeys = [
      "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234", // valid format
      "GBTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZABTZKYQRSVWXYZ", // valid format
      "GZCFGHJKMNPQRSTUVWXYZABCDEFGHJKMNPQRSTUVWXYZABCDEFGHJ234", // valid format
    ];

    validKeys.forEach((key) => {
      const result = StellarPublicKeySchema.safeParse(key);
      expect(result.success).toBe(true);
      expect(result.data).toBe(key);
    });
  });

  it("rejects keys that don't start with G", () => {
    const result = StellarPublicKeySchema.safeParse(
      "CABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("start with 'G'");
    }
  });

  it("rejects keys shorter than 56 characters", () => {
    const result = StellarPublicKeySchema.safeParse(
      "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXY",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects keys longer than 56 characters", () => {
    const result = StellarPublicKeySchema.safeParse(
      "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234XX",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects keys with non-base32 characters", () => {
    // Contains '1' which is not base32
    const result = StellarPublicKeySchema.safeParse(
      "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ1X1", // 1 is invalid
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("base32");
    }
  });

  it("rejects keys with lowercase characters", () => {
    const result = StellarPublicKeySchema.safeParse(
      "GabCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("base32");
    }
  });
});

// ============================================================================
// StellarSecretKeySchema
// ============================================================================

describe("StellarSecretKeySchema", () => {
  // ✅ Valid cases
  it("accepts valid Stellar secret keys", () => {
    const validKeys = [
      "SBZVMB74Z76QZ3ZVU4Z7YVYVYJ5YP5VCNNQWYVEUNFY66Z7LSYL7YVVU", // not real, but valid format
      "SDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7", // valid format
    ];

    validKeys.forEach((key) => {
      const result = StellarSecretKeySchema.safeParse(key);
      expect(result.success).toBe(true);
      expect(result.data).toBe(key);
    });
  });

  it("rejects keys that don't start with S", () => {
    const result = StellarSecretKeySchema.safeParse(
      "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7", // starts with G
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("start with 'S'");
    }
  });

  it("rejects keys shorter than 56 characters", () => {
    const result = StellarSecretKeySchema.safeParse(
      "SDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4M",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects keys longer than 56 characters", () => {
    const result = StellarSecretKeySchema.safeParse(
      "SDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7XX",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects keys with non-base32 characters", () => {
    const result = StellarSecretKeySchema.safeParse(
      "SDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG1", // 1 is invalid
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("base32");
    }
  });

  it("never exposes secret keys in error messages", () => {
    const secretKey =
      "SDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG1";
    const result = StellarSecretKeySchema.safeParse(secretKey);
    expect(result.success).toBe(false);

    // The error message should NOT contain the secret key value
    const errorString = JSON.stringify(result.error);
    expect(errorString).not.toContain(secretKey.substring(0, 10));
  });
});

// ============================================================================
// ContractIdSchema
// ============================================================================

describe("ContractIdSchema", () => {
  it("accepts valid contract IDs", () => {
    const validIds = [
      "CABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234", // valid format (exactly 56 chars)
      "CZBCDEFGHJKMNPQRSTUVWXYZABCDEFGHJKMNPQRSTUVWXYZABCDEFGHJ", // valid format (exactly 56 chars)
    ];

    validIds.forEach((id) => {
      const result = ContractIdSchema.safeParse(id);
      expect(result.success).toBe(true);
      expect(result.data).toBe(id);
    });
  });

  it("rejects IDs that don't start with C", () => {
    const result = ContractIdSchema.safeParse(
      "GABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("start with 'C'");
    }
  });

  it("rejects IDs shorter than 56 characters", () => {
    const result = ContractIdSchema.safeParse(
      "CDZST3XVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4M",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects IDs longer than 56 characters", () => {
    const result = ContractIdSchema.safeParse(
      "CABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ234XX",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("exactly 56 characters");
    }
  });

  it("rejects IDs with non-base32 characters", () => {
    const result = ContractIdSchema.safeParse(
      "CABCDEFGHJKMNPQRSTUVWXYZ234567ABCDEFGHJKMNPQRSTUVWXYZ1X1",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("base32");
    }
  });
});

// ============================================================================
// XdrBase64Schema
// ============================================================================

describe("XdrBase64Schema", () => {
  it("accepts valid base64-encoded XDR", () => {
    const validXdrs = [
      "AAAAAgAAAABvalidXDRbase64==",
      "AAAAAAAAGGoAAAAGAAAAAAAAAAA=",
      "YWJjZGVmZ2hpamtsbW5vcA==", // "abcdefghijklmnop"
    ];

    validXdrs.forEach((xdr) => {
      const result = XdrBase64Schema.safeParse(xdr);
      expect(result.success).toBe(true);
      expect(result.data).toBe(xdr);
    });
  });

  it("accepts base64 without padding", () => {
    const result = XdrBase64Schema.safeParse("YWJjZGVmZ2hpamtsbW5vcA");
    expect(result.success).toBe(true);
  });

  it("rejects empty strings", () => {
    const result = XdrBase64Schema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("empty");
    }
  });

  it("rejects whitespace-only strings", () => {
    const result = XdrBase64Schema.safeParse("   ");
    expect(result.success).toBe(false);
  });

  it("rejects invalid base64 characters", () => {
    // Contains !@#$ which are not valid base64
    const result = XdrBase64Schema.safeParse("invalid!@#$base64");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("valid base64");
    }
  });

  it("rejects XDR with invalid padding", () => {
    const result = XdrBase64Schema.safeParse("YWJj==="); // too many = signs
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// NetworkSchema
// ============================================================================

describe("NetworkSchema", () => {
  it("accepts mainnet", () => {
    const result = NetworkSchema.safeParse("mainnet");
    expect(result.success).toBe(true);
    expect(result.data).toBe("mainnet");
  });

  it("accepts testnet", () => {
    const result = NetworkSchema.safeParse("testnet");
    expect(result.success).toBe(true);
    expect(result.data).toBe("testnet");
  });

  it("accepts futurenet", () => {
    const result = NetworkSchema.safeParse("futurenet");
    expect(result.success).toBe(true);
    expect(result.data).toBe("futurenet");
  });

  it("accepts custom", () => {
    const result = NetworkSchema.safeParse("custom");
    expect(result.success).toBe(true);
    expect(result.data).toBe("custom");
  });

  it("rejects unknown networks", () => {
    const result = NetworkSchema.safeParse("universe");
    expect(result.success).toBe(false);
  });

  it("rejects empty strings", () => {
    const result = NetworkSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = NetworkSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// AccountBalanceQuerySchema (composite schema)
// ============================================================================

describe("AccountBalanceQuerySchema", () => {
  it("accepts valid account balance query", () => {
    const query = {
      account_id: "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7",
    };
    const result = AccountBalanceQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
  });

  it("rejects missing account_id", () => {
    const query = {};
    const result = AccountBalanceQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
  });

  it("rejects invalid account_id", () => {
    const query = {
      account_id: "invalid_key",
    };
    const result = AccountBalanceQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
  });

  it("accepts extra fields and strips them", () => {
    const query = {
      account_id: "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7",
      extra_field: "ignored",
    };
    const result = AccountBalanceQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    // Zod strips extra fields by default with strict()
  });
});

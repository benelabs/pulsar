import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FetchContractSpecInput } from "../../src/tools/fetch_contract_spec.js";

// ---------------------------------------------------------------------------
// SAC (Stellar Asset Contract) fixture — mirrors the real CLI JSON output
// for a token contract with transfer, balance, allowance, approve, etc.
// ---------------------------------------------------------------------------
const SAC_FIXTURE = [
  {
    type: "function",
    name: "transfer",
    doc: "Transfer tokens from one account to another.",
    inputs: [
      { name: "from", type: "Address" },
      { name: "to", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
    xdr: "AAAAAgAAAA...",
  },
  {
    type: "function",
    name: "balance",
    inputs: [{ name: "id", type: "Address" }],
    outputs: [{ type: "i128" }],
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "from", type: "Address" },
      { name: "spender", type: "Address" },
    ],
    outputs: [{ type: "i128" }],
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "from", type: "Address" },
      { name: "spender", type: "Address" },
      { name: "amount", type: "i128" },
      { name: "expiration_ledger", type: "u32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "transfer",
    topics: [{ type: "Symbol" }, { type: "Address" }, { type: "Address" }],
    data: { type: "i128" },
  },
];

// Mock the stellar-cli service before importing the tool
vi.mock("../../src/services/stellar-cli.js", () => ({
  runStellarCli: vi.fn(),
}));

vi.mock("../../src/services/soroban-rpc.js", () => ({
  getRpcUrl: vi.fn(() => "https://soroban-testnet.stellar.org"),
}));

import { runStellarCli } from "../../src/services/stellar-cli.js";
import { fetchContractSpec } from "../../src/tools/fetch_contract_spec.js";

const USDC_TESTNET = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

describe("fetchContractSpec", () => {
  beforeEach(() => {
    vi.mocked(runStellarCli).mockResolvedValue({
      stdout: JSON.stringify(SAC_FIXTURE),
      stderr: "",
    });
  });

  it("returns a valid spec with contract_id and network", async () => {
    const input: FetchContractSpecInput = { contract_id: USDC_TESTNET };
    const result = await fetchContractSpec(input);

    expect(result.contract_id).toBe(USDC_TESTNET);
    expect(result.network).toBe("testnet");
  });

  it("includes at least transfer and balance functions", async () => {
    const result = await fetchContractSpec({ contract_id: USDC_TESTNET });
    const names = result.functions.map((f) => f.name);

    expect(names).toContain("transfer");
    expect(names).toContain("balance");
  });

  it("parses transfer function inputs correctly", async () => {
    const result = await fetchContractSpec({ contract_id: USDC_TESTNET });
    const transfer = result.functions.find((f) => f.name === "transfer")!;

    expect(transfer.inputs).toEqual([
      { name: "from", type: "Address" },
      { name: "to", type: "Address" },
      { name: "amount", type: "i128" },
    ]);
    expect(transfer.doc).toBe("Transfer tokens from one account to another.");
  });

  it("parses balance function output type", async () => {
    const result = await fetchContractSpec({ contract_id: USDC_TESTNET });
    const balance = result.functions.find((f) => f.name === "balance")!;

    expect(balance.outputs).toEqual([{ type: "i128" }]);
  });

  it("parses emitted events", async () => {
    const result = await fetchContractSpec({ contract_id: USDC_TESTNET });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe("transfer");
    expect(result.events[0].topics).toEqual([
      { type: "Symbol" },
      { type: "Address" },
      { type: "Address" },
    ]);
    expect(result.events[0].data).toEqual({ type: "i128" });
  });

  it("passes contract_id and rpc-url as separate array args (no interpolation)", async () => {
    await fetchContractSpec({ contract_id: USDC_TESTNET });

    const [args] = vi.mocked(runStellarCli).mock.calls[0];
    const contractIdIdx = args.indexOf("--contract-id");
    const rpcUrlIdx = args.indexOf("--rpc-url");

    // Each flag must be followed by its value as a separate element
    expect(args[contractIdIdx + 1]).toBe(USDC_TESTNET);
    expect(args[rpcUrlIdx + 1]).toBe("https://soroban-testnet.stellar.org");
    // No element should contain both a flag and a value concatenated
    expect(args.every((a) => !a.includes("--contract-id="))).toBe(true);
  });

  it("respects network override", async () => {
    const { getRpcUrl } = await import("../../src/services/soroban-rpc.js");
    vi.mocked(getRpcUrl).mockReturnValueOnce("https://soroban-rpc.stellar.org");

    const result = await fetchContractSpec({ contract_id: USDC_TESTNET, network: "mainnet" });
    expect(result.network).toBe("mainnet");

    const lastCall = vi.mocked(runStellarCli).mock.calls.at(-1)!;
    expect(lastCall[0]).toContain("https://soroban-rpc.stellar.org");
  });

  it("throws a clear error when CLI output is not valid JSON", async () => {
    vi.mocked(runStellarCli).mockResolvedValueOnce({ stdout: "not json", stderr: "" });

    await expect(fetchContractSpec({ contract_id: USDC_TESTNET })).rejects.toThrow(
      /Failed to parse stellar CLI output as JSON/
    );
  });

  it("propagates CLI errors", async () => {
    vi.mocked(runStellarCli).mockRejectedValueOnce(new Error("stellar CLI error: contract not found"));

    await expect(fetchContractSpec({ contract_id: USDC_TESTNET })).rejects.toThrow(
      "stellar CLI error: contract not found"
    );
  });
});

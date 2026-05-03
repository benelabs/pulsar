import { describe, it, expect, vi, beforeEach } from "vitest";

import type { GenerateContractDocsInput } from "../../src/tools/generate_contract_docs.js";

// ---------------------------------------------------------------------------
// Fixtures
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
  },
  {
    type: "function",
    name: "balance",
    inputs: [{ name: "id", type: "Address" }],
    outputs: [{ type: "i128" }],
  },
  {
    type: "event",
    name: "transfer",
    topics: [{ type: "Symbol" }, { type: "Address" }, { type: "Address" }],
    data: { type: "i128" },
  },
];

const EMPTY_FIXTURE: unknown[] = [];

// Mock stellar-cli and soroban-rpc before importing the tool
vi.mock("../../src/services/stellar-cli.js", () => ({
  runStellarCli: vi.fn(),
}));

vi.mock("../../src/services/soroban-rpc.js", () => ({
  getRpcUrl: vi.fn(() => "https://soroban-testnet.stellar.org"),
}));

import { runStellarCli } from "../../src/services/stellar-cli.js";
import { generateContractDocs } from "../../src/tools/generate_contract_docs.js";

const CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

describe("generateContractDocs", () => {
  beforeEach(() => {
    vi.mocked(runStellarCli).mockResolvedValue({
      stdout: JSON.stringify(SAC_FIXTURE),
      stderr: "",
    });
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  it("returns contract_id, network, format, and counts", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.contract_id).toBe(CONTRACT_ID);
    expect(result.network).toBe("testnet");
    expect(result.format).toBe("markdown");
    expect(result.function_count).toBe(2);
    expect(result.event_count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Markdown format
  // -------------------------------------------------------------------------

  it("markdown: includes contract ID in header", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain(CONTRACT_ID);
  });

  it("markdown: includes function names", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("transfer");
    expect(result.documentation).toContain("balance");
  });

  it("markdown: includes doc-comment for transfer", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("Transfer tokens from one account to another.");
  });

  it("markdown: includes parameter types", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("Address");
    expect(result.documentation).toContain("i128");
  });

  it("markdown: includes events section when include_events=true", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("## Events");
    expect(result.documentation).toContain("transfer");
  });

  it("markdown: omits events section when include_events=false", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: false };
    const result = await generateContractDocs(input);

    expect(result.documentation).not.toContain("## Events");
  });

  // -------------------------------------------------------------------------
  // Plain text format
  // -------------------------------------------------------------------------

  it("text: includes contract ID", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "text", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.format).toBe("text");
    expect(result.documentation).toContain(CONTRACT_ID);
  });

  it("text: includes function signatures", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "text", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("transfer(");
    expect(result.documentation).toContain("balance(");
  });

  it("text: includes events when include_events=true", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "text", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.documentation).toContain("EVENTS");
  });

  it("text: omits events when include_events=false", async () => {
    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "text", include_events: false };
    const result = await generateContractDocs(input);

    expect(result.documentation).not.toContain("EVENTS");
  });

  // -------------------------------------------------------------------------
  // Empty contract
  // -------------------------------------------------------------------------

  it("handles contract with no functions or events gracefully", async () => {
    vi.mocked(runStellarCli).mockResolvedValueOnce({
      stdout: JSON.stringify(EMPTY_FIXTURE),
      stderr: "",
    });

    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    const result = await generateContractDocs(input);

    expect(result.function_count).toBe(0);
    expect(result.event_count).toBe(0);
    expect(result.documentation).toContain("No functions found");
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it("throws a clear error when CLI fails", async () => {
    vi.mocked(runStellarCli).mockRejectedValueOnce(new Error("stellar CLI error: not found"));

    const input: GenerateContractDocsInput = { contract_id: CONTRACT_ID, format: "markdown", include_events: true };
    await expect(generateContractDocs(input)).rejects.toThrow(/Failed to fetch contract spec/i);
  });
});

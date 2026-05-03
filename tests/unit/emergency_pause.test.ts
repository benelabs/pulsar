import { describe, it, expect, vi, beforeEach } from "vitest";

import type { EmergencyPauseInput } from "../../src/tools/emergency_pause.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTRACT_WITH_PAUSE = [
  {
    type: "function",
    name: "pause",
    doc: "Pause all contract operations.",
    inputs: [{ name: "admin", type: "Address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    doc: "Resume contract operations.",
    inputs: [{ name: "admin", type: "Address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "from", type: "Address" },
      { name: "to", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
  },
];

const CONTRACT_WITHOUT_PAUSE = [
  {
    type: "function",
    name: "transfer",
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
];

// Mock stellar-cli and soroban-rpc before importing the tool
vi.mock("../../src/services/stellar-cli.js", () => ({
  runStellarCli: vi.fn(),
}));

vi.mock("../../src/services/soroban-rpc.js", () => ({
  getRpcUrl: vi.fn(() => "https://soroban-testnet.stellar.org"),
}));

import { runStellarCli } from "../../src/services/stellar-cli.js";
import { emergencyPause } from "../../src/tools/emergency_pause.js";

const CONTRACT_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

describe("emergencyPause", () => {
  beforeEach(() => {
    vi.mocked(runStellarCli).mockResolvedValue({
      stdout: JSON.stringify(CONTRACT_WITH_PAUSE),
      stderr: "",
    });
  });

  // -------------------------------------------------------------------------
  // inspect action
  // -------------------------------------------------------------------------

  it("inspect: detects pause support when pause function exists", async () => {
    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "inspect" };
    const result = await emergencyPause(input);

    expect(result.pause_supported).toBe(true);
    expect(result.pause_functions).toHaveLength(1);
    expect(result.pause_functions[0].name).toBe("pause");
  });

  it("inspect: detects unpause function", async () => {
    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "inspect" };
    const result = await emergencyPause(input);

    expect(result.unpause_functions).toHaveLength(1);
    expect(result.unpause_functions[0].name).toBe("unpause");
  });

  it("inspect: returns contract_id and network", async () => {
    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "inspect" };
    const result = await emergencyPause(input);

    expect(result.contract_id).toBe(CONTRACT_ID);
    expect(result.network).toBe("testnet");
    expect(result.action).toBe("inspect");
  });

  it("inspect: warns when no pause function found", async () => {
    vi.mocked(runStellarCli).mockResolvedValueOnce({
      stdout: JSON.stringify(CONTRACT_WITHOUT_PAUSE),
      stderr: "",
    });

    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "inspect" };
    const result = await emergencyPause(input);

    expect(result.pause_supported).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/No standard pause function/i);
  });

  // -------------------------------------------------------------------------
  // pause action
  // -------------------------------------------------------------------------

  it("pause: returns recommended invocation with function name", async () => {
    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "pause" };
    const result = await emergencyPause(input);

    expect(result.recommended_invocation).toBeDefined();
    expect(result.recommended_invocation!.function_name).toBe("pause");
  });

  it("pause: includes admin_address in args when provided", async () => {
    const adminAddr = "GDZSTFXVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7";
    const input: EmergencyPauseInput = {
      contract_id: CONTRACT_ID,
      action: "pause",
      admin_address: adminAddr,
    };
    const result = await emergencyPause(input);

    expect(result.recommended_invocation!.args).toMatchObject({ admin: adminAddr });
  });

  it("pause: throws when contract has no pause function", async () => {
    vi.mocked(runStellarCli).mockResolvedValueOnce({
      stdout: JSON.stringify(CONTRACT_WITHOUT_PAUSE),
      stderr: "",
    });

    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "pause" };
    await expect(emergencyPause(input)).rejects.toThrow(/does not expose a standard pause function/i);
  });

  // -------------------------------------------------------------------------
  // unpause action
  // -------------------------------------------------------------------------

  it("unpause: returns recommended invocation with function name", async () => {
    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "unpause" };
    const result = await emergencyPause(input);

    expect(result.recommended_invocation).toBeDefined();
    expect(result.recommended_invocation!.function_name).toBe("unpause");
  });

  it("unpause: throws when contract has no unpause function", async () => {
    vi.mocked(runStellarCli).mockResolvedValueOnce({
      stdout: JSON.stringify(CONTRACT_WITHOUT_PAUSE),
      stderr: "",
    });

    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "unpause" };
    await expect(emergencyPause(input)).rejects.toThrow(/does not expose a standard unpause function/i);
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  it("throws a clear error when CLI fails", async () => {
    vi.mocked(runStellarCli).mockRejectedValueOnce(new Error("stellar CLI error: not found"));

    const input: EmergencyPauseInput = { contract_id: CONTRACT_ID, action: "inspect" };
    await expect(emergencyPause(input)).rejects.toThrow(/Failed to fetch contract spec/i);
  });

  // -------------------------------------------------------------------------
  // Default action
  // -------------------------------------------------------------------------

  it("defaults to inspect when action is omitted", async () => {
    const input = { contract_id: CONTRACT_ID } as EmergencyPauseInput;
    const result = await emergencyPause({ ...input, action: "inspect" });
    expect(result.action).toBe("inspect");
  });
});

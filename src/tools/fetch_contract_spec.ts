import { z } from "zod";
import { ContractIdSchema } from "../types.js";
import { runStellarCli } from "../services/stellar-cli.js";
import { getRpcUrl } from "../services/soroban-rpc.js";
import { config } from "../config.js";

export const fetchContractSpecSchema = z.object({
  contract_id: ContractIdSchema,
  network: z
    .enum(["mainnet", "testnet", "futurenet", "custom"])
    .optional()
    .describe("Override the active network for this call."),
});

export type FetchContractSpecInput = z.infer<typeof fetchContractSpecSchema>;

export interface ContractFunction {
  name: string;
  doc?: string;
  inputs: { name: string; type: string }[];
  outputs: { type: string }[];
}

export interface ContractEvent {
  name: string;
  topics?: { type: string }[];
  data?: { type: string };
}

export interface FetchContractSpecOutput {
  contract_id: string;
  network: string;
  functions: ContractFunction[];
  events: ContractEvent[];
  raw_xdr: string;
}

export async function fetchContractSpec(
  input: FetchContractSpecInput
): Promise<FetchContractSpecOutput> {
  const network = input.network ?? config.stellarNetwork;
  const rpcUrl = getRpcUrl(network);

  // Build args as an array — no shell interpolation
  const args = [
    "contract",
    "info",
    "interface",
    "--contract-id",
    input.contract_id,
    "--rpc-url",
    rpcUrl,
    "--output",
    "json",
  ];

  const { stdout } = await runStellarCli(args);

  // The CLI outputs a JSON array of spec entries
  let raw: unknown;
  try {
    raw = JSON.parse(stdout.trim());
  } catch {
    throw new Error(`Failed to parse stellar CLI output as JSON: ${stdout.slice(0, 200)}`);
  }

  return parseCliSpec(raw, input.contract_id, network);
}

// ---------------------------------------------------------------------------
// Parse the CLI JSON output into our typed response shape
// ---------------------------------------------------------------------------

function parseCliSpec(raw: unknown, contractId: string, network: string): FetchContractSpecOutput {
  const entries = Array.isArray(raw) ? raw : [raw];

  const functions: ContractFunction[] = [];
  const events: ContractEvent[] = [];
  let raw_xdr = "";

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    // Top-level raw XDR if present
    if (typeof e["xdr"] === "string" && !raw_xdr) raw_xdr = e["xdr"] as string;

    const kind = e["type"] ?? e["kind"];

    if (kind === "function" || "inputs" in e) {
      functions.push(parseFunction(e));
    } else if (kind === "event") {
      events.push(parseEvent(e));
    }
  }

  return { contract_id: contractId, network, functions, events, raw_xdr };
}

function parseFunction(e: Record<string, unknown>): ContractFunction {
  const inputs = Array.isArray(e["inputs"])
    ? (e["inputs"] as Record<string, unknown>[]).map((p) => ({
        name: String(p["name"] ?? ""),
        type: stringifyType(p["type"]),
      }))
    : [];

  const outputs = Array.isArray(e["outputs"])
    ? (e["outputs"] as Record<string, unknown>[]).map((p) => ({
        type: stringifyType(p["type"]),
      }))
    : [];

  return {
    name: String(e["name"] ?? ""),
    ...(e["doc"] ? { doc: String(e["doc"]) } : {}),
    inputs,
    outputs,
  };
}

function parseEvent(e: Record<string, unknown>): ContractEvent {
  const topics = Array.isArray(e["topics"])
    ? (e["topics"] as Record<string, unknown>[]).map((t) => ({ type: stringifyType(t["type"]) }))
    : undefined;

  const data = e["data"]
    ? { type: stringifyType((e["data"] as Record<string, unknown>)["type"]) }
    : undefined;

  return { name: String(e["name"] ?? ""), ...(topics ? { topics } : {}), ...(data ? { data } : {}) };
}

function stringifyType(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") return JSON.stringify(t);
  return String(t ?? "unknown");
}

/**
 * emergency_pause — Circuit Breaker Pattern for Soroban Contracts
 *
 * Provides a standard mechanism to inspect and simulate pausing contract
 * operations during exploits or emergencies. This tool:
 *   1. Fetches the contract spec to detect pause-related functions.
 *   2. Returns a structured report of pause capability and recommended actions.
 *
 * NOTE: This tool does NOT submit transactions. It is a diagnostic/advisory
 * tool that helps operators understand the pause surface of a contract and
 * prepare the correct invocation. Actual pausing requires submit_transaction.
 */

import { z } from "zod";
import { ContractIdSchema, NetworkSchema } from "../schemas/index.js";
import { fetchContractSpec } from "./fetch_contract_spec.js";
import { PulsarValidationError } from "../errors.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const EmergencyPauseInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  action: z
    .enum(["inspect", "pause", "unpause"])
    .default("inspect")
    .describe(
      "inspect: report pause capability; pause/unpause: return the recommended invocation args.",
    ),
  admin_address: z
    .string()
    .optional()
    .describe(
      "Optional admin/owner address to include in the recommended invocation.",
    ),
});

export type EmergencyPauseInput = z.infer<typeof EmergencyPauseInputSchema>;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface PauseFunction {
  name: string;
  doc?: string;
  inputs: { name: string; type: string }[];
}

export interface EmergencyPauseOutput {
  contract_id: string;
  network: string;
  action: string;
  pause_supported: boolean;
  pause_functions: PauseFunction[];
  unpause_functions: PauseFunction[];
  recommended_invocation?: {
    function_name: string;
    args: Record<string, string>;
    note: string;
  };
  warnings: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// Pause-related function name patterns (common Soroban conventions)
// ---------------------------------------------------------------------------

const PAUSE_PATTERNS = [/^pause$/i, /^set_paused$/i, /^emergency_stop$/i, /^halt$/i, /^freeze$/i];
const UNPAUSE_PATTERNS = [/^unpause$/i, /^resume$/i, /^set_unpaused$/i, /^unfreeze$/i, /^restart$/i];

function matchesPatterns(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function emergencyPause(input: EmergencyPauseInput): Promise<EmergencyPauseOutput> {
  const { contract_id, network, action, admin_address } = input;

  // Fetch the contract spec to discover pause-related functions
  let spec;
  try {
    spec = await fetchContractSpec({ contract_id, network });
  } catch (err) {
    throw new PulsarValidationError(
      `Failed to fetch contract spec for ${contract_id}: ${(err as Error).message}`,
      { contract_id, network },
    );
  }

  const pauseFunctions: PauseFunction[] = spec.functions
    .filter((f) => matchesPatterns(f.name, PAUSE_PATTERNS))
    .map((f) => ({ name: f.name, doc: f.doc, inputs: f.inputs }));

  const unpauseFunctions: PauseFunction[] = spec.functions
    .filter((f) => matchesPatterns(f.name, UNPAUSE_PATTERNS))
    .map((f) => ({ name: f.name, doc: f.doc, inputs: f.inputs }));

  const pauseSupported = pauseFunctions.length > 0;
  const warnings: string[] = [];

  if (!pauseSupported) {
    warnings.push(
      "No standard pause function detected. The contract may use a custom mechanism or may not support pausing.",
    );
  }

  if (unpauseFunctions.length === 0 && pauseSupported) {
    warnings.push(
      "No unpause function detected. Pausing this contract may be irreversible.",
    );
  }

  let recommended: EmergencyPauseOutput["recommended_invocation"] | undefined;
  let message: string;

  if (action === "inspect") {
    message = pauseSupported
      ? `Contract supports pausing via: ${pauseFunctions.map((f) => f.name).join(", ")}.`
      : "Contract does not expose a standard pause function.";
  } else if (action === "pause") {
    if (!pauseSupported) {
      throw new PulsarValidationError(
        `Contract ${contract_id} does not expose a standard pause function. Cannot generate pause invocation.`,
        { available_functions: spec.functions.map((f) => f.name) },
      );
    }
    const fn = pauseFunctions[0];
    const args: Record<string, string> = {};
    if (admin_address) {
      const adminParam = fn.inputs.find((i) =>
        /admin|owner|authority|caller/i.test(i.name),
      );
      if (adminParam) args[adminParam.name] = admin_address;
    }
    recommended = {
      function_name: fn.name,
      args,
      note: "Use simulate_transaction to dry-run, then submit_transaction to execute. Ensure you hold the admin key.",
    };
    message = `Recommended pause invocation prepared for function '${fn.name}'.`;
  } else {
    // unpause
    if (unpauseFunctions.length === 0) {
      throw new PulsarValidationError(
        `Contract ${contract_id} does not expose a standard unpause function.`,
        { available_functions: spec.functions.map((f) => f.name) },
      );
    }
    const fn = unpauseFunctions[0];
    const args: Record<string, string> = {};
    if (admin_address) {
      const adminParam = fn.inputs.find((i) =>
        /admin|owner|authority|caller/i.test(i.name),
      );
      if (adminParam) args[adminParam.name] = admin_address;
    }
    recommended = {
      function_name: fn.name,
      args,
      note: "Use simulate_transaction to dry-run, then submit_transaction to execute. Ensure you hold the admin key.",
    };
    message = `Recommended unpause invocation prepared for function '${fn.name}'.`;
  }

  return {
    contract_id,
    network: spec.network,
    action,
    pause_supported: pauseSupported,
    pause_functions: pauseFunctions,
    unpause_functions: unpauseFunctions,
    ...(recommended ? { recommended_invocation: recommended } : {}),
    warnings,
    message,
  };
}

/**
 * generate_contract_docs — Documentation Generator for Soroban Contracts
 *
 * Fetches the contract spec (ABI) and renders it as human-readable
 * documentation in the requested format (markdown or plain text).
 *
 * Extracts:
 *   - Function signatures with parameter names and types
 *   - Doc-comments attached to each function
 *   - Emitted event schemas
 */

import { z } from "zod";
import { ContractIdSchema, NetworkSchema } from "../schemas/index.js";
import { fetchContractSpec } from "./fetch_contract_spec.js";
import type { ContractFunction, ContractEvent } from "./fetch_contract_spec.js";
import { PulsarValidationError } from "../errors.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const GenerateContractDocsInputSchema = z.object({
  contract_id: ContractIdSchema,
  network: NetworkSchema.optional(),
  format: z
    .enum(["markdown", "text"])
    .default("markdown")
    .describe("Output format: markdown (default) or plain text."),
  include_events: z
    .boolean()
    .default(true)
    .describe("Include emitted event schemas in the output."),
});

export type GenerateContractDocsInput = z.infer<typeof GenerateContractDocsInputSchema>;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface GenerateContractDocsOutput {
  contract_id: string;
  network: string;
  format: string;
  function_count: number;
  event_count: number;
  documentation: string;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderMarkdown(
  contractId: string,
  network: string,
  functions: ContractFunction[],
  events: ContractEvent[],
  includeEvents: boolean,
): string {
  const lines: string[] = [];

  lines.push(`# Contract Documentation`);
  lines.push(``);
  lines.push(`**Contract ID:** \`${contractId}\``);
  lines.push(`**Network:** ${network}`);
  lines.push(``);

  // Functions
  lines.push(`## Functions`);
  lines.push(``);

  if (functions.length === 0) {
    lines.push(`_No functions found in contract spec._`);
    lines.push(``);
  } else {
    for (const fn of functions) {
      const paramList = fn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ");
      const returnList =
        fn.outputs.length > 0 ? fn.outputs.map((o) => o.type).join(", ") : "void";

      lines.push(`### \`${fn.name}(${paramList})\` → \`${returnList}\``);
      lines.push(``);

      if (fn.doc) {
        lines.push(fn.doc);
        lines.push(``);
      }

      if (fn.inputs.length > 0) {
        lines.push(`**Parameters:**`);
        lines.push(``);
        for (const input of fn.inputs) {
          lines.push(`- \`${input.name}\` (\`${input.type}\`)`);
        }
        lines.push(``);
      }

      if (fn.outputs.length > 0) {
        lines.push(`**Returns:** ${fn.outputs.map((o) => `\`${o.type}\``).join(", ")}`);
        lines.push(``);
      }

      lines.push(`---`);
      lines.push(``);
    }
  }

  // Events
  if (includeEvents) {
    lines.push(`## Events`);
    lines.push(``);

    if (events.length === 0) {
      lines.push(`_No events found in contract spec._`);
      lines.push(``);
    } else {
      for (const ev of events) {
        lines.push(`### \`${ev.name}\``);
        lines.push(``);

        if (ev.topics && ev.topics.length > 0) {
          lines.push(`**Topics:** ${ev.topics.map((t) => `\`${t.type}\``).join(", ")}`);
          lines.push(``);
        }

        if (ev.data) {
          lines.push(`**Data:** \`${ev.data.type}\``);
          lines.push(``);
        }

        lines.push(`---`);
        lines.push(``);
      }
    }
  }

  return lines.join("\n");
}

function renderText(
  contractId: string,
  network: string,
  functions: ContractFunction[],
  events: ContractEvent[],
  includeEvents: boolean,
): string {
  const lines: string[] = [];

  lines.push(`CONTRACT DOCUMENTATION`);
  lines.push(`======================`);
  lines.push(`Contract ID : ${contractId}`);
  lines.push(`Network     : ${network}`);
  lines.push(``);

  lines.push(`FUNCTIONS`);
  lines.push(`---------`);

  if (functions.length === 0) {
    lines.push(`No functions found.`);
    lines.push(``);
  } else {
    for (const fn of functions) {
      const paramList = fn.inputs.map((i) => `${i.name}: ${i.type}`).join(", ");
      const returnList =
        fn.outputs.length > 0 ? fn.outputs.map((o) => o.type).join(", ") : "void";

      lines.push(`${fn.name}(${paramList}) -> ${returnList}`);

      if (fn.doc) {
        lines.push(`  ${fn.doc}`);
      }

      for (const input of fn.inputs) {
        lines.push(`  param ${input.name}: ${input.type}`);
      }

      lines.push(``);
    }
  }

  if (includeEvents) {
    lines.push(`EVENTS`);
    lines.push(`------`);

    if (events.length === 0) {
      lines.push(`No events found.`);
      lines.push(``);
    } else {
      for (const ev of events) {
        lines.push(`${ev.name}`);
        if (ev.topics && ev.topics.length > 0) {
          lines.push(`  topics: ${ev.topics.map((t) => t.type).join(", ")}`);
        }
        if (ev.data) {
          lines.push(`  data: ${ev.data.type}`);
        }
        lines.push(``);
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function generateContractDocs(
  input: GenerateContractDocsInput,
): Promise<GenerateContractDocsOutput> {
  const { contract_id, network, format, include_events } = input;

  let spec;
  try {
    spec = await fetchContractSpec({ contract_id, network });
  } catch (err) {
    throw new PulsarValidationError(
      `Failed to fetch contract spec for ${contract_id}: ${(err as Error).message}`,
      { contract_id, network },
    );
  }

  const documentation =
    format === "markdown"
      ? renderMarkdown(contract_id, spec.network, spec.functions, spec.events, include_events)
      : renderText(contract_id, spec.network, spec.functions, spec.events, include_events);

  return {
    contract_id,
    network: spec.network,
    format,
    function_count: spec.functions.length,
    event_count: spec.events.length,
    documentation,
  };
}

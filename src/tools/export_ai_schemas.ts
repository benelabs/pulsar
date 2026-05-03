import type { McpToolHandler } from "../types.js";
import { PulsarValidationError } from "../errors.js";
import { ExportAiSchemasInputSchema } from "../schemas/tools.js";

/**
 * Tool: export_ai_schemas
 *
 * Exports comprehensive schema definitions of all Pulsar tools in a format optimized
 * for AI training and LLM consumption. Supports multiple output formats:
 * - 'json': Machine-readable JSON schema
 * - 'markdown': Human-readable Markdown documentation
 * - 'openapi': OpenAPI 3.0 specification (for broader ecosystem compatibility)
 *
 * This tool enables:
 * 1. LLM fine-tuning with accurate tool definitions
 * 2. Automated documentation generation
 * 3. AI assistant system prompt generation
 * 4. Type-safe tool invocation by other systems
 *
 * SECURITY NOTE: Output does NOT include sensitive defaults or secrets. Users must
 * configure STELLAR_SECRET_KEY and other secrets in their environment.
 */

// Tool definitions matching the MCP server's capabilities
interface ToolDefinition {
  name: string;
  description: string;
  category: "transaction" | "query" | "contract" | "utility";
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  examples?: {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
  warnings?: string[];
}

/**
 * Core tool definitions for Pulsar.
 * Derived from the MCP server's ListToolsRequestSchema response.
 */
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "get_account_balance",
      description:
        "Query the current XLM and issued asset balances for a Stellar account. " +
        "Optionally filter by asset code and/or issuer. " +
        "Queries are made against Horizon (read-only, no state changes).",
      category: "query",
      inputSchema: {
        type: "object",
        properties: {
          account_id: {
            type: "string",
            description:
              "The Stellar account public key (format: G followed by 55 base32 chars, 56 chars total)",
            format: "stellar-account-id",
            example: "GBRPYHIL2CI3WHZDTOOQFC6EB4CWXF23ZSXZERU46UXMETATKHKZEL37",
          },
          asset_code: {
            type: "string",
            description: "Optional: Filter results by asset code (e.g., USDC, EUR)",
            example: "USDC",
          },
          asset_issuer: {
            type: "string",
            description:
              "Optional: Filter results by asset issuer (Stellar account that issued the asset)",
            format: "stellar-account-id",
            example: "GBUQWP3BOUZX34ZONKC5DKJ2QQ4V5QBTLIN4A5LLU4ZفقDMJOTXEB7",
          },
          network: {
            type: "string",
            enum: ["mainnet", "testnet", "futurenet", "custom"],
            description:
              "Override the server's default network. Defaults to server configuration.",
          },
        },
        required: ["account_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "The queried account ID" },
          balances: {
            type: "array",
            items: {
              type: "object",
              properties: {
                asset_type: {
                  type: "string",
                  enum: ["native", "credit_alphanum4", "credit_alphanum12"],
                  description: "Type of asset (native = XLM, credit = issued token)",
                },
                asset_code: {
                  type: "string",
                  description: "Asset code (null for native XLM)",
                },
                asset_issuer: {
                  type: "string",
                  description: "Issuing account (null for native XLM)",
                },
                balance: {
                  type: "string",
                  description: "Current balance as a string (to preserve precision)",
                },
              },
            },
          },
        },
      },
      examples: {
        input: {
          account_id: "GBRPYHIL2CI3WHZDTOOQFC6EB4CWXF23ZSXZERU46UXMETATKHKZEL37",
          network: "testnet",
        },
        output: {
          account_id: "GBRPYHIL2CI3WHZDTOOQFC6EB4CWXF23ZSXZERU46UXMETATKHKZEL37",
          balances: [
            {
              asset_type: "native",
              asset_code: null,
              asset_issuer: null,
              balance: "100.5000000",
            },
          ],
        },
      },
    },
    {
      name: "submit_transaction",
      description:
        "⚠️ IRREVERSIBLE - Always simulate first with simulate_transaction before submitting. " +
        "Submits a signed transaction envelope (base64-encoded XDR) to the Stellar network. " +
        "Supports in-process signing (if STELLAR_SECRET_KEY is configured) and optional polling for results.",
      category: "transaction",
      inputSchema: {
        type: "object",
        properties: {
          xdr: {
            type: "string",
            description:
              "Base64-encoded transaction envelope XDR. Must be signed or will be signed if sign=true.",
            example: "AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9A==",
          },
          network: {
            type: "string",
            enum: ["mainnet", "testnet", "futurenet", "custom"],
            description: "Override the server's default network.",
          },
          sign: {
            type: "boolean",
            default: false,
            description:
              "If true, sign the transaction in-process using STELLAR_SECRET_KEY before submitting. " +
              "Key is never logged or exposed. Requires STELLAR_SECRET_KEY environment variable.",
          },
          wait_for_result: {
            type: "boolean",
            default: false,
            description:
              "If true, poll the Soroban RPC for SUCCESS or FAILED result (up to 30s by default).",
          },
          wait_timeout_ms: {
            type: "number",
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: "Polling timeout in milliseconds (1000-120000).",
          },
        },
        required: ["xdr"],
      },
      outputSchema: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Transaction hash" },
          status: {
            type: "string",
            enum: ["PENDING", "SUCCESS", "FAILED"],
            description: "Transaction status",
          },
          result: { type: "object", description: "Detailed result from Soroban RPC" },
        },
      },
      warnings: [
        "This operation submits an actual transaction to the Stellar/Soroban network.",
        "Always simulate first to verify behavior.",
        "Transaction fees are non-refundable.",
      ],
      examples: {
        input: {
          xdr: "AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9A==",
          network: "testnet",
          wait_for_result: true,
        },
        output: {
          hash: "abc123def456",
          status: "SUCCESS",
          result: { returnValue: null },
        },
      },
    },
    {
      name: "simulate_transaction",
      description:
        "Dry-run a transaction on the Soroban RPC without actually submitting it. " +
        "Returns resource costs (CPU, memory), fees, return values, events, and any errors. " +
        "Essential for validating transaction correctness before submission.",
      category: "transaction",
      inputSchema: {
        type: "object",
        properties: {
          xdr: {
            type: "string",
            description: "Base64-encoded transaction envelope XDR (unsigned is acceptable for simulation).",
          },
          network: {
            type: "string",
            enum: ["mainnet", "testnet", "futurenet", "custom"],
            description: "Override the server's default network.",
          },
        },
        required: ["xdr"],
      },
      outputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["SUCCESS", "FAIL"], description: "Simulation status" },
          cost: {
            type: "object",
            properties: {
              cpu_instructions: { type: "string" },
              memory_bytes: { type: "string" },
            },
          },
          min_resource_fee: { type: "string", description: "Minimum fee in stroops (1 XLM = 10^7 stroops)" },
          return_value_native: { type: ["string", "null"], description: "Return value from contract" },
          events: { type: "array", description: "Emitted contract events" },
        },
      },
      examples: {
        input: {
          xdr: "AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9A==",
          network: "testnet",
        },
        output: {
          status: "SUCCESS",
          cost: {
            cpu_instructions: "50000",
            memory_bytes: "10000",
          },
          min_resource_fee: "1000",
          return_value_native: null,
          events: [],
        },
      },
    },
    {
      name: "fetch_contract_spec",
      description:
        "Fetch the specification (interface/ABI) of a deployed Soroban smart contract. " +
        "Returns decoded function signatures, parameter types, return types, and emitted event schemas. " +
        "Essential for building transactions that invoke contract methods.",
      category: "contract",
      inputSchema: {
        type: "object",
        properties: {
          contract_id: {
            type: "string",
            description: "The Soroban contract address (C followed by 55 base32 chars)",
            format: "soroban-contract-id",
            example: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          },
          network: {
            type: "string",
            enum: ["mainnet", "testnet", "futurenet", "custom"],
            description: "Override the server's default network.",
          },
        },
        required: ["contract_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          contract_id: { type: "string" },
          network: { type: "string" },
          functions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Function name" },
                doc: { type: "string", description: "Function documentation" },
                inputs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string", description: "XDR-encoded type" },
                    },
                  },
                },
                outputs: { type: "array", items: { type: "object" } },
              },
            },
          },
          events: { type: "array", items: { type: "object" } },
          raw_xdr: { type: "string", description: "Raw XDR specification" },
        },
      },
      examples: {
        input: {
          contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          network: "testnet",
        },
        output: {
          contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
          network: "testnet",
          functions: [
            {
              name: "init",
              doc: "Initialize the contract",
              inputs: [],
              outputs: [],
            },
          ],
          events: [],
          raw_xdr: "...",
        },
      },
    },
    {
      name: "compute_vesting_schedule",
      description:
        "Calculate a token vesting or timelock release schedule. " +
        "Typically used for team allocations, investor releases, or advisor cliffs. " +
        "Returns cumulative and period-by-period breakdown.",
      category: "utility",
      inputSchema: {
        type: "object",
        properties: {
          total_amount: {
            type: "number",
            description: "Total token amount to vest (e.g., 1000000)",
          },
          start_timestamp: {
            type: "number",
            description: "Unix timestamp when vesting begins",
          },
          cliff_seconds: {
            type: "number",
            description: "Number of seconds before any tokens unlock (cliff period)",
          },
          vesting_duration_seconds: {
            type: "number",
            description: "Total vesting period in seconds (e.g., 4 years = 126_144_000 seconds)",
          },
          release_frequency_seconds: {
            type: "number",
            description: "How often tokens unlock after cliff (e.g., 2_592_000 for monthly)",
          },
          beneficiary_type: {
            type: "string",
            enum: ["team", "investor", "advisor", "other"],
            description: "Category of beneficiary",
          },
          current_timestamp: {
            type: "number",
            description: "Optional override for 'now' (defaults to current time)",
          },
        },
        required: [
          "total_amount",
          "start_timestamp",
          "cliff_seconds",
          "vesting_duration_seconds",
          "release_frequency_seconds",
          "beneficiary_type",
        ],
      },
      outputSchema: {
        type: "object",
        properties: {
          total_amount: { type: "number" },
          released_amount: { type: "number" },
          unreleased_amount: { type: "number" },
          vesting_percentage: { type: "number" },
          schedule: {
            type: "array",
            items: {
              type: "object",
              properties: {
                period: { type: "number" },
                timestamp: { type: "number" },
                release_amount: { type: "number" },
                cumulative_amount: { type: "number" },
              },
            },
          },
        },
      },
      examples: {
        input: {
          total_amount: 1000000,
          start_timestamp: 1704067200,
          cliff_seconds: 15778800,
          vesting_duration_seconds: 126144000,
          release_frequency_seconds: 2592000,
          beneficiary_type: "team",
        },
        output: {
          total_amount: 1000000,
          released_amount: 500000,
          unreleased_amount: 500000,
          vesting_percentage: 50,
          schedule: [
            {
              period: 0,
              timestamp: 1720000000,
              release_amount: 250000,
              cumulative_amount: 250000,
            },
          ],
        },
      },
    },
    {
      name: "deploy_contract",
      description:
        "Build (but do not submit) a Stellar transaction for deploying a Soroban smart contract. " +
        "Supports 'direct' mode (built-in deployer) or 'factory' mode (via a factory contract). " +
        "Returns the unsigned transaction XDR. Always simulate before submitting.",
      category: "contract",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["direct", "factory"],
            description:
              "'direct' = use Stellar's built-in deployer, 'factory' = deploy via a factory contract",
          },
          source_account: {
            type: "string",
            description: "Stellar public key (G...) that deploys and pays fees",
            format: "stellar-account-id",
          },
          wasm_hash: {
            type: "string",
            description: "SHA-256 hash of the uploaded WASM as 64 hex characters (required for direct mode)",
            example: "abc123def456abc123def456abc123def456abc123def456abc123def456ab",
          },
          salt: {
            type: "string",
            description: "Optional 32-byte salt as 64 hex characters for deterministic address (random if omitted)",
          },
          factory_contract_id: {
            type: "string",
            description: "Soroban contract ID (C...) of the factory contract (required for factory mode)",
            format: "soroban-contract-id",
          },
          deploy_function: {
            type: "string",
            default: "deploy",
            description: "Factory deploy function name",
          },
          deploy_args: {
            type: "array",
            description:
              "Arguments for factory deploy function. Each item is a typed SCVal: " +
              "{ type?: 'symbol'|'string'|'u32'|'i32'|'u64'|'i64'|'u128'|'i128'|'bool'|'address'|'bytes'|'void', value: any }",
          },
          network: {
            type: "string",
            enum: ["mainnet", "testnet", "futurenet", "custom"],
            description: "Override the server's default network.",
          },
        },
        required: ["mode", "source_account"],
      },
      outputSchema: {
        type: "object",
        properties: {
          transaction_xdr: { type: "string", description: "Unsigned transaction XDR" },
          predicted_contract_id: { type: "string", description: "Predicted contract ID (direct mode only)" },
        },
      },
      warnings: [
        "This returns an unsigned transaction. Use submit_transaction to submit after signing.",
        "Always simulate the transaction before submitting to verify it will succeed.",
      ],
      examples: {
        input: {
          mode: "direct",
          source_account: "GBRPYHIL2CI3WHZDTOOQFC6EB4CWXF23ZSXZERU46UXMETATKHKZEL37",
          wasm_hash: "abc123def456abc123def456abc123def456abc123def456abc123def456ab",
          network: "testnet",
        },
        output: {
          transaction_xdr: "AAAAAgAAAADpXp5R8Y9X2R9X2R9X2R9X2R9X2R9X2R9X2R9X2R8AAAAAZAAB9A==",
          predicted_contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
        },
      },
    },
  ];
}

/**
 * Export tools as JSON Schema for AI consumption.
 */
function exportAsJson(tools: ToolDefinition[], includeExamples: boolean): Record<string, unknown> {
  const toolsForExport = tools.map((tool) => {
    const { examples, ...toolWithoutExamples } = tool;
    if (includeExamples && examples) {
      return tool;
    }
    return toolWithoutExamples;
  });

  return {
    version: "1.0.0",
    server: "pulsar",
    description:
      "Pulsar MCP Server — Stellar/Soroban tools for automated blockchain operations. " +
      "All tools are read-only queries (no signing/submission) except where explicitly marked as irreversible.",
    tools: toolsForExport,
    metadata: {
      total_tools: toolsForExport.length,
      categories: {
        query: toolsForExport.filter((t) => t.category === "query").length,
        transaction: toolsForExport.filter((t) => t.category === "transaction").length,
        contract: toolsForExport.filter((t) => t.category === "contract").length,
        utility: toolsForExport.filter((t) => t.category === "utility").length,
      },
      security_notes: [
        "All tools validate inputs with Zod before processing.",
        "Secret keys are never logged or exposed in error messages.",
        "Signing is optional and only happens with explicit sign=true and STELLAR_SECRET_KEY configured.",
        "Network queries are read-only unless explicitly submitting a transaction.",
      ],
      stellar_best_practices: [
        "Always simulate transactions before submitting to verify correctness and cost.",
        "Use testnet/futurenet for development and testing before mainnet.",
        "Preserve numeric precision by using string representations where applicable.",
        "Follow Stellar Documentation: https://developers.stellar.org",
        "Follow Soroban Documentation: https://soroban.stellar.org",
      ],
    },
  };
}

/**
 * Export tools as Markdown documentation for humans.
 */
function exportAsMarkdown(tools: ToolDefinition[], includeExamples: boolean): string {
  let markdown = `# Pulsar Tool Schemas

**Version:** 1.0.0  
**Server:** Pulsar MCP (Model Context Protocol)  
**Purpose:** AI-ready schema export for Stellar/Soroban tools

---

## Overview

Pulsar provides ${tools.length} tools for interacting with Stellar and Soroban networks:

- **Query Tools**: Read account balances and contract specs
- **Transaction Tools**: Build, simulate, and submit transactions
- **Contract Tools**: Deploy and interact with smart contracts
- **Utility Tools**: Calculate vesting schedules and other utilities

---

## Security & Best Practices

### Security
- All inputs are validated with Zod before processing
- Secret keys are **never** logged or exposed in error messages
- Signing is optional and only occurs with explicit \`sign=true\` and \`STELLAR_SECRET_KEY\` configured
- Network queries are read-only unless explicitly submitting a transaction

### Stellar Best Practices
- Always simulate transactions before submitting to verify correctness and cost
- Use testnet/futurenet for development; use mainnet only when ready for production
- Preserve numeric precision by using string representations
- Refer to [Stellar Developers](https://developers.stellar.org) and [Soroban Docs](https://soroban.stellar.org)

---

## Tools

`;

  for (const tool of tools) {
    markdown += `### ${tool.name}\n\n`;
    markdown += `**Category:** \`${tool.category}\`\n\n`;
    markdown += `${tool.description}\n\n`;

    if (tool.warnings && tool.warnings.length > 0) {
      markdown += `**⚠️ Warnings:**\n`;
      for (const warning of tool.warnings) {
        markdown += `- ${warning}\n`;
      }
      markdown += "\n";
    }

    markdown += `**Input Schema:**\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n`;

    if (tool.outputSchema) {
      markdown += `**Output Schema:**\n\`\`\`json\n${JSON.stringify(tool.outputSchema, null, 2)}\n\`\`\`\n\n`;
    }

    if (includeExamples && tool.examples) {
      markdown += `**Example:**\n\n**Input:**\n\`\`\`json\n${JSON.stringify(
        tool.examples.input,
        null,
        2
      )}\n\`\`\`\n\n`;
      markdown += `**Output:**\n\`\`\`json\n${JSON.stringify(tool.examples.output, null, 2)}\n\`\`\`\n\n`;
    }

    markdown += "---\n\n";
  }

  return markdown;
}

/**
 * Export tools as OpenAPI 3.0 specification.
 */
function exportAsOpenApi(tools: ToolDefinition[]): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const tool of tools) {
    paths[`/tools/${tool.name}`] = {
      post: {
        summary: tool.name,
        description: tool.description,
        tags: [tool.category],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: tool.inputSchema,
            },
          },
        },
        responses: {
          200: {
            description: "Successful response",
            content: {
              "application/json": {
                schema: tool.outputSchema || { type: "object" },
              },
            },
          },
          400: {
            description: "Invalid input",
          },
          500: {
            description: "Server error",
          },
        },
      },
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      title: "Pulsar MCP API",
      version: "1.0.0",
      description: "AI-ready schema export for Stellar/Soroban tools",
      contact: {
        name: "Pulsar",
        url: "https://github.com/GideonBature/pulsar",
      },
    },
    servers: [
      {
        url: "http://localhost:8000",
        description: "Local development",
      },
    ],
    paths,
    components: {
      schemas: {
        StellarAccountId: {
          type: "string",
          pattern: "^G[A-Z2-7]{54}$",
          description: "Stellar public key (56 chars starting with G)",
        },
        SorobanContractId: {
          type: "string",
          pattern: "^C[A-Z2-7]{54}$",
          description: "Soroban contract ID (56 chars starting with C)",
        },
        Network: {
          type: "string",
          enum: ["mainnet", "testnet", "futurenet", "custom"],
        },
      },
    },
  };
}

/**
 * Main tool handler for exporting schemas.
 */
export const exportAiSchemas: McpToolHandler<
  typeof ExportAiSchemasInputSchema
> = async (input: unknown) => {
  const validatedInput = ExportAiSchemasInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for export_ai_schemas",
      validatedInput.error.format()
    );
  }

  const { format, include_examples } = validatedInput.data;
  const tools = getToolDefinitions();

  let result: unknown;
  let contentType = "application/json";

  switch (format) {
    case "json":
      result = exportAsJson(tools, include_examples);
      contentType = "application/json";
      break;

    case "markdown":
      result = exportAsMarkdown(tools, include_examples);
      contentType = "text/markdown";
      break;

    case "openapi":
      result = exportAsOpenApi(tools);
      contentType = "application/json";
      break;

    default:
      throw new PulsarValidationError(`Unknown format: ${format}`);
  }

  return {
    format,
    content_type: contentType,
    schema_count: tools.length,
    include_examples,
    data: result,
  };
};

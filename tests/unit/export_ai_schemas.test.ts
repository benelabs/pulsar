import { describe, it, expect } from "vitest";
import { exportAiSchemas } from "../../src/tools/export_ai_schemas.js";
import { PulsarValidationError } from "../../src/errors.js";

describe("exportAiSchemas", () => {
  describe("format validation", () => {
    it("exports tools in JSON format by default", async () => {
      const result = await exportAiSchemas({});

      expect(result.format).toBe("json");
      expect(result.content_type).toBe("application/json");
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe("object");
    });

    it("exports tools in JSON format when explicitly requested", async () => {
      const result = await exportAiSchemas({ format: "json" });

      expect(result.format).toBe("json");
      expect(result.content_type).toBe("application/json");

      const data = result.data as Record<string, unknown>;
      expect(data.version).toBe("1.0.0");
      expect(data.server).toBe("pulsar");
      expect(Array.isArray(data.tools)).toBe(true);
    });

    it("exports tools in Markdown format", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      expect(result.format).toBe("markdown");
      expect(result.content_type).toBe("text/markdown");
      expect(typeof result.data).toBe("string");

      const markdown = result.data as string;
      expect(markdown).toContain("# Pulsar Tool Schemas");
      expect(markdown).toContain("get_account_balance");
      expect(markdown).toContain("submit_transaction");
    });

    it("exports tools in OpenAPI format", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      expect(result.format).toBe("openapi");
      expect(result.content_type).toBe("application/json");

      const data = result.data as Record<string, unknown>;
      expect(data.openapi).toBe("3.0.0");
      expect(data.info).toBeDefined();
      expect(data.paths).toBeDefined();
    });
  });

  describe("example inclusion", () => {
    it("includes examples by default in JSON format", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;
      const toolWithExamples = tools.find((t) => t.examples !== undefined);

      expect(toolWithExamples).toBeDefined();
      expect(toolWithExamples?.examples).toBeDefined();
    });

    it("excludes examples when include_examples is false", async () => {
      const result = await exportAiSchemas({
        format: "json",
        include_examples: false,
      });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;
      const toolWithExamples = tools.find((t) => t.examples !== undefined);

      expect(toolWithExamples).toBeUndefined();
    });

    it("includes examples in Markdown when include_examples is true", async () => {
      const result = await exportAiSchemas({
        format: "markdown",
        include_examples: true,
      });

      const markdown = result.data as string;
      expect(markdown).toContain("**Example:**");
      expect(markdown).toContain("**Input:**");
      expect(markdown).toContain("**Output:**");
    });

    it("excludes examples in Markdown when include_examples is false", async () => {
      const result = await exportAiSchemas({
        format: "markdown",
        include_examples: false,
      });

      const markdown = result.data as string;
      // Should still have tool descriptions, but not examples
      expect(markdown).toContain("get_account_balance");
      expect(markdown).not.toContain("**Example:**");
    });
  });

  describe("JSON schema structure", () => {
    it("includes all required metadata fields", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      expect(data.version).toBe("1.0.0");
      expect(data.server).toBe("pulsar");
      expect(data.description).toBeDefined();
      expect(data.tools).toBeDefined();
      expect(data.metadata).toBeDefined();
    });

    it("includes tool categories in metadata", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const metadata = data.metadata as Record<string, unknown>;
      const categories = metadata.categories as Record<string, unknown>;

      expect(categories.query).toBeGreaterThanOrEqual(1);
      expect(categories.transaction).toBeGreaterThanOrEqual(1);
      expect(categories.contract).toBeGreaterThanOrEqual(1);
      expect(categories.utility).toBeGreaterThanOrEqual(1);
    });

    it("includes security and best practice notes", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const metadata = data.metadata as Record<string, unknown>;

      expect(Array.isArray(metadata.security_notes)).toBe(true);
      expect(Array.isArray(metadata.stellar_best_practices)).toBe(true);
      expect((metadata.security_notes as string[]).length).toBeGreaterThan(0);
      expect((metadata.stellar_best_practices as string[]).length).toBeGreaterThan(0);
    });

    it("exports all expected tools", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("get_account_balance");
      expect(toolNames).toContain("submit_transaction");
      expect(toolNames).toContain("simulate_transaction");
      expect(toolNames).toContain("fetch_contract_spec");
      expect(toolNames).toContain("compute_vesting_schedule");
      expect(toolNames).toContain("deploy_contract");
      expect(toolNames).toContain("export_ai_schemas");
    });

    it("includes complete input schemas for each tool", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        const schema = tool.inputSchema as Record<string, unknown>;
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
      }
    });

    it("includes tool categories", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;
      const validCategories = ["query", "transaction", "contract", "utility"];

      for (const tool of tools) {
        expect(validCategories).toContain(tool.category);
      }
    });

    it("includes warnings for dangerous operations", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      const submitTx = tools.find((t) => t.name === "submit_transaction");
      expect(submitTx?.warnings).toBeDefined();
      expect(Array.isArray(submitTx?.warnings)).toBe(true);
      expect((submitTx?.warnings as string[]).length).toBeGreaterThan(0);
    });
  });

  describe("Markdown schema structure", () => {
    it("includes document header and overview", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;
      expect(markdown).toContain("# Pulsar Tool Schemas");
      expect(markdown).toContain("**Version:** 1.0.0");
      expect(markdown).toContain("## Overview");
    });

    it("includes security and best practices sections", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;
      expect(markdown).toContain("## Security & Best Practices");
      expect(markdown).toContain("### Security");
      expect(markdown).toContain("### Stellar Best Practices");
    });

    it("includes all tools with descriptions", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;
      expect(markdown).toContain("### get_account_balance");
      expect(markdown).toContain("### submit_transaction");
      expect(markdown).toContain("### simulate_transaction");
      expect(markdown).toContain("### fetch_contract_spec");
      expect(markdown).toContain("### compute_vesting_schedule");
      expect(markdown).toContain("### deploy_contract");
      expect(markdown).toContain("### export_ai_schemas");
    });

    it("includes JSON code blocks for schemas", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;
      const jsonBlockCount = (markdown.match(/```json/g) || []).length;

      // Each tool should have at least an input schema (more if it has output and examples)
      expect(jsonBlockCount).toBeGreaterThanOrEqual(7);
    });

    it("includes warnings for dangerous operations in Markdown", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;
      expect(markdown).toContain("⚠️");
      expect(markdown).toContain("IRREVERSIBLE");
    });
  });

  describe("OpenAPI schema structure", () => {
    it("includes OpenAPI 3.0.0 metadata", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const data = result.data as Record<string, unknown>;
      expect(data.openapi).toBe("3.0.0");
      expect(data.info).toBeDefined();

      const info = data.info as Record<string, unknown>;
      expect(info.title).toBe("Pulsar MCP API");
      expect(info.version).toBe("1.0.0");
    });

    it("includes servers definition", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const data = result.data as Record<string, unknown>;
      expect(Array.isArray(data.servers)).toBe(true);
      expect((data.servers as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    });

    it("includes paths for all tools", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const data = result.data as Record<string, unknown>;
      const paths = data.paths as Record<string, unknown>;

      expect(paths["/tools/get_account_balance"]).toBeDefined();
      expect(paths["/tools/submit_transaction"]).toBeDefined();
      expect(paths["/tools/export_ai_schemas"]).toBeDefined();
    });

    it("includes components with schema definitions", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const data = result.data as Record<string, unknown>;
      expect(data.components).toBeDefined();

      const components = data.components as Record<string, unknown>;
      expect(components.schemas).toBeDefined();

      const schemas = components.schemas as Record<string, unknown>;
      expect(schemas.StellarAccountId).toBeDefined();
      expect(schemas.SorobanContractId).toBeDefined();
      expect(schemas.Network).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("throws validation error for invalid format", async () => {
      try {
        // @ts-ignore - intentionally passing invalid format
        await exportAiSchemas({ format: "invalid" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(PulsarValidationError);
      }
    });

    it("throws validation error for invalid network", async () => {
      try {
        // @ts-ignore - intentionally passing invalid network
        await exportAiSchemas({ network: "invalidnet" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(PulsarValidationError);
      }
    });

    it("accepts valid inputs without throwing", async () => {
      const validInputs = [
        { format: "json" as const },
        { format: "markdown" as const },
        { format: "openapi" as const },
        { format: "json" as const, include_examples: true },
        { format: "json" as const, include_examples: false },
        { format: "json" as const, network: "mainnet" as const },
      ];

      for (const input of validInputs) {
        const result = await exportAiSchemas(input);
        expect(result).toBeDefined();
        expect(result.format).toBeDefined();
      }
    });
  });

  describe("schema metadata", () => {
    it("returns correct schema count", async () => {
      const result = await exportAiSchemas({ format: "json" });

      expect(result.schema_count).toBe(7); // 6 existing tools + 1 export_ai_schemas
    });

    it("returns include_examples flag in response", async () => {
      const result1 = await exportAiSchemas({
        format: "json",
        include_examples: true,
      });
      expect(result1.include_examples).toBe(true);

      const result2 = await exportAiSchemas({
        format: "json",
        include_examples: false,
      });
      expect(result2.include_examples).toBe(false);
    });

    it("returns correct format in response", async () => {
      const formats = ["json", "markdown", "openapi"] as const;

      for (const format of formats) {
        const result = await exportAiSchemas({ format });
        expect(result.format).toBe(format);
      }
    });
  });

  describe("tool-specific details", () => {
    it("includes warnings for submit_transaction", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;
      const submitTx = tools.find((t) => t.name === "submit_transaction");

      expect(submitTx?.warnings).toBeDefined();
      const warnings = submitTx?.warnings as string[];
      expect(warnings.some((w) => w.includes("IRREVERSIBLE"))).toBe(true);
    });

    it("includes complete input schemas with examples", async () => {
      const result = await exportAiSchemas({
        format: "json",
        include_examples: true,
      });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
      }
    });

    it("categories all tools correctly", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      const queryTools = tools.filter((t) => t.category === "query");
      const txTools = tools.filter((t) => t.category === "transaction");
      const contractTools = tools.filter((t) => t.category === "contract");
      const utilityTools = tools.filter((t) => t.category === "utility");

      expect(queryTools.length).toBeGreaterThan(0);
      expect(txTools.length).toBeGreaterThan(0);
      expect(contractTools.length).toBeGreaterThan(0);
      expect(utilityTools.length).toBeGreaterThan(0);
    });
  });
});

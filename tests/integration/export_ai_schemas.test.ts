import { describe, it, expect } from "vitest";
import { exportAiSchemas } from "../../src/tools/export_ai_schemas.js";

/**
 * Integration tests for export_ai_schemas tool
 *
 * These tests verify that the tool works correctly in realistic scenarios,
 * including validation of exported data formats and consistency with tool definitions.
 */

describe("exportAiSchemas (integration)", () => {
  describe("JSON export completeness", () => {
    it("exports consistent data across multiple calls", async () => {
      const result1 = await exportAiSchemas({ format: "json" });
      const result2 = await exportAiSchemas({ format: "json" });

      const data1 = result1.data as Record<string, unknown>;
      const data2 = result2.data as Record<string, unknown>;

      // Same number of tools
      const tools1 = data1.tools as Array<Record<string, unknown>>;
      const tools2 = data2.tools as Array<Record<string, unknown>>;
      expect(tools1.length).toBe(tools2.length);

      // Same tool names in same order
      const names1 = tools1.map((t) => t.name);
      const names2 = tools2.map((t) => t.name);
      expect(names1).toEqual(names2);
    });

    it("exports valid JSON that can be parsed and re-serialized", async () => {
      const result = await exportAiSchemas({ format: "json" });

      // Should be able to stringify and parse without errors
      const jsonString = JSON.stringify(result.data);
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const reparsed = JSON.parse(jsonString);
      expect(reparsed).toEqual(result.data);
    });

    it("exports schemas with all tools having consistent structure", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      // Each tool should have required fields
      for (const tool of tools) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("category");
        expect(tool).toHaveProperty("inputSchema");

        // Input schema should be a valid JSON schema
        const schema = tool.inputSchema as Record<string, unknown>;
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
      }
    });

    it("exports properly formatted examples", async () => {
      const result = await exportAiSchemas({
        format: "json",
        include_examples: true,
      });

      const data = result.data as Record<string, unknown>;
      const tools = data.tools as Array<Record<string, unknown>>;

      const toolsWithExamples = tools.filter((t) => t.examples !== undefined);

      for (const tool of toolsWithExamples) {
        const examples = tool.examples as Record<string, unknown>;
        expect(examples).toHaveProperty("input");
        expect(examples).toHaveProperty("output");

        const input = examples.input as Record<string, unknown>;
        const output = examples.output as Record<string, unknown>;

        // Input and output should be objects
        expect(typeof input).toBe("object");
        expect(typeof output).toBe("object");
        expect(input).not.toBeNull();
        expect(output).not.toBeNull();
      }
    });
  });

  describe("Markdown export quality", () => {
    it("exports valid Markdown with proper structure", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;

      // Check for markdown-specific elements
      expect(markdown).toContain("#");
      expect(markdown).toContain("##");
      expect(markdown).toContain("###");
      expect(markdown).toContain("`");
      expect(markdown).toContain("```");

      // Should have proper list formatting
      expect(markdown).toMatch(/^-\s+/m);
    });

    it("exports Markdown with all tool sections", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;

      // Each tool should have a section
      const tools = [
        "get_account_balance",
        "submit_transaction",
        "simulate_transaction",
        "fetch_contract_spec",
        "compute_vesting_schedule",
        "deploy_contract",
        "export_ai_schemas",
      ];

      for (const tool of tools) {
        expect(markdown).toContain(`### ${tool}`);
      }
    });

    it("exports Markdown with JSON code blocks for each schema", async () => {
      const result = await exportAiSchemas({
        format: "markdown",
        include_examples: true,
      });

      const markdown = result.data as string;

      // Should have JSON code blocks
      const jsonBlocks = markdown.split("```json").length - 1;
      expect(jsonBlocks).toBeGreaterThan(0);

      // Each code block should have closing backticks
      const jsonBlocksWithClosing = markdown.split("```json").length - 1;
      const closingBlocks = markdown.split("```").length - 1;
      expect(closingBlocks).toBeGreaterThanOrEqual(jsonBlocksWithClosing * 2);
    });

    it("exports Markdown that is valid for common Markdown processors", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;

      // Should not have unmatched code fence backticks
      const backtickCount = (markdown.match(/```/g) || []).length;
      expect(backtickCount % 2).toBe(0);

      // Should have balanced brackets in links
      const openBrackets = (markdown.match(/\[/g) || []).length;
      const closeBrackets = (markdown.match(/\]/g) || []).length;
      expect(openBrackets).toBe(closeBrackets);
    });
  });

  describe("OpenAPI export validity", () => {
    it("exports valid OpenAPI 3.0.0 specification", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const spec = result.data as Record<string, unknown>;

      // Required fields
      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info).toBeDefined();
      expect(spec.paths).toBeDefined();

      // Info object requirements
      const info = spec.info as Record<string, unknown>;
      expect(info.title).toBeDefined();
      expect(info.version).toBeDefined();
    });

    it("exports OpenAPI with valid path objects", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const spec = result.data as Record<string, unknown>;
      const paths = spec.paths as Record<string, Record<string, unknown>>;

      for (const path in paths) {
        const pathItem = paths[path];

        // Should have at least one operation (post)
        expect(Object.keys(pathItem).length).toBeGreaterThan(0);

        // Check post operation exists
        expect(pathItem.post).toBeDefined();

        const post = pathItem.post as Record<string, unknown>;
        expect(post.summary).toBeDefined();
        expect(post.description).toBeDefined();
        expect(post.requestBody).toBeDefined();
        expect(post.responses).toBeDefined();
      }
    });

    it("exports OpenAPI that can be validated with spec rules", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const spec = result.data as Record<string, unknown>;

      // Check OpenAPI structure
      expect(spec).toHaveProperty("openapi");
      expect(spec).toHaveProperty("info");
      expect(spec).toHaveProperty("paths");

      // Validate info object
      const info = spec.info as Record<string, unknown>;
      expect(typeof info.title).toBe("string");
      expect(typeof info.version).toBe("string");

      // Validate paths
      const paths = spec.paths as Record<string, unknown>;
      expect(Object.keys(paths).length).toBeGreaterThan(0);

      // Each path should start with /
      for (const path of Object.keys(paths)) {
        expect(path).toMatch(/^\//);
      }
    });
  });

  describe("real-world usage scenarios", () => {
    it("can be used to generate AI system prompts", async () => {
      const result = await exportAiSchemas({
        format: "markdown",
        include_examples: true,
      });

      const markdown = result.data as string;

      // Should have enough content for an AI system prompt
      expect(markdown.length).toBeGreaterThan(1000);

      // Should include all necessary tool information
      expect(markdown).toContain("tool");
      expect(markdown).toContain("input");
      expect(markdown).toContain("output");
      expect(markdown).toContain("example");
    });

    it("can be used for API documentation generation", async () => {
      const result = await exportAiSchemas({ format: "openapi" });

      const spec = result.data as Record<string, unknown>;

      // Should be complete enough for Swagger/ReDoc rendering
      expect(spec).toHaveProperty("openapi");
      expect(spec).toHaveProperty("info");
      expect(spec).toHaveProperty("paths");
      expect(spec).toHaveProperty("servers");
      expect(spec).toHaveProperty("components");
    });

    it("can be used for model fine-tuning with consistent format", async () => {
      const results = [
        await exportAiSchemas({ format: "json", include_examples: true }),
        await exportAiSchemas({ format: "json", include_examples: true }),
        await exportAiSchemas({ format: "json", include_examples: true }),
      ];

      // All exports should be identical for training consistency
      const data1 = JSON.stringify(results[0].data);
      const data2 = JSON.stringify(results[1].data);
      const data3 = JSON.stringify(results[2].data);

      expect(data1).toBe(data2);
      expect(data2).toBe(data3);
    });
  });

  describe("security and privacy", () => {
    it("does not expose secret keys in exported schemas", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const jsonString = JSON.stringify(result);

      // Should not contain common secret key patterns
      expect(jsonString).not.toMatch(/SECRET_KEY/i);
      expect(jsonString).not.toMatch(/PRIVATE_KEY/i);
      expect(jsonString).not.toMatch(/password/i);

      // Should not contain actual Stellar secret keys (S...)
      expect(jsonString).not.toMatch(/S[A-Z2-7]{54}/);
    });

    it("includes security warnings in exported documentation", async () => {
      const result = await exportAiSchemas({ format: "markdown" });

      const markdown = result.data as string;

      expect(markdown).toContain("security");
      expect(markdown).toContain("Secret");
      expect(markdown).toContain("never");
      expect(markdown).toContain("IRREVERSIBLE");
    });

    it("includes Stellar best practices in documentation", async () => {
      const result = await exportAiSchemas({ format: "json" });

      const data = result.data as Record<string, unknown>;
      const metadata = data.metadata as Record<string, unknown>;
      const practices = metadata.stellar_best_practices as string[];

      expect(practices.length).toBeGreaterThan(0);
      expect(practices.some((p) => p.includes("simulate"))).toBe(true);
      expect(practices.some((p) => p.includes("testnet"))).toBe(true);
    });
  });

  describe("format equivalence", () => {
    it("exports same tool count in all formats", async () => {
      const json = await exportAiSchemas({ format: "json" });
      const markdown = await exportAiSchemas({ format: "markdown" });
      const openapi = await exportAiSchemas({ format: "openapi" });

      // JSON format
      const jsonData = json.data as Record<string, unknown>;
      const jsonTools = (jsonData.tools as Array<unknown>).length;

      // Markdown should mention all tools
      const markdown_str = markdown.data as string;
      const toolNames = [
        "get_account_balance",
        "submit_transaction",
        "simulate_transaction",
        "fetch_contract_spec",
        "compute_vesting_schedule",
        "deploy_contract",
        "export_ai_schemas",
      ];
      let markdownToolCount = 0;
      for (const name of toolNames) {
        if (markdown_str.includes(`### ${name}`)) {
          markdownToolCount++;
        }
      }

      // OpenAPI format
      const openapi_data = openapi.data as Record<string, unknown>;
      const openapi_paths = Object.keys(
        (openapi_data.paths as Record<string, unknown>) || {}
      );

      expect(jsonTools).toBe(7);
      expect(markdownToolCount).toBe(7);
      expect(openapi_paths.length).toBe(7);
    });

    it("exports consistent descriptions across formats", async () => {
      const json = await exportAiSchemas({ format: "json" });
      const markdown = await exportAiSchemas({ format: "markdown" });

      const jsonData = json.data as Record<string, unknown>;
      const jsonTools = jsonData.tools as Array<Record<string, unknown>>;
      const getAccountBalanceTool = jsonTools.find(
        (t) => t.name === "get_account_balance"
      );

      const description = getAccountBalanceTool?.description as string;
      const markdown_str = markdown.data as string;

      // Markdown should contain key parts of the description
      expect(markdown_str).toContain("Get the current XLM");
    });
  });

  describe("edge cases", () => {
    it("handles empty network parameter gracefully", async () => {
      const result = await exportAiSchemas({
        format: "json",
        network: undefined,
      });

      expect(result).toBeDefined();
      expect(result.format).toBe("json");
    });

    it("handles all valid network values", async () => {
      const networks = ["mainnet", "testnet", "futurenet", "custom"] as const;

      for (const network of networks) {
        const result = await exportAiSchemas({ format: "json", network });
        expect(result).toBeDefined();
        expect(result.format).toBe("json");
      }
    });

    it("consistently exports large JSON without truncation", async () => {
      const result = await exportAiSchemas({
        format: "json",
        include_examples: true,
      });

      const jsonString = JSON.stringify(result.data);

      // Should be substantial in size (> 10KB for comprehensive schemas)
      expect(jsonString.length).toBeGreaterThan(10000);

      // Should be valid and complete
      expect(() => JSON.parse(jsonString)).not.toThrow();

      const parsed = JSON.parse(jsonString);
      expect((parsed.tools as Array<unknown>).length).toBe(7);
    });
  });

  describe("performance characteristics", () => {
    it("completes export in reasonable time", async () => {
      const start = performance.now();
      await exportAiSchemas({ format: "json" });
      const duration = performance.now() - start;

      // Should complete in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it("handles multiple rapid calls efficiently", async () => {
      const start = performance.now();

      const promises = Array(10)
        .fill(null)
        .map(() => exportAiSchemas({ format: "json" }));

      await Promise.all(promises);
      const duration = performance.now() - start;

      // 10 calls should complete in less than 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});

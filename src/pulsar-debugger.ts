/* eslint-disable no-console */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { TOOL_REGISTRY, ToolDefinition } from './registry.js';
import { PulsarError } from './errors.js';

/**
 * PulsarDebugger provides an interactive CLI to test MCP tools.
 * It adheres to the DRY principle by reusing the same TOOL_REGISTRY
 * used by the MCP server.
 */
export class PulsarDebugger {
  private rl: readline.Interface;
  private isActive = true;

  constructor() {
    this.rl = readline.createInterface({ input, output });
  }

  /**
   * Starts the interactive loop.
   */
  async start() {
    console.log('\n🚀 Pulsar Interactive Debugger');
    console.log('Use this mode to test tools individually with mock data.');
    console.log('Type "exit" or "quit" to stop.\n');

    while (this.isActive) {
      this.displayMenu();
      const choice = await this.rl.question('\nSelect a tool (number or name): ');

      if (['exit', 'quit'].includes(choice.toLowerCase().trim())) {
        this.isActive = false;
        break;
      }

      const tool = this.findTool(choice.trim());
      if (!tool) {
        console.log('\n❌ Invalid selection. Please try again.');
        continue;
      }

      try {
        await this.runTool(tool);
      } catch (error) {
        console.error('\n❌ Unexpected error during tool execution:', error);
      }
    }

    this.rl.close();
    console.log('\nGoodbye! 👋');
  }

  private displayMenu() {
    console.log('--- Available Tools ---');
    TOOL_REGISTRY.forEach((tool, index) => {
      const shortDesc = tool.description.split('\n')[0];
      console.log(`${(index + 1).toString().padStart(2)}. ${tool.name.padEnd(25)} | ${shortDesc}`);
    });
  }

  private findTool(choice: string): ToolDefinition | undefined {
    const index = parseInt(choice, 10) - 1;
    if (!isNaN(index) && index >= 0 && index < TOOL_REGISTRY.length) {
      return TOOL_REGISTRY[index];
    }
    return TOOL_REGISTRY.find((t) => t.name === choice);
  }

  private async runTool(tool: ToolDefinition) {
    console.log(`\n>>> Debugging: ${tool.name}`);
    console.log(`Description: ${tool.description}`);
    console.log('Enter parameters below (leave empty for default/null):\n');

    const args: Record<string, unknown> = {};
    const properties = (tool.inputSchema.properties as Record<string, unknown>) || {};
    const required = (tool.inputSchema.required as string[]) || [];

    for (const [key, prop] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      const description = (prop as Record<string, unknown>).description || '';
      const defaultValue = (prop as Record<string, unknown>).default;
      const type = (prop as Record<string, unknown>).type as string;

      let prompt = `  ${key} (${type})`;
      if (description) prompt += `: ${description}`;
      if (defaultValue !== undefined) prompt += ` [default: ${defaultValue}]`;
      if (isRequired) prompt += ' *required*';
      prompt += '\n  > ';

      const value = await this.rl.question(prompt);
      const trimmedValue = value.trim();

      if (trimmedValue === '') {
        if (defaultValue !== undefined) {
          args[key] = defaultValue;
        } else if (isRequired) {
          console.log(`  ⚠️  Field "${key}" is required. Continuing anyway...`);
        }
      } else {
        args[key] = this.coerceValue(trimmedValue, type);
      }
    }

    console.log('\n⚙️  Executing implementation...');
    try {
      const startTime = Date.now();
      const result = await tool.handler(args);
      const duration = Date.now() - startTime;

      console.log('\n✅ Success!');
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log('\nResult:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('\n❌ Tool Execution Failed');
      if (error instanceof PulsarError) {
        console.log(`  Code: ${error.code}`);
        console.log(`  Message: ${error.message}`);
        if (error.details) {
          console.log('  Details:', JSON.stringify(error.details, null, 2));
        }
      } else {
        console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log('\n' + '='.repeat(50) + '\n');
  }

  private coerceValue(value: string, type: string): unknown {
    switch (type) {
      case 'number':
      case 'integer':
        return Number(value);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      case 'array':
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          console.log(`  ⚠️  Warning: Failed to parse ${type} as JSON. Passing as raw string.`);
          return value;
        }
      default:
        return value;
    }
  }
}

import { z } from 'zod';

import { ContractIdSchema, NetworkSchema } from '../schemas/index.js';
import { PulsarValidationError } from '../errors.js';

import { fetchContractSpec } from './fetch_contract_spec.js';
import type {
  ContractFunction,
  ContractEvent,
  FetchContractSpecOutput,
} from './fetch_contract_spec.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const GenerateContractClientInputSchema = z.object({
  contract_id: ContractIdSchema.optional().describe(
    'Soroban contract ID (C...). Provide this OR contract_spec.'
  ),
  contract_spec: z
    .object({
      contract_id: z.string(),
      network: z.string(),
      functions: z.array(
        z.object({
          name: z.string(),
          doc: z.string().optional(),
          inputs: z.array(z.object({ name: z.string(), type: z.string() })),
          outputs: z.array(z.object({ type: z.string() })),
        })
      ),
      events: z.array(
        z.object({
          name: z.string(),
          topics: z.array(z.object({ type: z.string() })).optional(),
          data: z.object({ type: z.string() }).optional(),
        })
      ),
      raw_xdr: z.string(),
    })
    .optional()
    .describe('Pre-fetched contract spec. Provide this OR contract_id.'),
  network: NetworkSchema.optional().describe('Network to use when fetching spec via contract_id.'),
  class_name: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, {
      message: 'class_name must be a valid identifier',
    })
    .optional()
    .describe('Override the generated class name (default: derived from contract_id).'),
});

export type GenerateContractClientInput = z.infer<typeof GenerateContractClientInputSchema>;

export interface GenerateContractClientOutput {
  contract_id: string;
  network: string;
  class_name: string;
  client_ts: string;
}

// ---------------------------------------------------------------------------
// Soroban → TypeScript type mapping
// ---------------------------------------------------------------------------

const SOROBAN_TO_TS: Record<string, string> = {
  Address: 'string',
  bool: 'boolean',
  u32: 'number',
  i32: 'number',
  u64: 'bigint',
  i64: 'bigint',
  u128: 'bigint',
  i128: 'bigint',
  u256: 'bigint',
  i256: 'bigint',
  String: 'string',
  Symbol: 'string',
  Bytes: 'Buffer',
  BytesN: 'Buffer',
  void: 'void',
};

function sorobanToTs(sorobanType: string): string {
  if (sorobanType in SOROBAN_TO_TS) return SOROBAN_TO_TS[sorobanType];
  // Option<T> → T | null
  const optMatch = sorobanType.match(/^Option<(.+)>$/);
  if (optMatch) return `${sorobanToTs(optMatch[1])} | null`;
  // Vec<T> → T[]
  const vecMatch = sorobanType.match(/^Vec<(.+)>$/);
  if (vecMatch) return `${sorobanToTs(vecMatch[1])}[]`;
  // Map<K,V> → Map<K, V>
  const mapMatch = sorobanType.match(/^Map<(.+),\s*(.+)>$/);
  if (mapMatch) return `Map<${sorobanToTs(mapMatch[1])}, ${sorobanToTs(mapMatch[2])}>`;
  // Tuple<...> → [...]
  const tupleMatch = sorobanType.match(/^Tuple<(.+)>$/);
  if (tupleMatch) {
    const parts = tupleMatch[1].split(',').map((t) => sorobanToTs(t.trim()));
    return `[${parts.join(', ')}]`;
  }
  // Unknown / custom struct — use unknown
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

function deriveClassName(contractId: string, override?: string): string {
  if (override) return override;
  // Use last 4 chars of contract ID as a short disambiguator
  return `Contract${contractId.slice(-4).toUpperCase()}Client`;
}

function renderJsDoc(fn: ContractFunction): string {
  if (!fn.doc) return '';
  return `  /**\n   * ${fn.doc}\n   */\n`;
}

function renderParams(inputs: ContractFunction['inputs']): string {
  return inputs.map((p) => `${p.name}: ${sorobanToTs(p.type)}`).join(', ');
}

function renderReturnType(outputs: ContractFunction['outputs']): string {
  if (outputs.length === 0) return 'void';
  if (outputs.length === 1) return sorobanToTs(outputs[0].type);
  return `[${outputs.map((o) => sorobanToTs(o.type)).join(', ')}]`;
}

function renderScValConversion(name: string, type: string): string {
  const ts = sorobanToTs(type);
  switch (ts) {
    case 'string':
      return type === 'Address'
        ? `nativeToScVal(${name}, { type: "address" })`
        : `nativeToScVal(${name}, { type: "string" })`;
    case 'boolean':
      return `nativeToScVal(${name}, { type: "bool" })`;
    case 'number':
      return `nativeToScVal(${name}, { type: "${type.toLowerCase()}" })`;
    case 'bigint':
      return `nativeToScVal(${name}, { type: "${type.toLowerCase()}" })`;
    case 'Buffer':
      return `nativeToScVal(${name}, { type: "bytes" })`;
    default:
      return `nativeToScVal(${name})`;
  }
}

function renderMethod(fn: ContractFunction): string {
  const params = renderParams(fn.inputs);
  const returnType = renderReturnType(fn.outputs);
  const scValArgs = fn.inputs
    .map((p) => `      ${renderScValConversion(p.name, p.type)},`)
    .join('\n');

  const hasReturn = returnType !== 'void';

  return (
    `${renderJsDoc(fn)}` +
    `  async ${fn.name}(${params}): Promise<${returnType}> {\n` +
    `    const result = await this.server.simulateTransaction(\n` +
    `      new TransactionBuilder(await this.server.getAccount(this.sourceAccount), {\n` +
    `        fee: BASE_FEE,\n` +
    `        networkPassphrase: this.networkPassphrase,\n` +
    `      })\n` +
    `        .addOperation(\n` +
    `          Operation.invokeContractFunction({\n` +
    `            contract: this.contractId,\n` +
    `            function: "${fn.name}",\n` +
    `            args: [\n` +
    `${scValArgs}\n` +
    `            ],\n` +
    `          })\n` +
    `        )\n` +
    `        .setTimeout(30)\n` +
    `        .build()\n` +
    `    );\n` +
    `    if (!SorobanRpc.Api.isSimulationSuccess(result)) {\n` +
    `      throw new Error(\`Contract call failed: \${(result as SorobanRpc.Api.SimulateTransactionErrorResponse).error}\`);\n` +
    `    }\n` +
    (hasReturn
      ? `    return scValToNative(result.result!.retval) as ${returnType};\n`
      : `    // void return — no value to extract\n`) +
    `  }\n`
  );
}

function renderEventType(event: ContractEvent): string {
  const topicTypes = (event.topics ?? []).map((t) => sorobanToTs(t.type)).join(', ');
  const dataType = event.data ? sorobanToTs(event.data.type) : 'void';
  return (
    `export interface ${pascalCase(event.name)}Event {\n` +
    `  topics: [${topicTypes}];\n` +
    `  data: ${dataType};\n` +
    `}\n`
  );
}

function pascalCase(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

function generateClient(spec: FetchContractSpecOutput, className: string): string {
  const eventInterfaces = spec.events.map(renderEventType).join('\n');
  const methods = spec.functions.map(renderMethod).join('\n');

  return [
    `// Auto-generated by pulsar generate_contract_client`,
    `// Contract: ${spec.contract_id}`,
    `// Network:  ${spec.network}`,
    `// DO NOT EDIT — regenerate with the generate_contract_client tool`,
    ``,
    `import {`,
    `  SorobanRpc,`,
    `  TransactionBuilder,`,
    `  Operation,`,
    `  BASE_FEE,`,
    `  Networks,`,
    `  nativeToScVal,`,
    `  scValToNative,`,
    `} from "@stellar/stellar-sdk";`,
    ``,
    `// ── Event types ──────────────────────────────────────────────────────────────`,
    eventInterfaces,
    `// ── Client ───────────────────────────────────────────────────────────────────`,
    `export class ${className} {`,
    `  private server: SorobanRpc.Server;`,
    `  private networkPassphrase: string;`,
    ``,
    `  constructor(`,
    `    private readonly contractId: string,`,
    `    private readonly sourceAccount: string,`,
    `    network: "mainnet" | "testnet" | "futurenet" = "testnet",`,
    `    rpcUrl?: string`,
    `  ) {`,
    `    const defaults: Record<string, string> = {`,
    `      mainnet: "https://soroban-rpc.stellar.org",`,
    `      testnet: "https://soroban-testnet.stellar.org",`,
    `      futurenet: "https://rpc-futurenet.stellar.org",`,
    `    };`,
    `    this.server = new SorobanRpc.Server(rpcUrl ?? defaults[network], { allowHttp: false });`,
    `    this.networkPassphrase =`,
    `      network === "mainnet" ? Networks.PUBLIC`,
    `      : network === "futurenet" ? Networks.FUTURENET`,
    `      : Networks.TESTNET;`,
    `  }`,
    ``,
    methods,
    `}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function generateContractClient(
  input: GenerateContractClientInput
): Promise<GenerateContractClientOutput> {
  const parsed = GenerateContractClientInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError(
      'Invalid input for generate_contract_client',
      parsed.error.format()
    );
  }

  const data = parsed.data;

  if (!data.contract_id && !data.contract_spec) {
    throw new PulsarValidationError(
      'Provide either contract_id (to fetch the spec) or contract_spec (pre-fetched).'
    );
  }

  let spec: FetchContractSpecOutput;

  if (data.contract_spec) {
    spec = data.contract_spec as FetchContractSpecOutput;
  } else {
    // Fetch spec from the network
    spec = await fetchContractSpec({
      contract_id: data.contract_id!,
      network: data.network,
    });
  }

  const className = deriveClassName(spec.contract_id, data.class_name);
  const clientTs = generateClient(spec, className);

  return {
    contract_id: spec.contract_id,
    network: spec.network,
    class_name: className,
    client_ts: clientTs,
  };
}

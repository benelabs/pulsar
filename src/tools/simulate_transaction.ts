import { TransactionBuilder, Networks, SorobanRpc, scValToNative } from '@stellar/stellar-sdk';
import { TransactionBuilder, Networks, SorobanRpc } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import { SimulateTransactionInput } from '../schemas/tools.js';

export interface SimulateTransactionOutput {
  status: string;
  return_value?: string;
  return_value_native?: unknown;
  cost: {
    cpu_instructions: string;
    memory_bytes: string;
  };
  footprint: {
    read_only: string[];
    read_write: string[];
  };
  min_resource_fee: string;
  events: string[];
  error?: string;
  restore_needed?: boolean;
}

/**
 * Helper to resolve the stellar-base network passphrase.
 */
function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}

export async function simulateTransaction(
  input: SimulateTransactionInput
): Promise<SimulateTransactionOutput> {
  const network = input.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);
  const server = getSorobanServer(network);

  let tx;
  try {
    tx = TransactionBuilder.fromXDR(input.xdr, networkPassphrase);
  } catch (err) {
    throw new Error(`Failed to parse XDR: ${(err as Error).message}`);
  }

  const result = await server.simulateTransaction(tx);

  const output: SimulateTransactionOutput = {
    status: '',
    cost: {
      cpu_instructions: '0',
      memory_bytes: '0',
    },
    footprint: {
      read_only: [],
      read_write: [],
    },
    min_resource_fee: '0',
    events: [],
  };

  if (SorobanRpc.Api.isSimulationSuccess(result)) {
    output.status = 'SUCCESS';

    // Narrowed types might still be tricky depending on SDK version
    const successRes = result as SorobanRpc.Api.SimulateTransactionSuccessResponse;

    output.cost.cpu_instructions = successRes.cost?.cpuInsns || '0';
    const successRes = result as any;
    // type assertion for SDK response
    const successRes = result as {
      cost?: { cpuIns?: string; memBytes?: string };
      minResourceFee?: string;
      result?: { retval?: { toXDR: (format: string) => string } };
      transactionData?: {
        build: () => {
          resources: () => {
            footprint: () => {
              readOnly: () => Array<{ toXDR: (format: string) => string }>;
              readWrite: () => Array<{ toXDR: (format: string) => string }>;
            };
          };
        };
      };
      events?: Array<{ toXDR: (format: string) => string }>;
    };

    output.cost.cpu_instructions = successRes.cost?.cpuIns || '0';
    output.cost.memory_bytes = successRes.cost?.memBytes || '0';
    output.min_resource_fee = successRes.minResourceFee || '0';

    if (successRes.result && successRes.result.retval) {
      output.return_value = successRes.result.retval.toXDR('base64');
      try {
        // Skip scValToNative conversion due to SDK type issues
        output.return_value_native = 'SCVal conversion skipped - use return_value for XDR format';
      } catch (e) {
        output.return_value_native = 'Failed to decode scVal: ' + (e as Error).message;
        const error = e as Error;
        output.return_value_native = 'Failed to decode scVal: ' + error.message;
      }
    }

    // Map footprint
    if (successRes.transactionData) {
      const resources = successRes.transactionData.build().resources();
      if (resources && resources.footprint()) {
        const footprint = resources.footprint();
        output.footprint.read_only = footprint.readOnly().map((e: any) => e.toXDR('base64'));
        output.footprint.read_write = footprint.readWrite().map((e: any) => e.toXDR('base64'));
        output.footprint.read_only = footprint.readOnly().map((e) => e.toXDR('base64'));
        output.footprint.read_write = footprint.readWrite().map((e) => e.toXDR('base64'));
      }
    }

    // Map events
    if (successRes.events) {
      output.events = successRes.events.map((e) => e.toXDR('base64'));
    }
  } else if (SorobanRpc.Api.isSimulationRestore(result)) {
      output.events = successRes.events.map((e: any) => e.toXDR('base64'));
    }
  } else if (
    (SorobanRpc.Api as any).isSimulationRestore &&
    (SorobanRpc.Api as any).isSimulationRestore(result)
      output.events = successRes.events.map((e) => e.toXDR('base64'));
    }
  } else if (
    (
      SorobanRpc.Api as unknown as { isSimulationRestore?: (result: unknown) => boolean }
    ).isSimulationRestore?.(result)
  ) {
    // Newer SDK versions use isSimulationRestore
    output.status = 'RESTORE_NEEDED';
    output.restore_needed = true;
    output.error =
      'The transaction cannot be simulated because it requires ledger entry restoration. Please submit a restore operation first.';
  } else if (
    (SorobanRpc.Api as any).isSimulationRestoreNeeded &&
    (SorobanRpc.Api as any).isSimulationRestoreNeeded(result)
    (
      SorobanRpc.Api as unknown as { isSimulationRestoreNeeded?: (result: unknown) => boolean }
    ).isSimulationRestoreNeeded?.(result)
  ) {
    output.status = 'RESTORE_NEEDED';
    output.restore_needed = true;
    output.error =
      'The transaction cannot be simulated because it requires ledger entry restoration. Please submit a restore operation first.';
  } else if (SorobanRpc.Api.isSimulationError(result)) {
    output.status = 'ERROR';
    const errorRes = result as SorobanRpc.Api.SimulateTransactionErrorResponse;
    output.error = errorRes.error;
    if (errorRes.events) {
    const errorRes = result as any;
    output.error = errorRes.error;
    if (errorRes.events) {
      output.events = errorRes.events.map((e: any) => e.toXDR('base64'));
    const errorRes = result as {
      error?: string;
      events?: Array<{ toXDR: (format: string) => string }>;
    };
    output.error = errorRes.error;
    if (errorRes.events) {
      output.events = errorRes.events.map((e) => e.toXDR('base64'));
    }
  }

  return output;
}

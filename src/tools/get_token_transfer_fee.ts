import {
  Address,
  Account,
  Contract,
  TransactionBuilder,
  Networks,
  SorobanRpc,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { getSorobanServer } from '../services/soroban-rpc.js';
import { GetTokenTransferFeeInput } from '../schemas/tools.js';

export interface TokenTransferFeeOutput {
  contract_id: string;
  from: string;
  to: string;
  requested_amount: string;
  actual_sent_amount?: string;
  actual_received_amount?: string;
  fee_amount: string;
  fee_bps: number;
  events: unknown[];
  status: string;
  error?: string;
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

/**
 * Tool: get_token_transfer_fee
 * Simulates a token transfer to detect any Fee-on-Transfer (FoT) logic.
 * It builds a transfer call, simulates it, and analyzes the emitted events.
 */
export async function getTokenTransferFee(
  input: GetTokenTransferFeeInput
): Promise<TokenTransferFeeOutput> {
  const network = input.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);
  const server = getSorobanServer(network);

  const contract = new Contract(input.contract_id);
  const amount = BigInt(input.amount);

  // Generic account for building the transaction if we can't load it
  const dummyAccount = new TransactionBuilder(
    new Account(
      input.from.startsWith('C')
        ? 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
        : input.from,
      '0'
    ),
    { networkPassphrase, fee: '100' }
  );

  const tx = dummyAccount
    .addOperation(
      contract.call(
        'transfer',
        Address.fromString(input.from).toScVal(),
        Address.fromString(input.to).toScVal(),
        nativeToScVal(amount, { type: 'i128' })
      )
    )
    .setTimeout(30)
    .build();

  // 2. Simulate the transaction
  const result = await server.simulateTransaction(tx);

  const output: TokenTransferFeeOutput = {
    contract_id: input.contract_id,
    from: input.from,
    to: input.to,
    requested_amount: input.amount,
    fee_amount: '0',
    fee_bps: 0,
    events: [],
    status: 'UNKNOWN',
  };

  if (SorobanRpc.Api.isSimulationSuccess(result)) {
    output.status = 'SUCCESS';

    // 3. Analyze events to find Transfer or Fee events
    if (result.events) {
      output.events = result.events.map((e) => {
        try {
          return {
            contractId: e.contractId(),
            topics: e.topic().map((t) => scValToNative(t)),
            value: scValToNative(e.value()),
          };
        } catch {
          return { raw: e.toXDR('base64') };
        }
      });

      // Find Transfer events from the contract
      const transferEvents = (
        output.events as { contractId: string; topics: unknown[]; value: unknown }[]
      ).filter((e) => e.contractId === input.contract_id && e.topics && e.topics[0] === 'Transfer');

      let totalReceived = 0n;

      for (const event of transferEvents) {
        const [, , toVal] = event.topics as [unknown, unknown, unknown];
        const val = BigInt(event.value as string);

        // Verify if it's the recipient receiving tokens
        if (
          toVal === input.to ||
          (typeof toVal === 'object' &&
            toVal !== null &&
            'address' in toVal &&
            toVal.address === input.to)
        ) {
          totalReceived += val;
        }
      }

      // If we found a specific Fee event
      const feeEvents = (
        output.events as { contractId: string; topics: unknown[]; value: unknown }[]
      ).filter(
        (e) =>
          e.contractId === input.contract_id &&
          e.topics &&
          (e.topics[0] === 'Fee' || e.topics[0] === 'fee')
      );

      let explicitFee = 0n;
      for (const event of feeEvents) {
        const val = BigInt(event.value as string);
        explicitFee += val;
      }

      output.actual_received_amount = totalReceived.toString();

      if (totalReceived > 0n) {
        if (totalReceived < amount) {
          const fee = amount - totalReceived;
          output.fee_amount = fee.toString();
          output.fee_bps = Math.round(Number((fee * 10000n) / amount));
        } else if (explicitFee > 0n) {
          output.fee_amount = explicitFee.toString();
          output.fee_bps = Math.round(
            Number((explicitFee * 10000n) / (totalReceived + explicitFee))
          );
        }
      } else if (explicitFee > 0n) {
        output.fee_amount = explicitFee.toString();
        output.fee_bps = Math.round(Number((explicitFee * 10000n) / amount));
      }
    }
  } else if (SorobanRpc.Api.isSimulationError(result)) {
    output.status = 'ERROR';
    output.error = result.error;
  }

  return output;
}

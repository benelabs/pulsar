import { TransactionBuilder, Operation, Networks } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { getHorizonServer } from '../services/horizon.js';
import { AccountMergeInputSchema } from '../schemas/tools.js';
import type { McpToolHandler } from '../types.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';

export interface AccountMergeOutput {
  source_account: string;
  destination_account: string;
  network: string;
  transaction_xdr: string;
}

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

export const accountMerge: McpToolHandler<typeof AccountMergeInputSchema> = async (
  input: unknown
) => {
  const validated = AccountMergeInputSchema.safeParse(input);
  if (!validated.success) {
    throw new PulsarValidationError('Invalid input for account_merge', validated.error.format());
  }

  const { source_account, destination_account, network } = validated.data;
  const networkName = network ?? config.stellarNetwork;

  if (source_account === destination_account) {
    throw new PulsarValidationError('source_account and destination_account must differ');
  }

  const horizonServer = getHorizonServer(networkName);
  let sourceAccount;

  try {
    sourceAccount = await horizonServer.loadAccount(source_account);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(
        `Source account ${source_account} not found. Fund the account before merging.`,
        { status: 404, account_id: source_account }
      );
    }
    throw new PulsarNetworkError(`Failed to load source account: ${err.message}`, {
      originalError: err,
    });
  }

  try {
    await horizonServer.loadAccount(destination_account);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(
        `Destination account ${destination_account} not found. The target account must exist before merging.`,
        { status: 404, account_id: destination_account }
      );
    }
    throw new PulsarNetworkError(`Failed to load destination account: ${err.message}`, {
      originalError: err,
    });
  }

  const networkPassphrase = resolveNetworkPassphrase(networkName);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase,
  })
    .addOperation(
      Operation.accountMerge({
        destination: destination_account,
      })
    )
    .setTimeout(30)
    .build();

  return {
    source_account,
    destination_account,
    network: networkName,
    transaction_xdr: tx.toXDR(),
  };
};

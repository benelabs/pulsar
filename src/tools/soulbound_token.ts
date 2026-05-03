import { randomUUID } from 'node:crypto';

import {
  TransactionBuilder,
  Operation,
  Address,
  Networks,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';

import { getHorizonServer } from '../services/horizon.js';
import { config } from '../config.js';
import { SoulboundTokenInputSchema } from '../schemas/tools.js';
import type { McpToolHandler } from '../types.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import logger from '../logger.js';

export interface SoulboundTokenOutput {
  action: 'mint' | 'revoke' | 'query';
  transaction_xdr?: string;
  contract_id: string;
  recipient?: string;
  token_id?: string;
  network: string;
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

/**
 * Tool: soulbound_token
 *
 * Builds unsigned Soroban transaction XDR for Soulbound Token (SBT) operations:
 *   - mint:   Issue a non-transferable token to a recipient address.
 *   - revoke: Revoke a previously issued token by token_id.
 *   - query:  Build a read-only invocation to check ownership (simulate to read result).
 *
 * SBTs are non-transferable by design; the contract must enforce this.
 * This tool only constructs the transaction — submit via submit_transaction after signing.
 */
export const soulboundToken: McpToolHandler<typeof SoulboundTokenInputSchema> = async (
  input: unknown
) => {
  const parsed = SoulboundTokenInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for soulbound_token', parsed.error.format());
  }

  const data = parsed.data;
  const network = data.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);

  logger.debug(
    { action: data.action, contract_id: data.contract_id, network },
    'soulbound_token invoked'
  );

  // query does not mutate state — no need to load account or build a full tx
  if (data.action === 'query') {
    if (!data.recipient) {
      throw new PulsarValidationError('recipient is required for query action');
    }
    // Build a simulate-ready invocation so the caller can pass it to simulate_transaction
    const horizonServer = getHorizonServer(network);
    let account;
    try {
      account = await horizonServer.loadAccount(data.source_account);
    } catch (err: any) {
      if (err.response?.status === 404) {
        throw new PulsarNetworkError(`Source account ${data.source_account} not found.`, {
          status: 404,
          account_id: data.source_account,
        });
      }
      throw new PulsarNetworkError(`Failed to load source account: ${err.message}`, {
        originalError: err,
      });
    }

    const args: xdr.ScVal[] = [
      nativeToScVal(new Address(data.recipient).toScVal(), { type: 'address' }),
    ];

    const op = Operation.invokeContractFunction({
      contract: data.contract_id,
      function: 'has_token',
      args,
    });

    const tx = new TransactionBuilder(account, {
      fee: (100_000).toString(),
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    return {
      action: 'query',
      transaction_xdr: tx.toXDR(),
      contract_id: data.contract_id,
      recipient: data.recipient,
      network,
    } satisfies SoulboundTokenOutput;
  }

  // mint and revoke require a source_account for sequence number
  const horizonServer = getHorizonServer(network);
  let account;
  try {
    account = await horizonServer.loadAccount(data.source_account);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(`Source account ${data.source_account} not found.`, {
        status: 404,
        account_id: data.source_account,
      });
    }
    throw new PulsarNetworkError(`Failed to load source account: ${err.message}`, {
      originalError: err,
    });
  }

  let args: xdr.ScVal[];
  let fnName: string;
  let tokenId: string | undefined;

  if (data.action === 'mint') {
    if (!data.recipient) {
      throw new PulsarValidationError('recipient is required for mint action');
    }
    if (!data.metadata) {
      throw new PulsarValidationError('metadata is required for mint action');
    }

    fnName = 'mint';
    tokenId = data.token_id ?? randomUUID().replace(/-/g, '');
    args = [
      nativeToScVal(new Address(data.recipient).toScVal(), { type: 'address' }),
      nativeToScVal(tokenId, { type: 'string' }),
      nativeToScVal(data.metadata, { type: 'string' }),
    ];

    logger.debug({ recipient: data.recipient, tokenId }, 'Building SBT mint');
  } else {
    // revoke
    if (!data.token_id) {
      throw new PulsarValidationError('token_id is required for revoke action');
    }

    fnName = 'revoke';
    tokenId = data.token_id;
    args = [nativeToScVal(tokenId, { type: 'string' })];

    logger.debug({ tokenId }, 'Building SBT revoke');
  }

  const op = Operation.invokeContractFunction({
    contract: data.contract_id,
    function: fnName,
    args,
  });

  const tx = new TransactionBuilder(account, {
    fee: (100_000).toString(),
    networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();

  return {
    action: data.action,
    transaction_xdr: tx.toXDR(),
    contract_id: data.contract_id,
    recipient: data.recipient,
    token_id: tokenId,
    network,
  } satisfies SoulboundTokenOutput;
};

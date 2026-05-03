import { Asset, Claimant, Operation, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { CreateClaimableBalanceInputSchema } from '../schemas/tools.js';
import { getHorizonServer } from '../services/horizon.js';
import { PulsarValidationError, PulsarNetworkError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

type ClaimPredicate =
  | { type: 'unconditional' }
  | { type: 'beforeAbsoluteTime'; timestamp: number }
  | { type: 'beforeRelativeTime'; seconds: number }
  | { type: 'not'; predicate: ClaimPredicate }
  | { type: 'and'; predicates: ClaimPredicate[] }
  | { type: 'or'; predicates: ClaimPredicate[] };

/**
 * Recursively builds a Stellar ClaimPredicate from a JSON structure.
 */
function buildPredicate(p: ClaimPredicate): any {
  switch (p.type) {
    case 'unconditional':
      return Claimant.predicateUnconditional();
    case 'beforeAbsoluteTime':
      return Claimant.predicateBeforeAbsoluteTime(p.timestamp.toString());
    case 'beforeRelativeTime':
      return Claimant.predicateBeforeRelativeTime(p.seconds.toString());
    case 'not':
      return Claimant.predicateNot(buildPredicate(p.predicate));
    case 'and':
      return Claimant.predicateAnd(...p.predicates.map(buildPredicate));
    case 'or':
      return Claimant.predicateOr(...p.predicates.map(buildPredicate));
    default:
      throw new Error(`Unknown predicate type: ${p.type}`);
  }
}

/**
 * Parses an asset string into a Stellar Asset object.
 * Format: "XLM" or "CODE:ISSUER"
 */
function parseAsset(assetStr: string): Asset {
  if (assetStr.toUpperCase() === 'XLM') {
    return Asset.native();
  }
  const parts = assetStr.split(':');
  if (parts.length !== 2) {
    throw new Error("Invalid asset format. Use 'XLM' or 'CODE:ISSUER'");
  }
  return new Asset(parts[0], parts[1]);
}

/**
 * Tool: create_claimable_balance
 * Builds a transaction to create a claimable balance with complex claimants.
 */
export const createClaimableBalance: McpToolHandler<
  typeof CreateClaimableBalanceInputSchema
> = async (input: unknown) => {
  const validatedInput = CreateClaimableBalanceInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for create_claimable_balance',
      validatedInput.error.format()
    );
  }

  const { asset, amount, claimants, source_account, network } = validatedInput.data;
  const activeNetwork = network ?? config.stellarNetwork;
  const server = getHorizonServer(activeNetwork);

  // 1. Resolve source account
  const sourcePublicKey =
    source_account ||
    (config.stellarSecretKey
      ? import('@stellar/stellar-sdk').then((sdk) =>
          sdk.Keypair.fromSecret(config.stellarSecretKey!).publicKey()
        )
      : undefined);

  if (!sourcePublicKey) {
    throw new PulsarValidationError(
      'source_account is required if no STELLAR_SECRET_KEY is configured.'
    );
  }

  const resolvedSourcePublicKey = await (typeof sourcePublicKey === 'string'
    ? Promise.resolve(sourcePublicKey)
    : sourcePublicKey);

  try {
    // 2. Fetch account details for sequence number
    const account = await server.loadAccount(resolvedSourcePublicKey);

    // 3. Map claimants
    const sdkClaimants = claimants.map(
      (c) => new Claimant(c.destination, buildPredicate(c.predicate))
    );

    // 4. Build operation
    const op = Operation.createClaimableBalance({
      asset: parseAsset(asset),
      amount,
      claimants: sdkClaimants,
    });

    // 5. Build transaction
    const networkPassphrase =
      activeNetwork === 'mainnet'
        ? Networks.PUBLIC
        : activeNetwork === 'futurenet'
          ? Networks.FUTURENET
          : Networks.TESTNET;

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(300)
      .build();

    return {
      transaction_xdr: tx.toXDR(),
      network: activeNetwork,
      source_account: resolvedSourcePublicKey,
    };
  } catch (err: unknown) {
    const error = err as Error;
    throw new PulsarNetworkError(
      error.message || 'Failed to build create_claimable_balance transaction',
      { originalError: err }
    );
  }
};

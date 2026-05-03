import {
  Asset,
  Account,
  TransactionBuilder,
  Operation,
  Networks,
} from "@stellar/stellar-sdk";

import { getHorizonServer } from "../services/horizon.js";
import { config } from "../config.js";
import { CreateTrustlineInputSchema } from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import {
  PulsarValidationError,
  PulsarNetworkError,
} from "../errors.js";
import logger from "../logger.js";

export interface CreateTrustlineOutput {
  transaction_xdr: string;
  source_account: string;
  asset: {
    code: string;
    issuer: string;
  };
  limit: string;
  network: string;
}

/** Resolve the stellar-base network passphrase. */
function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case "mainnet":
      return Networks.PUBLIC;
    case "futurenet":
      return Networks.FUTURENET;
    case "testnet":
    default:
      return Networks.TESTNET;
  }
}

/**
 * Tool: create_trustline
 *
 * Builds a Stellar transaction for creating a trustline (allowing an account
 * to hold a specific issued asset). Returns the unsigned transaction XDR.
 *
 * A trustline must be created before an account can receive or hold an
 * issued asset (anything other than XLM).
 */
export const createTrustline: McpToolHandler<
  typeof CreateTrustlineInputSchema
> = async (input: unknown) => {
  const validatedInput = CreateTrustlineInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for create_trustline",
      validatedInput.error.format()
    );
  }

  const data = validatedInput.data;
  const network = data.network ?? config.stellarNetwork;
  const networkPassphrase = resolveNetworkPassphrase(network);
  const sourceAccount = data.source_account;

  // ------------------------------------------------------------------
  // 1. Fetch source account from Horizon for sequence number
  // ------------------------------------------------------------------
  const horizonServer = getHorizonServer(network);
  let rawAccount;
  try {
    logger.debug(
      { account: sourceAccount, network },
      "Loading source account for trustline creation"
    );
    rawAccount = await horizonServer.loadAccount(sourceAccount);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(
        `Source account ${sourceAccount} not found. Fund the account before creating a trustline.`,
        { status: 404, account_id: sourceAccount }
      );
    }
    throw new PulsarNetworkError(
      `Failed to load source account: ${err.message}`,
      { originalError: err }
    );
  }

  const account =
    typeof (rawAccount as any).incrementSequenceNumber === "function" &&
    typeof (rawAccount as any).sequenceNumber === "function"
      ? (rawAccount as unknown as Account)
      : new Account(
          typeof (rawAccount as any).accountId === "function"
            ? (rawAccount as any).accountId()
            : (rawAccount as any).accountId,
          typeof (rawAccount as any).sequenceNumber === "function"
            ? (rawAccount as any).sequenceNumber()
            : (rawAccount as any).sequenceNumber
        );

  // ------------------------------------------------------------------
  // 2. Create the asset object
  // ------------------------------------------------------------------
  let asset: Asset;
  try {
    asset = new Asset(data.asset_code, data.asset_issuer);
  } catch (err: any) {
    throw new PulsarValidationError(
      `Invalid asset or issuer: ${err.message}`,
      { asset_code: data.asset_code, asset_issuer: data.asset_issuer }
    );
  }

  // ------------------------------------------------------------------
  // 3. Build the changeTrust operation
  // ------------------------------------------------------------------
  const changeTrustOp = Operation.changeTrust({
    asset,
    limit: data.limit,
  });

  logger.debug(
    {
      sourceAccount: data.source_account,
      assetCode: data.asset_code,
      assetIssuer: data.asset_issuer,
      limit: data.limit || "unlimited",
    },
    "Building trustline creation transaction"
  );

  // ------------------------------------------------------------------
  // 4. Build the transaction
  // ------------------------------------------------------------------
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(changeTrustOp)
    .setTimeout(30)
    .build();

  return {
    transaction_xdr: tx.toXDR(),
    source_account: sourceAccount,
    asset: {
      code: data.asset_code,
      issuer: data.asset_issuer,
    },
    limit: data.limit || "922337203685.4775807", // MAX_INT64 in stroops / 10^7
    network,
  };
};

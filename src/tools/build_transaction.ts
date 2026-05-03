import {
  TransactionBuilder,
  Operation,
  Address,
  Asset,
  Networks,
  nativeToScVal,
} from "@stellar/stellar-sdk";

import { getHorizonServer } from "../services/horizon.js";
import { config } from "../config.js";
import { BuildTransactionInputSchema } from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import {
  PulsarValidationError,
  PulsarNetworkError,
} from "../errors.js";
import logger from "../logger.js";

export interface BuildTransactionOutput {
  transaction_xdr: string;
  network: string;
  source_account: string;
  operations: Array<{
    type: string;
    description: string;
  }>;
  fee: string;
  timeout: number;
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
 * Build a payment operation
 */
function buildPaymentOperation(params: any): Operation {
  const { destination, amount, asset_code, asset_issuer } = params;
  
  let asset: Asset;
  if (asset_code && asset_issuer) {
    asset = new Asset(asset_code, asset_issuer);
  } else {
    asset = Asset.native();
  }

  return Operation.payment({
    destination,
    asset,
    amount: amount.toString(),
  });
}

/**
 * Build a change trust operation (trustline)
 */
function buildChangeTrustOperation(params: any): Operation {
  const { asset_code, asset_issuer, limit, source_account } = params;
  
  if (!asset_code || !asset_issuer) {
    throw new PulsarValidationError(
      "Both asset_code and asset_issuer are required for trustline operations"
    );
  }

  const asset = new Asset(asset_code, asset_issuer);
  
  return Operation.changeTrust({
    asset,
    limit: limit || "9223372036854775807", // Max uint64
  });
}

/**
 * Build a manage data operation
 */
function buildManageDataOperation(params: any): Operation {
  const { name, value, source_account } = params;
  
  if (!name) {
    throw new PulsarValidationError("name is required for manage data operations");
  }

  let dataValue: Buffer | undefined;
  if (value !== undefined) {
    if (typeof value === 'string') {
      dataValue = Buffer.from(value, 'utf8');
    } else if (typeof value === 'object') {
      dataValue = Buffer.from(JSON.stringify(value), 'utf8');
    } else {
      throw new PulsarValidationError("value must be a string or object for manage data operations");
    }
  }

  return Operation.manageData({
    name,
    value: dataValue,
  });
}

/**
 * Build a set options operation
 */
function buildSetOptionsOperation(params: any): Operation {
  const { 
    inflation_destination, 
    clear_flags, 
    set_flags, 
    master_weight, 
    low_threshold, 
    med_threshold, 
    high_threshold, 
    home_domain, 
    signer_address, 
    signer_type, 
    signer_weight 
  } = params;

  const operation: any = {};

  if (inflation_destination) operation.inflationDestination = inflation_destination;
  if (clear_flags !== undefined) operation.clearFlags = clear_flags;
  if (set_flags !== undefined) operation.setFlags = set_flags;
  if (master_weight !== undefined) operation.masterWeight = master_weight;
  if (low_threshold !== undefined) operation.lowThreshold = low_threshold;
  if (med_threshold !== undefined) operation.medThreshold = med_threshold;
  if (high_threshold !== undefined) operation.highThreshold = high_threshold;
  if (home_domain) operation.homeDomain = home_domain;

  if (signer_address && signer_type !== undefined && signer_weight !== undefined) {
    let signerKey: any;
    
    switch (signer_type) {
      case 'ed25519_public_key':
        signerKey = { ed25519PublicKey: signer_address };
        break;
      case 'pre_auth_tx':
        signerKey = { preAuthTx: signer_address };
        break;
      case 'sha256_hash':
        signerKey = { sha256Hash: signer_address };
        break;
      default:
        throw new PulsarValidationError(`Invalid signer_type: ${signer_type}`);
    }

    operation.signer = {
      ...signerKey,
      weight: signer_weight,
    };
  }

  return Operation.setOptions(operation);
}

/**
 * Build an account merge operation
 */
function buildAccountMergeOperation(params: any): Operation {
  const { destination, source_account } = params;
  
  if (!destination) {
    throw new PulsarValidationError("destination is required for account merge operations");
  }

  return Operation.accountMerge({
    destination,
  });
}

/**
 * Build a create account operation
 */
function buildCreateAccountOperation(params: any): Operation {
  const { destination, starting_balance, source_account } = params;
  
  if (!destination) {
    throw new PulsarValidationError("destination is required for create account operations");
  }
  
  if (!starting_balance || starting_balance < 1) {
    throw new PulsarValidationError("starting_balance must be at least 1 XLM");
  }

  return Operation.createAccount({
    destination,
    startingBalance: starting_balance.toString(),
  });
}

/**
 * Tool: build_transaction
 *
 * Helps AI assistants construct common transaction types without raw XDR.
 * Supports building payment, trustline, manage data, set options, account merge,
 * and create account operations.
 *
 * Returns the unsigned transaction XDR ready for simulation and submission.
 */
export const buildTransaction: McpToolHandler<
  typeof BuildTransactionInputSchema
> = async (input: unknown) => {
  const validatedInput = BuildTransactionInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for build_transaction",
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
  let account;
  try {
    logger.debug(
      { account: sourceAccount, network },
      "Loading source account for transaction building"
    );
    account = await horizonServer.loadAccount(sourceAccount);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(
        `Source account ${sourceAccount} not found. Fund the account before building transactions.`,
        { status: 404, account_id: sourceAccount }
      );
    }
    throw new PulsarNetworkError(
      `Failed to load source account: ${err.message}`,
      { originalError: err }
    );
  }

  // ------------------------------------------------------------------
  // 2. Build operations based on type
  // ------------------------------------------------------------------
  const operations: Operation[] = [];
  const operationDescriptions: Array<{ type: string; description: string }> = [];

  for (const op of data.operations) {
    let operation: Operation;
    let description: string;

    switch (op.type) {
      case "payment":
        operation = buildPaymentOperation(op);
        description = `Payment of ${op.amount} ${op.asset_code || 'XLM'} to ${op.destination}`;
        break;

      case "change_trust":
        operation = buildChangeTrustOperation(op);
        description = `Trustline for ${op.asset_code}:${op.asset_issuer}`;
        break;

      case "manage_data":
        operation = buildManageDataOperation(op);
        description = op.value !== undefined 
          ? `Set data entry "${op.name}"`
          : `Clear data entry "${op.name}"`;
        break;

      case "set_options":
        operation = buildSetOptionsOperation(op);
        description = "Set account options";
        break;

      case "account_merge":
        operation = buildAccountMergeOperation(op);
        description = `Merge account into ${op.destination}`;
        break;

      case "create_account":
        operation = buildCreateAccountOperation(op);
        description = `Create account ${op.destination} with ${op.starting_balance} XLM`;
        break;

      default:
        throw new PulsarValidationError(`Unsupported operation type: ${(op as any).type}`);
    }

    operations.push(operation);
    operationDescriptions.push({ type: op.type, description });
  }

  // ------------------------------------------------------------------
  // 3. Build the transaction
  // ------------------------------------------------------------------
  const fee = (data.fee || 100_000 * operations.length).toString();
  const timeout = data.timeout || 30;

  logger.debug(
    { 
      sourceAccount, 
      operationCount: operations.length, 
      fee, 
      timeout,
      network 
    },
    "Building transaction"
  );

  let transactionBuilder = new TransactionBuilder(account, {
    fee,
    networkPassphrase,
  });

  for (const operation of operations) {
    transactionBuilder = transactionBuilder.addOperation(operation);
  }

  const tx = transactionBuilder.setTimeout(timeout).build();

  return {
    transaction_xdr: tx.toXDR(),
    network,
    source_account: sourceAccount,
    operations: operationDescriptions,
    fee,
    timeout,
  };
};

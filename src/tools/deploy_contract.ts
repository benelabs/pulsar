import { randomBytes } from "node:crypto";

import {
  TransactionBuilder,
  Operation,
  Address,
  hash,
  StrKey,
  xdr,
  nativeToScVal,
  Networks,
} from "@stellar/stellar-sdk";

import { getHorizonServer } from "../services/horizon.js";
import { config } from "../config.js";
import { DeployContractInputSchema } from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import {
  PulsarValidationError,
  PulsarNetworkError,
} from "../errors.js";
import logger from "../logger.js";

export interface DeployContractOutput {
  mode: "direct" | "factory";
  transaction_xdr: string;
  predicted_contract_id?: string;
  network: string;
  source_account: string;
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
 * Compute the deterministic contract address for a direct deployment.
 * Uses the same hashing algorithm as the Soroban host.
 */
function computeContractId(
  networkPassphrase: string,
  sourceAccount: string,
  salt: Buffer
): string {
  const networkId = hash(Buffer.from(networkPassphrase));
  const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({
      networkId,
      contractIdPreimage:
        xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(sourceAccount).toScAddress(),
            salt,
          })
        ),
    })
  );
  return StrKey.encodeContract(hash(preimage.toXDR()));
}

/**
 * Convert a typed JSON argument to an xdr.ScVal.
 */
function buildScVal(arg: {
  type?: string;
  value?: unknown;
}): xdr.ScVal {
  const { type, value } = arg;

  if (value === undefined) {
    throw new PulsarValidationError(
      "deploy_args items must have a 'value' property"
    );
  }

  if (!type) {
    return nativeToScVal(value);
  }

  return nativeToScVal(value, { type });
}

/**
 * Tool: deploy_contract
 *
 * Builds a Stellar transaction for deploying a Soroban smart contract.
 * Supports two modes:
 *   - "direct": Uses the built-in deployer (Operation.createCustomContract)
 *   - "factory": Invokes a factory contract's deploy function
 *
 * Returns the unsigned transaction XDR and, for direct mode, the predicted
 * deterministic contract address.
 */
export const deployContract: McpToolHandler<
  typeof DeployContractInputSchema
> = async (input: unknown) => {
  const validatedInput = DeployContractInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for deploy_contract",
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
      "Loading source account for deployment"
    );
    account = await horizonServer.loadAccount(sourceAccount);
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new PulsarNetworkError(
        `Source account ${sourceAccount} not found. Fund the account before deploying.`,
        { status: 404, account_id: sourceAccount }
      );
    }
    throw new PulsarNetworkError(
      `Failed to load source account: ${err.message}`,
      { originalError: err }
    );
  }

  // ------------------------------------------------------------------
  // 2. Build the deployment operation
  // ------------------------------------------------------------------
  let operation: xdr.Operation;
  let predictedContractId: string | undefined;

  if (data.mode === "direct") {
    if (!data.wasm_hash) {
      throw new PulsarValidationError(
        "wasm_hash is required for direct deployment mode"
      );
    }

    const wasmHash = Buffer.from(data.wasm_hash, "hex");
    if (wasmHash.length !== 32) {
      throw new PulsarValidationError(
        "wasm_hash must be a 64-character hex string (32 bytes)"
      );
    }

    const salt = data.salt
      ? Buffer.from(data.salt, "hex")
      : randomBytes(32);
    if (salt.length !== 32) {
      throw new PulsarValidationError(
        "salt must be a 64-character hex string (32 bytes) if provided"
      );
    }

    predictedContractId = computeContractId(
      networkPassphrase,
      sourceAccount,
      salt
    );
    logger.debug(
      { predictedContractId, wasmHash: data.wasm_hash },
      "Building direct contract deployment"
    );

    operation = Operation.createCustomContract({
      address: new Address(sourceAccount),
      wasmHash,
      salt,
    });
  } else {
    // factory mode
    if (!data.factory_contract_id) {
      throw new PulsarValidationError(
        "factory_contract_id is required for factory deployment mode"
      );
    }

    const args = (data.deploy_args ?? []).map(buildScVal);
    const deployFunction = data.deploy_function ?? "deploy";

    logger.debug(
      {
        factoryContractId: data.factory_contract_id,
        deployFunction,
        argCount: args.length,
      },
      "Building factory contract deployment"
    );

    operation = Operation.invokeContractFunction({
      contract: data.factory_contract_id,
      function: deployFunction,
      args,
    });
  }

  // ------------------------------------------------------------------
  // 3. Build the transaction
  // ------------------------------------------------------------------
  const tx = new TransactionBuilder(account, {
    fee: (100_000).toString(),
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  return {
    mode: data.mode,
    transaction_xdr: tx.toXDR(),
    predicted_contract_id: predictedContractId,
    network,
    source_account: sourceAccount,
  };
};

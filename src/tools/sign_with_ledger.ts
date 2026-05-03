import { TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { LedgerSigner } from "../services/ledger.js";
import { SignWithLedgerInputSchema } from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import logger from "../logger.js";
import { PulsarValidationError, PulsarNetworkError } from "../errors.js";

/**
 * sign_with_ledger tool handler.
 * Connects to a physical Ledger device and signs a transaction.
 */
export const signWithLedger: McpToolHandler<typeof SignWithLedgerInputSchema> = async (input) => {
  const validated = SignWithLedgerInputSchema.safeParse(input);
  if (!validated.success) {
    throw new PulsarValidationError("Invalid input for sign_with_ledger", validated.error.format());
  }

  const { xdr, derivation_path, network: networkOverride } = validated.data;
  
  // Resolve network passphrase
  let networkPassphrase = Networks.TESTNET;
  const network = networkOverride || "testnet";
  if (network === "mainnet") networkPassphrase = Networks.PUBLIC;
  else if (network === "futurenet") networkPassphrase = Networks.FUTURENET;

  try {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    const signer = new LedgerSigner(derivation_path);

    logger.info({ derivation_path, network }, "Requesting signature from Ledger device...");
    
    // This will block until the user confirms on the device or it times out
    await signer.signTransaction(tx);

    const signedXdr = tx.toXDR();
    
    return {
      status: "SUCCESS",
      signed_xdr: signedXdr,
      network,
    };
  } catch (error) {
    logger.error({ error }, "Error in sign_with_ledger");
    if (error instanceof Error) {
      throw new PulsarNetworkError(error.message, { code: (error as any).code });
    }
    throw error;
  }
};

import { TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { XdrInspector } from "../services/inspector.js";
import { InspectXdrInputSchema } from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import logger from "../logger.js";
import { PulsarValidationError, PulsarNetworkError } from "../errors.js";

/**
 * inspect_xdr tool handler.
 * Decodes and analyzes a transaction XDR for potential risks.
 */
export const inspectXdr: McpToolHandler<typeof InspectXdrInputSchema> = async (input) => {
  const validated = InspectXdrInputSchema.safeParse(input);
  if (!validated.success) {
    throw new PulsarValidationError("Invalid input for inspect_xdr", validated.error.format());
  }

  const { xdr, network: networkOverride } = validated.data;
  
  // Resolve network passphrase
  let networkPassphrase = Networks.TESTNET;
  const network = networkOverride || "testnet";
  if (network === "mainnet") networkPassphrase = Networks.PUBLIC;
  else if (network === "futurenet") networkPassphrase = Networks.FUTURENET;

  try {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    const inspector = new XdrInspector(tx);
    const report = inspector.inspect();

    return report;
  } catch (error) {
    logger.error({ error }, "Error in inspect_xdr");
    if (error instanceof Error) {
      throw new PulsarNetworkError(`Failed to inspect XDR: ${error.message}`);
    }
    throw error;
  }
};

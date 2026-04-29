import { Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";

/**
 * StellarSigner interface defines the contract for signing transactions.
 * This can be implemented by software wallets (secret key) or hardware wallets.
 */
export interface StellarSigner {
  /**
   * Returns the public key of the signer.
   */
  getPublicKey(): Promise<string>;

  /**
   * Signs the provided transaction or fee bump transaction.
   * Implementation should add the signature directly to the transaction object.
   */
  signTransaction(tx: Transaction | FeeBumpTransaction): Promise<void>;
}

/**
 * SignerError is thrown when a signing operation fails.
 */
export class SignerError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "SignerError";
  }
}

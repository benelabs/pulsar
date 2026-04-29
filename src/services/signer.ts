import { Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";

/**
 * Interface for Stellar transaction signers.
 * This abstraction allows Pulsar to support multiple signing methods
 * (Secret Key, Hardware Wallets, Remote Signers) uniformly.
 */
export interface StellarSigner {
  /**
   * Returns the public key associated with the signer.
   */
  getPublicKey(): Promise<string>;

  /**
   * Signs the provided transaction.
   * @param tx The transaction or fee-bump transaction to sign.
   */
  signTransaction(tx: Transaction | FeeBumpTransaction): Promise<void>;
}

/**
 * Base error class for signer-related failures.
 */
export class SignerError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'SignerError';
  }
}

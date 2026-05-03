import { Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";

/**
 * StellarSigner interface defines the contract for signing transactions.
 * This can be implemented by software wallets (secret key) or hardware wallets.
 */
export interface StellarSigner {
  /**
   * Returns the public key of the signer.
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
   * Signs the provided transaction or fee bump transaction.
   * Implementation should add the signature directly to the transaction object.
   * Signs the provided transaction.
   * @param tx The transaction or fee-bump transaction to sign.
   */
  signTransaction(tx: Transaction | FeeBumpTransaction): Promise<void>;
}

/**
 * SignerError is thrown when a signing operation fails.
 * Base error class for signer-related failures.
 */
export class SignerError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "SignerError";
    this.name = 'SignerError';
  }
}

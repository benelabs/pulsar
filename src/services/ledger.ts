import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import StrApp from "@ledgerhq/hw-app-str";
import { Transaction, FeeBumpTransaction, Asset } from "@stellar/stellar-sdk";
import { StellarSigner, SignerError } from "./signer.js";
import logger from "../logger.js";

/**
 * LedgerSigner implements the StellarSigner interface using a Ledger hardware wallet.
 * It uses the @ledgerhq libraries to communicate via HID.
 */
export class LedgerSigner implements StellarSigner {
  private transport: any = null;
  private strApp: any = null;
  private publicKey: string | null = null;
  private readonly derivationPath: string;

  constructor(derivationPath: string = "44'/148'/0'") {
    // Standardize path: remove 'm/' prefix if present
    this.derivationPath = derivationPath.startsWith("m/") 
      ? derivationPath.slice(2) 
      : derivationPath;
  }

  /**
   * Initializes the HID transport and Stellar app instance.
   */
  private async initialize(): Promise<void> {
    if (this.transport && this.strApp) return;

    try {
      // @ts-ignore
      const transportClass = TransportNodeHid.default || TransportNodeHid;
      this.transport = await transportClass.create();
      
      // @ts-ignore
      const Str = StrApp.default || StrApp;
      this.strApp = new Str(this.transport);
      
      this.transport.on("disconnect", () => {
        logger.warn("Ledger device disconnected.");
        this.transport = null;
        this.strApp = null;
        this.publicKey = null;
      });
    } catch (error) {
      throw new SignerError(
        `Failed to connect to Ledger device: ${(error as Error).message}`,
        "LEDGER_CONNECT_ERROR"
      );
    }
  }

  /**
   * Fetches the public key from the Ledger device.
   */
  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;
    
    await this.initialize();
    try {
      const result = await this.strApp!.getPublicKey(this.derivationPath);
      this.publicKey = result.publicKey;
      return this.publicKey!;
    } catch (error) {
      throw new SignerError(
        `Failed to get public key from Ledger: ${(error as Error).message}`,
        "LEDGER_PUBKEY_ERROR"
      );
    }
  }

  /**
   * Signs a Stellar transaction on the Ledger device.
   */
  async signTransaction(tx: Transaction | FeeBumpTransaction): Promise<void> {
    await this.initialize();
    try {
      logger.info({ path: this.derivationPath }, "Requesting signature from Ledger...");
      
      const signature = await this.strApp!.signTransaction(
        this.derivationPath,
        tx.signatureBase()
      );
      
      // Add the signature to the transaction
      tx.addSignature(await this.getPublicKey(), signature.signature.toString('base64'));
    } catch (error) {
      throw new SignerError(
        `Ledger signing failed: ${(error as Error).message}`,
        "LEDGER_SIGN_ERROR"
      );
    }
  }

  /**
   * Closes the transport connection.
   */
  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.strApp = null;
      this.publicKey = null;
    }
  }
}

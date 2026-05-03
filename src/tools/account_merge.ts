import {
  Horizon,
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
  Networks,
} from '@stellar/stellar-sdk';

import { config } from '../config.js';
import logger from '../logger.js';

export interface AccountMergeParams {
  sourceSecret: string;
  destination: string;
  horizonUrl: string;
}

export interface AccountMergeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Safely constructs and submits an account merge transaction.
 * @param params AccountMergeParams
 * @returns AccountMergeResult
 */
export async function mergeAccount(params: AccountMergeParams): Promise<AccountMergeResult> {
  const { sourceSecret, destination, horizonUrl } = params;
  try {
    const server = new Horizon.Server(horizonUrl);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);
    const sourcePublic = sourceKeypair.publicKey();
    const account = await server.loadAccount(sourcePublic);

    // Determine network passphrase
    let networkPassphrase = Networks.TESTNET;
    if (config.stellarNetwork === 'mainnet') {
      networkPassphrase = Networks.PUBLIC;
    } else if (config.stellarNetwork === 'futurenet') {
      networkPassphrase = Networks.FUTURENET;
    }

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE.toString(),
      networkPassphrase,
    })
      .addOperation(Operation.accountMerge({ destination }))
      .setTimeout(60)
      .build();

    tx.sign(sourceKeypair);

    const result = await server.submitTransaction(tx);
    logger.info(`Account merge successful: ${result.hash}`);
    return { success: true, txHash: result.hash };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Account merge exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

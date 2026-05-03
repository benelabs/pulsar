import { Server, TransactionBuilder, Networks, Account, Operation, Keypair, BASE_FEE } from 'stellar-sdk';
import { getNetworkPassphrase } from '../config';
import { submitTransaction } from './submit_transaction';
import { logger } from '../logger';

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
    const server = new Server(horizonUrl);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);
    const sourcePublic = sourceKeypair.publicKey();
    const account = await server.loadAccount(sourcePublic);
    const networkPassphrase = getNetworkPassphrase();

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(Operation.accountMerge({ destination }))
      .setTimeout(60)
      .build();

    tx.sign(sourceKeypair);

    const result = await submitTransaction({ server, transaction: tx });
    if (result.success) {
      logger.info(`Account merge successful: ${result.txHash}`);
      return { success: true, txHash: result.txHash };
    } else {
      logger.error(`Account merge failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    logger.error(`Account merge exception: ${error.message}`);
    return { success: false, error: error.message };
  }
}

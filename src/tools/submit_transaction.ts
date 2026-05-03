import {
  Horizon,
  Keypair,
  Networks,
  Transaction,
  FeeBumpTransaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import { config } from '../config.js';
import { SubmitTransactionInputSchema } from '../schemas/tools.js';
import type { McpToolHandler } from '../types.js';
import logger from '../logger.js';
import { PulsarNetworkError, PulsarValidationError } from '../errors.js';
import { config } from "../config.js";
import {
  SubmitTransactionInputSchema,
} from "../schemas/tools.js";
import type { McpToolHandler } from "../types.js";
import logger from "../logger.js";
import { PulsarNetworkError, PulsarValidationError } from "../errors.js";
import { getSorobanServer } from "../services/soroban-rpc.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the Horizon base URL for the resolved network. */
function resolveHorizonUrl(network: string): string {
  if (config.horizonUrl) return config.horizonUrl;
  switch (network) {
    case 'mainnet':
      return 'https://horizon.stellar.org';
    case 'futurenet':
      return 'https://horizon-futurenet.stellar.org';
    case 'testnet':
    default:
      return 'https://horizon-testnet.stellar.org';
  }
}

/** Return the stellar-base network passphrase for the resolved network. */
function resolveNetworkPassphrase(network: string): string {
  switch (network) {
    case 'mainnet':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}

/** Sleep helper for polling. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export const submitTransaction: McpToolHandler<typeof SubmitTransactionInputSchema> = async (
  input: unknown
) => {
  // ------------------------------------------------------------------
  // 0. Validate input schema before any processing
  // ------------------------------------------------------------------
  const validatedInput = SubmitTransactionInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      'Invalid input for submit_transaction',
      validatedInput.error.format()
    );
  }

  const validatedData = validatedInput.data;

  const network = validatedData.network ?? config.stellarNetwork;
  const horizonUrl = resolveHorizonUrl(network);
  const networkPassphrase = resolveNetworkPassphrase(network);
  const timeoutMs = validatedData.wait_timeout_ms ?? 30_000;

  // ------------------------------------------------------------------
  // 1. Guard: sign requested but no key configured
  // ------------------------------------------------------------------
  if (validatedData.sign && !config.stellarSecretKey) {
    throw new PulsarValidationError(
      'sign: true was requested but STELLAR_SECRET_KEY is not configured. ' +
        'Set the environment variable and restart the server, or submit a pre-signed XDR with sign: false.'
    );
  }

  // ------------------------------------------------------------------
  // 2. Deserialise the transaction envelope
  // ------------------------------------------------------------------
  let tx: Transaction | FeeBumpTransaction;
  try {
    tx = TransactionBuilder.fromXDR(validatedData.xdr, networkPassphrase);
  } catch (err) {
    throw new PulsarValidationError(`Failed to parse XDR: ${(err as Error).message}`);
  }

  // ------------------------------------------------------------------
  // 3. Optionally sign in-process (key never leaves memory / logs)
  // ------------------------------------------------------------------
  if (validatedData.sign) {
    // config.stellarSecretKey is guaranteed non-null here (guarded above)
    const keypair = Keypair.fromSecret(config.stellarSecretKey!);
    if (tx instanceof FeeBumpTransaction) {
      tx.sign(keypair);
    } else {
      tx.sign(keypair);
    }
  }

  // ------------------------------------------------------------------
  // 4. Submit via Horizon
  // ------------------------------------------------------------------
  const server = new Horizon.Server(horizonUrl, { allowHttp: false });

  let submitResponse: Horizon.HorizonApi.SubmitTransactionResponse;
  try {
    logger.debug({ hash: tx.hash().toString('hex'), network }, 'Submitting transaction to Horizon');
    submitResponse = await server.submitTransaction(tx);
  } catch (err: unknown) {
    // Horizon wraps errors in a structured object
    const horizonErr = err as {
      response?: {
        data?: { extras?: unknown; title?: string; detail?: string };
      };
      message?: string;
    };
    const extras = horizonErr?.response?.data?.extras;
    throw new PulsarNetworkError(
      horizonErr?.response?.data?.title ?? horizonErr?.message ?? 'Transaction submission failed.',
      {
        detail: horizonErr?.response?.data?.detail,
        extras,
      }
    );
  }

  const hash = submitResponse.hash;
  const baseResult = {
    hash,
    ledger: submitResponse.ledger ?? null,
    fee_charged: (submitResponse as unknown as Record<string, unknown>).fee_charged ?? null,
    envelope_xdr: submitResponse.envelope_xdr ?? null,
    result_xdr: submitResponse.result_xdr ?? null,
    result_meta_xdr: submitResponse.result_meta_xdr ?? null,
  };

  // ------------------------------------------------------------------
  // 5. Optionally wait for finalisation via Soroban RPC
  // ------------------------------------------------------------------
  if (!validatedData.wait_for_result) {
    return { ...baseResult, status: 'SUBMITTED' };
  }

  // Poll Soroban RPC (getTransaction) until terminal state or timeout
  const rpcUrl = config.sorobanRpcUrl ?? resolveRpcUrl(network);
  const { rpc: SorobanRpc } = await import('@stellar/stellar-sdk');
  const rpcServer = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  const { rpc: SorobanRpc } = await import("@stellar/stellar-sdk");
  const rpcServer = getSorobanServer(network);

  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL_MS = 1_500;

  logger.debug({ hash, rpcUrl }, 'Polling Soroban RPC for transaction result');

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let txStatus: Awaited<ReturnType<typeof rpcServer.getTransaction>>;
    try {
      txStatus = await rpcServer.getTransaction(hash);
    } catch (e) {
      // transient RPC error — keep polling
      logger.debug({ hash, error: (e as Error).message }, 'transient RPC error while polling');
      continue;
    }

    if (txStatus.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      logger.info({ hash }, 'Transaction SUCCESS');
      return {
        ...baseResult,
        status: 'SUCCESS',
        ledger: txStatus.ledger ?? baseResult.ledger,
        fee_charged:
          (txStatus as unknown as Record<string, unknown>).feeCharged ?? baseResult.fee_charged,
        return_value: txStatus.returnValue ? txStatus.returnValue.toXDR('base64') : null,
        result_meta_xdr: txStatus.resultMetaXdr
          ? txStatus.resultMetaXdr.toXDR('base64')
          : baseResult.result_meta_xdr,
      };
    }

    if (txStatus.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      logger.warn({ hash }, 'Transaction FAILED');
      return {
        ...baseResult,
        status: 'FAILED',
        ledger: txStatus.ledger ?? baseResult.ledger,
        diagnostic_events: extractDiagnosticEvents(txStatus as unknown as Record<string, unknown>),
        result_meta_xdr: txStatus.resultMetaXdr
          ? txStatus.resultMetaXdr.toXDR('base64')
          : baseResult.result_meta_xdr,
      };
    }

    // status === NOT_FOUND or PENDING — keep polling
  }

  // Timed out
  logger.warn({ hash, timeoutMs }, 'Transaction polling TIMEOUT');
  return {
    ...baseResult,
    status: 'TIMEOUT',
    message: `Transaction was submitted (hash: ${hash}) but did not reach a terminal state within ${timeoutMs} ms. Poll manually using the hash.`,
  };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function resolveRpcUrl(network: string): string {
  switch (network) {
    case 'mainnet':
      return 'https://mainnet.sorobanrpc.com';
    case 'futurenet':
      return 'https://rpc-futurenet.stellar.org';
    case 'testnet':
    default:
      return 'https://soroban-testnet.stellar.org';
  }
}

function extractDiagnosticEvents(txStatus: Record<string, unknown>): unknown[] | null {
function extractDiagnosticEvents(
  txStatus: Record<string, unknown>,
): unknown[] | null {
  try {
    const events = (
      txStatus as {
        diagnosticEventsXdr?: { toXDR?: (fmt: string) => string }[];
      }
    ).diagnosticEventsXdr;
    if (!Array.isArray(events)) return null;
    return events.map((e) => (typeof e?.toXDR === 'function' ? e.toXDR('base64') : e));
  } catch {
    return null;
  }
}

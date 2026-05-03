import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { config } from "../config.js";
import { PulsarNetworkError, PulsarNotFoundError, PulsarValidationError } from "../errors.js";
import logger from "../logger.js";
import { GetContractStorageInputSchema } from "../schemas/tools.js";
import { getSorobanServer } from "../services/soroban-rpc.js";
import type { McpToolHandler } from "../types.js";

export interface ContractStorageEntry {
  key_xdr: string;
  entry_xdr: string;
  last_modified_ledger: number | null;
  live_until_ledger: number | null;
}

export interface GetContractStorageOutput {
  contract_id: string;
  storage_type: "instance" | "persistent" | "temporary";
  key: { type?: string; value: unknown } | null;
  network: string;
  entries: ContractStorageEntry[];
}

type StorageType = "instance" | "persistent" | "temporary";

type StorageKeyInput = {
  type?: string;
  value: unknown;
};

function buildScVal(key: StorageKeyInput): xdr.ScVal {
  if (key.value === undefined) {
    throw new PulsarValidationError("key must include a value");
  }

  if (!key.type) {
    return nativeToScVal(key.value);
  }

  return nativeToScVal(key.value, { type: key.type });
}

function buildInstanceKey(): xdr.ScVal {
  const ScVal = xdr.ScVal as unknown as {
    scvLedgerKeyContractInstance?: () => xdr.ScVal;
  };

  if (!ScVal.scvLedgerKeyContractInstance) {
    throw new PulsarValidationError(
      "SDK does not support instance storage keys. Update @stellar/stellar-sdk."
    );
  }

  return ScVal.scvLedgerKeyContractInstance();
}

function buildLedgerKey(
  contractId: string,
  storageType: StorageType,
  key?: StorageKeyInput
): xdr.LedgerKey {
  const contract = new Address(contractId).toScAddress();

  if (storageType === "instance") {
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract,
        key: buildInstanceKey(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );
  }

  if (!key) {
    throw new PulsarValidationError(
      "key is required for persistent or temporary storage"
    );
  }

  const durability =
    storageType === "temporary"
      ? xdr.ContractDataDurability.temporary()
      : xdr.ContractDataDurability.persistent();

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract,
      key: buildScVal(key),
      durability,
    })
  );
}

function normalizeEntry(entry: Record<string, unknown>): ContractStorageEntry {
  return {
    key_xdr: String(entry.key ?? ""),
    entry_xdr: String(entry.xdr ?? ""),
    last_modified_ledger:
      (entry.lastModifiedLedgerSeq as number | undefined) ??
      (entry.last_modified_ledger as number | undefined) ??
      null,
    live_until_ledger:
      (entry.liveUntilLedgerSeq as number | undefined) ??
      (entry.live_until_ledger as number | undefined) ??
      null,
  };
}

/**
 * Tool: get_contract_storage
 * Fetches a contract storage entry by durability and key.
 */
export const getContractStorage: McpToolHandler<
  typeof GetContractStorageInputSchema
> = async (input: unknown) => {
  const validatedInput = GetContractStorageInputSchema.safeParse(input);
  if (!validatedInput.success) {
    throw new PulsarValidationError(
      "Invalid input for get_contract_storage",
      validatedInput.error.format()
    );
  }

  const data = validatedInput.data;
  const network = data.network ?? config.stellarNetwork;
  const server = getSorobanServer(network);

  const ledgerKey = buildLedgerKey(
    data.contract_id,
    data.storage_type,
    data.key ?? undefined
  );
  const keyXdr = ledgerKey.toXDR("base64");

  logger.debug(
    {
      contractId: data.contract_id,
      storageType: data.storage_type,
      keyXdr,
    },
    "Fetching contract storage entry"
  );

  let response: unknown;
  try {
    response = await server.getLedgerEntries([keyXdr]);
  } catch (err) {
    throw new PulsarNetworkError("Failed to fetch contract storage entry", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const entries = (response as { entries?: Record<string, unknown>[] }).entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new PulsarNotFoundError("Contract storage entry not found", {
      contract_id: data.contract_id,
      storage_type: data.storage_type,
      key_xdr: keyXdr,
    });
  }

  const normalizedEntries = entries.map(normalizeEntry);
  const validEntries = normalizedEntries.filter((entry) => entry.entry_xdr);

  if (validEntries.length === 0) {
    throw new PulsarNotFoundError("Contract storage entry not found", {
      contract_id: data.contract_id,
      storage_type: data.storage_type,
      key_xdr: keyXdr,
    });
  }

  return {
    contract_id: data.contract_id,
    storage_type: data.storage_type,
    key: data.key ?? null,
    network,
    entries: validEntries,
  } as GetContractStorageOutput;
};

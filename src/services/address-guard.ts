import { AddressRegistry } from './address-registry.js';

export interface GuardCheckResult {
  blocked: boolean;
  address?: string;
}

// Per-tool map of address fields to check
const TOOL_ADDRESS_FIELDS: Record<string, string[]> = {
  get_account_balance: ['account_id', 'asset_issuer'],
  fetch_contract_spec: ['contract_id'],
  // submit_transaction and simulate_transaction use opaque XDR — not checked
  // manage_restricted_addresses manages the list itself — not checked
};

/**
 * Checks all address-typed fields in a tool input against the registry.
 * Returns { blocked: true, address } on first match, { blocked: false } otherwise.
 * Requirements: 2.1, 2.4, 2.5
 */
export function checkToolInput(
  toolName: string,
  input: Record<string, unknown>,
  registry: AddressRegistry
): GuardCheckResult {
  const fields = TOOL_ADDRESS_FIELDS[toolName];
  if (!fields) return { blocked: false };

  for (const field of fields) {
    const value = input[field];
    if (typeof value === 'string' && value.length > 0 && registry.has(value)) {
      return { blocked: true, address: value };
    }
  }

  return { blocked: false };
}

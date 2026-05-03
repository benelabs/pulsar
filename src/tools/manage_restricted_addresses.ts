import { z } from 'zod';

import { addressRegistry } from '../services/address-registry.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export const ManageRestrictedAddressesInputSchema = z.object({
  action: z.enum(['add', 'remove', 'list', 'check']).describe(
    'Action to perform: add, remove, list, or check'
  ),
  address: z.string().optional().describe(
    'Stellar public key (G...) or Soroban contract ID (C...) — required for add, remove, check'
  ),
});

export type ManageRestrictedAddressesInput = z.infer<typeof ManageRestrictedAddressesInputSchema>;

/**
 * Tool: manage_restricted_addresses
 * Allows operators and AI assistants to add, remove, list, or check restricted addresses.
 * Requirements: 3.1–3.7
 */
export const manageRestrictedAddresses: McpToolHandler<
  typeof ManageRestrictedAddressesInputSchema
> = async (input: unknown) => {
  const parsed = ManageRestrictedAddressesInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for manage_restricted_addresses', parsed.error.format());
  }

  const { action, address } = parsed.data;

  switch (action) {
    case 'add': {
      if (!address) {
        throw new PulsarValidationError('address is required for action "add"', { action });
      }
      addressRegistry.add(address); // throws PulsarValidationError if malformed
      return { action, address, count: addressRegistry.list().length };
    }

    case 'remove': {
      if (!address) {
        throw new PulsarValidationError('address is required for action "remove"', { action });
      }
      const wasThere = addressRegistry.has(address);
      addressRegistry.remove(address);
      return { action, address, removed: wasThere, count: addressRegistry.list().length };
    }

    case 'list': {
      const addresses = addressRegistry.list();
      return { action, addresses, count: addresses.length };
    }

    case 'check': {
      if (!address) {
        throw new PulsarValidationError('address is required for action "check"', { action });
      }
      return { action, address, restricted: addressRegistry.has(address) };
    }
  }
};

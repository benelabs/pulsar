import { PulsarUnauthorizedError, PulsarForbiddenError } from '../errors.js';

import type { Permission } from './types.js';
import { hasPermission } from './registry.js';

function isRbacEnabled(): boolean {
  return process.env.PULSAR_RBAC_ENABLED === 'true';
}

type AnyHandler = (input: unknown) => Promise<Record<string, unknown>>;

export function requirePermission(permission: Permission, handler: AnyHandler): AnyHandler {
  return async (input: unknown): Promise<Record<string, unknown>> => {
    if (!isRbacEnabled()) {
      return handler(input);
    }

    const rawInput = input as Record<string, unknown> | null | undefined;

    const callerId =
      rawInput && typeof rawInput.caller_id === 'string' ? rawInput.caller_id.trim() : undefined;

    if (!callerId) {
      throw new PulsarUnauthorizedError(
        'caller_id is required when RBAC is enabled. ' +
          'Provide the Stellar public key of the calling account.',
        { permission }
      );
    }

    if (!hasPermission(callerId, permission)) {
      throw new PulsarForbiddenError(
        `Account ${callerId} does not have the '${permission}' permission.`,
        { caller_id: callerId, permission }
      );
    }

    const forwardInput = { ...(rawInput as Record<string, unknown>) };
    delete forwardInput['caller_id'];
    return handler(forwardInput);
  };
}

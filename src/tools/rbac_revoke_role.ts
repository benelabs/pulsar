import { RevokeRoleInputSchema } from '../schemas/rbac.js';
import { revokeRole } from '../rbac/registry.js';
import { PulsarValidationError, PulsarNotFoundError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import logger from '../logger.js';

export const rbacRevokeRole: McpToolHandler<typeof RevokeRoleInputSchema> = async (
  input: unknown
) => {
  const parsed = RevokeRoleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for rbac_revoke_role', parsed.error.format());
  }

  const { account_id } = parsed.data;

  logger.info({ account_id }, 'RBAC: revoking role');

  let revoked;
  try {
    revoked = revokeRole(account_id);
  } catch (err) {
    if (err instanceof PulsarNotFoundError) throw err;
    throw err;
  }

  return {
    success: true,
    revoked: {
      account_id: revoked.account_id,
      role: revoked.role,
      granted_at: revoked.granted_at,
    },
    message: `Role '${revoked.role}' successfully revoked from account ${account_id}.`,
  };
};

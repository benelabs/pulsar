import { AssignRoleInputSchema } from '../schemas/rbac.js';
import { assignRole } from '../rbac/registry.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';
import logger from '../logger.js';

export const rbacAssignRole: McpToolHandler<typeof AssignRoleInputSchema> = async (
  input: unknown
) => {
  const parsed = AssignRoleInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for rbac_assign_role', parsed.error.format());
  }

  const { account_id, role, granted_by } = parsed.data;

  logger.info({ account_id, role, granted_by }, 'RBAC: assigning role');

  const assignment = assignRole(account_id, role, granted_by);

  return {
    success: true,
    assignment: {
      account_id: assignment.account_id,
      role: assignment.role,
      granted_at: assignment.granted_at,
      granted_by: assignment.granted_by ?? null,
    },
    message: `Role '${role}' successfully assigned to account ${account_id}.`,
  };
};

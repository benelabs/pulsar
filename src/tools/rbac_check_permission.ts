import { CheckPermissionInputSchema } from '../schemas/rbac.js';
import { hasPermission, getRole } from '../rbac/registry.js';
import { PERMISSION_MINIMUM_ROLE } from '../rbac/types.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export const rbacCheckPermission: McpToolHandler<typeof CheckPermissionInputSchema> = async (
  input: unknown
) => {
  const parsed = CheckPermissionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError(
      'Invalid input for rbac_check_permission',
      parsed.error.format()
    );
  }

  const { account_id, permission } = parsed.data;

  const assignment = getRole(account_id);
  const allowed = hasPermission(account_id, permission as any);

  return {
    account_id,
    permission,
    allowed,
    current_role: assignment?.role ?? null,
    minimum_role_required:
      PERMISSION_MINIMUM_ROLE[permission as keyof typeof PERMISSION_MINIMUM_ROLE],
    message: allowed
      ? `Account ${account_id} is authorised to perform '${permission}'.`
      : assignment
        ? `Account ${account_id} has role '${assignment.role}' which is insufficient for '${permission}'.`
        : `Account ${account_id} has no role assigned and cannot perform '${permission}'.`,
  };
};

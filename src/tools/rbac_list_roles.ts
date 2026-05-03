import { ListRolesInputSchema } from '../schemas/rbac.js';
import { listRoles } from '../rbac/registry.js';
import { PulsarValidationError } from '../errors.js';
import type { McpToolHandler } from '../types.js';

export const rbacListRoles: McpToolHandler<typeof ListRolesInputSchema> = async (
  input: unknown
) => {
  const parsed = ListRolesInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PulsarValidationError('Invalid input for rbac_list_roles', parsed.error.format());
  }

  const { role: filterRole } = parsed.data;

  let assignments = listRoles();

  if (filterRole) {
    assignments = assignments.filter((a) => a.role === filterRole);
  }

  return {
    total: assignments.length,
    filter: filterRole ?? null,
    assignments: assignments.map((a) => ({
      account_id: a.account_id,
      role: a.role,
      granted_at: a.granted_at,
      granted_by: a.granted_by ?? null,
    })),
  };
};

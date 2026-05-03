import { z } from 'zod';

import { ROLE_HIERARCHY, ALL_PERMISSIONS } from '../rbac/types.js';

import { StellarPublicKeySchema } from './index.js';

export const RoleSchema = z
  .enum(ROLE_HIERARCHY as unknown as [string, ...string[]])
  .describe(
    `One of the built-in roles: ${ROLE_HIERARCHY.join(', ')}. ` +
      'Roles are hierarchical: admin > deployer > operator > viewer.'
  );

export const PermissionSchema = z
  .enum(ALL_PERMISSIONS as unknown as [string, ...string[]])
  .describe('A named permission that maps directly to a Pulsar tool.');

export const AssignRoleInputSchema = z.object({
  account_id: StellarPublicKeySchema,
  role: RoleSchema,
  granted_by: StellarPublicKeySchema.optional(),
});

export type AssignRoleInput = z.infer<typeof AssignRoleInputSchema>;

export const RevokeRoleInputSchema = z.object({
  account_id: StellarPublicKeySchema,
});

export type RevokeRoleInput = z.infer<typeof RevokeRoleInputSchema>;

export const CheckPermissionInputSchema = z.object({
  account_id: StellarPublicKeySchema,
  permission: PermissionSchema,
});

export type CheckPermissionInput = z.infer<typeof CheckPermissionInputSchema>;

export const ListRolesInputSchema = z.object({
  role: RoleSchema.optional(),
});

export type ListRolesInput = z.infer<typeof ListRolesInputSchema>;

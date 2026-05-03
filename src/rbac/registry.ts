import { PulsarNotFoundError } from '../errors.js';

import type { Role, RoleAssignment, Permission } from './types.js';
import { ROLE_HIERARCHY, PERMISSION_MINIMUM_ROLE } from './types.js';

const _assignments = new Map<string, RoleAssignment>();

export function roleAtLeast(candidate: Role, minimum: Role): boolean {
  return ROLE_HIERARCHY.indexOf(candidate) >= ROLE_HIERARCHY.indexOf(minimum);
}

export function assignRole(accountId: string, role: Role, grantedBy?: string): RoleAssignment {
  const assignment: RoleAssignment = {
    account_id: accountId,
    role,
    granted_at: new Date().toISOString(),
    granted_by: grantedBy,
  };
  _assignments.set(accountId, assignment);
  return assignment;
}

export function revokeRole(accountId: string): RoleAssignment {
  const existing = _assignments.get(accountId);
  if (!existing) {
    throw new PulsarNotFoundError(`No role assignment found for account ${accountId}`, {
      account_id: accountId,
    });
  }
  _assignments.delete(accountId);
  return existing;
}

export function getRole(accountId: string): RoleAssignment | undefined {
  return _assignments.get(accountId);
}

export function hasPermission(accountId: string, permission: Permission): boolean {
  const assignment = _assignments.get(accountId);
  if (!assignment) return false;
  const minimumRole = PERMISSION_MINIMUM_ROLE[permission];
  return roleAtLeast(assignment.role, minimumRole);
}

export function listRoles(): RoleAssignment[] {
  return Array.from(_assignments.values());
}

export function _clearAll(): void {
  _assignments.clear();
}

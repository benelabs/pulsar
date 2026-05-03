import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  assignRole,
  revokeRole,
  getRole,
  hasPermission,
  listRoles,
  _clearAll,
  roleAtLeast,
} from '../../src/rbac/registry.js';
import { requirePermission } from '../../src/rbac/guard.js';
import { ROLE_HIERARCHY, PERMISSION_MINIMUM_ROLE, ALL_PERMISSIONS } from '../../src/rbac/types.js';
import { rbacAssignRole } from '../../src/tools/rbac_assign_role.js';
import { rbacRevokeRole } from '../../src/tools/rbac_revoke_role.js';
import { rbacCheckPermission } from '../../src/tools/rbac_check_permission.js';
import { rbacListRoles } from '../../src/tools/rbac_list_roles.js';
import {
  PulsarForbiddenError,
  PulsarNotFoundError,
  PulsarUnauthorizedError,
  PulsarValidationError,
} from '../../src/errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_ID = 'GADMIN4XVCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';
const DEPLOYER_ID = 'GDEPLOY4CDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';
const OPERATOR_ID = 'GOPERAT4CDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';
const VIEWER_ID = 'GVIEWER4XCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';
const NO_ROLE_ID = 'GNOROLE4XCDTUJ76ZAV2HA72KYQMQPQH3S7WVMSZOHMQG4G4MWCZJ6FG7';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => _clearAll());
afterEach(() => _clearAll());

// ============================================================================
// roleAtLeast
// ============================================================================

describe('roleAtLeast', () => {
  it('returns true when candidate equals minimum', () => {
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    expect(roleAtLeast('admin', 'admin')).toBe(true);
  });

  it('returns true when candidate is above minimum', () => {
    expect(roleAtLeast('admin', 'viewer')).toBe(true);
    expect(roleAtLeast('deployer', 'operator')).toBe(true);
    expect(roleAtLeast('operator', 'viewer')).toBe(true);
  });

  it('returns false when candidate is below minimum', () => {
    expect(roleAtLeast('viewer', 'operator')).toBe(false);
    expect(roleAtLeast('operator', 'deployer')).toBe(false);
    expect(roleAtLeast('deployer', 'admin')).toBe(false);
    expect(roleAtLeast('viewer', 'admin')).toBe(false);
  });
});

// ============================================================================
// Registry: assignRole
// ============================================================================

describe('assignRole', () => {
  it('creates a new assignment', () => {
    const result = assignRole(VIEWER_ID, 'viewer');
    expect(result.account_id).toBe(VIEWER_ID);
    expect(result.role).toBe('viewer');
    expect(result.granted_at).toBeDefined();
    expect(result.granted_by).toBeUndefined();
  });

  it('records granted_by when provided', () => {
    const result = assignRole(OPERATOR_ID, 'operator', ADMIN_ID);
    expect(result.granted_by).toBe(ADMIN_ID);
  });

  it('replaces an existing role', () => {
    assignRole(OPERATOR_ID, 'operator');
    assignRole(OPERATOR_ID, 'deployer');
    const retrieved = getRole(OPERATOR_ID);
    expect(retrieved?.role).toBe('deployer');
  });

  it('returns a RoleAssignment with ISO timestamp', () => {
    const result = assignRole(ADMIN_ID, 'admin');
    expect(new Date(result.granted_at).toISOString()).toBe(result.granted_at);
  });
});

// ============================================================================
// Registry: revokeRole
// ============================================================================

describe('revokeRole', () => {
  it('removes an existing assignment and returns it', () => {
    assignRole(VIEWER_ID, 'viewer');
    const revoked = revokeRole(VIEWER_ID);
    expect(revoked.role).toBe('viewer');
    expect(getRole(VIEWER_ID)).toBeUndefined();
  });

  it('throws PulsarNotFoundError when account has no role', () => {
    expect(() => revokeRole(NO_ROLE_ID)).toThrow(PulsarNotFoundError);
  });

  it('throws with descriptive message', () => {
    expect(() => revokeRole(NO_ROLE_ID)).toThrow(NO_ROLE_ID);
  });
});

// ============================================================================
// Registry: hasPermission
// ============================================================================

describe('hasPermission', () => {
  it('returns false for accounts with no role', () => {
    expect(hasPermission(NO_ROLE_ID, 'get_account_balance')).toBe(false);
  });

  it('viewer can perform viewer-level permissions', () => {
    assignRole(VIEWER_ID, 'viewer');
    expect(hasPermission(VIEWER_ID, 'get_account_balance')).toBe(true);
    expect(hasPermission(VIEWER_ID, 'fetch_contract_spec')).toBe(true);
    expect(hasPermission(VIEWER_ID, 'decode_ledger_entry')).toBe(true);
    expect(hasPermission(VIEWER_ID, 'compute_vesting_schedule')).toBe(true);
    expect(hasPermission(VIEWER_ID, 'rbac_check_permission')).toBe(true);
  });

  it('viewer cannot perform operator-level permissions', () => {
    assignRole(VIEWER_ID, 'viewer');
    expect(hasPermission(VIEWER_ID, 'simulate_transaction')).toBe(false);
  });

  it('viewer cannot perform deployer-level permissions', () => {
    assignRole(VIEWER_ID, 'viewer');
    expect(hasPermission(VIEWER_ID, 'submit_transaction')).toBe(false);
    expect(hasPermission(VIEWER_ID, 'deploy_contract')).toBe(false);
  });

  it('viewer cannot perform admin-level permissions', () => {
    assignRole(VIEWER_ID, 'viewer');
    expect(hasPermission(VIEWER_ID, 'rbac_assign_role')).toBe(false);
    expect(hasPermission(VIEWER_ID, 'rbac_revoke_role')).toBe(false);
    expect(hasPermission(VIEWER_ID, 'rbac_list_roles')).toBe(false);
  });

  it('operator can perform operator and viewer permissions', () => {
    assignRole(OPERATOR_ID, 'operator');
    expect(hasPermission(OPERATOR_ID, 'simulate_transaction')).toBe(true);
    expect(hasPermission(OPERATOR_ID, 'get_account_balance')).toBe(true);
  });

  it('operator cannot perform deployer-level permissions', () => {
    assignRole(OPERATOR_ID, 'operator');
    expect(hasPermission(OPERATOR_ID, 'submit_transaction')).toBe(false);
    expect(hasPermission(OPERATOR_ID, 'deploy_contract')).toBe(false);
  });

  it('deployer can perform deployer, operator, and viewer permissions', () => {
    assignRole(DEPLOYER_ID, 'deployer');
    expect(hasPermission(DEPLOYER_ID, 'deploy_contract')).toBe(true);
    expect(hasPermission(DEPLOYER_ID, 'submit_transaction')).toBe(true);
    expect(hasPermission(DEPLOYER_ID, 'simulate_transaction')).toBe(true);
    expect(hasPermission(DEPLOYER_ID, 'get_account_balance')).toBe(true);
  });

  it('deployer cannot perform admin-only permissions', () => {
    assignRole(DEPLOYER_ID, 'deployer');
    expect(hasPermission(DEPLOYER_ID, 'rbac_assign_role')).toBe(false);
  });

  it('admin can perform every permission', () => {
    assignRole(ADMIN_ID, 'admin');
    for (const perm of ALL_PERMISSIONS) {
      expect(hasPermission(ADMIN_ID, perm)).toBe(true);
    }
  });
});

// ============================================================================
// Registry: listRoles
// ============================================================================

describe('listRoles', () => {
  it('returns empty array when no roles assigned', () => {
    expect(listRoles()).toHaveLength(0);
  });

  it('returns all assignments', () => {
    assignRole(ADMIN_ID, 'admin');
    assignRole(VIEWER_ID, 'viewer');
    const results = listRoles();
    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.account_id);
    expect(ids).toContain(ADMIN_ID);
    expect(ids).toContain(VIEWER_ID);
  });
});

// ============================================================================
// Guard: requirePermission
// ============================================================================

describe('requirePermission', () => {
  const originalEnv = process.env.PULSAR_RBAC_ENABLED;

  afterEach(() => {
    process.env.PULSAR_RBAC_ENABLED = originalEnv;
  });

  describe('when RBAC is disabled (default)', () => {
    it('passes through to the underlying handler transparently', async () => {
      delete process.env.PULSAR_RBAC_ENABLED;
      const handler = vi.fn().mockResolvedValue({ ok: true });
      const guarded = requirePermission('get_account_balance', handler);
      const result = await guarded({ account_id: VIEWER_ID });
      expect(result).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledWith({ account_id: VIEWER_ID });
    });

    it('passes through even without caller_id', async () => {
      delete process.env.PULSAR_RBAC_ENABLED;
      const handler = vi.fn().mockResolvedValue({ ok: true });
      const guarded = requirePermission('deploy_contract', handler);
      await expect(guarded({})).resolves.toEqual({ ok: true });
    });
  });

  describe('when RBAC is enabled', () => {
    beforeEach(() => {
      process.env.PULSAR_RBAC_ENABLED = 'true';
    });

    it('throws PulsarUnauthorizedError when caller_id is absent', async () => {
      const handler = vi.fn();
      const guarded = requirePermission('get_account_balance', handler);
      await expect(guarded({})).rejects.toThrow(PulsarUnauthorizedError);
    });

    it('throws PulsarUnauthorizedError when caller_id is empty string', async () => {
      const handler = vi.fn();
      const guarded = requirePermission('get_account_balance', handler);
      await expect(guarded({ caller_id: '   ' })).rejects.toThrow(PulsarUnauthorizedError);
    });

    it('throws PulsarForbiddenError when caller lacks permission', async () => {
      assignRole(VIEWER_ID, 'viewer');
      const handler = vi.fn();
      const guarded = requirePermission('deploy_contract', handler);
      await expect(guarded({ caller_id: VIEWER_ID })).rejects.toThrow(PulsarForbiddenError);
    });

    it('throws PulsarForbiddenError when account has no role', async () => {
      const handler = vi.fn();
      const guarded = requirePermission('get_account_balance', handler);
      await expect(guarded({ caller_id: NO_ROLE_ID })).rejects.toThrow(PulsarForbiddenError);
    });

    it('invokes handler and strips caller_id when permission is satisfied', async () => {
      assignRole(ADMIN_ID, 'admin');
      const handler = vi.fn().mockResolvedValue({ result: 'done' });
      const guarded = requirePermission('deploy_contract', handler);
      const result = await guarded({ caller_id: ADMIN_ID, xdr: 'abc' });
      expect(result).toEqual({ result: 'done' });
      // caller_id must be stripped before forwarding
      expect(handler).toHaveBeenCalledWith({ xdr: 'abc' });
      expect((handler.mock.calls[0][0] as any).caller_id).toBeUndefined();
    });

    it('allows viewer-role to exercise viewer-level permissions', async () => {
      assignRole(VIEWER_ID, 'viewer');
      const handler = vi.fn().mockResolvedValue({ balances: [] });
      const guarded = requirePermission('get_account_balance', handler);
      await expect(guarded({ caller_id: VIEWER_ID, account_id: VIEWER_ID })).resolves.toEqual({
        balances: [],
      });
    });
  });
});

// ============================================================================
// Tool: rbacAssignRole
// ============================================================================

describe('rbacAssignRole', () => {
  it('assigns a role and returns the assignment', async () => {
    const result = (await rbacAssignRole({
      account_id: VIEWER_ID,
      role: 'viewer',
    })) as any;

    expect(result.success).toBe(true);
    expect(result.assignment.account_id).toBe(VIEWER_ID);
    expect(result.assignment.role).toBe('viewer');
    expect(result.assignment.granted_at).toBeDefined();
    expect(result.assignment.granted_by).toBeNull();
    expect(result.message).toContain('viewer');
  });

  it('records granted_by in the assignment', async () => {
    const result = (await rbacAssignRole({
      account_id: VIEWER_ID,
      role: 'operator',
      granted_by: ADMIN_ID,
    })) as any;

    expect(result.assignment.granted_by).toBe(ADMIN_ID);
  });

  it('replaces an existing role', async () => {
    await rbacAssignRole({ account_id: VIEWER_ID, role: 'viewer' });
    await rbacAssignRole({ account_id: VIEWER_ID, role: 'admin' });
    expect(getRole(VIEWER_ID)?.role).toBe('admin');
  });

  it('throws PulsarValidationError on invalid account_id', async () => {
    await expect(rbacAssignRole({ account_id: 'bad_key', role: 'viewer' })).rejects.toThrow(
      PulsarValidationError
    );
  });

  it('throws PulsarValidationError on invalid role', async () => {
    await expect(
      rbacAssignRole({ account_id: VIEWER_ID, role: 'superuser' as any })
    ).rejects.toThrow(PulsarValidationError);
  });

  it('throws PulsarValidationError when account_id is missing', async () => {
    await expect(rbacAssignRole({ role: 'viewer' } as any)).rejects.toThrow(PulsarValidationError);
  });
});

// ============================================================================
// Tool: rbacRevokeRole
// ============================================================================

describe('rbacRevokeRole', () => {
  it('revokes an existing role', async () => {
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacRevokeRole({ account_id: VIEWER_ID })) as any;

    expect(result.success).toBe(true);
    expect(result.revoked.account_id).toBe(VIEWER_ID);
    expect(result.revoked.role).toBe('viewer');
    expect(result.message).toContain('revoked');
  });

  it('throws PulsarNotFoundError when account has no role', async () => {
    await expect(rbacRevokeRole({ account_id: NO_ROLE_ID })).rejects.toThrow(PulsarNotFoundError);
  });

  it('throws PulsarValidationError on invalid account_id', async () => {
    await expect(rbacRevokeRole({ account_id: 'not-a-key' })).rejects.toThrow(
      PulsarValidationError
    );
  });

  it('throws PulsarValidationError when account_id is missing', async () => {
    await expect(rbacRevokeRole({} as any)).rejects.toThrow(PulsarValidationError);
  });
});

// ============================================================================
// Tool: rbacCheckPermission
// ============================================================================

describe('rbacCheckPermission', () => {
  it('returns allowed=true for a role with the permission', async () => {
    assignRole(ADMIN_ID, 'admin');
    const result = (await rbacCheckPermission({
      account_id: ADMIN_ID,
      permission: 'deploy_contract',
    })) as any;

    expect(result.allowed).toBe(true);
    expect(result.current_role).toBe('admin');
    expect(result.message).toContain('authorised');
  });

  it('returns allowed=false for a role without the permission', async () => {
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacCheckPermission({
      account_id: VIEWER_ID,
      permission: 'deploy_contract',
    })) as any;

    expect(result.allowed).toBe(false);
    expect(result.current_role).toBe('viewer');
    expect(result.message).toContain('insufficient');
  });

  it('returns allowed=false for an account with no role', async () => {
    const result = (await rbacCheckPermission({
      account_id: NO_ROLE_ID,
      permission: 'get_account_balance',
    })) as any;

    expect(result.allowed).toBe(false);
    expect(result.current_role).toBeNull();
    expect(result.message).toContain('no role');
  });

  it('returns the minimum role required', async () => {
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacCheckPermission({
      account_id: VIEWER_ID,
      permission: 'submit_transaction',
    })) as any;

    expect(result.minimum_role_required).toBe('deployer');
  });

  it('throws PulsarValidationError on invalid account_id', async () => {
    await expect(
      rbacCheckPermission({ account_id: 'bad', permission: 'get_account_balance' })
    ).rejects.toThrow(PulsarValidationError);
  });

  it('throws PulsarValidationError on invalid permission', async () => {
    await expect(
      rbacCheckPermission({ account_id: VIEWER_ID, permission: 'fly_rocket' as any })
    ).rejects.toThrow(PulsarValidationError);
  });

  it('throws PulsarValidationError when fields are missing', async () => {
    await expect(rbacCheckPermission({ account_id: VIEWER_ID } as any)).rejects.toThrow(
      PulsarValidationError
    );
  });
});

// ============================================================================
// Tool: rbacListRoles
// ============================================================================

describe('rbacListRoles', () => {
  it('returns empty list when no roles assigned', async () => {
    const result = (await rbacListRoles({})) as any;
    expect(result.total).toBe(0);
    expect(result.assignments).toHaveLength(0);
    expect(result.filter).toBeNull();
  });

  it('returns all assignments when no filter applied', async () => {
    assignRole(ADMIN_ID, 'admin');
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacListRoles({})) as any;
    expect(result.total).toBe(2);
    expect(result.assignments).toHaveLength(2);
  });

  it('filters by role', async () => {
    assignRole(ADMIN_ID, 'admin');
    assignRole(VIEWER_ID, 'viewer');
    assignRole(OPERATOR_ID, 'viewer');
    const result = (await rbacListRoles({ role: 'viewer' })) as any;
    expect(result.total).toBe(2);
    expect(result.filter).toBe('viewer');
    result.assignments.forEach((a: any) => expect(a.role).toBe('viewer'));
  });

  it('returns empty list when filter matches no roles', async () => {
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacListRoles({ role: 'admin' })) as any;
    expect(result.total).toBe(0);
  });

  it('includes granted_by in output', async () => {
    assignRole(VIEWER_ID, 'viewer', ADMIN_ID);
    const result = (await rbacListRoles({})) as any;
    expect(result.assignments[0].granted_by).toBe(ADMIN_ID);
  });

  it('shows null for granted_by when not set', async () => {
    assignRole(VIEWER_ID, 'viewer');
    const result = (await rbacListRoles({})) as any;
    expect(result.assignments[0].granted_by).toBeNull();
  });

  it('throws PulsarValidationError on invalid role filter', async () => {
    await expect(rbacListRoles({ role: 'superadmin' as any })).rejects.toThrow(
      PulsarValidationError
    );
  });
});

// ============================================================================
// PERMISSION_MINIMUM_ROLE completeness check
// ============================================================================

describe('PERMISSION_MINIMUM_ROLE coverage', () => {
  it('has an entry for every permission in ALL_PERMISSIONS', () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(PERMISSION_MINIMUM_ROLE).toHaveProperty(perm);
      expect(ROLE_HIERARCHY).toContain(PERMISSION_MINIMUM_ROLE[perm]);
    }
  });
});

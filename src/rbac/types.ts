export const ROLE_HIERARCHY = ['viewer', 'operator', 'deployer', 'admin'] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

export const ALL_PERMISSIONS = [
  'get_account_balance',
  'fetch_contract_spec',
  'decode_ledger_entry',
  'compute_vesting_schedule',
  'simulate_transaction',
  'submit_transaction',
  'deploy_contract',
  'rbac_assign_role',
  'rbac_revoke_role',
  'rbac_list_roles',
  'rbac_check_permission',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_MINIMUM_ROLE: Record<Permission, Role> = {
  get_account_balance: 'viewer',
  fetch_contract_spec: 'viewer',
  decode_ledger_entry: 'viewer',
  compute_vesting_schedule: 'viewer',
  rbac_check_permission: 'viewer',
  simulate_transaction: 'operator',
  submit_transaction: 'deployer',
  deploy_contract: 'deployer',
  rbac_assign_role: 'admin',
  rbac_revoke_role: 'admin',
  rbac_list_roles: 'admin',
};

export interface RoleAssignment {
  account_id: string;
  role: Role;
  granted_at: string;
  granted_by?: string;
}

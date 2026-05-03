export const TOOL_NAMES = [
  'get_account_balance',
  'fetch_contract_spec',
  'submit_transaction',
  'simulate_transaction',
  'compute_vesting_schedule',
  'deploy_contract',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const SUBMIT_TRANSACTION_STATUSES = ['SUBMITTED', 'SUCCESS', 'FAILED', 'TIMEOUT'] as const;

export const SIMULATE_TRANSACTION_STATUSES = ['SUCCESS', 'ERROR', 'RESTORE_NEEDED'] as const;

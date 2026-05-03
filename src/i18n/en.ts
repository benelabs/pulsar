/**
 * English error message catalog for Pulsar.
 * Message keys follow the pattern: CONTEXT_ERROR_NAME
 */

export const en = {
  // Validation errors
  VALIDATION_INVALID_INPUT: 'Invalid input for {tool}',
  VALIDATION_SCHEMA_ERROR: 'Validation schema error',
  VALIDATION_CLIFF_EXCEEDS_DURATION: 'cliff_seconds must be less than vesting_duration_seconds',
  VALIDATION_RELEASE_FREQUENCY_EXCEEDS_DURATION:
    'release_frequency_seconds must not exceed vesting_duration_seconds',
  VALIDATION_STELLAR_SECRET_KEY_NOT_CONFIGURED:
    'sign: true was requested but STELLAR_SECRET_KEY is not configured. Set the environment variable and restart the server, or submit a pre-signed XDR with sign: false.',
  VALIDATION_XDR_PARSE_ERROR: 'Failed to parse XDR: {error}',
  VALIDATION_WASM_HASH_REQUIRED: 'wasm_hash is required for direct deployment mode',
  VALIDATION_WASM_HASH_INVALID_LENGTH: 'wasm_hash must be a 64-character hex string (32 bytes)',
  VALIDATION_SALT_INVALID_LENGTH: 'salt must be a 64-character hex string (32 bytes) if provided',
  VALIDATION_FACTORY_CONTRACT_ID_REQUIRED:
    'factory_contract_id is required for factory deployment mode',
  VALIDATION_DEPLOY_ARG_VALUE_REQUIRED: "deploy_args items must have a 'value' property",
  VALIDATION_CLI_OUTPUT_JSON_PARSE_ERROR: 'Failed to parse stellar CLI output as JSON',

  // Network errors
  NETWORK_ACCOUNT_NOT_FOUND: 'Account not found — it may not be funded yet',
  NETWORK_SOURCE_ACCOUNT_NOT_FOUND:
    'Source account {account} not found. Fund the account before deploying.',
  NETWORK_LOAD_SOURCE_ACCOUNT_FAILED: 'Failed to load source account: {error}',
  NETWORK_LOAD_ACCOUNT_BALANCE_FAILED: 'Failed to load account balance',
  NETWORK_TRANSACTION_SUBMISSION_FAILED: 'Transaction submission failed',
  NETWORK_TRANSACTION_SIMULATION_FAILED: 'Transaction simulation failed',
  NETWORK_CLI_ERROR: 'Stellar CLI error',
  NETWORK_TIMEOUT_WAITING_FOR_TRANSACTION: 'Timeout waiting for transaction result',

  // CLI errors
  CLI_EXECUTION_FAILED: 'Stellar CLI execution failed: {error}',

  // Configuration errors
  CONFIG_HORIZON_URL_REQUIRED: 'HORIZON_URL must be set for custom network',
  CONFIG_SOROBAN_RPC_URL_REQUIRED: 'SOROBAN_RPC_URL must be set for custom network',
} as const;

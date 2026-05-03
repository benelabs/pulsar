/**
 * Spanish error message catalog for Pulsar.
 * Message keys follow the pattern: CONTEXT_ERROR_NAME
 */

export const es = {
  // Validation errors
  VALIDATION_INVALID_INPUT: 'Entrada inválida para {tool}',
  VALIDATION_SCHEMA_ERROR: 'Error de esquema de validación',
  VALIDATION_CLIFF_EXCEEDS_DURATION: 'cliff_seconds debe ser menor que vesting_duration_seconds',
  VALIDATION_RELEASE_FREQUENCY_EXCEEDS_DURATION:
    'release_frequency_seconds no debe exceder vesting_duration_seconds',
  VALIDATION_STELLAR_SECRET_KEY_NOT_CONFIGURED:
    'Se solicitó sign: true pero STELLAR_SECRET_KEY no está configurada. Configure la variable de entorno e reinicie el servidor, o envíe un XDR presignado con sign: false.',
  VALIDATION_XDR_PARSE_ERROR: 'Error al analizar XDR: {error}',
  VALIDATION_WASM_HASH_REQUIRED: 'wasm_hash es obligatorio para modo de implementación directo',
  VALIDATION_WASM_HASH_INVALID_LENGTH:
    'wasm_hash debe ser una cadena hexadecimal de 64 caracteres (32 bytes)',
  VALIDATION_SALT_INVALID_LENGTH:
    'salt debe ser una cadena hexadecimal de 64 caracteres (32 bytes) si se proporciona',
  VALIDATION_FACTORY_CONTRACT_ID_REQUIRED:
    'factory_contract_id es obligatorio para modo de implementación de fábrica',
  VALIDATION_DEPLOY_ARG_VALUE_REQUIRED: "deploy_args items debe tener una propiedad 'value'",
  VALIDATION_CLI_OUTPUT_JSON_PARSE_ERROR: 'Error al analizar salida JSON de CLI de Stellar',

  // Network errors
  NETWORK_ACCOUNT_NOT_FOUND: 'Cuenta no encontrada — es posible que aún no esté financiada',
  NETWORK_SOURCE_ACCOUNT_NOT_FOUND:
    'Cuenta de origen {account} no encontrada. Financie la cuenta antes de desplegar.',
  NETWORK_LOAD_SOURCE_ACCOUNT_FAILED: 'Error al cargar la cuenta de origen: {error}',
  NETWORK_LOAD_ACCOUNT_BALANCE_FAILED: 'Error al cargar el saldo de la cuenta',
  NETWORK_TRANSACTION_SUBMISSION_FAILED: 'Error en el envío de transacciones',
  NETWORK_TRANSACTION_SIMULATION_FAILED: 'Error en la simulación de transacciones',
  NETWORK_CLI_ERROR: 'Error de CLI de Stellar',
  NETWORK_TIMEOUT_WAITING_FOR_TRANSACTION:
    'Tiempo de espera agotado esperando resultado de transacción',

  // CLI errors
  CLI_EXECUTION_FAILED: 'Error de ejecución de CLI de Stellar: {error}',

  // Configuration errors
  CONFIG_HORIZON_URL_REQUIRED: 'HORIZON_URL debe establecerse para red personalizada',
  CONFIG_SOROBAN_RPC_URL_REQUIRED: 'SOROBAN_RPC_URL debe establecerse para red personalizada',
} as const;

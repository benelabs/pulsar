export enum PulsarErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CLI_ERROR = 'CLI_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED_ERROR = 'UNAUTHORIZED_ERROR',
  FORBIDDEN_ERROR = 'FORBIDDEN_ERROR',
  PARTITION_DETECTED = 'PARTITION_DETECTED',
  RESTRICTED_ADDRESS = 'RESTRICTED_ADDRESS',
}

export interface ErrorDetails {
  [key: string]: unknown;
}

export class PulsarError extends Error {
  constructor(
    public readonly code: PulsarErrorCode,
    message: string,
    public readonly details?: ErrorDetails
  ) {
    super(message);
    this.name = 'PulsarError';
    Object.setPrototypeOf(this, PulsarError.prototype);
  }
}

export class PulsarValidationError extends PulsarError {
  constructor(message: string, details?: ErrorDetails) {
    super(PulsarErrorCode.VALIDATION_ERROR, message, details);
    this.name = 'PulsarValidationError';
  }
}

export class PulsarNetworkError extends PulsarError {
  constructor(message: string, details?: ErrorDetails) {
    super(PulsarErrorCode.NETWORK_ERROR, message, details);
    this.name = 'PulsarNetworkError';
  }
}

export class PulsarCliError extends PulsarError {
  constructor(message: string, details?: ErrorDetails) {
    super(PulsarErrorCode.CLI_ERROR, message, details);
    this.name = 'PulsarCliError';
  }
}

export class PulsarNotFoundError extends PulsarError {
  constructor(message: string, details?: ErrorDetails) {
    super(PulsarErrorCode.NOT_FOUND_ERROR, message, details);
    this.name = 'PulsarNotFoundError';
  }
}

export class PulsarUnauthorizedError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.UNAUTHORIZED_ERROR, message, details);
    this.name = 'PulsarUnauthorizedError';
  }
}

export class PulsarForbiddenError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.FORBIDDEN_ERROR, message, details);
    this.name = 'PulsarForbiddenError';
export class PulsarPartitionError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.PARTITION_DETECTED, message, details);
    this.name = 'PulsarPartitionError';
export class PulsarRestrictedAddressError extends PulsarError {
  constructor(address: string, toolName: string) {
    super(
      PulsarErrorCode.RESTRICTED_ADDRESS,
      `Address '${address}' is restricted and cannot be used with tool '${toolName}'`,
      { address, tool: toolName }
    );
    this.name = 'PulsarRestrictedAddressError';
  }
}

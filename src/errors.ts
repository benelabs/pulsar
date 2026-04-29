export enum PulsarErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CLI_ERROR = 'CLI_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PARTITION_DETECTED = 'PARTITION_DETECTED',
}

export class PulsarError extends Error {
  constructor(
    public readonly code: PulsarErrorCode,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'PulsarError';
    Object.setPrototypeOf(this, PulsarError.prototype);
  }
}

export class PulsarValidationError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.VALIDATION_ERROR, message, details);
    this.name = 'PulsarValidationError';
  }
}

export class PulsarNetworkError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.NETWORK_ERROR, message, details);
    this.name = 'PulsarNetworkError';
  }
}

export class PulsarCliError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.CLI_ERROR, message, details);
    this.name = 'PulsarCliError';
  }
}

export class PulsarNotFoundError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.NOT_FOUND_ERROR, message, details);
    this.name = 'PulsarNotFoundError';
  }
}

export class PulsarPartitionError extends PulsarError {
  constructor(message: string, details?: any) {
    super(PulsarErrorCode.PARTITION_DETECTED, message, details);
    this.name = 'PulsarPartitionError';
  }
}

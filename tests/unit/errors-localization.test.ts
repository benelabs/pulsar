import { describe, it, expect, beforeEach } from 'vitest';

import { setLanguage } from '../../src/i18n/index.js';
import {
  PulsarError,
  PulsarValidationError,
  PulsarNetworkError,
  PulsarCliError,
  PulsarErrorCode,
} from '../../src/errors.js';

describe('Error Localization Integration', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  describe('PulsarError.getLocalizedMessage()', () => {
    it('should return localized message for English', () => {
      const error = new PulsarError(PulsarErrorCode.VALIDATION_ERROR, 'Original message');

      const localized = error.getLocalizedMessage('VALIDATION_INVALID_INPUT', {
        tool: 'test_tool',
      });
      expect(localized).toBe('Invalid input for test_tool');
    });

    it('should return localized message for Spanish', () => {
      setLanguage('es');
      const error = new PulsarError(PulsarErrorCode.VALIDATION_ERROR, 'Original message');

      const localized = error.getLocalizedMessage('VALIDATION_INVALID_INPUT', {
        tool: 'test_tool',
      });
      expect(localized).toBe('Entrada inválida para test_tool');
    });

    it('should fallback to original message if no key provided', () => {
      const error = new PulsarError(PulsarErrorCode.VALIDATION_ERROR, 'Custom error message');

      const localized = error.getLocalizedMessage();
      expect(localized).toBe('Custom error message');
    });

    it('should work with PulsarValidationError', () => {
      const error = new PulsarValidationError('Invalid input');
      const localized = error.getLocalizedMessage('VALIDATION_CLIFF_EXCEEDS_DURATION');
      expect(localized).toBe('cliff_seconds must be less than vesting_duration_seconds');
    });

    it('should work with PulsarNetworkError', () => {
      const error = new PulsarNetworkError('Network failed');
      const localized = error.getLocalizedMessage('NETWORK_ACCOUNT_NOT_FOUND');
      expect(localized).toContain('not found');
    });

    it('should work with PulsarCliError', () => {
      const error = new PulsarCliError('CLI failed');
      const localized = error.getLocalizedMessage('CLI_EXECUTION_FAILED', {
        error: 'timeout',
      });
      expect(localized).toContain('timeout');
    });
  });

  describe('Error code preservation', () => {
    it('should preserve error code with localization', () => {
      const error = new PulsarValidationError('Error message');
      expect(error.code).toBe(PulsarErrorCode.VALIDATION_ERROR);

      const localized = error.getLocalizedMessage('VALIDATION_INVALID_INPUT', {
        tool: 'deploy',
      });
      expect(error.code).toBe(PulsarErrorCode.VALIDATION_ERROR);
      expect(localized).toContain('deploy');
    });

    it('should preserve error name with localization', () => {
      const error = new PulsarNetworkError('Network error');
      expect(error.name).toBe('PulsarNetworkError');

      error.getLocalizedMessage('NETWORK_ACCOUNT_NOT_FOUND');
      expect(error.name).toBe('PulsarNetworkError');
    });

    it('should preserve error details with localization', () => {
      const details = { status: 404, account: 'GB123' };
      const error = new PulsarNetworkError('Error', details);

      expect(error.details).toEqual(details);
      error.getLocalizedMessage('NETWORK_ACCOUNT_NOT_FOUND');
      expect(error.details).toEqual(details);
    });
  });

  describe('Real-world error scenarios', () => {
    it('should localize validation error for invalid vesting parameters', () => {
      const error = new PulsarValidationError('Validation failed');
      const localized = error.getLocalizedMessage('VALIDATION_CLIFF_EXCEEDS_DURATION');
      expect(localized).toBe('cliff_seconds must be less than vesting_duration_seconds');

      setLanguage('es');
      const localizedEs = error.getLocalizedMessage('VALIDATION_CLIFF_EXCEEDS_DURATION');
      expect(localizedEs).toBe('cliff_seconds debe ser menor que vesting_duration_seconds');
    });

    it('should localize network error for account not found', () => {
      const error = new PulsarNetworkError('Account not found', {
        account_id: 'GABC123',
      });

      const localized = error.getLocalizedMessage('NETWORK_ACCOUNT_NOT_FOUND');
      expect(localized).toContain('Account not found');

      setLanguage('es');
      const localizedEs = error.getLocalizedMessage('NETWORK_ACCOUNT_NOT_FOUND');
      expect(localizedEs).toContain('Cuenta no encontrada');
    });

    it('should localize configuration error messages', () => {
      const error = new PulsarValidationError('Config error');

      const localized = error.getLocalizedMessage('CONFIG_HORIZON_URL_REQUIRED');
      expect(localized).toContain('HORIZON_URL');

      setLanguage('es');
      const localizedEs = error.getLocalizedMessage('CONFIG_HORIZON_URL_REQUIRED');
      expect(localizedEs).toContain('HORIZON_URL');
    });
  });

  describe('Multiple language switching during error handling', () => {
    it('should return different messages for same error in different languages', () => {
      const error = new PulsarValidationError('Error');

      setLanguage('en');
      const enMsg = error.getLocalizedMessage('VALIDATION_INVALID_INPUT', {
        tool: 'get_account_balance',
      });

      setLanguage('es');
      const esMsg = error.getLocalizedMessage('VALIDATION_INVALID_INPUT', {
        tool: 'get_account_balance',
      });

      expect(enMsg).not.toEqual(esMsg);
      expect(enMsg).toContain('Invalid input');
      expect(esMsg).toContain('Entrada inválida');
    });
  });
});

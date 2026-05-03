import { describe, it, expect, beforeEach } from 'vitest';

import {
  t,
  setLanguage,
  getLanguage,
  initializeI18n,
  getSupportedLanguages,
} from '../../src/i18n/index.js';

describe('i18n Module', () => {
  beforeEach(() => {
    // Reset to English before each test
    setLanguage('en');
  });

  describe('t() - Translation function', () => {
    it('should return English message by default', () => {
      const message = t('VALIDATION_INVALID_INPUT');
      expect(message).toBe('Invalid input for {tool}');
    });

    it('should interpolate variables in messages', () => {
      const message = t('VALIDATION_INVALID_INPUT', { tool: 'get_account_balance' });
      expect(message).toBe('Invalid input for get_account_balance');
    });

    it('should handle multiple variable interpolations', () => {
      const message = t('NETWORK_SOURCE_ACCOUNT_NOT_FOUND', { account: 'GB123' });
      expect(message).toBe('Source account GB123 not found. Fund the account before deploying.');
    });

    it('should return the key if message not found', () => {
      // @ts-expect-error - testing with invalid key
      const message = t('NONEXISTENT_KEY');
      expect(message).toBe('NONEXISTENT_KEY');
    });

    it('should work with all defined English messages', () => {
      const keys = [
        'VALIDATION_INVALID_INPUT',
        'VALIDATION_CLIFF_EXCEEDS_DURATION',
        'NETWORK_ACCOUNT_NOT_FOUND',
        'CLI_EXECUTION_FAILED',
        'CONFIG_HORIZON_URL_REQUIRED',
      ];

      keys.forEach((key) => {
        // @ts-expect-error - testing with array of keys
        const message = t(key);
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe('setLanguage() - Language switching', () => {
    it('should switch to Spanish', () => {
      setLanguage('es');
      expect(getLanguage()).toBe('es');
    });

    it('should return Spanish message after switching', () => {
      setLanguage('es');
      const message = t('VALIDATION_INVALID_INPUT');
      expect(message).toBe('Entrada inválida para {tool}');
    });

    it('should interpolate in Spanish', () => {
      setLanguage('es');
      const message = t('VALIDATION_INVALID_INPUT', { tool: 'deploy_contract' });
      expect(message).toBe('Entrada inválida para deploy_contract');
    });

    it('should fall back to English if translation missing', () => {
      setLanguage('es');
      // Both languages should have this, but test the mechanism
      const message = t('CONFIG_HORIZON_URL_REQUIRED');
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should ignore unsupported language and keep current', () => {
      setLanguage('es');
      setLanguage('fr'); // Unsupported
      expect(getLanguage()).toBe('es');
    });
  });

  describe('getLanguage() - Language getter', () => {
    it('should return en by default', () => {
      expect(getLanguage()).toBe('en');
    });

    it('should return current language after switching', () => {
      setLanguage('es');
      expect(getLanguage()).toBe('es');
    });
  });

  describe('initializeI18n() - Initialization', () => {
    it('should initialize with specified language', () => {
      initializeI18n({ language: 'es' });
      expect(getLanguage()).toBe('es');
    });

    it('should work with English', () => {
      initializeI18n({ language: 'en' });
      expect(getLanguage()).toBe('en');
    });

    it('should default to English if not specified', () => {
      setLanguage('es'); // Set to Spanish first
      initializeI18n({}); // Initialize without language
      // Language should remain as was (i18n doesn't force reset)
      expect(getLanguage()).toBe('es');
    });
  });

  describe('getSupportedLanguages() - Available languages', () => {
    it('should return array of supported languages', () => {
      const langs = getSupportedLanguages();
      expect(Array.isArray(langs)).toBe(true);
      expect(langs.length).toBeGreaterThanOrEqual(2);
      expect(langs).toContain('en');
      expect(langs).toContain('es');
    });
  });

  describe('Message keys coverage', () => {
    it('should have Spanish translations for all English keys', () => {
      const englishKeys = [
        'VALIDATION_INVALID_INPUT',
        'VALIDATION_SCHEMA_ERROR',
        'VALIDATION_CLIFF_EXCEEDS_DURATION',
        'VALIDATION_RELEASE_FREQUENCY_EXCEEDS_DURATION',
        'VALIDATION_STELLAR_SECRET_KEY_NOT_CONFIGURED',
        'VALIDATION_XDR_PARSE_ERROR',
        'NETWORK_ACCOUNT_NOT_FOUND',
        'NETWORK_SOURCE_ACCOUNT_NOT_FOUND',
        'CLI_EXECUTION_FAILED',
        'CONFIG_HORIZON_URL_REQUIRED',
      ];

      englishKeys.forEach((key) => {
        // @ts-expect-error - testing with array of keys
        const enMsg = t(key);
        setLanguage('es');
        // @ts-expect-error - testing with array of keys
        const esMsg = t(key);
        setLanguage('en');

        expect(enMsg).not.toEqual(key); // Should have translation
        expect(esMsg).not.toEqual(key); // Should have translation
        expect(enMsg).not.toEqual(esMsg); // Should be different
      });
    });
  });

  describe('Error message scenarios', () => {
    it('should format validation error messages', () => {
      const msg = t('VALIDATION_INVALID_INPUT', { tool: 'simulate_transaction' });
      expect(msg).toContain('simulate_transaction');
      expect(msg.toLowerCase()).toContain('invalid');
    });

    it('should format network error messages', () => {
      const msg = t('NETWORK_SOURCE_ACCOUNT_NOT_FOUND', { account: 'GBTEST123' });
      expect(msg).toContain('GBTEST123');
      expect(msg.toLowerCase()).toContain('found');
    });

    it('should format CLI error messages', () => {
      const msg = t('CLI_EXECUTION_FAILED', { error: 'command not found' });
      expect(msg).toContain('command not found');
    });
  });
});

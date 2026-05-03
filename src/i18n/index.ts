import { en } from './en.js';
import { es } from './es.js';

export type SupportedLanguage = 'en' | 'es';
export type MessageKey = keyof typeof en;

type MessageCatalog = Record<MessageKey, string>;

interface I18nOptions {
  language?: SupportedLanguage;
}

/**
 * Pulsar internationalization (i18n) module.
 * Manages error message translation and language switching.
 *
 * Supports:
 * - Multiple languages (en, es, etc.)
 * - Message interpolation with {variable} syntax
 * - Fallback to English if translation not available
 */
class I18nManager {
  private language: SupportedLanguage = 'en';
  private catalogs: Record<SupportedLanguage, MessageCatalog> = {
    en,
    es,
  };

  /**
   * Set the active language for message translation.
   * Falls back to English if language not supported.
   */
  setLanguage(language: string): void {
    if (this.catalogs[language as SupportedLanguage]) {
      this.language = language as SupportedLanguage;
    }
  }

  /**
   * Get the currently active language.
   */
  getLanguage(): SupportedLanguage {
    return this.language;
  }

  /**
   * Get a translated message by key, with optional variable interpolation.
   * Falls back to English if the key is missing in the selected language.
   *
   * @param key - Message key from the catalog
   * @param variables - Object with variables to interpolate in {varName} syntax
   * @returns Translated and interpolated message string
   */
  getMessage(key: MessageKey, variables?: Record<string, string | number>): string {
    const catalog = this.catalogs[this.language];
    let message = catalog[key];

    // Fallback to English if key missing in selected language
    if (!message) {
      message = this.catalogs.en[key];
    }

    // If still not found, return the key itself
    if (!message) {
      return key;
    }

    // Interpolate variables if provided
    if (variables) {
      return this.interpolate(message, variables);
    }

    return message;
  }

  /**
   * Interpolate variables into a message string.
   * Replaces {varName} with the corresponding value from the variables object.
   */
  private interpolate(message: string, variables: Record<string, string | number>): string {
    return message.replace(/{(\w+)}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }
}

// Global instance
const i18n = new I18nManager();

/**
 * Initialize i18n with optional language setting.
 * Typically called during app startup.
 */
export function initializeI18n(options?: I18nOptions): void {
  if (options?.language) {
    i18n.setLanguage(options.language);
  }
}

/**
 * Get a translated message.
 * @param key - Message key from the catalog
 * @param variables - Optional variables for interpolation
 * @returns Translated message string
 */
export function t(key: MessageKey, variables?: Record<string, string | number>): string {
  return i18n.getMessage(key, variables);
}

/**
 * Set the active language for all subsequent translations.
 */
export function setLanguage(language: string): void {
  i18n.setLanguage(language);
}

/**
 * Get the currently active language.
 */
export function getLanguage(): SupportedLanguage {
  return i18n.getLanguage();
}

/**
 * Get all supported languages.
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(i18n['catalogs']) as SupportedLanguage[];
}

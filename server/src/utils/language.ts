import { z } from 'zod';

export const SUPPORTED_LANGUAGES = ['id', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'id';

export const LanguageSchema = z.enum(SUPPORTED_LANGUAGES, { message: 'Bahasa harus id atau en.' });

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** The user's own choice wins; otherwise the company default; otherwise Indonesian. */
export function resolveLanguage(userLanguage: unknown, companyDefault: unknown): Language {
  if (isLanguage(userLanguage)) return userLanguage;
  if (isLanguage(companyDefault)) return companyDefault;
  return DEFAULT_LANGUAGE;
}

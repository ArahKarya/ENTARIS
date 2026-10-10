/** UI languages and pure helpers. The server mirrors SUPPORTED_LANGUAGES in utils/language.ts. */
export const SUPPORTED_LANGUAGES = ['id', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'id';
export const LANGUAGE_STORAGE_KEY = 'lang';

export const LANGUAGE_OPTIONS: ReadonlyArray<{ id: Language; label: string }> = [
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'en', label: 'English' },
];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/** Intl locale for number and date formatting. */
export function localeFor(language: Language): string {
  return language === 'en' ? 'en-US' : 'id-ID';
}

export function readStoredLanguage(): Language {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function writeStoredLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* storage blocked: the choice lasts for this session */
  }
}

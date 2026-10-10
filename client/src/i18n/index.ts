/**
 * i18next setup. Translations live in src/locales/<lang>/<namespace>.json (see docs/i18n/README.md).
 * Namespaces in EAGER_NAMESPACES ship in the entry chunk because the shell renders them before any
 * page; every other namespace loads on first use, and the component suspends until it arrives.
 */
import i18n, { type BackendModule, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setFormatLocale } from '@/lib/format';
import { localeFor, normalizeLanguage, readStoredLanguage, writeStoredLanguage, type Language } from './language';

export const EAGER_NAMESPACES = ['common', 'shell', 'auth'] as const;

const eagerFiles = import.meta.glob<{ default: ResourceKey }>('../locales/*/{common,shell,auth}.json', { eager: true });
const lazyFiles = import.meta.glob<{ default: ResourceKey }>('../locales/*/*.json');

function fileKey(lng: string, ns: string): string {
  return `../locales/${lng}/${ns}.json`;
}

const resources: Record<string, Record<string, ResourceKey>> = {};
for (const [path, mod] of Object.entries(eagerFiles)) {
  const [, lng, ns] = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? [];
  if (lng && ns) (resources[lng] ??= {})[ns] = mod.default;
}

const lazyBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(lng, ns, callback) {
    const load = lazyFiles[fileKey(lng, ns)];
    if (!load) return callback(null, {});
    load().then(
      (mod) => callback(null, mod.default),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
    );
  },
};

function applyLanguageSideEffects(language: Language): void {
  setFormatLocale(localeFor(language));
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

const initial = readStoredLanguage();
applyLanguageSideEffects(initial);

void i18n
  .use(lazyBackend)
  .use(initReactI18next)
  .init({
    lng: initial,
    fallbackLng: 'id',
    supportedLngs: ['id', 'en'],
    ns: [...EAGER_NAMESPACES],
    defaultNS: 'common',
    resources,
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: true },
  });

i18n.on('languageChanged', (lng) => applyLanguageSideEffects(normalizeLanguage(lng)));

/** Switch the UI language now and remember it on this device. */
export function setUiLanguage(language: unknown): void {
  const next = normalizeLanguage(language);
  writeStoredLanguage(next);
  if (i18n.language !== next) void i18n.changeLanguage(next);
}

export default i18n;

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { setUiLanguage } from '@/i18n';
import { LANGUAGE_OPTIONS, normalizeLanguage, type Language } from '@/i18n/language';

/** Saves the signed-in user's UI language and switches the app right away. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation('settings');
  const current = normalizeLanguage(i18n.language);
  const [saving, setSaving] = useState<Language | null>(null);

  const choose = async (next: Language) => {
    if (next === current || saving) return;
    const previous = current;
    setSaving(next);
    setUiLanguage(next);
    try {
      await api.put('/users/me/language', { language: next });
      try {
        const stored = JSON.parse(localStorage.getItem('user') ?? 'null');
        if (stored) localStorage.setItem('user', JSON.stringify({ ...stored, language: next, languagePreference: next }));
      } catch {
        /* cached profile is refreshed on the next /auth/me */
      }
    } catch {
      setUiLanguage(previous);
      toast.error(t('appearance.language.saveError'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div role="radiogroup" aria-label={t('appearance.language.title')} className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {LANGUAGE_OPTIONS.map((option) => {
        const active = current === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            lang={option.id}
            disabled={saving !== null}
            onClick={() => void choose(option.id)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors disabled:cursor-wait',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active ? 'border-primary bg-primary-subtle' : 'border-border bg-card hover:border-border-strong hover:bg-accent',
            )}
          >
            <span className="block text-sm font-semibold text-foreground">{option.label}</span>
            {active && <span className="mt-1 block text-xs font-medium text-primary-subtle-foreground">{t('appearance.active')}</span>}
          </button>
        );
      })}
    </div>
  );
}

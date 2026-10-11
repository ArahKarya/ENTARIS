// Keadaan kosong: sapaan + tiga contoh permintaan (klik = isi kotak pesan).

import { useTranslation } from 'react-i18next';
import { AiraIcon } from '@/components/shell/AiraIcon';
import { cn } from '@/lib/utils';
import { examplePrompts } from './examples';

export function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useTranslation('aira');
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4 text-center sm:mt-12">
      <AiraIcon size={48} />
      <div>
        <p className="font-heading text-base font-semibold text-foreground">{t('empty.title')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('empty.description')}
        </p>
      </div>
      <ul className="flex w-full flex-col gap-2" aria-label={t('empty.examplesLabel')}>
        {examplePrompts().map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                'w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground-secondary shadow-[var(--shadow-1)]',
                'transition-colors hover:border-aira hover:bg-surface-hover',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Keadaan kosong: sapaan + tiga contoh permintaan (klik = isi kotak pesan).

import { AiraIcon } from '@/components/shell/AiraIcon';
import { cn } from '@/lib/utils';
import { EXAMPLE_PROMPTS } from './examples';

export function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-4 text-center sm:mt-12">
      <AiraIcon size={48} />
      <div>
        <p className="font-heading text-base font-semibold text-foreground">Apa yang bisa AIRA bantu?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tulis permintaan dalam bahasa sehari-hari atau lampirkan foto nota. Percakapan Anda tersimpan di Entaris dan aksi penting menunggu persetujuan.
        </p>
      </div>
      <ul className="flex w-full flex-col gap-2" aria-label="Contoh permintaan">
        {EXAMPLE_PROMPTS.map((p) => (
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

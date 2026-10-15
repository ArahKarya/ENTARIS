import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ConfirmChoice, ConfirmPart } from './types';

interface Props {
  confirm: ConfirmPart;
  /** Ada selama kartu ini pesan terakhir dan AIRA tidak sedang menjawab. */
  onAnswer?: (choice: ConfirmChoice) => void;
  /** waktu tetap untuk tes; tanpa ini kartu berganti ke "kedaluwarsa" sendiri tepat waktunya */
  now?: Date;
}

// setTimeout menyimpan jeda sebagai int32: kartu yang kedaluwarsa lebih jauh diperiksa lagi nanti.
const MAX_WAIT_MS = 2 ** 31 - 1;

/** true begitu `expiresAt` lewat, tanpa menunggu render lain (kartu terbuka di layar lalu ditinggal). */
function useExpired(expiresAt: string, settled: boolean): boolean {
  const deadline = new Date(expiresAt).getTime();
  const [mountedAt] = useState(() => Date.now());
  const [passed, setPassed] = useState<number | null>(null);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    if (settled || passed === deadline) return undefined;
    const wait = Math.max(0, deadline - Date.now());
    const id = setTimeout(() => {
      if (Date.now() >= deadline) setPassed(deadline);
      else setRecheck((n) => n + 1); // jeda dipotong MAX_WAIT_MS: tunggu lagi
    }, Math.min(wait + 50, MAX_WAIT_MS));
    return () => clearTimeout(id);
  }, [deadline, settled, passed, recheck]);
  return deadline <= mountedAt || passed === deadline;
}

/** Kartu konfirmasi aksi tulis: teks resmi dari Entaris (bukan kata-kata model) + tombol Ya/Batal.
 *  Semua isi dirender sebagai teks biasa. */
export function ConfirmCard({ confirm, onAnswer, now }: Props) {
  const { t } = useTranslation('aira');
  const live = useExpired(confirm.expiresAt, Boolean(confirm.answered) || now !== undefined);
  const expired = now !== undefined ? new Date(confirm.expiresAt) <= now : live;
  let state: string | null = null;
  if (confirm.answered) state = t(confirm.answered === 'ya' ? 'confirm.answeredYes' : 'confirm.answeredNo');
  else if (expired) state = t('confirm.expired');
  else if (!onAnswer) state = t('confirm.notLast');
  return (
    <div role="group" aria-label={t('confirm.label')} className="w-fit max-w-full space-y-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
      <p className="font-medium text-card-foreground">{confirm.konfirmasi}</p>
      {confirm.rincian.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {confirm.rincian.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 break-words tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {confirm.efek && <p className="text-xs text-muted-foreground">{t('confirm.effect')}: {confirm.efek}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {t(confirm.tindakan === 'persetujuan' ? 'confirm.queued' : 'confirm.direct')}
      </p>
      {state ? (
        <p className="text-xs text-muted-foreground">{state}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="primary" onClick={() => onAnswer?.('ya')}>{t('confirm.yes')}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onAnswer?.('batal')}>{t('confirm.no')}</Button>
        </div>
      )}
    </div>
  );
}

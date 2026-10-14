import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ConfirmChoice, ConfirmPart } from './types';

interface Props {
  confirm: ConfirmPart;
  /** Ada selama kartu ini pesan terakhir dan AIRA tidak sedang menjawab. */
  onAnswer?: (choice: ConfirmChoice) => void;
  now?: Date;
}

/** Tombol Ya/Batal untuk kartu konfirmasi aksi tulis; isi kartu sudah tampil sebagai teks pesan. */
export function ConfirmCard({ confirm, onAnswer, now = new Date() }: Props) {
  const { t } = useTranslation('aira');
  const expired = new Date(confirm.expiresAt) <= now;
  let state: string | null = null;
  if (confirm.answered) state = t(confirm.answered === 'ya' ? 'confirm.answeredYes' : 'confirm.answeredNo');
  else if (expired) state = t('confirm.expired');
  else if (!onAnswer) state = t('confirm.notLast');
  return (
    <div role="group" aria-label={t('confirm.label')} className="w-fit max-w-full space-y-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
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

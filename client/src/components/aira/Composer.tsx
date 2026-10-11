// Kotak pesan: Enter kirim, Shift+Enter baris baru, Esc hentikan, lampiran (gambar/PDF) dengan chip pratinjau.

import { forwardRef, useRef } from 'react';
import { FileText, Image as ImageIcon, Paperclip, Send, Square, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';

const MAX_BYTES = 10 * 1024 * 1024;

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  file: File | null;
  onFile: (f: File | null) => void;
  acceptsPdf: boolean;
}

export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { value, onChange, onSend, onStop, busy, file, onFile, acceptsPdf },
  ref,
) {
  const { t } = useTranslation('aira');
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !busy && (!!value.trim() || !!file);
  const accept = acceptsPdf ? 'application/pdf,image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp';
  return (
    <form
      className="mt-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      {file && (
        <div className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-primary-subtle px-3 py-1.5 text-xs text-primary-subtle-foreground">
          {file.type.startsWith('image/') ? <ImageIcon className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
          <span className="max-w-[200px] truncate">{file.name}</span>
          <span className="text-foreground-secondary">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="ml-1 rounded-sm hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('composer.removeAttachment', { name: file.name })}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (f.size > MAX_BYTES) toast.error(t('composer.fileTooLarge'));
              else onFile(f);
            }
            e.target.value = '';
          }}
        />
        <SimpleTooltip content={t(acceptsPdf ? 'composer.attachImageOrPdf' : 'composer.attachImage')}>
          <Button type="button" variant="outline" size="icon-touch" className="rounded-lg text-muted-foreground" onClick={() => fileRef.current?.click()} disabled={busy} aria-label={t('composer.attachFile')}>
            <Paperclip className="size-5" aria-hidden />
          </Button>
        </SimpleTooltip>
        <label htmlFor="aira-input" className="sr-only">{t('composer.inputLabel')}</label>
        <Textarea
          id="aira-input"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            } else if (e.key === 'Escape' && busy) {
              e.preventDefault();
              onStop();
            }
          }}
          rows={1}
          aria-describedby="aira-input-hint"
          placeholder={t('composer.placeholder')}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-lg px-3.5 py-2.5"
        />
        {busy ? (
          <Button type="button" variant="outline" size="icon-touch" className="rounded-lg" onClick={onStop} aria-label={t('composer.stop')}>
            <Square className="size-4 fill-current" aria-hidden />
          </Button>
        ) : (
          <Button type="submit" size="icon-touch" className="rounded-lg" disabled={!canSend} aria-label={t('composer.send')}>
            <Send className="size-5" aria-hidden />
          </Button>
        )}
      </div>
      <p id="aira-input-hint" className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
        {t('composer.hint')}
      </p>
    </form>
  );
});

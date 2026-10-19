import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface CopyButtonProps {
  value: string;
  /** Nama yang disalin, dipakai untuk label aksesibel + toast ("Perintah", "Token"). */
  what: string;
  size?: 'sm' | 'icon-sm';
}

/** Tombol salin ke clipboard dengan umpan balik (ikon + toast). */
export function CopyButton({ value, what, size = 'sm' }: CopyButtonProps) {
  const { t } = useTranslation('aira');
  const [done, setDone] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      toast.success(t('mcp.copy.copied', { what }));
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error(t('mcp.copy.failed'));
    }
  };

  return (
    <Button type="button" variant="outline" size={size} onClick={copy} aria-label={t('mcp.copy.copyWhat', { what })}>
      {done ? <Check aria-hidden className="text-success" /> : <Copy aria-hidden />}
      {size === 'sm' && <span>{t(done ? 'mcp.copy.done' : 'mcp.copy.copy')}</span>}
    </Button>
  );
}

/** Blok kode satu/multi baris, dapat di-scroll horizontal, dengan tombol salin. */
export function CodeLine({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-start gap-2">
        <Textarea
          readOnly
          wrap="off"
          rows={value.split('\n').length}
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-0 min-w-0 flex-1 basis-60 resize-none overflow-x-auto bg-muted font-mono text-xs leading-5"
        />
        <CopyButton value={value} what={what} />
      </div>
    </div>
  );
}

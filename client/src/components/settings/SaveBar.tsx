import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SaveBarProps {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  /** Discard local changes. Hidden when omitted. */
  onReset?: () => void;
  saveLabel?: string;
  /** Block saving (e.g. validation errors) while keeping reset available. */
  saveDisabled?: boolean;
  /** Extra hint, e.g. why saving is blocked. */
  message?: string;
  className?: string;
}

/** Sticky save bar shown at the bottom of a settings form. */
export function SaveBar({ dirty, saving = false, onSave, onReset, saveLabel = 'Simpan', saveDisabled = false, message, className }: SaveBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-[var(--shadow-2)] backdrop-blur supports-[backdrop-filter]:bg-card/85',
        className,
      )}
    >
      <p className="min-w-0 text-sm text-muted-foreground" aria-live="polite">
        {message ?? (dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan sudah tersimpan.')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onReset && (
          <Button variant="outline" onClick={onReset} disabled={!dirty || saving}>
            Batalkan
          </Button>
        )}
        <Button onClick={onSave} disabled={!dirty || saveDisabled} loading={saving}>
          {!saving && <Save aria-hidden />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

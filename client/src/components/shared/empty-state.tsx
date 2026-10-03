import type { ReactNode } from 'react';
import { AlertTriangle, FileQuestion, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateKind = 'empty' | 'no-results' | 'error';

const PRESETS: Record<EmptyStateKind, { icon: LucideIcon; title: string; description: string }> = {
  empty: { icon: FileQuestion, title: 'Belum ada data', description: 'Data yang Anda buat akan muncul di sini.' },
  'no-results': {
    icon: SearchX,
    title: 'Tidak ada hasil',
    description: 'Coba ubah kata kunci atau hapus sebagian filter.',
  },
  error: { icon: AlertTriangle, title: 'Data gagal dimuat', description: 'Periksa koneksi Anda lalu coba lagi.' },
};

export interface EmptyStateProps {
  /** empty = nothing created yet · no-results = filters hide everything · error = load failed */
  kind?: EmptyStateKind;
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  /** Primary next step, e.g. <Button>Buat invoice</Button>. */
  action?: ReactNode;
  /** Tighter spacing for use inside cards and table bodies. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ kind = 'empty', icon, title, description, action, compact, className }: EmptyStateProps) {
  const preset = PRESETS[kind];
  const Icon = icon ?? preset.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-16', className)}
    >
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-xl',
          kind === 'error' ? 'bg-danger-subtle text-danger-text' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-8" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{title ?? preset.title}</p>
      {(description ?? preset.description) && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description ?? preset.description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

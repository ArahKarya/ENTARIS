// Daftar sesi (kiri / drawer di 390px): pencarian, "Sesi baru", kelompok waktu, ubah nama inline,
// arsip + filter Arsip (pulihkan), hapus (konfirmasi), ekspor, muat lagi.

import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Download, Loader2, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { cn } from '@/lib/utils';
import { groupSessions } from './sessionGroups';
import type { ChatSessionDto, SessionStatus } from './types';

export interface SessionListProps {
  sessions: ChatSessionDto[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  search: string;
  onSearch: (q: string) => void;
  status: SessionStatus;
  onStatus: (s: SessionStatus) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

const titleOf = (s: ChatSessionDto): string => s.title || 'Percakapan baru';

function SessionRow(props: {
  s: ChatSessionDto;
  active: boolean;
  archived: boolean;
  onSelect: () => void;
  onRename: (t: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const { s, active, archived } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    const t = draft.trim();
    if (t && t !== s.title) props.onRename(t);
    setEditing(false);
  };
  if (editing) {
    return (
      <li className="flex items-center gap-1 px-1 py-1">
        <Input
          ref={(el) => el?.focus()}
          value={draft}
          maxLength={120}
          aria-label="Nama sesi"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-8 flex-1 text-sm"
        />
        <Button size="icon-sm" variant="ghost" className="size-7" onClick={commit} aria-label="Simpan nama"><Check className="size-3.5" aria-hidden /></Button>
        <Button size="icon-sm" variant="ghost" className="size-7" onClick={() => setEditing(false)} aria-label="Batal ubah nama"><X className="size-3.5" aria-hidden /></Button>
      </li>
    );
  }
  const act = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <SimpleTooltip content={label}>
      <Button size="icon-sm" variant="ghost" className={cn('size-7 text-muted-foreground', danger && 'hover:text-danger-text')} onClick={onClick} aria-label={`${label}: ${titleOf(s)}`}>
        {icon}
      </Button>
    </SimpleTooltip>
  );
  return (
    <li className={cn('group flex items-center gap-1 rounded-md pr-1', active ? 'bg-primary-subtle' : 'hover:bg-surface-hover')}>
      <button
        type="button"
        onClick={props.onSelect}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('block truncate', active ? 'font-medium text-primary-subtle-foreground' : 'text-foreground')}>{titleOf(s)}</span>
        {s.busy && <span className="text-xs text-muted-foreground">Sedang menjawab…</span>}
      </button>
      <div className="flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {act('Ubah nama', <Pencil className="size-3.5" aria-hidden />, () => { setDraft(s.title ?? ''); setEditing(true); })}
        {act('Ekspor Markdown', <Download className="size-3.5" aria-hidden />, props.onExport)}
        {act(archived ? 'Pulihkan sesi' : 'Arsipkan sesi', archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />, props.onArchive)}
        {act('Hapus sesi', <Trash2 className="size-3.5" aria-hidden />, props.onDelete, true)}
      </div>
    </li>
  );
}

export function SessionList(p: SessionListProps) {
  const [pendingDelete, setPendingDelete] = useState<ChatSessionDto | null>(null);
  const groups = groupSessions(p.sessions);
  const archived = p.status === 'archived';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button onClick={p.onNew} className="w-full">
        <MessageSquarePlus aria-hidden />
        Sesi baru
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder="Cari percakapan…" aria-label="Cari percakapan" className="pl-8" />
      </div>
      <div role="group" aria-label="Filter sesi" className="flex gap-1 rounded-md bg-neutral-subtle p-0.5 text-xs">
        {(['active', 'archived'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={p.status === s}
            onClick={() => p.onStatus(s)}
            className={cn('flex-1 rounded-sm px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', p.status === s ? 'bg-card text-foreground shadow-[var(--shadow-1)]' : 'text-neutral-text')}
          >
            {s === 'active' ? 'Aktif' : 'Arsip'}
          </button>
        ))}
      </div>
      <nav aria-label="Daftar sesi" className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        {p.loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Memuat…</div>
        )}
        {!p.loading && groups.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {p.search ? 'Tidak ada percakapan yang cocok.' : archived ? 'Belum ada sesi di arsip.' : 'Belum ada percakapan. Mulai dengan “Sesi baru”.'}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.label}</h2>
            <ul className="space-y-0.5">
              {g.items.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  active={s.id === p.activeId}
                  archived={archived}
                  onSelect={() => p.onSelect(s.id)}
                  onRename={(t) => p.onRename(s.id, t)}
                  onArchive={() => p.onArchive(s.id, !archived)}
                  onDelete={() => setPendingDelete(s)}
                  onExport={() => p.onExport(s.id)}
                />
              ))}
            </ul>
          </section>
        ))}
        {p.hasMore && (
          <Button variant="ghost" size="sm" className="w-full" onClick={p.onLoadMore} loading={p.loadingMore}>
            Muat lebih banyak
          </Button>
        )}
      </nav>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title="Hapus percakapan ini?"
        description={`“${pendingDelete ? titleOf(pendingDelete) : ''}” beserta seluruh pesan dan lampirannya akan dihapus permanen dan tidak bisa dikembalikan.`}
        tone="danger"
        confirmLabel="Hapus"
        onConfirm={() => {
          if (pendingDelete) p.onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

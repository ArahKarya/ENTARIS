// Daftar sesi (kiri / drawer di 390px): pencarian, "Sesi baru", kelompok waktu, ubah nama inline,
// arsip + filter Arsip (pulihkan), hapus (konfirmasi), ekspor, muat lagi.

import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Download, Loader2, MessageSquarePlus, Pencil, Search, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  /** Load failure shown instead of the empty-list text. */
  error?: string | null;
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

const titleOf = (s: ChatSessionDto, t: TFunction<'aira'>): string => s.title || t('sessionList.untitled');

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
  const { t } = useTranslation('aira');
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
          aria-label={t('sessionList.sessionName')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="h-8 flex-1 text-sm"
        />
        <Button size="icon-sm" variant="ghost" className="size-7" onClick={commit} aria-label={t('sessionList.saveName')}><Check className="size-3.5" aria-hidden /></Button>
        <Button size="icon-sm" variant="ghost" className="size-7" onClick={() => setEditing(false)} aria-label={t('sessionList.cancelRename')}><X className="size-3.5" aria-hidden /></Button>
      </li>
    );
  }
  const act = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <SimpleTooltip content={label}>
      <Button size="icon-sm" variant="ghost" className={cn('size-7 text-muted-foreground', danger && 'hover:text-danger-text')} onClick={onClick} aria-label={`${label}: ${titleOf(s, t)}`}>
        {icon}
      </Button>
    </SimpleTooltip>
  );
  return (
    <li className={cn('group relative flex items-center gap-1 rounded-md pr-1', active ? 'bg-primary-subtle' : 'hover:bg-surface-hover')}>
      <button
        type="button"
        onClick={props.onSelect}
        aria-current={active ? 'true' : undefined}
        className="min-w-0 flex-1 rounded-md px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('block truncate', active ? 'font-medium text-primary-subtle-foreground' : 'text-foreground')}>{titleOf(s, t)}</span>
        {s.busy && <span className="text-xs text-muted-foreground">{t('sessionList.answering')}</span>}
      </button>
      <div
        className={cn(
          'flex shrink-0 items-center md:absolute md:right-1 md:top-1/2 md:-translate-y-1/2 md:rounded-md md:opacity-0 md:shadow-[var(--shadow-1)] md:group-focus-within:opacity-100 md:group-hover:opacity-100',
          active ? 'md:bg-primary-subtle' : 'md:bg-card',
        )}
      >
        {act(t('sessionList.rename'), <Pencil className="size-3.5" aria-hidden />, () => { setDraft(s.title ?? ''); setEditing(true); })}
        {act(t('sessionList.exportMarkdown'), <Download className="size-3.5" aria-hidden />, props.onExport)}
        {act(t(archived ? 'sessionList.restore' : 'sessionList.archive'), archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />, props.onArchive)}
        {act(t('sessionList.delete'), <Trash2 className="size-3.5" aria-hidden />, props.onDelete, true)}
      </div>
    </li>
  );
}

export function SessionList(p: SessionListProps) {
  const { t } = useTranslation('aira');
  const [pendingDelete, setPendingDelete] = useState<ChatSessionDto | null>(null);
  const groups = groupSessions(p.sessions);
  const archived = p.status === 'archived';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button onClick={p.onNew} className="w-full">
        <MessageSquarePlus aria-hidden />
        {t('chat.newSession')}
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={p.search} onChange={(e) => p.onSearch(e.target.value)} placeholder={t('sessionList.searchPlaceholder')} aria-label={t('sessionList.searchLabel')} className="pl-8" />
      </div>
      <div role="group" aria-label={t('sessionList.filterLabel')} className="flex gap-1 rounded-md bg-neutral-subtle p-0.5 text-xs">
        {(['active', 'archived'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={p.status === s}
            onClick={() => p.onStatus(s)}
            className={cn('flex-1 rounded-sm px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', p.status === s ? 'bg-card text-foreground shadow-[var(--shadow-1)]' : 'text-neutral-text')}
          >
            {t(s === 'active' ? 'sessionList.filterActive' : 'sessionList.filterArchived')}
          </button>
        ))}
      </div>
      <nav aria-label={t('sessionList.listLabel')} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        {p.loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t('sessionList.loading')}</div>
        )}
        {!p.loading && p.error && (
          <p role="alert" className="px-2 py-6 text-center text-sm text-danger-text">{p.error}</p>
        )}
        {!p.loading && !p.error && groups.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t(p.search ? 'sessionList.noMatches' : archived ? 'sessionList.noArchived' : 'sessionList.noSessions')}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.key} aria-label={t(`sessionList.groups.${g.key}`)}>
            <h2 className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`sessionList.groups.${g.key}`)}</h2>
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
            {t('sessionList.loadMore')}
          </Button>
        )}
      </nav>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('sessionList.deleteTitle')}
        description={t('sessionList.deleteDescription', { title: pendingDelete ? titleOf(pendingDelete, t) : '' })}
        tone="danger"
        confirmLabel={t('sessionList.deleteConfirm')}
        onConfirm={() => {
          if (pendingDelete) p.onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

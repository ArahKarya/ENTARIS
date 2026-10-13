// Panel chat AIRA. Entaris menyimpan sesi & pesan (per pengguna) dan memanggil agen lewat server;
// halaman ini hanya merangkai komponen di components/aira/ (daftar sesi, pesan, composer, banner).

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, Loader2, MessageSquarePlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AiraIcon } from '@/components/shell/AiraIcon';
import { useCurrentRoute } from '@/components/shell/useCurrentRoute';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cap, getStoredUser } from '@/lib/permissions';
import { Composer } from '@/components/aira/Composer';
import { EmptyChat } from '@/components/aira/EmptyChat';
import { EngineBanner } from '@/components/aira/EngineBanner';
import { MessageItem } from '@/components/aira/MessageItem';
import { SessionList } from '@/components/aira/SessionList';
import { chatKeys, downloadSession, fetchHealth, fetchLastSession } from '@/components/aira/chatApi';
import { readLastSession, writeLastSession } from '@/components/aira/sessionGroups';
import { useChatConversation } from '@/components/aira/useChatConversation';
import { useIsDesktop } from '@/components/aira/useIsDesktop';
import { useSessionList } from '@/components/aira/useSessionList';
import type { ViewMessage } from '@/components/aira/types';

/** Pesan pengguna yang memicu jawaban `assistantIndex` (untuk "Coba lagi"). */
function retryTarget(messages: ViewMessage[], assistantIndex: number): string | undefined {
  for (let i = assistantIndex - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i].id;
  return undefined;
}

export function AiraChat() {
  const { t } = useTranslation('aira');
  const route = useCurrentRoute();
  const userId = getStoredUser()?.id ?? null;
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const isDesktop = useIsDesktop();

  const list = useSessionList();
  const health = useQuery({ queryKey: chatKeys.health, queryFn: fetchHealth, refetchInterval: 30_000, retry: false, staleTime: 10_000 });

  const conv = useChatConversation({
    onSessionId: (id) => writeLastSession(userId, id),
    onSessionsChanged: () => void list.invalidate(),
    onEngineError: () => void health.refetch(),
  });
  const { open, sessionId } = conv;

  // Buka sesi terakhir (server = sumber utama lintas perangkat; localStorage = cadangan).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let id: string | null = null;
      try {
        id = (await fetchLastSession())?.id ?? null;
      } catch {
        id = readLastSession(userId);
      }
      if (!cancelled && id) await open(id);
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  useEffect(() => { writeLastSession(userId, sessionId); }, [userId, sessionId]);

  // Esc di mana pun menghentikan jawaban yang sedang berjalan.
  useEffect(() => {
    if (!conv.busy) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') conv.stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [conv]);

  // Gulir ke bawah selama pengguna belum menggulir ke atas.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [conv.messages]);

  const send = useCallback(async () => {
    const text = input;
    const f = file;
    setInput('');
    setFile(null);
    stickRef.current = true;
    const outcome = await conv.send(text, f);
    if (outcome.restore !== undefined) {
      setInput(outcome.restore);
      setFile(f);
    }
    if (outcome.error) toast.error(outcome.error.message);
  }, [conv, file, input]);

  // Pilihan untuk pertanyaan balik AIRA dikirim sebagai pesan biasa; teks di kotak ketik tetap utuh.
  const choose = useCallback(async (choice: string) => {
    stickRef.current = true;
    const outcome = await conv.send(choice, null);
    if (outcome.error) toast.error(outcome.error.message);
  }, [conv]);

  const retry = useCallback(async (userMessageId: string) => {
    stickRef.current = true;
    const outcome = await conv.retry(userMessageId);
    if (outcome.error) toast.error(outcome.error.message);
  }, [conv]);

  const select = useCallback((id: string) => {
    setDrawer(false);
    void open(id);
  }, [open]);

  const startNew = useCallback(() => {
    setDrawer(false);
    void open(null);
    setInput('');
    setFile(null);
    inputRef.current?.focus();
  }, [open]);

  const sessionPanel = (
    <SessionList
      sessions={list.sessions}
      loading={list.loading}
      error={list.error}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      search={list.search}
      onSearch={list.setSearch}
      status={list.status}
      onStatus={list.setStatus}
      activeId={sessionId}
      onSelect={select}
      onNew={startNew}
      onRename={list.rename}
      onArchive={(id, archived) => {
        list.archive(id, archived);
        if (id === sessionId && archived) void open(null);
      }}
      onDelete={(id) => { void list.remove(id).then(() => { if (id === sessionId) void open(null); }); }}
      onExport={(id) => void downloadSession(id, 'md').catch(() => toast.error(t('chat.exportFailed')))}
    />
  );

  const empty = ready && !conv.loading && conv.messages.length === 0;
  const lastAssistant = (() => { for (let i = conv.messages.length - 1; i >= 0; i--) if (conv.messages[i].role === 'assistant') return i; return -1; })();

  return (
    <div className="flex h-[calc(100dvh-5rem)] gap-4 sm:h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-6.5rem)]">
      {isDesktop && (
        <aside aria-label={t('chat.history')} className="w-72 shrink-0 rounded-lg border border-border bg-card p-3">
          {sessionPanel}
        </aside>
      )}

      <section aria-labelledby="aira-title" className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        <header className="mb-2 flex items-center gap-3 border-b border-border pb-3">
          <AiraIcon size={32} className="size-7 shrink-0 sm:size-8" />
          <div className="min-w-0 flex-1">
            <h1 id="aira-title" className="text-base font-semibold leading-tight text-foreground sm:text-lg">{route?.label ?? t('chat.title')}</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">{t('chat.subtitle')}</p>
          </div>
          <Button size="icon" variant="outline" className="md:hidden" onClick={() => setDrawer(true)} aria-label={t('chat.history')}>
            <History aria-hidden />
          </Button>
          <Button size="sm" variant="outline" onClick={startNew} className="md:hidden">
            <MessageSquarePlus aria-hidden />
            {t('chat.newSession')}
          </Button>
        </header>

        <EngineBanner health={health.data} checking={health.isFetching} isAdmin={cap('rbac.manage')} onRetry={() => void health.refetch()} />

        <div
          ref={scrollRef}
          role="log"
          aria-live="off"
          aria-label={t('chat.logLabel')}
          aria-busy={conv.busy || conv.loading}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- log yang dapat digulir harus bisa difokus keyboard
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 space-y-4 overflow-y-auto rounded-md px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {(conv.loading || !ready) && (
            <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              {t('chat.loadingConversation')}
            </div>
          )}
          {ready && conv.hasOlder && !conv.loading && (
            <div className="text-center">
              <Button size="sm" variant="ghost" onClick={() => void conv.loadOlder()}>{t('chat.loadOlder')}</Button>
            </div>
          )}
          {empty && <EmptyChat onPick={(t) => { setInput(t); inputRef.current?.focus(); }} />}
          {!conv.loading && conv.messages.map((m, i) => (
            <MessageItem
              key={m.id}
              message={m}
              canRetry={i === lastAssistant && !conv.busy}
              retryTargetId={m.role === 'assistant' ? retryTarget(conv.messages, i) : undefined}
              onRetry={(id) => void retry(id)}
              onChoose={i === conv.messages.length - 1 && m.clarify && !conv.busy ? (c) => void choose(c) : undefined}
            />
          ))}
        </div>

        {/* Pengumuman ringkas untuk pembaca layar: mulai/selesai, bukan per token. */}
        <p role="status" aria-live="polite" className="sr-only">{conv.announce}</p>

        <Composer
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSend={() => void send()}
          onStop={conv.stop}
          busy={conv.busy}
          file={file}
          onFile={setFile}
          acceptsPdf={health.data?.acceptsPdf ?? false}
        />
      </section>

      <Sheet open={drawer && !isDesktop} onOpenChange={setDrawer}>
        <SheetContent side="left" size="sm">
          <SheetHeader>
            <SheetTitle>{t('chat.history')}</SheetTitle>
            <SheetDescription>{t('chat.historyDescription')}</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-4">{sessionPanel}</SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default AiraChat;

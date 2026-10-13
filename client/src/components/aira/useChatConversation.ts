// Keadaan percakapan aktif: memuat riwayat dari server (sumber kebenaran), mengirim giliran (SSE),
// menghentikan, mencoba lagi. Pesan pengguna sudah tersimpan di server sebelum agen dipanggil.

import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import { fetchMessages } from './chatApi';
import { StreamHttpError, streamTurn } from './sse';
import type { CardPart, ChatMessageDto, StreamEvent, ToolChip, ViewMessage } from './types';

const toView = (m: ChatMessageDto): ViewMessage => ({
  ...m,
  tools: m.parts?.tools ?? [],
  cards: m.parts?.cards ?? [],
  clarify: m.parts?.clarify ?? null,
});

let tempSeq = 0;
const tempId = (p: string): string => `tmp-${p}-${Date.now()}-${tempSeq++}`;

export interface SendOutcome {
  ok: boolean;
  /** teks yang harus dikembalikan ke kotak pesan (penolakan sebelum tersimpan) */
  restore?: string;
  error?: { code: string; message: string };
}

interface Options {
  onSessionId: (id: string) => void;
  /** dipanggil saat daftar sesi perlu disegarkan (sesi baru, judul, urutan) */
  onSessionsChanged: () => void;
  onEngineError: () => void;
}

function applyEvent(prev: ViewMessage[], assistantId: string, e: StreamEvent): ViewMessage[] {
  const patch = (fn: (m: ViewMessage) => ViewMessage): ViewMessage[] => prev.map((m) => (m.id === assistantId ? fn(m) : m));
  switch (e.event) {
    case 'delta':
      return patch((m) => ({ ...m, content: m.content + e.data.text }));
    case 'tool': {
      const chip: ToolChip = e.data;
      return patch((m) => ({ ...m, tools: [...m.tools, chip] }));
    }
    case 'card': {
      const card: CardPart = e.data;
      return patch((m) => ({ ...m, cards: [...m.cards, card] }));
    }
    case 'clarify':
      return patch((m) => ({ ...m, clarify: e.data }));
    case 'done':
      return patch((m) => ({ ...m, status: 'ok', durationMs: e.data.duration_ms }));
    case 'error':
      return patch((m) => ({ ...m, status: 'error', error: e.data.message, clarify: null }));
    default:
      return prev;
  }
}

export function useChatConversation({ onSessionId, onSessionsChanged, onEngineError }: Options) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;

  useEffect(() => () => abortRef.current?.abort(), []);

  const open = useCallback(async (id: string | null): Promise<boolean> => {
    abortRef.current?.abort();
    setBusy(false);
    setSessionId(id);
    setMessages([]);
    setHasOlder(false);
    if (!id) return true;
    setLoading(true);
    try {
      const page = await fetchMessages(id);
      if (sessionRef.current !== id) return true;
      setMessages(page.data.map(toView));
      setHasOlder(page.hasMore);
      return true;
    } catch {
      setSessionId(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOlder = useCallback(async () => {
    const id = sessionRef.current;
    const first = messages.find((m) => typeof m.seq === 'number');
    if (!id || !first?.seq) return;
    const page = await fetchMessages(id, first.seq);
    setMessages((prev) => [...page.data.map(toView), ...prev]);
    setHasOlder(page.hasMore);
  }, [messages]);

  const resync = useCallback(async (id: string) => {
    try {
      const page = await fetchMessages(id);
      if (sessionRef.current !== id || page.data.length === 0) return;
      setMessages((prev) => {
        const minSeq = page.data[0]?.seq ?? Number.POSITIVE_INFINITY;
        const older = prev.filter((m) => typeof m.seq === 'number' && m.seq < minSeq);
        return [...older, ...page.data.map(toView)];
      });
      setHasOlder((h) => h || page.hasMore);
    } catch {
      // tampilan lokal tetap dipakai
    }
  }, []);

  const run = useCallback(
    async (req: { input: string; file?: File; retryMessageId?: string }, userId: string | null, assistantId: string): Promise<SendOutcome> => {
      const ctl = new AbortController();
      abortRef.current = ctl;
      setBusy(true);
      setAnnounce(i18n.t('aira:conversation.answering'));
      let sid = sessionRef.current;
      let finalStatus: 'ok' | 'error' | 'aborted' = 'aborted';
      let engineError = false;
      try {
        for await (const e of streamTurn({ input: req.input, file: req.file, sessionId: sid ?? undefined, retryMessageId: req.retryMessageId }, ctl.signal)) {
          if (e.event === 'session') {
            sid = e.data.session_id;
            if (sessionRef.current !== sid) {
              sessionRef.current = sid;
              setSessionId(sid);
              onSessionId(sid);
              onSessionsChanged();
            }
          } else if (e.event === 'turn') {
            // Salin id lama ke konstanta: updater state berjalan nanti, sesudah variabel ini diganti.
            const oldBot = assistantId;
            const oldUser = userId;
            const { message_id: newBot, user_message_id: newUser } = e.data;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === oldBot) return { ...m, id: newBot };
                if (oldUser && m.id === oldUser) return { ...m, id: newUser };
                return m;
              }),
            );
            assistantId = newBot;
            userId = newUser;
          } else if (e.event === 'title') {
            onSessionsChanged();
          } else {
            const targetId = assistantId;
            setMessages((prev) => applyEvent(prev, targetId, e));
            if (e.event === 'done') finalStatus = 'ok';
            if (e.event === 'error') {
              finalStatus = 'error';
              engineError = e.data.code.startsWith('engine_');
            }
          }
        }
        if (finalStatus === 'aborted' && !ctl.signal.aborted) finalStatus = 'error';
        return { ok: finalStatus === 'ok' };
      } catch (err) {
        if (ctl.signal.aborted) return { ok: false };
        if (err instanceof StreamHttpError) {
          // Ditolak sebelum tersimpan: buang gelembung sementara, kembalikan teks ke kotak pesan.
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userId));
          return { ok: false, restore: req.input, error: { code: err.code, message: err.message } };
        }
        setMessages((prev) => applyEvent(prev, assistantId, { event: 'error', data: { message: i18n.t('aira:conversation.connectionLost'), code: 'network' } }));
        finalStatus = 'error';
        engineError = true;
        return { ok: false };
      } finally {
        if (ctl.signal.aborted) {
          setMessages((prev) => prev.map((m) => (m.id === assistantId && m.status === 'streaming' ? { ...m, status: 'aborted' } : m)));
        }
        setBusy(false);
        abortRef.current = null;
        setAnnounce(
          i18n.t(
            finalStatus === 'ok' ? 'aira:conversation.answerDone' : finalStatus === 'error' ? 'aira:conversation.answerFailed' : 'aira:conversation.answerStopped',
          ),
        );
        if (engineError) onEngineError();
        onSessionsChanged();
        if (sid) void resync(sid);
      }
    },
    [onEngineError, onSessionId, onSessionsChanged, resync],
  );

  const send = useCallback(
    (input: string, file: File | null): Promise<SendOutcome> => {
      const text = input.trim();
      const userTmp = tempId('u');
      const botTmp = tempId('a');
      const user: ViewMessage = {
        id: userTmp, role: 'user', content: text || (file ? `Lampiran: ${file.name}` : ''), status: 'ok', attachments: [], tools: [], cards: [],
        localAttachment: file ? { name: file.name, size: file.size, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined } : undefined,
      };
      const bot: ViewMessage = { id: botTmp, role: 'assistant', content: '', status: 'streaming', attachments: [], tools: [], cards: [] };
      setMessages((prev) => [...prev, user, bot]);
      return run({ input: text, file: file ?? undefined }, userTmp, botTmp);
    },
    [run],
  );

  const retry = useCallback(
    (userMessageId: string): Promise<SendOutcome> => {
      const botTmp = tempId('a');
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === userMessageId);
        const keep = idx >= 0 ? prev.slice(0, idx + 1) : prev;
        return [...keep, { id: botTmp, role: 'assistant', content: '', status: 'streaming', attachments: [], tools: [], cards: [] }];
      });
      return run({ input: '', retryMessageId: userMessageId }, null, botTmp);
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { sessionId, messages, loading, hasOlder, busy, announce, open, loadOlder, send, retry, stop };
}

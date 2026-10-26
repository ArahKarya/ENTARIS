// Keadaan percakapan aktif: memuat riwayat dari server (sumber kebenaran), mengirim giliran (SSE),
// menghentikan, mencoba lagi. Pesan pengguna sudah tersimpan di server sebelum agen dipanggil.
//
// Giliran berjalan di SERVER, tidak terikat ke koneksi ini: pindah modul, pindah tab, refresh, atau
// koneksi putus tidak menghentikan AIRA. Saat sesi dibuka lagi dan giliran masih berjalan, hook ini
// mengikutinya lewat polling riwayat sampai selesai. Hanya `stop()` (tombol Stop / Esc) yang
// menghentikan giliran, lewat POST /sessions/:id/stop.

import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import { fetchMessages, stopSessionTurn, type MessagesPage } from './chatApi';
import { StreamHttpError, streamTurn } from './sse';
import type { CardPart, ChatMessageDto, ConfirmChoice, StreamEvent, ToolChip, ViewMessage } from './types';

/** Jeda polling saat mengikuti giliran yang berjalan tanpa koneksi SSE. */
export const FOLLOW_POLL_MS = 2000;
/** Galat jaringan beruntun saat polling sebelum berhenti mengikuti (giliran tetap jalan di server). */
const FOLLOW_MAX_FAILURES = 30;

const toView = (m: ChatMessageDto): ViewMessage => ({
  ...m,
  tools: m.parts?.tools ?? [],
  cards: m.parts?.cards ?? [],
  clarify: m.parts?.clarify ?? null,
  confirm: m.parts?.confirm ?? null,
});

let tempSeq = 0;
const tempId = (p: string): string => `tmp-${p}-${Date.now()}-${tempSeq++}`;

const isRunning = (page: MessagesPage): boolean => !!page.session?.busy || page.data.some((m) => m.status === 'streaming');

/** Gabungkan halaman riwayat terbaru dengan pesan lama yang sudah dimuat (lebih tua dari halaman). */
function mergePage(prev: ViewMessage[], page: MessagesPage): ViewMessage[] {
  const minSeq = page.data[0]?.seq ?? Number.POSITIVE_INFINITY;
  const older = prev.filter((m) => typeof m.seq === 'number' && m.seq < minSeq);
  return [...older, ...page.data.map(toView)];
}

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
    case 'confirm':
      return patch((m) => ({ ...m, confirm: e.data }));
    case 'done':
      return patch((m) => ({ ...m, status: 'ok', durationMs: e.data.duration_ms }));
    case 'error':
      return patch((m) => ({ ...m, status: 'error', error: e.data.message, clarify: null, confirm: null }));
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
  /** giliran SSE yang sedang berjalan (diisi dari event `turn`) */
  const turnRef = useRef<{ sessionId: string; turnId: string } | null>(null);
  /** Stop ditekan sebelum event `turn` tiba: dijalankan begitu id giliran diketahui. */
  const pendingStopRef = useRef(false);
  /** sesi yang sedang diikuti lewat polling (null = tidak mengikuti) */
  const followRef = useRef<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onSessionsChanged });
  sessionRef.current = sessionId;
  useEffect(() => {
    callbacks.current = { onSessionsChanged };
  }, [onSessionsChanged]);

  /** Lepas koneksi SSE lokal TANPA menghentikan giliran di server. */
  const detach = useCallback(() => {
    const ctl = abortRef.current;
    abortRef.current = null;
    turnRef.current = null;
    pendingStopRef.current = false;
    ctl?.abort();
  }, []);

  const stopFollowing = useCallback(() => {
    followRef.current = null;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => () => {
    detach();
    stopFollowing();
  }, [detach, stopFollowing]);

  /** Ikuti giliran yang masih berjalan di server: muat ulang riwayat berkala sampai selesai. */
  const follow = useCallback((id: string, delayMs: number = FOLLOW_POLL_MS) => {
    stopFollowing();
    followRef.current = id;
    setBusy(true);
    setAnnounce(i18n.t('aira:conversation.answering'));
    let failures = 0;
    const finish = (status: string | undefined): void => {
      followRef.current = null;
      pollTimer.current = null;
      setBusy(false);
      setAnnounce(
        i18n.t(status === 'ok' ? 'aira:conversation.answerDone' : status === 'aborted' ? 'aira:conversation.answerStopped' : 'aira:conversation.answerFailed'),
      );
      callbacks.current.onSessionsChanged();
    };
    const tick = async (): Promise<void> => {
      if (followRef.current !== id) return;
      try {
        const page = await fetchMessages(id);
        if (followRef.current !== id || sessionRef.current !== id) return;
        failures = 0;
        setMessages((prev) => mergePage(prev, page));
        setHasOlder((h) => h || page.hasMore);
        if (isRunning(page)) {
          pollTimer.current = setTimeout(() => void tick(), FOLLOW_POLL_MS);
          return;
        }
        finish([...page.data].reverse().find((m) => m.role === 'assistant')?.status);
      } catch {
        if (followRef.current !== id) return;
        failures += 1;
        if (failures >= FOLLOW_MAX_FAILURES) {
          finish(undefined);
          return;
        }
        pollTimer.current = setTimeout(() => void tick(), FOLLOW_POLL_MS);
      }
    };
    pollTimer.current = setTimeout(() => void tick(), delayMs);
  }, [stopFollowing]);

  const open = useCallback(async (id: string | null): Promise<boolean> => {
    detach();
    stopFollowing();
    setBusy(false);
    setSessionId(id);
    sessionRef.current = id;
    setMessages([]);
    setHasOlder(false);
    if (!id) return true;
    setLoading(true);
    try {
      const page = await fetchMessages(id);
      if (sessionRef.current !== id) return true;
      setMessages(page.data.map(toView));
      setHasOlder(page.hasMore);
      if (isRunning(page)) follow(id);
      return true;
    } catch {
      setSessionId(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, [detach, follow, stopFollowing]);

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
      setMessages((prev) => mergePage(prev, page));
      setHasOlder((h) => h || page.hasMore);
    } catch {
      // tampilan lokal tetap dipakai
    }
  }, []);

  /** Minta server menghentikan giliran; bila sedang mengikuti, segarkan segera. */
  const requestStop = useCallback((sid: string, turnId?: string) => {
    void stopSessionTurn(sid, turnId)
      .catch(() => undefined)
      .finally(() => {
        if (followRef.current === sid) follow(sid, 0);
      });
  }, [follow]);

  const run = useCallback(
    async (
      req: { input: string; file?: File; retryMessageId?: string; confirm?: { id: string; choice: ConfirmChoice } },
      userId: string | null,
      assistantId: string,
    ): Promise<SendOutcome> => {
      stopFollowing();
      const ctl = new AbortController();
      abortRef.current = ctl;
      turnRef.current = null;
      pendingStopRef.current = false;
      setBusy(true);
      setAnnounce(i18n.t('aira:conversation.answering'));
      let sid = sessionRef.current;
      // 'detached' = koneksi lepas tetapi giliran masih berjalan di server → ikuti lewat polling
      let finalStatus: 'ok' | 'error' | 'aborted' | 'detached' = 'aborted';
      let engineError = false;
      try {
        const request = { input: req.input, file: req.file, sessionId: sid ?? undefined, retryMessageId: req.retryMessageId, confirm: req.confirm };
        for await (const e of streamTurn(request, ctl.signal)) {
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
            if (sid) {
              turnRef.current = { sessionId: sid, turnId: e.data.turn_id };
              if (pendingStopRef.current) {
                requestStop(sid, e.data.turn_id);
                ctl.abort();
              }
            }
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
        // Aliran berakhir tanpa done/error (proxy/jaringan HP memutus): giliran masih jalan di server.
        if (finalStatus === 'aborted' && !ctl.signal.aborted) finalStatus = sid && turnRef.current ? 'detached' : 'error';
        return { ok: finalStatus === 'ok' };
      } catch (err) {
        if (ctl.signal.aborted) return { ok: false };
        if (err instanceof StreamHttpError) {
          // Ditolak sebelum tersimpan: buang gelembung sementara, kembalikan teks ke kotak pesan.
          setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userId));
          finalStatus = 'error';
          return { ok: false, restore: req.input, error: { code: err.code, message: err.message } };
        }
        if (sid && turnRef.current) {
          finalStatus = 'detached';
          return { ok: false };
        }
        setMessages((prev) => applyEvent(prev, assistantId, { event: 'error', data: { message: i18n.t('aira:conversation.connectionLost'), code: 'network' } }));
        finalStatus = 'error';
        engineError = true;
        return { ok: false };
      } finally {
        // Dilepas oleh open()/unmount (abortRef sudah diganti): giliran tetap jalan di server, state tak disentuh.
        if (abortRef.current === ctl) {
          abortRef.current = null;
          turnRef.current = null;
          pendingStopRef.current = false;
          if (finalStatus === 'detached' && sid) {
            follow(sid, 0);
          } else {
            if (ctl.signal.aborted) {
              const target = assistantId;
              setMessages((prev) => prev.map((m) => (m.id === target && m.status === 'streaming' ? { ...m, status: 'aborted' } : m)));
            }
            setBusy(false);
            setAnnounce(
              i18n.t(
                finalStatus === 'ok' ? 'aira:conversation.answerDone' : finalStatus === 'error' ? 'aira:conversation.answerFailed' : 'aira:conversation.answerStopped',
              ),
            );
            if (engineError) onEngineError();
            onSessionsChanged();
            if (sid) void resync(sid);
          }
        }
      }
    },
    [follow, onEngineError, onSessionId, onSessionsChanged, requestStop, resync, stopFollowing],
  );

  const send = useCallback(
    (input: string, file: File | null, confirm?: { id: string; choice: ConfirmChoice }): Promise<SendOutcome> => {
      const text = input.trim();
      const userTmp = tempId('u');
      const botTmp = tempId('a');
      const user: ViewMessage = {
        id: userTmp, role: 'user', content: text || (file ? `Lampiran: ${file.name}` : ''), status: 'ok', attachments: [], tools: [], cards: [],
        localAttachment: file ? { name: file.name, size: file.size, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined } : undefined,
      };
      const bot: ViewMessage = { id: botTmp, role: 'assistant', content: '', status: 'streaming', attachments: [], tools: [], cards: [], createdAt: new Date().toISOString() };
      // Kartu yang dijawab tidak boleh ditekan lagi, bahkan sebelum server menandainya.
      setMessages((prev) => [
        ...prev.map((m) => (confirm && m.confirm?.id === confirm.id ? { ...m, confirm: { ...m.confirm, answered: confirm.choice } } : m)),
        user,
        bot,
      ]);
      return run({ input: text, file: file ?? undefined, confirm }, userTmp, botTmp);
    },
    [run],
  );

  const retry = useCallback(
    (userMessageId: string): Promise<SendOutcome> => {
      const botTmp = tempId('a');
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === userMessageId);
        const keep = idx >= 0 ? prev.slice(0, idx + 1) : prev;
        return [...keep, { id: botTmp, role: 'assistant', content: '', status: 'streaming', attachments: [], tools: [], cards: [], createdAt: new Date().toISOString() }];
      });
      return run({ input: '', retryMessageId: userMessageId }, null, botTmp);
    },
    [run],
  );

  /** Hentikan jawaban (tombol Stop / Esc): hentikan giliran di server, lalu lepas koneksi lokal. */
  const stop = useCallback(() => {
    const ctl = abortRef.current;
    if (ctl) {
      const turn = turnRef.current;
      if (!turn) {
        // id giliran belum diketahui: tunda sampai event `turn` tiba
        pendingStopRef.current = true;
        return;
      }
      requestStop(turn.sessionId, turn.turnId);
      ctl.abort();
      return;
    }
    const following = followRef.current;
    if (following) requestStop(following);
  }, [requestStop]);

  return { sessionId, messages, loading, hasOlder, busy, announce, open, loadOlder, send, retry, stop };
}

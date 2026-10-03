import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, Loader2, User, MessageSquarePlus, Archive, Pencil, Check, X, Paperclip, FileText, Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { DraftCard, type AiraDraft } from '../components/aira/DraftCard';
import { CashBookCard, type CashBookDraftData, type CoaOption } from '../components/aira/CashBookCard';
import { AiraIcon } from '@/components/shell/AiraIcon';
import { useCurrentRoute } from '@/components/shell/useCurrentRoute';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ── Tipe pesan di panel chat ──
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  // Untuk assistant: tahap berjalan + draft + status.
  stages?: string[];
  draft?: AiraDraft | null;
  runId?: string | null;
  decided?: 'approve' | 'reject' | null;
  streaming?: boolean;
  status?: string;
  auto?: boolean; // L3: dieksekusi otomatis oleh AIRA (tanpa approval manusia)
  cashbook?: CashBookDraftData | null; // C3: draft buku kas multi-baris
  coa?: CoaOption[];                   // daftar akun utk dropdown koreksi
  cashbookDone?: { posted: number; skipped: number; failed: number; learned: number } | null;
}

// ── Tipe sesi (dari aira-core via proxy ERP) ──
interface SessionItem {
  session_id: string;
  title: string | null;
  status: 'active' | 'archived';
  last_active_at: string;
  run_count: number;
}

const EXAMPLE_PROMPT = 'Buat jurnal koreksi: debit Beban Telekomunikasi 50.000, kredit Petty Cash 50.000';

const STAGE_LABEL: Record<string, string> = {
  plan_node: 'Menyusun rencana',
  guardrail: 'Memeriksa kebijakan',
  reason: 'Menimbang keputusan',
  execute: 'Mengeksekusi',
  cashbook_extract: 'Membaca buku kas',
  cashbook_classify: 'Memetakan akun COA',
};

/** Ambil CSRF token dari cookie (sama pola api.ts). */
function csrfToken(): string | undefined {
  return document.cookie.split('; ').find((c) => c.startsWith('csrf-token='))?.split('=')[1];
}

let msgSeq = 0;
const nextId = () => `m${Date.now()}_${msgSeq++}`;

// ── Persist chat antar-navigasi (s.d user logout / tutup tab) ──
// Pakai sessionStorage: bertahan saat pindah modul & balik, hilang saat sesi browser
// berakhir. Logout meng-clear key ini secara eksplisit (lihat MainLayout.handleLogout).
// Sumber kebenaran daftar sesi = API aira-core; sessionStorage hanya cache last-open.
const AIRA_MSGS_KEY = 'aira_chat_messages';
const AIRA_SESSION_KEY = 'aira_chat_session_id';

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(AIRA_MSGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // Bersihkan flag transient: jangan restore status 'streaming' (stream sudah mati).
    return parsed.map((m) => (m.streaming ? { ...m, streaming: false } : m));
  } catch {
    return [];
  }
}

/** Waktu relatif singkat Bahasa Indonesia (mis. "5 mnt lalu", "2 jam lalu"). */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hr lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Map item message aira-core → ChatMessage panel. */
function toChatMessage(m: { message_id: string; role: string; content: string; run_id?: string | null }): ChatMessage {
  return {
    id: m.message_id || nextId(),
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.content ?? '',
    runId: m.run_id ?? null,
    streaming: false,
  };
}

export function AiraChat() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const location = useLocation();
  const [input, setInput] = useState('');
  // "Tanya AIRA tentang …" from the command palette passes {prompt} as router
  // state: prefill the composer (never auto-send) once per navigation.
  const [promptKey, setPromptKey] = useState<string | null>(null);
  const routePrompt = (location.state as { prompt?: unknown } | null)?.prompt;
  if (typeof routePrompt === 'string' && routePrompt && promptKey !== location.key) {
    setPromptKey(location.key);
    setInput(routePrompt);
  }
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(AIRA_SESSION_KEY));
  const [approving, setApproving] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const route = useCurrentRoute();
  // A2: lampiran dokumen (PDF/gambar) untuk dibaca AIRA.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Daftar sesi (sumber kebenaran) ──
  const sessionsQuery = useQuery({
    queryKey: ['aira-sessions'],
    queryFn: async () => {
      const { data } = await api.get<{ items: SessionItem[]; total: number }>('/ai/chat/sessions');
      return data.items ?? [];
    },
  });
  const sessions = sessionsQuery.data ?? [];

  // ── Rename / archive sesi ──
  const patchSession = useMutation({
    mutationFn: async (vars: { id: string; title?: string; status?: 'active' | 'archived' }) => {
      const { id, ...body } = vars;
      const { data } = await api.patch(`/ai/chat/sessions/${encodeURIComponent(id)}`, body);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aira-sessions'] }),
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string; error?: string } } })?.response?.data;
      toast.error(msg?.detail || msg?.error || 'Gagal memperbarui sesi.');
    },
  });

  // Persist pesan tiap berubah.
  useEffect(() => {
    try { sessionStorage.setItem(AIRA_MSGS_KEY, JSON.stringify(messages)); } catch { /* quota/serialize ignore */ }
  }, [messages]);

  // Persist session id.
  useEffect(() => {
    if (sessionId) sessionStorage.setItem(AIRA_SESSION_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  /** Update 1 pesan assistant by id (immutable). */
  const patchMsg = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /** Mulai sesi baru: kosongkan chat & sessionId. Sesi nyata tercipta di aira-core
   *  saat pesan pertama dikirim (event SSE `session`). */
  const newSession = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setEditingId(null);
    sessionStorage.removeItem(AIRA_SESSION_KEY);
    sessionStorage.removeItem(AIRA_MSGS_KEY);
  }, []);

  /** Buka sesi: muat riwayat message lalu set sessionId aktif. */
  const openSession = useCallback(async (id: string) => {
    if (busy || id === sessionId) return;
    setEditingId(null);
    setLoadingSession(true);
    try {
      const { data } = await api.get<{ items: Array<{ message_id: string; role: string; content: string; run_id?: string | null }> }>(
        `/ai/chat/sessions/${encodeURIComponent(id)}/messages`,
      );
      const mapped = (data.items ?? []).map(toChatMessage);
      setMessages(mapped);
      setSessionId(id);
    } catch (err) {
      toast.error((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Gagal memuat riwayat sesi.');
    } finally {
      setLoadingSession(false);
    }
  }, [busy, sessionId]);

  const submitRename = useCallback((id: string) => {
    const t = editTitle.trim();
    setEditingId(null);
    if (!t) return;
    patchSession.mutate({ id, title: t });
  }, [editTitle, patchSession]);

  const archiveSession = useCallback((id: string) => {
    patchSession.mutate({ id, status: 'archived' }, {
      onSuccess: () => {
        toast.success('Sesi diarsipkan.');
        qc.invalidateQueries({ queryKey: ['aira-sessions'] });
        if (id === sessionId) newSession();
      },
    });
  }, [patchSession, qc, sessionId, newSession]);

  const send = useCallback(async () => {
    const text = input.trim();
    const file = attachedFile;
    if ((!text && !file) || busy) return;
    setInput('');
    setAttachedFile(null);
    setBusy(true);

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text: file ? `${text || '(dokumen dilampirkan)'}  📎` : text };
    const asstId = nextId();
    const asstMsg: ChatMessage = {
      id: asstId, role: 'assistant', text: '', stages: [], draft: null, streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, asstMsg]);

    try {
      // A2: bila ada lampiran -> FormData (multipart) supaya AIRA bisa baca dokumen.
      //     JANGAN set Content-Type manual untuk FormData (browser set boundary).
      let resp: Response;
      if (file) {
        const fd = new FormData();
        fd.append('input', text || 'Tolong baca dokumen ini dan bantu input ke sistem.');
        if (sessionId) fd.append('session_id', sessionId);
        fd.append('file', file, file.name);
        resp = await fetch('/api/ai/chat/stream', {
          method: 'POST',
          headers: { ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}) },
          credentials: 'include',
          body: fd,
        });
      } else {
        resp = await fetch('/api/ai/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ input: text, session_id: sessionId ?? undefined }),
        });
      }

      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => null);
        const msg = j?.detail || j?.error || `Gagal (HTTP ${resp.status})`;
        patchMsg(asstId, { streaming: false, text: `⚠️ ${msg}` });
        if (resp.status === 403) toast.error('Layer AIRA nonaktif. Aktifkan di Pengaturan → Agentic System.');
        setBusy(false);
        return;
      }

      // ── Parse SSE manual dari ReadableStream (fetch, bukan EventSource). ──
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const stages: string[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Pisah per event (dipisah blank line).
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const evMatch = part.match(/^event:\s*(.+)$/m);
          const dataMatch = part.match(/^data:\s*(.+)$/m);
          if (!evMatch || !dataMatch) continue;
          const event = evMatch[1].trim();
          let data: any = null;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          if (event === 'session') {
            if (data.session_id) setSessionId(data.session_id);
            patchMsg(asstId, { runId: data.run_id });
          } else if (event === 'stage') {
            const label = STAGE_LABEL[data.stage] ?? data.stage;
            if (!stages.includes(label)) {
              stages.push(label);
              patchMsg(asstId, { stages: [...stages] });
            }
          } else if (event === 'attachment') {
            const dt = data.doc_type ? String(data.doc_type).replace(/_/g, ' ') : 'dokumen';
            const stLabel = `Dokumen terbaca: ${dt}`;
            if (!stages.includes(stLabel)) { stages.push(stLabel); patchMsg(asstId, { stages: [...stages] }); }
          } else if (event === 'token') {
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, text: m.text + (data.text ?? '') } : m));
          } else if (event === 'cashbook_paused') {
            patchMsg(asstId, {
              streaming: false,
              cashbook: data.draft as CashBookDraftData,
              coa: (data.coa ?? []) as CoaOption[],
              runId: data.run_id,
              status: 'cashbook_paused',
              text: `Aku baca buku kas: ${(data.draft as CashBookDraftData).entries.length} transaksi. Cek akun yang kutandai kuning lalu posting.`,
            });
          } else if (event === 'paused') {
            patchMsg(asstId, {
              streaming: false,
              draft: data.draft as AiraDraft,
              runId: data.run_id,
              text: (data.draft?.summary as string) || 'AIRA menyiapkan draft yang butuh persetujuan.',
              status: 'paused',
            });
          } else if (event === 'executed') {
            // L3: tier=auto/approved → AIRA eksekusi langsung tanpa kartu draft.
            // A+.2: read-tool kini balas `answer` (kalimat natural berisi angka).
            // Bila ada → tampilkan jawaban itu (bukan "Selesai otomatis — runId").
            const d = data.data as Record<string, any> | null;
            const ref = d?.entryNumber || d?.docNumber || d?.number || data.run_id || '';
            const answer = (data.answer as string | undefined)?.trim();
            patchMsg(asstId, {
              streaming: false,
              status: 'executed',
              auto: !!data.auto,
              text: answer
                ? answer
                : data.auto
                  ? `Selesai otomatis${ref ? ` — ${ref}` : ''}.`
                  : `Tereksekusi${ref ? ` — ${ref}` : ''}.`,
            });
          } else if (event === 'done') {
            const planSummary = data.plan?.summary as string | undefined;
            patchMsg(asstId, {
              streaming: false,
              status: data.status,
              text: data.status === 'error'
                ? `⚠️ ${data.error ?? 'Terjadi kesalahan.'}`
                : (planSummary || 'Selesai.'),
            });
          } else if (event === 'error') {
            patchMsg(asstId, { streaming: false, text: `⚠️ ${data.message ?? 'Error'}` });
          }
        }
      }
      // Pastikan flag streaming mati di akhir.
      setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, streaming: false } : m));
      // Refresh daftar sesi: sesi baru muncul, last_active_at sesi lama naik.
      qc.invalidateQueries({ queryKey: ['aira-sessions'] });
    } catch (err) {
      patchMsg(asstId, { streaming: false, text: `⚠️ ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [input, busy, sessionId, attachedFile, patchMsg, qc]);

  // C4: state posting cash-book per pesan.
  const [cbPending, setCbPending] = useState<string | null>(null);

  /** Approve cash-book: kirim koreksi akun + skip -> ERP proxy -> aira-core posting. */
  const approveCashBook = useCallback(async (
    msgId: string, runId: string,
    entries: Array<{ idx: number; account?: string; accountLabel?: string; skip?: boolean }>,
  ) => {
    setCbPending(msgId);
    try {
      const resp = await fetch('/api/ai/chat/cashbook-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}) },
        credentials: 'include',
        body: JSON.stringify({ run_id: runId, entries }),
      });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) {
        toast.error(j?.error || `Gagal posting (HTTP ${resp.status})`);
        setCbPending(null);
        return;
      }
      patchMsg(msgId, { cashbookDone: { posted: (j.posted ?? []).length, skipped: (j.skipped ?? []).length, failed: (j.failed ?? []).length, learned: j.learned ?? 0 } });
      if ((j.failed ?? []).length) toast.warning(`${j.failed.length} baris gagal diposting.`);
      else toast.success(`${(j.posted ?? []).length} jurnal diposting.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCbPending(null);
    }
  }, [patchMsg]);

  /** Batalkan draft buku kas (lepas di backend, tanpa posting). */
  const cancelCashBook = useCallback(async (msgId: string, runId: string) => {
    setCbPending(msgId);
    try {
      const resp = await fetch('/api/ai/chat/cashbook-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}) },
        credentials: 'include',
        body: JSON.stringify({ run_id: runId }),
      });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) { toast.error(j?.error || `Gagal membatalkan (HTTP ${resp.status})`); return; }
      patchMsg(msgId, { cashbook: null, status: 'cashbook_cancelled' });
      toast.success('Buku kas dibatalkan.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCbPending(null);
    }
  }, [patchMsg]);

  /** Approve / reject draft → /api/ai/chat/approve. */
  const decide = useCallback(async (msgId: string, runId: string, decision: 'approve' | 'reject') => {
    setApproving(msgId);
    try {
      const resp = await fetch('/api/ai/chat/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ run_id: runId, decision }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        toast.error(data?.error || data?.detail || `Gagal ${decision} (HTTP ${resp.status})`);
        setApproving(null);
        return;
      }
      patchMsg(msgId, { decided: decision });
      if (decision === 'approve') {
        const ref = data?.result?.data?.entryNumber || data?.result?.runId || '';
        toast.success(`Disetujui & dieksekusi${ref ? ` — ${ref}` : ''}`);
        setMessages((prev) => [...prev, {
          id: nextId(), role: 'assistant',
          text: ref ? `✅ Tereksekusi: ${ref}` : '✅ Tereksekusi.',
        }]);
      } else {
        toast('Draft ditolak.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApproving(null);
    }
  }, [patchMsg]);

  const lastStage = [...messages].reverse().find((m) => m.streaming)?.stages?.slice(-1)[0];
  const canSend = !busy && (!!input.trim() || !!attachedFile);

  return (
    <div className="flex h-[calc(100dvh-5rem)] gap-4 sm:h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-6.5rem)]">
      {/* ── Session list ── */}
      <aside aria-label="Riwayat sesi AIRA" className="hidden w-[260px] shrink-0 flex-col border-r border-border pr-4 md:flex">
        <Button onClick={newSession} className="mb-3 w-full">
          <MessageSquarePlus aria-hidden />
          Sesi baru
        </Button>

        <div className="-mr-1 flex-1 overflow-y-auto pr-1">
          {sessionsQuery.isLoading && (
            <div className="space-y-2 py-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          )}

          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <p className="mt-10 px-2 text-center text-sm text-muted-foreground">
              Belum ada sesi.<br />Mulai dengan mengetik pesan.
            </p>
          )}

          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = s.session_id === sessionId;
              const title = (s.title && s.title.trim()) || 'Sesi tanpa judul';
              return (
                <li
                  key={s.session_id}
                  className={cn(
                    'group relative rounded-md border transition-colors',
                    active
                      ? 'border-aira bg-primary-subtle'
                      : 'border-transparent hover:bg-surface-hover',
                  )}
                >
                  {editingId === s.session_id ? (
                    <div className="flex items-center gap-1 p-1.5">
                      <Input
                        autoFocus
                        aria-label="Nama sesi"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') submitRename(s.session_id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="h-8 flex-1 px-2"
                      />
                      <Button size="icon-sm" variant="ghost" onClick={() => submitRename(s.session_id)} aria-label="Simpan nama sesi">
                        <Check className="text-success-text" aria-hidden />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Batal ganti nama">
                        <X aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openSession(s.session_id)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'block w-full rounded-md py-2 pl-2.5 pr-16 text-left',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        <span
                          className={cn(
                            'block truncate text-sm',
                            active ? 'font-semibold text-primary-subtle-foreground' : 'text-foreground',
                          )}
                        >
                          {title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {relativeTime(s.last_active_at)}{s.run_count ? ` · ${s.run_count} aksi` : ''}
                        </span>
                      </button>
                      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <SimpleTooltip content="Ganti nama">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-muted-foreground"
                            onClick={() => { setEditingId(s.session_id); setEditTitle(s.title || ''); }}
                            aria-label={`Ganti nama sesi ${title}`}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip content="Arsipkan">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-danger-text"
                            onClick={() => archiveSession(s.session_id)}
                            aria-label={`Arsipkan sesi ${title}`}
                          >
                            <Archive className="size-3.5" aria-hidden />
                          </Button>
                        </SimpleTooltip>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* ── Chat ── */}
      <section aria-labelledby="aira-title" className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col">
        {/* Header */}
        <header className="mb-2 flex items-center gap-3 border-b border-border pb-3">
          <AiraIcon size={32} className="size-7 shrink-0 sm:size-8" />
          <div className="min-w-0 flex-1">
            <h1 id="aira-title" className="text-base font-semibold leading-tight text-foreground sm:text-lg">
              {route?.label ?? 'Asisten AIRA'}
            </h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Minta AIRA membuat jurnal, mengecek laporan, dan lainnya. Aksi penting menunggu persetujuan Anda.
            </p>
          </div>
          {/* New session on mobile (the session list is hidden there) */}
          <Button size="icon" variant="outline" onClick={newSession} className="md:hidden" aria-label="Sesi baru">
            <MessageSquarePlus aria-hidden />
          </Button>
        </header>

        {/* Messages */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={busy || loadingSession}
          aria-label="Percakapan dengan AIRA"
          tabIndex={0}
          className="flex-1 space-y-4 overflow-y-auto rounded-md px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {loadingSession && (
            <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Memuat riwayat sesi…
            </div>
          )}
          {!loadingSession && messages.length === 0 && (
            <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
              <AiraIcon size={48} />
              <div>
                <p className="font-heading text-base font-semibold text-foreground">Apa yang bisa AIRA bantu?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tulis permintaan dalam bahasa sehari-hari, atau lampirkan dokumen (PDF/gambar) untuk dibaca AIRA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setInput(EXAMPLE_PROMPT); inputRef.current?.focus(); }}
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground-secondary shadow-[var(--shadow-1)]',
                  'transition-colors hover:border-aira hover:bg-surface-hover',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <span className="block text-xs font-medium text-muted-foreground">Contoh</span>
                “{EXAMPLE_PROMPT}”
              </button>
            </div>
          )}
          {!loadingSession && messages.map((m) => (
            <article
              key={m.id}
              aria-label={m.role === 'user' ? 'Pesan Anda' : 'Balasan AIRA'}
              className={cn('flex gap-2.5 sm:gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {m.role === 'assistant' && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                  <AiraIcon size={18} />
                </span>
              )}
              {m.role === 'user' ? (
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                  {m.text}
                </div>
              ) : (
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Auto badge (L3): AIRA executed without human approval */}
                  {m.auto && (
                    <Badge variant="success">
                      <Sparkles className="size-3" aria-hidden />
                      Otomatis
                    </Badge>
                  )}
                  {/* Stage chips while streaming */}
                  {m.stages && m.stages.length > 0 && (m.streaming || !m.draft) && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Tahap AIRA">
                      {m.stages.map((s, i) => (
                        <li key={i}>
                          <Badge variant="primary">
                            {m.streaming && i === m.stages!.length - 1 && <Loader2 className="size-3 animate-spin" aria-hidden />}
                            {s}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.text && <AssistantText text={m.text} />}
                  {m.streaming && !m.text && (!m.stages || m.stages.length === 0) && (
                    <div className="inline-flex rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                      <span className="sr-only">AIRA sedang mengetik…</span>
                    </div>
                  )}
                  {/* Draft approval */}
                  {m.draft && m.runId && (
                    <DraftCard
                      draft={m.draft}
                      pending={approving === m.id}
                      decided={m.decided ?? null}
                      onDecision={(d) => decide(m.id, m.runId!, d)}
                    />
                  )}
                  {m.cashbook && m.runId && (
                    <CashBookCard
                      draft={m.cashbook}
                      coa={m.coa ?? []}
                      runId={m.runId}
                      pending={cbPending === m.id}
                      done={m.cashbookDone ?? null}
                      onApprove={(entries) => approveCashBook(m.id, m.runId!, entries)}
                      onClose={() => patchMsg(m.id, { cashbook: null })}
                      onCancel={() => cancelCashBook(m.id, m.runId!)}
                    />
                  )}
                </div>
              )}
              {m.role === 'user' && (
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-subtle text-neutral-text">
                  <User className="size-4" aria-hidden />
                </span>
              )}
            </article>
          ))}
        </div>
        {/* Progress for screen readers while the log is busy */}
        <p role="status" className="sr-only">
          {busy ? `AIRA sedang memproses${lastStage ? `: ${lastStage}` : ''}…` : ''}
        </p>

        {/* Composer */}
        <form
          className="mt-2 border-t border-border pt-3"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          {/* A2: attached file preview */}
          {attachedFile && (
            <div className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-md border border-border bg-primary-subtle px-3 py-1.5 text-xs text-primary-subtle-foreground">
              {attachedFile.type.startsWith('image/') ? <ImageIcon className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
              <span className="max-w-[200px] truncate">{attachedFile.name}</span>
              <span className="text-foreground-secondary">({(attachedFile.size / 1024).toFixed(0)} KB)</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="ml-1 rounded-sm hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Hapus lampiran ${attachedFile.name}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 10 * 1024 * 1024) { toast.error('Ukuran file maksimal 10MB.'); return; }
                  setAttachedFile(f);
                }
                e.target.value = '';
              }}
            />
            <SimpleTooltip content="Lampirkan dokumen (PDF/gambar, maks. 10MB)">
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                className="rounded-lg text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                aria-label="Lampirkan dokumen"
              >
                <Paperclip className="size-5" aria-hidden />
              </Button>
            </SimpleTooltip>
            <label htmlFor="aira-input" className="sr-only">Pesan untuk AIRA</label>
            <Textarea
              id="aira-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              aria-describedby="aira-input-hint"
              placeholder="Tulis permintaan untuk AIRA…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-lg px-3.5 py-2.5"
            />
            <Button
              type="submit"
              size="icon-touch"
              className="rounded-lg"
              disabled={!canSend}
              loading={busy}
              aria-label={busy ? 'AIRA sedang memproses' : 'Kirim pesan'}
            >
              {!busy && <Send className="size-5" aria-hidden />}
            </Button>
          </div>
          <p id="aira-input-hint" className="mt-1.5 hidden text-xs text-muted-foreground sm:block">
            Enter untuk kirim · Shift+Enter untuk baris baru
          </p>
        </form>
      </section>
    </div>
  );
}

/** Assistant reply bubble; replies that start with ⚠️ render as an error. */
function AssistantText({ text }: { text: string }) {
  const isError = text.startsWith('⚠️');
  if (isError) {
    return (
      <div role="alert" className="flex w-fit max-w-full items-start gap-2 rounded-2xl rounded-tl-sm border border-danger/30 bg-danger-subtle px-4 py-2 text-sm text-danger-text">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="whitespace-pre-wrap break-words">{text.replace(/^⚠️\s*/, '')}</span>
      </div>
    );
  }
  return (
    <div className="w-fit max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2 text-sm text-card-foreground">
      {text}
    </div>
  );
}

export default AiraChat;

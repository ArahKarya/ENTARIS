import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles, Send, Loader2, User, MessageSquarePlus, Archive, Pencil, Check, X, Paperclip, FileText, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { DraftCard, type AiraDraft } from '../components/aira/DraftCard';

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
}

// ── Tipe sesi (dari aira-core via proxy ERP) ──
interface SessionItem {
  session_id: string;
  title: string | null;
  status: 'active' | 'archived';
  last_active_at: string;
  run_count: number;
}

const STAGE_LABEL: Record<string, string> = {
  plan_node: 'Menyusun rencana',
  guardrail: 'Memeriksa kebijakan',
  reason: 'Menimbang keputusan',
  execute: 'Mengeksekusi',
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
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(AIRA_SESSION_KEY));
  const [approving, setApproving] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
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
            const stLabel = `"+chr(0x1F4C4)+" Dokumen terbaca: ${dt}`;
            if (!stages.includes(stLabel)) { stages.push(stLabel); patchMsg(asstId, { stages: [...stages] }); }
          } else if (event === 'token') {
            setMessages((prev) => prev.map((m) => m.id === asstId ? { ...m, text: m.text + (data.text ?? '') } : m));
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3">
      {/* ── Sidebar daftar sesi ── */}
      <aside className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-gray-200 dark:border-gray-700 pr-3">
        <button
          onClick={newSession}
          className="flex items-center justify-center gap-2 w-full mb-3 px-3 py-2 rounded-xl bg-[#0B1B3D] hover:bg-[#142a5c] text-white text-sm font-medium transition"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Sesi baru
        </button>

        <div className="flex-1 overflow-y-auto -mr-1 pr-1 space-y-1">
          {sessionsQuery.isLoading && (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          )}

          {!sessionsQuery.isLoading && sessions.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-10 px-2">
              Belum ada sesi.<br />Mulai dengan mengetik pesan.
            </div>
          )}

          {sessions.map((s) => {
            const active = s.session_id === sessionId;
            const title = (s.title && s.title.trim()) || 'Sesi tanpa judul';
            return (
              <div
                key={s.session_id}
                className={`group rounded-lg px-2.5 py-2 cursor-pointer transition border ${
                  active
                    ? 'bg-[#48CAE4]/15 dark:bg-[#48CAE4]/10 border-[#48CAE4]'
                    : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => openSession(s.session_id)}
              >
                {editingId === s.session_id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(s.session_id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 min-w-0 text-sm px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-[#48CAE4]"
                    />
                    <button onClick={() => submitRename(s.session_id)} className="p-1 text-emerald-600 hover:text-emerald-700" title="Simpan">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:text-gray-600" title="Batal">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${active ? 'font-semibold text-[#0B1B3D] dark:text-[#48CAE4]' : 'text-gray-800 dark:text-gray-200'}`}>
                        {title}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {relativeTime(s.last_active_at)}{s.run_count ? ` · ${s.run_count} aksi` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingId(s.session_id); setEditTitle(s.title || ''); }}
                        className="p-1 text-gray-400 hover:text-[#0B1B3D] dark:hover:text-[#48CAE4]"
                        title="Ganti nama"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); archiveSession(s.session_id); }}
                        className="p-1 text-gray-400 hover:text-red-500"
                        title="Arsipkan"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Area chat ── */}
      <div className="flex flex-col flex-1 min-w-0 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2.5 pb-3 mb-2 border-b border-gray-200 dark:border-gray-700">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0B1B3D] to-[#48CAE4] flex items-center justify-center overflow-hidden p-1">
            <img src="/aira-logo-dark.png" alt="AIRA" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">AIRA Asisten</h1>
            <p className="text-xs text-gray-500">Minta AIRA buat jurnal, cek laporan, dll. Aksi penting butuh persetujuan Anda.</p>
          </div>
          {/* Tombol sesi baru utk mobile (sidebar tersembunyi) */}
          <button
            onClick={newSession}
            className="md:hidden shrink-0 w-9 h-9 rounded-lg bg-[#0B1B3D] hover:bg-[#142a5c] text-white flex items-center justify-center"
            title="Sesi baru"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>

        {/* Pesan */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 py-2 px-1">
          {loadingSession && (
            <div className="flex justify-center mt-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
          {!loadingSession && messages.length === 0 && (
            <div className="text-center text-gray-400 mt-16 space-y-2">
              <img src="/aira-logo-dark.png" alt="AIRA" className="w-12 h-12 mx-auto opacity-40 object-contain dark:hidden" />
              <img src="/aira-logo-dark.png" alt="AIRA" className="w-12 h-12 mx-auto opacity-50 object-contain hidden dark:block" />
              <p className="text-sm">Mulai dengan, mis. <span className="italic">"Buat jurnal koreksi: debit Beban Telekomunikasi 50.000, kredit Petty Cash 50.000"</span></p>
            </div>
          )}
          {!loadingSession && messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#0B1B3D] to-[#48CAE4] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden p-0.5">
                  <img src="/aira-logo-dark.png" alt="AIRA" className="w-full h-full object-contain" />
                </div>
              )}
              <div className={`max-w-[80%] space-y-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {m.role === 'user' ? (
                  <div className="rounded-2xl rounded-tr-sm bg-[#0B1B3D] text-white px-4 py-2 text-sm">{m.text}</div>
                ) : (
                  <div className="space-y-2">
                    {/* Badge otomatis (L3): AIRA eksekusi tanpa approval */}
                    {m.auto && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                        <Sparkles className="w-3 h-3" />
                        Otomatis
                      </span>
                    )}
                    {/* Stage chips saat streaming */}
                    {m.stages && m.stages.length > 0 && (m.streaming || !m.draft) && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.stages.map((s, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 flex items-center gap-1">
                            {m.streaming && i === m.stages!.length - 1 && <Loader2 className="w-3 h-3 animate-spin" />}
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-4 py-2 text-sm whitespace-pre-wrap">
                        {m.text}
                        {m.streaming && !m.text && <Loader2 className="w-4 h-4 animate-spin" />}
                      </div>
                    )}
                    {m.streaming && !m.text && (!m.stages || m.stages.length === 0) && (
                      <div className="rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-gray-800 px-4 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
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
                  </div>
                )}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-md bg-gray-300 dark:bg-gray-600 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-200" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="pt-3 mt-2 border-t border-gray-200 dark:border-gray-700">
          {/* A2: preview lampiran terpasang */}
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#48CAE4]/10 border border-[#48CAE4]/40 px-3 py-1.5 text-xs text-[#0B1B3D] dark:text-[#9be3f4] w-fit max-w-full">
              {attachedFile.type.startsWith("image/") ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
              <span className="truncate max-w-[200px]">{attachedFile.name}</span>
              <span className="opacity-60">({(attachedFile.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={() => setAttachedFile(null)} className="ml-1 hover:text-red-500" aria-label="Hapus lampiran">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 10 * 1024 * 1024) { toast.error("Ukuran file maksimal 10MB."); return; }
                  setAttachedFile(f);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="Lampirkan dokumen (PDF/gambar)"
              className="shrink-0 w-11 h-11 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-[#0B1B3D] hover:border-[#48CAE4] disabled:opacity-40 flex items-center justify-center transition"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Tulis permintaan untuk AIRA… (Enter kirim, Shift+Enter baris baru)"
              className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#48CAE4] max-h-32"
            />
            <button
              onClick={send}
              disabled={busy || (!input.trim() && !attachedFile)}
              className="shrink-0 w-11 h-11 rounded-xl bg-[#0B1B3D] hover:bg-[#142a5c] disabled:opacity-40 text-white flex items-center justify-center transition"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiraChat;

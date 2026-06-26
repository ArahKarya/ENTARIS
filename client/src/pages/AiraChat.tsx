import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
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

export function AiraChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  /** Update 1 pesan assistant by id (immutable). */
  const patchMsg = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text };
    const asstId = nextId();
    const asstMsg: ChatMessage = {
      id: asstId, role: 'assistant', text: '', stages: [], draft: null, streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, asstMsg]);

    try {
      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ input: text, session_id: sessionId ?? undefined }),
      });

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
            const d = data.data as Record<string, any> | null;
            const ref = d?.entryNumber || d?.docNumber || d?.number || data.run_id || '';
            patchMsg(asstId, {
              streaming: false,
              status: 'executed',
              auto: !!data.auto,
              text: data.auto
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
    } catch (err) {
      patchMsg(asstId, { streaming: false, text: `⚠️ ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [input, busy, sessionId, patchMsg]);

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
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-3 mb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0B1B3D] to-[#48CAE4] flex items-center justify-center overflow-hidden p-1">
          <img src="/aira-logo-dark.png" alt="AIRA" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">AIRA Asisten</h1>
          <p className="text-xs text-gray-500">Minta AIRA buat jurnal, cek laporan, dll. Aksi penting butuh persetujuan Anda.</p>
        </div>
      </div>

      {/* Pesan */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 py-2 px-1">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16 space-y-2">
            <img src="/aira-logo-dark.png" alt="AIRA" className="w-12 h-12 mx-auto opacity-40 object-contain dark:hidden" />
            <img src="/aira-logo-dark.png" alt="AIRA" className="w-12 h-12 mx-auto opacity-50 object-contain hidden dark:block" />
            <p className="text-sm">Mulai dengan, mis. <span className="italic">"Buat jurnal koreksi: debit Beban Telekomunikasi 50.000, kredit Petty Cash 50.000"</span></p>
          </div>
        )}
        {messages.map((m) => (
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
        <div className="flex items-end gap-2">
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
            disabled={busy || !input.trim()}
            className="shrink-0 w-11 h-11 rounded-xl bg-[#0B1B3D] hover:bg-[#142a5c] disabled:opacity-40 text-white flex items-center justify-center transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AiraChat;

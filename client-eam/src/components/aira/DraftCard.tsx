import type { FC } from 'react';
import { Check, X, FileText, AlertTriangle } from 'lucide-react';

/** Baris jurnal dari draft (je_create). */
interface JournalLine {
  account?: string;
  accountLabel?: string;
  debit?: number;
  credit?: number;
}

export interface AiraDraft {
  type?: string;
  tool?: string | null;
  risk?: string | null;
  tier?: string;
  args?: {
    lines?: JournalLine[];
    items?: JournalLine[];
    memo?: string;
    narration?: string;
    [k: string]: unknown;
  };
  summary?: string;
  confirm?: string;
  reason?: string;
  roles?: string[];
}

function fmtRp(n: number | undefined): string {
  if (typeof n !== 'number' || n === 0) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  read: { label: 'Baca', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  write: { label: 'Tulis', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  critical: { label: 'Kritis', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
};

/**
 * Kartu draft approval AIRA. Untuk je_create render tabel debit/credit + cek
 * balanced. Tombol Setujui/Tolak memanggil onDecision (parent → /api/ai/chat/approve).
 */
export const DraftCard: FC<{
  draft: AiraDraft;
  pending?: boolean;
  decided?: 'approve' | 'reject' | null;
  onDecision: (decision: 'approve' | 'reject') => void;
}> = ({ draft, pending = false, decided = null, onDecision }) => {
  const lines = draft.args?.lines ?? draft.args?.items ?? [];
  const memo = draft.args?.memo ?? draft.args?.narration ?? '';
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const risk = draft.risk ?? 'write';
  const badge = RISK_BADGE[risk] ?? RISK_BADGE.write;
  const isJournal = (draft.tool ?? '').includes('je_') || lines.length > 0;

  return (
    <div className="rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200/70 dark:border-amber-800/40 bg-amber-100/50 dark:bg-amber-900/20">
        <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <span className="font-semibold text-sm text-amber-900 dark:text-amber-200">
          Draft Persetujuan
        </span>
        <span className="font-mono text-[11px] text-gray-500">{draft.tool}</span>
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {draft.summary && (
          <p className="text-sm text-gray-700 dark:text-gray-300">{draft.summary}</p>
        )}
        {draft.reason && (
          <p className="text-xs italic text-gray-500 dark:text-gray-400">
            Alasan AIRA: {draft.reason}
          </p>
        )}

        {isJournal && lines.length > 0 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs">
                  <th className="text-left font-medium px-3 py-1.5">Akun</th>
                  <th className="text-right font-medium px-3 py-1.5">Debit</th>
                  <th className="text-right font-medium px-3 py-1.5">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {l.account}{l.accountLabel ? ` — ${l.accountLabel}` : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(l.debit)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(l.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 font-semibold bg-gray-50/70 dark:bg-gray-800/30">
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {balanced ? (
                      <span className="text-emerald-600 dark:text-emerald-400">● Balanced</span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Tidak balanced
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(totalDebit)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtRp(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {memo && (
          <p className="text-xs text-gray-500">
            <span className="font-medium">Keterangan:</span> {memo}
          </p>
        )}
      </div>

      {/* Aksi */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-amber-200/70 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/10">
        {decided === 'approve' ? (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Disetujui & dieksekusi
          </span>
        ) : decided === 'reject' ? (
          <span className="text-sm font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <X className="w-4 h-4" /> Ditolak
          </span>
        ) : (
          <>
            <button
              disabled={pending}
              onClick={() => onDecision('approve')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition"
            >
              <Check className="w-4 h-4" /> Setujui
            </button>
            <button
              disabled={pending}
              onClick={() => onDecision('reject')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 text-sm font-medium transition"
            >
              <X className="w-4 h-4" /> Tolak
            </button>
            {pending && <span className="text-xs text-gray-400 ml-1">memproses…</span>}
          </>
        )}
      </div>
    </div>
  );
};

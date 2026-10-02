import { useState } from 'react';
import { Loader2, Check, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface CashEntry {
  idx: number;
  date: string;
  keterangan: string;
  amount: number;
  txnType: string;
  account: string;
  accountLabel: string;
  lines: Array<{ account: string; accountLabel: string; debit: number; credit: number; description: string }>;
  confidence: number;
  needsReview: boolean;
  reason: string;
}
export interface CashBookDraftData {
  title: string | null;
  date: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  entries: CashEntry[];
  totals: { masuk: number; keluar: number; count: number; needReview: number };
}
export interface CoaOption { accountNumber: string; name: string; }

interface Props {
  draft: CashBookDraftData;
  coa: CoaOption[];
  runId: string;
  pending: boolean;
  done: { posted: number; skipped: number; failed: number; learned: number } | null;
  onApprove: (entries: Array<{ idx: number; account?: string; accountLabel?: string; skip?: boolean }>) => void;
  onClose?: () => void;   // sembunyikan kartu (FE saja)
  onCancel?: () => void;  // batalkan draft di backend
}

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const TXN_LABEL: Record<string, string> = {
  pengeluaran: 'Keluar', pemasukan: 'Masuk', uang_muka: 'Uang Muka', terima_kasbon: 'Terima Kasbon', lainnya: 'Lainnya',
};

export function CashBookCard({ draft, coa, pending, done, onApprove, onClose, onCancel }: Props) {
  // state koreksi per-baris: account override + skip
  const [edits, setEdits] = useState<Record<number, { account?: string; skip?: boolean }>>({});

  const setAccount = (idx: number, account: string) => {
    const label = coa.find((c) => c.accountNumber === account)?.name ?? '';
    setEdits((p) => ({ ...p, [idx]: { ...p[idx], account, _label: label } as any }));
  };
  const toggleSkip = (idx: number) => setEdits((p) => ({ ...p, [idx]: { ...p[idx], skip: !p[idx]?.skip } }));

  const submit = () => {
    const entries = draft.entries.map((e) => {
      const ed = edits[e.idx];
      const account = ed?.account;
      const accountLabel = account ? coa.find((c) => c.accountNumber === account)?.name : undefined;
      return { idx: e.idx, account, accountLabel, skip: ed?.skip };
    });
    onApprove(entries);
  };

  const willPost = draft.entries.filter((e) => !edits[e.idx]?.skip).length;

  if (done) {
    return (
      <div className="mt-2 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300">
          <CheckCircle2 className="w-4 h-4" /> Buku kas diposting
        </div>
        <div className="mt-1 text-gray-600 dark:text-gray-300">
          {done.posted} jurnal diposting{done.skipped ? `, ${done.skipped} dilewati` : ''}{done.failed ? `, ${done.failed} gagal` : ''}.
          {done.learned ? ` AIRA belajar ${done.learned} pemetaan akun baru.` : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#48CAE4]/50 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-3 py-2 bg-[#0B1B3D] text-white text-sm font-medium flex items-center justify-between">
        <span>{draft.title || 'Buku Kas'} {draft.date ? `— ${draft.date}` : ''}</span>
        <span className="text-xs opacity-80">{draft.totals.count} baris · {draft.totals.needReview} perlu cek</span>
      </div>
      {draft.totals.needReview > 0 && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {draft.totals.needReview} baris kuning = AIRA ragu, mohon cek/koreksi akunnya.
        </div>
      )}
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-2 py-1.5 text-left">Keterangan</th>
              <th className="px-2 py-1.5 text-right">Nominal</th>
              <th className="px-2 py-1.5 text-left">Arah</th>
              <th className="px-2 py-1.5 text-left">Akun (lawan kas)</th>
              <th className="px-2 py-1.5 text-center">Skip</th>
            </tr>
          </thead>
          <tbody>
            {draft.entries.map((e) => {
              const ed = edits[e.idx];
              const curAccount = ed?.account ?? e.account;
              const review = e.needsReview && !ed?.account;
              return (
                <tr key={e.idx} className={`border-t border-gray-100 dark:border-gray-800 ${ed?.skip ? 'opacity-40' : ''} ${review ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                  <td className="px-2 py-1.5 max-w-[180px]"><span className="line-clamp-2">{e.keterangan}</span></td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{rupiah(e.amount)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{TXN_LABEL[e.txnType] ?? e.txnType}</td>
                  <td className="px-2 py-1.5">
                    <select
                      value={curAccount}
                      onChange={(ev) => setAccount(e.idx, ev.target.value)}
                      disabled={pending || ed?.skip}
                      className={`w-full max-w-[200px] rounded border px-1 py-0.5 text-xs bg-white dark:bg-gray-900 ${review ? 'border-amber-400' : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      {!coa.some((c) => c.accountNumber === curAccount) && <option value={curAccount}>{curAccount} {e.accountLabel}</option>}
                      {coa.map((c) => <option key={c.accountNumber} value={c.accountNumber}>{c.accountNumber} — {c.name}</option>)}
                    </select>
                    {review && <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">{e.reason}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={!!ed?.skip} onChange={() => toggleSkip(e.idx)} disabled={pending} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 text-xs">
        <span className="text-gray-500 shrink-0">Masuk {rupiah(draft.totals.masuk)} · Keluar {rupiah(draft.totals.keluar)}</span>
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              disabled={pending}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              Tutup
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={pending}
              className="px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Batalkan
            </button>
          )}
          <button
            onClick={submit}
            disabled={pending || willPost === 0}
            className="px-3 py-1.5 rounded-lg bg-[#0B1B3D] hover:bg-[#142a5c] disabled:opacity-40 text-white flex items-center gap-1.5"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Posting {willPost} jurnal
          </button>
        </div>
      </div>
    </div>
  );
}

export default CashBookCard;

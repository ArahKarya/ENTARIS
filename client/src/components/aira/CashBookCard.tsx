import { useState } from "react";
import { Check, AlertTriangle, CheckCircle2, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CashEntry {
  idx: number;
  date: string;
  keterangan: string;
  amount: number;
  txnType: string;
  account: string;
  accountLabel: string;
  lines: Array<{
    account: string;
    accountLabel: string;
    debit: number;
    credit: number;
    description: string;
  }>;
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
export interface CoaOption {
  accountNumber: string;
  name: string;
}

type ApproveEntry = {
  idx: number;
  account?: string;
  accountLabel?: string;
  skip?: boolean;
};

interface Props {
  draft: CashBookDraftData;
  coa: CoaOption[];
  runId: string;
  pending: boolean;
  done: {
    posted: number;
    skipped: number;
    failed: number;
    learned: number;
  } | null;
  onApprove: (entries: ApproveEntry[]) => void;
  onClose?: () => void; // hide the card (front end only)
  onCancel?: () => void; // cancel the draft in the backend
}

const rupiah = (n: number) => formatRupiah(n || 0);
const TXN_LABEL: Record<string, string> = {
  pengeluaran: "Keluar",
  pemasukan: "Masuk",
  uang_muka: "Uang Muka",
  terima_kasbon: "Terima Kasbon",
  lainnya: "Lainnya",
};

/** Native select styled like ui/input (tokens, focus ring). */
const selectClass =
  "w-full max-w-[220px] rounded-md border bg-card px-2 py-1 text-xs text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/**
 * AIRA cash-book approval card: one row per transaction, account correction per
 * row, skip toggle, then Setujui (post) or Tolak (cancel the draft, confirmed).
 */
export function CashBookCard({
  draft,
  coa,
  runId,
  pending,
  done,
  onApprove,
  onClose,
  onCancel,
}: Props) {
  // Per-row corrections: account override + skip.
  const [edits, setEdits] = useState<
    Record<number, { account?: string; skip?: boolean }>
  >({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [lastAction, setLastAction] = useState<"approve" | "cancel" | null>(
    null,
  );

  const setAccount = (idx: number, account: string) => {
    setEdits((p) => ({ ...p, [idx]: { ...p[idx], account } }));
  };
  const toggleSkip = (idx: number) =>
    setEdits((p) => ({ ...p, [idx]: { ...p[idx], skip: !p[idx]?.skip } }));

  const submit = () => {
    const entries = draft.entries.map((e) => {
      const ed = edits[e.idx];
      const account = ed?.account;
      const accountLabel = account
        ? coa.find((c) => c.accountNumber === account)?.name
        : undefined;
      return { idx: e.idx, account, accountLabel, skip: ed?.skip };
    });
    setLastAction("approve");
    onApprove(entries);
  };

  const cancel = () => {
    setLastAction("cancel");
    onCancel?.();
  };

  const willPost = draft.entries.filter((e) => !edits[e.idx]?.skip).length;
  const heading = `${draft.title || "Buku Kas"}${draft.date ? ` — ${draft.date}` : ""}`;

  const rowClass = (e: CashEntry) =>
    cn(
      "border-t border-border",
      edits[e.idx]?.skip && "bg-surface-sunken text-muted-foreground",
      e.needsReview && !edits[e.idx]?.account && "bg-warning-subtle/60",
    );

  /** Account picker for one entry; `variant` keeps ids unique between table and list. */
  const accountControl = (e: CashEntry, variant: "t" | "m") => {
    const ed = edits[e.idx];
    const curAccount = ed?.account ?? e.account;
    const review = e.needsReview && !ed?.account;
    const reasonId = `cb-reason-${runId}-${e.idx}-${variant}`;
    return (
      <div>
        <select
          value={curAccount}
          onChange={(ev) => setAccount(e.idx, ev.target.value)}
          disabled={pending || ed?.skip}
          aria-label={`Akun lawan kas: ${e.keterangan}`}
          aria-describedby={review && e.reason ? reasonId : undefined}
          aria-invalid={review || undefined}
          className={cn(
            selectClass,
            variant === "m" && "max-w-none py-1.5 text-sm",
            review ? "border-warning" : "border-input",
          )}
        >
          {!coa.some((c) => c.accountNumber === curAccount) && (
            <option value={curAccount}>
              {curAccount} {e.accountLabel}
            </option>
          )}
          {coa.map((c) => (
            <option key={c.accountNumber} value={c.accountNumber}>
              {c.accountNumber} — {c.name}
            </option>
          ))}
        </select>
        {review && e.reason && (
          <p
            id={reasonId}
            className="mt-0.5 text-[11px] leading-4 text-warning-text"
          >
            {e.reason}
          </p>
        )}
      </div>
    );
  };

  const skipControl = (e: CashEntry) => (
    <input
      type="checkbox"
      checked={!!edits[e.idx]?.skip}
      onChange={() => toggleSkip(e.idx)}
      disabled={pending}
      aria-label={`Lewati: ${e.keterangan}`}
      className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
    />
  );

  if (done) {
    return (
      <div
        role="status"
        className="rounded-lg border border-success/40 bg-success-subtle p-3 text-sm"
      >
        <div className="flex items-center gap-2 font-medium text-success-text">
          <CheckCircle2 className="size-4" aria-hidden /> Buku kas diposting
        </div>
        <p className="mt-1 text-foreground-secondary">
          {done.posted} jurnal diposting
          {done.skipped ? `, ${done.skipped} dilewati` : ""}
          {done.failed ? `, ${done.failed} gagal` : ""}.
          {done.learned
            ? ` AIRA belajar ${done.learned} pemetaan akun baru.`
            : ""}
        </p>
      </div>
    );
  }

  return (
    <section
      data-testid="aira-cashbook-card"
      aria-label={`Draft buku kas: ${heading}`}
      className="overflow-hidden rounded-lg border border-border border-l-4 border-l-warning bg-card text-card-foreground shadow-[var(--shadow-1)]"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-2.5">
        <BookOpen className="size-4 text-warning-text" aria-hidden />
        <h3 className="font-sans text-sm font-semibold tracking-normal text-foreground">
          {heading}
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {draft.totals.count} baris · {draft.totals.needReview} perlu dicek
        </span>
      </div>
      {draft.totals.needReview > 0 && (
        <p className="flex items-start gap-1.5 bg-warning-subtle px-3 py-1.5 text-xs text-warning-text">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {draft.totals.needReview} baris bertanda kuning: AIRA ragu, mohon cek
          atau koreksi akunnya.
        </p>
      )}
      {/* ≥sm: table */}
      <div className="hidden max-h-80 overflow-auto sm:block">
        <table className="w-full text-xs">
          <caption className="sr-only">
            Transaksi buku kas yang akan diposting
          </caption>
          <thead className="sticky top-0 z-[1] bg-surface-sunken text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                Keterangan
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Nominal
              </th>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                Arah
              </th>
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                Akun (lawan kas)
              </th>
              <th scope="col" className="px-2 py-1.5 text-center font-medium">
                Lewati
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.entries.map((e) => (
              <tr key={e.idx} className={rowClass(e)}>
                <td className="max-w-[180px] px-2 py-1.5">
                  <span
                    className={cn(
                      "line-clamp-2",
                      edits[e.idx]?.skip && "line-through",
                    )}
                  >
                    {e.keterangan}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {rupiah(e.amount)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {TXN_LABEL[e.txnType] ?? e.txnType}
                </td>
                <td className="px-2 py-1.5">{accountControl(e, "t")}</td>
                <td className="px-2 py-1.5 text-center">{skipControl(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* <sm: stacked list (no sideways scrolling inside the chat) */}
      <ul
        className="max-h-96 overflow-y-auto sm:hidden"
        aria-label="Transaksi buku kas yang akan diposting"
      >
        {draft.entries.map((e) => (
          <li
            key={e.idx}
            className={cn(rowClass(e), "space-y-1.5 px-3 py-2.5 text-xs")}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "min-w-0 text-sm",
                  edits[e.idx]?.skip && "line-through",
                )}
              >
                {e.keterangan}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums">
                  {rupiah(e.amount)}
                </span>
                <span className="text-muted-foreground">
                  {TXN_LABEL[e.txnType] ?? e.txnType}
                </span>
              </span>
            </div>
            {accountControl(e, "m")}
            <label className="inline-flex items-center gap-2 text-foreground-secondary">
              {skipControl(e)} Lewati baris ini
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-sunken px-3 py-2.5 text-xs">
        <span className="tabular-nums text-muted-foreground">
          Masuk {rupiah(draft.totals.masuk)} · Keluar{" "}
          {rupiah(draft.totals.keluar)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={pending}
            >
              Sembunyikan
            </Button>
          )}
          {onCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-danger-text"
              onClick={() => setConfirmCancel(true)}
              disabled={pending}
              loading={pending && lastAction === "cancel"}
            >
              {!(pending && lastAction === "cancel") && <X aria-hidden />}
              Tolak
            </Button>
          )}
          <Button
            size="sm"
            onClick={submit}
            disabled={pending || willPost === 0}
            loading={pending && lastAction === "approve"}
          >
            {!(pending && lastAction === "approve") && <Check aria-hidden />}
            Setujui &amp; posting {willPost} jurnal
          </Button>
        </div>
      </div>

      {onCancel && (
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          tone="danger"
          title="Tolak draft buku kas?"
          description={`Draft ${draft.totals.count} transaksi dibatalkan dan tidak ada jurnal yang diposting. Untuk mencobanya lagi, kirim ulang buku kasnya ke AIRA.`}
          confirmLabel="Tolak draft"
          cancelLabel="Kembali"
          onConfirm={cancel}
        />
      )}
    </section>
  );
}

export default CashBookCard;

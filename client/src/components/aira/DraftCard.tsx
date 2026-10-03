import { useState } from "react";
import {
  Check,
  X,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatRupiah } from "@/lib/format";

/** Journal line from a draft (je_create). */
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

type Decision = "approve" | "reject";

/** Zero / missing amounts show a dash, like the old card. */
function fmtAmount(n: number | undefined): string {
  if (typeof n !== "number" || n === 0) return "-";
  return formatRupiah(n, { decimals: Number.isInteger(n) ? 0 : 2 });
}

const RISK_BADGE: Record<
  string,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  read: { label: "Baca", variant: "info" },
  write: { label: "Tulis", variant: "warning" },
  critical: { label: "Kritis", variant: "danger" },
};

interface DraftCardProps {
  draft: AiraDraft;
  pending?: boolean;
  decided?: Decision | null;
  onDecision: (decision: Decision) => void;
}

/**
 * AIRA approval card. For je_create it renders the debit/credit table with a
 * balance check. Setujui runs straight away; Tolak asks for confirmation first.
 * The parent posts the decision to /api/ai/chat/approve.
 */
export function DraftCard({
  draft,
  pending = false,
  decided = null,
  onDecision,
}: DraftCardProps) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [lastAction, setLastAction] = useState<Decision | null>(null);

  const lines = draft.args?.lines ?? draft.args?.items ?? [];
  const memo = draft.args?.memo ?? draft.args?.narration ?? "";
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const risk = draft.risk ?? "write";
  const badge = RISK_BADGE[risk] ?? RISK_BADGE.write;
  const isJournal = (draft.tool ?? "").includes("je_") || lines.length > 0;

  const decide = (decision: Decision) => {
    setLastAction(decision);
    onDecision(decision);
  };

  return (
    <section
      data-testid="aira-draft-card"
      aria-label="Draft persetujuan AIRA"
      className="overflow-hidden rounded-lg border border-border border-l-4 border-l-warning bg-card text-card-foreground shadow-[var(--shadow-1)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5">
        <FileCheck2 className="size-4 text-warning-text" aria-hidden />
        <h3 className="font-sans text-sm font-semibold tracking-normal text-foreground">
          Draft persetujuan
        </h3>
        {draft.tool && (
          <span className="font-mono text-xs text-muted-foreground">
            {draft.tool}
          </span>
        )}
        <Badge variant={badge.variant} className="ml-auto">
          Risiko: {badge.label}
        </Badge>
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 py-3">
        {draft.summary && (
          <p className="text-sm text-foreground">{draft.summary}</p>
        )}
        {draft.reason && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground-secondary">
              Alasan AIRA:
            </span>{" "}
            {draft.reason}
          </p>
        )}

        {isJournal && lines.length > 0 && (
          <>
            {/* ≥sm: table */}
            <div className="hidden overflow-hidden rounded-md border border-border sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Baris jurnal yang diusulkan
                </caption>
                <thead>
                  <tr className="bg-surface-sunken text-xs text-muted-foreground">
                    <th
                      scope="col"
                      className="px-3 py-1.5 text-left font-medium"
                    >
                      Akun
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-1.5 text-right font-medium"
                    >
                      Debit
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-1.5 text-right font-medium"
                    >
                      Kredit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5 text-foreground">
                        <span className="font-mono text-xs text-muted-foreground">
                          {l.account}
                        </span>
                        {l.accountLabel && (
                          <span className="ml-2">{l.accountLabel}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {fmtAmount(l.debit)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                        {fmtAmount(l.credit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-sunken font-semibold">
                    <td className="px-3 py-1.5 text-xs">
                      {balanced ? (
                        <span className="inline-flex items-center gap-1 text-success-text">
                          <CheckCircle2 className="size-3.5" aria-hidden />{" "}
                          Seimbang
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-danger-text">
                          <AlertTriangle className="size-3.5" aria-hidden />{" "}
                          Tidak seimbang
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      {fmtAmount(totalDebit)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                      {fmtAmount(totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* <sm: stacked lines, no sideways scrolling */}
            <div className="rounded-md border border-border text-sm sm:hidden">
              <ul aria-label="Baris jurnal yang diusulkan">
                {lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 border-b border-border px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-muted-foreground">
                        {l.account}
                      </span>
                      {l.accountLabel && (
                        <span className="block">{l.accountLabel}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {(l.debit || 0) !== 0 && (
                        <span className="block">
                          Debit {fmtAmount(l.debit)}
                        </span>
                      )}
                      {(l.credit || 0) !== 0 && (
                        <span className="block">
                          Kredit {fmtAmount(l.credit)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-start justify-between gap-3 bg-surface-sunken px-3 py-2 text-xs font-semibold">
                {balanced ? (
                  <span className="inline-flex items-center gap-1 text-success-text">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Seimbang
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-danger-text">
                    <AlertTriangle className="size-3.5" aria-hidden /> Tidak
                    seimbang
                  </span>
                )}
                <span className="text-right tabular-nums">
                  <span className="block">Debit {fmtAmount(totalDebit)}</span>
                  <span className="block">Kredit {fmtAmount(totalCredit)}</span>
                </span>
              </div>
            </div>
          </>
        )}

        {memo && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground-secondary">
              Keterangan:
            </span>{" "}
            {memo}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-sunken px-4 py-2.5">
        <span role="status" className="sr-only">
          {decided === "approve"
            ? "Draft disetujui dan dieksekusi."
            : decided === "reject"
              ? "Draft ditolak."
              : ""}
        </span>
        {decided === "approve" ? (
          <span
            aria-hidden
            className="inline-flex items-center gap-1.5 text-sm font-medium text-success-text"
          >
            <CheckCircle2 className="size-4" aria-hidden /> Disetujui &amp;
            dieksekusi
          </span>
        ) : decided === "reject" ? (
          <span
            aria-hidden
            className="inline-flex items-center gap-1.5 text-sm font-medium text-danger-text"
          >
            <XCircle className="size-4" aria-hidden /> Ditolak
          </span>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => decide("approve")}
              disabled={pending}
              loading={pending && lastAction === "approve"}
            >
              {!(pending && lastAction === "approve") && <Check aria-hidden />}
              Setujui
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReject(true)}
              disabled={pending}
              loading={pending && lastAction === "reject"}
              className="text-danger-text"
            >
              {!(pending && lastAction === "reject") && <X aria-hidden />}
              Tolak
            </Button>
            {pending && (
              <span className="text-xs text-muted-foreground">Memproses…</span>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        tone="danger"
        title="Tolak draft ini?"
        description="AIRA tidak akan menjalankan aksi ini. Untuk mencobanya lagi, minta AIRA menyusun draft baru."
        confirmLabel="Tolak draft"
        cancelLabel="Kembali"
        onConfirm={() => decide("reject")}
      />
    </section>
  );
}

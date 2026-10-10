import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, ClipboardCheck } from 'lucide-react';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared';
import { AttachmentPicker } from './AttachmentPicker';
import { PlanVsActual } from './PlanVsActual';
import { TRAVEL_CATEGORY_LABEL, formatMoney, type PaymentRequestDetail } from './payment-request';

const WAITING: Record<string, (pr: PaymentRequestDetail) => string> = {
  SUBMITTED: (pr) => `Menunggu persetujuan ${pr.settlementSupervisor?.fullName ?? 'atasan'}`,
  PENDING_FINANCE: () => 'Menunggu verifikasi dan posting Keuangan',
};

/** Pertanggungjawaban block of the detail page (read-only; actions live in the action bar). */
export function SettlementCard({ pr, onFill }: { pr: PaymentRequestDetail; onFill: () => void }) {
  const status = pr.settlementStatus;
  if (!status) return null;
  const advance = toNumber(pr.totalAmount) ?? 0;
  const lines = pr.settlementLines;
  const realized = lines.reduce((s, l) => s + (toNumber(l.amount) ?? 0), 0);
  const diff = Math.round((realized - advance) * 100) / 100;
  const attachments = pr.attachments.filter((a) => a.scope === 'SETTLEMENT');
  const age = pr.advanceAge;
  const canFill = pr.actions.settlement.edit;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          Pertanggungjawaban
          <StatusBadge status={status} docType="payment_request_settlement" />
        </CardTitle>
        {canFill && (
          <Button size="sm" onClick={onFill}>
            <ClipboardCheck aria-hidden />
            {status === 'REVISION' ? 'Revisi pertanggungjawaban' : lines.length ? 'Lanjutkan pengisian' : 'Isi pertanggungjawaban'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {age && (
          <p
            role={age.overdue ? 'alert' : 'status'}
            className={
              age.overdue
                ? 'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground'
                : 'rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground'
            }
          >
            {age.overdue && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />}
            <span>
              Uang muka {formatMoney(advance)} dibayar {pr.paymentDate ? formatDate(pr.paymentDate) : '—'},{' '}
              <span className="num font-medium">{age.days} hari</span> belum selesai
              {age.overdue ? ` (melewati ${age.overdueDays} hari / batas waktu)` : ''}.
            </span>
          </p>
        )}
        {WAITING[status] && <p className="text-sm text-muted-foreground">{WAITING[status](pr)}</p>}
        {status === 'REVISION' && pr.settlementLastNote && (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">Catatan revisi:</span> {pr.settlementLastNote}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada rincian realisasi.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {lines.map((l, i) => (
                <li key={l.id} className="grid gap-1 py-2.5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      <span className="num mr-2 text-muted-foreground">{i + 1}.</span>
                      {l.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[l.category && TRAVEL_CATEGORY_LABEL[l.category], l.expenseDate && formatDate(l.expenseDate), l.expenseAccount && `${l.expenseAccount.accountNumber} · ${l.expenseAccount.name}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <p className="num text-right text-sm font-semibold text-foreground">{formatMoney(l.amount)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Uang muka</dt><dd className="num">{formatMoney(advance)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Total realisasi</dt><dd className="num font-semibold">{formatMoney(realized)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{diff < 0 ? 'Sisa uang muka (dikembalikan)' : diff > 0 ? 'Kurang bayar (dibayar perusahaan)' : 'Selisih'}</dt>
                <dd className={`num font-semibold ${diff > 0 ? 'text-danger' : ''}`}>{formatMoney(Math.abs(diff))}</dd>
              </div>
            </dl>
            {pr.type.kind === 'TRAVEL' && <PlanVsActual planned={pr.lines.map((l) => ({ category: l.category, amount: toNumber(l.amount) }))} actual={lines.map((l) => ({ category: l.category, amount: toNumber(l.amount) }))} />}
          </>
        )}

        {pr.settlementNote && (
          <p className="whitespace-pre-line rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">Catatan pengaju:</span> {pr.settlementNote}
          </p>
        )}
        {pr.settlementDeadline && status !== 'SETTLED' && (
          <p className="text-xs text-muted-foreground">Batas waktu: {formatDate(pr.settlementDeadline)}</p>
        )}
        {attachments.length > 0 && <AttachmentPicker saved={attachments} pending={[]} onPendingChange={() => undefined} readOnly />}

        {status === 'SETTLED' && (
          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Diposting</dt><dd>{pr.settledAt ? formatDateTime(pr.settledAt) : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tanggal</dt><dd>{pr.settlementDate ? formatDate(pr.settlementDate) : '—'}</dd></div>
            {pr.settlementCashAccount && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Kas/bank</dt><dd className="text-right">{pr.settlementCashAccount.accountNumber} · {pr.settlementCashAccount.name}</dd></div>
            )}
            {pr.settlementReference && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Referensi</dt><dd>{pr.settlementReference}</dd></div>}
            {pr.settlementJournal && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Jurnal</dt>
                <dd>
                  {pr.actions.viewJournal ? (
                    <Link to={`/gl?q=${encodeURIComponent(pr.settlementJournal.entryNumber)}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <BookOpen className="size-3.5" aria-hidden />
                      {pr.settlementJournal.entryNumber}
                    </Link>
                  ) : (
                    pr.settlementJournal.entryNumber
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

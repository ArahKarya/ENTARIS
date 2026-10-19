import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, BookOpen, ClipboardCheck } from 'lucide-react';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared';
import { AttachmentPicker } from './AttachmentPicker';
import { PlanVsActual } from './PlanVsActual';
import { TRAVEL_CATEGORY_LABEL, formatMoney, type PaymentRequestDetail } from './payment-request';


/** Pertanggungjawaban block of the detail page (read-only; actions live in the action bar). */
export function SettlementCard({ pr, onFill }: { pr: PaymentRequestDetail; onFill: () => void }) {
  const { t } = useTranslation('finance');
  const status = pr.settlementStatus;
  if (!status) return null;
  const advance = toNumber(pr.totalAmount) ?? 0;
  const lines = pr.settlementLines;
  const realized = lines.reduce((s, l) => s + (toNumber(l.amount) ?? 0), 0);
  const diff = Math.round((realized - advance) * 100) / 100;
  const attachments = pr.attachments.filter((a) => a.scope === 'SETTLEMENT');
  const age = pr.advanceAge;
  const canFill = pr.actions.settlement.edit;
  const waiting =
    status === 'SUBMITTED'
      ? pr.settlementSupervisor
        ? t('settlementCard.waiting.supervisorNamed', { name: pr.settlementSupervisor.fullName })
        : t('settlementCard.waiting.supervisor')
      : status === 'PENDING_FINANCE'
        ? t('settlementCard.waiting.finance')
        : null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('settlementCard.title')}
          <StatusBadge status={status} docType="payment_request_settlement" />
        </CardTitle>
        {canFill && (
          <Button size="sm" onClick={onFill}>
            <ClipboardCheck aria-hidden />
            {status === 'REVISION' ? t('settlementCard.fill.revise') : lines.length ? t('settlementCard.fill.continue') : t('settlementCard.fill.start')}
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
              <Trans
                t={t}
                i18nKey={age.overdue ? 'settlementCard.age.overdue' : 'settlementCard.age.open'}
                count={age.days}
                values={{
                  amount: formatMoney(advance),
                  date: pr.paymentDate ? formatDate(pr.paymentDate) : '—',
                  limit: age.overdueDays,
                }}
                components={{ num: <span className="num font-medium" /> }}
              />
            </span>
          </p>
        )}
        {waiting && <p className="text-sm text-muted-foreground">{waiting}</p>}
        {status === 'REVISION' && pr.settlementLastNote && (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">{t('settlementCard.revisionNote')}</span> {pr.settlementLastNote}
          </p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settlementCard.empty')}</p>
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
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('settlementCard.advance')}</dt><dd className="num">{formatMoney(advance)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('settlementCard.realized')}</dt><dd className="num font-semibold">{formatMoney(realized)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{diff < 0 ? t('settlementCard.diff.return') : diff > 0 ? t('settlementCard.diff.reimburse') : t('settlementCard.diff.none')}</dt>
                <dd className={`num font-semibold ${diff > 0 ? 'text-danger' : ''}`}>{formatMoney(Math.abs(diff))}</dd>
              </div>
            </dl>
            {pr.type.kind === 'TRAVEL' && <PlanVsActual planned={pr.lines.map((l) => ({ category: l.category, amount: toNumber(l.amount) }))} actual={lines.map((l) => ({ category: l.category, amount: toNumber(l.amount) }))} />}
          </>
        )}

        {pr.settlementNote && (
          <p className="whitespace-pre-line rounded-md bg-muted/60 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">{t('settlementCard.requesterNote')}</span> {pr.settlementNote}
          </p>
        )}
        {pr.settlementDeadline && status !== 'SETTLED' && (
          <p className="text-xs text-muted-foreground">{t('settlementCard.deadline', { date: formatDate(pr.settlementDeadline) })}</p>
        )}
        {attachments.length > 0 && <AttachmentPicker saved={attachments} pending={[]} onPendingChange={() => undefined} readOnly />}

        {status === 'SETTLED' && (
          <dl className="space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('settlementCard.posted')}</dt><dd>{pr.settledAt ? formatDateTime(pr.settledAt) : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('settlementCard.date')}</dt><dd>{pr.settlementDate ? formatDate(pr.settlementDate) : '—'}</dd></div>
            {pr.settlementCashAccount && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('settlementCard.cash')}</dt><dd className="text-right">{pr.settlementCashAccount.accountNumber} · {pr.settlementCashAccount.name}</dd></div>
            )}
            {pr.settlementReference && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('settlementCard.reference')}</dt><dd>{pr.settlementReference}</dd></div>}
            {pr.settlementJournal && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('settlementCard.journal')}</dt>
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

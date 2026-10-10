/**
 * Detail Pengajuan Pembayaran (/payment-requests/:id): header + amounts,
 * payee & bank, lines (finance sets the expense account per line),
 * attachments, timeline, and a contextual action bar driven by the server's
 * `actions` flags (who may do what is decided server-side).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, BookOpen, Check, ClipboardCheck, Pencil, RotateCcw, Save, Send, Undo2, X, Banknote } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, EmptyState, Field, LoadingState, PageHeader, StatusBadge } from '@/components/shared';
import { AccountPicker, type AccountOption } from '@/components/fixed-assets/AccountPicker';
import { apiError } from '@/components/fixed-assets/errors';
import { AttachmentPicker } from '@/components/payment-requests/AttachmentPicker';
import { PayDialog } from '@/components/payment-requests/PayDialog';
import { SettlementCard } from '@/components/payment-requests/SettlementCard';
import { SettlementPostDialog } from '@/components/payment-requests/SettlementPostDialog';
import { TravelSummary } from '@/components/payment-requests/TravelSummary';
import { Timeline } from '@/components/payment-requests/Timeline';
import {
  KIND_LABEL,
  PR_ENDPOINT,
  formatMoney,
  STEP_LABEL,
  TRAVEL_CATEGORY_LABEL,
  isAdvanceKind,
  type PaymentRequestDetail,
} from '@/components/payment-requests/payment-request';

interface FlatAccount extends AccountOption {
  accountType?: string;
  isGroup?: boolean;
}

type Dialog =
  | 'approve'
  | 'reject'
  | 'return'
  | 'cancel'
  | 'cancelPayment'
  | 'submit'
  | 'settleApprove'
  | 'settleReturn'
  | 'settleCancelPosting'
  | null;

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-sm text-muted-foreground sm:w-36">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export const PaymentRequestDetailPage = () => {
  const { t } = useTranslation('finance');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [paying, setPaying] = useState(false);
  const [posting, setPosting] = useState(false);
  const [approveNote, setApproveNote] = useState('');
  const [accountEdits, setAccountEdits] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: ['payment-requests', 'detail', id],
    queryFn: async () => (await api.get<PaymentRequestDetail>(`${PR_ENDPOINT}/${id}`)).data,
  });
  const pr = detailQuery.data;
  const actions = pr?.actions;
  const financeMode = !!actions && (actions.verify || actions.pay || actions.settlement.post);

  const accountsQuery = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get<FlatAccount[] | { data: FlatAccount[] }>('/coa/flat');
      const all = Array.isArray(res.data) ? res.data : res.data.data;
      return all.filter((a) => !a.isGroup);
    },
    enabled: financeMode,
  });
  const systemQuery = useQuery({
    queryKey: ['system-accounts'],
    queryFn: async () => (await api.get<{ mappings: Record<string, Array<{ accountId: string; accountNumber: string; accountName: string }>> }>('/system-accounts')).data,
    enabled: financeMode,
  });
  const expenseAccounts = useMemo(() => (accountsQuery.data ?? []).filter((a) => a.accountType === 'EXPENSE'), [accountsQuery.data]);
  const cashAccounts = useMemo(() => {
    const mapped = new Set((systemQuery.data?.mappings.CASH ?? []).map((m) => m.accountId));
    return (accountsQuery.data ?? []).filter((a) => a.accountType === 'ASSET' && (mapped.has(a.id) || a.accountNumber.startsWith('1.1')));
  }, [accountsQuery.data, systemQuery.data]);
  const advance = systemQuery.data?.mappings.EMPLOYEE_ADVANCE?.[0];
  const advanceName = advance ? `${advance.accountNumber} · ${advance.accountName}` : t('paymentRequestDetail.advanceAccount.name');
  const advanceLabel = advance ? advanceName : t('paymentRequestDetail.advanceAccount.unmapped');

  const refresh = () => {
    setAccountEdits({});
    qc.invalidateQueries({ queryKey: ['payment-requests'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const lineAccounts = () =>
    Object.entries(accountEdits).map(([lineId, accountId]) => ({ id: lineId, expenseAccountId: accountId || null }));

  const act = useMutation({
    mutationFn: async ({ kind, reason }: { kind: Exclude<Dialog, null>; reason?: string }) => {
      const base = `${PR_ENDPOINT}/${id}`;
      if (kind === 'approve') return api.post(`${base}/approve`, { lineAccounts: lineAccounts(), note: approveNote.trim() || null });
      if (kind === 'settleApprove') return api.post(`${base}/settlement/approve`, { note: approveNote.trim() || null });
      if (kind === 'settleReturn') return api.post(`${base}/settlement/return`, { reason });
      if (kind === 'settleCancelPosting') return api.post(`${base}/settlement/cancel-posting`, { reason });
      if (kind === 'reject') return api.post(`${base}/reject`, { reason });
      if (kind === 'return') return api.post(`${base}/return`, { reason });
      if (kind === 'cancel') return api.post(`${base}/cancel`, { reason: reason || null });
      if (kind === 'submit') return api.post(`${base}/submit`);
      return api.post(`${base}/cancel-payment`, { reason });
    },
    onSuccess: (_res, { kind }) => {
      toast.success(t(`paymentRequestDetail.toast.${kind}`));
      setApproveNote('');
      setDialog(null);
      refresh();
    },
    onError: (e) => {
      toast.error(apiError(e, t('paymentRequestDetail.toast.actionFailed')));
    },
  });

  const saveAccounts = useMutation({
    mutationFn: () => api.put(`${PR_ENDPOINT}/${id}/accounts`, { lineAccounts: lineAccounts() }),
    onSuccess: () => {
      toast.success(t('paymentRequestDetail.toast.accountsSaved'));
      refresh();
    },
    onError: (e) => toast.error(apiError(e, t('paymentRequestDetail.toast.accountsFailed'))),
  });

  if (detailQuery.isLoading) return <LoadingState label={t('paymentRequestDetail.loading')} />;
  if (!pr) {
    return (
      <EmptyState
        kind="error"
        title={t('paymentRequestDetail.notFound.title')}
        description={t('paymentRequestDetail.notFound.description')}
        action={<Button onClick={() => navigate(PR_ENDPOINT)}>{t('paymentRequestDetail.notFound.back')}</Button>}
      />
    );
  }

  const total = toNumber(pr.totalAmount) ?? 0;
  const advanceKind = isAdvanceKind(pr.type.kind);
  const accountsDirty = Object.keys(accountEdits).length > 0;
  const missingAccounts = !advanceKind && pr.lines.some((l) => !(accountEdits[l.id] ?? l.expenseAccountId));
  const sActions = actions?.settlement;
  const requestAttachments = pr.attachments.filter((a) => a.scope !== 'SETTLEMENT');
  const waitingFor =
    pr.status === 'SUBMITTED'
      ? pr.supervisor
        ? t('paymentRequestDetail.waiting.supervisorNamed', { name: pr.supervisor.fullName })
        : t('paymentRequestDetail.waiting.supervisor')
      : pr.status === 'PENDING_FINANCE'
        ? t('paymentRequestDetail.waiting.finance')
        : pr.status === 'PENDING_DIRECTOR'
          ? pr.directorRole
            ? t('paymentRequestDetail.waiting.directorNamed', { name: pr.directorRole })
            : t('paymentRequestDetail.waiting.director')
          : null;

  const busy = act.isPending;
  const actionButtons = (
    <>
      {actions?.edit && (
        <>
          <Button variant="outline" onClick={() => navigate(`${PR_ENDPOINT}/${pr.id}/edit`)}>
            <Pencil aria-hidden />
            {t('paymentRequestDetail.actions.edit')}
          </Button>
          <Button onClick={() => setDialog('submit')}>
            <Send aria-hidden />
            {t('paymentRequestDetail.actions.submit')}
          </Button>
        </>
      )}
      {actions?.decide && (
        <>
          <Button variant="outline" onClick={() => setDialog('reject')} className="text-danger">
            <X aria-hidden />
            {t('paymentRequestDetail.actions.reject')}
          </Button>
          <Button variant="outline" onClick={() => setDialog('return')}>
            <Undo2 aria-hidden />
            {t('paymentRequestDetail.actions.return')}
          </Button>
          <Button onClick={() => setDialog('approve')}>
            <Check aria-hidden />
            {t('paymentRequestDetail.actions.approve')}
          </Button>
        </>
      )}
      {actions?.pay && (
        <Button onClick={() => setPaying(true)} disabled={missingAccounts || accountsDirty} title={missingAccounts ? t('paymentRequestDetail.actions.payDisabled') : undefined}>
          <Banknote aria-hidden />
          {t('paymentRequestDetail.actions.pay')}
        </Button>
      )}
      {actions?.cancelPayment && (
        <Button variant="outline" onClick={() => setDialog('cancelPayment')}>
          <RotateCcw aria-hidden />
          {t('paymentRequestDetail.actions.cancelPayment')}
        </Button>
      )}
      {sActions?.decide && (
        <>
          <Button variant="outline" onClick={() => setDialog('settleReturn')}>
            <Undo2 aria-hidden />
            {t('paymentRequestDetail.actions.settleReturn')}
          </Button>
          {sActions.post ? (
            <Button onClick={() => setPosting(true)}>
              <ClipboardCheck aria-hidden />
              {t('paymentRequestDetail.actions.settlePost')}
            </Button>
          ) : (
            <Button onClick={() => setDialog('settleApprove')}>
              <Check aria-hidden />
              {t('paymentRequestDetail.actions.settleApprove')}
            </Button>
          )}
        </>
      )}
      {sActions?.cancelPosting && (
        <Button variant="outline" onClick={() => setDialog('settleCancelPosting')}>
          <RotateCcw aria-hidden />
          {t('paymentRequestDetail.actions.settleCancelPosting')}
        </Button>
      )}
      {actions?.cancel && (
        <Button variant="ghost" onClick={() => setDialog('cancel')} className="text-danger">
          <Ban aria-hidden />
          {t('paymentRequestDetail.actions.cancel')}
        </Button>
      )}
    </>
  );
  const hasActions =
    !!actions &&
    (actions.edit || actions.decide || actions.pay || actions.cancelPayment || actions.cancel || actions.settlement.decide || actions.settlement.cancelPosting);

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title={pr.number}
        description={pr.purpose}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge status={pr.status} docType="payment_request" />
          {pr.settlementStatus && <StatusBadge status={pr.settlementStatus} docType="payment_request_settlement" />}
          {waitingFor && <span className="text-muted-foreground">{waitingFor}</span>}
          {actions?.decide && actions.step && (
            <span className="font-medium text-foreground">{t('paymentRequestDetail.yourStep', { step: STEP_LABEL[actions.step] })}</span>
          )}
        </div>
      </PageHeader>

      {pr.lastNote && ['REVISION', 'REJECTED', 'CANCELLED', 'APPROVED'].includes(pr.status) && (
        <p role="status" className="rounded-lg border border-border bg-muted/60 p-3 text-sm text-foreground">
          <span className="font-medium">{t('paymentRequestDetail.lastNote')}</span> {pr.lastNote}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section aria-label={t('paymentRequestDetail.summary.label')} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('paymentRequestDetail.summary.total')}</p>
              <p className="num mt-1 text-xl font-semibold text-foreground">{formatMoney(total)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{t('paymentRequestDetail.summary.type')}</p>
              <p className="mt-1 font-medium text-foreground">{pr.type.name}</p>
              {KIND_LABEL[pr.type.kind] !== pr.type.name && <p className="text-xs text-muted-foreground">{KIND_LABEL[pr.type.kind]}</p>}
            </div>
            <div className="col-span-2 rounded-lg border border-border bg-card p-4 sm:col-span-1">
              <p className="text-xs text-muted-foreground">{t('paymentRequestDetail.summary.neededBy')}</p>
              <p className="mt-1 font-medium text-foreground">{pr.neededBy ? formatDate(pr.neededBy) : '—'}</p>
            </div>
          </section>

          <TravelSummary pr={pr} />

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>{pr.type.kind === 'TRAVEL' ? t('paymentRequestDetail.lines.travelTitle') : t('paymentRequestDetail.lines.title')}</CardTitle>
              {actions?.verify && accountsDirty && (
                <Button size="sm" variant="secondary" onClick={() => saveAccounts.mutate()} loading={saveAccounts.isPending}>
                  <Save aria-hidden />
                  {t('paymentRequestDetail.lines.saveAccounts')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {advanceKind && (
                <p className="mb-3 rounded-md bg-info/10 px-3 py-2 text-sm text-foreground">
                  <Trans
                    t={t}
                    i18nKey="paymentRequestDetail.lines.advanceNote"
                    values={{ account: advanceName }}
                    components={{ b: <span className="font-medium" /> }}
                  />
                </p>
              )}
              <ul className="divide-y divide-border">
                {pr.lines.map((l, i) => (
                  <li key={l.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        <span className="num mr-2 text-muted-foreground">{i + 1}.</span>
                        {l.description}
                      </p>
                      {(l.category || (l.quantity !== null && l.unitAmount !== null)) && (
                        <p className="text-xs text-muted-foreground">
                          {l.category && TRAVEL_CATEGORY_LABEL[l.category]}
                          {l.quantity !== null && l.unitAmount !== null && (
                            <span className="num">
                              {l.category ? ' · ' : ''}
                              {formatMoney(l.unitAmount)} × {toNumber(l.quantity)}
                            </span>
                          )}
                        </p>
                      )}
                      {l.expenseDate && <p className="text-xs text-muted-foreground">{t('paymentRequestDetail.lines.expenseDate', { date: formatDate(l.expenseDate) })}</p>}
                      {actions?.verify && !advanceKind ? (
                        <AccountPicker
                          label={t('paymentRequestDetail.lines.account', { n: i + 1 })}
                          value={accountEdits[l.id] ?? l.expenseAccountId ?? ''}
                          onChange={(v) => setAccountEdits((e) => ({ ...e, [l.id]: v }))}
                          accounts={expenseAccounts}
                          loading={accountsQuery.isLoading}
                          className="max-w-md"
                        />
                      ) : (
                        !advanceKind && (
                          <p className="text-xs text-muted-foreground">
                            {t('paymentRequestDetail.lines.accountValue', {
                              account: l.expenseAccount
                                ? `${l.expenseAccount.accountNumber} · ${l.expenseAccount.name}`
                                : t('paymentRequestDetail.lines.accountMissing'),
                            })}
                          </p>
                        )
                      )}
                    </div>
                    <p className="num text-right text-sm font-semibold text-foreground">{formatMoney(toNumber(l.amount) ?? 0)}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">{t('paymentRequestDetail.summary.total')}</span>
                <span className="num font-semibold text-foreground">{formatMoney(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('paymentRequestDetail.attachments.title', { count: requestAttachments.length })}</CardTitle>
            </CardHeader>
            <CardContent>
              {requestAttachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('paymentRequestDetail.attachments.empty')}</p>
              ) : (
                <AttachmentPicker saved={requestAttachments} pending={[]} onPendingChange={() => undefined} readOnly />
              )}
            </CardContent>
          </Card>

          <SettlementCard pr={pr} onFill={() => navigate(`${PR_ENDPOINT}/${pr.id}/settlement`)} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t('paymentRequestDetail.people.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5">
                <InfoRow label={t('paymentRequestDetail.people.requester')}>{pr.requester.fullName}</InfoRow>
                <InfoRow label={t('paymentRequestDetail.people.supervisor')}>{pr.supervisor?.fullName ?? '—'}</InfoRow>
                {pr.department && <InfoRow label={t('paymentRequestDetail.people.department')}>{pr.department}</InfoRow>}
                <InfoRow label={t('paymentRequestDetail.people.submitted')}>{pr.submittedAt ? formatDateTime(pr.submittedAt) : t('paymentRequestDetail.people.notSubmitted')}</InfoRow>
                <InfoRow label={t('paymentRequestDetail.people.payee')}>
                  {pr.payeeName}
                  <span className="text-muted-foreground"> · {pr.payeeKind === 'VENDOR' ? t('paymentRequestDetail.people.supplier') : t('paymentRequestDetail.people.employee')}</span>
                </InfoRow>
                <InfoRow label={t('paymentRequestDetail.people.bankAccount')}>
                  {pr.bankAccountNo ? (
                    <>
                      {pr.bankName} <span className="num">{pr.bankAccountNo}</span>
                      {pr.bankAccountHolder && <span className="block text-muted-foreground">{t('paymentRequestDetail.people.accountHolder', { name: pr.bankAccountHolder })}</span>}
                    </>
                  ) : (
                    '—'
                  )}
                </InfoRow>
              </dl>
            </CardContent>
          </Card>

          {pr.status === 'PAID' || pr.paidAt ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('paymentRequestDetail.payment.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5">
                  <InfoRow label={t('paymentRequestDetail.payment.date')}>{pr.paymentDate ? formatDate(pr.paymentDate) : '—'}</InfoRow>
                  <InfoRow label={t('paymentRequestDetail.payment.source')}>{pr.cashAccount ? `${pr.cashAccount.accountNumber} · ${pr.cashAccount.name}` : '—'}</InfoRow>
                  <InfoRow label={t('paymentRequestDetail.payment.reference')}>{pr.paymentReference ?? '—'}</InfoRow>
                  <InfoRow label={t('paymentRequestDetail.payment.paidBy')}>{pr.paidBy?.fullName ?? '—'}</InfoRow>
                  {pr.journalEntry && (
                    <InfoRow label={t('paymentRequestDetail.payment.journal')}>
                      {actions?.viewJournal ? (
                        <Link to={`/gl?q=${encodeURIComponent(pr.journalEntry.entryNumber)}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <BookOpen className="size-3.5" aria-hidden />
                          {pr.journalEntry.entryNumber}
                        </Link>
                      ) : (
                        pr.journalEntry.entryNumber
                      )}
                    </InfoRow>
                  )}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('paymentRequestDetail.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline items={pr.history} />
            </CardContent>
          </Card>
        </div>
      </div>

      {hasActions && (
        <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          {actionButtons}
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.approve.title', { number: pr.number })}
        description={
          actions?.step === 'FINANCE'
            ? t('paymentRequestDetail.dialogs.approve.financeDescription', { total: formatMoney(total) })
            : t('paymentRequestDetail.dialogs.approve.description', { total: formatMoney(total), payee: pr.payeeName })
        }
        confirmLabel={t('paymentRequestDetail.dialogs.approve.confirm')}
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'approve' })}
      >
        <Field label={actions?.step === 'FINANCE' ? t('paymentRequestDetail.dialogs.financeNote') : t('paymentRequestDetail.dialogs.note')} hint={t('paymentRequestDetail.dialogs.noteHint')}>
          <Textarea rows={2} maxLength={1000} value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'settleApprove'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.settleApprove.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.settleApprove.description')}
        confirmLabel={t('paymentRequestDetail.dialogs.approve.confirm')}
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'settleApprove' })}
      >
        <Field label={t('paymentRequestDetail.dialogs.note')} hint={t('paymentRequestDetail.dialogs.optional')}>
          <Textarea rows={2} maxLength={1000} value={approveNote} onChange={(e) => setApproveNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'settleReturn'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.settleReturn.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.settleReturn.description')}
        confirmLabel={t('paymentRequestDetail.dialogs.returnConfirm')}
        requireReason={{ label: t('paymentRequestDetail.dialogs.fixReason'), minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'settleReturn', reason })}
      />
      <ConfirmDialog
        open={dialog === 'settleCancelPosting'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.settleCancelPosting.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.settleCancelPosting.description')}
        tone="danger"
        confirmLabel={t('paymentRequestDetail.dialogs.settleCancelPosting.confirm')}
        requireReason={{ label: t('paymentRequestDetail.dialogs.cancelReason'), minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'settleCancelPosting', reason })}
      />
      <ConfirmDialog
        open={dialog === 'submit'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.submit.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.submit.description')}
        confirmLabel={t('paymentRequestDetail.dialogs.submit.confirm')}
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'submit' })}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.reject.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.reject.description')}
        tone="danger"
        confirmLabel={t('paymentRequestDetail.dialogs.reject.confirm')}
        requireReason={{ label: t('paymentRequestDetail.dialogs.reject.reason'), minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'reject', reason })}
      />
      <ConfirmDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.return.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.return.description')}
        confirmLabel={t('paymentRequestDetail.dialogs.returnConfirm')}
        requireReason={{ label: t('paymentRequestDetail.dialogs.fixReason'), minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'return', reason })}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.cancel.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.cancel.description')}
        tone="danger"
        confirmLabel={t('paymentRequestDetail.dialogs.cancel.confirm')}
        loading={busy}
        onConfirm={() => act.mutateAsync({ kind: 'cancel' })}
      />
      <ConfirmDialog
        open={dialog === 'cancelPayment'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('paymentRequestDetail.dialogs.cancelPayment.title', { number: pr.number })}
        description={t('paymentRequestDetail.dialogs.cancelPayment.description')}
        tone="danger"
        confirmLabel={t('paymentRequestDetail.dialogs.cancelPayment.confirm')}
        requireReason={{ label: t('paymentRequestDetail.dialogs.cancelReason'), minLength: 3 }}
        loading={busy}
        onConfirm={(reason) => act.mutateAsync({ kind: 'cancelPayment', reason })}
      />
      {posting && (
        <SettlementPostDialog
          request={pr}
          expenseAccounts={expenseAccounts}
          cashAccounts={cashAccounts}
          onClose={() => setPosting(false)}
          onPosted={() => {
            setPosting(false);
            refresh();
          }}
        />
      )}
      {paying && (
        <PayDialog
          request={pr}
          cashAccounts={cashAccounts}
          advanceAccountLabel={advanceLabel}
          onClose={() => setPaying(false)}
          onPaid={() => {
            setPaying(false);
            refresh();
          }}
        />
      )}
    </div>
  );
};

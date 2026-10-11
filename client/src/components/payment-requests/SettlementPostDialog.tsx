/**
 * Finance step of a settlement: verify expense accounts, record the cash leg when
 * realization ≠ advance, and post one journal. The DR/CR preview comes from the server.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { AccountPicker, type AccountOption } from '@/components/fixed-assets/AccountPicker';
import { JournalPreview, type JournalPreviewLine } from '@/components/fixed-assets/JournalPreview';
import { apiError } from '@/components/fixed-assets/errors';
import { PR_ENDPOINT, formatMoney, type PaymentRequestDetail, type SettlementPreview } from './payment-request';

interface SettlementPostDialogProps {
  request: PaymentRequestDetail;
  expenseAccounts: AccountOption[];
  cashAccounts: AccountOption[];
  onClose: () => void;
  onPosted: () => void;
}

const today = () => new Date().toLocaleDateString('sv-SE');

export function SettlementPostDialog({ request, expenseAccounts, cashAccounts, onClose, onPosted }: SettlementPostDialogProps) {
  const { t } = useTranslation('finance');
  const [settlementDate, setSettlementDate] = useState(today);
  const [accounts, setAccounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.settlementLines.map((l) => [l.id, l.expenseAccountId ?? ''])),
  );
  const [cashAccountId, setCashAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const lineAccounts = useMemo(
    () => request.settlementLines.map((l) => ({ id: l.id, expenseAccountId: accounts[l.id] || null })),
    [request.settlementLines, accounts],
  );

  const previewQuery = useQuery({
    queryKey: ['payment-requests', 'settlement-preview', request.id, lineAccounts, cashAccountId],
    queryFn: async () =>
      (await api.post<SettlementPreview>(`${PR_ENDPOINT}/${request.id}/settlement/preview`, { lineAccounts, cashAccountId: cashAccountId || null })).data,
    placeholderData: keepPreviousData,
  });
  const preview = previewQuery.data;

  const post = useMutation({
    mutationFn: () =>
      api.post(`${PR_ENDPOINT}/${request.id}/settlement/post`, {
        settlementDate,
        lineAccounts,
        cashAccountId: preview?.cashRequired ? cashAccountId || null : null,
        reference: reference.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success(t('settlementPostDialog.posted'));
      onPosted();
    },
    onError: (e) => setError(apiError(e, t('settlementPostDialog.postFailed'))),
  });

  const previewLines: JournalPreviewLine[] = (preview?.lines ?? []).map((l) => ({
    side: l.side,
    account: l.accountLabel ?? <span className="text-warning-text">{t('settlementPostDialog.accountMissing')}</span>,
    amount: formatMoney(l.amount),
  }));

  const cashLabel =
    preview?.mode === 'RETURN'
      ? t('settlementPostDialog.cashReturn', { amount: formatMoney(Math.abs(preview.difference)) })
      : t('settlementPostDialog.cashReimburse', { amount: formatMoney(preview?.difference ?? 0) });

  const submit = () => {
    setError('');
    if (!settlementDate) return setError(t('settlementPostDialog.errors.date'));
    if (preview && preview.problems.length > 0) return setError(preview.problems[0] as string);
    post.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !post.isPending && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settlementPostDialog.title', { number: request.number })}</DialogTitle>
          <DialogDescription>
            {t('settlementPostDialog.description', {
              payee: request.payeeName,
              advance: formatMoney(preview?.advance ?? Number(request.totalAmount)),
              realized: formatMoney(preview?.realized ?? 0),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">{t('settlementPostDialog.linesLegend')}</legend>
            {request.settlementLines.map((l, i) => (
              <div key={l.id} className="grid gap-1 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-start sm:gap-3">
                <p className="text-sm text-foreground">
                  <span className="num mr-1 text-muted-foreground">{i + 1}.</span>
                  {l.description}
                  <span className="num block font-medium">{formatMoney(l.amount)}</span>
                  {l.expenseDate && <span className="block text-xs text-muted-foreground">{formatDate(l.expenseDate)}</span>}
                </p>
                <AccountPicker
                  label={t('settlementPostDialog.lineAccount', { n: i + 1 })}
                  value={accounts[l.id] ?? ''}
                  onChange={(v) => setAccounts((a) => ({ ...a, [l.id]: v }))}
                  accounts={expenseAccounts}
                  required
                />
              </div>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settlementPostDialog.date')} required hint={t('settlementPostDialog.dateHint')}>
              {(control) => <DateInput id={control.id} value={settlementDate} min={request.paymentDate?.slice(0, 10)} onChange={setSettlementDate} />}
            </Field>
            {preview?.cashRequired && (
              <Field label={t('settlementPostDialog.reference')} hint={t('settlementPostDialog.referenceHint')}>
                <Input maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            )}
          </div>

          {preview?.cashRequired && (
            <AccountPicker label={cashLabel} required value={cashAccountId} onChange={setCashAccountId} accounts={cashAccounts} />
          )}

          <Field label={t('settlementPostDialog.note')} hint={t('settlementPostDialog.optional')}>
            <Textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <JournalPreview
            lines={previewLines}
            note={
              preview?.mode === 'RETURN'
                ? t('settlementPostDialog.mode.return')
                : preview?.mode === 'REIMBURSE'
                  ? t('settlementPostDialog.mode.reimburse')
                  : t('settlementPostDialog.mode.exact')
            }
          />
          {preview && preview.problems.length > 0 && (
            <ul className="space-y-1 text-sm text-warning-text" aria-label={t('settlementPostDialog.problems')}>
              {preview.problems.map((p) => (
                <li key={p} className="flex items-start gap-2 text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={post.isPending}>
            {t('settlementPostDialog.cancel')}
          </Button>
          <Button onClick={submit} loading={post.isPending} disabled={!preview || preview.problems.length > 0}>
            {t('settlementPostDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

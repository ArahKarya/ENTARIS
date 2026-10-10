/**
 * "Bayar" dialog for an APPROVED payment request: pick the cash/bank account,
 * payment date and transfer reference; the journal preview shows exactly what
 * will be posted (DR expense per account — or DR Uang Muka Karyawan for cash
 * advance / travel — / CR cash-bank) before confirming.
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput, Field } from '@/components/shared';
import { AccountPicker, type AccountOption } from '@/components/fixed-assets/AccountPicker';
import { JournalPreview, type JournalPreviewLine } from '@/components/fixed-assets/JournalPreview';
import { apiError } from '@/components/fixed-assets/errors';
import { PR_ENDPOINT, formatMoney, isAdvanceKind, type PaymentRequestDetail } from './payment-request';

interface PayDialogProps {
  request: PaymentRequestDetail | null;
  cashAccounts: AccountOption[];
  /** Mapped EMPLOYEE_ADVANCE account, when known (label only). */
  advanceAccountLabel: string;
  onClose: () => void;
  onPaid: () => void;
}

const today = () => new Date().toLocaleDateString('sv-SE');

export function PayDialog({ request, cashAccounts, advanceAccountLabel, onClose, onPaid }: PayDialogProps) {
  const { t } = useTranslation('finance');
  const open = request !== null;
  const [cashAccountId, setCashAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  const cash = cashAccounts.find((a) => a.id === cashAccountId);
  const total = toNumber(request?.totalAmount) ?? 0;

  const preview = useMemo<JournalPreviewLine[]>(() => {
    if (!request) return [];
    const debits: JournalPreviewLine[] = [];
    if (isAdvanceKind(request.type.kind)) {
      debits.push({ side: 'DR', account: advanceAccountLabel, amount: formatMoney(total) });
    } else {
      const byAccount = new Map<string, { label: string; amount: number }>();
      for (const l of request.lines) {
        const key = l.expenseAccount?.id ?? 'missing';
        const label = l.expenseAccount ? `${l.expenseAccount.accountNumber} · ${l.expenseAccount.name}` : t('payDialog.missingExpenseAccount');
        const cur = byAccount.get(key) ?? { label, amount: 0 };
        byAccount.set(key, { label, amount: cur.amount + (toNumber(l.amount) ?? 0) });
      }
      for (const v of byAccount.values()) debits.push({ side: 'DR', account: v.label, amount: formatMoney(v.amount) });
    }
    return [
      ...debits,
      { side: 'CR', account: cash ? `${cash.accountNumber} · ${cash.name}` : t('payDialog.cashAccountPlaceholder'), amount: formatMoney(total) },
    ];
  }, [request, cash, total, advanceAccountLabel, t]);

  const pay = useMutation({
    mutationFn: () => api.post(`${PR_ENDPOINT}/${request!.id}/pay`, { cashAccountId, paymentDate, reference: reference.trim() || null }),
    onSuccess: () => {
      toast.success(t('payDialog.paid'));
      onPaid();
    },
    onError: (e) => setError(apiError(e, t('payDialog.payFailed'))),
  });

  const submit = () => {
    setError('');
    if (!cashAccountId) return setError(t('payDialog.errors.cashAccount'));
    if (!paymentDate) return setError(t('payDialog.errors.date'));
    pay.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pay.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('payDialog.title', { number: request?.number ?? '' })}</DialogTitle>
          <DialogDescription>
            {request?.payeeName}
            {request?.bankAccountNo ? ` · ${request.bankName ?? ''} ${request.bankAccountNo}` : ''} · {formatMoney(total)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <AccountPicker label={t('payDialog.cashAccount')} required value={cashAccountId} onChange={setCashAccountId} accounts={cashAccounts} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('payDialog.date')} required>
              {(control) => <DateInput id={control.id} value={paymentDate} onChange={setPaymentDate} />}
            </Field>
            <Field label={t('payDialog.reference')} hint={t('payDialog.referenceHint')}>
              <Input maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <JournalPreview lines={preview} note={t('payDialog.closedYearNote')} />
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pay.isPending}>
            {t('payDialog.cancel')}
          </Button>
          <Button onClick={submit} loading={pay.isPending}>
            {t('payDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Wallet, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import AttachmentUpload from './AttachmentUpload';
import { RupiahField } from './purchase-cash/RupiahField';
import AttachmentPreview from './AttachmentPreview';
import { ComboboxField } from './overlays/ComboboxField';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass, moneyInputClass } from './sales/dialog-classes-b';

interface CustomerDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CustomerDepositModal: React.FC<CustomerDepositModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('sales');
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isOpeningBalance, setIsOpeningBalance] = useState(false);
  const [proformaId, setProformaId] = useState('none');

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setPartyId('');
      setAmount('');
      setAccountId('');
      setReferenceNo('');
      setNotes('');
      setError('');
      setSavedId(null);
      setIsOpeningBalance(false);
      setProformaId('none');
    }
  }, [isOpen]);

  // Proforma yang masih menunggu pembayaran milik customer terpilih (opsional ditautkan ke DP ini).
  const { data: proformas } = useQuery({
    queryKey: ['proforma-invoices', 'for-deposit', partyId],
    queryFn: async () => (await api.get('/proforma-invoices', { params: { partyId, status: 'Sent', limit: 50 } })).data,
    enabled: isOpen && !!partyId && !isOpeningBalance,
  });

  const partyPicker = usePartyPicker({ type: 'Customer', selectedId: partyId || null, enabled: isOpen });

  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const { data: depositBalance } = useQuery({
    queryKey: ['customer-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/customer-deposits/balance/${partyId}`);
      return res.data;
    },
    enabled: isOpen && !!partyId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['customer-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setSavedId(res.data?.id || res.data?.payment?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || t('customerDepositModal.errors.saveFailed')),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && numAmount > 0 && (isOpeningBalance || accountId) && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      amount: numAmount,
      paymentType: 'CustomerDeposit',
      accountId: isOpeningBalance ? 'opening-equity' : accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
      isOpeningBalance,
      proformaInvoiceId: !isOpeningBalance && proformaId !== 'none' ? proformaId : null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (!savedId && canSubmit) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-primary" aria-hidden />
              {t('customerDepositModal.title')}
            </DialogTitle>
            <DialogDescription>{t('customerDepositModal.description')}</DialogDescription>
          </OverlayHeader>

          <OverlayBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('customerDepositModal.fields.date')}>
                <DateInput value={date} onChange={setDate} disabled={!!savedId} />
              </Field>
              <ComboboxField
                  label={t('customerDepositModal.fields.customer')}
                  required
                  {...partyPicker.pickerProps}
                  value={partyId}
                  onChange={(v) => { setPartyId(v); setProformaId('none'); }}
                  placeholder={t('customerDepositModal.fields.customerPlaceholder')}
                  disabled={!!savedId}
                />
            </div>

            {partyId && depositBalance && depositBalance.totalBalance > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-foreground">
                  <Trans
                    t={t}
                    i18nKey="customerDepositModal.currentBalance"
                    values={{ amount: formatRupiah(depositBalance.totalBalance) }}
                    components={{ amount: <span className="font-bold tabular-nums" /> }}
                  />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('customerDepositModal.activeDeposits', { total: depositBalance.data.length })}
                </p>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Checkbox
                id="customer-deposit-opening"
                checked={isOpeningBalance}
                onCheckedChange={(checked) => setIsOpeningBalance(checked === true)}
                disabled={!!savedId}
                className="mt-0.5"
              />
              <div className="grid gap-0.5">
                <Label htmlFor="customer-deposit-opening" className="text-sm font-medium">{t('customerDepositModal.opening.label')}</Label>
                <p className="text-xs text-muted-foreground">{t('customerDepositModal.opening.hint')}</p>
              </div>
            </div>

            {isOpeningBalance && (
              <div className="rounded-lg border border-border bg-info-subtle p-3 text-info-text">
                <p className="text-xs">
                  <Trans
                    t={t}
                    i18nKey="customerDepositModal.opening.journal"
                    components={{ mono: <span className="font-mono font-medium" /> }}
                  />
                </p>
                <p className="mt-0.5 text-xs">{t('customerDepositModal.opening.note')}</p>
              </div>
            )}

            <div className={isOpeningBalance ? '' : 'grid gap-4 sm:grid-cols-2'}>
              <Field label={t('customerDepositModal.fields.amount')} required>
                {(control) => (
                  <RupiahField
                    id={control.id}
                    value={typeof amount === 'number' ? amount : 0}
                    onChange={(v) => setAmount(v === 0 ? '' : v)}
                    placeholder="0"
                    className={moneyInputClass}
                    disabled={!!savedId}
                    aria-label={t('customerDepositModal.fields.amountAria')}
                  />
                )}
              </Field>
              {!isOpeningBalance && (
                <Field label={t('customerDepositModal.fields.account')} required>
                  {(control) => (
                    <Select value={accountId} onValueChange={setAccountId} disabled={!!savedId}>
                      <SelectTrigger {...control}><SelectValue placeholder={t('customerDepositModal.fields.accountPlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        {cashAccounts?.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>{a.accountNumber} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
            </div>

            {!isOpeningBalance && partyId && (proformas?.data ?? []).length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('customerDepositModal.fields.proforma')} hint={t('customerDepositModal.fields.proformaHint')}>
                  {(control) => (
                    <Select value={proformaId} onValueChange={setProformaId} disabled={!!savedId}>
                      <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('customerDepositModal.fields.proformaNone')}</SelectItem>
                        {(proformas?.data ?? []).map((pf: { id: string; proformaNumber: string; grandTotal: number | string; payment?: { remaining?: number } }) => (
                          <SelectItem key={pf.id} value={pf.id}>
                            {pf.proformaNumber} · {formatRupiah(Number(pf.payment?.remaining ?? pf.grandTotal))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('customerDepositModal.fields.reference')}>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder={t('customerDepositModal.fields.referencePlaceholder')} disabled={!!savedId} />
              </Field>
              <Field label={t('customerDepositModal.fields.notes')}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('customerDepositModal.fields.notesPlaceholder')} disabled={!!savedId} />
              </Field>
            </div>

            {numAmount > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3" aria-live="polite">
                <p className="text-xs font-medium text-foreground">
                  <Trans
                    t={t}
                    i18nKey="customerDepositModal.summary"
                    values={{ amount: formatRupiah(numAmount) }}
                    components={{ amount: <span className="text-base font-bold tabular-nums" /> }}
                  />
                </p>
              </div>
            )}

            <FormError message={error} />

            {savedId && (
              <div className="grid gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-2" role="status">
                  <CheckCircle2 className="size-4 text-success-text" aria-hidden />
                  <span className="text-xs font-semibold text-success-text">{t('customerDepositModal.saved')}</span>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="size-3" aria-hidden /> {t('customerDepositModal.attachments')}
                  </span>
                </div>
                <AttachmentPreview referenceType="payment" referenceId={savedId} />
                <AttachmentUpload referenceType="payment" referenceId={savedId} />
              </div>
            )}
          </OverlayBody>

          <OverlayFooter>
            {savedId ? (
              <Button type="button" onClick={onClose}>{t('customerDepositModal.done')}</Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('customerDepositModal.cancel')}</Button>
                <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
                  {mutation.isPending ? t('customerDepositModal.saving') : t('customerDepositModal.save')}

                </Button>
              </>
            )}
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDepositModal;

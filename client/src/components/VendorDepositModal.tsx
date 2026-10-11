import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { RupiahField } from './purchase-cash/RupiahField';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';

interface VendorDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VendorDepositModal: React.FC<VendorDepositModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('purchasing');
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
    }
  }, [isOpen]);

  const partyPicker = usePartyPicker({ type: 'Supplier', selectedId: partyId || null, enabled: isOpen });

  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  // Fetch current deposit balance for selected supplier
  const { data: depositBalance } = useQuery({
    queryKey: ['vendor-deposit-balance', partyId],
    queryFn: async () => {
      const res = await api.get(`/vendor-deposits/balance/${partyId}`);
      return res.data;
    },
    enabled: isOpen && !!partyId,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/payments', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setSavedId(res.data?.id || res.data?.payment?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || t('depositForm.errorSave')),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && numAmount > 0 && (isOpeningBalance || accountId) && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      amount: numAmount,
      paymentType: 'VendorDeposit',
      accountId: isOpeningBalance ? 'opening-equity' : accountId,
      referenceNo: referenceNo || null,
      notes: notes || null,
      isOpeningBalance,
    });
  };

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title={t('depositForm.title')}
      description={t('depositForm.description')}
      size="lg"
      className="sm:max-w-xl"
      busy={mutation.isPending}
      submitLabel={t('depositForm.submit')}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      footer={
        savedId ? (
          <Button className="h-11 sm:h-9" onClick={onClose}>
            {t('depositForm.done')}
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('depositForm.date')}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label={t('depositForm.supplier')}>
          <OptionPicker
            value={partyId}
            onChange={setPartyId}
            placeholder={t('depositForm.supplierPlaceholder')}
            {...partyPicker.pickerProps}
          />
        </Field>
      </div>

      {partyId && depositBalance && depositBalance.totalBalance > 0 && (
        <Callout tone="warning" icon={<span className="sr-only">{t('depositForm.infoSr')}</span>}>
          <p>
            <Trans
              t={t}
              i18nKey="depositForm.currentBalance"
              values={{ amount: formatRupiah(depositBalance.totalBalance) }}
              components={{ amount: <span className="num font-bold" /> }}
            />
          </p>
          <p className="mt-0.5 text-xs">{t('depositForm.activeDeposits', { count: depositBalance.data.length })}</p>
        </Callout>
      )}

      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- wraps a Checkbox (button role) */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 sm:min-h-0">
        <Checkbox
          className="mt-0.5"
          checked={isOpeningBalance}
          onCheckedChange={(v) => setIsOpeningBalance(v === true)}
        />
        <span>
          <span className="text-sm font-medium text-foreground">{t('depositForm.openingBalance')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('depositForm.openingBalanceHint')}
          </span>
        </span>
      </label>

      {isOpeningBalance && (
        <Callout tone="info">
          <p>
            {t('depositForm.journalLabel')}{' '}
            <span className="font-mono font-medium">{t('depositForm.journalEntry')}</span>
          </p>
          <p className="mt-0.5 text-xs">
            {t('depositForm.openingBalanceNote')}
          </p>
        </Callout>
      )}

      <div className={isOpeningBalance ? '' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <Field label={t('depositForm.amount')}>
          <RupiahField
            value={typeof amount === 'number' ? amount : 0}
            onChange={(v) => setAmount(v === 0 ? '' : v)}
            placeholder="0"
          />
        </Field>
        {!isOpeningBalance && (
          <Field label={t('depositForm.cashAccount')}>
            <OptionPicker
              value={accountId}
              onChange={setAccountId}
              placeholder={t('depositForm.cashAccountPlaceholder')}
              options={(cashAccounts ?? []).map((a: any) => ({ value: String(a.id), label: `${a.accountNumber} · ${a.name}` }))}
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('depositForm.referenceNo')}>
          <Input
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder={t('depositForm.referenceNoPlaceholder')}
          />
        </Field>
        <Field label={t('depositForm.notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('depositForm.notesPlaceholder')} />
        </Field>
      </div>

      {numAmount > 0 && (
        <Callout tone="warning" icon={<span className="sr-only">{t('depositForm.summarySr')}</span>}>
          <Trans
            t={t}
            i18nKey="depositForm.summary"
            values={{ amount: formatRupiah(numAmount) }}
            components={{ amount: <span className="num text-base font-bold" /> }}
          />
        </Callout>
      )}

      <ErrorAlert message={error} />

      {savedId && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
            <span className="text-xs font-semibold text-success-text">{t('depositForm.saved')}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden /> {t('depositForm.attachment')}
            </span>
          </div>
          <AttachmentPreview referenceType="payment" referenceId={savedId} />
          <AttachmentUpload referenceType="payment" referenceId={savedId} />
        </div>
      )}
    </FormDialog>
  );
};

export default VendorDepositModal;

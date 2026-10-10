import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { ArrowRightLeft, CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('inventory');
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setSourceAccountId('');
      setDestAccountId('');
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setError('');
      setSavedId(null);
    }
  }, [isOpen]);

  // Cash/Bank accounts (ASSET, non-group, 1.1.x)
  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const sourceAccount = cashAccounts?.find((a: any) => a.id === sourceAccountId);
  const destAccount = cashAccounts?.find((a: any) => a.id === destAccountId);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/journals', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      setSavedId(res.data?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || t('transferModal.errors.saveFailed')),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit =
    sourceAccountId &&
    destAccountId &&
    sourceAccountId !== destAccountId &&
    numAmount > 0 &&
    !mutation.isPending;

  const handleSubmit = () => {
    if (sourceAccountId === destAccountId) {
      setError(t('transferModal.errors.sameAccount'));
      return;
    }

    const srcName = sourceAccount ? `${sourceAccount.accountNumber} ${sourceAccount.name}` : '';
    const dstName = destAccount ? `${destAccount.accountNumber} ${destAccount.name}` : '';
    const refPart = referenceNo ? ` (Ref: ${referenceNo})` : '';
    const notesPart = notes ? ` - ${notes}` : '';

    mutation.mutate({
      date,
      narration: `Pinbuk: ${srcName} → ${dstName}${refPart}${notesPart}`,
      items: [
        {
          accountId: destAccountId,
          debit: numAmount,
          credit: 0,
          description: `Transfer masuk dari ${srcName}`,
        },
        {
          accountId: sourceAccountId,
          debit: 0,
          credit: numAmount,
          description: `Transfer keluar ke ${dstName}`,
        },
      ],
    });
  };

  const accountOptions = (exclude: string) =>
    (cashAccounts ?? []).map((a: any) => ({
      value: String(a.id),
      label: `${a.accountNumber} · ${a.name}`,
      disabled: a.id === exclude,
    }));

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title={t('transferModal.title')}
      description={t('transferModal.description')}
      busy={mutation.isPending}
      submitLabel={t('transferModal.submit')}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      footer={
        savedId ? (
          <Button className="h-11 sm:h-9" onClick={onClose}>
            {t('transferModal.done')}
          </Button>
        ) : undefined
      }
    >
      <Field label={t('transferModal.fields.date')}>
        <DateInput value={date} onChange={setDate} />
      </Field>

      <Field label={t('transferModal.fields.source')}>
        <OptionPicker
          value={sourceAccountId}
          onChange={setSourceAccountId}
          placeholder={t('transferModal.fields.sourcePlaceholder')}
          options={accountOptions(destAccountId)}
        />
      </Field>

      {sourceAccountId && destAccountId && (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-md bg-info-subtle px-4 py-1.5 text-xs font-medium text-info-text">
            <ArrowRightLeft className="size-3" aria-hidden />
            {t('transferModal.transferTo')}
          </div>
        </div>
      )}

      <Field label={t('transferModal.fields.destination')}>
        <OptionPicker
          value={destAccountId}
          onChange={setDestAccountId}
          placeholder={t('transferModal.fields.destinationPlaceholder')}
          options={accountOptions(sourceAccountId)}
        />
      </Field>

      <Field label={t('transferModal.fields.amount')}>
        <NumberInput
          value={amount}
          onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          min={0}
          inputMode="decimal"
          className="h-10 text-right md:h-9"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('transferModal.fields.reference')}>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={t('transferModal.fields.referencePlaceholder')} />
        </Field>
        <Field label={t('transferModal.fields.notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('transferModal.fields.notesPlaceholder')} />
        </Field>
      </div>

      {numAmount > 0 && sourceAccount && destAccount && (
        <Callout tone="info" icon={<span className="sr-only">{t('transferModal.summary')}</span>}>
          <p>
            {t('transferModal.transferAmount')} <span className="num text-base font-bold">{formatRupiah(numAmount)}</span>
          </p>
          <p className="mt-1 text-xs">
            {sourceAccount.accountNumber} {sourceAccount.name} → {destAccount.accountNumber} {destAccount.name}
          </p>
        </Callout>
      )}

      {sourceAccountId && destAccountId && sourceAccountId === destAccountId && (
        <Callout tone="warning">{t('transferModal.errors.sameAccount')}</Callout>
      )}

      <ErrorAlert message={error} />

      {savedId && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
            <span className="text-xs font-semibold text-success-text">{t('transferModal.saved')}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden /> {t('transferModal.attachments')}
            </span>
          </div>
          <AttachmentPreview referenceType="journal" referenceId={savedId} />
          <AttachmentUpload referenceType="journal" referenceId={savedId} />
        </div>
      )}
    </FormDialog>
  );
};

export default TransferModal;

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { CheckCircle2, Paperclip } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { Field, DateInput } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import type { PartyRecord } from '@/hooks/useSelectedPartyOption';
import { ErrorAlert, Callout } from './purchase-cash/ErrorAlert';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import type { PickerOption as SelectOption } from './purchase-cash/OptionPicker';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Debit-side account types, in display order (labels come from expenseModal.accountType). */
const ACCOUNT_TYPE_ORDER = ['EXPENSE', 'LIABILITY', 'ASSET', 'EQUITY', 'REVENUE'] as const;

const partyWithTypeOption = (p: PartyRecord) => ({ value: p.id, label: `${p.name}${p.partyType ? ` (${p.partyType})` : ''}` });

const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('finance');
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [debitAccountId, setDebitAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setDebitAccountId('');
      setCreditAccountId('');
      setPartyId('');
      setAmount('');
      setReferenceNo('');
      setNotes('');
      setDescription('');
      setError('');
      setSavedId(null);
    }
  }, [isOpen]);

  // All non-group accounts (for debit side — the expense/target account)
  const { data: allAccounts } = useQuery({
    queryKey: ['all-accounts-flat'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup);
    },
    enabled: isOpen,
  });

  // Cash/Bank accounts (for credit side — where the money comes from)
  const cashAccounts = useMemo(
    () => allAccounts?.filter((a: any) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1')) ?? [],
    [allAccounts]
  );

  // Group debit-side accounts by accountType for SearchableSelect
  const debitOptions = useMemo((): SelectOption[] => {
    if (!allAccounts) return [];
    const debitCandidates = allAccounts.filter(
      (a: any) => !(a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'))
    );
    const groups: Record<string, any[]> = {};
    for (const acc of debitCandidates) {
      const type = acc.accountType as string;
      if (!groups[type]) groups[type] = [];
      groups[type].push(acc);
    }
    return ACCOUNT_TYPE_ORDER
      .filter((type) => groups[type]?.length)
      .flatMap((type) =>
        groups[type].map((a: any) => ({
          value: a.id,
          label: `${a.accountNumber} · ${a.name}`,
          group: t(`expenseModal.accountType.${type}`),
        }))
      );
  }, [allAccounts, t]);

  const cashOptions = useMemo((): SelectOption[] =>
    cashAccounts.map((a: any) => ({ value: a.id, label: `${a.accountNumber} · ${a.name}` })),
    [cashAccounts],
  );

  // Parties (optional — all types)
  const partyPicker = usePartyPicker({ selectedId: partyId || null, enabled: isOpen, toOption: partyWithTypeOption });


  const debitAccount = allAccounts?.find((a: any) => a.id === debitAccountId);
  const creditAccount = cashAccounts?.find((a: any) => a.id === creditAccountId);

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/journals', data),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-journals'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      setSavedId(res.data?.id);
    },
    onError: (err: any) => setError(err.response?.data?.error || t('expenseModal.saveFailed')),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = debitAccountId && creditAccountId && numAmount > 0 && !mutation.isPending;

  const handleSubmit = () => {
    if (debitAccountId === creditAccountId) {
      setError(t('expenseModal.sameAccount'));
      return;
    }

    const debitName = debitAccount ? `${debitAccount.accountNumber} ${debitAccount.name}` : '';
    const creditName = creditAccount ? `${creditAccount.accountNumber} ${creditAccount.name}` : '';
    const refPart = referenceNo ? ` (Ref: ${referenceNo})` : '';
    const descPart = description || t('expenseModal.narration.description', { account: debitName });

    mutation.mutate({
      date,
      narration: `${t('expenseModal.narration.text', { debit: debitName, credit: creditName })}${refPart}${notes ? ` - ${notes}` : ''}`,
      items: [
        {
          accountId: debitAccountId,
          partyId: partyId || null,
          debit: numAmount,
          credit: 0,
          description: descPart,
        },
        {
          accountId: creditAccountId,
          partyId: null,
          debit: 0,
          credit: numAmount,
          description: descPart,
        },
      ],
    });
  };

  return (
    <FormDialog
      open={isOpen}
      onClose={onClose}
      title={t('expenseModal.title')}
      description={t('expenseModal.description')}
      busy={mutation.isPending}
      submitLabel={t('expenseModal.submit')}
      onSubmit={handleSubmit}
      submitDisabled={!canSubmit}
      footer={
        savedId ? (
          <Button className="h-11 sm:h-9" onClick={onClose}>
            {t('expenseModal.done')}
          </Button>
        ) : undefined
      }
    >
      <Field label={t('expenseModal.date')}>
        <DateInput value={date} onChange={setDate} />
      </Field>

      <Field label={t('expenseModal.debitAccount')} hint={t('expenseModal.debitAccountHint')}>
        <OptionPicker
          options={debitOptions}
          value={debitAccountId}
          onChange={setDebitAccountId}
          placeholder={t('expenseModal.debitPlaceholder')}
        />
      </Field>

      <Field label={t('expenseModal.creditAccount')}>
        <OptionPicker
          options={cashOptions}
          value={creditAccountId}
          onChange={setCreditAccountId}
          placeholder={t('expenseModal.creditPlaceholder')}
        />
      </Field>

      <Field label={t('expenseModal.party')}>
        <OptionPicker
          {...partyPicker.pickerProps}
          value={partyId}
          onChange={setPartyId}
          placeholder={t('expenseModal.noParty')}
          emptyLabel={t('expenseModal.noParty')}
        />
      </Field>

      <Field label={t('expenseModal.amount')}>
        <NumberInput
          value={amount}
          onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          min={0}
          inputMode="decimal"
          className="h-10 text-right md:h-9"
        />
      </Field>

      <Field label={t('expenseModal.descriptionLabel')}>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('expenseModal.descriptionPlaceholder')}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('expenseModal.referenceNo')}>
          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={t('expenseModal.referencePlaceholder')} />
        </Field>
        <Field label={t('expenseModal.notes')}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('expenseModal.notesPlaceholder')} />
        </Field>
      </div>

      {numAmount > 0 && debitAccount && creditAccount && (
        <Callout tone="warning" icon={<span className="sr-only">{t('expenseModal.srSummary')}</span>}>
          <p>
            {t('expenseModal.summary')} <span className="num text-base font-bold">{formatRupiah(numAmount)}</span>
          </p>
          <p className="mt-1 text-xs">
            <span className="font-medium">Dr</span> {debitAccount.accountNumber} {debitAccount.name}
          </p>
          <p className="text-xs">
            <span className="font-medium">Cr</span> {creditAccount.accountNumber} {creditAccount.name}
          </p>
          {partyId && partyPicker.selectedParty && (
            <p className="mt-1 text-xs">{t('expenseModal.partyValue', { name: partyPicker.selectedParty.name })}</p>
          )}
        </Callout>
      )}

      {debitAccountId && creditAccountId && debitAccountId === creditAccountId && (
        <Callout tone="warning">{t('expenseModal.sameAccount')}</Callout>
      )}

      <ErrorAlert message={error} />

      {savedId && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
            <span className="text-xs font-semibold text-success-text">{t('expenseModal.saved')}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" aria-hidden /> {t('expenseModal.proof')}
            </span>
          </div>
          <AttachmentPreview referenceType="journal" referenceId={savedId} />
          <AttachmentUpload referenceType="journal" referenceId={savedId} />
        </div>
      )}
    </FormDialog>
  );
};

export default ExpenseModal;

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import api from '../lib/api';
import { ShieldCheck } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { RupiahField } from './purchase-cash/RupiahField';
import { ComboboxField } from './overlays/ComboboxField';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field } from '@/components/shared';
import { FormError, OverlayBody, OverlayFooter, OverlayHeader } from './sales/dialog-parts-b';
import { dialogShellClass, moneyInputClass } from './sales/dialog-classes-b';

/** Stored values (sent to the API as-is) and the key of their translated label. */
const GUARANTEE_TYPES = [
  { value: 'Penawaran', key: 'bid' },
  { value: 'Pelaksanaan', key: 'performance' },
  { value: 'Pemeliharaan', key: 'maintenance' },
  { value: 'Lainnya', key: 'other' },
] as const;

interface ProjectGuaranteeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProjectGuaranteeModal: React.FC<ProjectGuaranteeModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('finance');
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [guaranteeType, setGuaranteeType] = useState('Penawaran');
  const [projectName, setProjectName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [accountId, setAccountId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setPartyId('');
      setGuaranteeType('Penawaran');
      setProjectName('');
      setReferenceNo('');
      setAmount('');
      setAccountId('');
      setExpectedReturnDate('');
      setNotes('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Pemberi proyek bisa customer atau pihak lain — tampilkan semua pihak.
  const partyPicker = usePartyPicker({ selectedId: partyId || null, enabled: isOpen });

  const { data: cashAccounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => !a.isGroup && a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1'));
    },
    enabled: isOpen,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/project-guarantees', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || t('projectGuaranteeModal.saveFailed')),
  });

  const numAmount = Number(amount) || 0;
  const canSubmit = partyId && projectName.trim() && numAmount > 0 && accountId && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      date,
      partyId,
      guaranteeType,
      projectName: projectName.trim(),
      referenceNo: referenceNo || null,
      amount: numAmount,
      accountId,
      expectedReturnDate: expectedReturnDate || null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) handleSubmit(); }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success-text" aria-hidden />
              {t('projectGuaranteeModal.title')}
            </DialogTitle>
            <DialogDescription>{t('projectGuaranteeModal.description')}</DialogDescription>
          </OverlayHeader>

          <OverlayBody className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('projectGuaranteeModal.date')}>
                <DateInput value={date} onChange={setDate} />
              </Field>
              <Field label={t('projectGuaranteeModal.type')}>
                {(control) => (
                  <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                    <SelectTrigger {...control}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GUARANTEE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {t(`projectGuarantees.guaranteeType.${type.key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <ComboboxField
              label={t('projectGuaranteeModal.party')}
              required
              {...partyPicker.pickerProps}
              value={partyId}
              onChange={setPartyId}
              placeholder={t('projectGuaranteeModal.partyPlaceholder')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('projectGuaranteeModal.projectName')} required>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t('projectGuaranteeModal.projectNamePlaceholder')} />
              </Field>
              <Field label={t('projectGuaranteeModal.referenceNo')}>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder={t('projectGuaranteeModal.referencePlaceholder')} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('projectGuaranteeModal.amount')} required>
                {(control) => (
                  <RupiahField
                    id={control.id}
                    value={typeof amount === 'number' ? amount : 0}
                    onChange={(v) => setAmount(v === 0 ? '' : v)}
                    placeholder="0"
                    className={moneyInputClass}
                    aria-label={t('projectGuaranteeModal.amountLabel')}
                  />
                )}
              </Field>
              <Field label={t('projectGuaranteeModal.account')} required>
                {(control) => (
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger {...control}><SelectValue placeholder={t('projectGuaranteeModal.accountPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {cashAccounts?.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.accountNumber} · {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('projectGuaranteeModal.returnDate')} hint={t('projectGuaranteeModal.returnDateHint')}>
                <DateInput value={expectedReturnDate} onChange={setExpectedReturnDate} />
              </Field>
              <Field label={t('projectGuaranteeModal.notes')}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('projectGuaranteeModal.notesPlaceholder')} />
              </Field>
            </div>

            {numAmount > 0 && (
              <div className="rounded-lg border border-border bg-muted/40 p-3" aria-live="polite">
                <p className="text-xs font-medium text-foreground">
                  <Trans
                    t={t}
                    i18nKey="projectGuaranteeModal.summary"
                    values={{ amount: formatRupiah(numAmount) }}
                    components={{ b: <span className="text-base font-bold tabular-nums" /> }}
                  />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <Trans t={t} i18nKey="projectGuaranteeModal.journal" components={{ mono: <span className="font-mono" /> }} />
                </p>
              </div>
            )}

            <FormError message={error} />
          </OverlayBody>

          <OverlayFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>{t('projectGuaranteeModal.cancel')}</Button>
            <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
              {mutation.isPending ? t('projectGuaranteeModal.saving') : t('projectGuaranteeModal.submit')}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectGuaranteeModal;

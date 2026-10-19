/** Service log (with optional GL journal) and service request (approval flow) forms. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Send, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { SERVICE_TYPES, SERVICE_TYPE_LABELS, URGENCIES, URGENCY_LABELS } from '../constants';
import { apiError, numOrNull } from '../vehicle-model';
import { FieldRow, ModalForm, ModalShell, SelectField, TextAreaField, TextField } from './form-kit';

interface ModalProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface CoaAccount {
  id: string;
  accountNumber: string;
  name: string;
  isGroup: boolean;
}

export function ServiceLogModal({ assetId, onClose, onSaved }: ModalProps) {
  const { t } = useTranslation('eam');
  const [f, setF] = useState({ tanggal: '', odometer: '', jenisService: 'SERVIS_BERKALA', deskripsi: '', bengkel: '', biaya: '' });
  const [postJournal, setPostJournal] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [creditAccountId, setCreditAccountId] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  // Accounts for the journal option (loaded only when it is ticked).
  const { data: coaFlat = [] } = useQuery<CoaAccount[]>({
    queryKey: ['coa-flat'],
    queryFn: async () => (await api.get('/coa/flat')).data,
    enabled: postJournal,
    staleTime: 5 * 60 * 1000,
  });
  const expenseOptions = useMemo(
    () => coaFlat.filter((a) => !a.isGroup && String(a.accountNumber).startsWith('6.')),
    [coaFlat],
  );
  const sourceOptions = useMemo(
    () =>
      coaFlat.filter(
        (a) => !a.isGroup && (String(a.accountNumber).startsWith('1.1.') || String(a.accountNumber) === '2.1.1'),
      ),
    [coaFlat],
  );

  // Smart default until the user picks one: fuel/parking/toll → 6.3, anything else → 6.7.
  const defaultAccountId = useMemo(() => {
    const want = /bbm|bensin|solar|parkir|tol|pertalite|pertamax/i.test(f.deskripsi) ? '6.3' : '6.7';
    return expenseOptions.find((o) => o.accountNumber === want)?.id ?? '';
  }, [expenseOptions, f.deskripsi]);
  const effectiveAccountId = accountId || defaultAccountId;

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/services`, {
        tanggal: f.tanggal,
        odometer: numOrNull(f.odometer),
        jenisService: f.jenisService,
        deskripsi: f.deskripsi,
        bengkel: f.bengkel || null,
        biaya: numOrNull(f.biaya),
        postJournal,
        accountId: postJournal ? effectiveAccountId || null : null,
        creditAccountId: postJournal ? creditAccountId || null : null,
      }),
    onSuccess: () => {
      toast.success(postJournal ? t('fleet.serviceModals.savedWithJournal') : t('fleet.serviceModals.saved'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.serviceModals.saveFailed'))),
  });

  const label = (a: CoaAccount) => `${a.accountNumber} · ${a.name}`;

  return (
    <ModalShell title={t('fleet.serviceModals.logTitle')} icon={Wrench} onClose={onClose}>
      <ModalForm onSubmit={() => mut.mutate()} onCancel={onClose} submitting={mut.isPending}>
        <FieldRow>
          <TextField label={t('fleet.field.date')} type="date" value={f.tanggal} onChange={set('tanggal')} required />
          <SelectField label={t('fleet.serviceModals.serviceType')} value={f.jenisService} onChange={set('jenisService')} options={SERVICE_TYPES} labels={SERVICE_TYPE_LABELS} />
        </FieldRow>
        <TextField label={t('fleet.serviceModals.description')} value={f.deskripsi} onChange={set('deskripsi')} required />
        <FieldRow>
          <TextField label={t('fleet.field.odometerKm')} type="number" value={f.odometer} onChange={set('odometer')} />
          <TextField label={t('fleet.serviceModals.cost')} type="number" value={f.biaya} onChange={set('biaya')} />
        </FieldRow>
        <TextField label={t('fleet.serviceModals.workshop')} value={f.bengkel} onChange={set('bengkel')} />

        <div className="space-y-3 rounded-md border border-border bg-muted/50 p-3">
          <div className="flex items-start gap-2">
            <input
              id="svc-post-journal"
              type="checkbox"
              checked={postJournal}
              onChange={(e) => setPostJournal(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-[var(--primary)]"
            />
            <label htmlFor="svc-post-journal" className="cursor-pointer text-sm">
              <span className="font-medium text-foreground">{t('fleet.serviceModals.postJournal')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('fleet.serviceModals.postJournalHint')}
              </span>
            </label>
          </div>
          {postJournal && (
            <FieldRow>
              <SelectField
                label={t('fleet.serviceModals.expenseAccount')}
                value={effectiveAccountId}
                onChange={setAccountId}
                options={expenseOptions.map((a) => a.id)}
                labels={Object.fromEntries(expenseOptions.map((a) => [a.id, label(a)]))}
                emptyLabel={t('fleet.serviceModals.expenseAccountEmpty')}
              />
              <SelectField
                label={t('fleet.serviceModals.sourceAccount')}
                value={creditAccountId}
                onChange={setCreditAccountId}
                options={sourceOptions.map((a) => a.id)}
                labels={Object.fromEntries(sourceOptions.map((a) => [a.id, label(a)]))}
                emptyLabel={t('fleet.serviceModals.sourceAccountEmpty')}
              />
            </FieldRow>
          )}
        </div>
      </ModalForm>
    </ModalShell>
  );
}

export function ServiceRequestModal({ assetId, onClose, onSaved }: ModalProps) {
  const { t } = useTranslation('eam');
  const [f, setF] = useState({ jenisService: 'PERBAIKAN', odometer: '', deskripsi: '', urgensi: 'MEDIUM' });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/service-requests`, {
        jenisService: f.jenisService,
        odometer: numOrNull(f.odometer),
        deskripsi: f.deskripsi,
        urgensi: f.urgensi,
      }),
    onSuccess: () => {
      toast.success(t('fleet.serviceModals.requestSent'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.serviceModals.requestFailed'))),
  });
  return (
    <ModalShell title={t('fleet.serviceModals.requestTitle')} icon={ClipboardList} onClose={onClose} description={t('fleet.serviceModals.requestDescription')}>
      <ModalForm onSubmit={() => mut.mutate()} onCancel={onClose} submitting={mut.isPending} submitLabel={t('fleet.serviceModals.send')} submitIcon={Send}>
        <SelectField label={t('fleet.serviceModals.serviceType')} value={f.jenisService} onChange={set('jenisService')} options={SERVICE_TYPES} labels={SERVICE_TYPE_LABELS} />
        <TextAreaField label={t('fleet.serviceModals.description')} value={f.deskripsi} onChange={set('deskripsi')} required />
        <FieldRow>
          <TextField label={t('fleet.field.odometerKm')} type="number" value={f.odometer} onChange={set('odometer')} />
          <SelectField label={t('fleet.serviceModals.urgency')} value={f.urgensi} onChange={set('urgensi')} options={URGENCIES} labels={URGENCY_LABELS} />
        </FieldRow>
      </ModalForm>
    </ModalShell>
  );
}

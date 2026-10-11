/** Tax/STNK/KIR record, tax request (approval flow) and insurance policy forms. */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileWarning, Pencil, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import {
  INSURANCE_STATUSES,
  INSURANCE_TYPES,
  INSURANCE_TYPE_LABELS,
  RECORD_STATUS_LABELS,
  TAX_STATUSES,
  TAX_TYPES,
  TAX_TYPE_LABELS,
  URGENCIES,
  URGENCY_LABELS,
} from '../constants';
import { uploadSupportingDocument } from '../documents-api';
import type { InsuranceRecord, TaxRecord } from '../types';
import { apiError, numOrNull } from '../vehicle-model';
import { FieldRow, ModalForm, ModalShell, SelectField, TextAreaField, TextField } from './form-kit';

interface BaseProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Document type per tax type, for the scan upload. */
const TAX_DOC_TYPE: Record<string, string> = { STNK_TAHUNAN: 'STNK', STNK_5_TAHUNAN: 'STNK', KIR: 'KIR', PAJAK_KENDARAAN: 'STNK' };

function DocumentUploadField({ file, onChange, hasExisting }: { file: File | null; onChange: (f: File | null) => void; hasExisting?: boolean }) {
  const { t } = useTranslation('eam');
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {t('fleet.taxModals.scan')}
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary-subtle file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-subtle-foreground hover:file:bg-accent"
        />
      </label>
      {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
      {hasExisting && !file && (
        <span className="text-xs text-muted-foreground">{t('fleet.taxModals.scanExisting')}</span>
      )}
    </div>
  );
}

const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

export function TaxModal({ assetId, editRecord, onClose, onSaved }: BaseProps & { editRecord?: TaxRecord | null }) {
  const { t } = useTranslation('eam');
  const isEdit = !!editRecord;
  const [f, setF] = useState(() =>
    editRecord
      ? {
          type: editRecord.type,
          periodYear: String(editRecord.periodYear),
          amount: editRecord.amount != null ? String(editRecord.amount) : '',
          paidAt: dateOnly(editRecord.paidAt),
          dueDate: dateOnly(editRecord.dueDate),
          status: editRecord.status,
          notes: editRecord.notes ?? '',
        }
      : { type: 'STNK_TAHUNAN', periodYear: String(new Date().getFullYear()), amount: '', paidAt: '', dueDate: '', status: 'ACTIVE', notes: '' },
  );
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: f.type,
        periodYear: Number(f.periodYear),
        amount: numOrNull(f.amount),
        paidAt: f.paidAt || null,
        dueDate: f.dueDate,
        status: f.status,
        notes: f.notes || null,
      };
      const res = isEdit
        ? await api.patch(`/ga/vehicle/assets/${assetId}/taxes/${editRecord!.id}`, payload)
        : await api.post(`/ga/vehicle/assets/${assetId}/taxes`, payload);
      const recordId = isEdit ? editRecord!.id : res.data.id;
      if (file) {
        setUploading(true);
        try {
          const documentId = await uploadSupportingDocument({
            file,
            title: `${TAX_TYPE_LABELS[f.type]} ${f.periodYear}`,
            typeCode: TAX_DOC_TYPE[f.type] ?? 'STNK',
            assetId,
          });
          await api.patch(`/ga/vehicle/assets/${assetId}/taxes/${recordId}`, { documentId });
        } finally {
          setUploading(false);
        }
      }
      return res;
    },
    onSuccess: () => {
      toast.success(file ? t('fleet.taxModals.taxSavedWithDoc') : isEdit ? t('fleet.taxModals.taxUpdated') : t('fleet.taxModals.taxAdded'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.taxModals.taxFailed'))),
  });
  const pending = mut.isPending || uploading;

  return (
    <ModalShell title={isEdit ? t('fleet.taxModals.taxEditTitle') : t('fleet.taxModals.taxNewTitle')} icon={isEdit ? Pencil : FileWarning} onClose={onClose}>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={pending}
        submitDisabled={!f.dueDate}
        submitLabel={uploading ? t('fleet.taxModals.uploading') : t('fleet.form.save')}
      >
        <FieldRow>
          <SelectField label={t('fleet.taxModals.type')} value={f.type} onChange={set('type')} options={TAX_TYPES} labels={TAX_TYPE_LABELS} />
          <TextField label={t('fleet.taxModals.year')} type="number" value={f.periodYear} onChange={set('periodYear')} inputMode="numeric" />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.dueDate')} type="date" value={f.dueDate} onChange={set('dueDate')} required />
          <TextField label={t('fleet.taxModals.paidAt')} type="date" value={f.paidAt} onChange={set('paidAt')} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.cost')} type="number" value={f.amount} onChange={set('amount')} />
          <SelectField label={t('fleet.field.status')} value={f.status} onChange={set('status')} options={TAX_STATUSES} labels={RECORD_STATUS_LABELS} />
        </FieldRow>
        <TextAreaField label={t('fleet.field.notes')} value={f.notes} onChange={set('notes')} />
        <DocumentUploadField file={file} onChange={setFile} hasExisting={isEdit && !!editRecord?.document} />
      </ModalForm>
    </ModalShell>
  );
}

/** Tax/STNK request; on approval the server creates a tax record (IN_PROCESS). */
export function TaxRequestModal({ assetId, onClose, onSaved }: BaseProps) {
  const { t } = useTranslation('eam');
  const [f, setF] = useState({
    type: 'STNK_TAHUNAN',
    periodYear: String(new Date().getFullYear()),
    estimatedAmount: '',
    dueDate: '',
    deskripsi: '',
    urgensi: 'MEDIUM',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/tax-requests`, {
        type: f.type,
        periodYear: Number(f.periodYear),
        estimatedAmount: numOrNull(f.estimatedAmount),
        dueDate: f.dueDate,
        deskripsi: f.deskripsi || null,
        urgensi: f.urgensi,
      }),
    onSuccess: () => {
      toast.success(t('fleet.taxModals.requestSent'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.taxModals.requestFailed'))),
  });
  const submit = () => {
    if (!f.dueDate) {
      toast.error(t('fleet.taxModals.dueRequired'));
      return;
    }
    save.mutate();
  };
  return (
    <ModalShell title={t('fleet.taxModals.requestTitle')} icon={FileWarning} onClose={onClose} description={t('fleet.taxModals.requestDescription')}>
      <ModalForm onSubmit={submit} onCancel={onClose} submitting={save.isPending} submitLabel={t('fleet.taxModals.sendRequest')} submitIcon={Send}>
        <FieldRow>
          <SelectField label={t('fleet.taxModals.type')} value={f.type} onChange={set('type')} options={TAX_TYPES} labels={TAX_TYPE_LABELS} />
          <TextField label={t('fleet.taxModals.periodYear')} type="number" value={f.periodYear} onChange={set('periodYear')} inputMode="numeric" />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.dueDate')} type="date" value={f.dueDate} onChange={set('dueDate')} required />
          <TextField label={t('fleet.taxModals.estimatedCost')} type="number" value={f.estimatedAmount} onChange={set('estimatedAmount')} />
        </FieldRow>
        <SelectField label={t('fleet.taxModals.urgency')} value={f.urgensi} onChange={set('urgensi')} options={URGENCIES} labels={URGENCY_LABELS} />
        <TextAreaField label={t('fleet.taxModals.remarks')} value={f.deskripsi} onChange={set('deskripsi')} />
      </ModalForm>
    </ModalShell>
  );
}

export function InsuranceModal({ assetId, editRecord, onClose, onSaved }: BaseProps & { editRecord?: InsuranceRecord | null }) {
  const { t } = useTranslation('eam');
  const isEdit = !!editRecord;
  const [f, setF] = useState(() =>
    editRecord
      ? {
          type: editRecord.type,
          provider: editRecord.provider,
          policyNumber: editRecord.policyNumber ?? '',
          premium: editRecord.premium != null ? String(editRecord.premium) : '',
          coverageValue: editRecord.coverageValue != null ? String(editRecord.coverageValue) : '',
          startDate: dateOnly(editRecord.startDate),
          endDate: dateOnly(editRecord.endDate),
          status: editRecord.status,
          notes: editRecord.notes ?? '',
        }
      : { type: 'ALL_RISK', provider: '', policyNumber: '', premium: '', coverageValue: '', startDate: '', endDate: '', status: 'ACTIVE', notes: '' },
  );
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: f.type,
        provider: f.provider,
        policyNumber: f.policyNumber || null,
        premium: numOrNull(f.premium),
        coverageValue: numOrNull(f.coverageValue),
        startDate: f.startDate,
        endDate: f.endDate,
        status: f.status,
        notes: f.notes || null,
      };
      const res = isEdit
        ? await api.patch(`/ga/vehicle/assets/${assetId}/insurances/${editRecord!.id}`, payload)
        : await api.post(`/ga/vehicle/assets/${assetId}/insurances`, payload);
      const recordId = isEdit ? editRecord!.id : res.data.id;
      if (file) {
        setUploading(true);
        try {
          const documentId = await uploadSupportingDocument({
            file,
            title: t('fleet.taxModals.policyDocTitle', { provider: f.provider, ref: f.policyNumber || INSURANCE_TYPE_LABELS[f.type] }),
            typeCode: 'ASURANSI_KENDARAAN',
            assetId,
          });
          await api.patch(`/ga/vehicle/assets/${assetId}/insurances/${recordId}`, { documentId });
        } finally {
          setUploading(false);
        }
      }
      return res;
    },
    onSuccess: () => {
      toast.success(file ? t('fleet.taxModals.insSavedWithDoc') : isEdit ? t('fleet.taxModals.insUpdated') : t('fleet.taxModals.insAdded'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.taxModals.insFailed'))),
  });
  const pending = mut.isPending || uploading;

  return (
    <ModalShell title={isEdit ? t('fleet.taxModals.insEditTitle') : t('fleet.taxModals.insNewTitle')} icon={isEdit ? Pencil : ShieldCheck} onClose={onClose} wide>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={pending}
        submitDisabled={!f.provider || !f.startDate || !f.endDate}
        submitLabel={uploading ? t('fleet.taxModals.uploading') : t('fleet.form.save')}
      >
        <FieldRow>
          <SelectField label={t('fleet.taxModals.type')} value={f.type} onChange={set('type')} options={INSURANCE_TYPES} labels={INSURANCE_TYPE_LABELS} />
          <TextField label={t('fleet.taxModals.provider')} value={f.provider} onChange={set('provider')} required />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.policyNo')} value={f.policyNumber} onChange={set('policyNumber')} />
          <SelectField label={t('fleet.field.status')} value={f.status} onChange={set('status')} options={INSURANCE_STATUSES} labels={RECORD_STATUS_LABELS} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.premium')} type="number" value={f.premium} onChange={set('premium')} />
          <TextField label={t('fleet.taxModals.coverage')} type="number" value={f.coverageValue} onChange={set('coverageValue')} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.taxModals.startDate')} type="date" value={f.startDate} onChange={set('startDate')} required />
          <TextField label={t('fleet.taxModals.endDate')} type="date" value={f.endDate} onChange={set('endDate')} required />
        </FieldRow>
        <TextAreaField label={t('fleet.field.notes')} value={f.notes} onChange={set('notes')} />
        <DocumentUploadField file={file} onChange={setFile} hasExisting={isEdit && !!editRecord?.document} />
      </ModalForm>
    </ModalShell>
  );
}

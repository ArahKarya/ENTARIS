/** Fuel log, incident report, tire and oil change forms. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleDot, Droplets, Fuel, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { labelMap } from '../../eam-i18n';
import api from '@/lib/api';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  TIRE_POSITIONS,
  TIRE_POSITION_LABELS,
  TIRE_STATUSES,
  TIRE_STATUS_LABELS,
} from '../constants';
import type { Incident, Tire } from '../types';
import { apiError, numOrNull } from '../vehicle-model';
import { FieldRow, ModalForm, ModalShell, SelectField, TextAreaField, TextField } from './form-kit';

interface BaseProps {
  assetId: string;
  onClose: () => void;
  onSaved: () => void;
}

const SEVERITY_LABELS = labelMap(INCIDENT_SEVERITIES, 'vehicle.incidentSeverity');

export function FuelModal({ assetId, onClose, onSaved }: BaseProps) {
  const { t } = useTranslation('eam');
  const [f, setF] = useState({ tanggal: '', odometer: '', liters: '', pricePerLiter: '', totalCost: '', spbu: '', driverName: '', notes: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  // totalCost follows liters × price until the user types it by hand.
  const [totalManual, setTotalManual] = useState(false);
  const l = Number(f.liters);
  const p = Number(f.pricePerLiter);
  const totalCost = !totalManual && l > 0 && p > 0 ? String(Math.round(l * p)) : f.totalCost;

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/fuel-logs`, {
        tanggal: f.tanggal,
        odometer: numOrNull(f.odometer),
        liters: Number(f.liters),
        pricePerLiter: numOrNull(f.pricePerLiter),
        totalCost: Number(totalCost),
        spbu: f.spbu || null,
        driverName: f.driverName || null,
        notes: f.notes || null,
      }),
    onSuccess: () => {
      toast.success(t('fleet.logModals.fuelAdded'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.logModals.fuelFailed'))),
  });

  return (
    <ModalShell title={t('fleet.logModals.fuelTitle')} icon={Fuel} onClose={onClose}>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={mut.isPending}
        submitDisabled={!f.tanggal || !f.liters || !totalCost}
      >
        <FieldRow>
          <TextField label={t('fleet.field.date')} type="date" value={f.tanggal} onChange={set('tanggal')} required />
          <TextField label={t('fleet.field.odometerKm')} type="number" value={f.odometer} onChange={set('odometer')} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.logModals.liters')} type="number" step="0.01" value={f.liters} onChange={set('liters')} required />
          <TextField label={t('fleet.logModals.pricePerLiter')} type="number" value={f.pricePerLiter} onChange={set('pricePerLiter')} />
        </FieldRow>
        <TextField
          label={t('fleet.logModals.totalCost')}
          type="number"
          value={totalCost}
          onChange={(v) => {
            setTotalManual(true);
            set('totalCost')(v);
          }}
          required
          hint={t('fleet.logModals.totalCostHint')}
        />
        <FieldRow>
          <TextField label={t('fleet.logModals.station')} value={f.spbu} onChange={set('spbu')} />
          <TextField label={t('fleet.logModals.driver')} value={f.driverName} onChange={set('driverName')} />
        </FieldRow>
      </ModalForm>
    </ModalShell>
  );
}

export function IncidentModal({ assetId, incidentId, onClose, onSaved }: BaseProps & { incidentId?: string }) {
  const { t } = useTranslation('eam');
  const isEdit = !!incidentId;
  const { data: existing, isLoading } = useQuery<Incident | null>({
    queryKey: ['ga-vehicle-incident-detail', incidentId],
    queryFn: async () => {
      const list = await api.get<Incident[]>(`/ga/vehicle/assets/${assetId}/incidents`);
      return list.data.find((i) => i.id === incidentId) ?? null;
    },
    enabled: isEdit,
  });
  if (isEdit && isLoading) {
    return (
      <ModalShell title={t('fleet.logModals.incidentDetail')} icon={TriangleAlert} onClose={onClose} wide>
        <p role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">{t('fleet.logModals.incidentLoading')}</p>
      </ModalShell>
    );
  }
  return <IncidentForm assetId={assetId} incidentId={incidentId} existing={existing ?? null} onClose={onClose} onSaved={onSaved} />;
}

function IncidentForm({ assetId, incidentId, existing, onClose, onSaved }: BaseProps & { incidentId?: string; existing: Incident | null }) {
  const { t } = useTranslation('eam');
  const isEdit = !!incidentId;
  const [f, setF] = useState(() => ({
    tanggal: existing?.tanggal?.slice(0, 10) ?? '',
    location: existing?.location ?? '',
    driverName: existing?.driverName ?? '',
    description: existing?.description ?? '',
    severity: existing?.severity ?? 'RINGAN',
    status: existing?.status ?? 'DILAPORKAN',
    estimatedCost: existing?.estimatedCost != null ? String(existing.estimatedCost) : '',
    actualCost: existing?.actualCost != null ? String(existing.actualCost) : '',
    insuranceClaimNo: existing?.insuranceClaimNo ?? '',
  }));
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const payload = () => ({
    tanggal: f.tanggal,
    location: f.location || null,
    driverName: f.driverName || null,
    description: f.description,
    severity: f.severity,
    status: f.status,
    estimatedCost: numOrNull(f.estimatedCost),
    actualCost: numOrNull(f.actualCost),
    insuranceClaimNo: f.insuranceClaimNo || null,
  });
  const mut = useMutation({
    mutationFn: () =>
      isEdit
        ? api.patch(`/ga/vehicle/assets/${assetId}/incidents/${incidentId}`, payload())
        : api.post(`/ga/vehicle/assets/${assetId}/incidents`, payload()),
    onSuccess: () => {
      toast.success(isEdit ? t('fleet.logModals.incidentUpdated') : t('fleet.logModals.incidentReported'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, isEdit ? t('fleet.logModals.incidentUpdateFailed') : t('fleet.logModals.incidentReportFailed'))),
  });

  return (
    <ModalShell title={isEdit ? t('fleet.logModals.incidentDetail') : t('fleet.logModals.incidentReportTitle')} icon={TriangleAlert} onClose={onClose} wide>
      <ModalForm onSubmit={() => mut.mutate()} onCancel={onClose} submitting={mut.isPending} submitDisabled={!f.tanggal || !f.description}>
        <FieldRow>
          <TextField label={t('fleet.field.date')} type="date" value={f.tanggal} onChange={set('tanggal')} required />
          <TextField label={t('fleet.logModals.location')} value={f.location} onChange={set('location')} />
        </FieldRow>
        <TextField label={t('fleet.logModals.incidentDriver')} value={f.driverName} onChange={set('driverName')} />
        <TextAreaField label={t('fleet.logModals.incidentDescription')} value={f.description} onChange={set('description')} required rows={3} />
        <FieldRow>
          <SelectField label={t('fleet.logModals.severity')} value={f.severity} onChange={set('severity')} options={INCIDENT_SEVERITIES} labels={SEVERITY_LABELS} />
          <SelectField label={t('fleet.field.status')} value={f.status} onChange={set('status')} options={INCIDENT_STATUSES} labels={INCIDENT_STATUS_LABELS} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.logModals.estimatedCost')} type="number" value={f.estimatedCost} onChange={set('estimatedCost')} />
          <TextField label={t('fleet.logModals.actualCost')} type="number" value={f.actualCost} onChange={set('actualCost')} />
        </FieldRow>
        <TextField label={t('fleet.logModals.claimNo')} value={f.insuranceClaimNo} onChange={set('insuranceClaimNo')} />
      </ModalForm>
    </ModalShell>
  );
}

export function TireModal({ assetId, editRecord, onClose, onSaved }: BaseProps & { editRecord?: Tire | null }) {
  const { t } = useTranslation('eam');
  const isEdit = !!editRecord;
  const [f, setF] = useState(() =>
    editRecord
      ? {
          serialNumber: editRecord.serialNumber,
          brand: editRecord.brand,
          model: editRecord.model ?? '',
          size: editRecord.size ?? '',
          position: editRecord.position,
          installedAt: editRecord.installedAt ? editRecord.installedAt.slice(0, 10) : '',
          installedOdometer: editRecord.installedOdometer != null ? String(editRecord.installedOdometer) : '',
          notes: editRecord.notes ?? '',
          status: editRecord.status,
        }
      : { serialNumber: '', brand: '', model: '', size: '', position: 'DEPAN_KIRI', installedAt: '', installedOdometer: '', notes: '', status: 'ACTIVE' },
  );
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      const body = {
        serialNumber: f.serialNumber,
        brand: f.brand,
        model: f.model || null,
        size: f.size || null,
        position: f.position,
        installedAt: f.installedAt,
        installedOdometer: numOrNull(f.installedOdometer),
        notes: f.notes || null,
        status: f.status,
      };
      return isEdit
        ? api.patch(`/ga/vehicle/assets/${assetId}/tires/${editRecord!.id}`, body)
        : api.post(`/ga/vehicle/assets/${assetId}/tires`, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? t('fleet.logModals.tireUpdated') : t('fleet.logModals.tireInstalled'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.logModals.tireFailed'))),
  });

  return (
    <ModalShell title={isEdit ? t('fleet.logModals.tireEditTitle') : t('fleet.logModals.tireNewTitle')} icon={CircleDot} onClose={onClose}>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={mut.isPending}
        submitDisabled={!f.serialNumber || !f.brand || !f.installedAt}
      >
        <TextField label={t('fleet.logModals.tireSerial')} value={f.serialNumber} onChange={set('serialNumber')} required />
        <FieldRow>
          <TextField label={t('fleet.logModals.brand')} value={f.brand} onChange={set('brand')} required />
          <TextField label={t('fleet.logModals.model')} value={f.model} onChange={set('model')} />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.logModals.tireSize')} value={f.size} onChange={set('size')} />
          <SelectField label={t('fleet.logModals.tirePosition')} value={f.position} onChange={set('position')} options={TIRE_POSITIONS} labels={TIRE_POSITION_LABELS} required />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.logModals.installedAt')} type="date" value={f.installedAt} onChange={set('installedAt')} required />
          <TextField label={t('fleet.logModals.installedOdometer')} type="number" value={f.installedOdometer} onChange={set('installedOdometer')} />
        </FieldRow>
        <SelectField label={t('fleet.logModals.tireStatus')} value={f.status} onChange={set('status')} options={TIRE_STATUSES} labels={TIRE_STATUS_LABELS} />
        <TextAreaField label={t('fleet.field.notes')} value={f.notes} onChange={set('notes')} />
      </ModalForm>
    </ModalShell>
  );
}

export function OilModal({ assetId, onClose, onSaved }: BaseProps) {
  const { t } = useTranslation('eam');
  const [f, setF] = useState({ tanggal: '', odometer: '', nextOdometerDue: '', brand: '', volume: '', notes: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  // Next change defaults to +5.000 km (standard interval) until edited by hand.
  const [nextManual, setNextManual] = useState(false);
  const odo = Number(f.odometer);
  const nextOdometerDue = !nextManual && odo > 0 ? String(odo + 5000) : f.nextOdometerDue;

  const mut = useMutation({
    mutationFn: () =>
      api.post(`/ga/vehicle/assets/${assetId}/oil-logs`, {
        tanggal: f.tanggal,
        odometer: Number(f.odometer),
        nextOdometerDue: Number(nextOdometerDue),
        brand: f.brand,
        volume: Number(f.volume),
        notes: f.notes || null,
      }),
    onSuccess: () => {
      toast.success(t('fleet.logModals.oilSaved'));
      onSaved();
    },
    onError: (e) => toast.error(apiError(e, t('fleet.logModals.oilFailed'))),
  });

  return (
    <ModalShell title={t('fleet.logModals.oilTitle')} icon={Droplets} onClose={onClose}>
      <ModalForm
        onSubmit={() => mut.mutate()}
        onCancel={onClose}
        submitting={mut.isPending}
        submitDisabled={!f.tanggal || !f.odometer || !nextOdometerDue || !f.brand || !f.volume}
      >
        <TextField label={t('fleet.field.date')} type="date" value={f.tanggal} onChange={set('tanggal')} required />
        <FieldRow>
          <TextField label={t('fleet.logModals.currentOdometer')} type="number" value={f.odometer} onChange={set('odometer')} required />
          <TextField
            label={t('fleet.logModals.nextOdometer')}
            type="number"
            value={nextOdometerDue}
            onChange={(v) => {
              setNextManual(true);
              set('nextOdometerDue')(v);
            }}
            required
            hint={t('fleet.logModals.nextOdometerHint')}
          />
        </FieldRow>
        <FieldRow>
          <TextField label={t('fleet.logModals.oilBrand')} value={f.brand} onChange={set('brand')} required />
          <TextField label={t('fleet.logModals.volume')} type="number" step="0.01" value={f.volume} onChange={set('volume')} required />
        </FieldRow>
        <TextAreaField label={t('fleet.field.notes')} value={f.notes} onChange={set('notes')} />
      </ModalForm>
    </ModalShell>
  );
}

/**
 * "Catat Pergerakan": POST /ga/inventory/movements (IN / OUT / TRANSFER /
 * ADJUSTMENT). Location requirements mirror the server rules.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { FormNumberInput, FormSection, FormSheet } from '@/components/inventory/master-data-kit';
import { FormSelect } from './form-select';
import { MOVEMENT_LABEL, MOVEMENT_TYPES, errorMessage, movementNeeds, type GaMovementType } from './ga-inventory-model';
import { useGaItemOptions, useGaLocations, useInvalidateGaInventory } from './queries';

interface FormState {
  itemId: string;
  type: GaMovementType;
  quantity: string;
  fromLocationId: string;
  toLocationId: string;
  referenceNo: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const TYPE_HINT: Record<GaMovementType, string> = {
  IN: 'Stok masuk ke lokasi tujuan.',
  OUT: 'Stok keluar dari lokasi asal.',
  TRANSFER: 'Pindah stok dari lokasi asal ke lokasi tujuan.',
  ADJUSTMENT: 'Tambah stok di lokasi tujuan (koreksi). Untuk menyamakan dengan hitungan fisik, pakai Stok Opname.',
};

interface GaMovementFormSheetProps {
  open: boolean;
  /** Preselected item (row action). */
  itemId?: string;
  onClose: () => void;
}

/** Mount per open (keyed) so the form starts fresh. */
export function GaMovementFormSheet({ open, itemId, onClose }: GaMovementFormSheetProps) {
  const { data: items = [] } = useGaItemOptions(open);
  const { data: locations = [] } = useGaLocations();
  const invalidate = useInvalidateGaInventory();
  const [form, setForm] = useState<FormState>({
    itemId: itemId ?? '',
    type: 'IN',
    quantity: '',
    fromLocationId: '',
    toLocationId: '',
    referenceNo: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needs = movementNeeds(form.type);
  const item = items.find((i) => i.id === form.itemId);
  const locationOptions = locations.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const e: Errors = {};
    if (!form.itemId) e.itemId = 'Item wajib dipilih.';
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) e.quantity = 'Qty harus lebih dari 0.';
    if (needs.from && !form.fromLocationId) e.fromLocationId = 'Lokasi asal wajib dipilih.';
    if (needs.to && !form.toLocationId) e.toLocationId = 'Lokasi tujuan wajib dipilih.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      await api.post('/ga/inventory/movements', {
        itemId: form.itemId,
        type: form.type,
        quantity: qty,
        // Locations the type does not use are not sent (same as before: disabled fields were empty).
        fromLocationId: needs.from ? form.fromLocationId || null : null,
        toLocationId: needs.to ? form.toLocationId || null : null,
        referenceNo: form.referenceNo || null,
        notes: form.notes || null,
      });
      toast.success('Pergerakan dicatat.');
      invalidate();
      onClose();
    } catch (err) {
      setServerError(errorMessage(err, 'Gagal mencatat pergerakan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Catat Pergerakan"
      description="Stok masuk, keluar, transfer antar lokasi, atau penyesuaian."
      error={serverError}
      saving={saving}
      submitLabel="Simpan Pergerakan"
      onSubmit={submit}
    >
      <FormSection title="Barang">
        <Field label="Item" required error={errors.itemId}>
          <FormSelect
            value={form.itemId}
            onChange={(v) => set('itemId', v)}
            options={items.map((i) => ({ value: i.id, label: `${i.sku} · ${i.name}` }))}
            placeholder="Pilih item…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipe" required hint={TYPE_HINT[form.type]}>
            <FormSelect
              value={form.type}
              onChange={(v) => set('type', v as GaMovementType)}
              options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABEL[t] }))}
            />
          </Field>
          <Field label={item ? `Qty (${item.uom})` : 'Qty'} required error={errors.quantity}>
            <FormNumberInput
              value={form.quantity}
              onChange={(ev) => set('quantity', ev.target.value)}
              min={0}
              step="any"
              inputMode="decimal"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Lokasi">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Lokasi asal" required={needs.from} error={errors.fromLocationId} hint={needs.from ? undefined : 'Tidak dipakai tipe ini'}>
            <FormSelect
              value={needs.from ? form.fromLocationId : ''}
              onChange={(v) => set('fromLocationId', v)}
              options={locationOptions}
              placeholder={needs.from ? 'Pilih lokasi…' : '-'}
              disabled={!needs.from}
            />
          </Field>
          <Field label="Lokasi tujuan" required={needs.to} error={errors.toLocationId} hint={needs.to ? undefined : 'Tidak dipakai tipe ini'}>
            <FormSelect
              value={needs.to ? form.toLocationId : ''}
              onChange={(v) => set('toLocationId', v)}
              options={locationOptions}
              placeholder={needs.to ? 'Pilih lokasi…' : '-'}
              disabled={!needs.to}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Keterangan">
        <Field label="No. referensi">
          <Input value={form.referenceNo} onChange={(e) => set('referenceNo', e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Catatan">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} autoComplete="off" />
        </Field>
      </FormSection>
    </FormSheet>
  );
}

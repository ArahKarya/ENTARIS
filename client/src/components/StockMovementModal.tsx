import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumberInput } from '@/components/ui/number-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput, Field, type ComboboxOption } from '@/components/shared';
import {
  FormError,
  PinnedBody,
  PinnedFooter,
  PinnedHeader,
  pinnedDialogClass,
} from '@/components/overlays/dialog-parts';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { WarehouseSelectField } from '@/components/overlays/WarehouseSelectField';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  editMovement?: any | null;
}

const today = () => new Date().toISOString().split('T')[0];

const defaultForm = {
  date: today(),
  itemId: '',
  warehouseId: '',
  movementType: 'In' as 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut',
  quantity: '',
  unitCost: '',
  offsetAccountId: '',
  referenceType: '',
  referenceNumber: '',
  notes: '',
};

export function StockMovementModal({ isOpen, onClose, editMovement }: StockMovementModalProps) {
  const [form, setForm] = useState({ ...defaultForm, date: today() });
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!editMovement;

  // Reset form on open / populate when editing
  useEffect(() => {
    if (isOpen) {
      if (editMovement) {
        setForm({
          date: editMovement.date ? new Date(editMovement.date).toISOString().split('T')[0] : today(),
          itemId: editMovement.itemId || '',
          warehouseId: editMovement.warehouseId || '',
          movementType: editMovement.movementType || 'In',
          quantity: editMovement.quantity != null ? String(Number(editMovement.quantity)) : '',
          unitCost: editMovement.unitCost != null ? String(Number(editMovement.unitCost)) : '',
          offsetAccountId: editMovement.offsetAccountId || '',
          referenceType: editMovement.referenceType || '',
          referenceNumber: editMovement.referenceNumber || '',
          notes: editMovement.notes || '',
        });
      } else {
        setForm({ ...defaultForm, date: today() });
      }
      setError('');
      setShowErrors(false);
    }
  }, [isOpen, editMovement]);

  // Sertakan warehouseId supaya currentStock tiap item = stok di gudang yang
  // dipilih (bukan total). Tanpa gudang terpilih → tampil total seperti biasa.
  const { data: itemsRaw } = useQuery({
    queryKey: ['inventory-items-active', form.warehouseId],
    queryFn: () =>
      api.get('/inventory/items', {
        params: { isActive: 'true', ...(form.warehouseId ? { warehouseId: form.warehouseId } : {}) },
      }).then(r => r.data.data ?? r.data),
    enabled: isOpen,
  });
  const items: any[] = useMemo(() => itemsRaw ?? [], [itemsRaw]);

  const { data: coaData } = useQuery({
    queryKey: ['coa-flat'],
    queryFn: () => api.get('/coa/flat').then(r => r.data),
    enabled: isOpen,
  });
  const nonGroupAccounts = (coaData ?? []).filter((a: any) => !a.isGroup);

  const selectedItem = items.find((i: any) => i.id === form.itemId);

  const itemOptions = useMemo((): ComboboxOption[] =>
    items.map((i: any) => ({ value: i.id, label: `${i.code} — ${i.name} (${i.unit})` })),
    [items],
  );

  const accountOptions = useMemo((): ComboboxOption[] =>
    nonGroupAccounts.map((a: any) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [nonGroupAccounts],
  );

  const qty = Number(form.quantity) || 0;
  const unitCost = Number(form.unitCost) || 0;
  const totalValue = qty * unitCost;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items-active'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/movements', data),
    onSuccess: () => {
      invalidateAll();
      toast.success('Gerakan stok berhasil dicatat.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal mencatat gerakan stok.';
      setError(msg);
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/inventory/movements/${editMovement?.id}`, data),
    onSuccess: () => {
      invalidateAll();
      toast.success('Gerakan stok berhasil diperbarui.');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal mengupdate gerakan stok.';
      setError(msg);
      toast.error(msg);
    },
  });

  const mutation = isEdit ? updateMutation : createMutation;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Same constraints the native `required` / `min` attributes enforced before.
    if (!form.date || !(Number(form.quantity) >= 0.001)) {
      setShowErrors(true);
      return;
    }

    const payload: any = {
      date: form.date,
      movementType: form.movementType,
      quantity: Number(form.quantity),
      unitCost: unitCost,
      offsetAccountId: form.offsetAccountId || undefined,
      referenceType: form.referenceType || undefined,
      referenceNumber: form.referenceNumber || undefined,
      notes: form.notes || undefined,
    };

    if (!isEdit) {
      payload.itemId = form.itemId;
      payload.warehouseId = form.warehouseId || undefined;
    }

    mutation.mutate(payload);
  };

  const isProductionLinked = editMovement?.referenceType === 'ProductionRun';
  const pending = mutation.isPending;
  const stockItem = selectedItem || editMovement?.item;
  const dateError = showErrors && !form.date ? 'Tanggal wajib diisi.' : undefined;
  const qtyError = showErrors && !(Number(form.quantity) >= 0.001) ? 'Kuantitas minimal 0,001.' : undefined;
  const offsetMissing = totalValue > 0 && !form.offsetAccountId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="md" className={pinnedDialogClass}>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <PinnedHeader>
            <DialogTitle>{isEdit ? 'Edit Gerakan Stok' : 'Catat Gerakan Stok'}</DialogTitle>
            <DialogDescription>
              Pergerakan stok masuk, keluar, atau penyesuaian beserta posting ke COA.
            </DialogDescription>
          </PinnedHeader>
          <PinnedBody className="grid gap-4">
            {isProductionLinked && (
              <p role="status" className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-text">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                Gerakan stok dari proses produksi tidak dapat diedit langsung.
              </p>
            )}

            <Field label="Tanggal" required error={dateError}>
              <DateInput
                value={form.date}
                onChange={(v) => setForm(f => ({ ...f, date: v }))}
                disabled={isProductionLinked}
              />
            </Field>

            {isEdit ? (
              <Field label="Item" required>
                <Input
                  readOnly
                  value={editMovement?.item ? `${editMovement.item.code} — ${editMovement.item.name} (${editMovement.item.unit})` : ''}
                  className="bg-muted"
                />
              </Field>
            ) : (
              <ComboboxField
                label="Item"
                required
                options={itemOptions}
                value={form.itemId}
                onChange={(v) => setForm(f => ({ ...f, itemId: v }))}
                placeholder="— Pilih Item —"
              />
            )}

            {isEdit ? (
              <Field label="Gudang" hint="Gudang tidak dapat dipindah lewat edit.">
                <Input readOnly value={editMovement?.warehouse?.name ?? '—'} className="bg-muted" />
              </Field>
            ) : (
              <WarehouseSelectField
                value={form.warehouseId}
                onChange={(v) => setForm(f => ({ ...f, warehouseId: v }))}
                autoDefault
              />
            )}

            <Field label="Tipe Gerakan" required>
              {(control) => (
                <Select
                  value={form.movementType}
                  onValueChange={(v) => setForm(f => ({ ...f, movementType: v as typeof form.movementType }))}
                  disabled={isProductionLinked}
                >
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="In">Masuk (In)</SelectItem>
                    <SelectItem value="Out">Keluar (Out)</SelectItem>
                    <SelectItem value="AdjustmentIn">Penyesuaian Naik (AdjustmentIn)</SelectItem>
                    <SelectItem value="AdjustmentOut">Penyesuaian Turun (AdjustmentOut)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Kuantitas"
                required
                error={qtyError}
                hint={
                  stockItem
                    ? `${!isEdit && form.warehouseId ? 'Stok di gudang ini' : 'Stok saat ini'}: ${Number(stockItem.currentStock ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${stockItem.unit ?? ''}`
                    : undefined
                }
              >
                <NumberInput
                  min={0.001}
                  step="any"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  disabled={isProductionLinked}
                  placeholder="0"
                  className="h-10 text-right tabular-nums"
                />
              </Field>
              <Field label="Harga Satuan">
                <NumberInput
                  min={0}
                  step="any"
                  value={form.unitCost}
                  onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))}
                  disabled={isProductionLinked}
                  placeholder="0"
                  className="h-10 text-right tabular-nums"
                />
              </Field>
            </div>

            <Field label="Total Nilai">
              <Input
                readOnly
                value={totalValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                className="bg-muted text-right tabular-nums"
              />
            </Field>

            <ComboboxField
              label={totalValue > 0 ? 'Akun Lawan' : 'Akun Lawan (opsional)'}
              required={totalValue > 0}
              options={accountOptions}
              value={form.offsetAccountId}
              onChange={(v) => setForm(f => ({ ...f, offsetAccountId: v }))}
              placeholder="— Pilih Akun Lawan —"
              disabled={isProductionLinked}
              hint={
                offsetMissing
                  ? 'Pilih akun lawan agar nilai stok tercatat di COA.'
                  : 'Untuk posting ke COA.'
              }
            />

            <Field label="Tipe Referensi">
              {(control) => (
                <Select
                  value={form.referenceType || '__none'}
                  onValueChange={(v) =>
                    setForm(f => ({ ...f, referenceType: v === '__none' ? '' : v, referenceNumber: '' }))
                  }
                  disabled={isProductionLinked}
                >
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Tidak Ada —</SelectItem>
                    <SelectItem value="PurchaseInvoice">Invoice Pembelian</SelectItem>
                    <SelectItem value="SalesInvoice">Invoice Penjualan</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {form.referenceType && (
              <Field label="Nomor Referensi">
                <Input
                  value={form.referenceNumber}
                  onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  disabled={isProductionLinked}
                  placeholder="Nomor dokumen referensi"
                />
              </Field>
            )}

            <Field label="Catatan">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                disabled={isProductionLinked}
                placeholder="Catatan opsional tentang gerakan stok ini"
                className="resize-none"
              />
            </Field>

            <FormError message={error} />
          </PinnedBody>
          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            {!isProductionLinked && (
              <Button type="submit" loading={pending}>
                {pending ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Simpan Gerakan'}
              </Button>
            )}
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

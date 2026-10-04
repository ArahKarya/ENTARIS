import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared';
import { FormModal } from '@/components/ga/maintenance/form-modal';
import { apiErrorMessage, type MrItemDraft, type InventoryItemOpt } from './types';

interface AssetOpt {
  id: string;
  code: string;
  name: string;
}

const emptyItem = (): MrItemDraft => ({ inventoryItemId: null, itemName: '', sku: '', uom: '', quantity: 1, notes: '' });

function itemError(it: MrItemDraft): string | undefined {
  if (!it.itemName.trim()) return 'Nama barang wajib diisi.';
  if (!it.uom.trim()) return 'Satuan (UOM) wajib diisi.';
  if (!(Number(it.quantity) > 0)) return 'Qty harus lebih dari 0.';
  return undefined;
}

/**
 * Modal buat Material Request. Dua mode:
 *  - Standalone: user pilih aset + isi item.
 *  - Dari Work Order (woContext diisi): aset terkunci dari WO, POST ke
 *    /from-work-order/:workOrderId.
 */
export function CreateMrModal({
  woContext,
  onClose,
}: {
  woContext?: { workOrderId: string; assetId: string | null; woCode: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: assets = [], isLoading: loadingAssets } = useQuery<AssetOpt[]>({
    queryKey: ['ga-assets-mr'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500 } })).data,
    enabled: !woContext,
  });
  const { data: invItems = [] } = useQuery<InventoryItemOpt[]>({
    queryKey: ['ga-inventory-items-mr'],
    queryFn: async () => {
      const res = await api.get('/ga/inventory/items');
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
  });

  const [assetId, setAssetId] = useState<string>(woContext?.assetId ?? '');
  const [machineTarget, setMachineTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<MrItemDraft[]>([emptyItem()]);
  const [submitted, setSubmitted] = useState(false);

  const updateItem = (idx: number, patch: Partial<MrItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  // Saat pilih item inventaris existing → autofill nama/sku/uom.
  const pickInventoryItem = (idx: number, itemId: string) => {
    if (!itemId) {
      updateItem(idx, { inventoryItemId: null });
      return;
    }
    const src = invItems.find((x) => x.id === itemId);
    updateItem(idx, {
      inventoryItemId: itemId,
      itemName: src?.name ?? '',
      sku: src?.sku ?? '',
      uom: src?.uom ?? '',
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        machineTarget: machineTarget || null,
        notes: notes || null,
        items: items.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          itemName: it.itemName.trim(),
          sku: it.sku || null,
          uom: it.uom.trim(),
          quantity: Number(it.quantity),
          notes: it.notes || null,
        })),
      };
      if (woContext) {
        return api.post(`/ga/material-requests/from-work-order/${woContext.workOrderId}`, payload);
      }
      return api.post('/ga/material-requests', { ...payload, assetId: assetId || null });
    },
    onSuccess: () => {
      toast.success('Permintaan barang dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-material-requests'] });
      if (woContext) queryClient.invalidateQueries({ queryKey: ['ga-work-order', woContext.workOrderId] });
      onClose();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal membuat permintaan barang.')),
  });

  const submit = () => {
    setSubmitted(true);
    if (items.some((it) => itemError(it))) return;
    mutation.mutate();
  };

  const invOptions = invItems.map((x) => ({ value: x.id, label: `${x.sku} — ${x.name}` }));

  return (
    <FormModal
      title={woContext ? `Minta Sparepart — WO ${woContext.woCode}` : 'Buat Permintaan Barang'}
      description="Permintaan disimpan sebagai Draf; ajukan dari detail MR untuk persetujuan."
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Simpan MR"
      submitting={mutation.isPending}
    >
      {!woContext && (
        <Field label="Aset tujuan" hint="Opsional">
          {() => (
            <SearchableSelect
              options={assets.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
              value={assetId}
              onChange={setAssetId}
              placeholder={loadingAssets ? 'Memuat…' : '— Tanpa aset spesifik —'}
              allowClear
              searchable
              aria-label="Aset tujuan"
            />
          )}
        </Field>
      )}
      <Field label="Mesin / target" hint="Opsional">
        <Input value={machineTarget} onChange={(e) => setMachineTarget(e.target.value)} placeholder="Contoh: Dryer Timur, Genset 2" />
      </Field>
      <Field label="Catatan" hint="Opsional">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-sm font-medium text-foreground">
            Daftar barang <span className="text-danger-text" aria-hidden>*</span>
          </legend>
          <Button size="sm" variant="secondary" onClick={addItem}>
            <Plus aria-hidden /> Tambah baris
          </Button>
        </div>
        <ol className="space-y-3">
          {items.map((it, idx) => {
            const error = submitted ? itemError(it) : undefined;
            return (
              <li key={idx} className="space-y-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Barang #{idx + 1}</span>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(idx)}
                      aria-label={`Hapus barang #${idx + 1}`}
                      className="text-danger-text hover:bg-danger-subtle"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
                <Field label="Item inventaris GA" hint="Opsional; kosongkan untuk barang baru.">
                  {() => (
                    <SearchableSelect
                      options={invOptions}
                      value={it.inventoryItemId ?? ''}
                      onChange={(v) => pickInventoryItem(idx, v)}
                      placeholder="— Barang baru / teks bebas —"
                      allowClear
                      aria-label={`Item inventaris barang #${idx + 1}`}
                    />
                  )}
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nama barang" required className="col-span-2">
                    <Input value={it.itemName} onChange={(e) => updateItem(idx, { itemName: e.target.value })} placeholder="Contoh: V-belt B-52" />
                  </Field>
                  <Field label="SKU">
                    <Input value={it.sku} onChange={(e) => updateItem(idx, { sku: e.target.value })} />
                  </Field>
                  <Field label="Satuan" required>
                    <Input value={it.uom} onChange={(e) => updateItem(idx, { uom: e.target.value })} placeholder="pcs, set, m" />
                  </Field>
                  <Field label="Qty" required>
                    <NumberInput min={0} step="any" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  </Field>
                  <Field label="Catatan item">
                    <Input value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} />
                  </Field>
                </div>
                {error && (
                  <p role="alert" className="text-xs font-medium text-danger-text">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </fieldset>
    </FormModal>
  );
}

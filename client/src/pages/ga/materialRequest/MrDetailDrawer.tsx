import { useState } from 'react';
import { X, Loader2, Check, Send, ThumbsUp, ThumbsDown, Ban, PackageCheck, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { formatRupiah, formatDate } from '../../../lib/formatters';
import { toast } from 'sonner';
import {
  mrFieldClass as fieldClass,
  mrLabelClass as labelClass,
  MR_STATUS_LABELS,
  MR_STATUS_BADGE,
  PROC_STATUS_LABELS,
  PROC_STATUS_BADGE,
  apiErrorMessage,
  type JsonBody,
  type MrDetail,
  type MrItemDetail,
  type ProcurementStatus,
  type LocationOpt,
  type CategoryOpt,
} from './types';

const PROC_STATUSES: ProcurementStatus[] = ['REQUESTED', 'QUOTED', 'ORDERED', 'CANCELLED'];

export function MrDetailDrawer({ id, canEdit, onClose }: { id: string; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [receiveItem, setReceiveItem] = useState<MrItemDetail | null>(null);

  const { data: mr, isLoading } = useQuery<MrDetail>({
    queryKey: ['ga-material-request', id],
    queryFn: async () => (await api.get(`/ga/material-requests/${id}`)).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-material-request', id] });
    queryClient.invalidateQueries({ queryKey: ['ga-material-requests'] });
  };

  const lifecycle = useMutation({
    mutationFn: (action: { verb: string; body?: JsonBody }) =>
      api.patch(`/ga/material-requests/${id}/${action.verb}`, action.body ?? {}),
    onSuccess: () => {
      toast.success('Status permintaan diperbarui.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal memperbarui status.')),
  });

  const doReject = () => {
    const reason = window.prompt('Alasan penolakan:');
    if (reason === null) return;
    if (!reason.trim()) return toast.error('Alasan wajib diisi.');
    lifecycle.mutate({ verb: 'reject', body: { reason: reason.trim() } });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">{mr?.code ?? 'Memuat…'}</h3>
            {mr && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MR_STATUS_BADGE[mr.status]}`}>
                {MR_STATUS_LABELS[mr.status]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {isLoading || !mr ? (
          <div className="p-10 flex justify-center text-gray-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Info label="Diminta pada" value={formatDate(mr.requestedAt)} />
              <Info label="Aset" value={mr.asset ? `${mr.asset.code} — ${mr.asset.name}` : '—'} />
              <Info label="Mesin / Target" value={mr.machineTarget || '—'} />
              <Info label="Catatan" value={mr.notes || '—'} />
              {mr.approvedAt && <Info label="Disetujui" value={formatDate(mr.approvedAt)} />}
              {mr.rejectedAt && <Info label="Ditolak" value={formatDate(mr.rejectedAt)} />}
            </div>

            {mr.rejectReason && (
              <div className="text-xs text-red-700 bg-red-50 rounded-lg p-3">Alasan tolak: {mr.rejectReason}</div>
            )}

            {/* Cross-ref: WO asal */}
            {mr.workOrder && (
              <Link
                to="/ga/maintenance"
                className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg p-3"
              >
                <Link2 size={14} />
                Berasal dari Work Order <b>{mr.workOrder.code}</b> — {mr.workOrder.title}
              </Link>
            )}

            {/* Lifecycle actions */}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {mr.status === 'DRAFT' && (
                  <ActionBtn icon={<Send size={14} />} label="Ajukan" onClick={() => lifecycle.mutate({ verb: 'submit' })} disabled={lifecycle.isPending} />
                )}
                {mr.status === 'SUBMITTED' && (
                  <>
                    <ActionBtn icon={<ThumbsUp size={14} />} label="Setujui" tone="teal" onClick={() => lifecycle.mutate({ verb: 'approve' })} disabled={lifecycle.isPending} />
                    <ActionBtn icon={<ThumbsDown size={14} />} label="Tolak" tone="red" onClick={doReject} disabled={lifecycle.isPending} />
                  </>
                )}
                {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(mr.status) && (
                  <ActionBtn icon={<Ban size={14} />} label="Batalkan" tone="gray" onClick={() => lifecycle.mutate({ verb: 'cancel' })} disabled={lifecycle.isPending} />
                )}
              </div>
            )}

            {/* Items */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Barang & Pengadaan</h4>
              <div className="space-y-3">
                {mr.items.map((it) => (
                  <ItemRow
                    key={it.id}
                    mrId={mr.id}
                    mrStatus={mr.status}
                    item={it}
                    canEdit={canEdit}
                    onChanged={invalidate}
                    onReceive={() => setReceiveItem(it)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {receiveItem && mr && (
        <ReceiveModal mrId={mr.id} item={receiveItem} onClose={() => setReceiveItem(null)} onDone={invalidate} />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  tone = 'blue',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'blue' | 'teal' | 'red' | 'gray';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    teal: 'bg-teal-600 hover:bg-teal-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    gray: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50 ${tones[tone]}`}
    >
      {icon} {label}
    </button>
  );
}

/** Satu baris item MR + editor procurement inline + tombol Terima. */
function ItemRow({
  mrId,
  mrStatus,
  item,
  canEdit,
  onChanged,
  onReceive,
}: {
  mrId: string;
  mrStatus: string;
  item: MrItemDetail;
  canEdit: boolean;
  onChanged: () => void;
  onReceive: () => void;
}) {
  const [vendorName, setVendorName] = useState(item.vendorName ?? '');
  const [unitPrice, setUnitPrice] = useState<number>(Number(item.unitPrice) || 0);
  const [poNumber, setPoNumber] = useState(item.poNumber ?? '');
  const [procurementStatus, setProcurementStatus] = useState<ProcurementStatus>(item.procurementStatus);

  const procMutation = useMutation({
    mutationFn: () =>
      api.patch(`/ga/material-requests/${mrId}/items/${item.id}/procurement`, {
        vendorName: vendorName || null,
        unitPrice: Number(unitPrice) || 0,
        poNumber: poNumber || null,
        procurementStatus,
      }),
    onSuccess: () => {
      toast.success('Data pengadaan disimpan.');
      onChanged();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal menyimpan pengadaan.')),
  });

  const locked = ['RECEIVED', 'CANCELLED'].includes(item.procurementStatus) || ['REJECTED', 'CANCELLED'].includes(mrStatus);
  const canReceive = canEdit && mrStatus === 'APPROVED' && item.procurementStatus !== 'RECEIVED' && item.procurementStatus !== 'CANCELLED';

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-900">{item.itemName}</div>
          <div className="text-xs text-gray-500">
            {Number(item.quantity)} {item.uom}
            {item.sku ? ` · SKU ${item.sku}` : ''}
            {item.inventoryItem ? ` · tertaut ${item.inventoryItem.sku}` : ' · belum tertaut inventaris'}
          </div>
          {item.procurementStatus === 'RECEIVED' && (
            <div className="text-xs text-green-700 mt-0.5">
              Diterima {Number(item.receivedQty)} {item.uom} → {item.receivedIntoLocation?.name ?? '—'} ({formatDate(item.receivedAt)})
            </div>
          )}
        </div>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${PROC_STATUS_BADGE[item.procurementStatus]}`}>
          {PROC_STATUS_LABELS[item.procurementStatus]}
        </span>
      </div>

      {canEdit && !locked && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={labelClass}>Vendor</label>
            <input className={fieldClass} value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Harga Satuan</label>
            <input type="number" min={0} step="any" className={fieldClass} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} />
          </div>
          <div>
            <label className={labelClass}>No. PO (manual)</label>
            <input className={fieldClass} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Status Pengadaan</label>
            <select className={fieldClass} value={procurementStatus} onChange={(e) => setProcurementStatus(e.target.value as ProcurementStatus)}>
              {PROC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROC_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400">Total: {formatRupiah(Number(unitPrice) * Number(item.quantity))}</span>
            <div className="flex gap-2">
              <button
                onClick={() => procMutation.mutate()}
                disabled={procMutation.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
              >
                {procMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Simpan
              </button>
              {canReceive && (
                <button
                  onClick={onReceive}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
                >
                  <PackageCheck size={12} /> Terima Barang
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Modal terima barang → tambah stok GA. */
function ReceiveModal({
  mrId,
  item,
  onClose,
  onDone,
}: {
  mrId: string;
  item: MrItemDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: locations = [] } = useQuery<LocationOpt[]>({
    queryKey: ['ga-locations-mr'],
    queryFn: async () => (await api.get('/ga/master/locations')).data,
  });
  const { data: categories = [] } = useQuery<CategoryOpt[]>({
    queryKey: ['ga-inv-categories-mr'],
    queryFn: async () => (await api.get('/ga/master/inventory-categories')).data,
  });

  const needsLink = !item.inventoryItemId; // item belum tertaut → butuh pilih/buat item
  const [locationId, setLocationId] = useState('');
  const [receivedQty, setReceivedQty] = useState<number>(Number(item.quantity) || 1);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [existingItemId, setExistingItemId] = useState('');
  const [newSku, setNewSku] = useState(item.sku ?? '');
  const [categoryId, setCategoryId] = useState('');

  const { data: invItems = [] } = useQuery<{ id: string; sku: string; name: string }[]>({
    queryKey: ['ga-inventory-items-mr-receive'],
    queryFn: async () => (await api.get('/ga/inventory/items')).data,
    enabled: needsLink,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: JsonBody = { receivedQty: Number(receivedQty), locationId };
      if (needsLink) {
        if (mode === 'existing') body.inventoryItemId = existingItemId;
        else body.newItem = { sku: newSku.trim(), categoryId };
      }
      return api.patch(`/ga/material-requests/${mrId}/items/${item.id}/receive`, body);
    },
    onSuccess: () => {
      toast.success('Barang diterima & stok bertambah.');
      onDone();
      onClose();
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal menerima barang.')),
  });

  const submit = () => {
    if (!locationId) return toast.error('Lokasi gudang wajib dipilih.');
    if (!(Number(receivedQty) > 0)) return toast.error('Qty diterima harus lebih dari 0.');
    if (needsLink) {
      if (mode === 'existing' && !existingItemId) return toast.error('Pilih item inventaris.');
      if (mode === 'new' && (!newSku.trim() || !categoryId)) return toast.error('SKU dan kategori wajib untuk item baru.');
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Terima Barang — {item.itemName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Qty Diterima *</label>
            <input type="number" min={0} step="any" className={fieldClass} value={receivedQty} onChange={(e) => setReceivedQty(Number(e.target.value))} />
          </div>
          <div>
            <label className={labelClass}>Lokasi Gudang Tujuan *</label>
            <select className={fieldClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— Pilih lokasi —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>

          {needsLink && (
            <div className="border border-gray-200 rounded-lg p-3 space-y-3">
              <p className="text-xs text-gray-500">
                Item ini belum tertaut ke inventaris GA. Pilih item yang sudah ada, atau buat item inventaris baru agar stok bisa ditambahkan.
              </p>
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => setMode('new')}
                  className={`flex-1 py-1.5 rounded-lg ${mode === 'new' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Buat baru
                </button>
                <button
                  onClick={() => setMode('existing')}
                  className={`flex-1 py-1.5 rounded-lg ${mode === 'existing' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Pilih existing
                </button>
              </div>
              {mode === 'existing' ? (
                <div>
                  <label className={labelClass}>Item Inventaris</label>
                  <select className={fieldClass} value={existingItemId} onChange={(e) => setExistingItemId(e.target.value)}>
                    <option value="">— Pilih item —</option>
                    {invItems.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.sku} — {x.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>SKU Baru *</label>
                    <input className={fieldClass} value={newSku} onChange={(e) => setNewSku(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Kategori *</label>
                    <select className={fieldClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">— Pilih —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
              Batal
            </button>
            <button
              onClick={submit}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Terima & Tambah Stok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

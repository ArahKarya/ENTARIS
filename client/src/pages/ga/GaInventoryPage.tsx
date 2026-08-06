import { useState, useMemo } from 'react';
import {
  Search,
  Package,
  Loader2,
  Plus,
  Pencil,
  ArrowLeftRight,
  AlertTriangle,
  X,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatDate } from '../../lib/formatters';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';

// GA Inventory — sparepart/consumable stock milik General Affairs,
// TERPISAH dari persediaan akuntansi ERP (tanpa jurnal/GL).
// Endpoint base: /ga/inventory.

type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT';

interface CategoryOption {
  id: string;
  code: string;
  name: string;
  type?: 'SPAREPART' | 'CONSUMABLE';
}

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  uom: string;
  minStock: number;
  imagePath?: string | null;
  isActive: boolean;
  totalStock: number;
  lowStock: boolean;
  category?: { code: string; name: string; type?: string };
}

interface Movement {
  id: string;
  type: MovementType;
  quantity: number;
  referenceNo?: string | null;
  notes?: string | null;
  createdAt: string;
  item?: { sku: string; name: string; uom: string };
  fromLocation?: { code: string; name: string } | null;
  toLocation?: { code: string; name: string } | null;
}

interface ItemFormState {
  sku: string;
  name: string;
  categoryId: string;
  uom: string;
  minStock: string;
}

interface MovementFormState {
  itemId: string;
  type: MovementType;
  quantity: string;
  fromLocationId: string;
  toLocationId: string;
  referenceNo: string;
  notes: string;
}

const MOVEMENT_LABEL: Record<MovementType, string> = {
  IN: 'Masuk',
  OUT: 'Keluar',
  TRANSFER: 'Transfer',
  ADJUSTMENT: 'Penyesuaian',
};

const MOVEMENT_BADGE: Record<MovementType, string> = {
  IN: 'badge-green',
  OUT: 'badge-red',
  TRANSFER: 'badge-blue',
  ADJUSTMENT: 'badge-yellow',
};

const EMPTY_ITEM: ItemFormState = { sku: '', name: '', categoryId: '', uom: '', minStock: '0' };

const EMPTY_MOVEMENT: MovementFormState = {
  itemId: '',
  type: 'IN',
  quantity: '',
  fromLocationId: '',
  toLocationId: '',
  referenceNo: '',
  notes: '',
};

export const GaInventoryPage = () => {
  const [tab, setTab] = useState<'items' | 'movements'>('items');
  const [searchTerm, setSearchTerm] = useState('');

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementForm, setMovementForm] = useState<MovementFormState>(EMPTY_MOVEMENT);

  const queryClient = useQueryClient();
  const canEdit = can('ga_inventory', 'edit');

  const { data: categories = [] } = useQuery<CategoryOption[]>({
    queryKey: ['ga-inventory-categories'],
    queryFn: async () => (await api.get('/ga/master/inventory-categories')).data,
  });

  const { data: locations = [] } = useQuery<LocationOption[]>({
    queryKey: ['ga-locations'],
    queryFn: async () => (await api.get('/ga/master/locations')).data,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: ['ga-inventory-items'],
    queryFn: async () => (await api.get('/ga/inventory/items')).data,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery<Movement[]>({
    queryKey: ['ga-inventory-movements'],
    queryFn: async () => (await api.get('/ga/inventory/movements')).data,
  });

  const invalidateItems = () =>
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-items'] });
  const invalidateMovements = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-movements'] });
    invalidateItems();
  };

  const saveItemMutation = useMutation({
    mutationFn: async (payload: ItemFormState & { id?: string }) => {
      const body = {
        sku: payload.sku,
        name: payload.name,
        categoryId: payload.categoryId,
        uom: payload.uom,
        minStock: Number(payload.minStock) || 0,
      };
      if (payload.id) return api.put(`/ga/inventory/items/${payload.id}`, body);
      return api.post('/ga/inventory/items', body);
    },
    onSuccess: async (res: any) => {
      const itemId = editItem?.id ?? res?.data?.id;
      try {
        if (itemId && imageFile) {
          const fd = new FormData();
          fd.append('image', imageFile);
          await api.post(`/ga/inventory/items/${itemId}/image`, fd);
        } else if (itemId && removeImage) {
          await api.delete(`/ga/inventory/items/${itemId}/image`);
        }
      } catch {
        toast.error('Item tersimpan, tapi gambar gagal diupload.');
      }
      toast.success(editItem ? 'Item diperbarui.' : 'Item dibuat.');
      setIsItemModalOpen(false);
      resetImageState();
      invalidateItems();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menyimpan item.'),
  });

  const createMovementMutation = useMutation({
    mutationFn: async (payload: MovementFormState) => {
      const body = {
        itemId: payload.itemId,
        type: payload.type,
        quantity: Number(payload.quantity),
        fromLocationId: payload.fromLocationId || null,
        toLocationId: payload.toLocationId || null,
        referenceNo: payload.referenceNo || null,
        notes: payload.notes || null,
      };
      return api.post('/ga/inventory/movements', body);
    },
    onSuccess: () => {
      toast.success('Pergerakan dicatat.');
      setIsMovementModalOpen(false);
      invalidateMovements();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal mencatat pergerakan.'),
  });

  const resetImageState = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(false);
  };

  const handleImagePick = (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Ukuran gambar maksimal 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return toast.error('Format gambar harus JPG, PNG, atau WEBP.');
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const openCreateItem = () => {
    setEditItem(null);
    setItemForm(EMPTY_ITEM);
    resetImageState();
    setIsItemModalOpen(true);
  };

  const openEditItem = (it: InventoryItem) => {
    setEditItem(it);
    setItemForm({
      sku: it.sku,
      name: it.name,
      categoryId: '',
      uom: it.uom,
      minStock: String(it.minStock),
    });
    resetImageState();
    setIsItemModalOpen(true);
  };

  const openCreateMovement = () => {
    setMovementForm(EMPTY_MOVEMENT);
    setIsMovementModalOpen(true);
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.sku.trim()) return toast.error('SKU wajib diisi.');
    if (!itemForm.name.trim()) return toast.error('Nama wajib diisi.');
    if (!itemForm.categoryId) return toast.error('Kategori wajib dipilih.');
    if (!itemForm.uom.trim()) return toast.error('Satuan wajib diisi.');
    saveItemMutation.mutate({ ...itemForm, id: editItem?.id });
  };

  const needsFrom = movementForm.type === 'OUT' || movementForm.type === 'TRANSFER';
  const needsTo =
    movementForm.type === 'IN' ||
    movementForm.type === 'TRANSFER' ||
    movementForm.type === 'ADJUSTMENT';

  const handleMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementForm.itemId) return toast.error('Item wajib dipilih.');
    const qty = Number(movementForm.quantity);
    if (!qty || qty <= 0) return toast.error('Qty harus lebih dari 0.');
    if (needsFrom && !movementForm.fromLocationId) return toast.error('Lokasi asal wajib dipilih.');
    if (needsTo && !movementForm.toLocationId) return toast.error('Lokasi tujuan wajib dipilih.');
    createMovementMutation.mutate(movementForm);
  };

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const q = searchTerm.toLowerCase();
    return items.filter(
      (it) => it.sku?.toLowerCase().includes(q) || it.name?.toLowerCase().includes(q),
    );
  }, [items, searchTerm]);

  const lowStockCount = useMemo(() => items.filter((it) => it.lowStock).length, [items]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory GA</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stok sparepart & consumable General Affairs (terpisah dari persediaan akuntansi).
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2 self-start">
            {tab === 'items' ? (
              <button className="btn-primary" onClick={openCreateItem}>
                <Plus size={15} /> Item Baru
              </button>
            ) : (
              <button className="btn-primary" onClick={openCreateMovement}>
                <ArrowLeftRight size={15} /> Catat Pergerakan
              </button>
            )}
          </div>
        )}
      </div>

      {lowStockCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <AlertTriangle size={15} />
          {lowStockCount} item di bawah stok minimum.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('items')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'items'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          Item
        </button>
        <button
          onClick={() => setTab('movements')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            tab === 'movements'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-gray-500 hover:text-gray-700',
          )}
        >
          Pergerakan
        </button>
      </div>

      {tab === 'items' && (
        <>
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cari SKU atau nama..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="w-14">Foto</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Nama</th>
                    <th scope="col">Kategori</th>
                    <th scope="col">Satuan</th>
                    <th scope="col" className="text-right">Total Stok</th>
                    <th scope="col" className="text-center">Status</th>
                    {canEdit && <th scope="col" className="w-12"></th>}
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="py-16 text-center text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                        Memuat data item...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 8 : 7} className="py-16 text-center">
                        <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Belum ada item.</p>
                        {canEdit && (
                          <button
                            onClick={openCreateItem}
                            className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium"
                          >
                            + Tambah item pertama
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.imagePath ? (
                            <img
                              src={`/uploads/${it.imagePath}`}
                              alt={it.name}
                              onClick={() => setPreviewImage(`/uploads/${it.imagePath}`)}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200 cursor-zoom-in"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300">
                              <Package size={16} />
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                            {it.sku}
                          </span>
                        </td>
                        <td className="font-medium text-gray-800">{it.name}</td>
                        <td className="text-gray-600">{it.category?.name ?? '—'}</td>
                        <td className="text-gray-500">{it.uom}</td>
                        <td className="text-right font-mono font-medium text-gray-900 tabular-nums">
                          {it.totalStock}
                        </td>
                        <td className="text-center">
                          {it.lowStock ? (
                            <span className="badge badge-red">Stok rendah</span>
                          ) : (
                            <span className="badge badge-green">Aman</span>
                          )}
                        </td>
                        {canEdit && (
                          <td>
                            <button
                              onClick={() => openEditItem(it)}
                              className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'movements' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col" className="text-center">Tipe</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="text-right">Qty</th>
                  <th scope="col">Dari</th>
                  <th scope="col">Ke</th>
                  <th scope="col">Referensi</th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                      Memuat data pergerakan...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <ArrowLeftRight className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Belum ada pergerakan.</p>
                      {canEdit && (
                        <button
                          onClick={openCreateMovement}
                          className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium"
                        >
                          + Catat pergerakan pertama
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id}>
                      <td className="text-gray-500 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                      <td className="text-center">
                        <span className={cn('badge', MOVEMENT_BADGE[m.type])}>
                          {MOVEMENT_LABEL[m.type]}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{m.item?.name ?? '—'}</span>
                        {m.item?.sku && (
                          <span className="block text-[11px] text-gray-400 font-mono">{m.item.sku}</span>
                        )}
                      </td>
                      <td className="text-right font-mono font-medium text-gray-900 tabular-nums">
                        {m.quantity} {m.item?.uom ?? ''}
                      </td>
                      <td className="text-gray-600 text-xs">
                        {m.fromLocation ? m.fromLocation.name : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-gray-600 text-xs">
                        {m.toLocation ? m.toLocation.name : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-gray-500 text-xs">
                        {m.referenceNo || <span className="text-gray-300">—</span>}
                        {m.notes && <span className="block text-[11px] text-gray-400">{m.notes}</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item modal */}
      {isItemModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsItemModalOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editItem ? 'Edit Item' : 'Item Baru'}
              </h2>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleItemSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Satuan (UoM) *</label>
                  <input
                    type="text"
                    value={itemForm.uom}
                    onChange={(e) => setItemForm((f) => ({ ...f, uom: e.target.value }))}
                    placeholder="pcs, box, liter..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kategori *</label>
                  <select
                    value={itemForm.categoryId}
                    onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Pilih kategori...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stok Minimum</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={itemForm.minStock}
                    onChange={(e) => setItemForm((f) => ({ ...f, minStock: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              {editItem && (
                <p className="text-xs text-gray-400">
                  Catatan: kategori hanya bisa diatur ulang dengan memilih ulang dari daftar.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gambar Item</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : editItem?.imagePath && !removeImage ? (
                      <img
                        src={`/uploads/${editItem.imagePath}`}
                        alt={editItem.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={22} className="text-gray-300" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors">
                      <ImagePlus size={14} />
                      {imagePreview || (editItem?.imagePath && !removeImage) ? 'Ganti Gambar' : 'Pilih Gambar'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          handleImagePick(e.target.files?.[0] ?? null);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {(imagePreview || (editItem?.imagePath && !removeImage)) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (imagePreview) URL.revokeObjectURL(imagePreview);
                          setImageFile(null);
                          setImagePreview(null);
                          setRemoveImage(true);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={13} /> Hapus gambar
                      </button>
                    )}
                    <span className="text-[11px] text-gray-400">JPG/PNG/WEBP, maks 5 MB.</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsItemModalOpen(false);
                    resetImageState();
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button type="submit" disabled={saveItemMutation.isPending} className="btn-primary">
                  {saveItemMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement modal */}
      {isMovementModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMovementModalOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Catat Pergerakan</h2>
              <button
                onClick={() => setIsMovementModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleMovementSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                <select
                  value={movementForm.itemId}
                  onChange={(e) => setMovementForm((f) => ({ ...f, itemId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Pilih item...</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.sku} · {it.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipe *</label>
                  <select
                    value={movementForm.type}
                    onChange={(e) =>
                      setMovementForm((f) => ({ ...f, type: e.target.value as MovementType }))
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => (
                      <option key={t} value={t}>
                        {MOVEMENT_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qty *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={movementForm.quantity}
                    onChange={(e) => setMovementForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lokasi Asal {needsFrom && '*'}
                  </label>
                  <select
                    value={movementForm.fromLocationId}
                    onChange={(e) =>
                      setMovementForm((f) => ({ ...f, fromLocationId: e.target.value }))
                    }
                    disabled={!needsFrom}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Pilih lokasi...</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lokasi Tujuan {needsTo && '*'}
                  </label>
                  <select
                    value={movementForm.toLocationId}
                    onChange={(e) =>
                      setMovementForm((f) => ({ ...f, toLocationId: e.target.value }))
                    }
                    disabled={!needsTo}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">Pilih lokasi...</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. Referensi</label>
                <input
                  type="text"
                  value={movementForm.referenceNo}
                  onChange={(e) => setMovementForm((f) => ({ ...f, referenceNo: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={movementForm.notes}
                  onChange={(e) => setMovementForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMovementMutation.isPending}
                  className="btn-primary"
                >
                  {createMovementMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6 cursor-zoom-out"
        >
          <img
            src={previewImage}
            alt="Pratinjau gambar item"
            className="max-w-full max-h-full rounded-lg shadow-xl"
          />
        </div>
      )}
    </div>
  );
};

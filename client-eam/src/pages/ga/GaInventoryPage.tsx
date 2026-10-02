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
  LayoutDashboard,
  Wrench,
  Download,
  ClipboardCheck,
  MapPin,
  Boxes,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatDate } from '../../lib/formatters';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';

// URL gambar item: dilayani backend (bukan static /uploads).
// imagePath dipakai sbg cache-buster supaya ganti gambar langsung terlihat.
const itemImageUrl = (id: string, imagePath?: string | null) =>
  `${api.defaults.baseURL ?? '/api'}/ga/inventory/items/${id}/image?v=${encodeURIComponent(imagePath ?? '')}`;

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

interface DashboardData {
  summary: {
    totalItems: number;
    activeItems: number;
    totalQty: number;
    lowStockCount: number;
    outOfStockCount: number;
    locationCount: number;
    categoryCount: number;
    movements30d: number;
    itemsMoved30d: number;
  };
  movementTotals: Record<MovementType, { count: number; qty: number }>;
  byCategory: { name: string; type: string; items: number; qty: number }[];
  byLocation: { code: string; name: string; items: number; qty: number }[];
  lowStockItems: {
    id: string; sku: string; name: string; uom: string; category: string;
    totalStock: number; minStock: number; shortfall: number;
  }[];
  recentMovements: Movement[];
}

interface OpnameFormState {
  itemId: string;
  locationId: string;
  quantity: string;
  notes: string;
}

const EMPTY_ITEM: ItemFormState = { sku: '', name: '', categoryId: '', uom: '', minStock: '0' };

const EMPTY_OPNAME: OpnameFormState = { itemId: '', locationId: '', quantity: '', notes: '' };

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
  const [tab, setTab] = useState<'dashboard' | 'items' | 'movements' | 'tools'>('dashboard');
  const [searchTerm, setSearchTerm] = useState('');

  const [isOpnameModalOpen, setIsOpnameModalOpen] = useState(false);
  const [opnameForm, setOpnameForm] = useState<OpnameFormState>(EMPTY_OPNAME);
  const [exporting, setExporting] = useState<string | null>(null);

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

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<DashboardData>({
    queryKey: ['ga-inventory-dashboard'],
    queryFn: async () => (await api.get('/ga/inventory/dashboard')).data,
  });

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-items'] });
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-dashboard'] });
  };
  const invalidateMovements = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-movements'] });
    queryClient.invalidateQueries({ queryKey: ['ga-inventory-dashboard'] });
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

  const opnameMutation = useMutation({
    mutationFn: async (payload: OpnameFormState) =>
      api.post('/ga/inventory/stock-set', {
        itemId: payload.itemId,
        locationId: payload.locationId,
        quantity: Number(payload.quantity),
        notes: payload.notes || null,
      }),
    onSuccess: (res: any) => {
      const d = res?.data;
      if (d && d.changed === false) toast.info('Stok sudah sesuai, tidak ada penyesuaian.');
      else
        toast.success(
          `Opname tersimpan. ${d?.before ?? '?'} → ${d?.after ?? '?'} (selisih ${d?.delta > 0 ? '+' : ''}${d?.delta ?? 0}).`,
        );
      setIsOpnameModalOpen(false);
      setOpnameForm(EMPTY_OPNAME);
      invalidateMovements();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menyimpan opname.'),
  });

  // Detail item terpilih di form opname → tampilkan stok sistem & selisih.
  const { data: opnameItemDetail } = useQuery<{
    stocks: { quantity: number; location: { id: string; code: string; name: string } }[];
  }>({
    queryKey: ['ga-inventory-item-detail', opnameForm.itemId],
    queryFn: async () => (await api.get(`/ga/inventory/items/${opnameForm.itemId}`)).data,
    enabled: Boolean(opnameForm.itemId) && isOpnameModalOpen,
  });

  const opnameSelected = useMemo(
    () => items.find((it) => it.id === opnameForm.itemId) ?? null,
    [items, opnameForm.itemId],
  );

  const opnameCurrentStock = useMemo(() => {
    if (!opnameForm.locationId || !opnameItemDetail?.stocks) return 0;
    const row = opnameItemDetail.stocks.find((s) => s.location?.id === opnameForm.locationId);
    return row ? Number(row.quantity) : 0;
  }, [opnameItemDetail, opnameForm.locationId]);

  const opnameDelta =
    opnameForm.quantity === '' ? 0 : Number(opnameForm.quantity) - opnameCurrentStock;

  const handleExport = async (type: 'items' | 'movements') => {
    setExporting(type);
    try {
      const res = await api.get(`/ga/inventory/export?type=${type}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ga-inventory-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('File CSV diunduh.');
    } catch {
      toast.error('Gagal mengunduh file.');
    } finally {
      setExporting(null);
    }
  };

  const handleOpnameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opnameForm.itemId) return toast.error('Item wajib dipilih.');
    if (!opnameForm.locationId) return toast.error('Lokasi wajib dipilih.');
    if (opnameForm.quantity === '' || Number(opnameForm.quantity) < 0)
      return toast.error('Stok hasil hitung wajib diisi (tidak boleh negatif).');
    opnameMutation.mutate(opnameForm);
  };

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
        {canEdit && (tab === 'items' || tab === 'movements') && (
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

      {locations.length === 0 && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Belum ada <strong>Lokasi Gudang</strong>. Stok tidak bisa diinput sampai lokasi dibuat —
            buka menu <strong>GA · Master Data → tab Lokasi</strong> lalu tambah minimal satu lokasi
            (mis. GD-SPAREPART).
          </span>
        </div>
      )}

      {lowStockCount > 0 && tab !== 'dashboard' && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <AlertTriangle size={15} />
          {lowStockCount} item di bawah stok minimum.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {([
          { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { key: 'items', label: 'Item', icon: Package },
          { key: 'movements', label: 'Pergerakan', icon: ArrowLeftRight },
          { key: 'tools', label: 'Tools', icon: Wrench },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap',
              tab === key
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Dashboard ───────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <>
          {dashboardLoading || !dashboard ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
              Memuat ringkasan stok...
            </div>
          ) : (
            <>
              {/* Kartu ringkasan */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Total Item',
                    value: dashboard.summary.totalItems.toLocaleString('id-ID'),
                    sub: `${dashboard.summary.activeItems} aktif`,
                    icon: Package,
                    color: 'text-teal-600 bg-teal-50',
                  },
                  {
                    label: 'Total Kuantitas',
                    value: dashboard.summary.totalQty.toLocaleString('id-ID'),
                    sub: `${dashboard.summary.locationCount} lokasi`,
                    icon: Boxes,
                    color: 'text-blue-600 bg-blue-50',
                  },
                  {
                    label: 'Stok Rendah',
                    value: dashboard.summary.lowStockCount.toLocaleString('id-ID'),
                    sub: `${dashboard.summary.outOfStockCount} habis`,
                    icon: AlertTriangle,
                    color:
                      dashboard.summary.lowStockCount > 0
                        ? 'text-amber-600 bg-amber-50'
                        : 'text-gray-400 bg-gray-50',
                  },
                  {
                    label: 'Mutasi 30 Hari',
                    value: dashboard.summary.movements30d.toLocaleString('id-ID'),
                    sub: `${dashboard.summary.itemsMoved30d} item bergerak`,
                    icon: TrendingUp,
                    color: 'text-violet-600 bg-violet-50',
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3.5 flex items-start gap-3"
                  >
                    <span className={cn('p-2 rounded-lg shrink-0', c.color)}>
                      <c.icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">
                        {c.label}
                      </p>
                      <p className="text-xl font-semibold text-gray-900 tabular-nums leading-tight mt-0.5">
                        {c.value}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{c.sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mutasi per tipe (30 hari) */}
              <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Aktivitas Mutasi — 30 Hari Terakhir
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'] as MovementType[]).map((t) => {
                    const d = dashboard.movementTotals[t] ?? { count: 0, qty: 0 };
                    return (
                      <div key={t} className="border border-gray-100 rounded-lg px-3 py-2.5">
                        <span className={cn('badge', MOVEMENT_BADGE[t])}>{MOVEMENT_LABEL[t]}</span>
                        <p className="text-lg font-semibold text-gray-900 tabular-nums mt-1.5">
                          {d.qty.toLocaleString('id-ID')}
                        </p>
                        <p className="text-[11px] text-gray-400">{d.count} transaksi</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Stok per lokasi */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <MapPin size={15} className="text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800">Stok per Lokasi</h3>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Lokasi</th>
                          <th scope="col" className="text-right">Item</th>
                          <th scope="col" className="text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.byLocation.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-sm text-gray-400">
                              Belum ada lokasi.
                            </td>
                          </tr>
                        ) : (
                          dashboard.byLocation.map((l) => (
                            <tr key={l.code}>
                              <td>
                                <span className="font-medium text-gray-800">{l.name}</span>
                                <span className="block text-[11px] text-gray-400 font-mono">
                                  {l.code}
                                </span>
                              </td>
                              <td className="text-right text-gray-600 tabular-nums">{l.items}</td>
                              <td className="text-right font-mono font-medium text-gray-900 tabular-nums">
                                {l.qty.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stok per kategori */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Boxes size={15} className="text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800">Stok per Kategori</h3>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th scope="col">Kategori</th>
                          <th scope="col" className="text-right">Item</th>
                          <th scope="col" className="text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.byCategory.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-sm text-gray-400">
                              Belum ada kategori terpakai.
                            </td>
                          </tr>
                        ) : (
                          dashboard.byCategory.map((c) => (
                            <tr key={c.name}>
                              <td>
                                <span className="font-medium text-gray-800">{c.name}</span>
                                <span className="block text-[11px] text-gray-400">{c.type}</span>
                              </td>
                              <td className="text-right text-gray-600 tabular-nums">{c.items}</td>
                              <td className="text-right font-mono font-medium text-gray-900 tabular-nums">
                                {c.qty.toLocaleString('id-ID')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Item stok rendah */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-800">
                    Item di Bawah Stok Minimum
                  </h3>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">SKU</th>
                        <th scope="col">Nama</th>
                        <th scope="col">Kategori</th>
                        <th scope="col" className="text-right">Stok</th>
                        <th scope="col" className="text-right">Minimum</th>
                        <th scope="col" className="text-right">Kurang</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.lowStockItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-gray-400">
                            Semua item aman di atas stok minimum. ✓
                          </td>
                        </tr>
                      ) : (
                        dashboard.lowStockItems.map((it) => (
                          <tr key={it.id}>
                            <td className="font-mono text-xs text-gray-600">{it.sku}</td>
                            <td className="font-medium text-gray-800">{it.name}</td>
                            <td className="text-gray-500 text-xs">{it.category}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">
                              {it.totalStock.toLocaleString('id-ID')} {it.uom}
                            </td>
                            <td className="text-right font-mono tabular-nums text-gray-500">
                              {it.minStock.toLocaleString('id-ID')}
                            </td>
                            <td className="text-right font-mono tabular-nums font-semibold text-amber-600">
                              {it.shortfall.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mutasi terakhir */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={15} className="text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800">Mutasi Terakhir</h3>
                  </div>
                  <button
                    onClick={() => setTab('movements')}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Lihat semua →
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Tanggal</th>
                        <th scope="col" className="text-center">Tipe</th>
                        <th scope="col">Item</th>
                        <th scope="col" className="text-right">Qty</th>
                        <th scope="col">Referensi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recentMovements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-sm text-gray-400">
                            Belum ada pergerakan.
                          </td>
                        </tr>
                      ) : (
                        dashboard.recentMovements.map((m) => (
                          <tr key={m.id}>
                            <td className="text-gray-500 whitespace-nowrap">
                              {formatDate(m.createdAt)}
                            </td>
                            <td className="text-center">
                              <span className={cn('badge', MOVEMENT_BADGE[m.type])}>
                                {MOVEMENT_LABEL[m.type]}
                              </span>
                            </td>
                            <td>
                              <span className="font-medium text-gray-800">
                                {m.item?.name ?? '—'}
                              </span>
                              {m.item?.sku && (
                                <span className="block text-[11px] text-gray-400 font-mono">
                                  {m.item.sku}
                                </span>
                              )}
                            </td>
                            <td className="text-right font-mono tabular-nums text-gray-900">
                              {m.quantity.toLocaleString('id-ID')} {m.item?.uom ?? ''}
                            </td>
                            <td className="text-gray-500 text-xs">
                              {m.referenceNo || <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Tools ───────────────────────────────────────────────── */}
      {tab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stok opname cepat */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <ClipboardCheck size={16} />
              </span>
              <h3 className="text-sm font-semibold text-gray-800">Stok Opname Cepat</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Set stok hasil hitung fisik langsung per item &amp; lokasi. Selisih terhadap stok
              sistem otomatis tercatat sebagai mutasi <strong>Penyesuaian</strong>, jadi riwayat
              tetap utuh.
            </p>
            <button
              className="btn-primary"
              disabled={!canEdit || locations.length === 0}
              onClick={() => {
                setOpnameForm(EMPTY_OPNAME);
                setIsOpnameModalOpen(true);
              }}
            >
              <ClipboardCheck size={15} /> Mulai Opname
            </button>
            {locations.length === 0 && (
              <p className="text-[11px] text-red-500 mt-2">
                Buat Lokasi Gudang dulu di GA · Master Data → tab Lokasi.
              </p>
            )}
            {!canEdit && (
              <p className="text-[11px] text-gray-400 mt-2">Butuh izin edit inventory GA.</p>
            )}
          </div>

          {/* Export CSV */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-lg bg-blue-50 text-blue-600">
                <Download size={16} />
              </span>
              <h3 className="text-sm font-semibold text-gray-800">Export Data</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">
              Unduh daftar item (lengkap stok &amp; status) atau riwayat mutasi dalam format CSV
              (pemisah titik-koma, siap dibuka di Excel).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => handleExport('items')}
                disabled={exporting !== null}
              >
                {exporting === 'items' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                Daftar Item
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleExport('movements')}
                disabled={exporting !== null}
              >
                {exporting === 'movements' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                Riwayat Mutasi
              </button>
            </div>
          </div>

          {/* Info kalkulasi stok */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-lg bg-gray-100 text-gray-500">
                <Boxes size={16} />
              </span>
              <h3 className="text-sm font-semibold text-gray-800">Cara Stok Dihitung</h3>
            </div>
            <ul className="text-xs text-gray-600 leading-relaxed space-y-1 list-disc pl-4">
              <li>
                <strong>Total Stok</strong> = penjumlahan stok semua lokasi, murni turunan dari
                mutasi. Tidak bisa diketik manual di form item.
              </li>
              <li>
                <strong>Stok Minimum</strong> hanya ambang peringatan — mengisinya tidak menambah
                stok.
              </li>
              <li>
                Menambah stok pertama kali: tab <strong>Pergerakan</strong> → Catat Pergerakan →
                tipe <strong>Masuk</strong>.
              </li>
              <li>
                Inventory GA <strong>tidak</strong> membuat jurnal/GL — terpisah dari persediaan
                akuntansi ERP.
              </li>
            </ul>
          </div>
        </div>
      )}

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
                              src={itemImageUrl(it.id, it.imagePath)}
                              alt={it.name}
                              onClick={() => setPreviewImage(itemImageUrl(it.id, it.imagePath))}
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
                        src={itemImageUrl(editItem.id, editItem.imagePath)}
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

      {/* Modal Stok Opname */}
      {isOpnameModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Stok Opname Cepat</h2>
              <button
                onClick={() => setIsOpnameModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleOpnameSubmit} className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item <span className="text-red-500">*</span>
                </label>
                <select
                  value={opnameForm.itemId}
                  onChange={(e) => setOpnameForm((f) => ({ ...f, itemId: e.target.value }))}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lokasi <span className="text-red-500">*</span>
                </label>
                <select
                  value={opnameForm.locationId}
                  onChange={(e) => setOpnameForm((f) => ({ ...f, locationId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Pilih lokasi...</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {opnameSelected && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stok sistem di lokasi ini</span>
                    <span className="font-mono font-medium text-gray-900 tabular-nums">
                      {opnameCurrentStock.toLocaleString('id-ID')} {opnameSelected.uom}
                    </span>
                  </div>
                  {opnameForm.quantity !== '' && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Selisih</span>
                      <span
                        className={cn(
                          'font-mono font-semibold tabular-nums',
                          opnameDelta === 0
                            ? 'text-gray-500'
                            : opnameDelta > 0
                              ? 'text-emerald-600'
                              : 'text-red-600',
                        )}
                      >
                        {opnameDelta > 0 ? '+' : ''}
                        {opnameDelta.toLocaleString('id-ID')} {opnameSelected.uom}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stok Hasil Hitung Fisik <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={opnameForm.quantity}
                  onChange={(e) => setOpnameForm((f) => ({ ...f, quantity: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Isi angka riil hasil hitung di gudang. Selisih dicatat sebagai mutasi Penyesuaian.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={opnameForm.notes}
                  onChange={(e) => setOpnameForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="mis. Opname bulanan Agustus"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpnameModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button type="submit" disabled={opnameMutation.isPending} className="btn-primary">
                  {opnameMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Simpan Opname
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

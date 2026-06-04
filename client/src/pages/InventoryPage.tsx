import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Warehouse, PackageSearch, Edit2, Trash2, XCircle, Plus, LayoutDashboard, Upload, Download, Eye } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatDate, formatRupiah } from '../lib/formatters';
import { toast } from 'sonner';
import { InventoryItemModal } from '../components/InventoryItemModal';
import { StockMovementModal } from '../components/StockMovementModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProductionRunModal } from '../components/ProductionRunModal';
import InventoryDashboardTab from '../components/InventoryDashboardTab';
import ProductionDetailDrawer from '../components/ProductionDetailDrawer';
import ProductionDashboardTab from '../components/ProductionDashboardTab';
import ProductionCostStandardsTab from '../components/ProductionCostStandardsTab';
import ProductionProcessesTab from '../components/ProductionProcessesTab';
import MachinesTab from '../components/MachinesTab';
import ApprovalPanel, { type ApprovalRequest } from '../components/ApprovalPanel';
import ImportModal from '../components/ImportModal';
import WarehousePicker from '../components/WarehousePicker';
import Select from '../components/Select';
import { exportToExcel } from '../lib/exportExcel';

type TabType = 'dashboard' | 'items' | 'movements' | 'production' | 'services';

const formatNumber = (val: number | string, decimals = 3) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const movementTypeConfig: Record<string, { label: string; className: string }> = {
  In: { label: 'Masuk', className: 'badge badge-green' },
  Out: { label: 'Keluar', className: 'badge badge-red' },
  AdjustmentIn: { label: 'Penyesuaian +', className: 'badge badge-blue' },
  AdjustmentOut: { label: 'Penyesuaian −', className: 'badge badge-orange' },
  TransferIn: { label: 'Transfer Masuk', className: 'badge badge-green' },
  TransferOut: { label: 'Transfer Keluar', className: 'badge badge-orange' },
};

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // --- Items tab state ---
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Items tab state ---
  const [itemsWarehouseFilter, setItemsWarehouseFilter] = useState('');  // '' = total across warehouses

  // --- Movements tab state ---
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [editMovement, setEditMovement] = useState<any | null>(null);
  const [filterItemId, setFilterItemId] = useState('');
  const [filterWarehouseId, setFilterWarehouseId] = useState('');
  const [filterMovementType, setFilterMovementType] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // --- Production tab state ---
  const [prodSubTab, setProdSubTab] = useState<'dashboard' | 'data' | 'approval' | 'costStandards' | 'processes' | 'machines'>('dashboard');
  const [productionModalOpen, setProductionModalOpen] = useState(false);
  const [editProdRun, setEditProdRun] = useState<any | null>(null);
  const [prodPrefillPayload, setProdPrefillPayload] = useState<any | null>(null);
  const [prodResubmitId, setProdResubmitId] = useState<string | null>(null);
  const [filterProdStartDate, setFilterProdStartDate] = useState('');
  const [filterProdEndDate, setFilterProdEndDate] = useState('');
  const [cancelProdTarget, setCancelProdTarget] = useState<string | null>(null);
  const [isCancellingProd, setIsCancellingProd] = useState(false);
  const [selectedProdRunId, setSelectedProdRunId] = useState<string | null>(null);

  // --- Services tab state ---
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editService, setEditService] = useState<any | null>(null);
  const [serviceForm, setServiceForm] = useState({ code: '', name: '', unit: 'Jasa', defaultRate: '', accountId: '', description: '' });
  const [serviceSaving, setServiceSaving] = useState(false);

  const queryClient = useQueryClient();

  const userRole = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? '';
    } catch {
      return '';
    }
  }, []);

  // --- Queries ---
  const { data: itemsRaw, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory-items', itemsWarehouseFilter],
    queryFn: () => api
      .get('/inventory/items', { params: itemsWarehouseFilter ? { warehouseId: itemsWarehouseFilter } : {} })
      .then(r => r.data),
  });
  const items: any[] = Array.isArray(itemsRaw)
    ? itemsRaw
    : (itemsRaw?.data ?? []);

  const movementFilters = useMemo(() => ({
    limit: 200,
    ...(filterItemId ? { itemId: filterItemId } : {}),
    ...(filterWarehouseId ? { warehouseId: filterWarehouseId } : {}),
    ...(filterMovementType ? { movementType: filterMovementType } : {}),
    ...(filterStartDate ? { startDate: filterStartDate } : {}),
    ...(filterEndDate ? { endDate: filterEndDate } : {}),
  }), [filterItemId, filterWarehouseId, filterMovementType, filterStartDate, filterEndDate]);

  const { data: movementsRaw, isLoading: movementsLoading } = useQuery({
    queryKey: ['stock-movements', movementFilters],
    queryFn: () => api.get('/inventory/movements', { params: movementFilters }).then(r => r.data),
    enabled: activeTab === 'movements',
  });
  const movements: any[] = Array.isArray(movementsRaw)
    ? movementsRaw
    : (movementsRaw?.data ?? []);

  const prodFilters = useMemo(() => ({
    ...(filterProdStartDate ? { startDate: filterProdStartDate } : {}),
    ...(filterProdEndDate ? { endDate: filterProdEndDate } : {}),
  }), [filterProdStartDate, filterProdEndDate]);

  const { data: productionRaw, isLoading: productionLoading } = useQuery({
    queryKey: ['production-runs', prodFilters],
    queryFn: () => api.get('/inventory/production-runs', { params: prodFilters }).then(r => r.data),
    enabled: activeTab === 'production',
  });
  const productionRuns: any[] = Array.isArray(productionRaw)
    ? productionRaw
    : (productionRaw?.data ?? []);

  const { data: serviceItemsRaw, isLoading: servicesLoading } = useQuery({
    queryKey: ['service-items'],
    queryFn: () => api.get('/service-items').then(r => r.data),
    enabled: activeTab === 'services',
  });
  const serviceItems: any[] = serviceItemsRaw?.data ?? [];

  const { data: revenueAccounts } = useQuery({
    queryKey: ['revenue-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((a: any) => a.rootType === 'REVENUE' && !a.isGroup);
    },
    enabled: activeTab === 'services',
  });

  // --- Handlers ---
  const handleOpenAdd = () => {
    setEditItem(null);
    setItemModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    setItemModalOpen(true);
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/inventory/items/${deleteItemTarget}`);
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Item stok berhasil dihapus.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menghapus item stok.');
    } finally {
      setIsDeleting(false);
      setDeleteItemTarget(null);
    }
  };

  const handleCancelMovement = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await api.put(`/inventory/movements/${cancelTarget}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Gerakan stok berhasil dibatalkan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan gerakan stok.');
    } finally {
      setIsCancelling(false);
      setCancelTarget(null);
    }
  };

  const handleCancelProduction = async () => {
    if (!cancelProdTarget) return;
    setIsCancellingProd(true);
    try {
      await api.put(`/inventory/production-runs/${cancelProdTarget}/cancel`);
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Proses produksi berhasil dibatalkan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal membatalkan proses produksi.');
    } finally {
      setIsCancellingProd(false);
      setCancelProdTarget(null);
    }
  };

  const handleOpenServiceAdd = () => {
    setEditService(null);
    setServiceForm({ code: '', name: '', unit: 'Jasa', defaultRate: '', accountId: '', description: '' });
    setServiceModalOpen(true);
  };

  const handleOpenServiceEdit = (svc: any) => {
    setEditService(svc);
    setServiceForm({
      code: svc.code,
      name: svc.name,
      unit: svc.unit || 'Jasa',
      defaultRate: svc.defaultRate ? String(Number(svc.defaultRate)) : '',
      accountId: svc.accountId || svc.account?.id || '',
      description: svc.description || '',
    });
    setServiceModalOpen(true);
  };

  const handleSaveService = async () => {
    if (!serviceForm.code || !serviceForm.name || !serviceForm.accountId) {
      toast.error('Kode, nama, dan akun pendapatan wajib diisi.');
      return;
    }
    setServiceSaving(true);
    try {
      const payload = {
        ...serviceForm,
        defaultRate: serviceForm.defaultRate ? Number(serviceForm.defaultRate) : undefined,
      };
      if (editService) {
        await api.patch(`/service-items/${editService.id}`, payload);
        toast.success('Layanan berhasil diubah.');
      } else {
        await api.post('/service-items', payload);
        toast.success('Layanan berhasil ditambahkan.');
      }
      queryClient.invalidateQueries({ queryKey: ['service-items'] });
      setServiceModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menyimpan layanan.');
    } finally {
      setServiceSaving(false);
    }
  };

  const handleDeactivateService = async (id: string) => {
    try {
      await api.delete(`/service-items/${id}`);
      queryClient.invalidateQueries({ queryKey: ['service-items'] });
      toast.success('Layanan dinonaktifkan.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gagal menonaktifkan layanan.');
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Stok &amp; Gudang</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Kelola master item, pantau stok, dan catat gerakan persediaan.</p>
        </div>
        {activeTab === 'items' ? (
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() =>
                exportToExcel(
                  items.map((i: any) => ({
                    code: i.code,
                    name: i.name,
                    unit: i.unit,
                    category: i.category ?? '',
                    description: i.description ?? '',
                    currentStock: Number(i.currentStock ?? 0),
                    minimumStock: Number(i.minimumStock ?? 0),
                    openingQty: '',
                    openingPrice: '',
                  })),
                  'master-item'
                )
              }
            >
              <Download size={14} /> Download
            </button>
            <button className="btn-secondary flex items-center gap-1.5" onClick={() => setIsImportOpen(true)}>
              <Upload size={14} /> Import
            </button>
            <button onClick={handleOpenAdd} className="btn-primary">
              <Plus size={15} /> Tambah Item
            </button>
          </div>
        ) : activeTab === 'movements' ? (
          <button onClick={() => { setEditMovement(null); setMovementModalOpen(true); }} className="btn-primary">
            <Plus size={15} /> Catat Gerakan
          </button>
        ) : activeTab === 'services' ? (
          <button onClick={handleOpenServiceAdd} className="btn-primary">
            <Plus size={15} /> Tambah Layanan
          </button>
        ) : activeTab === 'production' ? (
          <button onClick={() => { setEditProdRun(null); setProductionModalOpen(true); }} className="btn-primary">
            <Plus size={15} /> Proses Produksi
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5',
            activeTab === 'dashboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          <LayoutDashboard size={14} /> Dashboard
        </button>
        <button
          onClick={() => setActiveTab('items')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'items'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Master Item
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Riwayat Gerakan Stok
        </button>
        <button
          onClick={() => setActiveTab('production')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'production'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Proses Produksi
        </button>
        <button
          onClick={() => setActiveTab('services')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'services'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Layanan
        </button>
      </div>

      {/* ─── Tab 0: Dashboard ─── */}
      {activeTab === 'dashboard' && <InventoryDashboardTab />}

      {/* ─── Tab 1: Master Item ─── */}
      {activeTab === 'items' && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
            <label className="text-xs text-gray-500">Tampilkan stok per gudang:</label>
            <div className="w-56">
              <WarehousePicker
                value={itemsWarehouseFilter}
                onChange={setItemsWarehouseFilter}
                autoDefault={false}
                placeholder="— Semua gudang (total) —"
                size="sm"
              />
            </div>
            {itemsWarehouseFilter && (
              <button
                onClick={() => setItemsWarehouseFilter('')}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Satuan</th>
                <th scope="col">Kategori</th>
                <th scope="col" className="text-right">{itemsWarehouseFilter ? 'Stok di Gudang' : 'Stok Saat Ini'}</th>
                <th scope="col" className="text-right">Stok Min</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data item...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Warehouse className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada item persediaan.</p>
                  </td>
                </tr>
              ) : (
                items.map((item: any) => {
                  const currentStock = Number(item.currentStock);
                  const minStock = Number(item.minimumStock);
                  const isLow = currentStock < minStock && minStock > 0;
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                          {item.code}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{item.name}</span>
                        {item.description && (
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{item.description}</p>
                        )}
                      </td>
                      <td className="text-gray-500">{item.unit}</td>
                      <td className="text-gray-500">{item.category ?? '—'}</td>
                      <td className="text-right">
                        <span className="font-mono tabular-nums text-gray-800">
                          {formatNumber(currentStock)} {item.unit}
                        </span>
                        {isLow && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                            ⚠ Stok Menipis
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="font-mono tabular-nums text-gray-500">
                          {formatNumber(minStock)}
                        </span>
                      </td>
                      <td className="text-center">
                        <span
                          className={cn(
                            'badge',
                            item.isActive !== false ? 'badge-green' : 'badge-red'
                          )}
                        >
                          {item.isActive !== false ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                            title="Edit item"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteItemTarget(item.id)}
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="Hapus item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
         </div>
          </div>
        </div>
      )}

      {/* ─── Tab 2: Riwayat Gerakan Stok ─── */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Item</label>
              <div className="w-64">
                <Select
                  value={filterItemId}
                  onChange={e => setFilterItemId(e.target.value)}
                  className="w-full"
                >
                  <option value="">Semua Item</option>
                  {items.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Tipe</label>
              <div className="w-44">
                <Select
                  value={filterMovementType}
                  onChange={e => setFilterMovementType(e.target.value)}
                  className="w-full"
                >
                  <option value="">Semua Tipe</option>
                  <option value="In">Masuk</option>
                  <option value="Out">Keluar</option>
                  <option value="AdjustmentIn">Penyesuaian +</option>
                  <option value="AdjustmentOut">Penyesuaian −</option>
                  <option value="TransferIn">Transfer Masuk</option>
                  <option value="TransferOut">Transfer Keluar</option>
                </Select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Gudang</label>
              <div className="w-52">
                <WarehousePicker
                  value={filterWarehouseId}
                  onChange={setFilterWarehouseId}
                  autoDefault={false}
                  placeholder="— Semua gudang —"
                  size="sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
           <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">No. Gerakan</th>
                  <th scope="col">Item</th>
                  <th scope="col">Gudang</th>
                  <th scope="col" className="text-center">Tipe</th>
                  <th scope="col" className="text-right">Kuantitas</th>
                  <th scope="col">Satuan</th>
                  <th scope="col" className="text-right">Nilai</th>
                  <th scope="col">Referensi</th>
                  <th scope="col">Catatan</th>
                  <th scope="col" className="w-10">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                      Memuat riwayat gerakan stok...
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-16 text-center">
                      <PackageSearch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Belum ada riwayat gerakan stok.</p>
                    </td>
                  </tr>
                ) : (
                  movements.map((mov: any) => {
                    const typeConf = movementTypeConfig[mov.movementType] ?? { label: mov.movementType, className: 'badge' };
                    const isCancelled = mov.isCancelled;
                    return (
                      <tr
                        key={mov.id}
                        className={cn(isCancelled && 'opacity-50')}
                      >
                        <td className={cn('text-gray-500 whitespace-nowrap', isCancelled && 'line-through')}>
                          {formatDate(mov.date)}
                        </td>
                        <td className={cn('whitespace-nowrap', isCancelled && 'line-through')}>
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                            {mov.movementNumber ?? mov.id?.slice(0, 8)}
                          </span>
                        </td>
                        <td className={cn(isCancelled && 'line-through')}>
                          <span className="font-medium text-gray-800">
                            {mov.item?.name ?? '—'}
                          </span>
                          {mov.item?.code && (
                            <span className="text-xs text-gray-400 uppercase ml-1.5">{mov.item.code}</span>
                          )}
                        </td>
                        <td className={cn('text-gray-600 whitespace-nowrap', isCancelled && 'line-through')}>
                          {mov.warehouse?.name ?? '—'}
                        </td>
                        <td className="text-center">
                          {isCancelled ? (
                            <span className="badge badge-red">Dibatalkan</span>
                          ) : (
                            <span className={typeConf.className}>{typeConf.label}</span>
                          )}
                        </td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {formatNumber(mov.quantity)}
                        </td>
                        <td className="text-gray-500">{mov.item?.unit ?? '—'}</td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {mov.totalValue != null
                            ? Number(mov.totalValue).toLocaleString('id-ID', { maximumFractionDigits: 0 })
                            : '—'}
                        </td>
                        <td className="text-gray-500 text-xs">
                          {mov.referenceNumber ? (
                            <>
                              <span className="text-gray-400">{mov.referenceType}</span>
                              <br />
                              <span className="font-mono">{mov.referenceNumber}</span>
                            </>
                          ) : '—'}
                        </td>
                        <td className="text-gray-500 text-xs max-w-[140px] truncate">
                          {mov.notes ?? '—'}
                        </td>
                        <td>
                          {!isCancelled && ['Admin', 'Accountant'].includes(userRole) && (
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => { setEditMovement(mov); setMovementModalOpen(true); }}
                                className="p-1.5 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-500 transition-colors"
                                title="Edit gerakan"
                              >
                                <Edit2 size={14} />
                              </button>
                              {userRole === 'Admin' && (
                                <button
                                  onClick={() => setCancelTarget(mov.id)}
                                  className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                                  title="Batalkan gerakan"
                                >
                                  <XCircle size={15} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
           </div>
          </div>
        </div>
      )}

      {/* ─── Tab 3: Proses Produksi ─── */}
      {activeTab === 'production' && (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setProdSubTab('dashboard')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Dashboard
            </button>
            <button
              onClick={() => setProdSubTab('data')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'data' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Data Produksi
            </button>
            <button
              onClick={() => setProdSubTab('approval')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'approval' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Approval &amp; Pengajuan
            </button>
            <button
              onClick={() => setProdSubTab('costStandards')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'costStandards' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Standar Biaya
            </button>
            <button
              onClick={() => setProdSubTab('processes')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'processes' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Master Proses
            </button>
            <button
              onClick={() => setProdSubTab('machines')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                prodSubTab === 'machines' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              Mesin
            </button>
          </div>

          {prodSubTab === 'dashboard' && <ProductionDashboardTab items={items} />}
          {prodSubTab === 'costStandards' && <ProductionCostStandardsTab userRole={userRole} />}
          {prodSubTab === 'processes' && <ProductionProcessesTab userRole={userRole} />}
          {prodSubTab === 'machines' && <MachinesTab userRole={userRole} />}

          {prodSubTab === 'approval' && (
            <ApprovalPanel
              documentType="ProductionRun"
              userRole={userRole}
              onResubmit={(req: ApprovalRequest) => {
                setEditProdRun(null);
                setProdPrefillPayload(req.payload);
                setProdResubmitId(req.id);
                setProductionModalOpen(true);
              }}
              onViewDocument={(req: ApprovalRequest) => { if (req.documentId) setSelectedProdRunId(req.documentId); }}
            />
          )}

          {prodSubTab === 'data' && (
          <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterProdStartDate}
                onChange={e => setFilterProdStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterProdEndDate}
                onChange={e => setFilterProdEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
           <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">No. Produksi</th>
                  <th scope="col">Referensi</th>
                  <th scope="col">Input</th>
                  <th scope="col">Output</th>
                  <th scope="col" className="text-right">Yield %</th>
                  <th scope="col">Catatan</th>
                  <th scope="col" className="w-10">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {productionLoading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                      Memuat data proses produksi...
                    </td>
                  </tr>
                ) : productionRuns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <PackageSearch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Belum ada proses produksi.</p>
                    </td>
                  </tr>
                ) : (
                  productionRuns.map((run: any) => {
                    const isCancelled = run.isCancelled;
                    const inputLines = (run.items ?? []).filter((i: any) => i.lineType === 'Input');
                    const outputLines = (run.items ?? []).filter((i: any) => i.lineType === 'Output' || i.lineType === 'ByProduct');
                    return (
                      <tr
                        key={run.id}
                        className={cn('cursor-pointer', isCancelled && 'opacity-50')}
                        onClick={() => setSelectedProdRunId(run.id)}
                      >
                        <td className={cn('text-gray-500 whitespace-nowrap', isCancelled && 'line-through')}>
                          {formatDate(run.date)}
                        </td>
                        <td className={cn('whitespace-nowrap', isCancelled && 'line-through')}>
                          <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                            {run.runNumber}
                          </span>
                        </td>
                        <td className="text-gray-500 text-xs">
                          {run.referenceNumber ? (
                            <span className="font-mono">{run.referenceNumber}</span>
                          ) : '—'}
                        </td>
                        <td className={cn('text-xs', isCancelled && 'line-through')}>
                          {inputLines.map((line: any) => (
                            <div key={line.id} className="text-gray-700">
                              <span className="font-medium">{line.item?.name}</span>
                              <span className="text-gray-400 ml-1">
                                {formatNumber(Number(line.quantity))} {line.item?.unit}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td className={cn('text-xs', isCancelled && 'line-through')}>
                          {outputLines.map((line: any) => (
                            <div key={line.id} className="text-gray-700">
                              <span className="font-medium">{line.item?.name}</span>
                              <span className="text-gray-400 ml-1">
                                {formatNumber(Number(line.quantity))} {line.item?.unit}
                              </span>
                              {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                                <span className="text-blue-500 ml-1 font-mono">
                                  @{formatRupiah(Number(line.unitPrice))}
                                </span>
                              )}
                              {(line.isByProduct || line.lineType === 'ByProduct') && (
                                <span className="ml-1 text-[9px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                                  Samping
                                </span>
                              )}
                            </div>
                          ))}
                        </td>
                        <td className={cn('text-right font-mono tabular-nums text-gray-800', isCancelled && 'line-through')}>
                          {run.yieldPct != null
                            ? `${Number(run.yieldPct).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="text-gray-500 text-xs max-w-[140px] truncate">
                          {run.notes ?? '—'}
                        </td>
                        <td>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedProdRunId(run.id); }}
                              className="p-1.5 hover:bg-blue-50 rounded text-gray-300 hover:text-blue-500 transition-colors"
                              title="Lihat detail"
                            >
                              <Eye size={15} />
                            </button>
                            {!isCancelled && (userRole === 'Admin' || userRole === 'Accountant' || userRole === 'StaffProduksi') && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditProdRun(run); setProductionModalOpen(true); }}
                                className="p-1.5 hover:bg-amber-50 rounded text-gray-300 hover:text-amber-500 transition-colors"
                                title="Edit proses produksi"
                              >
                                <Edit2 size={15} />
                              </button>
                            )}
                            {!isCancelled && userRole === 'Admin' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setCancelProdTarget(run.id); }}
                                className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                                title="Batalkan proses produksi"
                              >
                                <XCircle size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
           </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* ─── Tab 4: Layanan ─── */}
      {activeTab === 'services' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
         <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama Layanan</th>
                <th scope="col">Satuan</th>
                <th scope="col" className="text-right">Tarif Default</th>
                <th scope="col">Akun Pendapatan</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-20">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {servicesLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data layanan...
                  </td>
                </tr>
              ) : serviceItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Warehouse className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada layanan terdaftar.</p>
                  </td>
                </tr>
              ) : (
                serviceItems.map((svc: any) => (
                  <tr key={svc.id}>
                    <td>
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                        {svc.code}
                      </span>
                    </td>
                    <td>
                      <span className="font-medium text-gray-800">{svc.name}</span>
                      {svc.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{svc.description}</p>}
                    </td>
                    <td className="text-gray-500">{svc.unit}</td>
                    <td className="text-right font-mono tabular-nums text-gray-800">
                      {svc.defaultRate ? formatRupiah(Number(svc.defaultRate)) : '—'}
                    </td>
                    <td className="text-xs text-gray-500">
                      {svc.account ? `${svc.account.accountNumber} ${svc.account.name}` : '—'}
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', svc.isActive ? 'badge-green' : 'badge-red')}>
                        {svc.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenServiceEdit(svc)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
                          title="Edit layanan"
                        >
                          <Edit2 size={15} />
                        </button>
                        {svc.isActive && userRole === 'Admin' && (
                          <button
                            onClick={() => handleDeactivateService(svc.id)}
                            className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors"
                            title="Nonaktifkan"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
         </div>
        </div>
      )}

      {/* Service Item Modal */}
      {serviceModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && setServiceModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{editService ? 'Edit Layanan' : 'Tambah Layanan'}</h3>
              <button onClick={() => setServiceModalOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400"><XCircle size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kode</label>
                  <input type="text" value={serviceForm.code} onChange={e => setServiceForm({ ...serviceForm, code: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="JSG-001" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Satuan</label>
                  <input type="text" value={serviceForm.unit} onChange={e => setServiceForm({ ...serviceForm, unit: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jasa" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Nama Layanan</label>
                <input type="text" value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jasa Giling Padi" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Tarif Default (Rp)</label>
                <input type="number" value={serviceForm.defaultRate} onChange={e => setServiceForm({ ...serviceForm, defaultRate: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="500000" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Akun Pendapatan</label>
                <Select value={serviceForm.accountId} onChange={e => setServiceForm({ ...serviceForm, accountId: e.target.value })}
                  className="w-full">
                  <option value="">— Pilih Akun —</option>
                  {revenueAccounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.accountNumber} — {acc.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Deskripsi</label>
                <input type="text" value={serviceForm.description} onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Opsional" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setServiceModalOpen(false)} className="btn-secondary">Batal</button>
              <button onClick={handleSaveService} disabled={serviceSaving} className="btn-primary disabled:opacity-50">
                {serviceSaving ? <Loader2 size={15} className="animate-spin" /> : editService ? 'Simpan Perubahan' : 'Tambah Layanan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <InventoryItemModal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        editItem={editItem}
      />

      <StockMovementModal
        isOpen={movementModalOpen}
        onClose={() => { setMovementModalOpen(false); setEditMovement(null); }}
        editMovement={editMovement}
      />

      <ProductionRunModal
        isOpen={productionModalOpen}
        onClose={() => { setProductionModalOpen(false); setEditProdRun(null); setProdPrefillPayload(null); setProdResubmitId(null); }}
        items={items}
        editRun={editProdRun}
        prefillPayload={prodPrefillPayload}
        resubmitRequestId={prodResubmitId}
      />

      <ProductionDetailDrawer
        runId={selectedProdRunId}
        onClose={() => setSelectedProdRunId(null)}
        canCancel={userRole === 'Admin'}
        onCancel={(id) => {
          setSelectedProdRunId(null);
          setCancelProdTarget(id);
        }}
      />

      <ConfirmDialog
        open={deleteItemTarget !== null}
        title="Hapus Item Stok"
        message="Hapus item stok ini? Item yang sudah memiliki mutasi stok atau digunakan di invoice tidak bisa dihapus."
        confirmLabel={isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteItemTarget(null)}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Batalkan Gerakan Stok"
        message="Batalkan gerakan stok ini? Stok item akan dikembalikan."
        confirmLabel={isCancelling ? 'Membatalkan...' : 'Ya, Batalkan'}
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancelMovement}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={cancelProdTarget !== null}
        title="Batalkan Proses Produksi"
        message="Batalkan proses produksi ini? Semua gerakan stok terkait akan dibalik."
        confirmLabel={isCancellingProd ? 'Membatalkan...' : 'Ya, Batalkan'}
        cancelLabel="Tidak"
        variant="danger"
        onConfirm={handleCancelProduction}
        onCancel={() => setCancelProdTarget(null)}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        importType="inventory"
      />
    </div>
  );
}

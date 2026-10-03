import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Plus, Edit2, Trash2, Calculator, X, FileText, Hash, Package,
  Tag, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Warehouse as WarehouseIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import SearchableSelect, { type SelectOption } from './SearchableSelect';
import Select from './Select';
import { can } from '../lib/permissions';

// ─── Types ───────────────────────────────────────────────────────────────────

type CostSide = 'InputSide' | 'OutputSide';
type Basis = 'InputQty' | 'OutputQty' | 'Fixed';

interface CostStandard {
  id: string;
  name: string;
  description: string | null;
  costSide: CostSide;
  basis: Basis;
  defaultRate: string | number;
  isActive: boolean;
  costAccountId: string | null;
  costAccount: { id: string; accountNumber: string; name: string } | null;
  itemId: string | null;
  item: { id: string; code: string; name: string; unit: string } | null;
  warehouseId: string | null;
  warehouse: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface WarehouseOpt {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  isGroup?: boolean;
  accountType?: string;
}

interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive?: boolean;
}

interface FormState {
  name: string;
  description: string;
  costSide: CostSide;
  basis: Basis;
  defaultRate: string;
  costAccountId: string;
  itemId: string;
  warehouseId: string;
}

const blankForm: FormState = {
  name: '',
  description: '',
  costSide: 'InputSide',
  basis: 'InputQty',
  defaultRate: '',
  costAccountId: '',
  itemId: '',
  warehouseId: '',
};

const basisLabel = (b: Basis) =>
  b === 'InputQty' ? 'rate × qty input' : b === 'OutputQty' ? 'rate × qty main output' : 'flat per run';

const basisUnitHint = (b: Basis) =>
  b === 'InputQty' ? 'Rp / Kg input' : b === 'OutputQty' ? 'Rp / Kg output' : 'Rp / run';

const fmtRupiah = (val: string | number) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: 4 });

// ─── Main Tab ────────────────────────────────────────────────────────────────

export default function ProductionCostStandardsTab() {
  const canEdit = can('production', 'edit');
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CostStandard | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Filter pemandu — saat dipilih, list hanya tampilkan standar yg match
  // dengan gudang itu atau yg null (berlaku semua).
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('');

  // Warehouses for filter dropdown + form picker
  const { data: warehousesRaw } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: () => api.get('/warehouses').then(r => r.data),
  });
  const warehouses: WarehouseOpt[] = useMemo(() => {
    const arr = Array.isArray(warehousesRaw) ? warehousesRaw : (warehousesRaw?.data ?? []);
    return arr.filter((w: any) => w.isActive !== false);
  }, [warehousesRaw]);

  const { data: standardsRaw, isLoading } = useQuery({
    queryKey: ['production-cost-standards', filterWarehouseId],
    queryFn: () => api
      .get('/inventory/production-cost-standards', {
        params: filterWarehouseId ? { warehouseId: filterWarehouseId } : {},
      })
      .then(r => r.data),
  });
  const standards: CostStandard[] = standardsRaw?.data ?? [];

  const handleOpenAdd = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (std: CostStandard) => {
    setEditTarget(std);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus standar biaya ini? Jika sudah dipakai produksi, akan dinonaktifkan.')) return;
    setDeletingId(id);
    try {
      const res = await api.delete(`/inventory/production-cost-standards/${id}`);
      toast.success(res.data?.message || 'Standar biaya dihapus.');
      queryClient.invalidateQueries({ queryKey: ['production-cost-standards'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus standar biaya.');
    } finally {
      setDeletingId(null);
    }
  };

  const inputStandards = standards.filter(s => s.costSide === 'InputSide');
  const outputStandards = standards.filter(s => s.costSide === 'OutputSide');

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 p-1.5 rounded-lg bg-blue-100 text-blue-700">
          <Calculator size={15} />
        </div>
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-blue-900">Standar Biaya Produksi <span className="text-blue-500 font-normal">(informational)</span></p>
          <p className="text-blue-800/80 mt-0.5">
            Rate jadi acuan saat hitung HPP per Kg di proses produksi.
            <span className="font-semibold"> Tidak posting GL</span> — biaya real (PLN, gaji, dll) tetap masuk P&L lewat
            tagihan/JV. Edit master tidak mengubah HPP produksi historis (snapshot disimpan di setiap run).
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Warehouse filter — null option = semua */}
          <div className="flex items-center gap-1.5">
            <WarehouseIcon size={13} className="text-gray-400" />
            <Select
              value={filterWarehouseId}
              onChange={e => setFilterWarehouseId(e.target.value)}
              className="w-full"
            >
              <option value="">Semua Gudang</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-xs text-gray-500">
            {standards.length > 0 && (
              <>
                <span className="font-medium text-gray-700">{standards.length}</span> standar
                {' · '}
                <span className="text-blue-600">{inputStandards.length} input</span>
                {' · '}
                <span className="text-emerald-600">{outputStandards.length} output</span>
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <button onClick={handleOpenAdd} className="btn-primary">
            <Plus size={15} /> Standar Baru
          </button>
        )}
      </div>

      {/* Lists */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StandardsList
            accent="blue"
            icon={<ArrowDownToLine size={14} />}
            title="Biaya Sisi Input"
            subtitle="Contoh: Listrik mesin produksi, per Kg bahan baku masuk"
            standards={inputStandards}
            canEdit={canEdit}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
          <StandardsList
            accent="emerald"
            icon={<ArrowUpFromLine size={14} />}
            title="Biaya Sisi Output"
            subtitle="Contoh: Kirim hasil ke gudang, per Kg beras siap"
            standards={outputStandards}
            canEdit={canEdit}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <CostStandardFormModal
          editTarget={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['production-cost-standards'] });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Form Modal ──────────────────────────────────────────────────────────────

interface FormModalProps {
  editTarget: CostStandard | null;
  onClose: () => void;
  onSaved: () => void;
}

function CostStandardFormModal({ editTarget, onClose, onSaved }: FormModalProps) {
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() => {
    if (!editTarget) return blankForm;
    return {
      name: editTarget.name,
      description: editTarget.description ?? '',
      costSide: editTarget.costSide,
      basis: editTarget.basis,
      defaultRate: String(editTarget.defaultRate),
      costAccountId: editTarget.costAccountId ?? '',
      itemId: editTarget.itemId ?? '',
      warehouseId: editTarget.warehouseId ?? '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) onClose();
  }, [saving, onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const { data: accountsRaw } = useQuery({
    queryKey: ['accounts-flat-for-cost-standard'],
    queryFn: () => api.get('/coa').then(r => r.data),
  });
  const accountOptions: SelectOption[] = useMemo(() => {
    const arr: Account[] = Array.isArray(accountsRaw) ? accountsRaw : (accountsRaw?.data ?? []);
    return arr
      .filter(a => !a.isGroup)
      .map(a => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` }));
  }, [accountsRaw]);

  const { data: itemsRaw } = useQuery({
    queryKey: ['inventory-items-for-cost-standards'],
    queryFn: () => api.get('/inventory/items?limit=200').then(r => r.data),
  });
  const itemOptions: SelectOption[] = useMemo(() => {
    const arr: Item[] = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.data ?? []);
    return arr
      .filter(i => i.isActive !== false)
      .map(i => ({ value: i.id, label: `${i.code} — ${i.name} (${i.unit})` }));
  }, [itemsRaw]);

  const { data: whRaw } = useQuery({
    queryKey: ['warehouses-for-cost-standards'],
    queryFn: () => api.get('/warehouses').then(r => r.data),
  });
  const warehouseOptions: SelectOption[] = useMemo(() => {
    const arr: WarehouseOpt[] = Array.isArray(whRaw) ? whRaw : (whRaw?.data ?? []);
    return arr
      .filter(w => w.isActive !== false)
      .map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }));
  }, [whRaw]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  const pickSide = (side: CostSide) => {
    setForm(f => ({
      ...f,
      costSide: side,
      // Auto-pair basis with side when user hasn't customized it
      basis:
        (side === 'InputSide' && f.basis === 'OutputQty') ? 'InputQty'
        : (side === 'OutputSide' && f.basis === 'InputQty') ? 'OutputQty'
        : f.basis,
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Nama wajib diisi.');
      return;
    }
    const rateNum = Number(form.defaultRate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      setError('Rate harus angka ≥ 0.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        costSide: form.costSide,
        basis: form.basis,
        defaultRate: rateNum,
        costAccountId: form.costAccountId || null,
        itemId: form.itemId || null,
        warehouseId: form.warehouseId || null,
      };
      if (isEdit) {
        await api.put(`/inventory/production-cost-standards/${editTarget!.id}`, payload);
        toast.success('Standar biaya diperbarui.');
      } else {
        await api.post('/inventory/production-cost-standards', payload);
        toast.success('Standar biaya dibuat.');
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gagal menyimpan standar biaya.');
    } finally {
      setSaving(false);
    }
  };

  const previewTotal = (() => {
    const r = Number(form.defaultRate);
    if (!Number.isFinite(r) || r <= 0) return null;
    return r;
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-standard-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        className="rounded-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              form.costSide === 'InputSide' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600',
            )}>
              <Calculator size={16} />
            </div>
            <div>
              <h2 id="cost-standard-modal-title" className="text-base font-semibold text-gray-900">
                {isEdit ? 'Edit Standar Biaya' : 'Standar Biaya Baru'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEdit ? `Mengubah ${editTarget!.name}` : 'Rate acuan untuk hitung HPP loaded'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Cost Side selector */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Sisi Biaya</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => pickSide('InputSide')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                  form.costSide === 'InputSide'
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white',
                )}
              >
                <div className={cn(
                  'p-1.5 rounded',
                  form.costSide === 'InputSide' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500',
                )}>
                  <ArrowDownToLine size={14} />
                </div>
                <div className="min-w-0">
                  <div className={cn(
                    'text-sm font-semibold',
                    form.costSide === 'InputSide' ? 'text-blue-900' : 'text-gray-700',
                  )}>
                    Sisi Input
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight">
                    biaya bahan baku masuk
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => pickSide('OutputSide')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-lg border transition-all text-left',
                  form.costSide === 'OutputSide'
                    ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white',
                )}
              >
                <div className={cn(
                  'p-1.5 rounded',
                  form.costSide === 'OutputSide' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500',
                )}>
                  <ArrowUpFromLine size={14} />
                </div>
                <div className="min-w-0">
                  <div className={cn(
                    'text-sm font-semibold',
                    form.costSide === 'OutputSide' ? 'text-emerald-900' : 'text-gray-700',
                  )}>
                    Sisi Output
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight">
                    biaya hasil produksi
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Identitas */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Identitas</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nama Standar <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Listrik Mesin Produksi"
                    className="w-full border border-gray-200 rounded-lg py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Estimasi listrik per Kg bahan baku"
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Tarif */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Tarif & Basis</p>

            {/* Basis as segmented buttons */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Basis Perhitungan</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { v: 'InputQty', label: 'Per Kg Input', hint: 'rate × qty input' },
                  { v: 'OutputQty', label: 'Per Kg Output', hint: 'rate × qty output' },
                  { v: 'Fixed', label: 'Flat per Run', hint: 'rate adalah total' },
                ] as { v: Basis; label: string; hint: string }[]).map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => set('basis', opt.v)}
                    className={cn(
                      'px-2 py-2 rounded-lg text-xs font-medium border transition-colors text-center',
                      form.basis === opt.v
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                    )}
                  >
                    <div>{opt.label}</div>
                    <div className="text-[10px] text-gray-400 font-normal mt-0.5">{opt.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Default rate */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Default Rate <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">Rp</span>
                <input
                  type="number"
                  step="0.0001"
                  min={0}
                  value={form.defaultRate}
                  onChange={e => set('defaultRate', e.target.value)}
                  placeholder="100"
                  className="w-full border border-gray-200 rounded-lg py-2 pl-10 pr-24 text-sm text-right font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">
                  {basisUnitHint(form.basis)}
                </span>
              </div>
              {previewTotal !== null && form.basis !== 'Fixed' && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Contoh: 10.000 Kg × Rp {fmtRupiah(previewTotal)} = <span className="font-mono">Rp {fmtRupiah(previewTotal * 10000)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Lingkup */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Lingkup (Opsional)</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <WarehouseIcon size={11} className="text-gray-400" /> Berlaku Untuk Gudang
                </label>
                <SearchableSelect
                  options={warehouseOptions}
                  value={form.warehouseId}
                  onChange={v => set('warehouseId', v)}
                  placeholder="— Semua gudang —"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Mis. "biaya mesin finishing" hanya muncul di gudang finishing. Kosongkan agar berlaku untuk semua gudang.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Tag size={11} className="text-gray-400" /> Akun Biaya (tag laporan)
                </label>
                <SearchableSelect
                  options={accountOptions}
                  value={form.costAccountId}
                  onChange={v => set('costAccountId', v)}
                  placeholder="— Tidak ditag —"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Tidak ada posting GL ke akun ini. Tag hanya untuk grouping laporan.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1">
                  <Package size={11} className="text-gray-400" /> Berlaku Untuk Item
                </label>
                <SearchableSelect
                  options={itemOptions}
                  value={form.itemId}
                  onChange={v => set('itemId', v)}
                  placeholder="— Semua item —"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Kosongkan agar standar bisa dipakai untuk item apa pun.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 truncate">
            <span className={form.costSide === 'InputSide' ? 'text-blue-600' : 'text-emerald-600'}>
              {form.costSide === 'InputSide' ? 'Input' : 'Output'}
            </span>
            {' · '}
            {basisLabel(form.basis)}
            {form.defaultRate && (
              <>
                {' · '}<span className="font-mono">Rp {fmtRupiah(form.defaultRate)}</span>
              </>
            )}
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!form.name.trim() || !form.defaultRate || saving}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {isEdit ? 'Simpan Perubahan' : 'Simpan Standar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── List Card ───────────────────────────────────────────────────────────────

interface ListProps {
  accent: 'blue' | 'emerald';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  standards: CostStandard[];
  canEdit: boolean;
  onEdit: (s: CostStandard) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function StandardsList({ accent, icon, title, subtitle, standards, canEdit, onEdit, onDelete, deletingId }: ListProps) {
  const headerCls = accent === 'blue'
    ? 'bg-blue-50/60 border-blue-100'
    : 'bg-emerald-50/60 border-emerald-100';
  const accentText = accent === 'blue' ? 'text-blue-700' : 'text-emerald-700';
  const accentIconBg = accent === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      <div className={cn('px-4 py-3 border-b flex items-center gap-2.5', headerCls)}>
        <div className={cn('p-1.5 rounded-lg', accentIconBg)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className={cn('font-semibold text-sm', accentText)}>{title}</h4>
          <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
          {standards.length}
        </span>
      </div>
      {standards.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2 text-gray-300">
            <Hash size={16} />
          </div>
          <p className="text-xs text-gray-400">Belum ada standar biaya untuk sisi ini.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {standards.map(std => (
            <li
              key={std.id}
              className={cn(
                'px-4 py-3 hover:bg-gray-50/60 transition-colors',
                !std.isActive && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 text-sm truncate">{std.name}</span>
                    {!std.isActive && (
                      <span className="badge badge-gray text-[10px]">Nonaktif</span>
                    )}
                  </div>
                  {std.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{std.description}</p>
                  )}
                  <div className="text-[11px] text-gray-600 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-gray-400">Rate:</span>
                      <span className="font-mono font-semibold text-gray-800">Rp {fmtRupiah(std.defaultRate)}</span>
                      <span className="text-gray-400 text-[10px]">{basisUnitHint(std.basis)}</span>
                    </span>
                    <span>
                      <span className="text-gray-400">Basis:</span> {basisLabel(std.basis)}
                    </span>
                    {std.warehouse && (
                      <span className="inline-flex items-center gap-0.5">
                        <WarehouseIcon size={10} className="text-gray-400" />
                        {std.warehouse.code}
                      </span>
                    )}
                    {std.item && (
                      <span className="inline-flex items-center gap-0.5">
                        <Package size={10} className="text-gray-400" />
                        {std.item.name}
                      </span>
                    )}
                    {std.costAccount && (
                      <span className="inline-flex items-center gap-0.5">
                        <Tag size={10} className="text-gray-400" />
                        {std.costAccount.accountNumber}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(std)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(std.id)}
                      disabled={deletingId === std.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="Hapus"
                    >
                      {deletingId === std.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

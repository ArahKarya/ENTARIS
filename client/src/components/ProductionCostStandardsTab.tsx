import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Edit2, Trash2, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface CostStandard {
  id: string;
  name: string;
  description: string | null;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  defaultRate: string | number;
  isActive: boolean;
  costAccountId: string | null;
  costAccount: { id: string; accountNumber: string; name: string } | null;
  itemId: string | null;
  item: { id: string; code: string; name: string; unit: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType?: string;
}

interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface FormState {
  name: string;
  description: string;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  defaultRate: string;
  costAccountId: string;
  itemId: string;
}

const blankForm: FormState = {
  name: '',
  description: '',
  costSide: 'InputSide',
  basis: 'InputQty',
  defaultRate: '',
  costAccountId: '',
  itemId: '',
};

const costSideLabel = (s: string) =>
  s === 'InputSide' ? 'Input (per Kg input)' : 'Output (per Kg output)';

const basisLabel = (b: string) =>
  b === 'InputQty' ? 'rate × qty input' : b === 'OutputQty' ? 'rate × qty main output' : 'Flat per run';

const fmtRupiah = (val: string | number) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: 4 });

interface Props {
  userRole: string;
}

export default function ProductionCostStandardsTab({ userRole }: Props) {
  const canEdit = userRole === 'Admin' || userRole === 'Accountant';
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: standardsRaw, isLoading } = useQuery({
    queryKey: ['production-cost-standards'],
    queryFn: () => api.get('/inventory/production-cost-standards').then(r => r.data),
  });
  const standards: CostStandard[] = standardsRaw?.data ?? [];

  const { data: accountsRaw } = useQuery({
    queryKey: ['accounts-expense'],
    queryFn: () => api.get('/coa').then(r => r.data),
    enabled: modalOpen,
  });
  const accounts: Account[] = useMemo(() => {
    const arr = Array.isArray(accountsRaw) ? accountsRaw : (accountsRaw?.data ?? []);
    return arr.filter((a: any) => !a.isGroup);
  }, [accountsRaw]);

  const { data: itemsRaw } = useQuery({
    queryKey: ['inventory-items-for-cost-standards'],
    queryFn: () => api.get('/inventory/items').then(r => r.data),
    enabled: modalOpen,
  });
  const items: Item[] = useMemo(() => {
    const arr = Array.isArray(itemsRaw) ? itemsRaw : (itemsRaw?.data ?? []);
    return arr.filter((i: any) => i.isActive);
  }, [itemsRaw]);

  const handleOpenAdd = () => {
    setEditId(null);
    setForm(blankForm);
    setModalOpen(true);
  };

  const handleOpenEdit = (std: CostStandard) => {
    setEditId(std.id);
    setForm({
      name: std.name,
      description: std.description ?? '',
      costSide: std.costSide,
      basis: std.basis,
      defaultRate: String(std.defaultRate),
      costAccountId: std.costAccountId ?? '',
      itemId: std.itemId ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Nama wajib diisi.');
      return;
    }
    const rateNum = Number(form.defaultRate);
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error('Rate harus angka >= 0.');
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
      };
      if (editId) {
        await api.put(`/inventory/production-cost-standards/${editId}`, payload);
        toast.success('Standar biaya diperbarui.');
      } else {
        await api.post('/inventory/production-cost-standards', payload);
        toast.success('Standar biaya dibuat.');
      }
      queryClient.invalidateQueries({ queryKey: ['production-cost-standards'] });
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan standar biaya.');
    } finally {
      setSaving(false);
    }
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
        <Calculator size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">Standar Biaya Produksi (Informational)</p>
          <p className="text-blue-700 mt-1">
            Rate di sini dipakai sebagai acuan saat hitung HPP per Kg di proses produksi.
            <strong> Tidak posting GL</strong> — biaya real (PLN, gaji, dll) tetap masuk P&L lewat
            tagihan/JV. Edit master tidak akan mengubah HPP produksi historis (snapshot disimpan
            di setiap run).
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        {canEdit && (
          <button onClick={handleOpenAdd} className="btn-primary">
            <Plus size={15} /> Standar Baru
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StandardsList
            title="Biaya Sisi Input"
            subtitle="Contoh: Listrik mesin giling per Kg gabah masuk"
            standards={inputStandards}
            canEdit={canEdit}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
          <StandardsList
            title="Biaya Sisi Output"
            subtitle="Contoh: Biaya kirim ke gudang per Kg beras siap"
            standards={outputStandards}
            canEdit={canEdit}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {editId ? 'Edit Standar Biaya' : 'Standar Biaya Baru'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Listrik Mesin Giling"
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Estimasi listrik per Kg input GKP"
                  className="form-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sisi *</label>
                  <select
                    value={form.costSide}
                    onChange={e => {
                      const cs = e.target.value as 'InputSide' | 'OutputSide';
                      setForm(f => ({
                        ...f,
                        costSide: cs,
                        basis: cs === 'InputSide' ? 'InputQty' : 'OutputQty',
                      }));
                    }}
                    className="form-input w-full"
                  >
                    <option value="InputSide">Input</option>
                    <option value="OutputSide">Output</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Basis *</label>
                  <select
                    value={form.basis}
                    onChange={e => setForm(f => ({ ...f, basis: e.target.value as any }))}
                    className="form-input w-full"
                  >
                    <option value="InputQty">Per Qty Input</option>
                    <option value="OutputQty">Per Qty Output</option>
                    <option value="Fixed">Flat per Run</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Rate (Rp) *
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.defaultRate}
                  onChange={e => setForm(f => ({ ...f, defaultRate: e.target.value }))}
                  placeholder="100"
                  className="form-input w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  {form.basis === 'Fixed' ? 'Total Rp per produksi' : `Rp per ${form.basis === 'InputQty' ? 'kg input' : 'kg output'}`}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Akun Biaya (opsional, untuk tag laporan)
                </label>
                <select
                  value={form.costAccountId}
                  onChange={e => setForm(f => ({ ...f, costAccountId: e.target.value }))}
                  className="form-input w-full"
                >
                  <option value="">— Tidak ditag —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.accountNumber} — {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Tidak ada posting GL ke akun ini. Tag hanya untuk grouping laporan.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Berlaku Untuk Item (opsional)
                </label>
                <select
                  value={form.itemId}
                  onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}
                  className="form-input w-full"
                >
                  <option value="">— Semua item —</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.code} — {i.name} ({i.unit})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Kosongkan agar standar bisa dipakai untuk item apa pun.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Batal
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {editId ? 'Simpan' : 'Buat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface ListProps {
  title: string;
  subtitle: string;
  standards: CostStandard[];
  canEdit: boolean;
  onEdit: (s: CostStandard) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function StandardsList({ title, subtitle, standards, canEdit, onEdit, onDelete, deletingId }: ListProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h4 className="font-semibold text-gray-900 text-sm">{title}</h4>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {standards.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          Belum ada standar biaya untuk sisi ini.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {standards.map(std => (
            <li
              key={std.id}
              className={cn(
                'px-4 py-3 hover:bg-gray-50 transition-colors',
                !std.isActive && 'opacity-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm truncate">{std.name}</span>
                    {!std.isActive && (
                      <span className="badge badge-gray text-xs">Nonaktif</span>
                    )}
                  </div>
                  {std.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{std.description}</p>
                  )}
                  <div className="text-xs text-gray-600 mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      <span className="text-gray-400">Rate:</span>{' '}
                      <span className="font-medium">Rp {fmtRupiah(std.defaultRate)}</span>
                    </span>
                    <span>
                      <span className="text-gray-400">Basis:</span>{' '}
                      {basisLabel(std.basis)}
                    </span>
                    {std.item && (
                      <span>
                        <span className="text-gray-400">Item:</span> {std.item.name}
                      </span>
                    )}
                    {std.costAccount && (
                      <span>
                        <span className="text-gray-400">Akun:</span>{' '}
                        {std.costAccount.accountNumber}
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(std)}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(std.id)}
                      disabled={deletingId === std.id}
                      className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
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

// avoid TS unused-var warning
void costSideLabel;

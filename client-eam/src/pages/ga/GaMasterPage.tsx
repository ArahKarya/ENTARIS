import { useState, useMemo } from 'react';
import { Loader2, Plus, Pencil, Trash2, X, AlertCircle, Database } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';

// GA — Data Master. Tabbed CRUD untuk cabang, cost center, kategori aset,
// tipe dokumen, kategori inventaris, dan lokasi. Konsumsi /ga/master/*.

type FieldType = 'text' | 'checkbox' | 'select' | 'branch';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean;
}

interface TabDef {
  id: string;
  label: string;
  path: string;          // /ga/master/<path>
  queryKey: string;      // ['ga-master', queryKey]
  needsBranches?: boolean;
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  fields: FieldDef[];
}

const TABS: TabDef[] = [
  {
    id: 'branches',
    label: 'Cabang',
    path: 'branches',
    queryKey: 'branches',
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'address', label: 'Alamat' },
      { key: 'isActive', label: 'Aktif', render: (r) => (r.isActive ? 'Ya' : 'Tidak') },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'address', label: 'Alamat', type: 'text' },
      { key: 'isActive', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    id: 'cost-centers',
    label: 'Cost Center',
    path: 'cost-centers',
    queryKey: 'cost-centers',
    needsBranches: true,
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'branch', label: 'Cabang', render: (r) => r.branch?.name ?? '—' },
      { key: 'isActive', label: 'Aktif', render: (r) => (r.isActive ? 'Ya' : 'Tidak') },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'branchId', label: 'Cabang', type: 'branch', required: true },
      { key: 'isActive', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    id: 'asset-categories',
    label: 'Kategori Aset',
    path: 'asset-categories',
    queryKey: 'asset-categories',
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'isActive', label: 'Aktif', render: (r) => (r.isActive ? 'Ya' : 'Tidak') },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'isActive', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    id: 'document-types',
    label: 'Tipe Dokumen',
    path: 'document-types',
    queryKey: 'document-types',
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'category', label: 'Kategori', render: (r) => r.category ?? '—' },
      { key: 'isActive', label: 'Aktif', render: (r) => (r.isActive ? 'Ya' : 'Tidak') },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'category', label: 'Kategori', type: 'text' },
      { key: 'isActive', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    id: 'inventory-categories',
    label: 'Kategori Inventaris',
    path: 'inventory-categories',
    queryKey: 'inventory-categories',
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'type', label: 'Tipe', render: (r) => (r.type === 'SPAREPART' ? 'Sparepart' : 'Consumable') },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      {
        key: 'type',
        label: 'Tipe',
        type: 'select',
        required: true,
        defaultValue: 'SPAREPART',
        options: [
          { value: 'SPAREPART', label: 'Sparepart' },
          { value: 'CONSUMABLE', label: 'Consumable' },
        ],
      },
    ],
  },
  {
    id: 'locations',
    label: 'Lokasi',
    path: 'locations',
    queryKey: 'locations',
    needsBranches: true,
    columns: [
      { key: 'code', label: 'Kode' },
      { key: 'name', label: 'Nama' },
      { key: 'branch', label: 'Cabang', render: (r) => r.branch?.name ?? '—' },
    ],
    fields: [
      { key: 'code', label: 'Kode', type: 'text', required: true },
      { key: 'name', label: 'Nama', type: 'text', required: true },
      { key: 'branchId', label: 'Cabang', type: 'branch', required: true },
    ],
  },
];

export const GaMasterPage = () => {
  const [activeTabId, setActiveTabId] = useState<string>(TABS[0].id);
  const activeTab = useMemo(() => TABS.find((t) => t.id === activeTabId)!, [activeTabId]);

  const canEdit = can('ga_master', 'edit');

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Data Master GA</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kelola cabang, cost center, kategori, tipe dokumen, dan lokasi.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={
                'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' +
                (tab.id === activeTabId
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <MasterTab key={activeTab.id} tab={activeTab} canEdit={canEdit} />
    </div>
  );
};

// ─── Per-tab list + create/edit ────────────────────────────────────
interface MasterTabProps {
  tab: TabDef;
  canEdit: boolean;
}

const MasterTab = ({ tab, canEdit }: MasterTabProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ga-master', tab.queryKey],
    queryFn: async () => (await api.get(`/ga/master/${tab.path}`)).data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/master/${tab.path}/${id}`),
    onSuccess: () => {
      toast.success('Data dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-master', tab.queryKey] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menghapus data.'),
  });

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };
  const openEdit = (row: any) => {
    setEditTarget(row);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} data</p>
        {canEdit && (
          <button className="btn-primary bg-teal-600 hover:bg-teal-700" onClick={openCreate}>
            <Plus size={15} /> Tambah {tab.label}
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                {tab.columns.map((col) => (
                  <th key={col.key} scope="col">{col.label}</th>
                ))}
                <th scope="col" className="w-20 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={tab.columns.length + 1} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={tab.columns.length + 1} className="py-16 text-center">
                    <Database className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada data {tab.label.toLowerCase()}.</p>
                    {canEdit && (
                      <button onClick={openCreate} className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium">
                        + Tambah data pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row: any) => (
                  <tr key={row.id}>
                    {tab.columns.map((col) => (
                      <td key={col.key} className="text-gray-700">
                        {col.render ? col.render(row) : (row[col.key] ?? '—')}
                      </td>
                    ))}
                    <td>
                      {canEdit && (
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={() => openEdit(row)}
                            className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <MasterModal
          key={editTarget?.id ?? 'new'}
          tab={tab}
          row={editTarget}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title={`Hapus ${tab.label}`}
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.name}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// ─── Create / Edit modal (generic, field-driven) ───────────────────
interface MasterModalProps {
  tab: TabDef;
  row: any | null;
  onClose: () => void;
}

const MasterModal = ({ tab, row, onClose }: MasterModalProps) => {
  const isEdit = !!row;
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const buildInitial = (): Record<string, any> => {
    const init: Record<string, any> = {};
    for (const f of tab.fields) {
      if (row) {
        init[f.key] = row[f.key] ?? (f.type === 'checkbox' ? false : '');
      } else {
        init[f.key] = f.defaultValue ?? (f.type === 'checkbox' ? false : '');
      }
    }
    return init;
  };

  const [form, setForm] = useState<Record<string, any>>(buildInitial);

  const setField = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const { data: branches = [] } = useQuery({
    queryKey: ['ga-master', 'branches'],
    queryFn: async () => (await api.get('/ga/master/branches')).data,
    enabled: !!tab.needsBranches,
  });

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit
        ? api.put(`/ga/master/${tab.path}/${row.id}`, payload)
        : api.post(`/ga/master/${tab.path}`, payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Data diperbarui.' : 'Data dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-master', tab.queryKey] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan data.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    for (const f of tab.fields) {
      if (f.required) {
        const v = form[f.key];
        if (v === '' || v == null) return setError(`${f.label} wajib diisi.`);
      }
    }

    const payload: Record<string, any> = {};
    for (const f of tab.fields) {
      const v = form[f.key];
      if (f.type === 'checkbox') {
        payload[f.key] = !!v;
      } else if (typeof v === 'string') {
        const trimmed = v.trim();
        payload[f.key] = trimmed === '' ? (f.required ? '' : null) : trimmed;
      } else {
        payload[f.key] = v;
      }
    }
    mutation.mutate(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? `Edit ${tab.label}` : `Tambah ${tab.label}`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {tab.fields.map((f) => (
            <div key={f.key}>
              {f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form[f.key]}
                    onChange={(e) => setField(f.key, e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  {f.label}
                </label>
              ) : (
                <>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </label>
                  {f.type === 'branch' ? (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    >
                      <option value="">— Pilih cabang —</option>
                      {branches.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                      ))}
                    </select>
                  ) : f.type === 'select' ? (
                    <select
                      value={form[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    >
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={form[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  )}
                </>
              )}
            </div>
          ))}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Batal
            </button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-60">
              {mutation.isPending && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

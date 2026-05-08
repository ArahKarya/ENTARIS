import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ChevronDown, ChevronRight, Play, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface FixedAsset {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  description: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  salvageValue: number;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  bookValue: number;
  status: string;
  assetAccount: { accountNumber: string; name: string };
  depreciationAccount: { accountNumber: string; name: string };
  accumulatedDepAccount: { accountNumber: string; name: string };
  user: { fullName: string };
  depreciationEntries?: DepEntry[];
}

interface DepEntry {
  id: string;
  periodDate: string;
  amount: number;
  isPosted: boolean;
  journalEntryId: string | null;
}

interface CoaOption { id: string; accountNumber: string; name: string }

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: assets = [], isLoading } = useQuery<FixedAsset[]>({
    queryKey: ['fixed-assets'],
    queryFn: async () => (await api.get('/fixed-assets')).data,
  });

  const { data: coa = [] } = useQuery<CoaOption[]>({
    queryKey: ['coa-flat'],
    queryFn: async () => (await api.get('/coa/flat')).data,
    enabled: showForm,
  });

  const { data: detail } = useQuery<FixedAsset>({
    queryKey: ['fixed-asset', expanded],
    queryFn: async () => (await api.get(`/fixed-assets/${expanded}`)).data,
    enabled: !!expanded,
  });

  const createMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.post('/fixed-assets', data)).data,
    onSuccess: () => { toast.success('Aset tetap berhasil dibuat'); qc.invalidateQueries({ queryKey: ['fixed-assets'] }); setShowForm(false); },
    onError: () => toast.error('Gagal membuat aset tetap'),
  });

  const depreciateMut = useMutation({
    mutationFn: async ({ assetId, entryId }: { assetId: string; entryId: string }) =>
      (await api.post(`/fixed-assets/${assetId}/depreciate`, { entryId })).data,
    onSuccess: () => { toast.success('Depresiasi berhasil diposting'); qc.invalidateQueries({ queryKey: ['fixed-assets'] }); qc.invalidateQueries({ queryKey: ['fixed-asset'] }); },
    onError: () => toast.error('Gagal posting depresiasi'),
  });

  const disposeMut = useMutation({
    mutationFn: async ({ assetId, disposalDate }: { assetId: string; disposalDate: string }) =>
      (await api.post(`/fixed-assets/${assetId}/dispose`, { disposalDate, disposalAmount: 0 })).data,
    onSuccess: () => { toast.success('Aset berhasil didisposisi'); qc.invalidateQueries({ queryKey: ['fixed-assets'] }); },
    onError: () => toast.error('Gagal disposisi aset'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      name: fd.get('name'),
      category: fd.get('category'),
      description: fd.get('description') || undefined,
      acquisitionDate: fd.get('acquisitionDate'),
      acquisitionCost: Number(fd.get('acquisitionCost')),
      usefulLifeMonths: Number(fd.get('usefulLifeMonths')),
      salvageValue: Number(fd.get('salvageValue') || 0),
      assetAccountId: fd.get('assetAccountId'),
      depreciationAccountId: fd.get('depreciationAccountId'),
      accumulatedDepAccountId: fd.get('accumulatedDepAccountId'),
    });
  };

  const totalCost = assets.filter((a) => a.status === 'Active').reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const totalBookValue = assets.filter((a) => a.status === 'Active').reduce((s, a) => s + Number(a.bookValue), 0);
  const totalAccDep = assets.filter((a) => a.status === 'Active').reduce((s, a) => s + Number(a.accumulatedDepreciation), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-blue-600" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Aset Tetap</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus size={16} /> Tambah Aset
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Harga Perolehan</p>
          <p className="text-lg font-bold mt-1" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(totalCost)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Akm. Depresiasi</p>
          <p className="text-lg font-bold mt-1 text-amber-600">Rp {fmt(totalAccDep)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Total Nilai Buku</p>
          <p className="text-lg font-bold mt-1 text-green-600">Rp {fmt(totalBookValue)}</p>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 mb-6 space-y-4">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>Tambah Aset Tetap</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1">Nama Aset *</label>
              <input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Kategori *</label>
              <input name="category" required placeholder="Kendaraan, Mesin, Gedung, dll" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Tanggal Perolehan *</label>
              <input name="acquisitionDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Harga Perolehan (Rp) *</label>
              <input name="acquisitionCost" type="number" required min="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Masa Manfaat (bulan) *</label>
              <input name="usefulLifeMonths" type="number" required min="1" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Nilai Sisa (Rp)</label>
              <input name="salvageValue" type="number" min="0" defaultValue="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Akun Aset *</label>
              <select name="assetAccountId" required className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Pilih akun...</option>
                {coa.filter((a) => a.accountNumber.startsWith('1.')).map((a) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} - {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Akun Beban Depresiasi *</label>
              <select name="depreciationAccountId" required className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Pilih akun...</option>
                {coa.filter((a) => a.accountNumber.startsWith('6.')).map((a) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} - {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Akun Akm. Depresiasi *</label>
              <select name="accumulatedDepAccountId" required className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Pilih akun...</option>
                {coa.filter((a) => a.accountNumber.startsWith('1.')).map((a) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} - {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Keterangan</label>
              <input name="description" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Batal</button>
          </div>
        </form>
      )}

      {/* Asset List */}
      {isLoading ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Memuat...</div>
      ) : assets.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Belum ada aset tetap.</div>
      ) : (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div key={asset.id} className="card overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30"
                onClick={() => setExpanded(expanded === asset.id ? null : asset.id)}
              >
                {expanded === asset.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>{asset.assetNumber}</span>
                    <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{asset.name}</span>
                    <span className="badge badge-gray">{asset.category}</span>
                    <span className={cn('badge', asset.status === 'Active' ? 'badge-green' : 'badge-red')}>{asset.status}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Perolehan: Rp {fmt(Number(asset.acquisitionCost))} | Nilai Buku: Rp {fmt(Number(asset.bookValue))} | Akm. Dep: Rp {fmt(Number(asset.accumulatedDepreciation))}
                  </p>
                </div>
                {asset.status === 'Active' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDisposeTarget({ id: asset.id, name: asset.name ?? asset.assetNumber ?? '' }); }}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Disposisi"
                    aria-label="Disposisi aset"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {/* Depreciation Schedule */}
              {expanded === asset.id && detail && (
                <div className="border-t px-4 pb-4" style={{ borderColor: 'var(--color-border-light)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mt-3 mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    Jadwal Depresiasi ({detail.depreciationEntries?.length || 0} periode)
                  </p>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Periode</th>
                          <th className="text-right">Jumlah</th>
                          <th>Status</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.depreciationEntries || []).map((dep) => (
                          <tr key={dep.id}>
                            <td className="text-xs">{fmtDate(dep.periodDate)}</td>
                            <td className="text-right tabular-nums">Rp {fmt(Number(dep.amount))}</td>
                            <td>
                              <span className={cn('badge', dep.isPosted ? 'badge-green' : 'badge-yellow')}>
                                {dep.isPosted ? 'Posted' : 'Belum'}
                              </span>
                            </td>
                            <td>
                              {!dep.isPosted && asset.status === 'Active' && (
                                <button
                                  onClick={() => depreciateMut.mutate({ assetId: asset.id, entryId: dep.id })}
                                  disabled={depreciateMut.isPending}
                                  className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                                >
                                  <Play size={12} /> Posting
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={disposeTarget !== null}
        title="Disposisi Aset"
        message={`Yakin ingin disposisi aset "${disposeTarget?.name}"? Aset akan ditandai disposed dan tidak lagi dihitung depresiasinya.`}
        confirmLabel="Ya, Disposisi"
        variant="danger"
        onCancel={() => setDisposeTarget(null)}
        onConfirm={() => {
          if (disposeTarget) {
            disposeMut.mutate({ assetId: disposeTarget.id, disposalDate: new Date().toISOString().substring(0, 10) });
          }
          setDisposeTarget(null);
        }}
      />
    </div>
  );
}

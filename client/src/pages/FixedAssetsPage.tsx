import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ChevronDown, ChevronRight, Play, Trash2, CalendarClock, Loader2, X, AlertCircle } from 'lucide-react';
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

// Default ke bulan SEBELUMNYA (yg sudah selesai) untuk menghindari user
// mem-post depresiasi bulan berjalan terlalu cepat.
function defaultPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface BulkPreviewItem {
  assetNumber: string;
  name: string;
  category: string;
  amount: number;
  periodDate: string;
}

interface BulkResponse {
  posted: number;
  totalAmount: number;
  jeNumbers?: string[];
  skipped?: number;
  message?: string;
  dryRun?: boolean;
  items?: BulkPreviewItem[];
}

export default function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<string>(defaultPrevMonth());
  const [bulkPreview, setBulkPreview] = useState<BulkResponse | null>(null);

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

  // Bulk depreciation: preview (dry-run) lalu confirm post
  const bulkPreviewMut = useMutation<BulkResponse, Error, { month: string }>({
    mutationFn: async ({ month }) =>
      (await api.post('/fixed-assets/depreciate-bulk', { month, dryRun: true })).data,
    onSuccess: (d) => setBulkPreview(d),
    onError: () => toast.error('Gagal mengambil preview depresiasi'),
  });

  const bulkPostMut = useMutation<BulkResponse, Error, { month: string }>({
    mutationFn: async ({ month }) =>
      (await api.post('/fixed-assets/depreciate-bulk', { month })).data,
    onSuccess: (d) => {
      toast.success(d.message ?? `Berhasil post ${d.posted} depresiasi (total Rp ${fmt(d.totalAmount)})`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['financial-ratios'] });
      setBulkOpen(false);
      setBulkPreview(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Gagal posting depresiasi bulk'),
  });

  const openBulkModal = () => {
    const m = defaultPrevMonth();
    setBulkMonth(m);
    setBulkPreview(null);
    setBulkOpen(true);
    bulkPreviewMut.mutate({ month: m });
  };

  const onBulkMonthChange = (m: string) => {
    setBulkMonth(m);
    setBulkPreview(null);
    if (/^\d{4}-\d{2}$/.test(m)) bulkPreviewMut.mutate({ month: m });
  };

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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-blue-600" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Aset Tetap</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openBulkModal} className="btn-secondary">
            <CalendarClock size={15} /> Posting Bulanan
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus size={16} /> Tambah Aset
          </button>
        </div>
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

      {/* Bulk Depreciation Modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !bulkPostMut.isPending) { setBulkOpen(false); setBulkPreview(null); } }}
        >
          <div className="rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600">
                  <CalendarClock size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Posting Depresiasi Bulanan
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Post semua jadwal depresiasi yg jatuh di bulan terpilih sekaligus
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (!bulkPostMut.isPending) { setBulkOpen(false); setBulkPreview(null); } }}
                disabled={bulkPostMut.isPending}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Bulan Periode
                </label>
                <input
                  type="month"
                  value={bulkMonth}
                  onChange={(e) => onBulkMonthChange(e.target.value)}
                  disabled={bulkPostMut.isPending}
                  className="border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Default: bulan sebelumnya (yang sudah selesai). Bisa diubah untuk periode lain.
                </p>
              </div>

              {bulkPreviewMut.isPending ? (
                <div className="py-8 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  <Loader2 size={16} className="animate-spin" /> Memuat preview…
                </div>
              ) : !bulkPreview ? null : bulkPreview.posted === 0 && (!bulkPreview.items || bulkPreview.items.length === 0) ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-900 p-4 flex items-start gap-3">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      Tidak ada depresiasi untuk periode ini
                    </p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                      {bulkPreview.message ?? 'Semua entry sudah di-post atau tidak ada aset di periode tersebut.'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-900 p-4">
                    <p className="text-xs text-blue-700 dark:text-blue-300 uppercase tracking-wide font-medium">
                      Preview Posting
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Aset yang akan di-post</p>
                        <p className="text-lg font-bold tabular-nums text-blue-900 dark:text-blue-100">
                          {bulkPreview.items?.length ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Total beban depresiasi</p>
                        <p className="text-lg font-bold tabular-nums text-blue-900 dark:text-blue-100">
                          Rp {fmt(bulkPreview.totalAmount)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown per kategori */}
                  {bulkPreview.items && bulkPreview.items.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide mb-1.5 font-medium"
                        style={{ color: 'var(--color-text-muted)' }}>
                        Breakdown per kategori
                      </p>
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                        {(() => {
                          const grouped = bulkPreview.items!.reduce<Record<string, { count: number; total: number }>>(
                            (acc, it) => {
                              acc[it.category] = acc[it.category] ?? { count: 0, total: 0 };
                              acc[it.category].count++;
                              acc[it.category].total += it.amount;
                              return acc;
                            }, {});
                          return Object.entries(grouped).map(([cat, d]) => (
                            <div key={cat} className="flex items-center justify-between px-3 py-2 text-xs border-b last:border-b-0"
                              style={{ borderColor: 'var(--color-border)' }}>
                              <span style={{ color: 'var(--color-text-primary)' }}>
                                <span className="font-medium">{cat}</span>
                                <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>{d.count} aset</span>
                              </span>
                              <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                                Rp {fmt(d.total)}
                              </span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs space-y-1"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    <p className="font-semibold">JE yang akan dibuat:</p>
                    <p className="font-mono">
                      DR <span className="text-blue-600">6.21/6.23/6.35</span> Beban Penyusutan (per kategori)
                    </p>
                    <p className="font-mono">
                      CR <span className="text-emerald-600">1.7.1/1.7.3/1.7.5</span> Akm Penyusutan
                    </p>
                    <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
                      Satu JE per aset ({bulkPreview.items?.length ?? 0} jurnal) supaya traceability per-aset terjaga.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t flex items-center justify-end gap-2"
              style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => { setBulkOpen(false); setBulkPreview(null); }}
                disabled={bulkPostMut.isPending}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={() => bulkPostMut.mutate({ month: bulkMonth })}
                disabled={
                  bulkPostMut.isPending
                  || bulkPreviewMut.isPending
                  || !bulkPreview
                  || !bulkPreview.items?.length
                }
                className="btn-primary disabled:opacity-40"
              >
                {bulkPostMut.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Memposting…</>
                  : <><Play size={14} /> Post {bulkPreview?.items?.length ?? 0} Depresiasi</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

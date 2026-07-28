import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, ChevronDown, ChevronRight, Play, Trash2, CalendarClock, Loader2, X, AlertCircle, Pencil, Download, Upload, FileText } from 'lucide-react';
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

interface ParsedImportRow {
  name: string;
  category: string;
  description?: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  salvageValue: number;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepAccountId: string;
  // for preview display
  assetAccountLabel?: string;
  depAccountLabel?: string;
  accumAccountLabel?: string;
  _error?: string;
}

export default function FixedAssetsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<string>(defaultPrevMonth());
  const [bulkPreview, setBulkPreview] = useState<BulkResponse | null>(null);
  // Konfirmasi single-posting depresiasi — cegah klik tidak sengaja.
  const [confirmPostTarget, setConfirmPostTarget] = useState<{
    assetId: string; assetName: string; assetNumber: string;
    entryId: string; periodDate: string; amount: number;
    depAccount: string; accumAccount: string;
  } | null>(null);
  // Edit aset (soft fields only)
  const [editTarget, setEditTarget] = useState<FixedAsset | null>(null);
  // Import CSV
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedImportRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: assets = [], isLoading } = useQuery<FixedAsset[]>({
    queryKey: ['fixed-assets'],
    queryFn: async () => (await api.get('/fixed-assets')).data,
  });

  const { data: coa = [] } = useQuery<CoaOption[]>({
    queryKey: ['coa-flat'],
    queryFn: async () => (await api.get('/coa/flat')).data,
    enabled: showForm || importOpen,
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

  // Edit aset metadata (soft fields only)
  const editMut = useMutation({
    mutationFn: async (data: { id: string; name: string; category: string; description: string | null }) =>
      (await api.put(`/fixed-assets/${data.id}`, {
        name: data.name, category: data.category, description: data.description,
      })).data,
    onSuccess: () => {
      toast.success('Aset diperbarui');
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      setEditTarget(null);
    },
    onError: () => toast.error('Gagal mengupdate aset'),
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editTarget) return;
    const fd = new FormData(e.currentTarget);
    editMut.mutate({
      id: editTarget.id,
      name: String(fd.get('name') || ''),
      category: String(fd.get('category') || ''),
      description: (fd.get('description') ? String(fd.get('description')) : null),
    });
  };

  // Export CSV — client-side dari assets list
  const handleExportCsv = () => {
    if (assets.length === 0) {
      toast.error('Tidak ada aset untuk di-export');
      return;
    }
    const cols = [
      'asset_number', 'name', 'category', 'description', 'acquisition_date',
      'acquisition_cost', 'useful_life_months', 'salvage_value',
      'accumulated_depreciation', 'book_value', 'status',
      'asset_account', 'depreciation_account', 'accumulated_dep_account',
    ];
    const escape = (s: any) => {
      const v = s == null ? '' : String(s);
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [
      cols.join(','),
      ...assets.map((a) => [
        a.assetNumber, a.name, a.category, a.description ?? '',
        a.acquisitionDate?.substring(0, 10) ?? '',
        Number(a.acquisitionCost),
        a.usefulLifeMonths,
        Number(a.salvageValue),
        Number(a.accumulatedDepreciation),
        Number(a.bookValue),
        a.status,
        `${a.assetAccount.accountNumber} ${a.assetAccount.name}`,
        `${a.depreciationAccount.accountNumber} ${a.depreciationAccount.name}`,
        `${a.accumulatedDepAccount.accountNumber} ${a.accumulatedDepAccount.name}`,
      ].map(escape).join(',')),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixed-assets-${new Date().toISOString().substring(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${assets.length} aset di-export`);
  };

  // Import CSV
  const downloadImportTemplate = () => {
    const sampleAcctAsset = coa.find((a) => a.accountNumber.startsWith('1.6'))?.id ?? '<uuid-akun-aset>';
    const sampleAcctDep = coa.find((a) => a.accountNumber.startsWith('6.'))?.id ?? '<uuid-akun-beban>';
    const sampleAcctAcc = coa.find((a) => a.accountNumber.startsWith('1.7'))?.id ?? '<uuid-akun-akm>';
    const header = 'name,category,description,acquisition_date,acquisition_cost,useful_life_months,salvage_value,asset_account_id,depreciation_account_id,accumulated_dep_account_id';
    const sample = `Mesin Contoh,Mesin,Mesin contoh untuk template,2026-01-15,50000000,96,0,${sampleAcctAsset},${sampleAcctDep},${sampleAcctAcc}`;
    const blob = new Blob(['﻿' + header + '\n' + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fixed-assets-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openImportModal = () => {
    setImportPreview(null);
    setImportError(null);
    setImportOpen(true);
  };

  const onImportFile = async (file: File) => {
    setImportError(null);
    setImportPreview(null);
    try {
      const text = await file.text();
      // Strip BOM
      const clean = text.replace(/^﻿/, '').trim();
      const lines = clean.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setImportError('CSV kosong atau hanya berisi header.');
        return;
      }
      const splitCsvLine = (line: string) => {
        const cells: string[] = [];
        let buf = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') {
            if (inQuote && line[i + 1] === '"') { buf += '"'; i++; }
            else inQuote = !inQuote;
          } else if (c === ',' && !inQuote) {
            cells.push(buf); buf = '';
          } else buf += c;
        }
        cells.push(buf);
        return cells.map((s) => s.trim());
      };
      const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const idx = (col: string) => header.indexOf(col);
      const reqCols = [
        'name', 'category', 'acquisition_date', 'acquisition_cost',
        'useful_life_months', 'asset_account_id', 'depreciation_account_id',
        'accumulated_dep_account_id',
      ];
      const missing = reqCols.filter((c) => idx(c) < 0);
      if (missing.length > 0) {
        setImportError(`Kolom wajib hilang: ${missing.join(', ')}.`);
        return;
      }
      const acctById = new Map(coa.map((c) => [c.id, c]));
      const rows: ParsedImportRow[] = lines.slice(1).map((line, lineNo) => {
        const cells = splitCsvLine(line);
        const get = (col: string) => cells[idx(col)] ?? '';
        const aAcc = acctById.get(get('asset_account_id'));
        const dAcc = acctById.get(get('depreciation_account_id'));
        const accAcc = acctById.get(get('accumulated_dep_account_id'));
        const row: ParsedImportRow = {
          name: get('name'),
          category: get('category'),
          description: get('description') || null,
          acquisitionDate: get('acquisition_date'),
          acquisitionCost: Number(get('acquisition_cost')),
          usefulLifeMonths: Number(get('useful_life_months')),
          salvageValue: Number(get('salvage_value') || 0),
          assetAccountId: get('asset_account_id'),
          depreciationAccountId: get('depreciation_account_id'),
          accumulatedDepAccountId: get('accumulated_dep_account_id'),
          assetAccountLabel: aAcc ? `${aAcc.accountNumber} ${aAcc.name}` : '?',
          depAccountLabel: dAcc ? `${dAcc.accountNumber} ${dAcc.name}` : '?',
          accumAccountLabel: accAcc ? `${accAcc.accountNumber} ${accAcc.name}` : '?',
        };
        const errs: string[] = [];
        if (!row.name) errs.push('name kosong');
        if (!row.category) errs.push('category kosong');
        if (!row.acquisitionDate) errs.push('acquisition_date kosong');
        if (!(row.acquisitionCost > 0)) errs.push('acquisition_cost tidak valid');
        if (!(row.usefulLifeMonths > 0)) errs.push('useful_life_months tidak valid');
        if (!aAcc) errs.push('asset_account_id tidak dikenal');
        if (!dAcc) errs.push('depreciation_account_id tidak dikenal');
        if (!accAcc) errs.push('accumulated_dep_account_id tidak dikenal');
        if (errs.length > 0) row._error = `Baris ${lineNo + 2}: ${errs.join('; ')}`;
        return row;
      });
      setImportPreview(rows);
    } catch (err: any) {
      setImportError(`Gagal parse CSV: ${err.message}`);
    }
  };

  const importMut = useMutation({
    mutationFn: async (rows: ParsedImportRow[]) =>
      (await api.post('/fixed-assets/import', {
        assets: rows.map((r) => ({
          name: r.name,
          category: r.category,
          description: r.description,
          acquisitionDate: r.acquisitionDate,
          acquisitionCost: r.acquisitionCost,
          usefulLifeMonths: r.usefulLifeMonths,
          salvageValue: r.salvageValue,
          assetAccountId: r.assetAccountId,
          depreciationAccountId: r.depreciationAccountId,
          accumulatedDepAccountId: r.accumulatedDepAccountId,
        })),
      })).data,
    onSuccess: (d: any) => {
      toast.success(`${d.count} aset berhasil di-import (${d.scheduleEntries} entry depresiasi).`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      setImportOpen(false);
      setImportPreview(null);
    },
    onError: (e: any) => {
      setImportError(e?.response?.data?.error ?? 'Gagal import.');
    },
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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-blue-600" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Aset Tetap</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExportCsv} className="btn-secondary" title="Export CSV">
            <Download size={15} /> Export
          </button>
          <button onClick={openImportModal} className="btn-secondary" title="Import CSV">
            <Upload size={15} /> Import
          </button>
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
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTarget(asset); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit metadata"
                      aria-label="Edit aset"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDisposeTarget({ id: asset.id, name: asset.name ?? asset.assetNumber ?? '' }); }}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Disposisi"
                      aria-label="Disposisi aset"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
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
                                  onClick={() => setConfirmPostTarget({
                                    assetId: asset.id,
                                    assetName: asset.name,
                                    assetNumber: asset.assetNumber,
                                    entryId: dep.id,
                                    periodDate: dep.periodDate,
                                    amount: Number(dep.amount),
                                    depAccount: `${asset.depreciationAccount.accountNumber} ${asset.depreciationAccount.name}`,
                                    accumAccount: `${asset.accumulatedDepAccount.accountNumber} ${asset.accumulatedDepAccount.name}`,
                                  })}
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

      {/* Confirm single-posting depresiasi */}
      {confirmPostTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !depreciateMut.isPending) setConfirmPostTarget(null); }}
        >
          <div className="rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600">
                <AlertCircle size={16} />
              </div>
              <div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Konfirmasi Posting Depresiasi
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Pastikan aset & periode benar sebelum lanjut
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Aset</span>
                  <span className="font-medium font-mono text-xs" style={{ color: 'var(--color-text-primary)' }}>
                    {confirmPostTarget.assetNumber}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nama</span>
                  <span className="font-medium text-right" style={{ color: 'var(--color-text-primary)' }}>
                    {confirmPostTarget.assetName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Periode</span>
                  <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {fmtDate(confirmPostTarget.periodDate)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-1.5 mt-1.5" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Jumlah Beban</span>
                  <span className="font-bold text-base text-amber-600 tabular-nums">
                    Rp {fmt(confirmPostTarget.amount)}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs">
                <p className="font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>JE yg akan dibuat:</p>
                <p className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  DR <span className="text-blue-600">{confirmPostTarget.depAccount}</span>
                </p>
                <p className="font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                  CR <span className="text-emerald-600">{confirmPostTarget.accumAccount}</span>
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <strong>Tips:</strong> untuk post seluruh aset sekaligus, pakai tombol{' '}
                <span className="font-semibold">Posting Bulanan</span> di pojok kanan atas.
              </p>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => setConfirmPostTarget(null)}
                disabled={depreciateMut.isPending}
                className="btn-secondary"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  depreciateMut.mutate(
                    { assetId: confirmPostTarget.assetId, entryId: confirmPostTarget.entryId },
                    { onSettled: () => setConfirmPostTarget(null) },
                  );
                }}
                disabled={depreciateMut.isPending}
                className="btn-primary disabled:opacity-40"
              >
                {depreciateMut.isPending
                  ? <><Loader2 size={14} className="animate-spin" /> Memposting…</>
                  : <><Play size={14} /> Ya, Post Depresiasi</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Edit Asset Modal (soft fields) */}
      {editTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !editMut.isPending) setEditTarget(null); }}
        >
          <div className="rounded-xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
          >
            <form onSubmit={handleEditSubmit}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600">
                    <Pencil size={16} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      Edit Metadata Aset
                    </h2>
                    <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      {editTarget.assetNumber}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!editMut.isPending) setEditTarget(null); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Nama *
                  </label>
                  <input name="name" required defaultValue={editTarget.name}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Kategori *
                  </label>
                  <input name="category" required defaultValue={editTarget.category}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Keterangan
                  </label>
                  <textarea name="description" rows={3} defaultValue={editTarget.description ?? ''}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }} />
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200">
                  <strong>Catatan:</strong> hanya field metadata (nama, kategori, keterangan) yg bisa
                  diedit. Untuk koreksi nominal (harga perolehan, masa manfaat, akun GL), lakukan
                  disposisi aset lama lalu buat aset baru — supaya jurnal terkait tetap konsisten.
                </div>
              </div>
              <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button"
                  onClick={() => { if (!editMut.isPending) setEditTarget(null); }}
                  disabled={editMut.isPending}
                  className="btn-secondary"
                >
                  Batal
                </button>
                <button type="submit" disabled={editMut.isPending} className="btn-primary disabled:opacity-40">
                  {editMut.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Menyimpan…</>
                    : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !importMut.isPending) { setImportOpen(false); setImportPreview(null); setImportError(null); } }}
        >
          <div className="rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600">
                  <Upload size={16} />
                </div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Import Aset Tetap (CSV)
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    Bulk-create aset baru + auto-generate jadwal depresiasi
                  </p>
                </div>
              </div>
              <button
                onClick={() => { if (!importMut.isPending) { setImportOpen(false); setImportPreview(null); setImportError(null); } }}
                disabled={importMut.isPending}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {!importPreview && !importError && (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-900 p-3 text-xs space-y-1.5"
                    style={{ color: 'var(--color-text-secondary)' }}>
                    <p className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                      <FileText size={13} /> Format CSV
                    </p>
                    <p>Kolom wajib (case-insensitive header):</p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5 text-[11px]">
                      <li><code className="font-mono">name</code>, <code className="font-mono">category</code>, <code className="font-mono">acquisition_date</code> (YYYY-MM-DD)</li>
                      <li><code className="font-mono">acquisition_cost</code>, <code className="font-mono">useful_life_months</code></li>
                      <li><code className="font-mono">asset_account_id</code>, <code className="font-mono">depreciation_account_id</code>, <code className="font-mono">accumulated_dep_account_id</code> (UUID akun)</li>
                    </ul>
                    <p>Opsional: <code className="font-mono">description</code>, <code className="font-mono">salvage_value</code></p>
                    <button
                      type="button"
                      onClick={downloadImportTemplate}
                      className="mt-1 text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Download size={11} /> Download template
                    </button>
                  </div>

                  <label className="block">
                    <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                      style={{ borderColor: 'var(--color-border)' }}>
                      <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        Pilih file CSV
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        Max 500 baris per import
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImportFile(f);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    />
                  </label>
                </>
              )}

              {importError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {importPreview && importPreview.length > 0 && (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-900 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide font-medium text-emerald-700 dark:text-emerald-300">
                        Preview Import
                      </p>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                        {importPreview.length} baris terbaca
                        {importPreview.some((r) => r._error) && (
                          <span className="text-red-600 ml-2">
                            ({importPreview.filter((r) => r._error).length} error)
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setImportPreview(null); setImportError(null); }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Pilih file lain
                    </button>
                  </div>

                  <div className="rounded-lg border overflow-auto max-h-72" style={{ borderColor: 'var(--color-border)' }}>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>No</th>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Nama</th>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Kategori</th>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Tanggal</th>
                          <th className="text-right px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Harga</th>
                          <th className="text-right px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Umur</th>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Akun Aset</th>
                          <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((r, i) => (
                          <tr key={i} className={cn('border-t', r._error && 'bg-red-50/40 dark:bg-red-950/20')}
                            style={{ borderColor: 'var(--color-border)' }}>
                            <td className="px-2 py-1.5 text-[10px] text-gray-400 tabular-nums">{i + 1}</td>
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5">{r.category}</td>
                            <td className="px-2 py-1.5">{r.acquisitionDate}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">Rp {fmt(r.acquisitionCost)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{r.usefulLifeMonths}mo</td>
                            <td className="px-2 py-1.5 truncate max-w-[120px]" title={r.assetAccountLabel}>
                              {r.assetAccountLabel}
                            </td>
                            <td className="px-2 py-1.5">
                              {r._error
                                ? <span className="text-red-600 text-[10px]" title={r._error}>✗ Error</span>
                                : <span className="text-emerald-600 text-[10px]">✓ OK</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.some((r) => r._error) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs space-y-0.5"
                      style={{ color: 'var(--color-text-secondary)' }}>
                      <p className="font-semibold flex items-center gap-1 text-amber-800 dark:text-amber-200">
                        <AlertCircle size={12} /> Baris dengan error:
                      </p>
                      {importPreview.filter((r) => r._error).slice(0, 5).map((r, i) => (
                        <p key={i} className="font-mono text-[11px] text-amber-700 dark:text-amber-300">{r._error}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={() => { setImportOpen(false); setImportPreview(null); setImportError(null); }}
                disabled={importMut.isPending}
                className="btn-secondary"
              >
                Batal
              </button>
              {importPreview && !importPreview.some((r) => r._error) && importPreview.length > 0 && (
                <button
                  onClick={() => importMut.mutate(importPreview)}
                  disabled={importMut.isPending}
                  className="btn-primary disabled:opacity-40"
                >
                  {importMut.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Mengimport…</>
                    : <><Upload size={14} /> Import {importPreview.length} Aset</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

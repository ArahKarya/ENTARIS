import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface ImportError {
  row: number;
  message: string;
}

interface PreviewResult {
  data: any[];
  errors: ImportError[];
  total: number;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: ImportError[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  importType: 'parties' | 'coa' | 'journals' | 'inventory';
}

const typeConfig = {
  parties: {
    title: 'Import Mitra Bisnis',
    endpoint: '/import/parties',
    columns: ['name', 'partyType', 'phone', 'email', 'address', 'taxId', 'openingBalance', 'depositBalance', 'customerDepositBalance'],
    templateHeaders: 'name,partyType,phone,email,address,taxId,openingBalance,depositBalance,customerDepositBalance',
    templateSample: 'PT ABC,Customer,081234567890,abc@example.com,Jl. Contoh No.1,1234567890,5000000,0,0',
    queryKeys: ['parties', 'parties-all', 'coa', 'coa-all', 'balance-sheet', 'trial-balance', 'profit-loss', 'journals', 'dashboard-metrics'],
  },
  coa: {
    title: 'Import Bagan Akun',
    endpoint: '/import/coa',
    columns: ['accountNumber', 'name', 'rootType', 'accountType', 'parentNumber', 'isGroup', 'openingBalance'],
    templateHeaders: 'accountNumber,name,rootType,accountType,parentNumber,isGroup,openingBalance',
    templateSample: '1.1.1,Kas,ASSET,ASSET,,false,5000000',
    queryKeys: ['coa', 'coa-all', 'balance-sheet', 'trial-balance', 'profit-loss', 'journals', 'dashboard-metrics'],
  },
  journals: {
    title: 'Import Jurnal',
    endpoint: '/import/journals',
    columns: ['date', 'narration', 'accountNumber', 'debit', 'credit', 'description'],
    templateHeaders: 'date,narration,accountNumber,debit,credit,description',
    templateSample: '2026-03-22,Penjualan tunai,1100,1000000,0,Kas masuk',
    queryKeys: ['journals', 'gl', 'coa', 'coa-all', 'balance-sheet', 'trial-balance', 'profit-loss', 'dashboard-metrics'],
  },
  inventory: {
    title: 'Import Master Item',
    endpoint: '/import/inventory',
    columns: ['code', 'name', 'unit', 'category', 'description', 'minimumStock', 'openingQty', 'openingPrice'],
    templateHeaders: 'code,name,unit,category,description,minimumStock,openingQty,openingPrice',
    templateSample: 'GKP,Gabah Kering Panen,Kg,Bahan Baku,,1000,500,10000',
    queryKeys: ['inventory-items', 'coa', 'coa-all', 'balance-sheet', 'trial-balance', 'profit-loss', 'journals', 'dashboard-metrics'],
  },
};

const ImportModal = ({ isOpen, onClose, importType }: Props) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const config = typeConfig[importType];

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`${config.endpoint}?preview=true`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as PreviewResult;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal memproses file.');
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(config.endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data as ImportResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('result');
      config.queryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      if (data.success > 0) toast.success(`${data.success} data berhasil diimport.`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal mengimport data.');
    },
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    previewMutation.mutate(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleConfirmImport = () => {
    if (selectedFile) importMutation.mutate(selectedFile);
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get(`/import/template/${importType}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${importType}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback to CSV if backend template endpoint not available
      const csvContent = `${config.templateHeaders}\n${config.templateSample}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${importType}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-modal-title" className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-12 overflow-y-auto" onClick={handleClose}>
      <div
        className="w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-3xl rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {config.title}
            </h2>
            {/* Step indicator */}
            <div className="flex items-center gap-1 ml-2">
              {['upload', 'preview', 'result'].map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    'w-2 h-2 rounded-full',
                    step === s ? 'bg-blue-600' : i <= ['upload', 'preview', 'result'].indexOf(step) ? 'bg-blue-300' : 'bg-gray-200'
                  )}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
                  isDragging
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/30'
                )}
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 size={32} className="mx-auto mb-3 animate-spin text-blue-500" />
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Memproses file...
                    </p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Seret file ke sini, atau klik untuk memilih
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      Mendukung format CSV, XLSX, XLS (maks 5MB)
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = '';
                  }}
                />
              </div>

              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Download size={13} />
                Download Template Excel
              </button>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {selectedFile?.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {preview.data.length} data valid, {preview.errors.length} error
                  </p>
                </div>
              </div>

              {/* Errors */}
              {preview.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                    Error ({preview.errors.length}):
                  </p>
                  {preview.errors.slice(0, 10).map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      Baris {err.row}: {err.message}
                    </p>
                  ))}
                  {preview.errors.length > 10 && (
                    <p className="text-xs text-red-500 mt-1">...dan {preview.errors.length - 10} error lainnya</p>
                  )}
                </div>
              )}

              {/* Preview table */}
              {preview.data.length > 0 && (
                <div className="border rounded-lg overflow-x-auto max-h-72" style={{ borderColor: 'var(--color-border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                        <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>#</th>
                        {config.columns.map((col) => (
                          <th key={col} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.data.slice(0, 20).map((row: any, i: number) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--color-border-light)' }}>
                          <td className="px-3 py-1.5" style={{ color: 'var(--color-text-muted)' }}>{i + 1}</td>
                          {config.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                              {String(row[col] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.data.length > 20 && (
                    <div className="px-3 py-2 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                      ...menampilkan 20 dari {preview.data.length} data
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setStep('upload'); setSelectedFile(null); setPreview(null); }} className="btn-secondary">
                  Ganti File
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importMutation.isPending || preview.data.length === 0}
                  className="btn-primary"
                >
                  {importMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Import {preview.data.length} Data
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="text-center py-4">
                {result.success > 0 ? (
                  <CheckCircle size={40} className="mx-auto mb-3 text-green-500" />
                ) : (
                  <AlertCircle size={40} className="mx-auto mb-3 text-red-500" />
                )}
                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Import Selesai
                </p>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{result.success}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Berhasil</p>
                  </div>
                  {result.failed > 0 && (
                    <div>
                      <p className="text-2xl font-bold text-red-500">{result.failed}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Gagal</p>
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                    Error Detail:
                  </p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      {err.row > 0 ? `Baris ${err.row}: ` : ''}{err.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={handleClose} className="btn-primary">
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;

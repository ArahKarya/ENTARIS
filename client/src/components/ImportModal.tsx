import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OverlayBody, OverlayFooter, OverlayHeader, ScrollRegion } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

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

  const STEPS = ['upload', 'preview', 'result'] as const;
  const busy = previewMutation.isPending || importMutation.isPending;
  const stepLabel = { upload: 'Unggah file', preview: 'Pratinjau data', result: 'Hasil import' }[step];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && handleClose()}>
      <DialogContent size="lg" className={cn(dialogShellClass, 'lg:max-w-3xl')}>
        <OverlayHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-primary" aria-hidden />
            {config.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="flex items-center gap-1" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={cn(
                    'size-2 rounded-full',
                    step === s ? 'bg-primary' : i <= STEPS.indexOf(step) ? 'bg-primary/40' : 'bg-border',
                  )}
                />
              ))}
            </span>
            Langkah {STEPS.indexOf(step) + 1} dari {STEPS.length}: {stepLabel}
          </DialogDescription>
        </OverlayHeader>

        <OverlayBody>
          {step === 'upload' && (
            <div className="grid gap-4">
              <button
                type="button"
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                disabled={previewMutation.isPending}
                className={cn(
                  'rounded-xl border-2 border-dashed p-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isDragging ? 'border-primary bg-primary-subtle' : 'border-border hover:border-primary/50 hover:bg-accent',
                )}
              >
                {previewMutation.isPending ? (
                  <span role="status" className="block">
                    <Loader2 className="mx-auto mb-3 size-8 animate-spin text-primary" aria-hidden />
                    <span className="block text-sm font-medium text-foreground">Memproses file...</span>
                  </span>
                ) : (
                  <>
                    <Upload className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
                    <span className="block text-sm font-medium text-foreground">Seret file ke sini, atau klik untuk memilih</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Mendukung format CSV, XLSX, XLS (maks 5MB)</span>
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                aria-label="Pilih file import"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = '';
                }}
              />
              <Button type="button" variant="link" size="sm" className="justify-self-start" onClick={downloadTemplate}>
                <Download aria-hidden /> Download Template Excel
              </Button>
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="grid gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">{selectedFile?.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {preview.data.length} data valid, {preview.errors.length} error
                </p>
              </div>

              {preview.errors.length > 0 && (
                <div role="alert" className="max-h-32 overflow-y-auto rounded-lg bg-danger-subtle p-3 text-danger-text">
                  <p className="mb-1 text-xs font-semibold">Error ({preview.errors.length}):</p>
                  {preview.errors.slice(0, 10).map((err, i) => (
                    <p key={i} className="text-xs">Baris {err.row}: {err.message}</p>
                  ))}
                  {preview.errors.length > 10 && (
                    <p className="mt-1 text-xs">...dan {preview.errors.length - 10} error lainnya</p>
                  )}
                </div>
              )}

              {preview.data.length > 0 && (
                <ScrollRegion label="Pratinjau data import" className="max-h-72 overflow-y-auto border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b border-border">
                        <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                        {config.columns.map((col) => (
                          <th key={col} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.data.slice(0, 20).map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          {config.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-foreground">{String(row[col] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.data.length > 20 && (
                    <div className="px-3 py-2 text-center text-xs text-muted-foreground">
                      ...menampilkan 20 dari {preview.data.length} data
                    </div>
                  )}
                </ScrollRegion>
              )}
            </div>
          )}

          {step === 'result' && result && (
            <div className="grid gap-4">
              <div className="py-4 text-center" role="status">
                {result.success > 0 ? (
                  <CheckCircle className="mx-auto mb-3 size-10 text-success-text" aria-hidden />
                ) : (
                  <AlertCircle className="mx-auto mb-3 size-10 text-danger-text" aria-hidden />
                )}
                <p className="text-lg font-semibold text-foreground">Import Selesai</p>
                <div className="mt-2 flex items-center justify-center gap-4">
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-success-text">{result.success}</p>
                    <p className="text-xs text-muted-foreground">Berhasil</p>
                  </div>
                  {result.failed > 0 && (
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-danger-text">{result.failed}</p>
                      <p className="text-xs text-muted-foreground">Gagal</p>
                    </div>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg bg-danger-subtle p-3 text-danger-text">
                  <p className="mb-1 text-xs font-semibold">Error Detail:</p>
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs">{err.row > 0 ? `Baris ${err.row}: ` : ''}{err.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </OverlayBody>

        <OverlayFooter>
          {step === 'upload' && (
            <Button type="button" variant="ghost" onClick={handleClose} disabled={previewMutation.isPending}>Batal</Button>
          )}
          {step === 'preview' && preview && (
            <>
              <Button type="button" variant="ghost" disabled={importMutation.isPending}
                onClick={() => { setStep('upload'); setSelectedFile(null); setPreview(null); }}>
                Ganti File
              </Button>
              <Button type="button" onClick={handleConfirmImport}
                disabled={preview.data.length === 0} loading={importMutation.isPending}>
                {importMutation.isPending ? 'Mengimport…' : `Import ${preview.data.length} Data`}
              </Button>
            </>
          )}
          {step === 'result' && <Button type="button" onClick={handleClose}>Tutup</Button>}
        </OverlayFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportModal;

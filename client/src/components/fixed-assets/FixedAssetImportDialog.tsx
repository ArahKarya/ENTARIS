/**
 * Import fixed assets from CSV: pick a file → client-side validation preview →
 * POST /fixed-assets/import (bulk create + schedules; no opening-balance
 * journal, same as before). Import is blocked while any row has an error.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiError } from './errors';
import {
  downloadCsv,
  importTemplateCsv,
  parseFixedAssetImport,
  toImportPayload,
  type ParsedImportRow,
} from './fixed-asset-utils';
import type { CoaOption } from './types';

interface FixedAssetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coa: readonly CoaOption[];
}

const MAX_ROWS = 500;

export function FixedAssetImportDialog({ open, onOpenChange, coa }: FixedAssetImportDialogProps) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ParsedImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open (adjust state during render, no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(null);
      setError(null);
    }
  }

  const importMut = useMutation({
    mutationFn: async (data: ParsedImportRow[]) =>
      (await api.post<{ count: number; scheduleEntries: number }>('/fixed-assets/import', toImportPayload(data))).data,
    onSuccess: (d) => {
      toast.success(`${d.count} aset berhasil di-import (${d.scheduleEntries} entry depresiasi).`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      onOpenChange(false);
    },
    onError: (err) => setError(apiError(err, 'Gagal import.')),
  });

  const onFile = async (file: File) => {
    setError(null);
    setRows(null);
    try {
      const result = parseFixedAssetImport(await file.text(), coa);
      if (result.ok) setRows(result.rows);
      else setError(result.error);
    } catch (err) {
      setError(`Gagal parse CSV: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const errorRows = rows?.filter((r) => r.error) ?? [];
  const canImport = !!rows && rows.length > 0 && rows.length <= MAX_ROWS && errorRows.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !importMut.isPending && onOpenChange(next)}>
      <DialogContent size="lg" hideClose={importMut.isPending}>
        <DialogHeader>
          <DialogTitle>Impor Aset Tetap (CSV)</DialogTitle>
          <DialogDescription>Buat banyak aset sekaligus; jadwal penyusutan dibuat otomatis.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!rows && (
            <>
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileText className="size-4" aria-hidden /> Format CSV
                </p>
                <p className="mt-1.5">Kolom wajib (header tidak peka huruf besar/kecil):</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  <li>
                    <code className="font-mono">name</code>, <code className="font-mono">category</code>,{' '}
                    <code className="font-mono">acquisition_date</code> (YYYY-MM-DD)
                  </li>
                  <li>
                    <code className="font-mono">acquisition_cost</code>, <code className="font-mono">useful_life_months</code>
                  </li>
                  <li>
                    <code className="font-mono">asset_account_id</code>, <code className="font-mono">depreciation_account_id</code>,{' '}
                    <code className="font-mono">accumulated_dep_account_id</code> (UUID akun)
                  </li>
                </ul>
                <p className="mt-1">
                  Opsional: <code className="font-mono">description</code>, <code className="font-mono">salvage_value</code>
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => downloadCsv(importTemplateCsv(coa), 'fixed-assets-import-template.csv')}
                >
                  <Download aria-hidden /> Unduh template
                </Button>
              </div>

              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border p-8 text-center',
                  'transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring',
                )}
              >
                <Upload className="size-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium text-foreground">Pilih file CSV</span>
                <span className="text-xs text-muted-foreground">Maks. {formatNumber(MAX_ROWS)} baris per impor</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                />
              </label>
            </>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-sm text-danger-text">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {rows && rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{formatNumber(rows.length)} baris terbaca</span>
                  {errorRows.length > 0 && (
                    <span className="ml-2 text-danger-text">({formatNumber(errorRows.length)} error)</span>
                  )}
                  {rows.length > MAX_ROWS && (
                    <span className="ml-2 text-danger-text">(melebihi batas {formatNumber(MAX_ROWS)} baris)</span>
                  )}
                </p>
                <Button variant="link" size="sm" onClick={() => { setRows(null); setError(null); }}>
                  Pilih file lain
                </Button>
              </div>

              <div
                role="region"
                aria-label="Pratinjau impor"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="max-h-72 overflow-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">No</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Nama</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Kategori</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Tanggal</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Harga</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">Umur</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Akun aset</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={cn('border-t border-border', r.error && 'bg-danger-subtle/40')}>
                        <td className="num px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5">{r.category}</td>
                        <td className="num px-2 py-1.5">{r.acquisitionDate}</td>
                        <td className="num px-2 py-1.5 text-right">{formatRupiah(r.acquisitionCost, { symbol: false })}</td>
                        <td className="num px-2 py-1.5 text-right">{r.usefulLifeMonths} bln</td>
                        <td className="max-w-32 truncate px-2 py-1.5" title={r.assetAccountLabel}>
                          {r.assetAccountLabel}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.error ? (
                            <span className="inline-flex items-center gap-1 text-danger-text" title={r.error}>
                              <AlertCircle className="size-3.5" aria-hidden /> Error
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-success-text">
                              <CheckCircle2 className="size-3.5" aria-hidden /> OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {errorRows.length > 0 && (
                <div className="space-y-0.5 rounded-md bg-warning-subtle px-3 py-2.5 text-xs text-warning-text">
                  <p className="flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3.5" aria-hidden /> Baris dengan error:
                  </p>
                  {errorRows.slice(0, 5).map((r, i) => (
                    <p key={i} className="font-mono">{r.error}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importMut.isPending}>
            Batal
          </Button>
          {canImport && (
            <Button onClick={() => importMut.mutate(rows)} loading={importMut.isPending}>
              <Upload aria-hidden />
              Impor {formatNumber(rows.length)} aset
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

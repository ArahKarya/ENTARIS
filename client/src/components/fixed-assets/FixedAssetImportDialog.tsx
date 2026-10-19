/**
 * Import fixed assets from CSV (bulk create plus schedules, no opening-balance
 * journal). Import is blocked while any row has an error.
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, FileText, Upload } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
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
  const { t } = useTranslation('finance');
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
      toast.success(t('fixedAssetImportDialog.imported', { count: d.count, schedules: d.scheduleEntries }));
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      onOpenChange(false);
    },
    onError: (err) => setError(apiError(err, t('fixedAssetImportDialog.importFailed'))),
  });

  const onFile = async (file: File) => {
    setError(null);
    setRows(null);
    try {
      const result = parseFixedAssetImport(await file.text(), coa);
      if (result.ok) setRows(result.rows);
      else setError(result.error);
    } catch (err) {
      setError(t('fixedAssetImportDialog.readFailed', { reason: err instanceof Error ? err.message : String(err) }));
    }
  };

  const errorRows = rows?.filter((r) => r.error) ?? [];
  const canImport = !!rows && rows.length > 0 && rows.length <= MAX_ROWS && errorRows.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !importMut.isPending && onOpenChange(next)}>
      <DialogContent size="lg" hideClose={importMut.isPending}>
        <DialogHeader>
          <DialogTitle>{t('fixedAssetImportDialog.title')}</DialogTitle>
          <DialogDescription>{t('fixedAssetImportDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!rows && (
            <>
              <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileText className="size-4" aria-hidden /> {t('fixedAssetImportDialog.format.title')}
                </p>
                <p className="mt-1.5">{t('fixedAssetImportDialog.format.required')}</p>
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
                    <code className="font-mono">accumulated_dep_account_id</code> {t('fixedAssetImportDialog.format.accountUuid')}
                  </li>
                </ul>
                <p className="mt-1">
                  <Trans
                    t={t}
                    i18nKey="fixedAssetImportDialog.format.optional"
                    components={{ code: <code className="font-mono" /> }}
                  />
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => downloadCsv(importTemplateCsv(coa), 'fixed-assets-import-template.csv')}
                >
                  <Download aria-hidden /> {t('fixedAssetImportDialog.format.download')}
                </Button>
              </div>

              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border p-8 text-center',
                  'transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring',
                )}
              >
                <Upload className="size-6 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium text-foreground">{t('fixedAssetImportDialog.choose')}</span>
                <span className="text-xs text-muted-foreground">{t('fixedAssetImportDialog.maxRows', { count: MAX_ROWS })}</span>
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
                  <span className="font-medium">{t('fixedAssetImportDialog.rowsRead', { count: rows.length })}</span>
                  {errorRows.length > 0 && (
                    <span className="ml-2 text-danger-text">{t('fixedAssetImportDialog.errorCount', { count: errorRows.length })}</span>
                  )}
                  {rows.length > MAX_ROWS && (
                    <span className="ml-2 text-danger-text">{t('fixedAssetImportDialog.overLimit', { count: MAX_ROWS })}</span>
                  )}
                </p>
                <Button variant="link" size="sm" onClick={() => { setRows(null); setError(null); }}>
                  {t('fixedAssetImportDialog.chooseAnother')}
                </Button>
              </div>

              <div
                role="region"
                aria-label={t('fixedAssetImportDialog.preview')}
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="max-h-72 overflow-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
              >
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.no')}</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.name')}</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.category')}</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.date')}</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('fixedAssetImportDialog.columns.cost')}</th>
                      <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('fixedAssetImportDialog.columns.life')}</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.assetAccount')}</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">{t('fixedAssetImportDialog.columns.status')}</th>
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
                        <td className="num px-2 py-1.5 text-right">{t('fixedAssetImportDialog.monthsShort', { count: r.usefulLifeMonths })}</td>
                        <td className="max-w-32 truncate px-2 py-1.5" title={r.assetAccountLabel}>
                          {r.assetAccountLabel}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.error ? (
                            <span className="inline-flex items-start gap-1 text-danger-text">
                              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {r.error}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-success-text">
                              <CheckCircle2 className="size-3.5" aria-hidden /> {t('fixedAssetImportDialog.ok')}
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
                    <AlertCircle className="size-3.5" aria-hidden /> {t('fixedAssetImportDialog.errorRows')}
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
            {t('fixedAssetImportDialog.cancel')}
          </Button>
          {canImport && (
            <Button onClick={() => importMut.mutate(rows)} loading={importMut.isPending}>
              <Upload aria-hidden />
              {t('fixedAssetImportDialog.submit', { count: rows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

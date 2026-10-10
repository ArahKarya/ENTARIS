import { Package, ArrowRight, XCircle, Calculator, Gauge, Clock, Pencil } from 'lucide-react';
import type { ProductionRunRow } from './inventory/inventory-rows';
import { usePendingApproval } from '@/hooks/usePendingApproval';
import { PendingApprovalBadge, PendingApprovalNotice } from './approvals/PendingApprovalNotice';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { formatRupiah, formatDate } from '../lib/formatters';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LoadingState, StatusBadge } from '@/components/shared';
import { buildPdfProps } from './production/run-pdf-props';
import PDFDownloadButton from './PDFDownloadButton';
import ProductionRunPDF from '../lib/pdf/ProductionRunPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

const fmtRupiah4 = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 });

interface Props {
  runId: string | null;
  onClose: () => void;
  onCancel?: (id: string) => void;
  canCancel?: boolean;
  /** Edit lewat form (non-Admin: diajukan ke approval). */
  canEdit?: boolean;
  onEdit?: (run: ProductionRunRow) => void;
}

const fmtNum = (val: number | string, decimals = 3) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const fmtPct = (v: number | string | null | undefined): string =>
  v == null ? '—' : `${Number(v).toFixed(2)}%`;

const SHIFT_LABEL: Record<string, string> = { '1': 'Shift 1', '2': 'Shift 2', '3': 'Shift 3' };

export default function ProductionDetailDrawer({ runId, onClose, onCancel, canCancel, canEdit, onEdit }: Props) {
  const { data: run, isLoading } = useQuery({
    queryKey: ['production-run-detail', runId],
    queryFn: () => api.get(`/inventory/production-runs/${runId}`).then(r => r.data),
    enabled: !!runId,
  });
  const company = useCompanyPDF();
  const pendingEdit = usePendingApproval('ProductionRunEdit', runId);

  const inputLines = (run?.items ?? []).filter((i: any) => i.lineType === 'Input');
  const outputLines = (run?.items ?? []).filter((i: any) => i.lineType === 'Output');
  const byProductLines = (run?.items ?? []).filter((i: any) => i.lineType === 'ByProduct' || i.isByProduct);

  const totalInputQty = inputLines.reduce((s: number, i: any) => s + Number(i.quantity), 0);
  const totalOutputQty = outputLines.reduce((s: number, o: any) => s + Number(o.quantity), 0);

  // OEE output is DERIVED from the run's item lines (no manual good/reject):
  //   produk  = Σ main Output, samping = Σ ByProduct, loss = max(input − produk − samping, 0).
  const produkQty = totalOutputQty;
  const sampingQty = byProductLines.reduce((s: number, b: any) => s + Number(b.quantity), 0);
  const lossQty = Math.max(totalInputQty - produkQty - sampingQty, 0);
  const oeeYieldPct = totalInputQty > 0
    ? Math.max(0, Math.min(1, (produkQty + sampingQty) / totalInputQty)) * 100
    : null;
  const totalInputValue = inputLines.reduce((s: number, i: any) => {
    const avg = Number(i.item?.averageCost ?? 0);
    return s + Number(i.quantity) * avg;
  }, 0);
  const totalOutputValue = outputLines.reduce((s: number, o: any) => {
    return s + Number(o.quantity) * Number(o.unitPrice ?? 0);
  }, 0);

  const isCancelled = run?.isCancelled;
  const journal = run?.journal;

  const downtimeList: any[] = Array.isArray(run?.downtimes) ? run.downtimes : [];
  const runMachineList: any[] = Array.isArray(run?.runMachines) ? run.runMachines : [];
  const hasOeeData = !!(run && (
    runMachineList.length > 0 ||
    run.machine || run.machineId || run.shift || run.shiftLead ||
    run.manpowerCount != null || run.plannedStart || run.plannedEnd ||
    run.startAt || run.endAt ||
    run.oeePct != null || run.availabilityPct != null ||
    run.performancePct != null || run.qualityPct != null ||
    downtimeList.length > 0
  ));

  return (
    <Sheet open={!!runId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Package className="size-5 text-primary" aria-hidden />
              {run?.runNumber ?? 'Memuat…'}
            </SheetTitle>
            {run && (
              <StatusBadge
                status={isCancelled ? 'Cancelled' : 'Completed'}
                label={isCancelled ? 'Dibatalkan' : 'Selesai'}
                tone={isCancelled ? 'danger' : 'success'}
              />
            )}
            {pendingEdit && <PendingApprovalBadge />}
          </div>
          <SheetDescription>
            {run ? `${formatDate(run.date)} · ${run.createdBy?.fullName ?? ''}` : 'Detail proses produksi'}
          </SheetDescription>
        </SheetHeader>

        {pendingEdit && (
          <div className="px-4 pt-3 sm:px-6">
            <PendingApprovalNotice what="Perubahan data produksi" />
          </div>
        )}

        {/* Focusable so the scrollable body works by keyboard. */}
        <SheetBody className="p-0" role="region" aria-label="Isi detail produksi" tabIndex={0}>
          {isLoading ? (
            <LoadingState label="Memuat data produksi…" />
          ) : !run ? (
            <div className="p-6 text-center text-muted-foreground">Data tidak ditemukan.</div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-info-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-info-text uppercase">Total Input</p>
                  <p className="text-lg font-bold text-info-text">{fmtNum(totalInputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-success-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-success-text uppercase">Total Output</p>
                  <p className="text-lg font-bold text-success-text">{fmtNum(totalOutputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-primary-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-primary-subtle-foreground uppercase">Yield</p>
                  <p className="text-lg font-bold text-primary-subtle-foreground">
                    {run.yieldPct != null ? `${Number(run.yieldPct).toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Reference & Notes */}
              {(run.referenceNumber || run.notes) && (
                <div className="space-y-2">
                  {run.referenceNumber && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground text-xs font-medium">Referensi:</span>
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{run.referenceNumber}</span>
                    </div>
                  )}
                  {run.notes && (
                    <div className="text-sm">
                      <span className="text-muted-foreground text-xs font-medium">Catatan:</span>
                      <p className="text-foreground mt-0.5">{run.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* OEE: captured production data and metrics */}
              {hasOeeData && (
                <div className="space-y-3">
                  {/* Line-level (aggregate) OEE metric panel */}
                  <div className="bg-info-subtle border border-info/30 rounded-lg p-4">
                    <h3 className="text-xs font-bold text-info-text uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Gauge size={13} /> OEE Line (agregat)
                    </h3>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">Availability</p>
                        <p className="text-sm font-semibold text-info-text font-mono">{fmtPct(run.availabilityPct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">Performance</p>
                        <p className="text-sm font-semibold text-info-text font-mono">{fmtPct(run.performancePct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">Quality</p>
                        <p className="text-sm font-semibold text-info-text font-mono">{fmtPct(run.qualityPct)}</p>
                      </div>
                      <div className="rounded-lg bg-info-subtle px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">OEE</p>
                        <p className="text-base font-bold text-info-text font-mono">{fmtPct(run.oeePct)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Captured production data (shift window + break + output) */}
                  <div className="border border-border rounded-lg p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block">Shift</span>
                      <span className="text-foreground font-medium">
                        {run.shift ? (SHIFT_LABEL[run.shift] ?? run.shift) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Kepala Shift</span>
                      <span className="text-foreground font-medium">{run.shiftLead || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Jam Shift Mulai</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.plannedStart)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Jam Shift Selesai</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.plannedEnd)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Istirahat Mulai</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.breakStart)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Istirahat Selesai</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.breakEnd)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Jumlah MP</span>
                      <span className="text-foreground font-medium">
                        {run.manpowerCount != null ? `${run.manpowerCount} orang` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Total Downtime</span>
                      <span className="text-foreground font-medium">
                        {run.downtimeMin != null ? `${fmtNum(Number(run.downtimeMin), 2)} menit` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Produk (output utama)</span>
                      <span className="text-foreground font-medium">{fmtNum(produkQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Produk Samping</span>
                      <span className="text-foreground font-medium">{fmtNum(sampingQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Loss / Susut</span>
                      <span className="text-danger-text font-medium">{fmtNum(lossQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Yield (Quality)</span>
                      <span className="text-success-text font-medium">
                        {oeeYieldPct != null ? `${oeeYieldPct.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Per-machine OEE table */}
                  {runMachineList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                        <Gauge size={12} /> OEE per Mesin ({runMachineList.length})
                      </h4>
                      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label="Tabel OEE per mesin" tabIndex={0}>
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted text-muted-foreground text-left">
                            <tr>
                              <th className="font-semibold py-2 px-2">Mesin</th>
                              <th className="font-semibold py-2 px-1 whitespace-nowrap">Mulai</th>
                              <th className="font-semibold py-2 px-1 whitespace-nowrap">Selesai</th>
                              <th className="font-semibold py-2 px-1 text-right">Jam jalan</th>
                              <th className="font-semibold py-2 px-1 text-right">Output alokasi</th>
                              <th className="font-semibold py-2 px-1 text-right">A</th>
                              <th className="font-semibold py-2 px-1 text-right">P</th>
                              <th className="font-semibold py-2 px-1 text-right">Q</th>
                              <th className="font-semibold py-2 px-2 text-right">OEE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {runMachineList.map((rm: any) => (
                              <tr key={rm.id} className="border-t border-border text-foreground">
                                <td className="py-2 px-2 whitespace-nowrap">
                                  {rm.machine ? `${rm.machine.code} · ${rm.machine.name}` : '—'}
                                </td>
                                <td className="py-2 px-1 whitespace-nowrap text-muted-foreground">{fmtDateTime(rm.startAt)}</td>
                                <td className="py-2 px-1 whitespace-nowrap text-muted-foreground">{fmtDateTime(rm.endAt)}</td>
                                <td className="py-2 px-1 text-right font-mono">
                                  {rm.runMin != null ? `${fmtNum(Number(rm.runMin), 1)} m` : '—'}
                                </td>
                                <td className="py-2 px-1 text-right font-mono">
                                  {rm.allocatedQty != null ? fmtNum(Number(rm.allocatedQty), 1) : '—'}
                                </td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.availabilityPct)}</td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.performancePct)}</td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.qualityPct)}</td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-info-text">{fmtPct(rm.oeePct)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Downtime list */}
                  {downtimeList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                        <Clock size={12} /> Downtime ({downtimeList.length})
                      </h4>
                      <div className="space-y-1.5">
                        {downtimeList.map((d: any) => (
                          <div key={d.id} className="bg-danger-subtle border border-danger/20 rounded-lg px-3 py-2 flex items-center justify-between">
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-danger-text">{d.category}</span>
                              {d.machine && (
                                <span className="text-xs font-medium text-danger-text ml-2">
                                  [{d.machine.code}]
                                </span>
                              )}
                              {d.reason && (
                                <span className="text-[11px] text-muted-foreground ml-2">{d.reason}</span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-danger-text tabular-nums whitespace-nowrap ml-2">
                              {fmtNum(Number(d.durationMin), 2)} mnt
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Traceability: process tags */}
              {Array.isArray(run.runProcesses) && run.runProcesses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                    Proses Dijalankan ({run.runProcesses.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {run.runProcesses.map((rp: any) => (
                      <span
                        key={rp.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-subtle border border-primary/30 text-primary-subtle-foreground text-xs"
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                        {rp.process?.name ?? '(?)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Input items */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                  Bahan Input ({inputLines.length})
                </h3>
                <div className="space-y-1.5">
                  {inputLines.map((line: any) => {
                    const lockedCost = line.batchUnitCost != null ? Number(line.batchUnitCost) : null;
                    return (
                      <div key={line.id} className="bg-info-subtle/50 border border-info/30 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-foreground">{line.item?.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">{line.item?.code}</span>
                          </div>
                          <span className="text-sm font-semibold text-info-text tabular-nums">
                            {fmtNum(Number(line.quantity))} {line.item?.unit}
                          </span>
                        </div>
                        {/* Batch info if linked */}
                        {line.sourceMovement && (
                          <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>
                              <span className="text-muted-foreground">Batch:</span>{' '}
                              {line.sourceMovement.referenceNumber ?? line.sourceMovement.movementNumber}
                              {' '}
                              ({formatDate(line.sourceMovement.date)})
                            </span>
                            {lockedCost != null && (
                              <span>
                                <span className="text-muted-foreground">Cost terkunci:</span>{' '}
                                <span className="font-mono">Rp {fmtRupiah4(lockedCost)}/{line.item?.unit}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowRight size={20} className="text-muted-foreground rotate-90" />
              </div>

              {/* Output items */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                  Hasil Output ({outputLines.length})
                </h3>
                <div className="space-y-1.5">
                  {outputLines.map((line: any) => {
                    const rPct = totalInputQty > 0
                      ? ((Number(line.quantity) / totalInputQty) * 100).toFixed(1)
                      : null;
                    return (
                      <div key={line.id} className="bg-success-subtle/50 border border-success/30 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-foreground">{line.item?.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">{line.item?.code}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {rPct && (
                              <span className="text-xs font-semibold text-success-text bg-success-subtle px-1.5 py-0.5 rounded">
                                {rPct}%
                              </span>
                            )}
                            <span className="text-sm font-semibold text-success-text tabular-nums">
                              {fmtNum(Number(line.quantity))} {line.item?.unit}
                            </span>
                          </div>
                        </div>
                        {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            HPP: <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
                            <span className="text-muted-foreground ml-2">
                              = {formatRupiah(Number(line.quantity) * Number(line.unitPrice))}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By-products */}
              {byProductLines.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                    Produk Samping ({byProductLines.length})
                  </h3>
                  <div className="space-y-1.5">
                    {byProductLines.map((line: any) => (
                      <div key={line.id} className="bg-warning-subtle/50 border border-warning/30 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-foreground">{line.item?.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">{line.item?.code}</span>
                            <span className="ml-1 text-xs px-1 py-0.5 bg-warning-subtle text-warning-text rounded font-medium">
                              Samping
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-warning-text tabular-nums">
                            {fmtNum(Number(line.quantity))} {line.item?.unit}
                          </span>
                        </div>
                        {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            HPP: <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost components snapshot */}
              {Array.isArray(run.runCosts) && run.runCosts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                    Komponen Biaya Produksi ({run.runCosts.length})
                  </h3>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label="Komponen biaya produksi" tabIndex={0}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted border-b border-border text-muted-foreground">
                          <th className="text-left px-2 py-1.5 font-medium">Keterangan</th>
                          <th className="text-center px-2 py-1.5 font-medium">Sisi</th>
                          <th className="text-right px-2 py-1.5 font-medium">Rate</th>
                          <th className="text-right px-2 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.runCosts.map((c: any) => (
                          <tr key={c.id} className="border-b border-border last:border-b-0">
                            <td className="px-2 py-1.5 text-foreground">
                              {c.description}
                              {c.costAccount && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({c.costAccount.accountNumber})
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={cn(
                                'text-xs px-1 rounded',
                                c.costSide === 'InputSide' ? 'bg-info-subtle text-info-text' : 'bg-success-subtle text-success-text',
                              )}>
                                {c.costSide === 'InputSide' ? 'Input' : 'Output'}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              Rp {fmtRupiah4(Number(c.rate))}
                              {c.basis !== 'Fixed' && (
                                <span className="text-xs text-muted-foreground">
                                  /{c.basis === 'InputQty' ? 'in' : 'out'}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-foreground">
                              Rp {formatRupiah(Number(c.totalAmount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Loaded HPP breakdown */}
              {run.computedHpp != null && (
                <div className="bg-success-subtle border border-success/30 rounded-lg p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-success-text uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Calculator size={13} />
                    HPP Loaded
                    {run.hppManualOverride && (
                      <span className="text-xs px-1.5 py-0.5 bg-warning-subtle text-warning-text rounded">
                        Override manual
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-muted-foreground">Biaya Material</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalMaterialCost ?? 0))}
                    </span>
                    <span className="text-muted-foreground">+ Biaya Sisi Input</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalCostInputSide ?? 0))}
                    </span>
                    <span className="text-muted-foreground">+ Biaya Sisi Output</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalCostOutputSide ?? 0))}
                    </span>
                    <span className="text-muted-foreground">− Nilai Produk Samping</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalByproductValue ?? 0))}
                    </span>
                  </div>
                  <div className="border-t border-success/30 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-success-text">HPP per Kg main output:</span>
                    <span className="text-base font-bold text-success-text font-mono">
                      Rp {fmtRupiah4(Number(run.computedHpp))}
                    </span>
                  </div>
                  <p className="text-xs text-success-text pt-1">
                    Nilai ini yang diposting ke GL sebagai nilai persediaan output utama (bahan + biaya konversi − NRV produk samping).
                  </p>
                </div>
              )}

              {/* Modal bahan baku murni (WAC 2) — laporan manajemen, bukan GL */}
              {run.glSummary && run.glSummary.rawMaterialPerKg != null && (
                <div className="bg-info-subtle border border-info/30 rounded-lg p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-info-text uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Package size={13} />
                    Modal Bahan Baku Murni
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-muted-foreground">Nilai bahan baku (real)</span>
                    <span className="text-right font-mono text-foreground">{formatRupiah(run.glSummary.inputValue)}</span>
                    <span className="text-muted-foreground">÷ Output utama</span>
                    <span className="text-right font-mono text-foreground">
                      {Number(run.glSummary.mainQty).toLocaleString('id-ID')} kg
                      {run.glSummary.yieldPct != null && (
                        <span className="text-muted-foreground"> (rendemen {Number(run.glSummary.yieldPct).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="border-t border-info/30 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-info-text font-medium">Modal bahan baku murni / kg</span>
                    <span className="text-base font-bold text-info-text font-mono">Rp {fmtRupiah4(Math.round(run.glSummary.rawMaterialPerKg * 100) / 100)}</span>
                  </div>
                  {run.glSummary.glPerKg != null && (
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="text-muted-foreground">HPP GL / kg (dibanding)</span>
                      <span className="font-mono text-foreground">
                        Rp {fmtRupiah4(Math.round(run.glSummary.glPerKg * 100) / 100)}
                        <span className={cn('ml-2', run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg >= 0 ? 'text-danger-text' : 'text-success-text')}>
                          ({run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg >= 0 ? '+' : '−'}
                          {fmtRupiah4(Math.round(Math.abs(run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg) * 100) / 100)})
                        </span>
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-info-text pt-1">
                    Laporan manajemen: hanya pembelian bahan baku (angka real), tanpa biaya estimasi & produk samping. Tidak diposting ke GL.
                  </p>
                </div>
              )}

              {/* Cost summary — dari stock movement nyata (nilai yang benar-benar diposting) */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Ringkasan Biaya (GL)</h3>
                {run.glSummary ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Bahan baku keluar</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.inputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Output utama masuk</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.mainValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Produk samping masuk (NRV)</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.byproductValue)}</span>
                    </div>
                    {(() => {
                      const lines = (journal?.items ?? []).filter((it: any) => ['5.1', '5.12'].includes(it.account?.accountNumber));
                      if (lines.length === 0) {
                        return (
                          <div className="border-t border-border pt-2 flex justify-between text-sm">
                            <span className="text-muted-foreground font-medium">Selisih (biaya konversi)</span>
                            <span className="font-mono font-semibold text-foreground">
                              {formatRupiah(Math.abs(run.glSummary.conversionDiff))}{run.glSummary.conversionDiff >= 0 ? ' (CR)' : ' (DR)'}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div className="border-t border-border pt-2 space-y-1">
                          {lines.map((it: any) => {
                            const cr = Number(it.credit) > 0;
                            return (
                              <div key={it.id} className="flex justify-between text-sm">
                                <span className="text-muted-foreground font-medium">
                                  {it.account.accountNumber === '5.12' ? 'Biaya konversi dibebankan (5.12)' : cr ? 'Sisa selisih ke HPP Beras (5.1)' : 'Rugi produksi (5.1)'}
                                </span>
                                <span className={cn('font-mono font-semibold', cr ? 'text-success-text' : 'text-danger-text')}>
                                  {formatRupiah(Number(cr ? it.credit : it.debit))}{cr ? ' (CR)' : ' (DR)'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Biaya Input</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(totalInputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Nilai Output</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(totalOutputValue)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Journal entry */}
              {journal && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                    Jurnal: {journal.entryNumber}
                    {journal.status === 'Cancelled' && (
                      <span className="inline-flex items-center rounded-sm bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">Dibatalkan</span>
                    )}
                  </h3>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label="Baris jurnal produksi" tabIndex={0}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">Akun</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Debit</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journal.items?.map((ji: any) => (
                          <tr key={ji.id} className="border-b border-border">
                            <td className="px-3 py-2">
                              <span className="font-mono text-muted-foreground">{ji.account?.accountNumber}</span>
                              <span className="ml-1.5 text-foreground">{ji.account?.name}</span>
                            </td>
                            <td className="text-right px-3 py-2 font-mono tabular-nums text-foreground">
                              {Number(ji.debit) > 0 ? formatRupiah(Number(ji.debit)) : ''}
                            </td>
                            <td className="text-right px-3 py-2 font-mono tabular-nums text-foreground">
                              {Number(ji.credit) > 0 ? formatRupiah(Number(ji.credit)) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetBody>

        {run && (
          <SheetFooter className="items-stretch sm:items-center sm:justify-between">
            <PDFDownloadButton
              document={<ProductionRunPDF {...buildPdfProps(run, company)} />}
              fileName={`${run.runNumber}.pdf`}
              label="Unduh PDF"
            />
            {!isCancelled && canEdit && onEdit && (
              <Button variant="outline" onClick={() => onEdit(run)} disabled={!!pendingEdit} title={pendingEdit ? 'Menunggu persetujuan' : undefined}>
                <Pencil aria-hidden /> Edit
              </Button>
            )}
            {!isCancelled && canCancel && onCancel && (
              <Button variant="outline" className="text-danger-text" onClick={() => onCancel(run.id)}>
                <XCircle aria-hidden /> Batalkan
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

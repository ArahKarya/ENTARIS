import { Package, ArrowRight, XCircle, Calculator, Gauge, Clock, Pencil } from 'lucide-react';
import type { ProductionRunRow } from './inventory/inventory-rows';
import { usePendingApproval } from '@/hooks/usePendingApproval';
import { PendingApprovalBadge, PendingApprovalNotice } from './approvals/PendingApprovalNotice';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
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

const fmtRupiah4 = (n: number) => Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 4 });

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
  Number(val).toLocaleString(LOCALE, { maximumFractionDigits: decimals });

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const fmtPct = (v: number | string | null | undefined): string =>
  v == null ? '—' : `${Number(v).toFixed(2)}%`;

const SHIFT_VALUES = new Set(['1', '2', '3']);

export default function ProductionDetailDrawer({ runId, onClose, onCancel, canCancel, canEdit, onEdit }: Props) {
  const { t } = useTranslation('production');
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
              {run?.runNumber ?? t('productionDetailDrawer.loading')}
            </SheetTitle>
            {run && (
              <StatusBadge
                status={isCancelled ? 'Cancelled' : 'Completed'}
                label={isCancelled ? t('productionDetailDrawer.status.cancelled') : t('productionDetailDrawer.status.completed')}
                tone={isCancelled ? 'danger' : 'success'}
              />
            )}
            {pendingEdit && <PendingApprovalBadge />}
          </div>
          <SheetDescription>
            {run ? `${formatDate(run.date)} · ${run.createdBy?.fullName ?? ''}` : t('productionDetailDrawer.description')}
          </SheetDescription>
        </SheetHeader>

        {pendingEdit && (
          <div className="px-4 pt-3 sm:px-6">
            <PendingApprovalNotice what={t('productionDetailDrawer.pendingWhat')} />
          </div>
        )}

        {/* Focusable so the scrollable body works by keyboard. */}
        <SheetBody className="p-0" role="region" aria-label={t('productionDetailDrawer.bodyAria')} tabIndex={0}>
          {isLoading ? (
            <LoadingState label={t('productionDetailDrawer.loadingData')} />
          ) : !run ? (
            <div className="p-6 text-center text-muted-foreground">{t('productionDetailDrawer.notFound')}</div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-info-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-info-text uppercase">{t('productionDetailDrawer.summary.totalInput')}</p>
                  <p className="text-lg font-bold text-info-text">{fmtNum(totalInputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-success-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-success-text uppercase">{t('productionDetailDrawer.summary.totalOutput')}</p>
                  <p className="text-lg font-bold text-success-text">{fmtNum(totalOutputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-primary-subtle rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-primary-subtle-foreground uppercase">{t('productionDetailDrawer.summary.yield')}</p>
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
                      <span className="text-muted-foreground text-xs font-medium">{t('productionDetailDrawer.reference')}</span>
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{run.referenceNumber}</span>
                    </div>
                  )}
                  {run.notes && (
                    <div className="text-sm">
                      <span className="text-muted-foreground text-xs font-medium">{t('productionDetailDrawer.notes')}</span>
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
                      <Gauge size={13} /> {t('productionDetailDrawer.oee.lineTitle')}
                    </h3>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">{t('productionDetailDrawer.oee.availability')}</p>
                        <p className="text-sm font-semibold text-info-text font-mono">{fmtPct(run.availabilityPct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">{t('productionDetailDrawer.oee.performance')}</p>
                        <p className="text-sm font-semibold text-info-text font-mono">{fmtPct(run.performancePct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-xs font-semibold text-info-text uppercase tracking-wide">{t('productionDetailDrawer.oee.quality')}</p>
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
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.shift')}</span>
                      <span className="text-foreground font-medium">
                        {run.shift ? (SHIFT_VALUES.has(run.shift) ? t('productionDetailDrawer.shiftLabel', { shift: run.shift }) : run.shift) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.shiftLead')}</span>
                      <span className="text-foreground font-medium">{run.shiftLead || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.shiftStart')}</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.plannedStart)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.shiftEnd')}</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.plannedEnd)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.breakStart')}</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.breakStart)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.breakEnd')}</span>
                      <span className="text-foreground font-medium">{fmtDateTime(run.breakEnd)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.manpower')}</span>
                      <span className="text-foreground font-medium">
                        {run.manpowerCount != null ? t('productionDetailDrawer.oee.manpowerValue', { count: run.manpowerCount }) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.totalDowntime')}</span>
                      <span className="text-foreground font-medium">
                        {run.downtimeMin != null ? t('productionDetailDrawer.oee.minutes', { value: fmtNum(Number(run.downtimeMin), 2) }) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.mainProduct')}</span>
                      <span className="text-foreground font-medium">{fmtNum(produkQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.byProduct')}</span>
                      <span className="text-foreground font-medium">{fmtNum(sampingQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.loss')}</span>
                      <span className="text-danger-text font-medium">{fmtNum(lossQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">{t('productionDetailDrawer.oee.yieldQuality')}</span>
                      <span className="text-success-text font-medium">
                        {oeeYieldPct != null ? `${oeeYieldPct.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Per-machine OEE table */}
                  {runMachineList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                        <Gauge size={12} /> {t('productionDetailDrawer.machines.title', { count: runMachineList.length })}
                      </h4>
                      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label={t('productionDetailDrawer.machines.tableAria')} tabIndex={0}>
                        <table className="w-full text-[11px]">
                          <thead className="bg-muted text-muted-foreground text-left">
                            <tr>
                              <th className="font-semibold py-2 px-2">{t('productionDetailDrawer.machines.machine')}</th>
                              <th className="font-semibold py-2 px-1 whitespace-nowrap">{t('productionDetailDrawer.machines.start')}</th>
                              <th className="font-semibold py-2 px-1 whitespace-nowrap">{t('productionDetailDrawer.machines.end')}</th>
                              <th className="font-semibold py-2 px-1 text-right">{t('productionDetailDrawer.machines.runTime')}</th>
                              <th className="font-semibold py-2 px-1 text-right">{t('productionDetailDrawer.machines.allocatedOutput')}</th>
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
                                  {rm.runMin != null ? t('productionDetailDrawer.machines.runMinutes', { value: fmtNum(Number(rm.runMin), 1) }) : '—'}
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
                        <Clock size={12} /> {t('productionDetailDrawer.downtime.title', { count: downtimeList.length })}
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
                              {t('productionDetailDrawer.downtime.minutes', { value: fmtNum(Number(d.durationMin), 2) })}
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
                    {t('productionDetailDrawer.processes', { count: run.runProcesses.length })}
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
                  {t('productionDetailDrawer.inputs.title', { count: inputLines.length })}
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
                              <span className="text-muted-foreground">{t('productionDetailDrawer.inputs.batch')}</span>{' '}
                              {line.sourceMovement.referenceNumber ?? line.sourceMovement.movementNumber}
                              {' '}
                              ({formatDate(line.sourceMovement.date)})
                            </span>
                            {lockedCost != null && (
                              <span>
                                <span className="text-muted-foreground">{t('productionDetailDrawer.inputs.lockedCost')}</span>{' '}
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
                  {t('productionDetailDrawer.outputs.title', { count: outputLines.length })}
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
                            {t('productionDetailDrawer.outputs.hpp')} <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
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
                    {t('productionDetailDrawer.byProducts.title', { count: byProductLines.length })}
                  </h3>
                  <div className="space-y-1.5">
                    {byProductLines.map((line: any) => (
                      <div key={line.id} className="bg-warning-subtle/50 border border-warning/30 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-foreground">{line.item?.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">{line.item?.code}</span>
                            <span className="ml-1 text-xs px-1 py-0.5 bg-warning-subtle text-warning-text rounded font-medium">
                              {t('productionDetailDrawer.byProducts.badge')}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-warning-text tabular-nums">
                            {fmtNum(Number(line.quantity))} {line.item?.unit}
                          </span>
                        </div>
                        {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {t('productionDetailDrawer.outputs.hpp')} <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
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
                    {t('productionDetailDrawer.costs.title', { count: run.runCosts.length })}
                  </h3>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label={t('productionDetailDrawer.costs.tableAria')} tabIndex={0}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted border-b border-border text-muted-foreground">
                          <th className="text-left px-2 py-1.5 font-medium">{t('productionDetailDrawer.costs.description')}</th>
                          <th className="text-center px-2 py-1.5 font-medium">{t('productionDetailDrawer.costs.side')}</th>
                          <th className="text-right px-2 py-1.5 font-medium">{t('productionDetailDrawer.costs.rate')}</th>
                          <th className="text-right px-2 py-1.5 font-medium">{t('productionDetailDrawer.costs.total')}</th>
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
                                {c.costSide === 'InputSide' ? t('productionDetailDrawer.costs.sideInput') : t('productionDetailDrawer.costs.sideOutput')}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              Rp {fmtRupiah4(Number(c.rate))}
                              {c.basis !== 'Fixed' && (
                                <span className="text-xs text-muted-foreground">
                                  /{c.basis === 'InputQty' ? t('productionDetailDrawer.costs.perIn') : t('productionDetailDrawer.costs.perOut')}
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
                    {t('productionDetailDrawer.hpp.title')}
                    {run.hppManualOverride && (
                      <span className="text-xs px-1.5 py-0.5 bg-warning-subtle text-warning-text rounded">
                        {t('productionDetailDrawer.hpp.manualOverride')}
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-muted-foreground">{t('productionDetailDrawer.hpp.material')}</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalMaterialCost ?? 0))}
                    </span>
                    <span className="text-muted-foreground">{t('productionDetailDrawer.hpp.inputSide')}</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalCostInputSide ?? 0))}
                    </span>
                    <span className="text-muted-foreground">{t('productionDetailDrawer.hpp.outputSide')}</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalCostOutputSide ?? 0))}
                    </span>
                    <span className="text-muted-foreground">{t('productionDetailDrawer.hpp.byProductValue')}</span>
                    <span className="text-right font-mono text-foreground">
                      {formatRupiah(Number(run.totalByproductValue ?? 0))}
                    </span>
                  </div>
                  <div className="border-t border-success/30 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-success-text">{t('productionDetailDrawer.hpp.perKg')}</span>
                    <span className="text-base font-bold text-success-text font-mono">
                      Rp {fmtRupiah4(Number(run.computedHpp))}
                    </span>
                  </div>
                  <p className="text-xs text-success-text pt-1">
                    {t('productionDetailDrawer.hpp.note')}
                  </p>
                </div>
              )}

              {/* Modal bahan baku murni (WAC 2) — laporan manajemen, bukan GL */}
              {run.glSummary && run.glSummary.rawMaterialPerKg != null && (
                <div className="bg-info-subtle border border-info/30 rounded-lg p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-info-text uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Package size={13} />
                    {t('productionDetailDrawer.rawMaterial.title')}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-muted-foreground">{t('productionDetailDrawer.rawMaterial.inputValue')}</span>
                    <span className="text-right font-mono text-foreground">{formatRupiah(run.glSummary.inputValue)}</span>
                    <span className="text-muted-foreground">{t('productionDetailDrawer.rawMaterial.mainOutput')}</span>
                    <span className="text-right font-mono text-foreground">
                      {Number(run.glSummary.mainQty).toLocaleString(LOCALE)} kg
                      {run.glSummary.yieldPct != null && (
                        <span className="text-muted-foreground"> {t('productionDetailDrawer.rawMaterial.yield', { value: Number(run.glSummary.yieldPct).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) })}</span>
                      )}
                    </span>
                  </div>
                  <div className="border-t border-info/30 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-info-text font-medium">{t('productionDetailDrawer.rawMaterial.perKg')}</span>
                    <span className="text-base font-bold text-info-text font-mono">Rp {fmtRupiah4(Math.round(run.glSummary.rawMaterialPerKg * 100) / 100)}</span>
                  </div>
                  {run.glSummary.glPerKg != null && (
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="text-muted-foreground">{t('productionDetailDrawer.rawMaterial.glPerKg')}</span>
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
                    {t('productionDetailDrawer.rawMaterial.note')}
                  </p>
                </div>
              )}

              {/* Cost summary — dari stock movement nyata (nilai yang benar-benar diposting) */}
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">{t('productionDetailDrawer.glSummary.title')}</h3>
                {run.glSummary ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('productionDetailDrawer.glSummary.materialOut')}</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.inputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('productionDetailDrawer.glSummary.mainIn')}</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.mainValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('productionDetailDrawer.glSummary.byProductIn')}</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(run.glSummary.byproductValue)}</span>
                    </div>
                    {(() => {
                      const lines = (journal?.items ?? []).filter((it: any) => ['5.1', '5.12'].includes(it.account?.accountNumber));
                      if (lines.length === 0) {
                        return (
                          <div className="border-t border-border pt-2 flex justify-between text-sm">
                            <span className="text-muted-foreground font-medium">{t('productionDetailDrawer.glSummary.conversionDiff')}</span>
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
                                  {it.account.accountNumber === '5.12' ? t('productionDetailDrawer.glSummary.conversionCharged') : cr ? t('productionDetailDrawer.glSummary.remainderToCogs') : t('productionDetailDrawer.glSummary.productionLoss')}
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
                      <span className="text-muted-foreground">{t('productionDetailDrawer.glSummary.totalInputCost')}</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(totalInputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t('productionDetailDrawer.glSummary.totalOutputValue')}</span>
                      <span className="font-mono font-medium text-foreground">{formatRupiah(totalOutputValue)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Journal entry */}
              {journal && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
                    {t('productionDetailDrawer.journal.title', { number: journal.entryNumber })}
                    {journal.status === 'Cancelled' && (
                      <span className="inline-flex items-center rounded-sm bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">{t('productionDetailDrawer.status.cancelled')}</span>
                    )}
                  </h3>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
<div className="overflow-x-auto border border-border rounded-lg" role="region" aria-label={t('productionDetailDrawer.journal.tableAria')} tabIndex={0}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted border-b border-border">
                          <th className="text-left px-3 py-2 text-muted-foreground font-medium">{t('productionDetailDrawer.journal.account')}</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">{t('productionDetailDrawer.journal.debit')}</th>
                          <th className="text-right px-3 py-2 text-muted-foreground font-medium">{t('productionDetailDrawer.journal.credit')}</th>
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
              label={t('productionDetailDrawer.downloadPdf')}
            />
            {!isCancelled && canEdit && onEdit && (
              <Button variant="outline" onClick={() => onEdit(run)} disabled={!!pendingEdit} title={pendingEdit ? t('productionDetailDrawer.awaitingApproval') : undefined}>
                <Pencil aria-hidden /> {t('productionDetailDrawer.edit')}
              </Button>
            )}
            {!isCancelled && canCancel && onCancel && (
              <Button variant="outline" className="text-danger-text" onClick={() => onCancel(run.id)}>
                <XCircle aria-hidden /> {t('productionDetailDrawer.cancel')}
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

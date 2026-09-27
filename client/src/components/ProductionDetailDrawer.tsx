import { useEffect, useCallback } from 'react';
import { X, Loader2, Package, ArrowRight, XCircle, Calculator, Gauge, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import PDFDownloadButton from './PDFDownloadButton';
import ProductionRunPDF from '../lib/pdf/ProductionRunPDF';
import type { ProductionRunPDFProps } from '../lib/pdf/ProductionRunPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

const fmtRupiah4 = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 });

interface Props {
  runId: string | null;
  onClose: () => void;
  onCancel?: (id: string) => void;
  canCancel?: boolean;
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

export default function ProductionDetailDrawer({ runId, onClose, onCancel, canCancel }: Props) {
  const { data: run, isLoading } = useQuery({
    queryKey: ['production-run-detail', runId],
    queryFn: () => api.get(`/inventory/production-runs/${runId}`).then(r => r.data),
    enabled: !!runId,
  });
  const company = useCompanyPDF();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (runId) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [runId, handleKeyDown]);

  if (!runId) return null;

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {run?.runNumber ?? 'Loading...'}
              </h2>
              {run && (
                <p className="text-xs text-gray-400">
                  {formatDate(run.date)} · {run.createdBy?.fullName}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {run && (
              <span className={cn(
                'badge text-xs',
                isCancelled ? 'badge-red' : 'badge-green'
              )}>
                {isCancelled ? 'Dibatalkan' : 'Selesai'}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : !run ? (
            <div className="p-6 text-center text-gray-400">Data tidak ditemukan.</div>
          ) : (
            <div className="px-6 py-5 space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-blue-500 uppercase">Total Input</p>
                  <p className="text-lg font-bold text-blue-700">{fmtNum(totalInputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-green-500 uppercase">Total Output</p>
                  <p className="text-lg font-bold text-green-700">{fmtNum(totalOutputQty)} <span className="text-xs font-normal">Kg</span></p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-purple-500 uppercase">Yield</p>
                  <p className="text-lg font-bold text-purple-700">
                    {run.yieldPct != null ? `${Number(run.yieldPct).toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Reference & Notes */}
              {(run.referenceNumber || run.notes) && (
                <div className="space-y-2">
                  {run.referenceNumber && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 text-xs font-medium">Referensi:</span>
                      <span className="font-mono text-xs bg-gray-50 px-2 py-0.5 rounded">{run.referenceNumber}</span>
                    </div>
                  )}
                  {run.notes && (
                    <div className="text-sm">
                      <span className="text-gray-400 text-xs font-medium">Catatan:</span>
                      <p className="text-gray-700 mt-0.5">{run.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* OEE: captured production data + metrics (B2 multi-machine) */}
              {hasOeeData && (
                <div className="space-y-3">
                  {/* Line-level (aggregate) OEE metric panel */}
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                    <h3 className="text-xs font-bold text-sky-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                      <Gauge size={13} /> OEE Line (agregat)
                    </h3>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="px-1.5 py-2">
                        <p className="text-[9px] font-semibold text-sky-600 uppercase tracking-wide">Availability</p>
                        <p className="text-sm font-semibold text-sky-800 font-mono">{fmtPct(run.availabilityPct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-[9px] font-semibold text-sky-600 uppercase tracking-wide">Performance</p>
                        <p className="text-sm font-semibold text-sky-800 font-mono">{fmtPct(run.performancePct)}</p>
                      </div>
                      <div className="px-1.5 py-2">
                        <p className="text-[9px] font-semibold text-sky-600 uppercase tracking-wide">Quality</p>
                        <p className="text-sm font-semibold text-sky-800 font-mono">{fmtPct(run.qualityPct)}</p>
                      </div>
                      <div className="rounded-lg bg-sky-100 px-1.5 py-2">
                        <p className="text-[9px] font-semibold text-sky-600 uppercase tracking-wide">OEE</p>
                        <p className="text-base font-bold text-sky-900 font-mono">{fmtPct(run.oeePct)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Captured production data (shift window + break + output) */}
                  <div className="border border-gray-200 rounded-lg p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <span className="text-gray-400 block">Shift</span>
                      <span className="text-gray-800 font-medium">
                        {run.shift ? (SHIFT_LABEL[run.shift] ?? run.shift) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Kepala Shift</span>
                      <span className="text-gray-800 font-medium">{run.shiftLead || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Jam Shift Mulai</span>
                      <span className="text-gray-800 font-medium">{fmtDateTime(run.plannedStart)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Jam Shift Selesai</span>
                      <span className="text-gray-800 font-medium">{fmtDateTime(run.plannedEnd)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Istirahat Mulai</span>
                      <span className="text-gray-800 font-medium">{fmtDateTime(run.breakStart)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Istirahat Selesai</span>
                      <span className="text-gray-800 font-medium">{fmtDateTime(run.breakEnd)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Jumlah MP</span>
                      <span className="text-gray-800 font-medium">
                        {run.manpowerCount != null ? `${run.manpowerCount} orang` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Total Downtime</span>
                      <span className="text-gray-800 font-medium">
                        {run.downtimeMin != null ? `${fmtNum(Number(run.downtimeMin), 2)} menit` : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Produk (output utama)</span>
                      <span className="text-gray-800 font-medium">{fmtNum(produkQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Produk Samping</span>
                      <span className="text-gray-800 font-medium">{fmtNum(sampingQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Loss / Susut</span>
                      <span className="text-rose-700 font-medium">{fmtNum(lossQty)} kg</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Yield (Quality)</span>
                      <span className="text-emerald-700 font-medium">
                        {oeeYieldPct != null ? `${oeeYieldPct.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Per-machine OEE table (B2) */}
                  {runMachineList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <Gauge size={12} /> OEE per Mesin ({runMachineList.length})
                      </h4>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-50 text-gray-500 text-left">
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
                              <tr key={rm.id} className="border-t border-gray-100 text-gray-800">
                                <td className="py-2 px-2 whitespace-nowrap">
                                  {rm.machine ? `${rm.machine.code} — ${rm.machine.name}` : '—'}
                                </td>
                                <td className="py-2 px-1 whitespace-nowrap text-gray-500">{fmtDateTime(rm.startAt)}</td>
                                <td className="py-2 px-1 whitespace-nowrap text-gray-500">{fmtDateTime(rm.endAt)}</td>
                                <td className="py-2 px-1 text-right font-mono">
                                  {rm.runMin != null ? `${fmtNum(Number(rm.runMin), 1)} m` : '—'}
                                </td>
                                <td className="py-2 px-1 text-right font-mono">
                                  {rm.allocatedQty != null ? fmtNum(Number(rm.allocatedQty), 1) : '—'}
                                </td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.availabilityPct)}</td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.performancePct)}</td>
                                <td className="py-2 px-1 text-right font-mono">{fmtPct(rm.qualityPct)}</td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-sky-900">{fmtPct(rm.oeePct)}</td>
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
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <Clock size={12} /> Downtime ({downtimeList.length})
                      </h4>
                      <div className="space-y-1.5">
                        {downtimeList.map((d: any) => (
                          <div key={d.id} className="bg-rose-50/50 border border-rose-100 rounded-lg px-3 py-2 flex items-center justify-between">
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-rose-800">{d.category}</span>
                              {d.machine && (
                                <span className="text-[10px] font-medium text-rose-500 ml-2">
                                  [{d.machine.code}]
                                </span>
                              )}
                              {d.reason && (
                                <span className="text-[11px] text-gray-500 ml-2">{d.reason}</span>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-rose-700 tabular-nums whitespace-nowrap ml-2">
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
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                    Proses Dijalankan ({run.runProcesses.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {run.runProcesses.map((rp: any) => (
                      <span
                        key={rp.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs"
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500" />
                        {rp.process?.name ?? '(?)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Input items */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Bahan Input ({inputLines.length})
                </h3>
                <div className="space-y-1.5">
                  {inputLines.map((line: any) => {
                    const lockedCost = line.batchUnitCost != null ? Number(line.batchUnitCost) : null;
                    return (
                      <div key={line.id} className="bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{line.item?.name}</span>
                            <span className="text-xs text-gray-400 ml-1">{line.item?.code}</span>
                          </div>
                          <span className="text-sm font-semibold text-blue-700 tabular-nums">
                            {fmtNum(Number(line.quantity))} {line.item?.unit}
                          </span>
                        </div>
                        {/* Phase 2: show batch info if linked */}
                        {line.sourceMovement && (
                          <div className="mt-1 text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>
                              <span className="text-gray-400">Batch:</span>{' '}
                              {line.sourceMovement.referenceNumber ?? line.sourceMovement.movementNumber}
                              {' '}
                              ({formatDate(line.sourceMovement.date)})
                            </span>
                            {lockedCost != null && (
                              <span>
                                <span className="text-gray-400">Cost terkunci:</span>{' '}
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

              {/* Arrow separator */}
              <div className="flex justify-center">
                <ArrowRight size={20} className="text-gray-300 rotate-90" />
              </div>

              {/* Output items */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Hasil Output ({outputLines.length})
                </h3>
                <div className="space-y-1.5">
                  {outputLines.map((line: any) => {
                    const rPct = totalInputQty > 0
                      ? ((Number(line.quantity) / totalInputQty) * 100).toFixed(1)
                      : null;
                    return (
                      <div key={line.id} className="bg-green-50/50 border border-green-100 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{line.item?.name}</span>
                            <span className="text-xs text-gray-400 ml-1">{line.item?.code}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {rPct && (
                              <span className="text-xs font-semibold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">
                                {rPct}%
                              </span>
                            )}
                            <span className="text-sm font-semibold text-green-700 tabular-nums">
                              {fmtNum(Number(line.quantity))} {line.item?.unit}
                            </span>
                          </div>
                        </div>
                        {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            HPP: <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
                            <span className="text-gray-400 ml-2">
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
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Produk Samping ({byProductLines.length})
                  </h3>
                  <div className="space-y-1.5">
                    {byProductLines.map((line: any) => (
                      <div key={line.id} className="bg-amber-50/50 border border-amber-100 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-800">{line.item?.name}</span>
                            <span className="text-xs text-gray-400 ml-1">{line.item?.code}</span>
                            <span className="ml-1 text-[9px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                              Samping
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-amber-700 tabular-nums">
                            {fmtNum(Number(line.quantity))} {line.item?.unit}
                          </span>
                        </div>
                        {line.unitPrice != null && Number(line.unitPrice) > 0 && (
                          <div className="mt-1 text-xs text-gray-500">
                            HPP: <span className="font-mono">{formatRupiah(Number(line.unitPrice))}/{line.item?.unit}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 3: Cost components — show snapshot */}
              {Array.isArray(run.runCosts) && run.runCosts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Komponen Biaya Produksi ({run.runCosts.length})
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                          <th className="text-left px-2 py-1.5 font-medium">Keterangan</th>
                          <th className="text-center px-2 py-1.5 font-medium">Sisi</th>
                          <th className="text-right px-2 py-1.5 font-medium">Rate</th>
                          <th className="text-right px-2 py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.runCosts.map((c: any) => (
                          <tr key={c.id} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-2 py-1.5 text-gray-700">
                              {c.description}
                              {c.costAccount && (
                                <span className="ml-1 text-[10px] text-gray-400">
                                  ({c.costAccount.accountNumber})
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={cn(
                                'text-[10px] px-1 rounded',
                                c.costSide === 'InputSide' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700',
                              )}>
                                {c.costSide === 'InputSide' ? 'Input' : 'Output'}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              Rp {fmtRupiah4(Number(c.rate))}
                              {c.basis !== 'Fixed' && (
                                <span className="text-[10px] text-gray-400">
                                  /{c.basis === 'InputQty' ? 'in' : 'out'}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-gray-800">
                              Rp {formatRupiah(Number(c.totalAmount))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Phase 3: Loaded HPP breakdown */}
              {run.computedHpp != null && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Calculator size={13} />
                    HPP Loaded
                    {run.hppManualOverride && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                        Override manual
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-gray-600">Biaya Material</span>
                    <span className="text-right font-mono text-gray-900">
                      {formatRupiah(Number(run.totalMaterialCost ?? 0))}
                    </span>
                    <span className="text-gray-600">+ Biaya Sisi Input</span>
                    <span className="text-right font-mono text-gray-900">
                      {formatRupiah(Number(run.totalCostInputSide ?? 0))}
                    </span>
                    <span className="text-gray-600">+ Biaya Sisi Output</span>
                    <span className="text-right font-mono text-gray-900">
                      {formatRupiah(Number(run.totalCostOutputSide ?? 0))}
                    </span>
                    <span className="text-gray-600">− Nilai Produk Samping</span>
                    <span className="text-right font-mono text-gray-900">
                      {formatRupiah(Number(run.totalByproductValue ?? 0))}
                    </span>
                  </div>
                  <div className="border-t border-emerald-200 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-emerald-800">HPP per Kg main output:</span>
                    <span className="text-base font-bold text-emerald-900 font-mono">
                      Rp {fmtRupiah4(Number(run.computedHpp))}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-700 pt-1">
                    Nilai ini yang diposting ke GL sebagai nilai persediaan output utama (bahan + biaya konversi − NRV produk samping).
                  </p>
                </div>
              )}

              {/* Modal bahan baku murni (WAC 2) — laporan manajemen, bukan GL */}
              {run.glSummary && run.glSummary.rawMaterialPerKg != null && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-1.5">
                  <h3 className="text-xs font-bold text-sky-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Package size={13} />
                    Modal Bahan Baku Murni
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 text-xs">
                    <span className="text-gray-600">Nilai bahan baku (real)</span>
                    <span className="text-right font-mono text-gray-900">{formatRupiah(run.glSummary.inputValue)}</span>
                    <span className="text-gray-600">÷ Output utama</span>
                    <span className="text-right font-mono text-gray-900">
                      {Number(run.glSummary.mainQty).toLocaleString('id-ID')} kg
                      {run.glSummary.yieldPct != null && (
                        <span className="text-gray-500"> (rendemen {Number(run.glSummary.yieldPct).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="border-t border-sky-200 pt-1.5 flex justify-between items-baseline">
                    <span className="text-xs text-sky-800 font-medium">Modal bahan baku murni / kg</span>
                    <span className="text-base font-bold text-sky-900 font-mono">Rp {fmtRupiah4(Math.round(run.glSummary.rawMaterialPerKg * 100) / 100)}</span>
                  </div>
                  {run.glSummary.glPerKg != null && (
                    <div className="flex justify-between items-baseline text-xs">
                      <span className="text-gray-600">HPP GL / kg (dibanding)</span>
                      <span className="font-mono text-gray-800">
                        Rp {fmtRupiah4(Math.round(run.glSummary.glPerKg * 100) / 100)}
                        <span className={cn('ml-2', run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg >= 0 ? 'text-red-600' : 'text-green-700')}>
                          ({run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg >= 0 ? '+' : '−'}
                          {fmtRupiah4(Math.round(Math.abs(run.glSummary.glPerKg - run.glSummary.rawMaterialPerKg) * 100) / 100)})
                        </span>
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-sky-700 pt-1">
                    Laporan manajemen — hanya pembelian bahan baku (angka real), tanpa biaya estimasi & produk samping. Tidak diposting ke GL.
                  </p>
                </div>
              )}

              {/* Cost summary — dari stock movement nyata (nilai yang benar-benar diposting) */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ringkasan Biaya (GL)</h3>
                {run.glSummary ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Bahan baku keluar</span>
                      <span className="font-mono font-medium text-gray-700">{formatRupiah(run.glSummary.inputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Output utama masuk</span>
                      <span className="font-mono font-medium text-gray-700">{formatRupiah(run.glSummary.mainValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Produk samping masuk (NRV)</span>
                      <span className="font-mono font-medium text-gray-700">{formatRupiah(run.glSummary.byproductValue)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                      <span className="text-gray-600 font-medium">Selisih ke 5.1 (biaya konversi)</span>
                      <span className={cn('font-mono font-semibold', run.glSummary.conversionDiff >= 0 ? 'text-green-700' : 'text-red-600')}>
                        {formatRupiah(Math.abs(run.glSummary.conversionDiff))}
                        {run.glSummary.conversionDiff >= 0 ? ' (CR)' : ' (DR)'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Biaya Input</span>
                      <span className="font-mono font-medium text-gray-700">{formatRupiah(totalInputValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Nilai Output</span>
                      <span className="font-mono font-medium text-gray-700">{formatRupiah(totalOutputValue)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Journal entry */}
              {journal && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                    Jurnal: {journal.entryNumber}
                    {journal.status === 'Cancelled' && (
                      <span className="badge badge-red text-[9px]">Dibatalkan</span>
                    )}
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">Akun</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Debit</th>
                          <th className="text-right px-3 py-2 text-gray-500 font-medium">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journal.items?.map((ji: any) => (
                          <tr key={ji.id} className="border-b border-gray-100">
                            <td className="px-3 py-2">
                              <span className="font-mono text-gray-500">{ji.account?.accountNumber}</span>
                              <span className="ml-1.5 text-gray-700">{ji.account?.name}</span>
                            </td>
                            <td className="text-right px-3 py-2 font-mono tabular-nums text-gray-700">
                              {Number(ji.debit) > 0 ? formatRupiah(Number(ji.debit)) : ''}
                            </td>
                            <td className="text-right px-3 py-2 font-mono tabular-nums text-gray-700">
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
        </div>

        {/* Footer */}
        {run && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-2">
            <PDFDownloadButton
              document={<ProductionRunPDF {...buildPdfProps(run, company)} />}
              fileName={`${run.runNumber}.pdf`}
              label="Unduh PDF"
            />
            {!isCancelled && canCancel && onCancel && (
              <button
                onClick={() => onCancel(run.id)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <XCircle size={16} /> Batalkan
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Helper: map run + company → PDF props ────────────────────────────────
function buildPdfProps(run: any, company: ReturnType<typeof useCompanyPDF>): ProductionRunPDFProps {
  const allItems: any[] = run.items ?? [];
  const mapItem = (line: any) => {
    const batchRef = line.sourceMovement
      ? `${line.sourceMovement.referenceNumber || line.sourceMovement.movementNumber} (${new Date(line.sourceMovement.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })})`
      : null;
    const lineCost = line.batchUnitCost != null
      ? Number(line.batchUnitCost)
      : line.unitPrice != null
        ? Number(line.unitPrice)
        : Number(line.item?.averageCost ?? 0);
    return {
      code: line.item?.code ?? null,
      name: line.item?.name ?? '',
      qty: Number(line.quantity),
      unit: line.item?.unit ?? '',
      unitCost: lineCost,
      isByProduct: line.isByProduct,
      batchRef,
    };
  };

  const inputLines = allItems.filter((i) => i.lineType === 'Input').map(mapItem);
  const outputLines = allItems.filter((i) => i.lineType === 'Output').map(mapItem);
  const byproductLines = allItems
    .filter((i) => i.lineType === 'ByProduct' || i.isByProduct)
    .filter((i) => i.lineType !== 'Output')
    .map(mapItem);

  const costs = (run.runCosts ?? []).map((c: any) => ({
    description: c.description,
    costSide: c.costSide,
    basis: c.basis,
    rate: Number(c.rate),
    qtyBasis: Number(c.qtyBasis),
    totalAmount: Number(c.totalAmount),
    accountLabel: c.costAccount
      ? `${c.costAccount.accountNumber} ${c.costAccount.name}`
      : null,
  }));

  const totalMainQty = outputLines.reduce((s, o) => s + o.qty, 0);

  // Resolve warehouse: prefer header (Phase-5 future) else first line
  const firstWh = allItems[0]?.warehouse;

  return {
    runNumber: run.runNumber,
    date: run.date,
    warehouseName: firstWh ? `${firstWh.code} — ${firstWh.name}` : null,
    referenceNumber: run.referenceNumber ?? null,
    notes: run.notes ?? null,
    yieldPct: run.yieldPct != null ? Number(run.yieldPct) : null,
    processes: Array.isArray(run.runProcesses)
      ? run.runProcesses.map((rp: any) => rp.process?.name).filter(Boolean)
      : [],
    inputs: inputLines,
    outputs: outputLines,
    byproducts: byproductLines,
    costs,
    totals: {
      totalMaterialCost: Number(run.totalMaterialCost ?? 0),
      totalCostInputSide: Number(run.totalCostInputSide ?? 0),
      totalCostOutputSide: Number(run.totalCostOutputSide ?? 0),
      totalByproductValue: Number(run.totalByproductValue ?? 0),
      computedHpp: run.computedHpp != null ? Number(run.computedHpp) : null,
      hppManualOverride: !!run.hppManualOverride,
      mainOutputQty: totalMainQty,
    },
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      taxId: company.taxId,
      logoUrl: company.logoUrl,
    },
    createdByName: run.createdBy?.fullName ?? null,
  };
}

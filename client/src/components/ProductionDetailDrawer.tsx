import { useEffect, useCallback } from 'react';
import { X, Loader2, Package, ArrowRight, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';

interface Props {
  runId: string | null;
  onClose: () => void;
  onCancel?: (id: string) => void;
  canCancel?: boolean;
}

const fmtNum = (val: number | string, decimals = 3) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

export default function ProductionDetailDrawer({ runId, onClose, onCancel, canCancel }: Props) {
  const { data: run, isLoading } = useQuery({
    queryKey: ['production-run-detail', runId],
    queryFn: () => api.get(`/inventory/production-runs/${runId}`).then(r => r.data),
    enabled: !!runId,
  });

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
  const totalInputValue = inputLines.reduce((s: number, i: any) => {
    const avg = Number(i.item?.averageCost ?? 0);
    return s + Number(i.quantity) * avg;
  }, 0);
  const totalOutputValue = outputLines.reduce((s: number, o: any) => {
    return s + Number(o.quantity) * Number(o.unitPrice ?? 0);
  }, 0);

  const isCancelled = run?.isCancelled;
  const journal = run?.journal;

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

              {/* Input items */}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Bahan Input ({inputLines.length})
                </h3>
                <div className="space-y-1.5">
                  {inputLines.map((line: any) => (
                    <div key={line.id} className="flex items-center justify-between bg-blue-50/50 border border-blue-100 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{line.item?.name}</span>
                        <span className="text-xs text-gray-400 ml-1">{line.item?.code}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-blue-700 tabular-nums">
                          {fmtNum(Number(line.quantity))} {line.item?.unit}
                        </span>
                      </div>
                    </div>
                  ))}
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

              {/* Cost summary */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Ringkasan Biaya</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Biaya Input</span>
                  <span className="font-mono font-medium text-gray-700">{formatRupiah(totalInputValue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Nilai Output</span>
                  <span className="font-mono font-medium text-gray-700">{formatRupiah(totalOutputValue)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                  <span className="text-gray-600 font-medium">Selisih (HPP Konversi)</span>
                  <span className={cn(
                    'font-mono font-semibold',
                    totalOutputValue - totalInputValue > 0 ? 'text-red-600' : 'text-green-600'
                  )}>
                    {formatRupiah(Math.abs(totalOutputValue - totalInputValue))}
                    {totalOutputValue - totalInputValue > 0 ? ' (DR)' : ' (CR)'}
                  </span>
                </div>
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
        {run && !isCancelled && canCancel && onCancel && (
          <div className="px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => onCancel(run.id)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <XCircle size={16} /> Batalkan Proses Produksi
            </button>
          </div>
        )}
      </div>
    </>
  );
}

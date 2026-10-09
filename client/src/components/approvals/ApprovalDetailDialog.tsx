/**
 * Detail dialog for one approval request (Persetujuan). Shows the submitted
 * payload (PI / production run / DO / PO) with supporting context and the
 * decision actions. Extracted from ApprovalPanel; behaviour is unchanged.
 */
import PurchaseOrderApprovalSummary from '../PurchaseOrderApprovalSummary';
import { ThreeWayMatchPreview } from '../purchase/ThreeWayMatchPanel';
import AttachmentPreview from '../AttachmentPreview';
import { Check, Pencil, FileText } from 'lucide-react';
import { formatRupiah } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/shared';
import { pinnedDialogClass, PinnedBody, PinnedFooter, PinnedHeader } from '../overlays/dialog-parts';
import type { ApprovalRequest } from '../ApprovalPanel';
import { approvalTypeLabel, fmtDate, fmtNum, isAiToolApproval, isEditApprovalType, piLineTotal, piTotals, prodHppEstimate } from './approval-utils';
import { EditComparisonView } from './EditComparisonView';
import { AiToolApprovalSummary } from './AiToolApprovalSummary';

export interface ApprovalDetailDialogProps {
  request: ApprovalRequest | null;
  onClose: () => void;
  isAdmin: boolean;
  currentUserId: string | null;
  detailCtx: any;
  detailCtxLoading: boolean;
  partyMap: Record<string, string>;
  warehouseMap: Record<string, string>;
  machineMap: Record<string, string>;
  itemName: (id: string) => string;
  itemUnit: (id: string) => string;
  onResubmit?: (req: ApprovalRequest) => void;
  onViewDocument?: (req: ApprovalRequest) => void;
  onReject: (id: string) => void;
  onRevision: (id: string) => void;
  onApprove: (id: string) => void;
}

export function ApprovalDetailDialog(props: ApprovalDetailDialogProps) {
  const { request, onClose } = props;
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      {request && <DetailContent {...props} request={request} />}
    </Dialog>
  );
}

function DetailContent({
  request: detailReq,
  onClose,
  isAdmin,
  currentUserId,
  detailCtx,
  detailCtxLoading,
  partyMap,
  warehouseMap,
  machineMap,
  itemName,
  itemUnit,
  onResubmit,
  onViewDocument,
  onReject,
  onRevision,
  onApprove,
}: ApprovalDetailDialogProps & { request: ApprovalRequest }) {
  const p = detailReq.payload ?? {};
  const isProd = detailReq.documentType === 'ProductionRun';
  const isDO = detailReq.documentType === 'DeliveryOrder';
  const isPO = detailReq.documentType === 'PurchaseOrder';
  const isEdit = isEditApprovalType(detailReq.documentType);
  const piItems: any[] = p.items ?? [];
  const inputs: any[] = p.inputs ?? [];
  const outputs: any[] = p.outputs ?? [];
  const costs: any[] = p.costs ?? [];
  const runMachines: any[] = p.runMachines ?? [];
  const downtimes: any[] = p.downtimes ?? [];
  const processIds: string[] = p.processIds ?? [];
  const basisLabel: Record<string, string> = { InputQty: 'per kg input', OutputQty: 'per kg output', Fixed: 'tetap' };
  const fmtT = (v: any) => (v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const pi = isProd || isDO || isEdit || isAiToolApproval(detailReq.documentType) ? null : piTotals(p);
  const hppEst = isProd ? prodHppEstimate(p) : null;
  const docLabel = approvalTypeLabel(detailReq.documentType);
  const isAi = isAiToolApproval(detailReq.documentType);

  return (
    <DialogContent size={isProd || isDO ? 'lg' : 'doc'} className={pinnedDialogClass}>
      <PinnedHeader>
        <DialogTitle>Detail Pengajuan {docLabel}</DialogTitle>
        <DialogDescription>
          <StatusBadge status={detailReq.status} docType="approval" className="align-middle" /> oleh {detailReq.requester.fullName} ({detailReq.requester.role}) •{' '}
          {fmtDate(detailReq.createdAt)}
          {detailReq.documentNumber && detailReq.status === 'Approved' && <span className="ml-2 font-mono">{detailReq.documentNumber}</span>}
        </DialogDescription>
      </PinnedHeader>
      <PinnedBody className="space-y-4 text-sm">
        {detailReq.notes && (detailReq.status === 'Rejected' || detailReq.status === 'NeedsRevision') && (
          <div className="text-xs bg-warning-subtle border border-warning/30 rounded px-3 py-2 text-warning-text">
            <span className="font-medium">{detailReq.status === 'Rejected' ? 'Alasan tolak:' : 'Catatan revisi:'}</span> {detailReq.notes}
          </div>
        )}
        {/* Info umum */}
        {!isEdit && !isAi && <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {p.date && (
            <div>
              <span className="text-muted-foreground">Tanggal:</span> <span className="text-foreground">{p.date}</span>
            </div>
          )}
          {!isProd && p.partyId && (
            <div>
              <span className="text-muted-foreground">{isDO ? 'Pelanggan:' : 'Supplier:'}</span> <span className="text-foreground">{partyMap[p.partyId] ?? '—'}</span>
            </div>
          )}
          {!isProd && p.dueDate && (
            <div>
              <span className="text-muted-foreground">Jatuh Tempo:</span> <span className="text-foreground">{p.dueDate}</span>
            </div>
          )}
          {!isProd && p.terms && (
            <div>
              <span className="text-muted-foreground">Syarat:</span> <span className="text-foreground">{p.terms}</span>
            </div>
          )}
          {!isProd && p.customerRefNo && (
            <div>
              <span className="text-muted-foreground">No. Ref:</span> <span className="text-foreground">{p.customerRefNo}</span>
            </div>
          )}
          {isProd && p.warehouseId && (
            <div>
              <span className="text-muted-foreground">Gudang:</span> <span className="text-foreground">{warehouseMap[p.warehouseId] ?? '—'}</span>
            </div>
          )}
          {isProd && p.shift && (
            <div>
              <span className="text-muted-foreground">Shift:</span> <span className="text-foreground">{p.shift}</span>
            </div>
          )}
          {isProd && p.shiftLead && (
            <div>
              <span className="text-muted-foreground">Kepala Shift:</span> <span className="text-foreground">{p.shiftLead}</span>
            </div>
          )}
          {isProd && p.manpowerCount != null && (
            <div>
              <span className="text-muted-foreground">Jml Orang:</span> <span className="text-foreground">{p.manpowerCount}</span>
            </div>
          )}
          {isProd && (p.plannedStart || p.plannedEnd) && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Jendela Shift:</span>{' '}
              <span className="text-foreground">
                {fmtT(p.plannedStart)} – {fmtT(p.plannedEnd)}
              </span>
            </div>
          )}
          {isProd && (p.breakStart || p.breakEnd) && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Istirahat:</span>{' '}
              <span className="text-foreground">
                {fmtT(p.breakStart)} – {fmtT(p.breakEnd)}
              </span>
            </div>
          )}
          {p.notes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Catatan:</span> <span className="text-foreground">{p.notes}</span>
            </div>
          )}
        </div>}

        {isAi ? (
          <AiToolApprovalSummary payload={detailReq.payload} status={detailReq.status} />
        ) : isEdit ? (
          <EditComparisonView
            comparison={detailCtx?.comparison}
            loading={detailCtxLoading}
            amountText={detailReq.documentType === 'ProductionRunEdit' ? `${fmtNum(Number(detailReq.amount ?? 0))} kg` : formatRupiah(Number(detailReq.amount ?? 0))}
            onViewTarget={onViewDocument ? () => onViewDocument(detailReq) : undefined}
          />
        ) : isPO ? (
          detailReq.documentId ? (
            <PurchaseOrderApprovalSummary poId={detailReq.documentId} />
          ) : null
        ) : isDO ? (
          <>
            {p.negativeStockReason && (
              <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                <span className="font-semibold">Alasan stok minus:</span> {p.negativeStockReason}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Barang Dikirim</p>
              <div className="border border-border rounded-lg divide-y divide-border">
                {piItems.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">—</p>
                ) : (
                  piItems.map((it, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <div className="text-foreground">
                        <span className="font-medium">{it.itemName ?? '—'}</span>
                        {it.warehouseId && <span className="text-muted-foreground"> · {warehouseMap[it.warehouseId] ?? 'gudang'}</span>}
                      </div>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {fmtNum(Number(it.quantity ?? 0))} {it.unit ?? ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : isProd ? (
          <>
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Bahan Baku (Input)</p>
              <div className="border border-border rounded-lg divide-y divide-border">
                {inputs.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">—</p>
                ) : (
                  inputs.map((it, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {itemName(it.itemId)}
                        {Number(it.batchUnitCost ?? 0) > 0 && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-info-subtle text-info-text rounded">batch @{formatRupiah(Number(it.batchUnitCost))}</span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {fmtNum(Number(it.quantity ?? 0))} {itemUnit(it.itemId)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Hasil Produksi (Output)</p>
              <div className="border border-border rounded-lg divide-y divide-border">
                {outputs.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">—</p>
                ) : (
                  outputs.map((it, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {itemName(it.itemId)}
                        {it.isByProduct && <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-warning-subtle text-warning-text rounded font-medium">Samping</span>}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {fmtNum(Number(it.quantity ?? 0))} {itemUnit(it.itemId)}
                        {it.unitPrice != null && Number(it.unitPrice) > 0 && <span className="text-info-text ml-1">@{formatRupiah(Number(it.unitPrice))}</span>}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            {costs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Komponen Biaya</p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {costs.map((c, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {c.description ?? '—'} <span className="text-muted-foreground">({c.costSide === 'OutputSide' ? 'output' : 'input'})</span>
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {formatRupiah(Number(c.rate ?? 0))} <span className="text-muted-foreground">{basisLabel[c.basis] ?? c.basis ?? ''}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {runMachines.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Mesin</p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {runMachines.map((m, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-foreground">{machineMap[m.machineId] ?? '(mesin)'}</span>
                      <span className="font-mono text-muted-foreground">
                        {fmtT(m.startAt)} – {fmtT(m.endAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {downtimes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Downtime</p>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {downtimes.map((d, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-foreground">
                        {d.category}
                        {d.machineId ? ` • ${machineMap[d.machineId] ?? 'mesin'}` : ''}
                        {d.reason ? `: ${d.reason}` : ''}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">{fmtNum(Number(d.durationMin ?? 0))} mnt</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {processIds.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">Proses</p>
                <p className="text-xs text-muted-foreground">{processIds.length} proses tercatat</p>
              </div>
            )}
            {/* Estimasi HPP */}
            <div className="bg-muted/50 border border-border rounded-lg p-3">
              <p className="text-xs font-semibold text-foreground mb-1">Estimasi HPP</p>
              {hppEst && hppEst.hpp != null ? (
                <p className="text-sm font-semibold text-foreground">
                  {formatRupiah(hppEst.hpp)} <span className="text-xs font-normal text-muted-foreground">/ kg produk utama (estimasi)</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Biaya: {formatRupiah(hppEst?.costTotal ?? 0)} · Nilai by-product: {formatRupiah(hppEst?.byproductValue ?? 0)}
                  <br />
                  <span className="text-warning-text">HPP final (termasuk biaya material) dihitung saat disetujui.</span>
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Ringkasan supplier & kontrol */}
            {(() => {
              const totalKg = piItems
                .filter((it) => String(it.unit ?? '').toLowerCase() === 'kg')
                .reduce((a, it) => a + Number(it.timbanganDiterima ?? it.quantity ?? 0), 0);
              const totalTruk = piItems.reduce((a, it) => a + Number(it.timbanganTruk ?? 0), 0);
              const totalRef = piItems.reduce((a, it) => a + Number(it.refaksi ?? 0), 0);
              const sup = detailCtx?.supplier;
              const warn: string[] = [];
              for (const it of piItems) {
                const sl = it.goodsReceiptItemId ? detailCtx?.sttLines?.[it.goodsReceiptItemId] : null;
                if (sl?.alreadyInvoiced) warn.push(`${sl.sttNumber} sudah ditagih di ${sl.alreadyInvoiced}`);
                if (sl?.sttStatus === 'Cancelled') warn.push(`${sl.sttNumber} berstatus DIBATALKAN`);
                const q = Number(it.timbanganDiterima ?? it.quantity ?? 0);
                if (sl && Math.abs(q + Number(it.refaksi ?? 0) - Number(sl.quantity)) > 0.5)
                  warn.push(`${sl.sttNumber}: diterima ${fmtNum(q)} + refaksi ${fmtNum(Number(it.refaksi ?? 0))} ≠ STT ${fmtNum(Number(sl.quantity))}`);
                if (!it.goodsReceiptItemId && it.inventoryItemId) warn.push(`${it.itemName}: tidak terhubung STT`);
              }
              return (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Diterima</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{fmtNum(totalKg)} kg</p>
                      {totalTruk > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          truk {fmtNum(totalTruk)} · refaksi {fmtNum(totalRef)}
                          {totalTruk > 0 ? ` (${((totalRef / totalTruk) * 100).toFixed(2)}%)` : ''}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Harga Rata² / kg</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {totalKg > 0 ? formatRupiah(Math.round((pi?.grandTotal ?? 0) / totalKg)) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">grand total ÷ kg diterima</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hutang Berjalan Supplier</p>
                      <p className="text-sm font-semibold text-foreground tabular-nums">{sup ? formatRupiah(sup.openOutstanding) : '—'}</p>
                      <p className="text-[10px] text-muted-foreground">{sup ? `${sup.openInvoiceCount} invoice belum lunas` : ''}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deposit / Uang Muka</p>
                      <p className={cn('text-sm font-semibold tabular-nums', (sup?.depositBalance ?? 0) > 0 ? 'text-success-text' : 'text-foreground')}>
                        {sup ? formatRupiah(sup.depositBalance) : '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{(sup?.depositBalance ?? 0) > 0 ? 'bisa dipotongkan' : ''}</p>
                    </div>
                  </div>
                  {warn.length > 0 && (
                    <div className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-text space-y-0.5">
                      <p className="font-semibold">⚠ Perlu dicek</p>
                      {warn.map((w, k) => (
                        <p key={k}>• {w}</p>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Item Invoice ({piItems.length} baris)</p>
              {piItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (axe scrollable-region-focusable)
                <div className="border border-border rounded-lg overflow-x-auto" role="region" aria-label="Rincian item pengajuan" tabIndex={0}>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wide">
                      <tr>
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">STT</th>
                        <th className="px-2 py-2 text-left">Item / Gudang</th>
                        <th className="px-2 py-2 text-left">Mobil</th>
                        <th className="px-2 py-2 text-right">KA %</th>
                        <th className="px-2 py-2 text-right">Timb. Truk</th>
                        <th className="px-2 py-2 text-right">Refaksi</th>
                        <th className="px-2 py-2 text-right">Diterima</th>
                        <th className="px-2 py-2 text-right">Harga</th>
                        <th className="px-2 py-2 text-right">Harga Lalu</th>
                        <th className="px-2 py-2 text-right">Pajak/Pot.</th>
                        <th className="px-2 py-2 text-right">Subtotal</th>
                        <th className="px-2 py-2 text-left">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {piItems.map((it, i) => {
                        const qty = Number(it.timbanganDiterima ?? it.quantity ?? 0);
                        const sl = it.goodsReceiptItemId ? detailCtx?.sttLines?.[it.goodsReceiptItemId] : null;
                        const hist: any[] = it.inventoryItemId ? (detailCtx?.priceHistory?.[it.inventoryItemId] ?? []) : [];
                        const lastSame = hist.find((h) => h.sameSupplier);
                        const last = lastSame ?? hist[0];
                        const rate = Number(it.rate ?? 0);
                        const diff = last ? rate - last.rate : 0;
                        const qtyMismatch = sl && Math.abs(qty + Number(it.refaksi ?? 0) - Number(sl.quantity)) > 0.5;
                        const tax: string[] = [];
                        if (Number(it.discount ?? 0) > 0) tax.push(`disk ${it.discount}%`);
                        if (Number(it.taxPct ?? 0) > 0) tax.push(`PPN ${it.taxPct}%`);
                        if (Number(it.pphPct ?? 0) > 0) tax.push(`PPh ${it.pphPct}%`);
                        if (Number(it.potonganItem ?? 0) > 0) tax.push(`−${formatRupiah(Number(it.potonganItem))}`);
                        const ket = it.description || sl?.description;
                        const ref = Number(it.refaksi ?? 0);
                        const truk = Number(it.timbanganTruk ?? 0);
                        return (
                          <tr key={i} className={cn('align-top', (sl?.alreadyInvoiced || sl?.sttStatus === 'Cancelled') && 'bg-danger-subtle')}>
                            <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-2 py-2 font-mono text-foreground whitespace-nowrap">
                              {sl?.sttNumber ?? <span className="text-muted-foreground">—</span>}
                              {sl?.sttDate && (
                                <div className="text-[10px] text-muted-foreground font-sans">
                                  {new Date(sl.sttDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <div className="font-medium text-foreground">{it.itemName ?? '—'}</div>
                              {it.warehouseId && <div className="text-[10px] text-muted-foreground">{warehouseMap[it.warehouseId] ?? 'gudang'}</div>}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{it.nomorMobil ?? '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{it.kualitas ?? '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{truk > 0 ? fmtNum(truk) : '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {ref > 0 ? fmtNum(ref) : '—'}
                              {ref > 0 && truk > 0 && <div className="text-[10px] text-muted-foreground">{((ref / truk) * 100).toFixed(2)}%</div>}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                              <span className="font-medium">{fmtNum(qty)}</span> <span className="text-muted-foreground">{it.unit ?? ''}</span>
                              {sl && (
                                <div className={cn('text-[10px]', qtyMismatch ? 'text-danger-text font-semibold' : 'text-muted-foreground')}>
                                  STT {fmtNum(Number(sl.quantity))}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatRupiah(rate)}</td>
                            <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                              {last ? (
                                <div
                                  title={hist
                                    .map((h) => `${h.invoiceNumber} · ${new Date(h.date).toLocaleDateString('id-ID')} · ${h.supplier} · ${formatRupiah(h.rate)}`)
                                    .join('\n')}
                                >
                                  <span className="text-muted-foreground">{formatRupiah(last.rate)}</span>
                                  {diff !== 0 && (
                                    <span className={cn('ml-1 text-[10px] font-semibold', diff > 0 ? 'text-danger-text' : 'text-success-text')}>
                                      {diff > 0 ? '▲' : '▼'}
                                      {formatRupiah(Math.abs(diff))}
                                    </span>
                                  )}
                                  <div className="text-[10px] text-muted-foreground">
                                    {lastSame ? 'supplier ini' : (last.supplier ?? 'lain')} ·{' '}
                                    {new Date(last.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-[10px] text-muted-foreground">{tax.length ? tax.join(' · ') : '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap">{formatRupiah(Math.round(piLineTotal(it)))}</td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {ket ?? <span className="text-muted-foreground">—</span>}
                              {sl?.alreadyInvoiced && <div className="text-[10px] text-danger-text font-semibold">sudah di {sl.alreadyInvoiced}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Harga Lalu = harga beli item sama pada invoice terakhir (supplier ini bila ada). Arahkan kursor untuk lihat 5 riwayat. ▲ merah = lebih mahal.
              </p>
            </div>
            <ThreeWayMatchPreview items={piItems} />
            {/* Lampiran: pengajuan + STT sumber */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Lampiran</p>
              {detailCtxLoading ? (
                <p className="text-xs text-muted-foreground">Memuat lampiran…</p>
              ) : (
                <div className="space-y-3">
                  {(detailCtx?.requestAttachments?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Dari pengajuan ({detailCtx.requestAttachments.length})</p>
                      <AttachmentPreview referenceType="approval_request" referenceId={detailReq.id} canDelete={false} />
                    </div>
                  )}
                  {(detailCtx?.stts ?? []).map((s: any) => (
                    <div key={s.id}>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        <span className="font-mono text-foreground">{s.sttNumber}</span>
                        {s.date && <> · {new Date(s.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
                        {s.nomorMobil && <> · {s.nomorMobil}</>}
                        {s.driverName && <> · supir {s.driverName}</>}
                        {s.status === 'Cancelled' && <span className="ml-1 text-danger-text font-medium">(STT dibatalkan)</span>}
                      </p>
                      {s.attachments?.length > 0 ? (
                        <AttachmentPreview referenceType="goods_receipt" referenceId={s.id} canDelete={false} />
                      ) : (
                        <p className="text-xs text-warning-text">Tidak ada lampiran di STT ini.</p>
                      )}
                    </div>
                  ))}
                  {(detailCtx?.requestAttachments?.length ?? 0) === 0 && (detailCtx?.stts?.length ?? 0) === 0 && (
                    <p className="text-xs text-warning-text">Tidak ada lampiran (pengajuan tidak terhubung ke STT & tidak ada file diunggah).</p>
                  )}
                </div>
              )}
            </div>
            {/* Totals (estimasi) */}
            <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono tabular-nums">{formatRupiah(pi?.subtotal ?? 0)}</span>
              </div>
              {Number(p.potongan ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Potongan</span>
                  <span className="font-mono tabular-nums text-danger-text">− {formatRupiah(Number(p.potongan))}</span>
                </div>
              )}
              {Number(p.biayaLain ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Biaya Lain</span>
                  <span className="font-mono tabular-nums">{formatRupiah(Number(p.biayaLain))}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-border font-semibold text-foreground">
                <span>
                  Grand Total <span className="text-[10px] font-normal text-muted-foreground">(estimasi)</span>
                </span>
                <span className="font-mono tabular-nums">{formatRupiah(pi?.grandTotal ?? 0)}</span>
              </div>
            </div>
          </>
        )}
      </PinnedBody>
      <PinnedFooter className="flex-wrap">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
        {isAdmin && detailReq.status === 'Pending' && (
          <>
            <Button size="sm" variant="outline" className="text-danger-text hover:bg-danger-subtle" onClick={() => onReject(detailReq.id)}>
              Tolak
            </Button>
            {!isEdit && !isAi && (
              <Button size="sm" variant="outline" onClick={() => onRevision(detailReq.id)}>
                Minta Edit
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                onApprove(detailReq.id);
                onClose();
              }}
            >
              <Check aria-hidden /> Setuju
            </Button>
          </>
        )}
        {detailReq.status === 'NeedsRevision' && detailReq.requestedBy === currentUserId && onResubmit && (
          <Button
            size="sm"
            onClick={() => {
              onResubmit(detailReq);
              onClose();
            }}
          >
            <Pencil aria-hidden /> Edit &amp; Ajukan Ulang
          </Button>
        )}
        {detailReq.status === 'Approved' && !isEdit && detailReq.documentId && onViewDocument && (
          <Button
            size="sm"
            onClick={() => {
              onViewDocument(detailReq);
              onClose();
            }}
          >
            <FileText aria-hidden /> Lihat Dokumen
          </Button>
        )}
      </PinnedFooter>
    </DialogContent>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Download, FileDown, Loader2, Package, Pencil, Save, Wallet } from 'lucide-react';
import { pdf, PDFDownloadLink } from '@react-pdf/renderer';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { formatRupiah } from '@/lib/format';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import { mergeInvoicePdfWithAttachments } from '../lib/pdf/mergePdfWithAttachments';
import type { AttachmentRef } from '../lib/pdf/mergePdfWithAttachments';
import { computeDeductions } from '../lib/invoiceDeductions';
import ApplyDepositModal from './ApplyDepositModal';
import ApplyCustomerDepositModal from './ApplyCustomerDepositModal';
import DeliveryOrderFromInvoiceModal from './DeliveryOrderFromInvoiceModal';
import { ThreeWayMatchPanel } from './purchase/ThreeWayMatchPanel';
import { buildInvoicePdf } from './invoice-detail/buildInvoicePdf';
import { InvoiceStatusProgress } from './invoice-detail/InvoiceStatusProgress';
import { InvoiceInfoGrid } from './invoice-detail/InvoiceInfoGrid';
import { InvoiceItemsSection } from './invoice-detail/InvoiceItemsSection';
import {
  InvoiceAttachmentsSection,
  type InvoiceAttachment,
  type PaymentAttachmentRef,
} from './invoice-detail/InvoiceAttachmentsSection';
import { InvoiceSummary } from './invoice-detail/InvoiceSummary';
import { InvoiceMarginAnalysis } from './invoice-detail/InvoiceMarginAnalysis';
import { InvoicePaymentTimeline, type PaymentTimelineEntry } from './invoice-detail/InvoicePaymentTimeline';
import { InvoiceRevisePriceDialog } from './invoice-detail/InvoiceRevisePriceDialog';

interface Props {
  type: 'sales' | 'purchase';
  invoiceId: string | null;
  onClose: () => void;
  /**
   * Called when user wants to "edit lengkap" a purchase invoice.
   * Parent should: cancel the invoice, then open PurchaseInvoiceModal with prefill.
   */
  onEditFull?: (invoice: any) => void;
}

const InvoiceDetailDrawer: React.FC<Props> = ({ type, invoiceId, onClose, onEditFull }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const isSales = type === 'sales';
  const [isApplyDepositOpen, setIsApplyDepositOpen] = useState(false);
  const [isApplyCustomerDepositOpen, setIsApplyCustomerDepositOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelDepositAppId, setCancelDepositAppId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editTerms, setEditTerms] = useState('');
  const [createDOOpen, setCreateDOOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseRates, setReviseRates] = useState<Record<string, string>>({});
  const [reviseReason, setReviseReason] = useState('');
  const endpoint = isSales ? '/sales/invoices' : '/purchase/invoices';
  const canHaveAttachments = type === 'purchase' || type === 'sales';

  const { data: invoice, isLoading } = useQuery({
    queryKey: [type === 'sales' ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId],
    queryFn: async () => {
      const res = await api.get(`${endpoint}/${invoiceId}`);
      return res.data;
    },
    enabled: !!invoiceId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`${endpoint}/${invoiceId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      // Cancel sales invoice melepas DO link (invoiceCancellation.ts:113-116)
      // sehingga DO yg dulu di-link masuk lagi ke pending list — invalidate
      // cache supaya modal invoice baru langsung lihat DO yg ter-release.
      if (isSales) {
        queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
        queryClient.invalidateQueries({ queryKey: ['delivery-orders-pending'] });
      } else {
        // Mirror untuk STT/GR (purchase side)
        queryClient.invalidateQueries({ queryKey: ['stt-pending'] });
        queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-aging-summary'] });
      // Cancel bisa reverse stock + COGS JV — refresh stok list & ledger.
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      // Allocations released → refresh payment list & customer/vendor deposits
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Invoice berhasil dibatalkan.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan invoice.'),
  });

  const cancelDepositAppMutation = useMutation({
    mutationFn: (appId: string) => {
      const cancelEndpoint = isSales ? '/customer-deposits/apply' : '/vendor-deposits/apply';
      return api.post(`${cancelEndpoint}/${appId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'customer-deposits' : 'vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      toast.success('Alokasi uang muka berhasil dibatalkan.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan alokasi uang muka.'),
  });

  const editMutation = useMutation({
    mutationFn: (data: { notes?: string; dueDate?: string; terms?: string }) =>
      api.put(`${endpoint}/${invoiceId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoice-detail' : 'purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: [isSales ? 'sales-invoices' : 'purchase-invoices'] });
      toast.success('Invoice berhasil diperbarui.');
      setIsEditing(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal memperbarui invoice.'),
  });

  const reviseMutation = useMutation({
    mutationFn: (payload: { lines: { itemId: string; newRate: number }[]; reason: string }) =>
      api.post(`${endpoint}/${invoiceId}/revise-price`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Harga invoice berhasil direvisi. Jurnal selisih sudah diposting.');
      setReviseOpen(false);
      setReviseRates({});
      setReviseReason('');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal merevisi harga invoice.'),
  });

  const submitRevise = () => {
    const lines = items
      .map((it: any) => {
        const raw = reviseRates[it.id];
        if (raw === undefined || raw === '') return null;
        const newRate = Number(raw);
        if (!Number.isFinite(newRate) || newRate < 0) return null;
        if (newRate === Number(it.rate)) return null; // tak berubah
        return { itemId: it.id, newRate };
      })
      .filter(Boolean) as { itemId: string; newRate: number }[];
    if (lines.length === 0) {
      toast.error('Tidak ada harga yang diubah.');
      return;
    }
    if (reviseReason.trim().length < 10) {
      toast.error('Alasan revisi minimal 10 karakter.');
      return;
    }
    reviseMutation.mutate({ lines, reason: reviseReason.trim() });
  };

  const attachmentRefType = isSales ? 'sales_invoice' : 'purchase_invoice';
  const { data: attachments = [] } = useQuery({
    queryKey: ['invoice-attachments', attachmentRefType, invoiceId],
    queryFn: async () => {
      const res = await api.get(`/attachments/${attachmentRefType}/${invoiceId}`);
      return res.data as InvoiceAttachment[];
    },
    enabled: !!invoiceId && canHaveAttachments,
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      fd.append('referenceType', attachmentRefType);
      fd.append('referenceId', invoiceId!);
      for (const f of files) fd.append('files', f);
      await api.post('/attachments/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-attachments', attachmentRefType, invoiceId] });
      toast.success('Lampiran berhasil diupload.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal upload lampiran.'),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-attachments', attachmentRefType, invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['invoice-related-attachments', type, invoiceId] });
      toast.success('Lampiran dihapus.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal hapus lampiran.'),
  });

  // Payment attachments linked to this invoice via payment_allocations or deposit applications.
  // Read-only here — users manage these from the Payments module.
  const { data: relatedAttachments } = useQuery({
    queryKey: ['invoice-related-attachments', type, invoiceId],
    queryFn: async () => {
      const res = await api.get(`/attachments/invoice/${type}/${invoiceId}/related`);
      return res.data as { invoice: unknown[]; payments: PaymentAttachmentRef[] };
    },
    enabled: !!invoiceId && canHaveAttachments,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const paymentAttachments = relatedAttachments?.payments ?? [];

  if (!invoiceId) return null;

  const party = isSales ? invoice?.customer : invoice?.supplier;
  const partyLabel = isSales ? 'Pelanggan' : 'Supplier';
  const outstanding = Number(invoice?.outstanding ?? 0);
  const grandTotal = Number(invoice?.grandTotal ?? 0);
  const paidAmount = grandTotal - outstanding;
  const paidPct = grandTotal > 0 ? Math.round((paidAmount / grandTotal) * 100) : 0;

  const items = invoice?.items ?? [];
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
  // Sum quantity per unit. For purchase invoices, prefer timbanganDiterima
  // (received weight) when present, else fall back to quantity.
  const totalQtyByUnit: Record<string, number> = {};
  for (const i of items as any[]) {
    const q = Number(i.timbanganDiterima ?? i.quantity ?? 0);
    if (q <= 0) continue;
    const u = i.unit || 'Pcs';
    totalQtyByUnit[u] = (totalQtyByUnit[u] ?? 0) + q;
  }
  const totalQtyLabel = Object.entries(totalQtyByUnit)
    .map(([u, q]) => `${(q as number).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${u}`)
    .join(' · ');
  const taxPct = Number(invoice?.taxPct ?? 0);
  // Per-item tax: sum each item's tax, fallback to invoice-level for old invoices
  const taxAmount = items.some((i: any) => Number(i.taxPct ?? 0) > 0)
    ? items.reduce((s: number, i: any) => s + Number(i.amount) * Number(i.taxPct ?? 0) / 100, 0)
    : (taxPct > 0 ? subtotal * taxPct / 100 : 0);
  const hasPerItemTax = items.some((i: any) => Number(i.taxPct ?? 0) > 0);
  const pphAmount = items.reduce((s: number, i: any) => s + Number(i.amount) * Number(i.pphPct ?? 0) / 100, 0);
  const hasPerItemPph = items.some((i: any) => Number(i.pphPct ?? 0) > 0);
  const potongan = Number(invoice?.potongan ?? 0);
  const biayaLain = Number(invoice?.biayaLain ?? 0);
  const allocations = invoice?.paymentAllocations ?? [];
  const depositApplications = invoice?.depositApplications ?? [];

  // Linimasa gabungan Tunai/Bank + Uang Muka, terurut tanggal — termasuk yang
  // dibatalkan (ditampilkan pudar + coret) supaya kronologi revisi pembayaran
  // (mis. UM dibatalkan lalu diganti di tanggal lain) terlihat jelas, bukan
  // hilang begitu saja dari riwayat.
  const paymentTimeline: PaymentTimelineEntry[] = [
    ...allocations.map((a: any) => ({
      kind: 'cash' as const,
      id: a.id,
      label: a.payment?.paymentNumber,
      date: a.payment?.date,
      amount: a.allocatedAmount,
      isCancelled: a.payment?.status === 'Cancelled',
    })),
    ...depositApplications.map((a: any) => ({
      kind: 'deposit' as const,
      id: a.id,
      label: a.depositPayment?.paymentNumber,
      date: a.appliedAt ?? a.depositPayment?.date,
      amount: a.appliedAmount,
      isCancelled: a.isCancelled,
      raw: a,
    })),
  ].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());

  // Derive potongan/komisi from non-cash payment splits.
  // Doesn't change GL — purely a display layer over what's already booked.
  const deductions = computeDeductions(allocations);
  const netAfterDeductions = grandTotal - deductions.total;

  // Build "Rincian Pembayaran" rows for the invoice PDF. Show only
  // non-cancelled allocations (Cancelled payments are excluded).
  const paymentBreakdown = allocations
    .filter((a: any) => a.payment && a.payment.status !== 'Cancelled')
    .map((a: any) => ({
      paymentNumber: a.payment.paymentNumber,
      date: a.payment.date,
      amount: a.payment.amount,
      allocatedAmount: a.allocatedAmount,
      referenceNo: a.payment.referenceNo ?? null,
      notes: a.payment.notes ?? null,
      primaryAccount: a.payment.account
        ? {
            accountNumber: a.payment.account.accountNumber,
            name: a.payment.account.name,
            rootType: a.payment.account.rootType,
          }
        : null,
      splits: (a.payment.splits ?? []).map((s: any) => ({
        accountNumber: s.account.accountNumber,
        accountName: s.account.name,
        rootType: s.account.rootType,
        amount: s.amount,
        notes: s.notes ?? null,
      })),
    }));
  // Payment breakdown: deposit-applied vs cash-paid
  const paidFromDeposit = depositApplications
    .filter((a: any) => !a.isCancelled)
    .reduce((s: number, a: any) => s + Number(a.appliedAmount ?? 0), 0);
  const paidFromCash = Math.max(0, (Number(invoice?.grandTotal ?? 0) - Number(invoice?.outstanding ?? 0)) - paidFromDeposit);
  const partyDepositBalance = Number(
    (isSales ? party?.customerDepositBalance : party?.depositBalance) ?? 0,
  );

  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && outstanding > 0;
  const canCancel = invoice && invoice.status !== 'Cancelled' && (invoice.status !== 'Paid' || grandTotal === 0); // invoice Rp 0 (sumbangan) auto-Paid tapi tetap boleh dibatalkan
  const canEdit = invoice && invoice.status !== 'Cancelled';

  const startEditing = () => {
    setEditNotes(invoice?.notes ?? '');
    setEditDueDate(invoice?.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : '');
    setEditTerms(invoice?.terms ?? '');
    setIsEditing(true);
  };

  const saveEdit = () => {
    editMutation.mutate({
      notes: editNotes,
      dueDate: editDueDate || undefined,
      terms: editTerms || undefined,
    });
  };

  // Client-side merge: render invoice PDF, then append each attachment.
  // Called from "Unduh PDF + Lampiran" button in header.
  const downloadMergedPdf = async () => {
    if (!invoice) return;
    try {
      setIsMerging(true);
      const invoiceDoc = buildInvoicePdf({
        type, invoice, party, items, company, outstanding,
        paidFromCash, paidFromDeposit, partyDepositBalance, paymentBreakdown,
      });
      const invoiceBlob = await pdf(invoiceDoc).toBlob();
      // Include invoice's own attachments + any payment attachments linked to this
      // invoice (via allocations / deposit applications) so the merged PDF
      // contains the full document trail.
      const invoiceRefs: AttachmentRef[] = attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fetchUrl: `/attachments/file/${a.id}`,
      }));
      const paymentRefs: AttachmentRef[] = paymentAttachments.map((a) => ({
        id: a.id,
        fileName: a.payment?.paymentNumber
          ? `[${a.payment.paymentNumber}] ${a.fileName}`
          : a.fileName,
        mimeType: a.mimeType,
        fetchUrl: `/attachments/file/${a.id}`,
      }));
      const refs: AttachmentRef[] = [...invoiceRefs, ...paymentRefs];
      const merged = await mergeInvoicePdfWithAttachments(invoiceBlob, refs, {
        fetchBinary: async (url) => {
          const res = await api.get(url, { responseType: 'arraybuffer' });
          return res.data as ArrayBuffer;
        },
      });
      const url = URL.createObjectURL(merged);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoiceNumber}_with_lampiran.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PDF + lampiran siap diunduh.');
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menggabungkan PDF.');
    } finally {
      setIsMerging(false);
    }
  };

  const mergedCount = attachments.length + paymentAttachments.length;
  const showMergedPdf = canHaveAttachments && mergedCount > 0;
  const footBtn = 'max-sm:h-11';

  const openRevise = () => {
    // Prefill dengan harga sekarang.
    const init: Record<string, string> = {};
    items.forEach((it: any) => { init[it.id] = String(Number(it.rate)); });
    setReviseRates(init);
    setReviseReason('');
    setReviseOpen(true);
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="md" className="sm:max-w-2xl">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="flex items-center gap-2">
                {isSales ? <FileDown className="size-5 text-primary" aria-hidden /> : <Package className="size-5 text-primary" aria-hidden />}
                {isLoading ? 'Memuat…' : invoice?.invoiceNumber ?? (isSales ? 'Invoice Penjualan' : 'Invoice Pembelian')}
              </SheetTitle>
            </div>
            <SheetDescription>{isSales ? 'Invoice Penjualan' : 'Invoice Pembelian'}</SheetDescription>
          </SheetHeader>

          <SheetBody className="px-0 py-0">
            {isLoading ? (
              <div role="status" className="flex h-64 items-center justify-center">
                <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
                <span className="sr-only">Memuat invoice…</span>
              </div>
            ) : !invoice ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Invoice tidak ditemukan.
              </div>
            ) : (
              <>
                <InvoiceStatusProgress
                  isSales={isSales}
                  status={invoice.status}
                  isOverdue={!!isOverdue}
                  paidAmount={paidAmount}
                  grandTotal={grandTotal}
                  paidPct={paidPct}
                  outstanding={outstanding}
                  paidFromCash={paidFromCash}
                  paidFromDeposit={paidFromDeposit}
                />

                <InvoiceInfoGrid
                  invoice={invoice}
                  party={party}
                  partyLabel={partyLabel}
                  isOverdue={!!isOverdue}
                  isEditing={isEditing}
                  editDueDate={editDueDate}
                  editTerms={editTerms}
                  onEditDueDate={setEditDueDate}
                  onEditTerms={setEditTerms}
                />

                <InvoiceItemsSection
                  invoice={invoice}
                  items={items}
                  isSales={isSales}
                  hasPerItemPph={hasPerItemPph}
                  onCreateDO={() => setCreateDOOpen(true)}
                />

                {/* Three-way match (purchase only; additive `match` on GET /:id) */}
                {!isSales && invoice?.match && (
                  <div className="border-b border-border px-6 py-4">
                    <ThreeWayMatchPanel match={invoice.match} />
                  </div>
                )}

                {canHaveAttachments && (
                  <InvoiceAttachmentsSection
                    attachments={attachments}
                    paymentAttachments={paymentAttachments}
                    cancelled={invoice.status === 'Cancelled'}
                    onUpload={(files) => uploadAttachmentMutation.mutate(files)}
                    onDelete={(id) => deleteAttachmentMutation.mutate(id)}
                  />
                )}

                <InvoiceSummary
                  invoice={invoice}
                  totalQtyLabel={totalQtyLabel}
                  subtotal={subtotal}
                  taxAmount={taxAmount}
                  hasPerItemTax={hasPerItemTax}
                  taxPct={taxPct}
                  pphAmount={pphAmount}
                  potongan={potongan}
                  biayaLain={biayaLain}
                  grandTotal={grandTotal}
                  deductions={deductions}
                  netAfterDeductions={netAfterDeductions}
                />

                {isSales && <InvoiceMarginAnalysis items={items} />}

                <InvoicePaymentTimeline
                  entries={paymentTimeline}
                  isSales={isSales}
                  invoiceCancelled={invoice.status === 'Cancelled'}
                  onCancelDepositApp={setCancelDepositAppId}
                />

                {/* Apply Deposit Banner (has outstanding) */}
                {outstanding > 0.01 && invoice.status !== 'Cancelled' && (
                  <div className="space-y-2 border-b border-border px-6 py-3">
                    {partyDepositBalance > 0 && (
                      <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs">
                        <span className="text-warning-text">Saldo Uang Muka {partyLabel}</span>
                        <span className="font-semibold tabular-nums text-warning-text">{formatRupiah(partyDepositBalance)}</span>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      className={cn('w-full', footBtn)}
                      onClick={() => (isSales ? setIsApplyCustomerDepositOpen(true) : setIsApplyDepositOpen(true))}
                      disabled={partyDepositBalance <= 0}
                      title={partyDepositBalance <= 0 ? `${partyLabel} belum punya saldo uang muka` : undefined}
                    >
                      <Wallet aria-hidden /> Gunakan Uang Muka
                      {partyDepositBalance <= 0 && <span className="text-xs opacity-70">(saldo 0)</span>}
                    </Button>
                  </div>
                )}

                {/* Notes */}
                <div className="px-6 py-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan</h3>
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        aria-label="Catatan invoice"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={3}
                        placeholder="Catatan invoice..."
                        className="resize-none"
                      />
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <Button variant="ghost" className={footBtn} onClick={() => setIsEditing(false)} disabled={editMutation.isPending}>
                          Batal
                        </Button>
                        <Button className={footBtn} onClick={saveEdit} loading={editMutation.isPending}>
                          {!editMutation.isPending && <Save aria-hidden />}
                          {editMutation.isPending ? 'Menyimpan…' : 'Simpan'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {invoice.notes || <span className="italic text-muted-foreground">Tidak ada catatan</span>}
                    </p>
                  )}
                </div>
              </>
            )}
          </SheetBody>

          {invoice && (
            <SheetFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {canCancel && (
                  <Button
                    variant="ghost"
                    className={cn('text-danger-text', footBtn)}
                    onClick={() => setConfirmCancel(true)}
                    title="Batalkan invoice"
                  >
                    <Ban aria-hidden /> Batalkan Invoice
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap [&>*:only-child]:col-span-2">
                {canEdit && !isEditing && (
                  <Button variant="outline" className={footBtn} onClick={startEditing} title="Edit catatan & jatuh tempo">
                    <Pencil aria-hidden /> Edit
                  </Button>
                )}
                {!isSales && canEdit && onEditFull && Number(invoice?.outstanding ?? 0) === Number(invoice?.grandTotal ?? 0) && (
                  <Button variant="outline" className={footBtn} onClick={() => onEditFull(invoice)} title="Batalkan dan buat ulang invoice ini">
                    Edit Lengkap
                  </Button>
                )}
                {!isSales && invoice.status !== 'Cancelled' && invoice.status !== 'Draft' && (
                  <Button variant="outline" className={footBtn} onClick={openRevise} title="Revisi harga dari supplier (selisih diposting otomatis)">
                    Revisi Harga
                  </Button>
                )}
                {showMergedPdf ? (
                  <Button
                    variant="secondary"
                    className={footBtn}
                    onClick={downloadMergedPdf}
                    loading={isMerging}
                    title={`Unduh PDF invoice + ${mergedCount} lampiran (${attachments.length} invoice, ${paymentAttachments.length} pembayaran) dalam 1 file`}
                  >
                    {!isMerging && <Download aria-hidden />}
                    Unduh PDF +{mergedCount}
                  </Button>
                ) : (
                  <PDFDownloadLink
                    document={buildInvoicePdf({
                      type, invoice, party, items, company, outstanding,
                      paidFromCash, paidFromDeposit, partyDepositBalance, paymentBreakdown,
                    }) as React.ReactElement<any>}
                    fileName={`${invoice.invoiceNumber}.pdf`}
                    className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), footBtn)}
                  >
                    {({ loading }) => (
                      <>
                        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                        Unduh PDF
                      </>
                    )}
                  </PDFDownloadLink>
                )}
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title="Batalkan Invoice"
        description="Yakin ingin membatalkan invoice ini? Semua jurnal GL, stok, dan saldo akan di-reverse. Invoice yang sudah ada pembayaran atau alokasi uang muka harus dibatalkan terlebih dahulu."
        confirmLabel="Batalkan Invoice"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutateAsync()}
      />

      {/* Revisi Harga (purchase only) */}
      {!isSales && invoice && (
        <InvoiceRevisePriceDialog
          open={reviseOpen}
          onClose={() => setReviseOpen(false)}
          invoice={invoice}
          items={items}
          rates={reviseRates}
          onRateChange={(itemId, value) => setReviseRates((p) => ({ ...p, [itemId]: value }))}
          reason={reviseReason}
          onReasonChange={setReviseReason}
          pending={reviseMutation.isPending}
          onSubmit={submitRevise}
        />
      )}

      <ConfirmDialog
        open={cancelDepositAppId !== null}
        onOpenChange={(open) => !open && setCancelDepositAppId(null)}
        tone="danger"
        title="Batalkan Alokasi Uang Muka"
        description="Yakin ingin membatalkan alokasi uang muka ini? Saldo deposit akan dikembalikan dan outstanding invoice akan bertambah kembali."
        confirmLabel="Batalkan Alokasi"
        loading={cancelDepositAppMutation.isPending}
        onConfirm={() => (cancelDepositAppId ? cancelDepositAppMutation.mutateAsync(cancelDepositAppId) : undefined)}
      />

      {/* Apply Deposit Modal (Purchase). Conditional mount for fresh state. */}
      {!isSales && invoice && isApplyDepositOpen && (
        <ApplyDepositModal
          isOpen={true}
          onClose={() => setIsApplyDepositOpen(false)}
          purchaseInvoiceId={invoiceId!}
          partyId={invoice.partyId ?? invoice.supplier?.id ?? ''}
          invoiceOutstanding={outstanding}
        />
      )}

      {/* Apply Customer Deposit Modal (Sales). Conditional mount so each open
          starts with fresh state — no reset useEffect needed inside the modal. */}
      {isSales && invoice && isApplyCustomerDepositOpen && (
        <ApplyCustomerDepositModal
          isOpen={true}
          onClose={() => setIsApplyCustomerDepositOpen(false)}
          salesInvoiceId={invoiceId!}
          partyId={invoice.partyId ?? invoice.customer?.id ?? ''}
          invoiceOutstanding={outstanding}
        />
      )}

      {/* Retroactive "Buat Surat Jalan" for sales invoices that don't have a DO yet. */}
      {isSales && invoice && createDOOpen && (
        <DeliveryOrderFromInvoiceModal
          invoiceId={invoiceId!}
          invoiceNumber={invoice.invoiceNumber}
          customerName={party?.name ?? '—'}
          items={items.map((it: any) => ({
            id: it.id,
            itemName: it.itemName,
            quantity: Number(it.quantity),
            unit: it.unit,
            inventoryItemId: it.inventoryItemId ?? null,
          }))}
          onClose={() => setCreateDOOpen(false)}
        />
      )}
    </>
  );
};

export default InvoiceDetailDrawer;

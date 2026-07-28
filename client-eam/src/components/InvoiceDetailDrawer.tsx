import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, FileDown, Clock, CreditCard, Package, User, Calendar, AlertTriangle, CheckCircle2, Loader2, Wallet, XCircle, Pencil, Save, Paperclip, FileText, Image as ImageIcon, Trash2, Download, Truck } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import PDFDownloadButton from './PDFDownloadButton';
import InvoicePDF from '../lib/pdf/InvoicePDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import { mergeInvoicePdfWithAttachments } from '../lib/pdf/mergePdfWithAttachments';
import type { AttachmentRef } from '../lib/pdf/mergePdfWithAttachments';
import { computeDeductions } from '../lib/invoiceDeductions';
import ApplyDepositModal from './ApplyDepositModal';
import ApplyCustomerDepositModal from './ApplyCustomerDepositModal';
import DeliveryOrderFromInvoiceModal from './DeliveryOrderFromInvoiceModal';
import { ConfirmDialog } from './ConfirmDialog';

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

const statusConfig: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  Draft:        { label: 'Draft',          badge: 'badge badge-gray',   icon: <Clock size={13} /> },
  Submitted:    { label: 'Diajukan',       badge: 'badge badge-blue',   icon: <Clock size={13} /> },
  PartiallyPaid:{ label: 'Sebagian Lunas', badge: 'badge badge-yellow', icon: <AlertTriangle size={13} /> },
  Paid:         { label: 'Lunas',          badge: 'badge badge-green',  icon: <CheckCircle2 size={13} /> },
  Cancelled:    { label: 'Dibatalkan',     badge: 'badge badge-red',    icon: <X size={13} /> },
  Overdue:      { label: 'Jatuh Tempo',    badge: 'badge badge-red',    icon: <AlertTriangle size={13} /> },
};

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
      return res.data as Array<{ id: string; fileName: string; mimeType: string; fileSize: number }>;
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
  interface PaymentAttachmentRef {
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    payment: { id: string; paymentNumber: string; paymentType: string; date: string; status: string } | null;
  }
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

  const sc = statusConfig[invoice?.status] ?? statusConfig.Draft;

  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && outstanding > 0;
  const canCancel = invoice && invoice.status !== 'Cancelled' && invoice.status !== 'Paid';
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
      const invoiceDoc = (
        <InvoicePDF
          type={type}
          invoiceNumber={invoice.invoiceNumber}
          date={invoice.date}
          dueDate={invoice.dueDate}
          terms={invoice.terms}
          customerRefNo={invoice.customerRefNo}
          status={invoice.status}
          notes={invoice.notes}
          taxPct={invoice.taxPct ?? 0}
          potongan={invoice.potongan ?? 0}
          biayaLain={invoice.biayaLain ?? 0}
          labelPotongan={invoice.labelPotongan}
          labelBiaya={invoice.labelBiaya}
          grandTotal={invoice.grandTotal}
          outstanding={outstanding}
          paidFromCash={paidFromCash}
          paidFromDeposit={paidFromDeposit}
          partyDepositBalance={partyDepositBalance}
          party={{
            name: party?.name ?? '—',
            address: party?.address,
            phone: party?.phone,
            email: party?.email,
            taxId: party?.taxId,
          }}
          items={items.map((it: any) => ({
            itemName: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            rate: it.rate,
            discount: it.discount ?? 0,
            taxPct: it.taxPct ?? 0,
            pphPct: it.pphPct ?? 0,
            amount: it.amount,
            description: it.description,
            kualitas: it.kualitas,
            nomorMobil: it.nomorMobil,
            timbanganTruk: it.timbanganTruk,
            refaksi: it.refaksi,
            timbanganDiterima: it.timbanganDiterima,
            potonganItem: it.potonganItem,
          }))}
          company={company}
          invoiceSettings={company.invoiceSettings}
          payments={paymentBreakdown}
        />
      );
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[100vw] sm:max-w-2xl bg-white shadow-2xl flex flex-col animate-slide-in-right">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              {isSales ? <FileDown size={18} className="text-blue-600" /> : <Package size={18} className="text-blue-600" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {isLoading ? 'Memuat...' : invoice?.invoiceNumber}
              </h2>
              <p className="text-xs text-gray-400">
                {isSales ? 'Invoice Penjualan' : 'Invoice Pembelian'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {canEdit && !isEditing && (
              <button
                onClick={startEditing}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit catatan & jatuh tempo"
              >
                <Pencil size={16} />
              </button>
            )}
            {!isSales && canEdit && onEditFull && Number(invoice?.outstanding ?? 0) === Number(invoice?.grandTotal ?? 0) && (
              <button
                onClick={() => onEditFull(invoice)}
                className="px-2 py-1 rounded-lg hover:bg-amber-50 text-xs font-medium text-amber-600 hover:text-amber-700 border border-amber-200 transition-colors"
                title="Batalkan dan buat ulang invoice ini"
              >
                Edit Lengkap
              </button>
            )}
            {!isSales && invoice && invoice.status !== 'Cancelled' && invoice.status !== 'Draft' && (
              <button
                onClick={() => {
                  // Prefill dengan harga sekarang.
                  const init: Record<string, string> = {};
                  items.forEach((it: any) => { init[it.id] = String(Number(it.rate)); });
                  setReviseRates(init);
                  setReviseReason('');
                  setReviseOpen(true);
                }}
                className="px-2 py-1 rounded-lg hover:bg-blue-50 text-xs font-medium text-blue-600 hover:text-blue-700 border border-blue-200 transition-colors"
                title="Revisi harga dari supplier (selisih diposting otomatis)"
              >
                Revisi Harga
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setConfirmCancel(true)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Batalkan invoice"
              >
                <XCircle size={16} />
              </button>
            )}
            {invoice && (canHaveAttachments && (attachments.length + paymentAttachments.length) > 0 ? (
              <button
                onClick={downloadMergedPdf}
                disabled={isMerging}
                className="btn-secondary btn-sm flex items-center gap-1.5 disabled:opacity-50"
                title={`Unduh PDF invoice + ${attachments.length + paymentAttachments.length} lampiran (${attachments.length} invoice, ${paymentAttachments.length} pembayaran) dalam 1 file`}
              >
                {isMerging ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span className="hidden sm:inline">Unduh PDF +{attachments.length + paymentAttachments.length}</span>
              </button>
            ) : (
              <PDFDownloadButton
                variant="button"
                fileName={`${invoice.invoiceNumber}.pdf`}
                label="Unduh PDF"
                document={
                  <InvoicePDF
                    type={type}
                    invoiceNumber={invoice.invoiceNumber}
                    date={invoice.date}
                    dueDate={invoice.dueDate}
                    terms={invoice.terms}
          customerRefNo={invoice.customerRefNo}
                    status={invoice.status}
                    notes={invoice.notes}
                    taxPct={invoice.taxPct ?? 0}
                    potongan={invoice.potongan ?? 0}
                    biayaLain={invoice.biayaLain ?? 0}
                    labelPotongan={invoice.labelPotongan}
                    labelBiaya={invoice.labelBiaya}
                    grandTotal={invoice.grandTotal}
          outstanding={outstanding}
          paidFromCash={paidFromCash}
          paidFromDeposit={paidFromDeposit}
          partyDepositBalance={partyDepositBalance}
                    party={{
                      name: party?.name ?? '—',
                      address: party?.address,
                      phone: party?.phone,
                      email: party?.email,
                      taxId: party?.taxId,
                    }}
                    items={items.map((it: any) => ({
                      itemName: it.itemName,
                      quantity: it.quantity,
                      unit: it.unit,
                      rate: it.rate,
                      discount: it.discount ?? 0,
                      taxPct: it.taxPct ?? 0,
                      pphPct: it.pphPct ?? 0,
                      amount: it.amount,
                      description: it.description,
                      kualitas: it.kualitas,
                      nomorMobil: it.nomorMobil,
                      timbanganTruk: it.timbanganTruk,
                      refaksi: it.refaksi,
                      timbanganDiterima: it.timbanganDiterima,
                      potonganItem: it.potonganItem,
                    }))}
                    company={company}
                    invoiceSettings={company.invoiceSettings}
                    payments={paymentBreakdown}
                  />
                }
              />
            ))}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
            </div>
          ) : !invoice ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Invoice tidak ditemukan.
            </div>
          ) : (
            <>
              {/* Status + Progress bar */}
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <span className={cn(sc.badge, 'inline-flex items-center gap-1')}>
                    {sc.icon} {sc.label}
                  </span>
                  {isOverdue && (
                    <span className="badge badge-red inline-flex items-center gap-1 text-xs">
                      <AlertTriangle size={11} /> Lewat jatuh tempo
                    </span>
                  )}
                </div>
                {/* Payment progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Pembayaran</span>
                    <span className="font-mono font-medium text-gray-700">{formatRupiah(paidAmount)} / {formatRupiah(grandTotal)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        paidPct >= 100 ? 'bg-green-500' : paidPct > 0 ? 'bg-yellow-400' : 'bg-gray-200'
                      )}
                      style={{ width: `${Math.min(paidPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{paidPct}% terbayar</span>
                    {outstanding > 0 && <span className="text-red-400 font-medium">Sisa: {formatRupiah(outstanding)}</span>}
                  </div>
                  {/* Payment breakdown */}
                  {(paidFromCash > 0 || paidFromDeposit > 0) && (
                    <div className="flex items-center gap-3 text-xs text-gray-500 pt-1">
                      {paidFromCash > 0 && (
                        <span>💵 Tunai/Bank: <span className="font-mono text-gray-700">{formatRupiah(paidFromCash)}</span></span>
                      )}
                      {paidFromDeposit > 0 && (
                        <span>💰 Uang Muka: <span className="font-mono text-gray-700">{formatRupiah(paidFromDeposit)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-100">
                {/* Party info */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User size={10} /> {partyLabel}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">{party?.name ?? '—'}</p>
                  {party?.phone && <p className="text-xs text-gray-500 mt-0.5">{party.phone}</p>}
                  {party?.email && <p className="text-xs text-gray-500">{party.email}</p>}
                  {party?.address && <p className="text-xs text-gray-400 mt-0.5">{party.address}</p>}
                  {party?.taxId && <p className="text-xs text-gray-400">NPWP: {party.taxId}</p>}
                </div>

                {/* Invoice meta */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Calendar size={10} /> Informasi Invoice
                  </p>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-400">Jatuh Tempo</label>
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Termin</label>
                        <input
                          type="text"
                          value={editTerms}
                          onChange={(e) => setEditTerms(e.target.value)}
                          placeholder="Net 30"
                          className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-400">Tanggal</p>
                        <p className="text-xs font-medium text-gray-800">{formatDate(invoice.date)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Jatuh Tempo</p>
                        <p className={cn('text-xs font-medium', isOverdue ? 'text-red-500' : 'text-gray-800')}>
                          {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                        </p>
                      </div>
                      {invoice.terms && (
                        <div>
                          <p className="text-xs text-gray-400">Termin</p>
                          <p className="text-xs font-medium text-gray-800">{invoice.terms}</p>
                        </div>
                      )}
                      {invoice.customerRefNo && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-400">No. Ref. PO / Penawaran</p>
                          <p className="text-xs font-mono font-medium text-gray-800">{invoice.customerRefNo}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-400">Dibuat oleh</p>
                        <p className="text-xs font-medium text-gray-800">{invoice.user?.fullName ?? '—'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              <div className="px-6 py-4 border-b border-gray-100">
                {isSales && (() => {
                  const linkedDOs = Array.from(
                    new Map(
                      items
                        .map((it: any) => it.deliveryOrderItem?.deliveryOrder)
                        .filter((d: any) => d)
                        .map((d: any) => [d.id, d]),
                    ).values(),
                  );
                  if (linkedDOs.length > 0) {
                    return (
                      <div className="mb-3 p-2.5 bg-blue-50/60 border border-blue-100 rounded-lg flex items-start gap-2 text-xs">
                        <Truck size={13} className="text-blue-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <p className="text-blue-700 font-semibold mb-0.5">
                            Ditagihkan dari {linkedDOs.length === 1 ? 'Surat Jalan' : `${linkedDOs.length} Surat Jalan`}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {linkedDOs.map((d: any) => (
                              <span key={d.id} className="font-mono text-[11px] px-1.5 py-0.5 bg-white border border-blue-200 rounded text-blue-700">
                                {d.doNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // No DO yet. Offer to create one retroactively if invoice is
                  // active and has at least one inventory line.
                  const hasInventoryLine = items.some((it: any) => it.inventoryItemId);
                  const canCreate = invoice && invoice.status !== 'Cancelled' && hasInventoryLine;
                  if (!canCreate) return null;
                  return (
                    <div className="mb-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2 text-xs">
                      <Truck size={13} className="text-gray-400 shrink-0" />
                      <span className="text-gray-500 flex-1">Invoice ini belum punya Surat Jalan.</span>
                      <button
                        onClick={() => setCreateDOOpen(true)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1"
                      >
                        <Truck size={12} /> Buat Surat Jalan
                      </button>
                    </div>
                  );
                })()}
                {/* Purchase side: tampilkan STT/BPB asal barang. */}
                {!isSales && (() => {
                  const linkedSTTs = Array.from(
                    new Map(
                      items
                        .map((it: any) => it.goodsReceiptItem?.goodsReceipt)
                        .filter((g: any) => g)
                        .map((g: any) => [g.id, g]),
                    ).values(),
                  );
                  if (linkedSTTs.length === 0) return null;
                  return (
                    <div className="mb-3 p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-lg flex items-start gap-2 text-xs">
                      <Truck size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-emerald-700 font-semibold mb-0.5">
                          Barang diterima dari {linkedSTTs.length === 1 ? 'STT/BPB' : `${linkedSTTs.length} STT/BPB`}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {linkedSTTs.map((g: any) => (
                            <span key={g.id} className="font-mono text-[11px] px-1.5 py-0.5 bg-white border border-emerald-200 rounded text-emerald-700">
                              {g.sttNumber}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                  <Package size={10} /> Daftar Barang / Jasa ({items.length} item)
                </p>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 w-8">#</th>
                        <th className="text-left px-4 py-2.5">Nama</th>
                        <th className="text-center px-3 py-2.5 w-16">Qty</th>
                        <th className="text-center px-3 py-2.5 w-16">Satuan</th>
                        <th className="text-right px-3 py-2.5 w-28">Harga</th>
                        <th className="text-right px-3 py-2.5 w-16">Disk%</th>
                        <th className="text-right px-3 py-2.5 w-16">PPN%</th>
                        {hasPerItemPph && <th className="text-right px-3 py-2.5 w-16">PPh%</th>}
                        <th className="text-right px-4 py-2.5 w-28">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className={cn('border-b border-gray-50 last:border-0', idx % 2 === 1 && 'bg-gray-50/50')}>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-300">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-gray-800">{item.itemName}</p>
                              {item.itemType === 'service' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold rounded bg-purple-100 text-purple-700">Jasa</span>
                              )}
                              {item.deliveryOrderItem?.deliveryOrder?.doNumber && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded bg-blue-100 text-blue-700">
                                  <Truck size={8} /> {item.deliveryOrderItem.deliveryOrder.doNumber}
                                </span>
                              )}
                              {/* STT/BPB asal (purchase side) — supaya dari PI tahu
                                  barang ini diterima lewat STT nomor berapa. */}
                              {item.goodsReceiptItem?.goodsReceipt?.sttNumber && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded bg-emerald-100 text-emerald-700">
                                  <Truck size={8} /> {item.goodsReceiptItem.goodsReceipt.sttNumber}
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                            {!isSales && (item.kualitas || item.timbanganTruk || item.refaksi || item.nomorMobil) && (
                              <div className="text-xs text-gray-400 space-x-2 mt-0.5">
                                {item.nomorMobil && <span>Mobil: <span className="font-mono text-gray-600 uppercase">{item.nomorMobil}</span></span>}
                                {item.kualitas && <span>Kualitas: <span className="text-gray-600">{item.kualitas}</span></span>}
                                {Number(item.timbanganTruk) > 0 && <span>Truk: {Number(item.timbanganTruk).toLocaleString('id-ID')} kg</span>}
                                {Number(item.refaksi) > 0 && <span className="text-amber-600">Refaksi: {Number(item.refaksi).toLocaleString('id-ID')} kg</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-700">
                            {Number(item.quantity).toLocaleString('id-ID')}
                          </td>
                          <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.unit}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-700">{formatRupiah(Number(item.rate))}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            <span className={Number(item.discount) > 0 ? 'text-orange-500' : 'text-gray-300'}>
                              {Number(item.discount) > 0 ? `${Number(item.discount)}%` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            <span className={Number(item.taxPct) > 0 ? 'text-blue-600' : 'text-gray-300'}>
                              {Number(item.taxPct) > 0 ? `${Number(item.taxPct)}%` : '—'}
                            </span>
                          </td>
                          {hasPerItemPph && (
                            <td className="px-3 py-2.5 text-right font-mono text-xs">
                              <span className={Number(item.pphPct) > 0 ? 'text-orange-600' : 'text-gray-300'}>
                                {Number(item.pphPct) > 0 ? `${Number(item.pphPct)}%` : '—'}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-gray-900">
                            {formatRupiah(Number(item.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Attachments (purchase invoice only) */}
              {canHaveAttachments && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      <Paperclip size={10} /> Dokumen Pendukung ({attachments.length})
                    </p>
                    {invoice.status !== 'Cancelled' && (
                      <label className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                        + Tambah File
                        <input
                          type="file"
                          multiple
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) uploadAttachmentMutation.mutate(files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {attachments.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Belum ada lampiran.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {attachments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-xs">
                          {a.mimeType === 'application/pdf' ? (
                            <FileText size={14} className="text-red-500 shrink-0" />
                          ) : (
                            <ImageIcon size={14} className="text-blue-500 shrink-0" />
                          )}
                          <a
                            href={`/api/attachments/file/${a.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 truncate text-gray-700 hover:text-blue-600"
                          >
                            {a.fileName}
                          </a>
                          <span className="text-gray-400">{(a.fileSize / 1024).toFixed(0)} KB</span>
                          {invoice.status !== 'Cancelled' && (
                            <button
                              onClick={() => deleteAttachmentMutation.mutate(a.id)}
                              className="text-gray-400 hover:text-red-500"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Related: attachments from payments/deposit applications linked to this invoice */}
                  {paymentAttachments.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Paperclip size={10} /> Dari Pembayaran ({paymentAttachments.length})
                      </p>
                      <div className="space-y-1.5">
                        {paymentAttachments.map((a) => (
                          <div key={a.id} className="flex items-center gap-2 p-2 bg-blue-50/40 rounded-lg text-xs border border-blue-100/50">
                            {a.mimeType === 'application/pdf' ? (
                              <FileText size={14} className="text-red-500 shrink-0" />
                            ) : (
                              <ImageIcon size={14} className="text-blue-500 shrink-0" />
                            )}
                            <a
                              href={`/api/attachments/file/${a.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 truncate text-gray-700 hover:text-blue-600"
                              title={a.fileName}
                            >
                              {a.fileName}
                            </a>
                            {a.payment && (
                              <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                {a.payment.paymentNumber}
                              </span>
                            )}
                            <span className="text-gray-400 whitespace-nowrap">{(a.fileSize / 1024).toFixed(0)} KB</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 italic mt-1.5">
                        Lampiran ini milik pembayaran terkait. Kelola dari menu Bank &amp; Kas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex justify-end">
                  <div className="w-72 space-y-2">
                    {totalQtyLabel && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Total Qty</span>
                        <span className="font-mono text-gray-800 tabular-nums">{totalQtyLabel}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Subtotal</span>
                      <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(subtotal)}</span>
                    </div>
                    {taxAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{hasPerItemTax ? 'PPN (per item)' : `PPN ${taxPct}%`}</span>
                        <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(taxAmount)}</span>
                      </div>
                    )}
                    {pphAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-orange-500">PPh (per item)</span>
                        <span className="font-mono text-orange-600 tabular-nums">− {formatRupiah(pphAmount)}</span>
                      </div>
                    )}
                    {potongan > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-red-400">{invoice.labelPotongan || 'Potongan'}</span>
                        <span className="font-mono text-red-500 tabular-nums">({formatRupiah(potongan)})</span>
                      </div>
                    )}
                    {biayaLain > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">{invoice.labelBiaya || 'Biaya Lain'}</span>
                        <span className="font-mono text-gray-800 tabular-nums">{formatRupiah(biayaLain)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 flex justify-between items-baseline">
                      <span className="text-sm font-semibold text-gray-700">Grand Total</span>
                      <span className={cn(
                        'font-mono tabular-nums',
                        deductions.total > 0
                          ? 'text-sm text-gray-500 line-through'
                          : 'text-lg font-bold text-blue-600'
                      )}>
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>
                    {deductions.total > 0 && (
                      <>
                        <div className="pt-1 space-y-0.5">
                          {deductions.byAccount.map((d) => (
                            <div key={d.accountNumber} className="flex justify-between text-xs">
                              <span className="text-amber-600">
                                {d.accountNumber} {d.label}
                              </span>
                              <span className="font-mono text-amber-700 tabular-nums">
                                ({formatRupiah(d.total)})
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-amber-200 pt-2 flex justify-between items-baseline bg-amber-50/40 -mx-2 px-2 py-1.5 rounded">
                          <span className="text-sm font-semibold text-amber-900">Net Setelah Potongan</span>
                          <span className="text-lg font-bold text-amber-700 font-mono tabular-nums">{formatRupiah(netAfterDeductions)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Phase 6: margin analysis (sales only). Shows side-by-side
                  material WAC vs loaded HPP margin when at least one line has
                  unitCostLoaded captured from a Phase 5 batch pick. */}
              {isSales && (() => {
                const productLines = items.filter((i: any) => i.inventoryItemId);
                if (productLines.length === 0) return null;
                const lineWithLoaded = productLines.filter((i: any) => i.unitCostLoaded != null);
                if (lineWithLoaded.length === 0) return null;
                const totalRev = productLines.reduce((s: number, i: any) => s + Number(i.amount), 0);
                const materialCost = productLines.reduce(
                  (s: number, i: any) =>
                    s + Number(i.quantity) * Number(i.inventoryItem?.averageCost ?? 0),
                  0,
                );
                const loadedCost = productLines.reduce(
                  (s: number, i: any) =>
                    s + Number(i.quantity) * Number(i.unitCostLoaded ?? i.inventoryItem?.averageCost ?? 0),
                  0,
                );
                const matMargin = totalRev - materialCost;
                const loadMargin = totalRev - loadedCost;
                const matPct = totalRev > 0 ? (matMargin / totalRev) * 100 : 0;
                const loadPct = totalRev > 0 ? (loadMargin / totalRev) * 100 : 0;
                return (
                  <div className="px-6 py-4 border-b border-gray-100">
                    <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest mb-3 flex items-center gap-1">
                      Margin Analysis ({lineWithLoaded.length}/{productLines.length} line tracked)
                    </p>
                    <div className="border border-emerald-200 rounded-lg overflow-hidden bg-emerald-50/30">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-emerald-50 border-b border-emerald-200 text-emerald-800">
                            <th className="text-left px-3 py-1.5 font-semibold">Basis</th>
                            <th className="text-right px-3 py-1.5 font-semibold">Revenue (Produk)</th>
                            <th className="text-right px-3 py-1.5 font-semibold">COGS</th>
                            <th className="text-right px-3 py-1.5 font-semibold">Margin</th>
                            <th className="text-right px-3 py-1.5 font-semibold">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-emerald-100">
                            <td className="px-3 py-1.5 text-gray-700">Material (WAC)</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatRupiah(totalRev)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatRupiah(materialCost)}</td>
                            <td className={cn('px-3 py-1.5 text-right font-mono', matMargin >= 0 ? 'text-green-700' : 'text-red-600')}>
                              {formatRupiah(matMargin)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{matPct.toFixed(1)}%</td>
                          </tr>
                          <tr className="bg-emerald-50/50">
                            <td className="px-3 py-1.5 text-emerald-900 font-medium">Loaded HPP</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatRupiah(totalRev)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{formatRupiah(loadedCost)}</td>
                            <td className={cn('px-3 py-1.5 text-right font-mono font-semibold',
                              loadMargin >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                              {formatRupiah(loadMargin)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-semibold">
                              {loadPct.toFixed(1)}%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Material basis = pakai WAC saat ini. Loaded basis = pakai HPP per batch
                      (Phase 3: include biaya produksi & by-product NRV).
                    </p>
                  </div>
                );
              })()}

              {/* Payment History */}
              {allocations.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                    <CreditCard size={10} /> Riwayat Pembayaran ({allocations.length})
                  </p>
                  <div className="space-y-2">
                    {allocations.map((alloc: any) => (
                      <div key={alloc.id} className="flex items-center justify-between p-3 bg-green-50/50 border border-green-100 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-green-100 rounded">
                            <CreditCard size={13} className="text-green-600" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">{alloc.payment?.paymentNumber}</p>
                            <p className="text-xs text-gray-400">{formatDate(alloc.payment?.date)}</p>
                          </div>
                        </div>
                        <span className="font-mono text-sm font-semibold text-green-600">
                          {formatRupiah(Number(alloc.allocatedAmount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deposit Applications */}
              {depositApplications.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                    <Wallet size={10} /> Riwayat Uang Muka ({depositApplications.length})
                  </p>
                  <div className="space-y-2">
                    {depositApplications.map((app: any) => (
                      <div key={app.id} className={cn(
                        'flex items-center justify-between p-3 rounded-lg',
                        app.isCancelled
                          ? 'bg-gray-50 border border-gray-200 opacity-50'
                          : isSales ? 'bg-teal-50/50 border border-teal-100' : 'bg-amber-50/50 border border-amber-100'
                      )}>
                        <div className="flex items-center gap-3">
                          <div className={cn('p-1.5 rounded', app.isCancelled ? 'bg-gray-100' : isSales ? 'bg-teal-100' : 'bg-amber-100')}>
                            <Wallet size={13} className={app.isCancelled ? 'text-gray-400' : isSales ? 'text-teal-600' : 'text-amber-600'} />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-800">
                              {app.depositPayment?.paymentNumber}
                              {app.isCancelled && <span className="ml-1.5 text-xs text-red-400">(Dibatalkan)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{formatDate(app.appliedAt ?? app.depositPayment?.date)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('font-mono text-sm font-semibold', app.isCancelled ? 'text-gray-400 line-through' : isSales ? 'text-teal-600' : 'text-amber-600')}>
                            {formatRupiah(Number(app.appliedAmount))}
                          </span>
                          {!app.isCancelled && invoice.status !== 'Cancelled' && (
                            <button
                              onClick={() => setCancelDepositAppId(app.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                              title="Batalkan alokasi uang muka"
                            >
                              <XCircle size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply Deposit Banner (has outstanding) */}
              {outstanding > 0.01 && invoice.status !== 'Cancelled' && (
                <div className="px-6 py-3 border-b border-gray-100 space-y-2">
                  {partyDepositBalance > 0 && (
                    <div className="flex items-center justify-between text-xs bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2">
                      <span className="text-amber-700">Saldo Uang Muka {partyLabel}</span>
                      <span className="font-mono font-semibold text-amber-800">{formatRupiah(partyDepositBalance)}</span>
                    </div>
                  )}
                  <button
                    onClick={() => isSales ? setIsApplyCustomerDepositOpen(true) : setIsApplyDepositOpen(true)}
                    disabled={partyDepositBalance <= 0}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      isSales
                        ? 'bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    )}
                    title={partyDepositBalance <= 0 ? `${partyLabel} belum punya saldo uang muka` : undefined}
                  >
                    <Wallet size={14} /> Gunakan Uang Muka
                    {partyDepositBalance <= 0 && <span className="text-xs opacity-70">(saldo 0)</span>}
                  </button>
                </div>
              )}

              {/* Notes */}
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Catatan</p>
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      placeholder="Catatan invoice..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-400 outline-none resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {editMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {invoice.notes || <span className="text-gray-300 italic">Tidak ada catatan</span>}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cancel Invoice Confirm */}
      <ConfirmDialog
        open={confirmCancel}
        title="Batalkan Invoice"
        message="Yakin ingin membatalkan invoice ini? Semua jurnal GL, stok, dan saldo akan di-reverse. Invoice yang sudah ada pembayaran atau alokasi uang muka harus dibatalkan terlebih dahulu."
        confirmLabel="Batalkan Invoice"
        variant="danger"
        onConfirm={() => { cancelMutation.mutate(); setConfirmCancel(false); }}
        onCancel={() => setConfirmCancel(false)}
      />

      {/* Revisi Harga Modal (Purchase only) */}
      {!isSales && reviseOpen && invoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => !reviseMutation.isPending && setReviseOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Revisi Harga Invoice</h3>
                <p className="text-xs text-gray-500 mt-0.5">{invoice.invoiceNumber} — {invoice.supplier?.name}</p>
              </div>
              <button onClick={() => setReviseOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
                Selisih harga diposting otomatis: porsi barang yang <strong>masih di stok</strong> menyesuaikan nilai Persediaan + harga rata-rata; porsi yang <strong>sudah keluar</strong> (produksi/jual) masuk akun <strong>5.11 Selisih Harga Pembelian</strong>. Hutang ke supplier ikut disesuaikan.
              </p>
              <div className="space-y-2">
                {items.map((it: any) => {
                  const oldRate = Number(it.rate);
                  const qty = Number(it.quantity);
                  const raw = reviseRates[it.id] ?? String(oldRate);
                  const newRate = Number(raw);
                  const delta = Number.isFinite(newRate) ? (newRate - oldRate) * qty : 0;
                  return (
                    <div key={it.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-800">{it.itemName}</span>
                        <span className="text-[11px] text-gray-400">{qty.toLocaleString('id-ID')} {it.unit}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400">Lama: {oldRate.toLocaleString('id-ID')}</span>
                        <span className="text-gray-300">→</span>
                        <input
                          type="number"
                          value={raw}
                          min={0}
                          onChange={(e) => setReviseRates((p) => ({ ...p, [it.id]: e.target.value }))}
                          className="w-32 border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                          placeholder="harga baru"
                        />
                        {delta !== 0 && (
                          <span className={`ml-auto tabular-nums font-medium ${delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {delta > 0 ? '+' : ''}{delta.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alasan revisi (min 10 karakter) *</label>
                <textarea
                  value={reviseReason}
                  onChange={(e) => setReviseReason(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  placeholder="contoh: Supplier koreksi harga gabah dari Rp 5.000 → 5.200 sesuai kesepakatan akhir"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button onClick={() => setReviseOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button
                onClick={submitRevise}
                disabled={reviseMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {reviseMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Simpan Revisi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Deposit Application Confirm */}
      <ConfirmDialog
        open={cancelDepositAppId !== null}
        title="Batalkan Alokasi Uang Muka"
        message="Yakin ingin membatalkan alokasi uang muka ini? Saldo deposit akan dikembalikan dan outstanding invoice akan bertambah kembali."
        confirmLabel="Batalkan Alokasi"
        variant="danger"
        onConfirm={() => { if (cancelDepositAppId) cancelDepositAppMutation.mutate(cancelDepositAppId); setCancelDepositAppId(null); }}
        onCancel={() => setCancelDepositAppId(null)}
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

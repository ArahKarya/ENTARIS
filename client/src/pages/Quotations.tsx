import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import {
  Plus, Search, FileText, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, FileCheck2, Download, AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { formatRupiah, formatDate } from '../lib/formatters';
import { exportToExcel } from '../lib/exportExcel';
import QuotationModal from '../components/QuotationModal';
import QuotationDetailDrawer from '../components/QuotationDetailDrawer';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Sent', label: 'Terkirim' },
  { value: 'Accepted', label: 'Diterima' },
  { value: 'Rejected', label: 'Ditolak' },
  { value: 'Expired', label: 'Kadaluarsa' },
  { value: 'Cancelled', label: 'Dibatalkan' },
];

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Sent: 'Terkirim',
  Accepted: 'Diterima',
  Rejected: 'Ditolak',
  Expired: 'Kadaluarsa',
  Cancelled: 'Dibatalkan',
};

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray',
  Sent: 'badge-blue',
  Accepted: 'badge-green',
  Rejected: 'badge-red',
  Expired: 'badge-yellow',
  Cancelled: 'badge-gray',
};

const PAGE_SIZE = 20;

export const Quotations = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inquiryPrefill, setInquiryPrefill] = useState<any>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle deep-link from Inquiry → Quotation conversion. The inquiry drawer
  // stashes the prefill payload in sessionStorage and navigates with
  // ?from-inquiry=<inquiryId>. We pop it here and open the modal pre-filled.
  useEffect(() => {
    const inquiryId = searchParams.get('from-inquiry');
    if (!inquiryId) return;
    try {
      const raw = sessionStorage.getItem('inquiry-convert-prefill');
      if (raw) {
        const payload = JSON.parse(raw);
        sessionStorage.removeItem('inquiry-convert-prefill');
        setInquiryPrefill(payload);
        setEditTarget({
          partyId: payload.partyId,
          notes: payload.notes ? `${payload.notes}\n\n[Dari inquiry ${payload.inquiryNumber}]` : `[Dari inquiry ${payload.inquiryNumber}]`,
          items: payload.items ?? [],
        });
        setIsModalOpen(true);
      }
    } catch { /* ignore */ }
    // Clear param so refresh doesn't re-trigger
    searchParams.delete('from-inquiry');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => {
      const res = await api.get('/quotations?limit=200');
      return res.data.data ?? res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!raw) return [];
    return raw.filter((q: any) => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match = q.quotationNumber?.toLowerCase().includes(s) || q.customer?.name?.toLowerCase().includes(s);
        if (!match) return false;
      }
      if (statusFilter && q.status !== statusFilter) return false;
      if (dateFrom && new Date(q.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(q.date) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [raw, searchTerm, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    if (!raw) return { total: 0, draft: 0, sent: 0, accepted: 0, conversionRate: 0, totalValue: 0 };
    let draft = 0, sent = 0, accepted = 0, rejected = 0, expired = 0, totalValue = 0;
    for (const q of raw) {
      totalValue += Number(q.grandTotal);
      if (q.status === 'Draft') draft++;
      else if (q.status === 'Sent') sent++;
      else if (q.status === 'Accepted') accepted++;
      else if (q.status === 'Rejected') rejected++;
      else if (q.status === 'Expired') expired++;
    }
    const issued = sent + accepted + rejected + expired;
    const conversionRate = issued > 0 ? Math.round((accepted / issued) * 100) : 0;
    return { total: raw.length, draft, sent, accepted, conversionRate, totalValue };
  }, [raw]);

  const isExpiringSoon = (q: any) => {
    if (q.status !== 'Sent' || !q.validUntil) return false;
    const days = (new Date(q.validUntil).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 3;
  };

  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const q of filtered as any[]) {
      const items = Array.isArray(q.items) && q.items.length > 0 ? q.items : [null];
      for (const it of items) {
        rows.push({
          'No. Penawaran': q.quotationNumber,
          Tanggal: formatDate(q.date),
          'Berlaku Sampai': formatDate(q.validUntil),
          Pelanggan: q.customer?.name ?? '',
          Status: STATUS_LABEL[q.status] ?? q.status,
          'Nama Produk': it?.itemName ?? '',
          Qty: it ? Number(it.quantity) : '',
          Unit: it?.unit ?? '',
          'Harga Satuan': it ? Number(it.rate) : '',
          'Diskon (%)': it ? Number(it.discount ?? 0) : '',
          'PPN (%)': it ? Number(it.taxPct ?? 0) : '',
          'PPh (%)': it ? Number(it.pphPct ?? 0) : '',
          'Subtotal Item': it ? Number(it.amount) : '',
          'Grand Total Penawaran': Number(q.grandTotal),
          'Sales Invoice': q.salesInvoice?.invoiceNumber ?? '',
          Catatan: q.notes ?? '',
        });
      }
    }
    const stamp = new Date().toISOString().slice(0, 10);
    exportToExcel(rows, `penawaran-${stamp}`);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Penawaran Harga</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Kelola dokumen penawaran ke pelanggan dan konversi ke faktur penjualan.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            title="Ekspor daftar (sesuai filter) ke Excel"
          >
            <Download size={15} /> Ekspor Excel
          </button>
          <button
            className="btn-primary"
            onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
          >
            <Plus size={15} /> Buat Penawaran
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-lg font-bold text-foreground">{summary.total}</p>
              <p className="text-[11px] text-muted-foreground">{formatRupiah(summary.totalValue)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Terkirim</p>
              <p className="text-lg font-bold text-foreground">{summary.sent}</p>
              <p className="text-[11px] text-muted-foreground">menunggu konfirmasi</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diterima</p>
              <p className="text-lg font-bold text-foreground">{summary.accepted}</p>
              <p className="text-[11px] text-muted-foreground">siap konversi</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <FileCheck2 size={16} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversion Rate</p>
              <p className="text-lg font-bold text-foreground">{summary.conversionRate}%</p>
              <p className="text-[11px] text-muted-foreground">accepted / issued</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari nomor / pelanggan..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-border rounded-lg py-2 px-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="text-xs">Dari</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-border rounded-lg py-2 px-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="border border-border rounded-lg py-2 px-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(searchTerm || statusFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearchTerm(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tanggal</th>
                <th scope="col">No. Penawaran</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Berlaku Sampai</th>
                <th scope="col" className="text-right">Grand Total</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col">Konversi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Memuat data penawaran...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      {raw?.length === 0 ? 'Belum ada penawaran.' : 'Tidak ada penawaran sesuai filter.'}
                    </p>
                    {raw?.length === 0 && (
                      <button
                        onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                        className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        + Buat penawaran pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginated.map((q: any) => (
                  <tr
                    key={q.id}
                    onClick={() => setSelectedId(q.id)}
                    className="cursor-pointer"
                  >
                    <td className="text-muted-foreground whitespace-nowrap">{formatDate(q.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{q.quotationNumber}</span>
                    </td>
                    <td>
                      <p className="font-medium text-foreground">{q.customer?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{q.customer?.phone || ''}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={cn('text-sm', isExpiringSoon(q) ? 'text-amber-600 font-medium' : 'text-muted-foreground')}>
                        {formatDate(q.validUntil)}
                        {isExpiringSoon(q) && <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />}
                      </span>
                    </td>
                    <td className="text-right font-mono font-medium text-foreground tabular-nums">{formatRupiah(Number(q.grandTotal))}</td>
                    <td className="text-center">
                      <span className={cn('badge', STATUS_BADGE[q.status] ?? 'badge-gray')}>
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {q.salesInvoice ? (
                        <span className="text-green-600 font-mono">{q.salesInvoice.invoiceNumber}</span>
                      ) : q.status === 'Accepted' ? (
                        <span className="text-blue-600">Belum dikonversi</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs px-2 text-foreground">Hal {page} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <QuotationModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditTarget(null); setInquiryPrefill(null); }}
        editTarget={editTarget}
        onCreated={async (q) => {
          if (inquiryPrefill?.inquiryId && q?.id) {
            try {
              await api.post(`/inquiries/${inquiryPrefill.inquiryId}/link`, { salesInvoiceId: undefined, quotationId: q.id });
            } catch { /* ignore */ }
            setInquiryPrefill(null);
          }
        }}
      />

      <QuotationDetailDrawer
        quotationId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(q) => {
          setSelectedId(null);
          setEditTarget(q);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default Quotations;

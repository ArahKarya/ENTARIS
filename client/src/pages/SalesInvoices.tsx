import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, FileText, ChevronLeft, ChevronRight,
  DollarSign, AlertTriangle, CheckCircle2, Receipt, Download, Undo2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import { exportToExcel } from '../lib/exportExcel';
import SalesInvoiceModal from '../components/SalesInvoiceModal';
import SalesReturnModal from '../components/SalesReturnModal';
import InvoiceDetailDrawer from '../components/InvoiceDetailDrawer';
import TableRowSkeleton from '../components/TableRowSkeleton';
import { useDebounce } from '../hooks/useDebounce';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Submitted', label: 'Diajukan' },
  { value: 'PartiallyPaid', label: 'Sebagian Lunas' },
  { value: 'Paid', label: 'Lunas' },
];

const PAGE_SIZE = 20;

export const SalesInvoices = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Deep-link dari Surat Jalan: /sales?fromDO=<id>&party=<partyId> → buka modal
  // & prefill dari DO tsb.
  const [prefillFromDO, setPrefillFromDO] = useState<{ doId: string; partyId: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const doId = searchParams.get('fromDO');
    const party = searchParams.get('party');
    if (doId && party) {
      setPrefillFromDO({ doId, partyId: party });
      setIsModalOpen(true);
      // bersihkan query supaya tak terbuka ulang saat refresh/navigate
      searchParams.delete('fromDO');
      searchParams.delete('party');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['sales-invoices'],
    queryFn: async () => {
      const response = await api.get('/sales/invoices?limit=500');
      return response.data.data ?? response.data;
    },
  });

  // Client-side filtering (uses debounced search to avoid re-filter on every keystroke)
  const filtered = useMemo(() => {
    if (!raw) return [];
    return raw.filter((inv: any) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const match = inv.invoiceNumber?.toLowerCase().includes(q) || inv.customer?.name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter && inv.status !== statusFilter) return false;
      if (dateFrom && new Date(inv.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(inv.date) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [raw, debouncedSearch, statusFilter, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Summary cards data
  const summary = useMemo(() => {
    if (!raw) return { total: 0, totalAmount: 0, outstanding: 0, paid: 0, overdue: 0 };
    const now = new Date();
    let totalAmount = 0, outstanding = 0, paid = 0, overdue = 0;
    for (const inv of raw) {
      totalAmount += Number(inv.grandTotal);
      outstanding += Number(inv.outstanding);
      if (inv.status === 'Paid') paid++;
      if (inv.dueDate && new Date(inv.dueDate) < now && Number(inv.outstanding) > 0) overdue++;
    }
    return { total: raw.length, totalAmount, outstanding, paid, overdue };
  }, [raw]);

  const isOverdue = (inv: any) => inv.dueDate && new Date(inv.dueDate) < new Date() && Number(inv.outstanding) > 0;

  const handleExport = () => {
    const rows: Record<string, unknown>[] = [];
    for (const inv of filtered as any[]) {
      const totalPaid = Number(inv.grandTotal) - Number(inv.outstanding);
      const statusLabel = isOverdue(inv) ? `${inv.status} (Overdue)` : inv.status;
      const items = Array.isArray(inv.items) && inv.items.length > 0 ? inv.items : [null];
      for (const it of items) {
        rows.push({
          Tanggal: formatDate(inv.date),
          'Nomor Dokumen': inv.invoiceNumber,
          Pelanggan: inv.customer?.name ?? '',
          Telepon: inv.customer?.phone ?? '',
          'Jatuh Tempo': inv.dueDate ? formatDate(inv.dueDate) : '',
          'Jenis Item': it ? (it.itemType === 'service' ? 'Jasa' : 'Produk') : '',
          'Nama Produk': it?.itemName ?? '',
          Deskripsi: it?.description ?? '',
          Qty: it ? Number(it.quantity) : '',
          Unit: it?.unit ?? '',
          'Harga Satuan': it ? Number(it.rate) : '',
          'Diskon (%)': it ? Number(it.discount ?? 0) : '',
          'PPN (%)': it ? Number(it.taxPct ?? 0) : '',
          'PPh (%)': it ? Number(it.pphPct ?? 0) : '',
          'Subtotal Item': it ? Number(it.amount) : '',
          'Total Invoice': Number(inv.grandTotal),
          'Sudah Dibayar': totalPaid,
          'Sisa Tagihan': Number(inv.outstanding),
          Status: statusLabel,
          Catatan: inv.notes ?? '',
        });
      }
    }
    const stamp = new Date().toISOString().slice(0, 10);
    exportToExcel(rows, `invoice-penjualan-${stamp}`);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoice Penjualan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola faktur penjualan dan piutang pelanggan.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            title="Ekspor daftar invoice (sesuai filter) ke Excel"
          >
            <Download size={15} /> Ekspor Excel
          </button>
          <button className="btn-secondary" onClick={() => setReturnModalOpen(true)} title="Buat retur penjualan dari invoice">
            <Undo2 size={15} /> Retur
          </button>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> Buat Invoice Baru
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Receipt size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Invoice</p>
              <p className="text-lg font-bold text-gray-900">{summary.total}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <DollarSign size={16} className="text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Piutang</p>
              <p className="text-lg font-bold text-red-600 font-mono tabular-nums">{formatRupiah(summary.outstanding)}</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <CheckCircle2 size={16} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sudah Lunas</p>
              <p className="text-lg font-bold text-green-600">{summary.paid} invoice</p>
            </div>
          </div>
        </div>
        <div className="card px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Jatuh Tempo</p>
              <p className="text-lg font-bold text-orange-500">{summary.overdue} invoice</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap filter-bar">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nomor invoice atau pelanggan..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className="text-xs">Dari</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg py-2 px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-xs">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg py-2 px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
       <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">Nomor Invoice</th>
              <th scope="col">Pelanggan</th>
              <th scope="col">Jatuh Tempo</th>
              <th scope="col" className="text-center">Items</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col" className="text-right">Sisa Tagihan</th>
              <th scope="col" className="text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableRowSkeleton columns={8} rows={6} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {raw?.length === 0 ? 'Belum ada invoice penjualan.' : 'Tidak ada invoice sesuai filter.'}
                  </p>
                  {raw?.length === 0 && (
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Buat invoice pertama
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((invoice: any) => (
                <tr
                  key={invoice.id}
                  onClick={() => setSelectedId(invoice.id)}
                  className="cursor-pointer"
                >
                  <td className="text-gray-500 whitespace-nowrap">{formatDate(invoice.date)}</td>
                  <td className="whitespace-nowrap">
                    <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{invoice.invoiceNumber}</span>
                  </td>
                  <td>
                    <p className="font-medium text-gray-800">{invoice.customer?.name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{invoice.customer?.phone || ''}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    {invoice.dueDate ? (
                      <span className={cn('text-sm', isOverdue(invoice) ? 'text-red-500 font-medium' : 'text-gray-500')}>
                        {formatDate(invoice.dueDate)}
                        {isOverdue(invoice) && <AlertTriangle size={11} className="inline ml-1 -mt-0.5" />}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    <span className="badge badge-gray text-xs">{invoice.items?.length ?? 0} item</span>
                  </td>
                  <td className="text-right font-mono font-medium text-gray-900 tabular-nums">
                    {formatRupiah(Number(invoice.grandTotal))}
                    {Number(invoice.deductionTotal ?? 0) > 0 && (
                      <div className="text-[11px] font-normal text-amber-600 mt-0.5" title={`Potongan dari pembayaran (komisi/diskon): ${formatRupiah(Number(invoice.deductionTotal))}\nNet: ${formatRupiah(Number(invoice.grandTotal) - Number(invoice.deductionTotal))}`}>
                        −{formatRupiah(Number(invoice.deductionTotal))} pot. → net {formatRupiah(Number(invoice.grandTotal) - Number(invoice.deductionTotal))}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    <span className={cn('font-mono font-medium tabular-nums', Number(invoice.outstanding) > 0 ? 'text-red-500' : 'text-green-600')}>
                      {formatRupiah(Number(invoice.outstanding))}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={cn(
                      'badge',
                      invoice.status === 'Paid' ? 'badge-green' :
                      invoice.status === 'Draft' ? 'badge-gray' :
                      invoice.status === 'PartiallyPaid' ? 'badge-yellow' : 'badge-blue'
                    )}>
                      {invoice.status === 'PartiallyPaid' ? 'Sebagian' : invoice.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
       </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} invoice
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-500 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-500"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <SalesInvoiceModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setPrefillFromDO(null); }}
        prefillFromDO={prefillFromDO}
      />

      <SalesReturnModal
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
      />

      <InvoiceDetailDrawer
        type="sales"
        invoiceId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
};

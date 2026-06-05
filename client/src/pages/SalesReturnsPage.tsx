import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Undo2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cap } from '../lib/permissions';
import { formatRupiah, formatDate } from '../lib/formatters';
import SalesReturnModal from '../components/SalesReturnModal';
import TableRowSkeleton from '../components/TableRowSkeleton';

const STATUS_BADGE: Record<string, string> = {
  Submitted: 'badge-blue',
  Cancelled: 'badge-gray',
};

export default function SalesReturnsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const isAdmin = cap('approval.decide');

  const { data, isLoading } = useQuery({
    queryKey: ['sales-returns'],
    queryFn: async () => {
      const r = await api.get('/sales-returns?limit=100');
      return (r.data?.data ?? []) as any[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/sales-returns/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success('Retur dibatalkan.');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Gagal membatalkan retur.'),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Undo2 className="w-6 h-6" /> Retur Penjualan
          </h1>
          <p className="text-sm text-muted-foreground">Kembalikan barang/nilai dari invoice penjualan (kredit nota).</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
          <Plus className="w-4 h-4" /> Retur Baru
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">No. Retur</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Pelanggan</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2 text-right">Total Retur</th>
              <th className="px-3 py-2 text-right">Kurangi Piutang</th>
              <th className="px-3 py-2 text-right">Kredit</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <TableRowSkeleton rows={5} columns={9} />}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Belum ada retur penjualan.</td></tr>
            )}
            {(data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{r.returnNumber}</td>
                <td className="px-3 py-2">{formatDate(r.date)}</td>
                <td className="px-3 py-2">{r.customer?.name}</td>
                <td className="px-3 py-2">{r.salesInvoice?.invoiceNumber}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(r.totalReturn))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(r.arReducedAmount))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(Number(r.creditCreatedAmount))}</td>
                <td className="px-3 py-2 text-center"><span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-right">
                  {isAdmin && r.status === 'Submitted' && (
                    <button
                      onClick={() => { if (confirm(`Batalkan retur ${r.returnNumber}? Stok & jurnal akan dibalik.`)) cancelMutation.mutate(r.id); }}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                    >
                      <Ban className="w-3.5 h-3.5" /> Batalkan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SalesReturnModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Send, CheckCircle2, XCircle, FileCheck2, Download, Edit3, Trash2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { PDFDownloadLink } from '@react-pdf/renderer';
import QuotationPDF from '../lib/pdf/QuotationPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft', Sent: 'Terkirim', Accepted: 'Diterima',
  Rejected: 'Ditolak', Expired: 'Kadaluarsa', Cancelled: 'Dibatalkan',
};
const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-gray', Sent: 'badge-blue', Accepted: 'badge-green',
  Rejected: 'badge-red', Expired: 'badge-yellow', Cancelled: 'badge-gray',
};

interface Props {
  quotationId: string | null;
  onClose: () => void;
  onEdit?: (q: any) => void;
}

const QuotationDetailDrawer: React.FC<Props> = ({ quotationId, onClose, onEdit }) => {
  const isOpen = quotationId !== null;
  useBodyScrollLock(isOpen);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const company = useCompanyPDF();

  const [confirmAction, setConfirmAction] = useState<null | 'send' | 'accept' | 'cancel' | 'delete'>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const { data: q, isLoading } = useQuery({
    queryKey: ['quotation', quotationId],
    queryFn: async () => {
      const res = await api.get(`/quotations/${quotationId}`);
      return res.data;
    },
    enabled: isOpen,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    queryClient.invalidateQueries({ queryKey: ['quotation', quotationId] });
  };

  const sendMut = useMutation({
    mutationFn: () => api.patch(`/quotations/${quotationId}/send`),
    onSuccess: () => { toast.success('Penawaran berhasil dikirim.'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal mengirim.'),
  });
  const acceptMut = useMutation({
    mutationFn: () => api.patch(`/quotations/${quotationId}/accept`),
    onSuccess: () => { toast.success('Penawaran ditandai diterima.'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal accept.'),
  });
  const rejectMut = useMutation({
    mutationFn: (reason: string) => api.patch(`/quotations/${quotationId}/reject`, { reason }),
    onSuccess: () => { toast.success('Penawaran ditandai ditolak.'); invalidate(); setRejectOpen(false); setRejectReason(''); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal reject.'),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.patch(`/quotations/${quotationId}/cancel`),
    onSuccess: () => { toast.success('Penawaran dibatalkan.'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal cancel.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/quotations/${quotationId}`),
    onSuccess: () => { toast.success('Penawaran dihapus.'); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal hapus.'),
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      // Fetch prefill payload from server
      const payloadRes = await api.get(`/quotations/${quotationId}/convert-payload`);
      const p = payloadRes.data;
      // Create sales invoice via existing endpoint (which posts GL)
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const invRes = await api.post('/sales/invoices', {
        date: new Date().toISOString().split('T')[0],
        dueDate,
        partyId: p.partyId,
        items: p.items.map((it: any) => ({
          itemType: it.itemType,
          inventoryItemId: it.inventoryItemId,
          serviceItemId: it.serviceItemId,
          accountId: it.accountId,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          rate: it.rate,
          discount: it.discount,
          taxPct: it.taxPct,
          pphPct: it.pphPct,
          description: it.description,
        })),
        potongan: p.potongan,
        biayaLain: p.biayaLain,
        labelPotongan: p.labelPotongan,
        labelBiaya: p.labelBiaya,
        terms: p.terms,
        notes: p.notes ? `${p.notes}\n\n[Konversi dari ${p.quotationNumber}]` : `[Konversi dari ${p.quotationNumber}]`,
        allowNegativeStock: false,
      });
      const invoice = invRes.data;
      // Link back to quotation
      await api.post(`/quotations/${quotationId}/link`, { salesInvoiceId: invoice.id });
      return invoice;
    },
    onSuccess: (invoice) => {
      toast.success(`Sales Invoice ${invoice.invoiceNumber} berhasil dibuat.`);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      onClose();
      navigate('/sales');
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal konversi.'),
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] bg-card border-l border-border shadow-2xl flex flex-col"
        style={{ animation: 'slide-in-right 0.2s ease-out' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Detail Penawaran</h3>
            {q && <p className="text-xs text-muted-foreground font-mono mt-0.5">{q.quotationNumber}</p>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading || !q ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {/* Status & key info */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Status</span>
                  <span className={`badge ${STATUS_BADGE[q.status] ?? 'badge-gray'}`}>{STATUS_LABEL[q.status] ?? q.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span className="font-medium text-foreground">{formatDate(q.date)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Berlaku Sampai</span>
                  <span className="font-medium text-foreground">{formatDate(q.validUntil)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Pelanggan</span>
                  <span className="font-medium text-foreground">{q.customer?.name}</span>
                </div>
                {q.salesInvoice && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">Sales Invoice</span>
                    <span className="font-mono text-green-600">{q.salesInvoice.invoiceNumber}</span>
                  </div>
                )}
                {q.rejectReason && (
                  <div className="text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">Alasan ditolak: </span>
                    <span className="text-red-600 italic">{q.rejectReason}</span>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Item</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5">Item</th>
                        <th className="text-right py-1.5">Qty</th>
                        <th className="text-right py-1.5">Harga</th>
                        <th className="text-right py-1.5">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.items ?? []).map((it: any) => (
                        <tr key={it.id} className="border-b border-border/50">
                          <td className="py-1.5">
                            <p className="font-medium text-foreground">{it.itemName}</p>
                            {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                          </td>
                          <td className="text-right font-mono tabular-nums">{Number(it.quantity)} {it.unit}</td>
                          <td className="text-right font-mono tabular-nums">{formatRupiah(Number(it.rate))}</td>
                          <td className="text-right font-mono tabular-nums font-semibold">{formatRupiah(Number(it.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono tabular-nums">{formatRupiah(Number(q.subtotal))}</span></div>
                {Number(q.potongan) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{q.labelPotongan ?? 'Potongan'}</span>
                    <span className="font-mono tabular-nums">−{formatRupiah(Number(q.potongan))}</span></div>
                )}
                {Number(q.biayaLain) !== 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{q.labelBiaya ?? 'Biaya Lain'}</span>
                    <span className="font-mono tabular-nums">{formatRupiah(Number(q.biayaLain))}</span></div>
                )}
                <div className="flex justify-between font-bold border-t border-border pt-1">
                  <span>Grand Total</span>
                  <span className="text-blue-600 font-mono tabular-nums">{formatRupiah(Number(q.grandTotal))}</span>
                </div>
              </div>

              {/* Notes & terms */}
              {(q.notes || q.terms) && (
                <div className="space-y-2 text-xs">
                  {q.notes && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Catatan</p>
                      <p className="text-muted-foreground whitespace-pre-line">{q.notes}</p>
                    </div>
                  )}
                  {q.terms && (
                    <div>
                      <p className="font-semibold text-foreground mb-1">Syarat &amp; Ketentuan</p>
                      <p className="text-muted-foreground whitespace-pre-line">{q.terms}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Action footer */}
        {q && (
          <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-2">
            {/* PDF download — always available */}
            <PDFDownloadLink
              document={<QuotationPDF quotation={q} company={company} />}
              fileName={`${q.quotationNumber}.pdf`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              {({ loading }) => (
                <>
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  PDF
                </>
              )}
            </PDFDownloadLink>

            {q.status === 'Draft' && (
              <>
                <button
                  onClick={() => onEdit?.(q)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors"
                >
                  <Edit3 size={12} /> Edit
                </button>
                <button
                  onClick={() => setConfirmAction('send')}
                  disabled={sendMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Send size={12} /> Kirim
                </button>
                <button
                  onClick={() => setConfirmAction('delete')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto"
                >
                  <Trash2 size={12} /> Hapus
                </button>
              </>
            )}

            {q.status === 'Sent' && (
              <>
                <button
                  onClick={() => setConfirmAction('accept')}
                  disabled={acceptMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  <CheckCircle2 size={12} /> Diterima
                </button>
                <button
                  onClick={() => setRejectOpen(true)}
                  disabled={rejectMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  <XCircle size={12} /> Tolak
                </button>
              </>
            )}

            {q.status === 'Accepted' && !q.salesInvoice && (
              <button
                onClick={() => convertMut.mutate()}
                disabled={convertMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
              >
                {convertMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileCheck2 size={12} />}
                Konversi ke Sales Invoice
              </button>
            )}

            {(q.status === 'Sent' || q.status === 'Accepted' || q.status === 'Rejected' || q.status === 'Expired') && !q.convertedAt && (
              <button
                onClick={() => setConfirmAction('cancel')}
                disabled={cancelMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors ml-auto"
              >
                <Ban size={12} /> Cancel
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === 'send'}
        title="Kirim Penawaran"
        message={`Kirim penawaran ${q?.quotationNumber} ke pelanggan? Setelah dikirim, penawaran tidak bisa diedit.`}
        confirmLabel="Ya, Kirim"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); sendMut.mutate(); }}
      />
      <ConfirmDialog
        open={confirmAction === 'accept'}
        title="Tandai Diterima"
        message="Tandai penawaran ini diterima oleh pelanggan?"
        confirmLabel="Ya, Diterima"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); acceptMut.mutate(); }}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        title="Batalkan Penawaran"
        message="Batalkan penawaran ini? Status akan jadi Cancelled dan tidak bisa di-aktifkan kembali."
        confirmLabel="Ya, Batalkan"
        variant="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); cancelMut.mutate(); }}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Hapus Penawaran"
        message="Hapus penawaran Draft ini secara permanen?"
        confirmLabel="Ya, Hapus"
        variant="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); deleteMut.mutate(); }}
      />

      {rejectOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl shadow-xl w-full max-w-sm p-5"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <h2 className="text-base font-semibold text-foreground mb-2">Tolak Penawaran</h2>
            <p className="text-xs text-muted-foreground mb-3">Berikan alasan singkat (minimal 5 karakter).</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-red-500 mb-3"
              placeholder="Mis: Pelanggan minta harga lebih rendah, beralih ke kompetitor..."
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg">Batal</button>
              <button
                onClick={() => rejectMut.mutate(rejectReason)}
                disabled={rejectReason.length < 5 || rejectMut.isPending}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {rejectMut.isPending ? 'Memproses...' : 'Tolak Penawaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QuotationDetailDrawer;

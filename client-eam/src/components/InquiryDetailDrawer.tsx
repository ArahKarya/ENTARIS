import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, Edit3, Trash2, CheckCircle2, XCircle, FileSignature, Play, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const STATUS_BADGE: Record<string, string> = {
  Baru: 'badge-blue', Diproses: 'badge-yellow', Dikonversi: 'badge-green', Hilang: 'badge-red', Ditutup: 'badge-gray',
};

interface Props {
  inquiryId: string | null;
  onClose: () => void;
  onEdit?: (q: any) => void;
}

const InquiryDetailDrawer: React.FC<Props> = ({ inquiryId, onClose, onEdit }) => {
  const isOpen = inquiryId !== null;
  useBodyScrollLock(isOpen);

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [confirmAction, setConfirmAction] = useState<null | 'delete' | 'process' | 'close'>(null);
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState('');

  const { data: q, isLoading } = useQuery({
    queryKey: ['inquiry', inquiryId],
    queryFn: async () => {
      const res = await api.get(`/inquiries/${inquiryId}`);
      return res.data;
    },
    enabled: isOpen,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    queryClient.invalidateQueries({ queryKey: ['inquiry', inquiryId] });
  };

  const statusMut = useMutation({
    mutationFn: (data: { status: string; lossReason?: string }) =>
      api.patch(`/inquiries/${inquiryId}/status`, data),
    onSuccess: () => { toast.success('Status diperbarui.'); invalidate(); setLossOpen(false); setLossReason(''); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal ubah status.'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/inquiries/${inquiryId}`),
    onSuccess: () => { toast.success('Inquiry dihapus.'); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal hapus.'),
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/inquiries/${inquiryId}/convert-payload`);
      return res.data;
    },
    onSuccess: (payload) => {
      // Cache the payload for the Quotations page to pick up
      sessionStorage.setItem('inquiry-convert-prefill', JSON.stringify(payload));
      navigate('/quotations?from-inquiry=' + payload.inquiryId);
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal menyiapkan konversi.'),
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] bg-card border-l border-border shadow-2xl flex flex-col"
        style={{ animation: 'slide-in-right 0.2s ease-out' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Detail Inquiry</h3>
            {q && <p className="text-xs text-muted-foreground font-mono mt-0.5">{q.inquiryNumber}</p>}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded" aria-label="Tutup"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading || !q ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {/* Header info */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Status</span>
                  <span className={`badge ${STATUS_BADGE[q.status] ?? 'badge-gray'}`}>{q.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span className="font-medium text-foreground">{formatDate(q.date)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Channel</span>
                  <span className="font-medium text-foreground">{q.channel}</span>
                </div>
                {q.followUpDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tindak Lanjut</span>
                    <span className="font-medium text-amber-600">{formatDate(q.followUpDate)}</span>
                  </div>
                )}
                {q.quotation && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">Penawaran</span>
                    <button onClick={() => { navigate('/quotations'); onClose(); }}
                      className="font-mono text-green-600 inline-flex items-center gap-1 hover:underline">
                      {q.quotation.quotationNumber} <ExternalLink size={10} />
                    </button>
                  </div>
                )}
                {q.lossReason && (
                  <div className="text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">Alasan hilang: </span>
                    <span className="text-red-600 italic">{q.lossReason}</span>
                  </div>
                )}
              </div>

              {/* Customer info */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Prospek / Customer</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{q.party?.name ?? q.prospectName}</span>
                    {!q.partyId && <span className="text-[10px] uppercase tracking-wider text-amber-600 px-1.5 py-0.5 bg-amber-50 rounded">prospect</span>}
                  </div>
                  {q.prospectPhone && <p className="text-xs text-muted-foreground">📞 {q.prospectPhone}</p>}
                  {q.prospectEmail && <p className="text-xs text-muted-foreground">✉️ {q.prospectEmail}</p>}
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">Permintaan</h4>
                {q.itemsMode === 'structured' && Array.isArray(q.items) && q.items.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5">Item</th>
                        <th className="text-right py-1.5">Qty</th>
                        <th className="text-right py-1.5">Est. Harga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.items.map((it: any) => (
                        <tr key={it.id} className="border-b border-border/50">
                          <td className="py-1.5">
                            <p className="text-foreground">{it.itemName}</p>
                            {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                          </td>
                          <td className="text-right font-mono tabular-nums">
                            {it.quantity != null ? `${Number(it.quantity)} ${it.unit ?? ''}` : '—'}
                          </td>
                          <td className="text-right font-mono tabular-nums">
                            {it.estimatedPrice != null ? formatRupiah(Number(it.estimatedPrice)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-line bg-muted/40 rounded p-3">
                    {q.itemsText || <span className="text-muted-foreground italic">Tidak ada permintaan terstruktur.</span>}
                  </p>
                )}
              </div>

              {q.notes && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-1">Catatan</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{q.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action footer */}
        {q && (
          <div className="border-t border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-2">
            {/* Convert to Penawaran — gating: Baru atau Diproses */}
            {(q.status === 'Baru' || q.status === 'Diproses') && (
              <button onClick={() => convertMut.mutate()} disabled={convertMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                {convertMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />}
                Buat Penawaran
              </button>
            )}

            {q.status === 'Baru' && (
              <button onClick={() => setConfirmAction('process')} disabled={statusMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors">
                <Play size={12} /> Diproses
              </button>
            )}

            {(q.status === 'Baru' || q.status === 'Diproses') && (
              <>
                <button onClick={() => setLossOpen(true)} disabled={statusMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                  <XCircle size={12} /> Tandai Hilang
                </button>
                <button onClick={() => setConfirmAction('close')} disabled={statusMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg transition-colors">
                  <CheckCircle2 size={12} /> Tutup
                </button>
              </>
            )}

            {q.status !== 'Dikonversi' && (
              <>
                <button onClick={() => onEdit?.(q)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors">
                  <Edit3 size={12} /> Edit
                </button>
                <button onClick={() => setConfirmAction('delete')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors ml-auto">
                  <Trash2 size={12} /> Hapus
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === 'process'}
        title="Tandai Diproses"
        message="Tandai inquiry ini sedang diproses?"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); statusMut.mutate({ status: 'Diproses' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'close'}
        title="Tutup Inquiry"
        message="Tutup inquiry ini? Tidak akan ditindaklanjuti lagi."
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); statusMut.mutate({ status: 'Ditutup' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Hapus Inquiry"
        message="Hapus inquiry ini secara permanen?"
        confirmLabel="Ya, Hapus"
        variant="danger"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { setConfirmAction(null); deleteMut.mutate(); }}
      />

      {lossOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl shadow-xl w-full max-w-sm p-5"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <h2 className="text-base font-semibold text-foreground mb-2">Tandai Hilang</h2>
            <p className="text-xs text-muted-foreground mb-3">Berikan alasan singkat (minimal 5 karakter).</p>
            <textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} rows={3}
              placeholder="Mis: Pelanggan beralih ke kompetitor, harga di luar budget..."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-red-500 mb-3" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setLossOpen(false); setLossReason(''); }}
                className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted hover:bg-accent rounded-lg">Batal</button>
              <button onClick={() => statusMut.mutate({ status: 'Hilang', lossReason })}
                disabled={lossReason.length < 5 || statusMut.isPending}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
                {statusMut.isPending ? 'Memproses...' : 'Tandai Hilang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InquiryDetailDrawer;

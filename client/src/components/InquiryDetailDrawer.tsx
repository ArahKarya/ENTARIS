import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Edit3, Trash2, CheckCircle2, XCircle, FileSignature, Play, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, Field, LoadingState, StatusBadge } from '@/components/shared';
import { OverlayBody, OverlayFooter, OverlayHeader, ScrollRegion } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

interface Props {
  inquiryId: string | null;
  onClose: () => void;
  onEdit?: (q: any) => void;
}

const InquiryDetailDrawer: React.FC<Props> = ({ inquiryId, onClose, onEdit }) => {
  const isOpen = inquiryId !== null;

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

  const busy = statusMut.isPending || deleteMut.isPending || convertMut.isPending;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && !busy && onClose()}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>Detail Inquiry</SheetTitle>
            <SheetDescription className={q ? 'font-mono text-xs' : 'sr-only'}>
              {q ? q.inquiryNumber : 'Memuat detail inquiry'}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="grid content-start gap-4">
            {isLoading || !q ? (
              <LoadingState label="Memuat inquiry…" />
            ) : (
              <>
                <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold uppercase text-muted-foreground">Status</dt>
                    <dd><StatusBadge status={q.status} /></dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Tanggal</dt>
                    <dd className="font-medium text-foreground">{formatDate(q.date)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Channel</dt>
                    <dd className="font-medium text-foreground">{q.channel}</dd>
                  </div>
                  {q.followUpDate && (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Tindak Lanjut</dt>
                      <dd className="font-medium text-warning-text">{formatDate(q.followUpDate)}</dd>
                    </div>
                  )}
                  {q.quotation && (
                    <div className="flex items-center justify-between border-t border-border pt-1">
                      <dt className="text-muted-foreground">Penawaran</dt>
                      <dd>
                        <Button variant="link" size="sm" className="h-auto min-h-8 font-mono text-xs"
                          onClick={() => { navigate('/quotations'); onClose(); }}>
                          {q.quotation.quotationNumber} <ExternalLink className="size-3" aria-hidden />
                        </Button>
                      </dd>
                    </div>
                  )}
                  {q.lossReason && (
                    <div className="border-t border-border pt-1">
                      <dt className="inline text-muted-foreground">Alasan hilang: </dt>
                      <dd className="inline italic text-danger-text">{q.lossReason}</dd>
                    </div>
                  )}
                </dl>

                <section aria-labelledby="inq-party">
                  <h4 id="inq-party" className="mb-2 text-sm font-semibold text-foreground">Prospek / Customer</h4>
                  <div className="grid gap-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{q.party?.name ?? q.prospectName}</span>
                      {!q.partyId && (
                        <span className="rounded-sm bg-warning-subtle px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-warning-text">prospect</span>
                      )}
                    </div>
                    {q.prospectPhone && <p className="text-xs text-muted-foreground"><span className="sr-only">Telepon: </span>{q.prospectPhone}</p>}
                    {q.prospectEmail && <p className="text-xs text-muted-foreground"><span className="sr-only">Email: </span>{q.prospectEmail}</p>}
                  </div>
                </section>

                <section aria-labelledby="inq-items">
                  <h4 id="inq-items" className="mb-2 text-sm font-semibold text-foreground">Permintaan</h4>
                  {q.itemsMode === 'structured' && Array.isArray(q.items) && q.items.length > 0 ? (
                    <ScrollRegion label="Daftar item permintaan">
                      <table className="w-full min-w-[320px] text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th scope="col" className="py-1.5 text-left">Item</th>
                            <th scope="col" className="py-1.5 text-right">Qty</th>
                            <th scope="col" className="py-1.5 text-right">Est. Harga</th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.items.map((it: any) => (
                            <tr key={it.id} className="border-b border-border/50">
                              <td className="py-1.5">
                                <p className="text-foreground">{it.itemName}</p>
                                {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                              </td>
                              <td className="text-right tabular-nums">
                                {it.quantity != null ? `${Number(it.quantity)} ${it.unit ?? ''}` : '—'}
                              </td>
                              <td className="text-right tabular-nums">
                                {it.estimatedPrice != null ? formatRupiah(Number(it.estimatedPrice)) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollRegion>
                  ) : (
                    <p className="whitespace-pre-line rounded-md bg-muted/40 p-3 text-sm text-foreground">
                      {q.itemsText || <span className="italic text-muted-foreground">Tidak ada permintaan terstruktur.</span>}
                    </p>
                  )}
                </section>

                {q.notes && (
                  <section aria-labelledby="inq-notes">
                    <h4 id="inq-notes" className="mb-1 text-sm font-semibold text-foreground">Catatan</h4>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{q.notes}</p>
                  </section>
                )}
              </>
            )}
          </SheetBody>

          {q && (
            <SheetFooter className="flex-wrap sm:justify-start [&>button]:min-h-11 sm:[&>button]:min-h-0">
              {q.status !== 'Dikonversi' && (
                <Button variant="danger" size="sm" onClick={() => setConfirmAction('delete')} className="sm:order-last sm:ml-auto">
                  <Trash2 aria-hidden /> Hapus
                </Button>
              )}
              {q.status !== 'Dikonversi' && (
                <Button variant="outline" size="sm" onClick={() => onEdit?.(q)}>
                  <Edit3 aria-hidden /> Edit
                </Button>
              )}
              {(q.status === 'Baru' || q.status === 'Diproses') && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction('close')} disabled={statusMut.isPending}>
                    <CheckCircle2 aria-hidden /> Tutup
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLossOpen(true)} disabled={statusMut.isPending}>
                    <XCircle aria-hidden /> Tandai Hilang
                  </Button>
                </>
              )}
              {q.status === 'Baru' && (
                <Button variant="outline" size="sm" onClick={() => setConfirmAction('process')} disabled={statusMut.isPending}>
                  <Play aria-hidden /> Diproses
                </Button>
              )}
              {(q.status === 'Baru' || q.status === 'Diproses') && (
                <Button size="sm" onClick={() => convertMut.mutate()} loading={convertMut.isPending}>
                  {!convertMut.isPending && <FileSignature aria-hidden />} Buat Penawaran
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmAction === 'process'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Tandai Diproses"
        description="Tandai inquiry ini sedang diproses?"
        onConfirm={() => { statusMut.mutate({ status: 'Diproses' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'close'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Tutup Inquiry"
        description="Tutup inquiry ini? Tidak akan ditindaklanjuti lagi."
        onConfirm={() => { statusMut.mutate({ status: 'Ditutup' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Hapus Inquiry"
        description="Hapus inquiry ini secara permanen?"
        confirmLabel="Ya, Hapus"
        tone="danger"
        onConfirm={() => { deleteMut.mutate(); }}
      />

      <Dialog open={lossOpen} onOpenChange={(open) => { if (!open && !statusMut.isPending) { setLossOpen(false); setLossReason(''); } }}>
        <DialogContent size="sm" className={dialogShellClass}>
          <form noValidate className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); if (lossReason.length >= 5 && !statusMut.isPending) statusMut.mutate({ status: 'Hilang', lossReason }); }}>
            <OverlayHeader>
              <DialogTitle>Tandai Hilang</DialogTitle>
              <DialogDescription>Berikan alasan singkat (minimal 5 karakter).</DialogDescription>
            </OverlayHeader>
            <OverlayBody>
              <Field label="Alasan hilang" required>
                <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} rows={3}
                  placeholder="Mis: Pelanggan beralih ke kompetitor, harga di luar budget..." />
              </Field>
            </OverlayBody>
            <OverlayFooter>
              <Button type="button" variant="ghost" disabled={statusMut.isPending}
                onClick={() => { setLossOpen(false); setLossReason(''); }}>Batal</Button>
              <Button type="submit" variant="danger" disabled={lossReason.length < 5} loading={statusMut.isPending}>
                {statusMut.isPending ? 'Memproses…' : 'Tandai Hilang'}
              </Button>
            </OverlayFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InquiryDetailDrawer;

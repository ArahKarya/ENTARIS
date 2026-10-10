import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Send, CheckCircle2, XCircle, FileCheck2, Download, Edit3, Trash2, Ban, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { PDFDownloadLink } from '@react-pdf/renderer';
import QuotationPDF from '../lib/pdf/QuotationPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import { canCreateSalesOrderFromQuotation } from './sales/so-from-quotation';

interface Props {
  quotationId: string | null;
  onClose: () => void;
  onEdit?: (q: any) => void;
}

const QuotationDetailDrawer: React.FC<Props> = ({ quotationId, onClose, onEdit }) => {
  const isOpen = quotationId !== null;

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const company = useCompanyPDF();

  const [confirmAction, setConfirmAction] = useState<null | 'send' | 'accept' | 'cancel' | 'delete'>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

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
    onSuccess: () => { toast.success('Penawaran dikirim.'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal mengirim.'),
  });
  const acceptMut = useMutation({
    mutationFn: () => api.patch(`/quotations/${quotationId}/accept`),
    onSuccess: () => { toast.success('Penawaran ditandai diterima.'); invalidate(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal accept.'),
  });
  const rejectMut = useMutation({
    mutationFn: (reason: string) => api.patch(`/quotations/${quotationId}/reject`, { reason }),
    onSuccess: () => { toast.success('Penawaran ditandai ditolak.'); invalidate(); setRejectOpen(false); },
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
      toast.success(`Sales Invoice ${invoice.invoiceNumber} dibuat.`);
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

  // An SO already made from it means billing goes through the SO, not a direct invoice.
  const canConvert = q && q.status === 'Accepted' && !q.salesInvoice && !(q.salesOrders ?? []).length;
  const canCreateSo = canCreateSalesOrderFromQuotation(q);
  const canCancel = q && ['Sent', 'Accepted', 'Rejected', 'Expired'].includes(q.status) && !q.convertedAt;
  const footBtn = 'max-sm:h-11';

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>Detail Penawaran</SheetTitle>
            <SheetDescription className="font-mono">{q ? q.quotationNumber : 'Memuat…'}</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-4">
            {isLoading || !q ? (
              <LoadingState label="Memuat penawaran…" />
            ) : (
              <>
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Status</span>
                    <StatusBadge status={q.status} docType="quotation" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tanggal</span>
                    <span className="font-medium text-foreground">{formatDate(q.date)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Berlaku Sampai</span>
                    <span className="font-medium text-foreground">{formatDate(q.validUntil)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">Pelanggan</span>
                    <span className="font-medium text-foreground">{q.customer?.name}</span>
                  </div>
                  {q.salesInvoice && (
                    <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">Sales Invoice</span>
                      <span className="font-mono text-success-text">{q.salesInvoice.invoiceNumber}</span>
                    </div>
                  )}
                  {(q.salesOrders ?? []).length > 0 && (
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">Sales Order</span>
                      <span className="font-mono text-success-text">
                        {q.salesOrders.map((so: { soNumber: string }) => so.soNumber).join(', ')}
                      </span>
                    </div>
                  )}
                  {q.rejectReason && (
                    <div className="border-t border-border pt-1 text-xs">
                      <span className="text-muted-foreground">Alasan ditolak: </span>
                      <span className="italic text-danger-text">{q.rejectReason}</span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-foreground">Item</h4>
                  <TableRegion label="Item penawaran">
                    <table className="w-full min-w-[420px] text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th scope="col" className="px-2 py-1.5 text-left">Item</th>
                          <th scope="col" className="px-2 py-1.5 text-right">Qty</th>
                          <th scope="col" className="px-2 py-1.5 text-right">Harga</th>
                          <th scope="col" className="px-2 py-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(q.items ?? []).map((it: any) => (
                          <tr key={it.id} className="border-b border-border/50">
                            <td className="px-2 py-1.5">
                              <p className="font-medium text-foreground">{it.itemName}</p>
                              {it.description && <p className="text-[11px] text-muted-foreground">{it.description}</p>}
                            </td>
                            <td className="px-2 text-right tabular-nums">{Number(it.quantity)} {it.unit}</td>
                            <td className="px-2 text-right tabular-nums">{formatRupiah(Number(it.rate))}</td>
                            <td className="px-2 text-right font-semibold tabular-nums">{formatRupiah(Number(it.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableRegion>
                </div>

                <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{formatRupiah(Number(q.subtotal))}</span></div>
                  {Number(q.potongan) > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{q.labelPotongan ?? 'Potongan'}</span>
                      <span className="tabular-nums">−{formatRupiah(Number(q.potongan))}</span></div>
                  )}
                  {Number(q.biayaLain) !== 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{q.labelBiaya ?? 'Biaya Lain'}</span>
                      <span className="tabular-nums">{formatRupiah(Number(q.biayaLain))}</span></div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1 font-bold">
                    <span>Grand Total</span>
                    <span className="tabular-nums text-primary">{formatRupiah(Number(q.grandTotal))}</span>
                  </div>
                </div>

                {(q.notes || q.terms) && (
                  <div className="space-y-2 text-xs">
                    {q.notes && (
                      <div>
                        <p className="mb-1 font-semibold text-foreground">Catatan</p>
                        <p className="whitespace-pre-line text-muted-foreground">{q.notes}</p>
                      </div>
                    )}
                    {q.terms && (
                      <div>
                        <p className="mb-1 font-semibold text-foreground">Syarat &amp; Ketentuan</p>
                        <p className="whitespace-pre-line text-muted-foreground">{q.terms}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </SheetBody>

          {q && (
            <SheetFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {q.status === 'Draft' && (
                  <Button variant="ghost" className={cn('text-danger-text', footBtn)} onClick={() => setConfirmAction('delete')}>
                    <Trash2 aria-hidden /> Hapus
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" className={cn('text-danger-text', footBtn)} onClick={() => setConfirmAction('cancel')} disabled={cancelMut.isPending}>
                    <Ban aria-hidden /> Batalkan
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap [&>*:only-child]:col-span-2">
                <PDFDownloadLink
                  document={<QuotationPDF quotation={q} company={company} />}
                  fileName={`${q.quotationNumber}.pdf`}
                  className={cn(buttonVariants({ variant: 'outline', size: 'md' }), footBtn)}
                >
                  {({ loading }) => (
                    <>
                      {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                      PDF
                    </>
                  )}
                </PDFDownloadLink>

                {q.status === 'Draft' && (
                  <>
                    <Button variant="outline" className={footBtn} onClick={() => onEdit?.(q)}>
                      <Edit3 aria-hidden /> Edit
                    </Button>
                    <Button className={footBtn} onClick={() => setConfirmAction('send')} disabled={sendMut.isPending}>
                      <Send aria-hidden /> Kirim
                    </Button>
                  </>
                )}

                {q.status === 'Sent' && (
                  <>
                    <Button variant="danger" className={footBtn} onClick={() => setRejectOpen(true)} disabled={rejectMut.isPending}>
                      <XCircle aria-hidden /> Tolak
                    </Button>
                    <Button className={footBtn} onClick={() => setConfirmAction('accept')} disabled={acceptMut.isPending}>
                      <CheckCircle2 aria-hidden /> Diterima
                    </Button>
                  </>
                )}

                {canCreateSo && (
                  <Button
                    variant="outline"
                    className={footBtn}
                    onClick={() => navigate(`/sales-orders?fromQuotation=${encodeURIComponent(q.id)}`)}
                  >
                    <ClipboardList aria-hidden /> Buat Sales Order
                  </Button>
                )}

                {canConvert && (
                  <Button className={footBtn} onClick={() => convertMut.mutate()} loading={convertMut.isPending}>
                    {!convertMut.isPending && <FileCheck2 aria-hidden />}
                    Konversi ke Sales Invoice
                  </Button>
                )}
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmAction === 'send'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Kirim Penawaran"
        description={`Kirim penawaran ${q?.quotationNumber} ke pelanggan? Setelah dikirim, penawaran tidak bisa diedit.`}
        confirmLabel="Ya, Kirim"
        loading={sendMut.isPending}
        onConfirm={() => sendMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'accept'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Tandai Diterima"
        description="Tandai penawaran ini diterima oleh pelanggan?"
        confirmLabel="Ya, Diterima"
        loading={acceptMut.isPending}
        onConfirm={() => acceptMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        tone="danger"
        title="Batalkan Penawaran"
        description="Batalkan penawaran ini? Status akan jadi Cancelled dan tidak bisa di-aktifkan kembali."
        confirmLabel="Ya, Batalkan"
        loading={cancelMut.isPending}
        onConfirm={() => cancelMut.mutateAsync()}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        tone="danger"
        title="Hapus Penawaran"
        description="Hapus penawaran Draft ini secara permanen?"
        confirmLabel="Ya, Hapus"
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutateAsync()}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        tone="danger"
        title="Tolak Penawaran"
        description="Berikan alasan singkat (minimal 5 karakter)."
        confirmLabel="Tolak Penawaran"
        requireReason={{
          label: 'Alasan penolakan',
          minLength: 5,
          placeholder: 'Mis: Pelanggan minta harga lebih rendah, beralih ke kompetitor...',
        }}
        loading={rejectMut.isPending}
        onConfirm={(reason) => rejectMut.mutateAsync(reason ?? '')}
      />
    </>
  );
};

export default QuotationDetailDrawer;

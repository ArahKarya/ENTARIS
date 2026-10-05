import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Truck, User, XCircle, FileDown, Pencil, Link2 } from 'lucide-react';
import api from '../lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, Field, LoadingState, StatusBadge } from '@/components/shared';
import { OverlayBody, OverlayFooter, OverlayHeader, ScrollRegion } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';
import DeliveryOrderPDF from '../lib/pdf/DeliveryOrderPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import TemporaryDeliveryNoteModal from './TemporaryDeliveryNoteModal';
import { can, cap } from '../lib/permissions';

interface Props { noteId: string | null; onClose: () => void }

const SJS_STATUS: Record<string, { label: string }> = {
  Open: { label: 'Terbuka' },
  Linked: { label: 'Tertaut' },
  Cancelled: { label: 'Dibatalkan' },
};

const TemporaryDeliveryNoteDrawer: React.FC<Props> = ({ noteId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDoId, setLinkDoId] = useState('');
  const canCancel = cap('doc.cancel');
  const canEdit = can('delivery_order', 'edit');

  const { data: note, isLoading } = useQuery({
    queryKey: ['temporary-delivery-note-detail', noteId],
    queryFn: async () => (await api.get(`/temporary-delivery-notes/${noteId}`)).data,
    enabled: !!noteId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/temporary-delivery-notes/${noteId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes-summary'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] });
      toast.success('Surat jalan sementara dibatalkan.');
      setConfirmCancel(false);
    },
    onError: (e: any) => { toast.error(e?.response?.data?.error || 'Gagal membatalkan.'); setConfirmCancel(false); },
  });

  // DO resmi aktif (Submitted, belum Cancelled) milik pelanggan yang sama
  const { data: doCandidates } = useQuery({
    queryKey: ['sjs-link-do-candidates', note?.partyId],
    queryFn: async () => {
      const res = await api.get(`/delivery-orders?partyId=${note.partyId}&status=Submitted&limit=100`);
      return (res.data.data ?? []) as any[];
    },
    enabled: linkOpen && !!note?.partyId,
  });

  const linkMutation = useMutation({
    mutationFn: () => api.post(`/temporary-delivery-notes/${noteId}/link`, { deliveryOrderId: linkDoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-notes-summary'] });
      queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] });
      toast.success('Surat jalan sementara ditautkan ke surat jalan resmi.');
      setLinkOpen(false); setLinkDoId('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal menautkan.'),
  });

  const sc = SJS_STATUS[note?.status] ?? SJS_STATUS.Open;
  const scTone = note?.status === 'Linked' ? 'success' : note?.status === 'Cancelled' ? 'danger' : 'warning';
  const isOpen = note?.status === 'Open';
  const open = !!noteId;

  const pdfDoc = note ? (
    <DeliveryOrderPDF
      title="SURAT JALAN SEMENTARA"
      footnote="Dokumen sementara — bukan dokumen resmi penagihan. Akan ditautkan ke surat jalan resmi."
      doNumber={note.number}
      date={note.date}
      status={note.status}
      customer={{ name: note.customerName ?? '—' }}
      nomorMobil={note.nomorMobil}
      driverName={note.driverName}
      recipientName={note.recipientName}
      notes={note.notes}
      items={(note.items ?? []).map((it: any) => ({ code: null, name: it.itemName, qty: Number(it.quantity), unit: it.unit, description: it.description }))}
      company={{ name: company.name, address: company.address, phone: company.phone, email: company.email, taxId: company.taxId, logoUrl: company.logoUrl }}
    />
  ) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && !cancelMutation.isPending && onClose()}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              <Truck className="size-4 text-warning-text" aria-hidden />
              {note?.number ?? 'Surat Jalan Sementara'}
              {note && <StatusBadge status={note.status} label={sc.label} tone={scTone} />}
            </SheetTitle>
            <SheetDescription className="text-xs">Dokumen sementara — tanpa stok, tanpa jurnal</SheetDescription>
          </SheetHeader>

          <SheetBody className="p-0">
            {isLoading ? (
              <div role="status" aria-label="Memuat surat jalan sementara"><LoadingState /></div>
            ) : !note ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Surat jalan sementara tidak ditemukan.</div>
            ) : (
              <>
                <div className="grid gap-6 border-b border-border px-6 py-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><User className="size-3" aria-hidden /> Pelanggan</p>
                    <p className="text-sm font-semibold text-foreground">{note.customerName}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div><dt className="text-xs text-muted-foreground">Tanggal</dt><dd className="text-xs font-medium text-foreground">{formatDate(note.date)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">No. Mobil</dt><dd className="font-mono text-xs font-medium uppercase text-foreground">{note.nomorMobil || '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Supir</dt><dd className="text-xs font-medium text-foreground">{note.driverName || '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Penerima</dt><dd className="text-xs font-medium text-foreground">{note.recipientName || '—'}</dd></div>
                  </dl>
                </div>

                {note.status === 'Linked' && (
                  <div className="flex items-center gap-2 border-b border-border bg-success-subtle px-6 py-3 text-xs text-success-text">
                    <Link2 className="size-3.5" aria-hidden />
                    <span>
                      Sudah ditautkan ke surat jalan resmi <b className="font-mono">{note.doNumber}</b>
                      {note.linkedAt && <span> · {formatDate(note.linkedAt)}</span>}
                    </span>
                  </div>
                )}
                {isOpen && (
                  <div className="border-b border-border bg-warning-subtle px-6 py-3 text-xs text-warning-text">
                    Belum ditautkan. Setelah produksi diinput, buat surat jalan resmi dan pilih surat jalan sementara ini di bagian <b>Tautkan Surat Jalan Sementara</b>.
                  </div>
                )}

                <div className="px-6 py-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Barang</p>
                  <ScrollRegion label="Daftar barang surat jalan sementara">
                    <table className="w-full min-w-[300px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 text-left">Nama</th>
                          <th scope="col" className="text-right">Qty</th>
                          <th scope="col" className="pl-2 text-left">Sat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {note.items.map((it: any) => (
                          <tr key={it.id} className="border-b border-border/50">
                            <td className="py-1.5">{it.itemName}{it.description ? <span className="block text-xs text-muted-foreground">{it.description}</span> : null}</td>
                            <td className="text-right font-medium tabular-nums">{formatNumber(Number(it.quantity), { maxDecimals: 3 })}</td>
                            <td className="pl-2 text-muted-foreground">{it.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                  {note.notes && <p className="mt-3 text-xs text-muted-foreground"><b>Catatan:</b> {note.notes}</p>}
                </div>
              </>
            )}
          </SheetBody>

          {note && (
            <SheetFooter className="flex-wrap sm:justify-start [&>*]:min-h-11 sm:[&>*]:min-h-0">
              {isOpen && canCancel && (
                <Button variant="outline" size="sm" className="text-danger-text sm:order-last sm:ml-auto" onClick={() => setConfirmCancel(true)}>
                  <XCircle aria-hidden /> Batalkan
                </Button>
              )}
              {isOpen && canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil aria-hidden /> Ubah</Button>
              )}
              {isOpen && canEdit && (
                <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}><Link2 aria-hidden /> Tautkan ke DO</Button>
              )}
              {pdfDoc && (
                <PDFDownloadLink document={pdfDoc} fileName={`${note.number}.pdf`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  {({ loading }: { loading: boolean }) => (
                    <>
                      <FileDown aria-hidden /> {loading ? 'Membuat...' : 'Cetak PDF'}
                    </>
                  )}
                </PDFDownloadLink>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={linkOpen && !!note} onOpenChange={(o) => { if (!o && !linkMutation.isPending) { setLinkOpen(false); setLinkDoId(''); } }}>
        <DialogContent size="md" className={dialogShellClass}>
          <form noValidate className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); if (linkDoId && !linkMutation.isPending) linkMutation.mutate(); }}>
            <OverlayHeader>
              <DialogTitle>Tautkan {note?.number} ke surat jalan resmi</DialogTitle>
              <DialogDescription>
                Pilih surat jalan resmi milik <b>{note?.customerName}</b> yang sudah dibuat. Hanya mengubah status SJS, tidak menyentuh stok atau jurnal.
              </DialogDescription>
            </OverlayHeader>
            <OverlayBody>
              <Field label="Surat jalan resmi" required>
                {(control) => (
                  <Select value={linkDoId} onValueChange={setLinkDoId}>
                    <SelectTrigger {...control}><SelectValue placeholder="— pilih surat jalan resmi —" /></SelectTrigger>
                    <SelectContent>
                      {(doCandidates ?? []).map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.doNumber} · {formatDate(d.date)}{d.nomorMobil ? ` · ${String(d.nomorMobil).toUpperCase()}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              {doCandidates && doCandidates.length === 0 && (
                <p className="text-xs text-warning-text">Belum ada surat jalan resmi aktif untuk pelanggan ini.</p>
              )}
            </OverlayBody>
            <OverlayFooter>
              <Button type="button" variant="ghost" disabled={linkMutation.isPending}
                onClick={() => { setLinkOpen(false); setLinkDoId(''); }}>Batal</Button>
              <Button type="submit" disabled={!linkDoId} loading={linkMutation.isPending}>
                {linkMutation.isPending ? 'Menautkan…' : 'Tautkan'}
              </Button>
            </OverlayFooter>
          </form>
        </DialogContent>
      </Dialog>

      {editOpen && note && <TemporaryDeliveryNoteModal editNote={note} onClose={() => { setEditOpen(false); queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] }); }} />}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={(o) => !o && !cancelMutation.isPending && setConfirmCancel(false)}
        title="Batalkan surat jalan sementara?"
        description="Dokumen akan ditandai Dibatalkan. Tidak ada stok atau jurnal yang terpengaruh."
        confirmLabel="Batalkan"
        tone="danger"
        loading={cancelMutation.isPending}
        onConfirm={() => { cancelMutation.mutate(); }}
      />
    </>
  );
};

export default TemporaryDeliveryNoteDrawer;

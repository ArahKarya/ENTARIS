import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
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

/** SJS status → label key under temporaryDeliveryNoteDrawer.status (translated at render). */
const SJS_STATUS_KEY: Record<string, 'open' | 'linked' | 'cancelled'> = {
  Open: 'open',
  Linked: 'linked',
  Cancelled: 'cancelled',
};

const TemporaryDeliveryNoteDrawer: React.FC<Props> = ({ noteId, onClose }) => {
  const { t } = useTranslation('sales');
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
      toast.success(t('temporaryDeliveryNoteDrawer.toast.cancelled'));
      setConfirmCancel(false);
    },
    onError: (e: any) => { toast.error(e?.response?.data?.error || t('temporaryDeliveryNoteDrawer.errors.cancel')); setConfirmCancel(false); },
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
      toast.success(t('temporaryDeliveryNoteDrawer.toast.linked'));
      setLinkOpen(false); setLinkDoId('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t('temporaryDeliveryNoteDrawer.errors.link')),
  });

  const statusLabel = t(`temporaryDeliveryNoteDrawer.status.${SJS_STATUS_KEY[note?.status] ?? 'open'}` as const);
  const scTone = note?.status === 'Linked' ? 'success' : note?.status === 'Cancelled' ? 'danger' : 'warning';
  const isOpen = note?.status === 'Open';
  const open = !!noteId;

  const pdfDoc = note ? (
    <DeliveryOrderPDF
      title={t('temporaryDeliveryNoteDrawer.pdf.title')}
      footnote={t('temporaryDeliveryNoteDrawer.pdf.footnote')}
      doNumber={note.number}
      date={note.date}
      status={note.status}
      customer={{
        name: note.customerName ?? '—',
        address: note.customerAddress ?? null,
        phone: note.customerPhone ?? null,
      }}
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
              {note?.number ?? t('temporaryDeliveryNoteDrawer.docType')}
              {note && <StatusBadge status={note.status} label={statusLabel} tone={scTone} />}
            </SheetTitle>
            <SheetDescription className="text-xs">{t('temporaryDeliveryNoteDrawer.description')}</SheetDescription>
          </SheetHeader>

          <SheetBody className="p-0">
            {isLoading ? (
              <LoadingState label={t('temporaryDeliveryNoteDrawer.loading')} />
            ) : !note ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">{t('temporaryDeliveryNoteDrawer.notFound')}</div>
            ) : (
              <>
                <div className="grid gap-6 border-b border-border px-6 py-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><User className="size-3" aria-hidden /> {t('temporaryDeliveryNoteDrawer.customer')}</p>
                    <p className="text-sm font-semibold text-foreground">{note.customerName}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div><dt className="text-xs text-muted-foreground">{t('temporaryDeliveryNoteDrawer.fields.date')}</dt><dd className="text-xs font-medium text-foreground">{formatDate(note.date)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('temporaryDeliveryNoteDrawer.fields.vehicle')}</dt><dd className="font-mono text-xs font-medium uppercase text-foreground">{note.nomorMobil || '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('temporaryDeliveryNoteDrawer.fields.driver')}</dt><dd className="text-xs font-medium text-foreground">{note.driverName || '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{t('temporaryDeliveryNoteDrawer.fields.recipient')}</dt><dd className="text-xs font-medium text-foreground">{note.recipientName || '—'}</dd></div>
                    {note.soNumber && (
                      <div><dt className="text-xs text-muted-foreground">{t('temporaryDeliveryNoteDrawer.fields.salesOrder')}</dt><dd className="font-mono text-xs font-medium text-foreground">{note.soNumber}</dd></div>
                    )}
                  </dl>
                </div>

                {note.status === 'Linked' && (
                  <div className="flex items-center gap-2 border-b border-border bg-success-subtle px-6 py-3 text-xs text-success-text">
                    <Link2 className="size-3.5" aria-hidden />
                    <span>
                      <Trans t={t} i18nKey="temporaryDeliveryNoteDrawer.linkedTo" values={{ number: note.doNumber }} components={{ b: <b className="font-mono" /> }} />
                      {note.linkedAt && <span> · {formatDate(note.linkedAt)}</span>}
                    </span>
                  </div>
                )}
                {isOpen && (
                  <div className="border-b border-border bg-warning-subtle px-6 py-3 text-xs text-warning-text">
                    <Trans t={t} i18nKey="temporaryDeliveryNoteDrawer.notLinked" components={{ b: <b /> }} />
                  </div>
                )}

                <div className="px-6 py-5">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('temporaryDeliveryNoteDrawer.items.title')}</p>
                  <ScrollRegion label={t('temporaryDeliveryNoteDrawer.items.tableLabel')}>
                    <table className="w-full min-w-[300px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 text-left">{t('temporaryDeliveryNoteDrawer.items.name')}</th>
                          <th scope="col" className="text-right">{t('temporaryDeliveryNoteDrawer.items.qty')}</th>
                          <th scope="col" className="pl-2 text-left">{t('temporaryDeliveryNoteDrawer.items.unit')}</th>
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
                  {note.notes && <p className="mt-3 text-xs text-muted-foreground"><b>{t('temporaryDeliveryNoteDrawer.notesLabel')}</b> {note.notes}</p>}
                </div>
              </>
            )}
          </SheetBody>

          {note && (
            <SheetFooter className="flex-wrap sm:justify-start [&>*]:min-h-11 sm:[&>*]:min-h-0">
              {isOpen && canCancel && (
                <Button variant="outline" size="sm" className="text-danger-text sm:order-last sm:ml-auto" onClick={() => setConfirmCancel(true)}>
                  <XCircle aria-hidden /> {t('temporaryDeliveryNoteDrawer.cancel')}
                </Button>
              )}
              {isOpen && canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil aria-hidden /> {t('temporaryDeliveryNoteDrawer.edit')}</Button>
              )}
              {isOpen && canEdit && (
                <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}><Link2 aria-hidden /> {t('temporaryDeliveryNoteDrawer.linkToDo')}</Button>
              )}
              {pdfDoc && (
                <PDFDownloadLink document={pdfDoc} fileName={`${note.number}.pdf`}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  {({ loading }: { loading: boolean }) => (
                    <>
                      <FileDown aria-hidden /> {loading ? t('temporaryDeliveryNoteDrawer.generating') : t('temporaryDeliveryNoteDrawer.printPdf')}
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
              <DialogTitle>{t('temporaryDeliveryNoteDrawer.linkDialog.title', { number: note?.number ?? '' })}</DialogTitle>
              <DialogDescription>
                <Trans t={t} i18nKey="temporaryDeliveryNoteDrawer.linkDialog.description" values={{ customer: note?.customerName ?? '' }} components={{ b: <b /> }} />
              </DialogDescription>
            </OverlayHeader>
            <OverlayBody>
              <Field label={t('temporaryDeliveryNoteDrawer.linkDialog.field')} required>
                {(control) => (
                  <Select value={linkDoId} onValueChange={setLinkDoId}>
                    <SelectTrigger {...control}><SelectValue placeholder={t('temporaryDeliveryNoteDrawer.linkDialog.placeholder')} /></SelectTrigger>
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
                <p className="text-xs text-warning-text">{t('temporaryDeliveryNoteDrawer.linkDialog.empty')}</p>
              )}
            </OverlayBody>
            <OverlayFooter>
              <Button type="button" variant="ghost" disabled={linkMutation.isPending}
                onClick={() => { setLinkOpen(false); setLinkDoId(''); }}>{t('temporaryDeliveryNoteDrawer.linkDialog.cancel')}</Button>
              <Button type="submit" disabled={!linkDoId} loading={linkMutation.isPending}>
                {linkMutation.isPending ? t('temporaryDeliveryNoteDrawer.linkDialog.linking') : t('temporaryDeliveryNoteDrawer.linkDialog.submit')}
              </Button>
            </OverlayFooter>
          </form>
        </DialogContent>
      </Dialog>

      {editOpen && note && <TemporaryDeliveryNoteModal editNote={note} onClose={() => { setEditOpen(false); queryClient.invalidateQueries({ queryKey: ['temporary-delivery-note-detail', noteId] }); }} />}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={(o) => !o && !cancelMutation.isPending && setConfirmCancel(false)}
        title={t('temporaryDeliveryNoteDrawer.confirmCancel.title')}
        description={t('temporaryDeliveryNoteDrawer.confirmCancel.description')}
        confirmLabel={t('temporaryDeliveryNoteDrawer.confirmCancel.confirm')}
        tone="danger"
        loading={cancelMutation.isPending}
        onConfirm={() => { cancelMutation.mutate(); }}
      />
    </>
  );
};

export default TemporaryDeliveryNoteDrawer;

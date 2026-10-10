import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Edit3, Trash2, CheckCircle2, XCircle, FileSignature, Play, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, Field, LoadingState, StatusBadge } from '@/components/shared';
import { OverlayBody, OverlayFooter, OverlayHeader, ScrollRegion } from './sales/dialog-parts-b';
import { dialogShellClass } from './sales/dialog-classes-b';

const CHANNELS = ['WhatsApp', 'Telepon', 'Email', 'WalkIn', 'Referral', 'Lainnya'] as const;
type Channel = (typeof CHANNELS)[number];
const isChannel = (value: unknown): value is Channel =>
  typeof value === 'string' && (CHANNELS as readonly string[]).includes(value);

interface Props {
  inquiryId: string | null;
  onClose: () => void;
  onEdit?: (q: any) => void;
}

const InquiryDetailDrawer: React.FC<Props> = ({ inquiryId, onClose, onEdit }) => {
  const { t } = useTranslation('sales');
  const isOpen = inquiryId !== null;
  const channelLabel = (value: unknown): string =>
    isChannel(value) ? t(`inquiryDetailDrawer.channels.${value}`) : String(value ?? '');

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
    onSuccess: () => { toast.success(t('inquiryDetailDrawer.toast.statusUpdated')); invalidate(); setLossOpen(false); setLossReason(''); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? t('inquiryDetailDrawer.errors.statusFailed')),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/inquiries/${inquiryId}`),
    onSuccess: () => { toast.success(t('inquiryDetailDrawer.toast.deleted')); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? t('inquiryDetailDrawer.errors.deleteFailed')),
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
    onError: (e: any) => toast.error(e.response?.data?.error ?? t('inquiryDetailDrawer.errors.convertFailed')),
  });

  const busy = statusMut.isPending || deleteMut.isPending || convertMut.isPending;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && !busy && onClose()}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>{t('inquiryDetailDrawer.title')}</SheetTitle>
            <SheetDescription className={q ? 'font-mono text-xs' : 'sr-only'}>
              {q ? q.inquiryNumber : t('inquiryDetailDrawer.loadingDetail')}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="grid content-start gap-4">
            {isLoading || !q ? (
              <LoadingState label={t('inquiryDetailDrawer.loading')} />
            ) : (
              <>
                <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="font-semibold uppercase text-muted-foreground">{t('inquiryDetailDrawer.fields.status')}</dt>
                    <dd><StatusBadge status={q.status} /></dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{t('inquiryDetailDrawer.fields.date')}</dt>
                    <dd className="font-medium text-foreground">{formatDate(q.date)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{t('inquiryDetailDrawer.fields.channel')}</dt>
                    <dd className="font-medium text-foreground">{channelLabel(q.channel)}</dd>
                  </div>
                  {q.followUpDate && (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">{t('inquiryDetailDrawer.fields.followUp')}</dt>
                      <dd className="font-medium text-warning-text">{formatDate(q.followUpDate)}</dd>
                    </div>
                  )}
                  {q.quotation && (
                    <div className="flex items-center justify-between border-t border-border pt-1">
                      <dt className="text-muted-foreground">{t('inquiryDetailDrawer.fields.quotation')}</dt>
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
                      <dt className="inline text-muted-foreground">{t('inquiryDetailDrawer.fields.lossReason')} </dt>
                      <dd className="inline italic text-danger-text">{q.lossReason}</dd>
                    </div>
                  )}
                </dl>

                <section aria-labelledby="inq-party">
                  <h4 id="inq-party" className="mb-2 text-sm font-semibold text-foreground">{t('inquiryDetailDrawer.party.title')}</h4>
                  <div className="grid gap-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{q.party?.name ?? q.prospectName}</span>
                      {!q.partyId && (
                        <span className="rounded-sm bg-warning-subtle px-1.5 py-0.5 text-xs uppercase tracking-wider text-warning-text">{t('inquiryDetailDrawer.party.prospectBadge')}</span>
                      )}
                    </div>
                    {q.prospectPhone && <p className="text-xs text-muted-foreground"><span className="sr-only">{t('inquiryDetailDrawer.party.phone')} </span>{q.prospectPhone}</p>}
                    {q.prospectEmail && <p className="text-xs text-muted-foreground"><span className="sr-only">{t('inquiryDetailDrawer.party.email')} </span>{q.prospectEmail}</p>}
                  </div>
                </section>

                <section aria-labelledby="inq-items">
                  <h4 id="inq-items" className="mb-2 text-sm font-semibold text-foreground">{t('inquiryDetailDrawer.items.title')}</h4>
                  {q.itemsMode === 'structured' && Array.isArray(q.items) && q.items.length > 0 ? (
                    <ScrollRegion label={t('inquiryDetailDrawer.items.tableLabel')}>
                      <table className="w-full min-w-[320px] text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th scope="col" className="py-1.5 text-left">{t('inquiryDetailDrawer.items.item')}</th>
                            <th scope="col" className="py-1.5 text-right">{t('inquiryDetailDrawer.items.qty')}</th>
                            <th scope="col" className="py-1.5 text-right">{t('inquiryDetailDrawer.items.estimatedPrice')}</th>
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
                      {q.itemsText || <span className="italic text-muted-foreground">{t('inquiryDetailDrawer.items.empty')}</span>}
                    </p>
                  )}
                </section>

                {q.notes && (
                  <section aria-labelledby="inq-notes">
                    <h4 id="inq-notes" className="mb-1 text-sm font-semibold text-foreground">{t('inquiryDetailDrawer.fields.notes')}</h4>
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
                  <Trash2 aria-hidden /> {t('inquiryDetailDrawer.actions.delete')}
                </Button>
              )}
              {q.status !== 'Dikonversi' && (
                <Button variant="outline" size="sm" onClick={() => onEdit?.(q)}>
                  <Edit3 aria-hidden /> {t('inquiryDetailDrawer.actions.edit')}
                </Button>
              )}
              {(q.status === 'Baru' || q.status === 'Diproses') && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction('close')} disabled={statusMut.isPending}>
                    <CheckCircle2 aria-hidden /> {t('inquiryDetailDrawer.actions.close')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLossOpen(true)} disabled={statusMut.isPending}>
                    <XCircle aria-hidden /> {t('inquiryDetailDrawer.actions.markLost')}
                  </Button>
                </>
              )}
              {q.status === 'Baru' && (
                <Button variant="outline" size="sm" onClick={() => setConfirmAction('process')} disabled={statusMut.isPending}>
                  <Play aria-hidden /> {t('inquiryDetailDrawer.actions.process')}
                </Button>
              )}
              {(q.status === 'Baru' || q.status === 'Diproses') && (
                <Button size="sm" onClick={() => convertMut.mutate()} loading={convertMut.isPending}>
                  {!convertMut.isPending && <FileSignature aria-hidden />} {t('inquiryDetailDrawer.actions.createQuotation')}
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmAction === 'process'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={t('inquiryDetailDrawer.confirm.process.title')}
        description={t('inquiryDetailDrawer.confirm.process.description')}
        onConfirm={() => { statusMut.mutate({ status: 'Diproses' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'close'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={t('inquiryDetailDrawer.confirm.close.title')}
        description={t('inquiryDetailDrawer.confirm.close.description')}
        onConfirm={() => { statusMut.mutate({ status: 'Ditutup' }); }}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={t('inquiryDetailDrawer.confirm.delete.title')}
        description={t('inquiryDetailDrawer.confirm.delete.description')}
        confirmLabel={t('inquiryDetailDrawer.confirm.delete.confirm')}
        tone="danger"
        onConfirm={() => { deleteMut.mutate(); }}
      />

      <Dialog open={lossOpen} onOpenChange={(open) => { if (!open && !statusMut.isPending) { setLossOpen(false); setLossReason(''); } }}>
        <DialogContent size="sm" className={dialogShellClass}>
          <form noValidate className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => { e.preventDefault(); if (lossReason.length >= 5 && !statusMut.isPending) statusMut.mutate({ status: 'Hilang', lossReason }); }}>
            <OverlayHeader>
              <DialogTitle>{t('inquiryDetailDrawer.lost.title')}</DialogTitle>
              <DialogDescription>{t('inquiryDetailDrawer.lost.description')}</DialogDescription>
            </OverlayHeader>
            <OverlayBody>
              <Field label={t('inquiryDetailDrawer.lost.reasonLabel')} required>
                <Textarea value={lossReason} onChange={(e) => setLossReason(e.target.value)} rows={3}
                  placeholder={t('inquiryDetailDrawer.lost.reasonPlaceholder')} />
              </Field>
            </OverlayBody>
            <OverlayFooter>
              <Button type="button" variant="ghost" disabled={statusMut.isPending}
                onClick={() => { setLossOpen(false); setLossReason(''); }}>{t('inquiryDetailDrawer.actions.cancel')}</Button>
              <Button type="submit" variant="danger" disabled={lossReason.length < 5} loading={statusMut.isPending}>
                {statusMut.isPending ? t('inquiryDetailDrawer.lost.processing') : t('inquiryDetailDrawer.lost.submit')}
              </Button>
            </OverlayFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InquiryDetailDrawer;

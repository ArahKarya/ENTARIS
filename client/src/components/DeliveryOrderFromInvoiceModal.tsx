import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FormError,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass } from '@/components/sales-a/overlay-classes';

interface InvoiceLine {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  inventoryItemId: string | null;
}

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  items: InvoiceLine[];
  onClose: () => void;
  onSuccess?: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

const DeliveryOrderFromInvoiceModal: React.FC<Props> = ({
  invoiceId, invoiceNumber, customerName, items, onClose, onSuccess,
}) => {
  const { t } = useTranslation('sales');
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [nomorMobil, setNomorMobil] = useState('');
  const [driverName, setDriverName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const inventoryLines = items.filter((it) => it.inventoryItemId);
  const skippedCount = items.length - inventoryLines.length;

  const mutation = useMutation({
    mutationFn: () => api.post(`/delivery-orders/from-invoice/${invoiceId}`, {
      date,
      nomorMobil: nomorMobil.trim() || null,
      driverName: driverName.trim() || null,
      recipientName: recipientName.trim() || null,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoice-detail', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success(t('deliveryOrderFromInvoiceModal.toast.created'));
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || t('deliveryOrderFromInvoiceModal.errors.create');
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!date) {
      setError(t('deliveryOrderFromInvoiceModal.validation.date'));
      return;
    }
    if (inventoryLines.length === 0) {
      setError(t('deliveryOrderFromInvoiceModal.validation.noLines'));
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-2xl`}>
        <form onSubmit={handleSubmit} noValidate className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="size-5 text-primary" aria-hidden />
              {t('deliveryOrderFromInvoiceModal.title')}
            </DialogTitle>
            <DialogDescription>
              <Trans
                t={t}
                i18nKey="deliveryOrderFromInvoiceModal.description"
                values={{ number: invoiceNumber, customer: customerName }}
                components={{ mono: <span className="font-mono" /> }}
              />
            </DialogDescription>
          </FormDialogHeader>

          <FormDialogBody>
            <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              {t('deliveryOrderFromInvoiceModal.stockNotice')}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('deliveryOrderFromInvoiceModal.fields.date')} required>
                {(control) => <DateInput id={control.id} value={date} onChange={setDate} required />}
              </Field>
              <Field label={t('deliveryOrderFromInvoiceModal.fields.vehicle')}>
                <Input
                  value={nomorMobil}
                  onChange={(e) => setNomorMobil(e.target.value)}
                  placeholder={t('deliveryOrderFromInvoiceModal.fields.vehiclePlaceholder')}
                  className="font-mono uppercase"
                  autoComplete="off"
                />
              </Field>
              <Field label={t('deliveryOrderFromInvoiceModal.fields.driver')}>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder={t('deliveryOrderFromInvoiceModal.fields.driverPlaceholder')}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('deliveryOrderFromInvoiceModal.fields.recipient')}>
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder={t('deliveryOrderFromInvoiceModal.fields.recipientPlaceholder')}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('deliveryOrderFromInvoiceModal.fields.notes')} className="sm:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t('deliveryOrderFromInvoiceModal.fields.notesPlaceholder')}
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="size-3.5" aria-hidden /> {t('deliveryOrderFromInvoiceModal.items.title', { count: inventoryLines.length })}
                {skippedCount > 0 && (
                  <span className="ml-auto font-normal normal-case tracking-normal">
                    {t('deliveryOrderFromInvoiceModal.items.skipped', { count: skippedCount })}
                  </span>
                )}
              </p>
              <TableRegion label={t('deliveryOrderFromInvoiceModal.items.tableLabel')}>
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                      <th scope="col" className="w-8 px-4 py-2 text-left">#</th>
                      <th scope="col" className="px-3 py-2 text-left">{t('deliveryOrderFromInvoiceModal.columns.itemName')}</th>
                      <th scope="col" className="w-24 px-3 py-2 text-right">{t('deliveryOrderFromInvoiceModal.columns.qty')}</th>
                      <th scope="col" className="w-16 px-3 py-2 text-center">{t('deliveryOrderFromInvoiceModal.columns.unit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLines.map((it, idx) => (
                      <tr key={it.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-center text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{it.itemName}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-foreground">
                          {Number(it.quantity).toLocaleString(LOCALE, { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">{it.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            </div>

            <FormError>{error}</FormError>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              {t('deliveryOrderFromInvoiceModal.cancel')}
            </FooterButton>
            <FooterButton type="submit" loading={mutation.isPending} disabled={inventoryLines.length === 0}>
              {!mutation.isPending && <Truck aria-hidden />}
              {mutation.isPending ? t('deliveryOrderFromInvoiceModal.creating') : t('deliveryOrderFromInvoiceModal.title')}
            </FooterButton>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryOrderFromInvoiceModal;

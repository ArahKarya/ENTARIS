import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
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
      toast.success('Surat Jalan dibuat dan terhubung dengan invoice.');
      onSuccess?.();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error || 'Gagal membuat surat jalan.';
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!date) {
      setError('Tanggal pengiriman wajib diisi.');
      return;
    }
    if (inventoryLines.length === 0) {
      setError('Invoice ini tidak punya baris barang fisik untuk dikirim.');
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
              Buat Surat Jalan
            </DialogTitle>
            <DialogDescription>
              Untuk invoice <span className="font-mono">{invoiceNumber}</span> — {customerName}
            </DialogDescription>
          </FormDialogHeader>

          <FormDialogBody>
            <p className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              Stok sudah dikurangi sejak invoice di-submit. Surat Jalan ini hanya untuk
              dokumen pengiriman fisik & cetakan supir — tidak menyentuh stok lagi.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tanggal Pengiriman" required>
                {(control) => <DateInput id={control.id} value={date} onChange={setDate} required />}
              </Field>
              <Field label="No. Mobil">
                <Input
                  value={nomorMobil}
                  onChange={(e) => setNomorMobil(e.target.value)}
                  placeholder="Mis. B 1234 ABC"
                  className="font-mono uppercase"
                  autoComplete="off"
                />
              </Field>
              <Field label="Nama Supir">
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Nama supir"
                  autoComplete="off"
                />
              </Field>
              <Field label="Penerima">
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nama penerima"
                  autoComplete="off"
                />
              </Field>
              <Field label="Catatan" className="sm:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan pengiriman (opsional)"
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="size-3.5" aria-hidden /> Barang dari invoice ({inventoryLines.length} item)
                {skippedCount > 0 && (
                  <span className="ml-auto font-normal normal-case tracking-normal">
                    ({skippedCount} baris jasa diabaikan)
                  </span>
                )}
              </p>
              <TableRegion label="Barang dari invoice">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                      <th scope="col" className="w-8 px-4 py-2 text-left">#</th>
                      <th scope="col" className="px-3 py-2 text-left">Nama Barang</th>
                      <th scope="col" className="w-24 px-3 py-2 text-right">Qty</th>
                      <th scope="col" className="w-16 px-3 py-2 text-center">Satuan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryLines.map((it, idx) => (
                      <tr key={it.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-center text-xs text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2 text-sm text-foreground">{it.itemName}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-foreground">
                          {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
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
              Batal
            </FooterButton>
            <FooterButton type="submit" loading={mutation.isPending} disabled={inventoryLines.length === 0}>
              {!mutation.isPending && <Truck aria-hidden />}
              {mutation.isPending ? 'Membuat…' : 'Buat Surat Jalan'}
            </FooterButton>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryOrderFromInvoiceModal;

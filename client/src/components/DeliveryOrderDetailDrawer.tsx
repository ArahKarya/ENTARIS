import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import {
  Truck, User, Calendar, Package, Loader2, XCircle, FileDown, FileText, ExternalLink, AlertTriangle, Pencil,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button, buttonVariants } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import {
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import AttachmentUpload from './AttachmentUpload';
import AttachmentPreview from './AttachmentPreview';
import DeliveryOrderPDF from '../lib/pdf/DeliveryOrderPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import DeliveryOrderModal from './DeliveryOrderModal';
import { can, cap } from '@/lib/permissions';

interface Props {
  doId: string | null;
  onClose: () => void;
}

const DeliveryOrderDetailDrawer: React.FC<Props> = ({ doId, onClose }) => {
  const company = useCompanyPDF();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isAdmin = cap('doc.cancel');
  const canEdit = can('delivery_order', 'edit');
  const [editOpen, setEditOpen] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['delivery-order-detail', doId],
    queryFn: async () => {
      const res = await api.get(`/delivery-orders/${doId}`);
      return res.data.data ?? res.data;
    },
    enabled: !!doId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/delivery-orders/${doId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-order-detail', doId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success('Surat jalan dibatalkan. Stok dikembalikan ke gudang.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan surat jalan.'),
  });

  if (!doId) return null;

  const rawStatus: string = doc?.status ?? 'Submitted';
  const customer = doc?.customer ?? doc?.party ?? null;
  const items: any[] = doc?.items ?? [];
  const invoiceRef = doc?.salesInvoice ?? doc?.invoice ?? null;
  // "Invoiced" is derived — enum stays Submitted with invoiceId set.
  const status: string = rawStatus === 'Submitted' && invoiceRef ? 'Invoiced' : rawStatus;

  const pdfDoc = doc ? (
    <DeliveryOrderPDF
      doNumber={doc.doNumber}
      date={doc.date}
      status={status}
      customer={{
        name: customer?.name ?? '—',
        address: customer?.address ?? null,
        phone: customer?.phone ?? null,
      }}
      poRef={doc.salesOrder?.customerRefNo ?? null}
      soNumber={doc.salesOrder?.soNumber ?? null}
      nomorMobil={doc.nomorMobil}
      driverName={doc.driverName}
      recipientName={doc.recipientName}
      notes={doc.notes}
      items={items.map((it: any) => ({
        code: it.inventoryItem?.code ?? null,
        name: it.itemName,
        qty: Number(it.quantity),
        unit: it.unit,
        description: it.description,
      }))}
      company={{
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        taxId: company.taxId,
        logoUrl: company.logoUrl,
      }}
    />
  ) : null;

  const pdfFileName = doc ? `${doc.doNumber}.pdf` : 'surat-jalan.pdf';

  const handleBuatInvoice = () => {
    if (!doc?.id) return;
    // Deep-link ke Invoice Penjualan: auto-buka modal & prefill dari DO ini.
    navigate(`/sales?fromDO=${doc.id}&party=${doc.partyId}`);
    onClose();
  };

  const handleLihatInvoice = () => {
    if (invoiceRef?.id) {
      // Sales invoices page reads ?invoice=<id> to auto-open the drawer (if supported).
      // Fallback: just navigate to the list.
      navigate(`/sales?invoice=${invoiceRef.id}`);
    } else {
      navigate('/sales');
    }
    onClose();
  };

  const sectionTitle = 'mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const footBtn = 'max-sm:h-11';

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="md" className="sm:max-w-2xl">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="flex items-center gap-2">
                <Truck className="size-5 text-primary" aria-hidden />
                {isLoading ? 'Memuat…' : doc?.doNumber ?? 'Surat Jalan'}
              </SheetTitle>
              {doc && <StatusBadge status={status} docType="delivery_order" />}
            </div>
            <SheetDescription>Surat Jalan</SheetDescription>
          </SheetHeader>

          <SheetBody className="px-0 py-0">
            {isLoading ? (
              <LoadingState label="Memuat surat jalan…" />
            ) : !doc ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Surat jalan tidak ditemukan.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-6 border-b border-border px-6 py-5 sm:grid-cols-2">
                  <div>
                    <h3 className={sectionTitle}><User size={10} aria-hidden /> Pelanggan</h3>
                    <p className="text-sm font-semibold text-foreground">{customer?.name ?? '—'}</p>
                    {customer?.phone && <p className="mt-0.5 text-xs text-muted-foreground">{customer.phone}</p>}
                    {customer?.address && <p className="mt-0.5 text-xs text-muted-foreground">{customer.address}</p>}
                  </div>

                  <div>
                    <h3 className={sectionTitle}><Calendar size={10} aria-hidden /> Informasi Pengiriman</h3>
                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Tanggal</dt>
                        <dd className="text-xs font-medium text-foreground">{formatDate(doc.date)}</dd>
                      </div>
                      {doc.salesOrder && (
                        <>
                          <div>
                            <dt className="text-xs text-muted-foreground">No. PO Pelanggan</dt>
                            <dd className="font-mono text-xs font-medium text-foreground">{doc.salesOrder.customerRefNo?.trim() || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">No. Pesanan (SO)</dt>
                            <dd className="font-mono text-xs font-medium text-foreground">{doc.salesOrder.soNumber}</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt className="text-xs text-muted-foreground">No. Mobil</dt>
                        <dd className="font-mono text-xs font-medium uppercase text-foreground">{doc.nomorMobil || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Supir</dt>
                        <dd className="text-xs font-medium text-foreground">{doc.driverName || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Penerima</dt>
                        <dd className="text-xs font-medium text-foreground">{doc.recipientName || '—'}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-muted-foreground">Dibuat oleh</dt>
                        <dd className="text-xs font-medium text-foreground">{doc.user?.fullName ?? doc.createdBy ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {status === 'Invoiced' && invoiceRef && (
                  <div className="border-b border-border bg-success-subtle/40 px-6 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-success-text" aria-hidden />
                        <div>
                          <p className="text-xs text-muted-foreground">Sudah ditagihkan via invoice</p>
                          <p className="font-mono text-sm font-medium text-success-text">{invoiceRef.invoiceNumber}</p>
                        </div>
                      </div>
                      <Button variant="link" size="sm" className="max-sm:h-11" onClick={handleLihatInvoice}>
                        Lihat Invoice <ExternalLink aria-hidden />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border-b border-border px-6 py-4">
                  <h3 className={sectionTitle}><Package size={10} aria-hidden /> Daftar Barang ({items.length} item)</h3>
                  <TableRegion label="Daftar barang surat jalan">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="w-8 px-3 py-2.5 text-left">#</th>
                          <th scope="col" className="w-20 px-3 py-2.5 text-left">Kode</th>
                          <th scope="col" className="px-3 py-2.5 text-left">Nama</th>
                          <th scope="col" className="px-3 py-2.5 text-left">Gudang</th>
                          <th scope="col" className="w-20 px-3 py-2.5 text-right">Qty</th>
                          <th scope="col" className="w-16 px-3 py-2.5 text-center">Satuan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it: any, idx: number) => (
                          <tr key={it.id ?? idx} className={cn('border-b border-border last:border-0', idx % 2 === 1 && 'bg-muted/30')}>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{it.inventoryItem?.code ?? '—'}</td>
                            <td className="px-3 py-2.5">
                              <p className="text-sm font-medium text-foreground">{it.itemName}</p>
                              {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{it.warehouse?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-foreground">
                              {Number(it.quantity).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{it.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableRegion>
                </div>

                <div className="px-6 py-4">
                  <h3 className={sectionTitle}>Catatan</h3>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {doc.notes || <span className="italic text-muted-foreground">Tidak ada catatan</span>}
                  </p>
                </div>

                {/* Attachments — bukti jembatan timbang / foto kendaraan / dll */}
                <div className="border-t border-border px-6 py-4">
                  <h3 className={sectionTitle}>Lampiran (Bukti Timbang / Foto)</h3>
                  <AttachmentPreview referenceType="delivery_order" referenceId={doc.id} />
                  {status !== 'Cancelled' && (
                    <div className="mt-2">
                      <AttachmentUpload referenceType="delivery_order" referenceId={doc.id} />
                    </div>
                  )}
                </div>

                {status === 'Cancelled' && (
                  <div role="status" className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle p-3 text-xs text-danger-text">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>Surat jalan ini sudah dibatalkan. Stok telah dikembalikan ke gudang. Dokumen disimpan untuk jejak audit.</span>
                  </div>
                )}
              </>
            )}
          </SheetBody>

          {doc && (
            <SheetFooter className="flex-wrap sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {status === 'Submitted' && isAdmin && (
                  <Button
                    variant="ghost"
                    className={cn('text-danger-text', footBtn)}
                    onClick={() => setConfirmCancel(true)}
                    title="Hanya Admin yang bisa membatalkan surat jalan"
                  >
                    <XCircle aria-hidden /> Batalkan
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap [&>*:only-child]:col-span-2">
                {pdfDoc && (
                  <PDFDownloadLink
                    document={pdfDoc}
                    fileName={pdfFileName}
                    className={cn(buttonVariants({ variant: 'outline', size: 'md' }), footBtn)}
                  >
                    {({ loading }) => (
                      <>
                        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                        {loading ? 'Membuat…' : 'Cetak PDF'}
                      </>
                    )}
                  </PDFDownloadLink>
                )}

                {status === 'Submitted' && (
                  <>
                    {canEdit && (
                      <Button
                        variant="outline"
                        className={footBtn}
                        onClick={() => setEditOpen(true)}
                        title="Edit surat jalan (nomor & tanggal dipertahankan)"
                      >
                        <Pencil aria-hidden /> Edit
                      </Button>
                    )}
                    <Button className={footBtn} onClick={handleBuatInvoice}>Buat Invoice</Button>
                  </>
                )}

                {status === 'Invoiced' && (
                  <Button className={footBtn} onClick={handleLihatInvoice}>
                    <ExternalLink aria-hidden /> Lihat Invoice
                  </Button>
                )}
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        tone="danger"
        title="Batalkan Surat Jalan"
        description={`Batalkan surat jalan ${doc?.doNumber ?? ''}? Stok akan dikembalikan ke gudang asal. Tindakan ini tercatat di audit trail.`}
        confirmLabel="Ya, Batalkan"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutateAsync()}
      />

      {editOpen && doc && (
        <DeliveryOrderModal
          onClose={() => setEditOpen(false)}
          editDO={{
            id: doc.id,
            doNumber: doc.doNumber,
            date: doc.date,
            partyId: doc.partyId ?? customer?.id ?? '',
            nomorMobil: doc.nomorMobil ?? null,
            driverName: doc.driverName ?? null,
            recipientName: doc.recipientName ?? null,
            notes: doc.notes ?? null,
            items: items.map((it: any) => ({
              id: it.id,
              inventoryItemId: it.inventoryItemId ?? null,
              warehouseId: it.warehouseId ?? null,
              itemName: it.itemName,
              quantity: Number(it.quantity),
              unit: it.unit,
              description: it.description ?? null,
            })),
          }}
        />
      )}
    </>
  );
};

export default DeliveryOrderDetailDrawer;

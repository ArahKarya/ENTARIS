import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { XCircle, FileDown, AlertTriangle, ArrowRight } from 'lucide-react';
import api from '../lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';
import WarehouseTransferPDF from '../lib/pdf/WarehouseTransferPDF';
import { useCompanyPDF } from '../lib/pdf/useCompanyPDF';
import { cap } from '../lib/permissions';

interface Props {
  transferId: string | null;
  onClose: () => void;
}

function Info({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`break-words text-sm font-medium text-foreground ${mono ? 'font-mono uppercase' : ''}`}>{children}</dd>
    </div>
  );
}

const WarehouseTransferDrawer: React.FC<Props> = ({ transferId, onClose }) => {
  const company = useCompanyPDF();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const canCancel = cap('doc.cancel');

  const { data: doc, isLoading } = useQuery({
    queryKey: ['stock-transfer-detail', transferId],
    queryFn: async () => {
      const res = await api.get(`/stock-transfers/${transferId}`);
      return res.data;
    },
    enabled: !!transferId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/stock-transfers/${transferId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', transferId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success('Transfer dibatalkan. Stok dikembalikan ke gudang asal.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal membatalkan transfer.'),
  });

  const markPrintedMutation = useMutation({
    mutationFn: () => api.post(`/stock-transfers/${transferId}/mark-printed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', transferId] });
    },
  });

  const status: string = doc?.status ?? 'Submitted';
  const items: any[] = doc?.items ?? [];

  const pdfDoc = doc ? (
    <WarehouseTransferPDF
      transferNumber={doc.transferNumber}
      date={doc.date}
      fromWarehouseName={doc.fromWarehouse?.name ?? '—'}
      toWarehouseName={doc.toWarehouse?.name ?? '—'}
      nomorMobil={doc.nomorMobil}
      driverName={doc.driverName}
      recipientName={doc.recipientName}
      notes={doc.notes}
      items={items.map((it: any) => ({
        code: it.item?.code ?? null,
        name: it.item?.name ?? '—',
        qty: Number(it.quantity),
        unit: it.item?.unit ?? '',
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

  const pdfFileName = doc ? `${doc.transferNumber}.pdf` : 'sjg.pdf';

  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  return (
    <>
      <Sheet open={!!transferId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="lg">
          <SheetHeader>
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{isLoading ? 'Memuat…' : (doc?.transferNumber ?? 'Transfer Stok')}</SheetTitle>
              {doc && <StatusBadge status={status} />}
            </div>
            <SheetDescription>Surat Jalan Antar Gudang (SJG)</SheetDescription>
          </SheetHeader>

          <SheetBody className="space-y-6" role="region" aria-label="Isi detail transfer stok" tabIndex={0}>
            {isLoading ? (
              <LoadingState />
            ) : !doc ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Transfer tidak ditemukan.</p>
            ) : (
              <>
                <section aria-labelledby="wt-route" className="rounded-lg border border-border bg-info-subtle/40 p-4">
                  <h3 id="wt-route" className="mb-3 text-xs font-semibold uppercase tracking-widest text-info-text">
                    Rute Transfer
                  </h3>
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                    <div className="flex-1 rounded-lg border border-border bg-card p-3">
                      <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Gudang Asal</p>
                      <p className="text-sm font-semibold text-foreground">{doc.fromWarehouse?.name ?? '—'}</p>
                      {doc.fromWarehouse?.location && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{doc.fromWarehouse.location}</p>
                      )}
                    </div>
                    <ArrowRight className="size-6 shrink-0 self-center text-primary max-sm:rotate-90" aria-label="menuju" role="img" />
                    <div className="flex-1 rounded-lg border border-border bg-card p-3">
                      <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Gudang Tujuan</p>
                      <p className="text-sm font-semibold text-foreground">{doc.toWarehouse?.name ?? '—'}</p>
                      {doc.toWarehouse?.location && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{doc.toWarehouse.location}</p>
                      )}
                    </div>
                  </div>
                </section>

                <div className="grid gap-6 sm:grid-cols-2">
                  <section aria-labelledby="wt-ship">
                    <h3 id="wt-ship" className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Info Pengiriman
                    </h3>
                    <dl className="grid grid-cols-2 gap-3">
                      <Info label="Tanggal">{formatDate(doc.date)}</Info>
                      <Info label="No. Mobil" mono>{doc.nomorMobil || '—'}</Info>
                      <Info label="Supir">{doc.driverName || '—'}</Info>
                      <Info label="Penerima">{doc.recipientName || '—'}</Info>
                    </dl>
                  </section>
                  <section aria-labelledby="wt-audit">
                    <h3 id="wt-audit" className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Audit
                    </h3>
                    <dl className="space-y-3">
                      <Info label="Dibuat oleh">{doc.user?.fullName ?? '—'}</Info>
                      {doc.printedAt && <Info label="Dicetak terakhir">{formatDate(doc.printedAt)}</Info>}
                    </dl>
                  </section>
                </div>

                <section aria-labelledby="wt-items">
                  <h3 id="wt-items" className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Item ({items.length})
                  </h3>
                  {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width */}
                  <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Daftar item transfer" tabIndex={0}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th scope="col" className={`${th} w-8 text-left`}>#</th>
                          <th scope="col" className={`${th} text-left`}>Kode</th>
                          <th scope="col" className={`${th} text-left`}>Nama</th>
                          <th scope="col" className={`${th} text-right`}>Qty</th>
                          <th scope="col" className={`${th} text-center`}>Sat</th>
                          <th scope="col" className={`${th} text-left`}>Keterangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it: any, idx: number) => (
                          <tr key={it.id ?? idx} className="border-b border-border last:border-0">
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{it.item?.code ?? '—'}</td>
                            <td className="px-3 py-2.5 font-medium text-foreground">{it.item?.name ?? '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs font-medium tabular-nums text-foreground">
                              {formatNumber(it.quantity, { maxDecimals: 3 })}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{it.item?.unit ?? ''}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{it.description || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {doc.notes && (
                  <section aria-labelledby="wt-notes">
                    <h3 id="wt-notes" className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Catatan
                    </h3>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{doc.notes}</p>
                  </section>
                )}

                {status === 'Cancelled' && (
                  <p role="status" className="flex items-start gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Transfer ini sudah dibatalkan. Stok telah dikembalikan ke gudang asal.
                  </p>
                )}
              </>
            )}
          </SheetBody>

          {doc && (
            <SheetFooter className="flex-wrap">
              {status === 'Submitted' && canCancel && (
                <Button variant="outline" className="text-danger-text sm:mr-auto" onClick={() => setConfirmCancel(true)}>
                  <XCircle aria-hidden /> Batalkan Transfer
                </Button>
              )}
              {pdfDoc && (
                <PDFDownloadLink document={pdfDoc} fileName={pdfFileName}>
                  {({ loading }) => (
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      loading={loading}
                      onClick={() => {
                        if (!loading) markPrintedMutation.mutate();
                      }}
                    >
                      {!loading && <FileDown aria-hidden />}
                      {loading ? 'Membuat…' : 'Cetak SJG'}
                    </Button>
                  )}
                </PDFDownloadLink>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Batalkan Transfer Stok"
        description={`Batalkan transfer ${doc?.transferNumber ?? ''}? Stok akan dikembalikan ke gudang asal.`}
        confirmLabel="Ya, Batalkan"
        tone="danger"
        onConfirm={() => {
          cancelMutation.mutate();
        }}
      />
    </>
  );
};

export default WarehouseTransferDrawer;

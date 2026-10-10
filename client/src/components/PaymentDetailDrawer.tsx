import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CreditCard, User, Calendar, Clock,
  Paperclip, FileText, Image as ImageIcon, Trash2, Download,
  TrendingDown, TrendingUp, ArrowRightLeft, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge } from '@/components/shared';
import { DetailSheet } from './purchase-cash/DetailSheet';

interface Props {
  paymentId: string | null;
  onClose: () => void;
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  Receive: { label: 'Terima Pembayaran', icon: <TrendingDown className="size-4" aria-hidden />, color: 'text-success-text' },
  Pay: { label: 'Bayar Hutang', icon: <TrendingUp className="size-4" aria-hidden />, color: 'text-danger-text' },
  VendorDeposit: { label: 'Uang Muka Vendor', icon: <CreditCard className="size-4" aria-hidden />, color: 'text-warning-text' },
  Expense: { label: 'Pengeluaran', icon: <FileText className="size-4" aria-hidden />, color: 'text-warning-text' },
  Transfer: { label: 'Pemindahbukuan', icon: <ArrowRightLeft className="size-4" aria-hidden />, color: 'text-info-text' },
};

const PaymentDetailDrawer: React.FC<Props> = ({ paymentId, onClose }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: payment, isLoading, isError, refetch } = useQuery({
    queryKey: ['payment-detail', paymentId],
    queryFn: async () => {
      const res = await api.get(`/payments/${paymentId}`);
      return res.data;
    },
    enabled: !!paymentId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['payment-attachments', paymentId],
    queryFn: async () => {
      const res = await api.get(`/attachments/payment/${paymentId}`);
      return res.data;
    },
    enabled: !!paymentId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('referenceType', 'payment');
      fd.append('referenceId', paymentId!);
      await api.post('/attachments/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast.success('Lampiran diunggah.');
      queryClient.invalidateQueries({ queryKey: ['payment-attachments', paymentId] });
      queryClient.invalidateQueries({ queryKey: ['attachment-counts'] });
    },
    onError: () => toast.error('Gagal mengunggah lampiran.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      toast.success('Lampiran dihapus.');
      queryClient.invalidateQueries({ queryKey: ['payment-attachments', paymentId] });
      queryClient.invalidateQueries({ queryKey: ['attachment-counts'] });
    },
    onError: () => toast.error('Gagal menghapus lampiran.'),
  });

  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`File ${file.name} terlalu besar (maks 10MB).`);
        continue;
      }
      uploadMutation.mutate(file);
    }
  };

  const tc = payment ? typeConfig[payment.paymentType] ?? typeConfig.Receive : typeConfig.Receive;
  const sectionTitle = 'mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const tableRegion =
    'overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const th = 'px-3 py-2 text-xs font-medium text-muted-foreground';

  return (
    <>
      <DetailSheet
        open={!!paymentId}
        onClose={onClose}
        title={payment?.paymentNumber ?? 'Memuat…'}
        badge={payment && <StatusBadge status={payment.status} docType="payment" />}
        description={payment ? 'Detail pembayaran' : 'Memuat detail pembayaran'}
      >
        {isLoading ? (
          <LoadingState label="Memuat pembayaran…" />
        ) : isError ? (
          <EmptyState
            kind="error"
            title="Pembayaran gagal dimuat"
            description="Permintaan ke server gagal, jadi detail belum bisa ditampilkan. Periksa koneksi lalu coba lagi."
            action={<Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>}
          />
        ) : !payment ? (
          <EmptyState title="Pembayaran tidak ditemukan" description="Pembayaran ini mungkin sudah dihapus. Tutup panel lalu muat ulang daftar." />
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className={tc.color}>{tc.icon}</span>
                <span className="text-sm font-medium text-foreground">{tc.label}</span>
              </div>
              <p className={cn('num text-2xl font-bold', tc.color)}>{formatRupiah(Number(payment.amount))}</p>
              {Number(payment.refundedAmount) > 0 && (
                <p className="mt-1 text-xs text-warning-text">Refund: {formatRupiah(Number(payment.refundedAmount))}</p>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoItem icon={<Calendar className="size-3.5" aria-hidden />} label="Tanggal" value={formatDate(payment.date)} />
              <InfoItem icon={<User className="size-3.5" aria-hidden />} label="Pihak Terkait" value={payment.party?.name ?? '—'} />
              <InfoItem icon={<CreditCard className="size-3.5" aria-hidden />} label="Akun Kas/Bank" value={payment.account?.name ?? '—'} />
              <InfoItem icon={<Clock className="size-3.5" aria-hidden />} label="Referensi" value={payment.referenceNo || '—'} />
            </dl>

            {payment.splits && payment.splits.length > 0 && (
              <section>
                <h3 className={sectionTitle}>Detail Akun</h3>
                <div role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0} aria-label="Tabel detail akun" className={tableRegion}>
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th scope="col" className={cn(th, 'text-left')}>Akun</th>
                        <th scope="col" className={cn(th, 'text-right')}>Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.splits.map((s: any) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="px-3 py-2 text-xs">
                            <span className="font-mono text-muted-foreground">{s.account?.accountNumber}</span>{' '}
                            <span className="text-foreground">{s.account?.name}</span>
                          </td>
                          <td className="num px-3 py-2 text-right text-xs font-medium text-foreground">
                            {formatRupiah(Number(s.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {payment.allocations && payment.allocations.length > 0 && (
              <section>
                <h3 className={sectionTitle}>Alokasi ke Faktur</h3>
                <ul className="space-y-2">
                  {payment.allocations.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {a.invoiceType === 'SalesInvoice' ? 'Faktur Penjualan' : 'Faktur Pembelian'}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{a.invoiceNumber ?? `${a.invoiceId.slice(0, 8)}...`}</p>
                      </div>
                      <span className="num text-xs font-bold text-foreground">{formatRupiah(Number(a.allocatedAmount))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {payment.journalEntry && (
              <section>
                <h3 className={sectionTitle}>Jurnal ({payment.journalEntry.entryNumber})</h3>
                <div role="region"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0} aria-label="Tabel jurnal" className={tableRegion}>
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th scope="col" className={cn(th, 'text-left')}>Akun</th>
                        <th scope="col" className={cn(th, 'text-right')}>Debit</th>
                        <th scope="col" className={cn(th, 'text-right')}>Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.journalEntry.items.map((ji: any) => (
                        <tr key={ji.id} className="border-t border-border">
                          <td className="px-3 py-1.5 text-foreground">
                            <span className="font-mono text-muted-foreground">{ji.account?.accountNumber}</span> {ji.account?.name}
                          </td>
                          <td className={cn('num px-3 py-1.5 text-right', Number(ji.debit) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                            {Number(ji.debit) > 0 ? formatRupiah(Number(ji.debit)) : '—'}
                          </td>
                          <td className={cn('num px-3 py-1.5 text-right', Number(ji.credit) > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                            {Number(ji.credit) > 0 ? formatRupiah(Number(ji.credit)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {payment.notes && (
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan</p>
                <p className="text-xs leading-relaxed text-foreground">{payment.notes}</p>
              </div>
            )}

            <section>
              <h3 className={sectionTitle}>
                <Paperclip className="size-3" aria-hidden /> Lampiran ({attachments.length})
              </h3>

              {payment.status !== 'Cancelled' && (
                <div
                  className={cn(
                    'mb-3 rounded-lg border-2 border-dashed p-4 text-center transition-colors',
                    dragOver ? 'border-primary bg-primary-subtle' : 'border-border',
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 sm:h-9"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploadMutation.isPending}
                  >
                    <Upload aria-hidden />
                    {uploadMutation.isPending ? 'Mengunggah…' : 'Pilih file'}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">atau seret file ke sini (maks 10MB)</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    tabIndex={-1}
                    aria-label="Berkas lampiran"
                    accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              )}

              {attachments.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">Belum ada lampiran.</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((a: any) => {
                    const isImage = a.mimeType?.startsWith('image/');
                    const Icon = isImage ? ImageIcon : FileText;
                    return (
                      <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                        <Icon className={cn('size-4 shrink-0', isImage ? 'text-primary' : 'text-info-text')} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{a.originalName}</p>
                          <p className="text-xs text-muted-foreground">{(a.fileSize / 1024).toFixed(0)} KB</p>
                        </div>
                        <Button asChild variant="ghost" size="icon-touch" className="sm:size-9">
                          <a
                            href={`/api/attachments/file/${a.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Unduh ${a.originalName}`}
                          >
                            <Download aria-hidden />
                          </a>
                        </Button>
                        {payment.status !== 'Cancelled' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-touch"
                            className="text-danger-text sm:size-9"
                            aria-label={`Hapus ${a.originalName}`}
                            onClick={() => setDeleteTarget({ id: a.id, name: a.originalName })}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        tone="danger"
        title="Hapus lampiran?"
        description={deleteTarget ? `Lampiran "${deleteTarget.name}" akan dihapus permanen.` : undefined}
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
        onConfirm={() => (deleteTarget ? deleteMutation.mutateAsync(deleteTarget.id) : undefined)}
      />
    </>
  );
};

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </dt>
      <dd className="break-words text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default PaymentDetailDrawer;

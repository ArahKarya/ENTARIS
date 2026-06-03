import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  X, CreditCard, User, Calendar, Clock,
  Loader2, Paperclip, FileText, Image as ImageIcon, Trash2, Download,
  TrendingDown, TrendingUp, ArrowRightLeft, Upload,
} from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';

interface Props {
  paymentId: string | null;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; badge: string }> = {
  Draft: { label: 'Draft', badge: 'badge badge-gray' },
  Submitted: { label: 'Aktif', badge: 'badge badge-blue' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  Receive: { label: 'Terima Pembayaran', icon: <TrendingDown size={16} />, color: 'text-green-600' },
  Pay: { label: 'Bayar Hutang', icon: <TrendingUp size={16} />, color: 'text-red-600' },
  VendorDeposit: { label: 'Uang Muka Vendor', icon: <CreditCard size={16} />, color: 'text-amber-600' },
  Expense: { label: 'Pengeluaran', icon: <FileText size={16} />, color: 'text-orange-600' },
  Transfer: { label: 'Pemindahbukuan', icon: <ArrowRightLeft size={16} />, color: 'text-blue-600' },
};

const PaymentDetailDrawer: React.FC<Props> = ({ paymentId, onClose }) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: payment, isLoading } = useQuery({
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
      toast.success('Lampiran berhasil diunggah.');
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

  if (!paymentId) return null;

  const sc = payment ? statusConfig[payment.status] ?? statusConfig.Draft : statusConfig.Draft;
  const tc = payment ? typeConfig[payment.paymentType] ?? typeConfig.Receive : typeConfig.Receive;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full w-full max-w-lg z-50 border-l overflow-y-auto shadow-2xl"
        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b px-5 py-4 flex items-center justify-between"
          style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-blue-600" />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {payment?.paymentNumber ?? 'Memuat...'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {payment && <span className={sc.badge}>{sc.label}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={18} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : !payment ? (
          <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            Pembayaran tidak ditemukan.
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">

            {/* Type & Amount */}
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className={tc.color}>{tc.icon}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{tc.label}</span>
              </div>
              <p className={cn('text-2xl font-bold tabular-nums', tc.color)}>
                {formatRupiah(Number(payment.amount))}
              </p>
              {Number(payment.refundedAmount) > 0 && (
                <p className="text-xs mt-1 text-amber-600">
                  Refund: {formatRupiah(Number(payment.refundedAmount))}
                </p>
              )}
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoItem icon={<Calendar size={14} />} label="Tanggal" value={formatDate(payment.date)} />
              <InfoItem icon={<User size={14} />} label="Pihak Terkait" value={payment.party?.name ?? '—'} />
              <InfoItem icon={<CreditCard size={14} />} label="Akun Kas/Bank" value={payment.account?.name ?? '—'} />
              <InfoItem icon={<Clock size={14} />} label="Referensi" value={payment.referenceNo || '—'} />
            </div>

            {/* Payment Splits */}
            {payment.splits && payment.splits.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Detail Akun
                </h3>
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                        <th className="text-left px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Akun</th>
                        <th className="text-right px-3 py-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.splits.map((s: any) => (
                        <tr key={s.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-3 py-2">
                            <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                              {s.account?.accountNumber}
                            </span>{' '}
                            <span className="text-xs" style={{ color: 'var(--color-text-primary)' }}>
                              {s.account?.name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            {formatRupiah(Number(s.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invoice Allocations */}
            {payment.allocations && payment.allocations.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Alokasi ke Faktur
                </h3>
                <div className="space-y-2">
                  {payment.allocations.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {a.invoiceType === 'SalesInvoice' ? 'Faktur Penjualan' : 'Faktur Pembelian'}
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          {a.invoiceId.slice(0, 8)}...
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        {formatRupiah(Number(a.allocatedAmount))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Journal Entry */}
            {payment.journalEntry && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Jurnal ({payment.journalEntry.entryNumber})
                </h3>
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                        <th className="text-left px-3 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Akun</th>
                        <th className="text-right px-3 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Debit</th>
                        <th className="text-right px-3 py-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payment.journalEntry.items.map((ji: any) => (
                        <tr key={ji.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                          <td className="px-3 py-1.5" style={{ color: 'var(--color-text-primary)' }}>
                            <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{ji.account?.accountNumber}</span>{' '}
                            {ji.account?.name}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: Number(ji.debit) > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                            {Number(ji.debit) > 0 ? formatRupiah(Number(ji.debit)) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: Number(ji.credit) > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                            {Number(ji.credit) > 0 ? formatRupiah(Number(ji.credit)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            {payment.notes && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>Catatan</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{payment.notes}</p>
              </div>
            )}

            {/* Attachments */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                <Paperclip size={12} /> Lampiran ({attachments.length})
              </h3>

              {/* Upload area */}
              {payment.status !== 'Cancelled' && (
                <div
                  className={cn(
                    'border-2 border-dashed rounded-lg p-4 text-center mb-3 transition-colors cursor-pointer',
                    dragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={18} className="mx-auto mb-1" style={{ color: 'var(--color-text-muted)' }} />
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {uploadMutation.isPending ? 'Mengunggah...' : 'Klik atau seret file ke sini'}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              )}

              {/* File list */}
              {attachments.length === 0 ? (
                <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>Belum ada lampiran.</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((a: any) => {
                    const isImage = a.mimeType?.startsWith('image/');
                    const Icon = isImage ? ImageIcon : FileText;
                    return (
                      <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
                        <Icon size={16} className={isImage ? 'text-purple-500' : 'text-blue-500'} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{a.originalName}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {(a.fileSize / 1024).toFixed(0)} KB
                          </p>
                        </div>
                        <a
                          href={`/api/attachments/file/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Unduh"
                        >
                          <Download size={14} style={{ color: 'var(--color-text-muted)' }} />
                        </a>
                        {payment.status !== 'Cancelled' && (
                          <button
                            onClick={() => deleteMutation.mutate(a.id)}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                            title="Hapus"
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {icon}
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}

export default PaymentDetailDrawer;

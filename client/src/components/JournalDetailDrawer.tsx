import { useQuery } from '@tanstack/react-query';
import {
  X, FileText, Calendar, User, Loader2,
  Paperclip, Image as ImageIcon, Download, ArrowRightLeft,
} from 'lucide-react';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';

interface Props {
  journalEntryId: string | null;
  onClose: () => void;
}

const statusConfig: Record<string, { label: string; badge: string }> = {
  Draft: { label: 'Draft', badge: 'badge badge-gray' },
  Submitted: { label: 'Aktif', badge: 'badge badge-blue' },
  Cancelled: { label: 'Dibatalkan', badge: 'badge badge-red' },
};

const JournalDetailDrawer: React.FC<Props> = ({ journalEntryId, onClose }) => {
  const { data: journal, isLoading } = useQuery({
    queryKey: ['journal-detail', journalEntryId],
    queryFn: async () => {
      const res = await api.get(`/journals/${journalEntryId}`);
      return res.data;
    },
    enabled: !!journalEntryId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['journal-attachments', journalEntryId],
    queryFn: async () => {
      const res = await api.get(`/attachments/journal/${journalEntryId}`);
      return res.data;
    },
    enabled: !!journalEntryId,
  });

  if (!journalEntryId) return null;

  const sc = journal ? statusConfig[journal.status] ?? statusConfig.Draft : statusConfig.Draft;

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
            <ArrowRightLeft size={20} className="text-blue-600" />
            <div>
              <h2 className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {journal?.entryNumber ?? 'Memuat...'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {journal && <span className={sc.badge}>{sc.label}</span>}
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
        ) : !journal ? (
          <div className="text-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            Jurnal tidak ditemukan.
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">

            {/* Narration */}
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-blue-600" />
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Jurnal Manual</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {journal.narration || '—'}
              </p>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoItem icon={<Calendar size={14} />} label="Tanggal" value={formatDate(journal.date)} />
              <InfoItem icon={<User size={14} />} label="Dibuat oleh" value={journal.user?.fullName ?? '—'} />
            </div>

            {/* Journal Items */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Detail Akun
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
                    {journal.items?.map((ji: any) => (
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

            {/* Attachments (read-only, upload dari sumber dokumen asal) */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                <Paperclip size={12} /> Lampiran ({attachments.length})
              </h3>
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

export default JournalDetailDrawer;

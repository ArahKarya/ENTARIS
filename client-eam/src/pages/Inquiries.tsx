import { useState, useMemo } from 'react';
import {
  Plus, Search, Loader2, ChevronLeft, ChevronRight,
  Inbox, FileSignature, MessageCircle, Phone, Mail, MapPin, Share2, QrCode,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatDate } from '../lib/formatters';
import InquiryModal from '../components/InquiryModal';
import InquiryDetailDrawer from '../components/InquiryDetailDrawer';
import InquiryQRModal from '../components/InquiryQRModal';
import Select from '../components/Select';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'Baru', label: 'Baru' },
  { value: 'Diproses', label: 'Diproses' },
  { value: 'Dikonversi', label: 'Dikonversi' },
  { value: 'Hilang', label: 'Hilang' },
  { value: 'Ditutup', label: 'Ditutup' },
];

const STATUS_BADGE: Record<string, string> = {
  Baru: 'badge-blue',
  Diproses: 'badge-yellow',
  Dikonversi: 'badge-green',
  Hilang: 'badge-red',
  Ditutup: 'badge-gray',
};

const CHANNEL_ICON: Record<string, any> = {
  WhatsApp: MessageCircle,
  Telepon: Phone,
  Email: Mail,
  WalkIn: MapPin,
  Referral: Share2,
  Lainnya: Inbox,
};
const CHANNEL_LABEL: Record<string, string> = {
  WhatsApp: 'WhatsApp', Telepon: 'Telepon', Email: 'Email', WalkIn: 'Walk-in', Referral: 'Referral', Lainnya: 'Lainnya',
};

const PAGE_SIZE = 20;

export const Inquiries = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['inquiries'],
    queryFn: async () => {
      const res = await api.get('/inquiries?limit=200');
      return res.data.data ?? res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!raw) return [];
    return raw.filter((q: any) => {
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const match = q.inquiryNumber?.toLowerCase().includes(s)
          || q.prospectName?.toLowerCase().includes(s)
          || q.party?.name?.toLowerCase().includes(s);
        if (!match) return false;
      }
      if (statusFilter && q.status !== statusFilter) return false;
      if (channelFilter && q.channel !== channelFilter) return false;
      return true;
    });
  }, [raw, searchTerm, statusFilter, channelFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    if (!raw) return { total: 0, baru: 0, diproses: 0, dikonversi: 0, conversionRate: 0 };
    let baru = 0, diproses = 0, dikonversi = 0;
    for (const q of raw) {
      if (q.status === 'Baru') baru++;
      else if (q.status === 'Diproses') diproses++;
      else if (q.status === 'Dikonversi') dikonversi++;
    }
    const conversionRate = raw.length > 0 ? Math.round((dikonversi / raw.length) * 100) : 0;
    return { total: raw.length, baru, diproses, dikonversi, conversionRate };
  }, [raw]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Inquiry</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pertanyaan calon customer / prospect sebelum penawaran resmi.</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => setIsQROpen(true)}
            className="btn-secondary"
            title="Generate QR untuk public form / share ke customer"
          >
            <QrCode size={15} /> QR Form
          </button>
          <button
            className="btn-primary"
            onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
          >
            <Plus size={15} /> Catat Inquiry
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total', value: summary.total, color: 'blue', icon: Inbox },
          { label: 'Baru', value: summary.baru, color: 'blue', icon: Inbox },
          { label: 'Dikonversi', value: summary.dikonversi, color: 'green', icon: FileSignature },
          { label: 'Conversion Rate', value: `${summary.conversionRate}%`, color: 'amber', icon: FileSignature },
        ].map((c) => (
          <div key={c.label} className="card px-4 py-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 bg-${c.color}-50 rounded-lg`}>
                <c.icon size={16} className={`text-${c.color}-600`} />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className="text-lg font-bold text-foreground">{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Cari nomor / nama prospect..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-full">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
          className="w-full">
          <option value="">Semua Channel</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {(searchTerm || statusFilter || channelFilter) && (
          <button onClick={() => { setSearchTerm(''); setStatusFilter(''); setChannelFilter(''); setPage(1); }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            Reset filter
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nomor</th>
                <th>Prospek / Customer</th>
                <th>Kontak</th>
                <th>Channel</th>
                <th className="text-center">Status</th>
                <th>Penawaran</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Memuat inquiry...
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    {raw?.length === 0 ? 'Belum ada inquiry.' : 'Tidak ada hasil filter.'}
                  </p>
                  {raw?.length === 0 && (
                    <button onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">+ Catat inquiry pertama</button>
                  )}
                </td></tr>
              ) : (
                paginated.map((q: any) => {
                  const ChannelIcon = CHANNEL_ICON[q.channel] ?? Inbox;
                  return (
                    <tr key={q.id} onClick={() => setSelectedId(q.id)} className="cursor-pointer">
                      <td className="text-muted-foreground whitespace-nowrap">{formatDate(q.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{q.inquiryNumber}</span>
                      </td>
                      <td>
                        <p className="font-medium text-foreground">{q.party?.name ?? q.prospectName}</p>
                        {q.party && q.prospectName !== q.party.name && (
                          <p className="text-xs text-muted-foreground">via {q.prospectName}</p>
                        )}
                        {!q.partyId && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-600">prospect</span>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {q.prospectPhone || q.party?.phone || '—'}
                        {(q.prospectEmail || q.party?.email) && (
                          <p className="opacity-70">{q.prospectEmail || q.party?.email}</p>
                        )}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ChannelIcon size={12} /> {CHANNEL_LABEL[q.channel] ?? q.channel}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn('badge', STATUS_BADGE[q.status] ?? 'badge-gray')}>{q.status}</span>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {q.quotation ? (
                          <span className="font-mono text-green-600">{q.quotation.quotationNumber}</span>
                        ) : <span>—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Sebelumnya">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs px-2 text-foreground">Hal {page} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Berikutnya">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <InquiryModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditTarget(null); }}
        editTarget={editTarget}
      />

      <InquiryQRModal
        isOpen={isQROpen}
        onClose={() => setIsQROpen(false)}
      />

      <InquiryDetailDrawer
        inquiryId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(q) => { setSelectedId(null); setEditTarget(q); setIsModalOpen(true); }}
      />
    </div>
  );
};

export default Inquiries;

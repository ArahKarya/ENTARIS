/**
 * Pertanyaan Pelanggan (/inquiries) — list kit page (see pages/SalesInvoices.tsx
 * for the reference pattern). Server-paginated list + KPI summary endpoint
 * with the same filters; detail, edit, status changes and "jadikan penawaran"
 * stay in InquiryDetailDrawer / InquiryModal.
 */
import { useId, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Eye, FileSignature, Globe, Inbox, Mail, MapPin, MessageCircle, Pencil, Percent, Phone, Plus, QrCode, Share2, type LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import InquiryModal from '@/components/InquiryModal';
import InquiryDetailDrawer from '@/components/InquiryDetailDrawer';
import InquiryQRModal from '@/components/InquiryQRModal';

interface InquiryRow {
  id: string;
  inquiryNumber: string;
  date: string;
  status: string;
  channel: string;
  partyId: string | null;
  prospectName: string;
  prospectPhone: string | null;
  prospectEmail: string | null;
  notes: string | null;
  party?: { id: string; name: string; phone: string | null; email: string | null } | null;
  quotation?: { id: string; quotationNumber: string; status: string } | null;
}

interface InquirySummary {
  count: number;
  newCount: number;
  inProgressCount: number;
  convertedCount: number;
  conversionRate: number;
}

const ENDPOINT = '/inquiries';
const FILTER_KEYS = ['status', 'channel', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Baru', 'Diproses', 'Dikonversi', 'Hilang', 'Ditutup'], 'inquiry');
const ALL = '__all__';

const CHANNELS: Record<string, { label: string; icon: LucideIcon }> = {
  WhatsApp: { label: 'WhatsApp', icon: MessageCircle },
  Telepon: { label: 'Telepon', icon: Phone },
  Email: { label: 'Email', icon: Mail },
  WalkIn: { label: 'Walk-in', icon: MapPin },
  Referral: { label: 'Referral', icon: Share2 },
  Lainnya: { label: 'Lainnya', icon: Inbox },
};

/** Set by POST /public/inquiry (self-service QR form). */
const PUBLIC_FORM_NOTE = 'Submitted via public form';
const isPublicForm = (q: InquiryRow) => !!q.notes?.startsWith(PUBLIC_FORM_NOTE);

const chip = 'inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[11px] font-medium leading-4';

function SourceChips({ inquiry }: { inquiry: InquiryRow }) {
  const prospect = !inquiry.partyId;
  const publicForm = isPublicForm(inquiry);
  if (!prospect && !publicForm) return null;
  return (
    <span className="flex flex-wrap gap-1 group-data-[density=compact]/table:hidden">
      {prospect && <span className={`${chip} bg-warning-subtle text-warning-text`}>Prospek</span>}
      {publicForm && (
        <span className={`${chip} bg-info-subtle text-info-text`} title="Masuk lewat formulir publik (QR)">
          <Globe className="size-3" aria-hidden />
          Form publik
        </span>
      )}
    </span>
  );
}

function ChannelFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-40">
      <label htmlFor={id} className="sr-only">
        Channel
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Semua channel</SelectItem>
          {Object.entries(CHANNELS).map(([key, c]) => (
            <SelectItem key={key} value={key}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const Inquiries = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InquiryRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canEdit = can('quotation', 'edit');

  const inquiriesQuery = useQuery({
    queryKey: ['inquiries', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<InquiryRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['inquiries', 'summary', list.filterParams],
    queryFn: async () => (await api.get<InquirySummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = inquiriesQuery.data?.total;
  const summary = summaryQuery.data;
  // On error the cards fall back to '-' instead of an endless skeleton.
  const summaryLoading = !summary && !summaryQuery.isError;

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const columns = useMemo<ColumnDef<InquiryRow>[]>(
    () => [
      {
        id: 'inquiryNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.inquiryNumber}</DocumentLink>
            {/* Mobile: prospect stacked here because its column is hidden. */}
            <span className="max-w-48 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.party?.name ?? row.original.prospectName}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'prospectName',
        header: 'Prospek / Pelanggan',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-72' },
        cell: ({ row }) => {
          const q = row.original;
          const name = q.party?.name ?? q.prospectName;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <p className="max-w-full truncate font-medium text-foreground">{name}</p>
              {q.party && q.prospectName !== q.party.name && (
                <p className="max-w-full truncate text-xs text-muted-foreground">via {q.prospectName}</p>
              )}
              <SourceChips inquiry={q} />
            </div>
          );
        },
      },
      {
        id: 'contact',
        header: 'Kontak',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-56' },
        cell: ({ row }) => {
          const q = row.original;
          const phone = q.prospectPhone || q.party?.phone;
          const email = q.prospectEmail || q.party?.email;
          if (!phone && !email) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="min-w-0 text-xs text-muted-foreground">
              {phone && <p className="num truncate">{phone}</p>}
              {email && <p className="truncate group-data-[density=compact]/table:hidden">{email}</p>}
            </div>
          );
        },
      },
      {
        id: 'channel',
        header: 'Channel',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const c = CHANNELS[row.original.channel];
          const Icon = c?.icon ?? Inbox;
          return (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {c?.label ?? row.original.channel}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="inquiry" />,
      },
      {
        id: 'quotation',
        header: 'Penawaran',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.quotation ? (
            <span className="num font-mono text-xs text-success-text">{row.original.quotation.quotationNumber}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${q.inquiryNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(q.id) },
                {
                  label: 'Edit',
                  icon: Pencil,
                  hidden: !canEdit || q.status === 'Dikonversi',
                  onSelect: () => {
                    setEditTarget(q);
                    setIsModalOpen(true);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Pertanyaan Pelanggan"
        description="Pertanyaan calon pelanggan / prospek sebelum penawaran resmi."
        actions={
          <>
            <Button variant="outline" onClick={() => setIsQROpen(true)} title="Buat QR untuk formulir publik">
              <QrCode aria-hidden />
              <span className="sr-only sm:not-sr-only">QR Form</span>
            </Button>
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                Catat Pertanyaan
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Ringkasan pertanyaan sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Pertanyaan"
          icon={Inbox}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint={summary ? `${formatNumber(summary.inProgressCount)} sedang diproses` : undefined}
        />
        <StatCard
          label="Baru"
          icon={Inbox}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.newCount) : '-'}
          hint="belum ditindaklanjuti"
        />
        <StatCard
          label="Dikonversi"
          icon={CheckCircle2}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.convertedCount) : '-'}
          hint="jadi penawaran"
        />
        <StatCard
          label="Tingkat Konversi"
          icon={Percent}
          loading={summaryLoading}
          value={summary ? formatPercent(summary.conversionRate) : '-'}
          hint="dari semua pertanyaan"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pertanyaan"
          searchPlaceholder="Cari nomor, prospek, atau pelanggan"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <ChannelFilter value={list.filters.channel} onChange={(v) => list.setFilter('channel', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar pertanyaan pelanggan"
          itemLabel="pertanyaan"
          columns={columns}
          data={inquiriesQuery.data?.data}
          getRowId={(row) => row.id}
          loading={inquiriesQuery.isLoading}
          fetching={inquiriesQuery.isFetching && inquiriesQuery.isPlaceholderData}
          error={inquiriesQuery.error}
          onRetry={() => inquiriesQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada pertanyaan pelanggan',
            description: 'Catat pertanyaan dari WhatsApp, telepon, atau bagikan QR formulir publik.',
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <FileSignature aria-hidden />
                Catat pertanyaan pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <InquiryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditTarget(null);
        }}
        editTarget={editTarget}
      />

      <InquiryQRModal isOpen={isQROpen} onClose={() => setIsQROpen(false)} />

      <InquiryDetailDrawer
        inquiryId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(q) => {
          setSelectedId(null);
          setEditTarget(q);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default Inquiries;

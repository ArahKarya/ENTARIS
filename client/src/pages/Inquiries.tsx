/** Customer inquiries (/inquiries); detail, edit, status changes and conversion live in InquiryDetailDrawer / InquiryModal. */
import { useId, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Eye, FileSignature, Globe, Inbox, Mail, MapPin, MessageCircle, Pencil, Percent, Phone, Plus, QrCode, Share2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
const statusFilter = () => statusOptions(['Baru', 'Diproses', 'Dikonversi', 'Hilang', 'Ditutup'], 'inquiry');
const ALL = '__all__';

/** Channel enum values from the API; labels come from inquiriesPage.channels.<value>. */
const CHANNELS = {
  WhatsApp: MessageCircle,
  Telepon: Phone,
  Email: Mail,
  WalkIn: MapPin,
  Referral: Share2,
  Lainnya: Inbox,
} as const satisfies Record<string, LucideIcon>;
type Channel = keyof typeof CHANNELS;
const CHANNEL_KEYS = Object.keys(CHANNELS) as Channel[];
const isChannel = (value: string): value is Channel => Object.hasOwn(CHANNELS, value);

/** Set by POST /public/inquiry (self-service QR form). */
const PUBLIC_FORM_NOTE = 'Submitted via public form';
const isPublicForm = (q: InquiryRow) => !!q.notes?.startsWith(PUBLIC_FORM_NOTE);

const chip = 'inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[11px] font-medium leading-4';

function SourceChips({ inquiry }: { inquiry: InquiryRow }) {
  const { t } = useTranslation('sales');
  const prospect = !inquiry.partyId;
  const publicForm = isPublicForm(inquiry);
  if (!prospect && !publicForm) return null;
  return (
    <span className="flex flex-wrap gap-1 group-data-[density=compact]/table:hidden">
      {prospect && <span className={`${chip} bg-warning-subtle text-warning-text`}>{t('inquiriesPage.chips.prospect')}</span>}
      {publicForm && (
        <span className={`${chip} bg-info-subtle text-info-text`} title={t('inquiriesPage.chips.publicFormTitle')}>
          <Globe className="size-3" aria-hidden />
          {t('inquiriesPage.chips.publicForm')}
        </span>
      )}
    </span>
  );
}

function ChannelFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation('sales');
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-40">
      <label htmlFor={id} className="sr-only">
        {t('inquiriesPage.channelFilter.label')}
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('inquiriesPage.channelFilter.all')}</SelectItem>
          {CHANNEL_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {t(`inquiriesPage.channels.${key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export const Inquiries = () => {
  const { t } = useTranslation('sales');
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
  // On error the cards fall back to '—' instead of an endless skeleton.
  const summaryLoading = !summary && !summaryQuery.isError;

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const columns = useMemo<ColumnDef<InquiryRow>[]>(
    () => [
      {
        id: 'inquiryNumber',
        header: t('inquiriesPage.columns.number'),
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
        header: t('inquiriesPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'prospectName',
        header: t('inquiriesPage.columns.prospect'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-72' },
        cell: ({ row }) => {
          const q = row.original;
          const name = q.party?.name ?? q.prospectName;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <p className="max-w-full truncate font-medium text-foreground">{name}</p>
              {q.party && q.prospectName !== q.party.name && (
                <p className="max-w-full truncate text-xs text-muted-foreground">{t('inquiriesPage.via', { name: q.prospectName })}</p>
              )}
              <SourceChips inquiry={q} />
            </div>
          );
        },
      },
      {
        id: 'contact',
        header: t('inquiriesPage.columns.contact'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-56' },
        cell: ({ row }) => {
          const q = row.original;
          const phone = q.prospectPhone || q.party?.phone;
          const email = q.prospectEmail || q.party?.email;
          if (!phone && !email) return <span className="text-muted-foreground">—</span>;
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
        header: t('inquiriesPage.columns.channel'),
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const channel = row.original.channel;
          const known = isChannel(channel);
          const Icon = known ? CHANNELS[channel] : Inbox;
          return (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {known ? t(`inquiriesPage.channels.${channel}`) : channel}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: t('inquiriesPage.columns.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="inquiry" />,
      },
      {
        id: 'quotation',
        header: t('inquiriesPage.columns.quotation'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.quotation ? (
            <span className="num font-mono text-xs text-success-text">{row.original.quotation.quotationNumber}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('inquiriesPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <RowActions
              label={t('inquiriesPage.rowActions.label', { number: q.inquiryNumber })}
              actions={[
                { label: t('inquiriesPage.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(q.id) },
                {
                  label: t('inquiriesPage.rowActions.edit'),
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
    [canEdit, t],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('inquiriesPage.title')}
        description={t('inquiriesPage.description')}
        actions={
          <>
            <Button variant="outline" onClick={() => setIsQROpen(true)} title={t('inquiriesPage.qrButtonTitle')}>
              <QrCode aria-hidden />
              <span className="sr-only sm:not-sr-only">{t('inquiriesPage.qrButton')}</span>
            </Button>
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                {t('inquiriesPage.create')}
              </Button>
            )}
          </>
        }
      />

      <section aria-label={t('inquiriesPage.stats.regionLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('inquiriesPage.stats.count')}
          icon={Inbox}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={summary ? t('inquiriesPage.stats.inProgress', { count: summary.inProgressCount, formatted: formatNumber(summary.inProgressCount) }) : undefined}
        />
        <StatCard
          label={t('inquiriesPage.stats.new')}
          icon={Inbox}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.newCount) : '—'}
          hint={t('inquiriesPage.stats.newHint')}
        />
        <StatCard
          label={t('inquiriesPage.stats.converted')}
          icon={CheckCircle2}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.convertedCount) : '—'}
          hint={t('inquiriesPage.stats.convertedHint')}
        />
        <StatCard
          label={t('inquiriesPage.stats.conversionRate')}
          icon={Percent}
          loading={summaryLoading}
          value={summary ? formatPercent(summary.conversionRate) : '—'}
          hint={t('inquiriesPage.stats.conversionRateHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('inquiriesPage.search.label')}
          searchPlaceholder={t('inquiriesPage.search.placeholder')}
          status={{ options: statusFilter() }}
          dateRange
        >
          <ChannelFilter value={list.filters.channel} onChange={(v) => list.setFilter('channel', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label={t('inquiriesPage.table.label')}
          itemLabel={t('inquiriesPage.table.itemLabel')}
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
            title: t('inquiriesPage.empty.title'),
            description: t('inquiriesPage.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <FileSignature aria-hidden />
                {t('inquiriesPage.empty.action')}
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

/**
 * Laporan PO Outstanding — open POs (ordered, not short-closed) per line:
 * ordered / received / remaining qty and remaining value (net of discount,
 * incl. line PPN). Filters: supplier, warehouse, PO date range, overdue only.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, ClipboardList, Package, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput, PartyFilter } from '@/components/shared';
import { WarehouseFilter } from '@/components/overlays/WarehouseFilter';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilterSection,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  type DataColumn,
} from '@/components/report-kit';

interface OutstandingRow {
  poId: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string | null;
  supplierName: string;
  warehouseName: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  itemId: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
  unitValue: number;
  remainingValue: number;
}

interface OutstandingData {
  rows: OutstandingRow[];
  summary: { poCount: number; lineCount: number; remainingValue: number; overduePoCount: number };
}

const qty = (n: number) => formatNumber(n, { maxDecimals: 3 });

const columns = (t: TFunction<'reports'>): DataColumn<OutstandingRow>[] => [
  { key: 'po', header: t('poOutstanding.cols.poNo'), rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (r) => r.poNumber },
  { key: 'supplier', header: t('dailyReport.cols.supplier'), render: (r) => r.supplierName },
  {
    key: 'item',
    header: t('dailyReport.cols.item'),
    render: (r) => (
      <>
        <span>{r.itemName}</span>
        {r.warehouseName && <span className="block text-xs text-muted-foreground">{r.warehouseName}</span>}
      </>
    ),
  },
  {
    key: 'eta',
    header: t('poOutstanding.cols.eta'),
    className: 'whitespace-nowrap text-xs',
    render: (r) => (
      <>
        {r.expectedDeliveryDate ? formatDate(r.expectedDeliveryDate) : '—'}
        {r.isOverdue && (
          <span className="mt-0.5 flex items-center gap-1 font-medium text-danger-text">
            <AlertTriangle className="size-3" aria-hidden /> {t('poOutstanding.lateDays', { count: r.daysOverdue })}
          </span>
        )}
      </>
    ),
  },
  { key: 'ordered', header: t('poOutstanding.cols.ordered'), numeric: true, className: 'whitespace-nowrap', render: (r) => `${qty(r.ordered)} ${r.unit}` },
  { key: 'received', header: t('poOutstanding.cols.received'), numeric: true, className: 'whitespace-nowrap', render: (r) => qty(r.received) },
  { key: 'remaining', header: t('poOutstanding.cols.remaining'), numeric: true, className: 'whitespace-nowrap font-medium', render: (r) => qty(r.remaining) },
  {
    key: 'value',
    header: t('poOutstanding.cols.remainingValueRp'),
    numeric: true,
    className: 'whitespace-nowrap font-medium',
    render: (r) => formatRupiah(r.remainingValue, { symbol: false }),
  },
];

export default function PoOutstanding() {
  const { t } = useTranslation('reports');
  const overdueId = useId();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const params = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partyId: partyId || undefined,
    warehouseId: warehouseId || undefined,
    overdue: overdueOnly ? '1' : undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery<OutstandingData>({
    queryKey: ['report-po-outstanding', params],
    queryFn: async () => (await api.get('/reports/po-outstanding', { params })).data,
  });
  const rows = data?.rows ?? [];

  const handleExport = () => {
    exportToExcel(
      rows.map((r) => ({
        [t('poOutstanding.cols.poNo')]: r.poNumber,
        [t('poOutstanding.excel.poDate')]: r.date,
        [t('poOutstanding.cols.eta')]: r.expectedDeliveryDate ?? '',
        [t('dailyReport.cols.supplier')]: r.supplierName,
        [t('poOutstanding.excel.warehouse')]: r.warehouseName ?? '',
        [t('dailyReport.cols.item')]: r.itemName,
        [t('poOutstanding.excel.unit')]: r.unit,
        [t('poOutstanding.excel.qtyOrdered')]: r.ordered,
        [t('poOutstanding.excel.qtyReceived')]: r.received,
        [t('poOutstanding.excel.qtyRemaining')]: r.remaining,
        [t('poOutstanding.excel.unitNet')]: r.unitValue,
        [t('poOutstanding.cols.remainingValueRp')]: r.remainingValue,
        [t('poOutstanding.excel.late')]: r.isOverdue ? t('poOutstanding.excel.lateYes', { count: r.daysOverdue }) : t('poOutstanding.excel.lateNo'),
      })),
      `PO-Outstanding-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const counts = (n: number | undefined) => formatNumber(n ?? 0);
  const rangeInvalid = !!startDate && !!endDate && startDate > endDate;

  return (
    <ReportPage
      title={t('poOutstanding.title')}
      description={t('poOutstanding.description')}
      period={
        startDate || endDate
          ? t('poOutstanding.periodRange', {
              start: startDate ? formatDate(startDate) : t('poOutstanding.periodStart'),
              end: endDate ? formatDate(endDate) : t('poOutstanding.periodEnd'),
            })
          : t('poOutstanding.periodAll')
      }
      actions={<ExportMenu onExcel={handleExport} disabled={isLoading || isError} />}
      filters={
        <ReportFilterSection>
          <div className="grid gap-1.5">
            <Label htmlFor="po-start">{t('poOutstanding.fromDate')}</Label>
            <DateInput id="po-start" className="w-40 max-sm:min-w-36" value={startDate} onChange={setStartDate} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="po-end">{t('kit.filters.endDate')}</Label>
            <DateInput id="po-end" className="w-40 max-sm:min-w-36" value={endDate} onChange={setEndDate} />
          </div>
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              className="max-sm:h-11"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
            >
              {t('poOutstanding.clearDates')}
            </Button>
          )}
          <PartyFilter partyType="Supplier" value={partyId} onChange={setPartyId} />
          <div className="w-full sm:w-56">
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} />
          </div>
          <label htmlFor={overdueId} className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              id={overdueId}
              type="checkbox"
              className="size-4 accent-[var(--primary)]"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            {t('poOutstanding.overdueOnly')}
          </label>
          {rangeInvalid && (
            <p role="alert" className="basis-full text-xs text-danger-text">
              {t('poOutstanding.invalidRange')}
            </p>
          )}
        </ReportFilterSection>
      }
      summary={
        <ReportSummaryCards
          loading={isLoading}
          items={[
            { label: t('poOutstanding.summary.remainingValue'), value: data?.summary.remainingValue ?? 0, icon: Wallet, tone: 'neutral' },
            { label: t('poOutstanding.summary.openPo'), value: data?.summary.poCount ?? 0, formatted: counts(data?.summary.poCount), icon: ClipboardList },
            { label: t('poOutstanding.summary.lines'), value: data?.summary.lineCount ?? 0, formatted: counts(data?.summary.lineCount), icon: Package },
            {
              label: t('poOutstanding.summary.latePo'),
              value: data?.summary.overduePoCount ?? 0,
              formatted: counts(data?.summary.overduePoCount),
              icon: AlertTriangle,
              tone: (data?.summary.overduePoCount ?? 0) > 0 ? 'negative' : 'neutral',
            },
          ]}
        />
      }
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={() => refetch()}>
        <ReportDataTable
          caption={t('poOutstanding.caption')}
          columns={columns(t)}
          rows={rows}
          emptyText={t('poOutstanding.empty')}
          getRowKey={(r) => `${r.poId}-${r.itemId}`}
        />
      </ReportState>
    </ReportPage>
  );
}

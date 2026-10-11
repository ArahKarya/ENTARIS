import { Factory, Truck, ShoppingCart, Warehouse as WarehouseIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReportDataTable, ReportMetricGrid, ReportSection, type DataColumn } from '@/components/report-kit';
import type { DailyData, ProductionRun, StockItem, TradeInvoice } from './types';

const qty = (n: number) => formatNumber(n, { maxDecimals: 3 });
const rp = (n: number) => formatRupiah(n);

type T = TFunction<'reports'>;

function invoiceColumns(t: T, party: 'customer' | 'supplier'): DataColumn<TradeInvoice>[] {
  return [
    { key: 'no', header: t('dailyReport.cols.invoiceNo'), rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (i) => i.invoiceNumber },
    { key: 'party', header: party === 'customer' ? t('dailyReport.cols.customer') : t('dailyReport.cols.supplier'), render: (i) => (party === 'customer' ? i.customerName : i.supplierName) },
    { key: 'items', header: t('dailyReport.cols.item'), className: 'text-muted-foreground', hideBelowSm: true, render: (i) => i.items.map((x) => x.itemName).join(', ') },
    { key: 'qty', header: t('dailyReport.cols.qty'), numeric: true, render: (i) => qty(i.totalQty) },
    { key: 'total', header: t('reportsShared.total'), numeric: true, className: 'whitespace-nowrap', render: (i) => rp(i.grandTotal) },
    { key: 'out', header: party === 'customer' ? t('dailyReport.cols.remainingAr') : t('dailyReport.cols.remainingAp'), numeric: true, className: 'whitespace-nowrap', render: (i) => rp(i.outstanding) },
  ];
}

export function SalesSection({ data }: { data: DailyData['sales'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.sales.title')} icon={ShoppingCart} count={s.count}>
      <ReportMetricGrid
        label={t('dailyReport.sales.summary')}
        className="mb-4"
        items={[
          { label: t('dailyReport.invoiceCount'), value: s.count },
          { label: t('dailyReport.totalQty'), value: `${qty(s.totalQty)} kg` },
          { label: t('dailyReport.sales.revenue'), value: rp(s.totalRevenue) },
          { label: t('dailyReport.sales.newAr'), value: rp(s.totalNewReceivables) },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.sales.caption')} columns={invoiceColumns(t, 'customer')} rows={data.invoices} getRowKey={(i) => i.invoiceNumber} emptyText={t('dailyReport.sales.empty')} maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

export function PurchasesSection({ data }: { data: DailyData['purchases'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.purchases.title')} icon={Truck} count={s.count}>
      <ReportMetricGrid
        label={t('dailyReport.purchases.summary')}
        className="mb-4"
        items={[
          { label: t('dailyReport.invoiceCount'), value: s.count },
          { label: t('dailyReport.totalQty'), value: `${qty(s.totalQty)} kg` },
          { label: t('dailyReport.purchases.spend'), value: rp(s.totalSpend) },
          { label: t('dailyReport.purchases.newAp'), value: rp(s.totalNewPayables) },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.purchases.caption')} columns={invoiceColumns(t, 'supplier')} rows={data.invoices} getRowKey={(i) => i.invoiceNumber} emptyText={t('dailyReport.purchases.empty')} maxHeightClass="max-h-96" />
    </ReportSection>
  );
}

const runColumns = (t: T): DataColumn<ProductionRun>[] => [
  { key: 'no', header: t('dailyReport.production.cols.runNo'), rowHeader: true, className: 'whitespace-nowrap font-mono text-xs', render: (r) => r.runNumber },
  { key: 'in', header: t('dailyReport.production.cols.input'), render: (r) => r.inputs.map((i) => `${i.itemName} (${qty(i.quantity)} ${i.unit})`).join(', ') },
  {
    key: 'out',
    header: t('dailyReport.production.cols.output'),
    render: (r) => r.outputs.map((o) => `${o.itemName} (${qty(o.quantity)} ${o.unit})${o.isByProduct ? ' *' : ''}`).join(', '),
  },
  { key: 'yield', header: t('dailyReport.production.cols.yield'), numeric: true, render: (r) => (r.yieldPct ? `${r.yieldPct}%` : '—') },
];

export function ProductionSection({ data }: { data: DailyData['production'] }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  return (
    <ReportSection title={t('dailyReport.production.title')} icon={Factory} count={s.totalRuns}>
      <ReportMetricGrid
        label={t('dailyReport.production.summary')}
        className="mb-4"
        items={[
          { label: t('dailyReport.production.runCount'), value: s.totalRuns },
          { label: t('dailyReport.production.totalInput'), value: `${qty(s.totalInputKg)} kg` },
          { label: t('dailyReport.production.totalOutput'), value: `${qty(s.totalOutputKg)} kg` },
          { label: t('dailyReport.production.avgYield'), value: s.avgYield > 0 ? `${s.avgYield}%` : '—' },
        ]}
      />
      <ReportDataTable caption={t('dailyReport.production.caption')} columns={runColumns(t)} rows={data.runs} getRowKey={(r) => r.runNumber} emptyText={t('dailyReport.production.empty')} maxHeightClass="max-h-96" />
      {data.runs.some((r) => r.outputs.some((o) => o.isByProduct)) && (
        <p className="mt-2 text-xs text-muted-foreground">{t('dailyReport.production.byProductNote')}</p>
      )}
    </ReportSection>
  );
}

const stockColumns = (t: T): DataColumn<StockItem>[] => [
  { key: 'code', header: t('dailyReport.stock.cols.code'), className: 'whitespace-nowrap font-mono text-xs', render: (i) => i.code },
  { key: 'name', header: t('dailyReport.stock.cols.name'), rowHeader: true, render: (i) => i.name },
  { key: 'unit', header: t('dailyReport.stock.cols.unit'), className: 'text-muted-foreground', render: (i) => i.unit },
  {
    key: 'qty',
    header: t('dailyReport.stock.cols.stock'),
    numeric: true,
    className: (i) => cn('font-semibold', i.qty < 0 && 'text-danger-text'),
    render: (i) => formatNumber(i.qty, { maxDecimals: 3 }),
  },
  {
    key: 'avg',
    header: t('dailyReport.stock.cols.avgCost'),
    numeric: true,
    className: 'text-muted-foreground',
    render: (i) => (i.averageCost > 0 ? formatNumber(i.averageCost) : '—'),
  },
  {
    key: 'value',
    header: t('dailyReport.stock.cols.value'),
    numeric: true,
    className: (i) => cn('whitespace-nowrap', i.value < 0 && 'text-danger-text'),
    render: (i) => (i.value !== 0 ? formatRupiah(i.value, { negative: 'parens' }) : '—'),
  },
];

export function StockSection({ data }: { data: NonNullable<DailyData['stock']> }) {
  const { t } = useTranslation('reports');
  const s = data.summary;
  const warehouses = data.warehouses.filter((w) => w.items.length > 0);
  return (
    <ReportSection title={t('dailyReport.stock.title')} icon={WarehouseIcon} count={s.totalWarehouses}>
      <ReportMetricGrid
        label={t('dailyReport.stock.summary')}
        items={[
          { label: t('dailyReport.stock.warehouseCount'), value: s.totalWarehouses },
          { label: t('dailyReport.stock.itemLines'), value: s.totalItemLines },
          { label: t('dailyReport.stock.negative'), value: s.totalNegative, valueClassName: s.totalNegative > 0 ? 'text-danger-text' : undefined },
          { label: t('dailyReport.stock.totalValue'), value: rp(s.grandTotalValue) },
        ]}
      />
      <p className="mb-4 mt-2 text-xs italic text-muted-foreground">{data.valuationNote}</p>
      {data.warehouses.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{t('dailyReport.stock.empty')}</p>
      ) : (
        <div className="space-y-4">
          {warehouses.map((w) => (
            <div key={w.code}>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3">
                <h3 className="text-xs font-semibold text-foreground">
                  {w.code} · {w.name}
                  {w.isDefault ? ` ${t('dailyReport.stock.default')}` : ''}
                  <span className="font-normal text-muted-foreground"> · {t('dailyReport.stock.itemCount', { count: w.itemCount })}</span>
                </h3>
                <p className="num text-xs font-semibold text-foreground">{rp(w.totalValue)}</p>
              </div>
              <ReportDataTable
                caption={t('dailyReport.stock.caption', { code: w.code, name: w.name })}
                columns={stockColumns(t)}
                rows={w.items}
                getRowKey={(i) => `${w.code}-${i.code}`}
                maxHeightClass="max-h-80"
              />
            </div>
          ))}
        </div>
      )}
    </ReportSection>
  );
}

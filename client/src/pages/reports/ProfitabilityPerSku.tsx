import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Calculator, Coins, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ExportMenu,
  ReportDataTable,
  ReportFilterSection,
  ReportFilters,
  ReportNotice,
  ReportPage,
  ReportState,
  ReportSummaryCards,
  periodLabel,
  toIso,
  useReportRange,
  type DataColumn,
  type SummaryItem,
} from '@/components/report-kit';

interface ItemRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  materialCogs: number;
  loadedCogs: number;
  materialMargin: number;
  loadedMargin: number;
  materialMarginPct: number;
  loadedMarginPct: number;
  linesWithBatch: number;
  totalLines: number;
  coveragePct: number;
}

interface ReportData {
  period: { start: string; end: string };
  items: ItemRow[];
  summary: {
    totalRevenue: number;
    totalMaterialCogs: number;
    totalLoadedCogs: number;
    materialGrossProfit: number;
    loadedGrossProfit: number;
    materialMarginPct: number;
    loadedMarginPct: number;
  };
}

type MarginBasis = 'material' | 'loaded' | 'both';

const BASIS_OPTIONS: readonly MarginBasis[] = ['both', 'material', 'loaded'];

const LOADED_CELL = 'bg-info-subtle/40';

const marginTone = (pct: number) => (pct >= 20 ? 'text-success-text' : pct >= 0 ? 'text-warning-text' : 'text-danger-text');

function MarginCell({ pct, amount }: { pct: number; amount: number }) {
  return (
    <>
      <span className={cn('inline-flex items-center justify-end gap-1', marginTone(pct))}>
        {pct >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
        {pct}%
      </span>
      <div className="text-xs text-muted-foreground">{formatRupiah(amount, { symbol: false, negative: 'parens' })}</div>
    </>
  );
}

function coverageClass(pct: number): string {
  if (pct === 100) return 'bg-success-subtle text-success-text';
  if (pct >= 50) return 'bg-warning-subtle text-warning-text';
  return 'bg-neutral-subtle text-neutral-text';
}

function buildColumns(t: TFunction<'reports'>, showMaterial: boolean, showLoaded: boolean): DataColumn<ItemRow>[] {
  const cols: DataColumn<ItemRow>[] = [
    { key: 'code', header: t('hppReport.cols.code'), className: 'whitespace-nowrap font-mono text-xs', render: (r) => r.itemCode },
    { key: 'name', header: t('hppReport.cols.product'), rowHeader: true, render: (r) => r.itemName },
    { key: 'qty', header: t('dailyReport.cols.qty'), numeric: true, render: (r) => formatNumber(r.totalQty) },
    { key: 'revenue', header: t('hppReport.cols.revenue'), numeric: true, render: (r) => formatRupiah(r.totalRevenue, { symbol: false }) },
  ];
  if (showMaterial) {
    cols.push(
      { key: 'matCogs', header: t('profitabilityPerSku.materialCogs'), numeric: true, render: (r) => formatRupiah(r.materialCogs, { symbol: false }) },
      { key: 'matMargin', header: t('profitabilityPerSku.materialMargin'), numeric: true, render: (r) => <MarginCell pct={r.materialMarginPct} amount={r.materialMargin} /> },
    );
  }
  if (showLoaded) {
    cols.push(
      { key: 'loadCogs', header: t('profitabilityPerSku.loadedCogs'), numeric: true, className: LOADED_CELL, render: (r) => formatRupiah(r.loadedCogs, { symbol: false }) },
      { key: 'loadMargin', header: t('profitabilityPerSku.loadedMargin'), numeric: true, className: LOADED_CELL, render: (r) => <MarginCell pct={r.loadedMarginPct} amount={r.loadedMargin} /> },
    );
  }
  cols.push({
    key: 'coverage',
    header: t('profitabilityPerSku.coverage'),
    numeric: true,
    render: (r) => (
      <span className={cn('inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium', coverageClass(r.coveragePct))}>
        {r.coveragePct}% ({r.linesWithBatch}/{r.totalLines})
      </span>
    ),
  });
  return cols;
}

export default function ProfitabilityPerSku() {
  const { t } = useTranslation('reports');
  const now = new Date();
  const { startDate, endDate, setRange } = useReportRange({ startDate: `${now.getFullYear()}-01-01`, endDate: toIso(now) });
  const [basis, setBasis] = useState<MarginBasis>('both');

  const { data, isLoading, isError, refetch } = useQuery<ReportData>({
    queryKey: ['report-profitability-per-sku', startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/reports/profitability-per-sku', { params: { startDate, endDate } });
      return res.data;
    },
  });

  const showMaterial = basis === 'material' || basis === 'both';
  const showLoaded = basis === 'loaded' || basis === 'both';
  const s = data?.summary;

  const cards: SummaryItem[] = [{ label: t('profitLoss.totalRevenue'), value: s?.totalRevenue ?? 0, icon: Wallet, tone: 'neutral' }];
  if (showMaterial) {
    cards.push(
      { label: t('profitabilityPerSku.materialCogsWac'), value: s?.totalMaterialCogs ?? 0, icon: Coins, tone: 'neutral' },
      { label: t('profitabilityPerSku.materialMargin'), value: s?.materialGrossProfit ?? 0, icon: TrendingUp, hint: t('profitabilityPerSku.ofRevenue', { pct: s?.materialMarginPct ?? 0 }) },
    );
  }
  if (showLoaded) {
    cards.push(
      { label: t('profitabilityPerSku.loadedCogs'), value: s?.totalLoadedCogs ?? 0, icon: Calculator, tone: 'neutral' },
      { label: t('profitabilityPerSku.loadedMargin'), value: s?.loadedGrossProfit ?? 0, icon: TrendingUp, hint: t('profitabilityPerSku.ofRevenue', { pct: s?.loadedMarginPct ?? 0 }) },
    );
  }

  return (
    <ReportPage
      title={t('profitabilityPerSku.title')}
      description={t('profitabilityPerSku.description')}
      period={periodLabel({ startDate, endDate })}
      actions={<ExportMenu disabled={isLoading || isError} />}
      filters={
        <div className="flex flex-col gap-3">
          <ReportNotice tone="info">
            <p className="font-medium">{t('profitabilityPerSku.notice.title')}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              <li><Trans t={t} i18nKey="profitabilityPerSku.notice.material" components={{ b: <strong /> }} /></li>
              <li><Trans t={t} i18nKey="profitabilityPerSku.notice.loaded" components={{ b: <strong /> }} /></li>
              <li><Trans t={t} i18nKey="profitabilityPerSku.notice.coverage" components={{ b: <strong /> }} /></li>
            </ul>
          </ReportNotice>
          <ReportFilters mode="range" value={{ startDate, endDate }} onChange={setRange} />
          <ReportFilterSection>
            <div className="grid gap-1.5">
              <Label htmlFor="sku-basis">{t('profitabilityPerSku.basis')}</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as MarginBasis)}>
                <SelectTrigger id="sku-basis" className="w-full sm:w-72 max-sm:h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASIS_OPTIONS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`profitabilityPerSku.basisOptions.${k}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </ReportFilterSection>
        </div>
      }
      summary={<ReportSummaryCards loading={isLoading} items={cards} />}
    >
      <ReportState isLoading={isLoading} isError={isError} isEmpty={!!data && data.items.length === 0} onRetry={() => refetch()}>
        <ReportDataTable
          caption={t('profitabilityPerSku.caption', { period: periodLabel({ startDate, endDate }) })}
          columns={buildColumns(t, showMaterial, showLoaded)}
          rows={data?.items ?? []}
          getRowKey={(r) => r.itemId}
        />
      </ReportState>
    </ReportPage>
  );
}

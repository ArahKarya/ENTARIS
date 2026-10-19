/** Read-only detail of one stock opname session, with PDF and cancel. */
import { useQuery } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingState, PageHeader, StatCard, StatusBadge } from '@/components/shared';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import StockOpnamePDF from '@/lib/pdf/StockOpnamePDF';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';

type Num = string | number;

interface OpnameDetailLine {
  id: string;
  systemStock: Num;
  actualStock: Num;
  difference: Num;
  unitCost: Num;
  totalValue: Num;
  item: { id: string; code: string; name: string; unit: string };
}

export interface OpnameDetail {
  id: string;
  opnameNumber: string;
  date: string;
  status: string;
  notes: string | null;
  createdBy?: { fullName: string } | null;
  warehouse?: { id: string; code: string; name: string } | null;
  items: OpnameDetailLine[];
}

/** "Gudang X · Dibuat oleh Y", skipping parts that are missing. */
function headerDescription(detail: OpnameDetail, t: TFunction<'inventory'>): string | undefined {
  const parts = [
    detail.warehouse ? t('stockOpnameDetailView.header.warehouse', { name: detail.warehouse.name }) : null,
    detail.createdBy?.fullName ? t('stockOpnameDetailView.header.createdBy', { name: detail.createdBy.fullName }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

const qty = (v: Num) => formatNumber(v, { maxDecimals: 3 });
const num = (v: Num) => toNumber(v) ?? 0;

interface Props {
  id: string;
  /** Breadcrumb node leading back to the list (keeps the list filters). */
  breadcrumb: React.ReactNode;
  canCancel: boolean;
  onCancel: (opname: { id: string; opnameNumber: string }) => void;
}

export function StockOpnameDetailView({ id, breadcrumb, canCancel, onCancel }: Props) {
  const { t } = useTranslation('inventory');
  const companySettings = useCompanySettings();
  const detailQuery = useQuery({
    queryKey: ['stock-opname-detail', id],
    queryFn: async () => (await api.get<OpnameDetail>(`/stock-opname/${id}`)).data,
  });
  const detail = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-5 pb-8">
        <div className="sm:hidden">{breadcrumb}</div>
        <PageHeader title={t('stockOpnameDetailView.loading')} breadcrumb={breadcrumb} />
        <LoadingState label={t('stockOpnameDetailView.loading')} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-5 pb-8">
        <div className="sm:hidden">{breadcrumb}</div>
        <PageHeader title={t('stockOpnameDetailView.notFound')} breadcrumb={breadcrumb} />
        <EmptyState
          kind="error"
          title={t('stockOpnameDetailView.loadError.title')}
          description={t('stockOpnameDetailView.loadError.description')}
          action={
            <Button size="sm" variant="outline" onClick={() => detailQuery.refetch()}>
              {t('stockOpnameDetailView.loadError.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const itemsWithDiff = detail.items.filter((i) => num(i.difference) !== 0);
  const totalSurplus = detail.items.filter((i) => num(i.difference) > 0).reduce((s, i) => s + num(i.totalValue), 0);
  const totalDeficit = detail.items.filter((i) => num(i.difference) < 0).reduce((s, i) => s + num(i.totalValue), 0);

  return (
    <div className="space-y-5 pb-8">
      {/* PageHeader hides breadcrumbs below sm; keep a way back on phones. */}
      <div className="sm:hidden">{breadcrumb}</div>
      <PageHeader
        breadcrumb={breadcrumb}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="num">{detail.opnameNumber}</span>
            <StatusBadge status={detail.status} docType="stock_opname" />
          </span>
        }
        description={headerDescription(detail, t)}
        actions={
          <>
            <PDFDownloadButton
              document={
                <StockOpnamePDF
                  opnameNumber={detail.opnameNumber}
                  date={detail.date}
                  status={detail.status}
                  notes={detail.notes}
                  createdBy={detail.createdBy?.fullName}
                  items={itemsWithDiff.map((i) => ({
                    code: i.item.code,
                    name: i.item.name,
                    unit: i.item.unit,
                    systemStock: num(i.systemStock),
                    actualStock: num(i.actualStock),
                    difference: num(i.difference),
                    unitCost: num(i.unitCost),
                    totalValue: num(i.totalValue),
                  }))}
                  company={{
                    name: companySettings?.companyName || t('stockOpnameDetailView.companyFallback'),
                    address: companySettings?.address,
                    logoUrl: companySettings?.logoUrl,
                  }}
                />
              }
              fileName={`stok-opname-${detail.opnameNumber}.pdf`}
              label={t('stockOpnameDetailView.downloadPdf')}
            />
            {detail.status === 'Submitted' && canCancel && (
              <Button
                variant="danger"
                onClick={() => onCancel({ id: detail.id, opnameNumber: detail.opnameNumber })}
              >
                <XCircle aria-hidden />
                {t('stockOpnameDetailView.cancel')}
              </Button>
            )}
          </>
        }
      />

      <section aria-label={t('stockOpnameDetailView.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('stockOpnameDetailView.summary.date')} value={formatDate(detail.date)} />
        <StatCard label={t('stockOpnameDetailView.summary.itemsCounted')} value={formatNumber(detail.items.length)} />
        <StatCard label={t('stockOpnameDetailView.summary.surplus')} value={formatRupiah(totalSurplus)} />
        <StatCard label={t('stockOpnameDetailView.summary.deficit')} value={formatRupiah(totalDeficit)} />
      </section>

      {detail.notes && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
          <span className="text-muted-foreground">{t('stockOpnameDetailView.notes')}</span> {detail.notes}
        </p>
      )}

      <section aria-labelledby="opname-diff-heading" className="space-y-3">
        <h2 id="opname-diff-heading" className="text-base font-semibold text-foreground">
          {t('stockOpnameDetailView.diffHeading', { total: formatNumber(itemsWithDiff.length) })}
        </h2>
        {itemsWithDiff.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {t('stockOpnameDetailView.noDiff')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm" aria-labelledby="opname-diff-heading">
              <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">{t('stockOpnameDetailView.table.item')}</th>
                  <th scope="col" className="hidden px-3 py-2 text-right md:table-cell">{t('stockOpnameDetailView.table.systemStock')}</th>
                  <th scope="col" className="hidden px-3 py-2 text-right md:table-cell">{t('stockOpnameDetailView.table.actualStock')}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t('stockOpnameDetailView.table.difference')}</th>
                  <th scope="col" className="hidden px-3 py-2 text-right lg:table-cell">
                    {t('stockOpnameDetailView.table.unitPrice')} <span className="normal-case">(Rp)</span>
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    {t('stockOpnameDetailView.table.varianceValue')} <span className="normal-case">(Rp)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itemsWithDiff.map((i) => {
                  const diff = num(i.difference);
                  return (
                    <tr key={i.id} className={diff > 0 ? 'bg-success-subtle/40' : 'bg-danger-subtle/40'}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{i.item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="num font-mono">{i.item.code}</span> · {i.item.unit}
                        </p>
                        <p className="num text-xs text-muted-foreground md:hidden">
                          {qty(i.systemStock)} → {qty(i.actualStock)}
                        </p>
                      </td>
                      <td className="num hidden px-3 py-2 text-right md:table-cell">{qty(i.systemStock)}</td>
                      <td className="num hidden px-3 py-2 text-right md:table-cell">{qty(i.actualStock)}</td>
                      <td
                        className={cn(
                          'num px-3 py-2 text-right font-semibold',
                          diff > 0 ? 'text-success-text' : 'text-danger-text',
                        )}
                      >
                        {diff > 0 ? '+' : ''}
                        {qty(diff)}
                      </td>
                      <td className="num hidden px-3 py-2 text-right lg:table-cell">
                        {formatRupiah(i.unitCost, { symbol: false })}
                      </td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">
                        {formatRupiah(i.totalValue, { symbol: false })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

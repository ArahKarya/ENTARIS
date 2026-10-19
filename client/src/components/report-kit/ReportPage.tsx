import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared';
import { useCompanySettings } from '@/contexts/CompanySettingsContext';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ReportPageProps {
  /** Must equal the route registry label (H1). */
  title: string;
  description: string;
  /** Usually <ExportMenu />. */
  actions?: ReactNode;
  /** Human period, e.g. periodLabel(range). Shown under the header and in print. */
  period?: string;
  /** <ReportFilters /> (+ notices); hidden when printing. */
  filters?: ReactNode;
  /** <ReportSummaryCards /> */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Page shell: H1 + description + actions, period/"Dicetak pada" meta, print header. */
export function ReportPage({ title, description, actions, period, filters, summary, children, className }: ReportPageProps) {
  const { t } = useTranslation('reports');
  const company = useCompanySettings();
  const [printedAt] = useState(() => formatDateTime(new Date()));

  return (
    <div className={cn('space-y-5 pb-8', className)}>
      <div className="print-only hidden border-b-2 border-foreground pb-3">
        <p className="text-lg font-bold">{company?.companyName || t('kit.page.companyFallback')}</p>
        {company?.address && <p className="text-xs">{company.address}</p>}
        {company?.taxId && <p className="text-xs">NPWP: {company.taxId}</p>}
        <p className="mt-2 text-xl font-bold uppercase">{title}</p>
      </div>

      <PageHeader
        className="no-print pb-0"
        title={title}
        description={description}
        actions={actions}
      />

      <p className="text-xs text-muted-foreground">
        {period && <span className="font-medium text-foreground">{period}</span>}
        {period && ' · '}
        {t('kit.page.printedAt')} <time dateTime={new Date().toISOString()}>{printedAt}</time>
      </p>

      {filters}
      {summary}
      {children}
    </div>
  );
}

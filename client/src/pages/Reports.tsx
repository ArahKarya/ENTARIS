import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Award,
  BarChart3,
  BookOpen,
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  Package,
  Receipt,
  Scale,
  Search,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getRoute } from '@/app/routes';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { focusRing } from '@/components/ui/styles';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/shared';

type Hub = (typeof import('@/locales/id/reports.json'))['reportsHub'];
type DescriptionKey = `reportsHub.descriptions.${keyof Hub['descriptions'] & string}`;
type GroupKey = `reportsHub.groups.${keyof Hub['groups'] & string}`;

interface ReportEntry {
  path: string;
  descriptionKey: DescriptionKey;
  icon: LucideIcon;
}

interface ReportGroup {
  id: string;
  titleKey: GroupKey;
  reports: readonly ReportEntry[];
}

// Judul kartu = label registry rute (sama dengan H1 halaman tujuan).
const GROUPS: readonly ReportGroup[] = [
  {
    id: 'keuangan',
    titleKey: 'reportsHub.groups.finance',
    reports: [
      { path: '/reports/daily', icon: CalendarDays, descriptionKey: 'reportsHub.descriptions.daily' },
      { path: '/reports/trial-balance', icon: ClipboardList, descriptionKey: 'reportsHub.descriptions.trialBalance' },
      { path: '/reports/profit-loss', icon: BarChart3, descriptionKey: 'reportsHub.descriptions.profitLoss' },
      { path: '/reports/balance-sheet', icon: Scale, descriptionKey: 'reportsHub.descriptions.balanceSheet' },
      { path: '/reports/cash-flow', icon: Banknote, descriptionKey: 'reportsHub.descriptions.cashFlow' },
      { path: '/reports/ledger-book', icon: BookOpen, descriptionKey: 'reportsHub.descriptions.ledgerBook' },
      { path: '/reports/tax', icon: Receipt, descriptionKey: 'reportsHub.descriptions.tax' },
    ],
  },
  {
    id: 'penjualan',
    titleKey: 'reportsHub.groups.sales',
    reports: [
      { path: '/reports/aging-ar', icon: Clock, descriptionKey: 'reportsHub.descriptions.agingAr' },
      { path: '/reports/receivable-schedule', icon: FileText, descriptionKey: 'reportsHub.descriptions.receivableSchedule' },
      { path: '/reports/profitability-per-sku', icon: Package, descriptionKey: 'reportsHub.descriptions.profitabilityPerSku' },
    ],
  },
  {
    id: 'pembelian',
    titleKey: 'reportsHub.groups.purchasing',
    reports: [
      { path: '/reports/aging-ap', icon: Clock, descriptionKey: 'reportsHub.descriptions.agingAp' },
      { path: '/reports/payable-schedule', icon: CreditCard, descriptionKey: 'reportsHub.descriptions.payableSchedule' },
      { path: '/reports/po-outstanding', icon: Truck, descriptionKey: 'reportsHub.descriptions.poOutstanding' },
      { path: '/reports/supplier-performance', icon: Award, descriptionKey: 'reportsHub.descriptions.supplierPerformance' },
    ],
  },
  {
    id: 'produksi',
    titleKey: 'reportsHub.groups.production',
    reports: [
      { path: '/reports/hpp', icon: Package, descriptionKey: 'reportsHub.descriptions.hpp' },
      { path: '/reports/production-cost-summary', icon: Package, descriptionKey: 'reportsHub.descriptions.productionCostSummary' },
      { path: '/reports/oee', icon: Gauge, descriptionKey: 'reportsHub.descriptions.oee' },
    ],
  },
];

interface Card extends ReportEntry {
  label: string;
  description: string;
  haystack: string;
}

/** Cards a user may open, with the registry label and searchable text. */
function buildGroups(query: string, t: TFunction<'reports'>): { group: ReportGroup; title: string; cards: Card[] }[] {
  const q = query.trim().toLowerCase();
  return GROUPS.map((group) => {
    const title = t(group.titleKey);
    return {
      group,
      title,
      cards: group.reports.flatMap<Card>((report) => {
        const route = getRoute(report.path);
        if (!route) return [];
        if (route.module && !can(route.module)) return [];
        const label = route.label;
        const description = t(report.descriptionKey);
        const haystack = [label, description, title, ...(route.keywords ?? [])].join(' ').toLowerCase();
        return q && !haystack.includes(q) ? [] : [{ ...report, label, description, haystack }];
      }),
    };
  }).filter((entry) => entry.cards.length > 0);
}

const Reports: React.FC = () => {
  const { t } = useTranslation('reports');
  const [query, setQuery] = useState('');
  const searchId = useId();
  const groups = useMemo(() => buildGroups(query, t), [query, t]);
  const total = groups.reduce((sum, g) => sum + g.cards.length, 0);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title={t('reportsHub.title')} description={t('reportsHub.description')} />

      <div role="search" aria-label={t('reportsHub.searchLabel')} className="relative w-full sm:max-w-sm">
        <label htmlFor={searchId} className="sr-only">{t('reportsHub.searchInput')}</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('reportsHub.searchPlaceholder')}
          autoComplete="off"
          className="pl-9 pr-9 max-sm:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('reportsHub.clearSearch')}
            className={cn('absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground', focusRing)}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <p className="sr-only" role="status">{t('reportsHub.found', { count: total })}</p>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            kind={query ? 'no-results' : 'empty'}
            title={query ? t('reportsHub.notFoundTitle') : t('reportsHub.noAccessTitle')}
            description={query ? t('reportsHub.notFoundDescription') : t('reportsHub.noAccessDescription')}
            compact
          />
        </div>
      ) : (
        groups.map(({ group, title, cards }) => (
          <section key={group.id} aria-labelledby={`grp-${group.id}`} className="space-y-3">
            <h2 id={`grp-${group.id}`} className="text-sm font-semibold text-muted-foreground">
              {title}
            </h2>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <li key={card.path}>
                  <Link
                    to={card.path}
                    className={cn(
                      'group flex h-full min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-1)] transition-colors hover:border-primary hover:bg-muted/40',
                      focusRing,
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary-subtle group-hover:text-primary-subtle-foreground">
                      <card.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{card.label}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{card.description}</span>
                    </span>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default Reports;

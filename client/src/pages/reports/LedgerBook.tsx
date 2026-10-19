import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/shared';
import { ExportMenu, ReportFilters, ReportPage, ReportState, periodLabel, useReportRange } from '@/components/report-kit';
import { LedgerAccountCard, type AccountLedger } from '@/components/reports/LedgerAccountCard';

const PAGE_SIZE = 200;
const ALL_HISTORY = { startDate: '', endDate: '' };

const LedgerBook: React.FC = () => {
  const { t } = useTranslation('reports');
  // Default: all history, no date filter.
  const { startDate, endDate, setRange, list } = useReportRange(ALL_HISTORY);
  const searchTerm = list.search;
  const [expandedAccounts, setExpandedAccounts] = useState<ReadonlySet<string>>(new Set());
  const [page, setPage] = useState(1);

  const { data: ledgerData, isLoading, isError, refetch } = useQuery<AccountLedger[]>({
    queryKey: ['ledger-book', startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const r = await api.get('/reports/ledger-book', { params });
      return r.data;
    },
  });

  const filtered = useMemo(() => {
    if (!ledgerData) return [];
    if (!searchTerm) return ledgerData;
    const q = searchTerm.toLowerCase();
    return ledgerData.filter((a) => a.accountName.toLowerCase().includes(q) || a.accountNumber.includes(q));
  }, [ledgerData, searchTerm]);

  // Pagination: pack accounts into pages until each page holds ~PAGE_SIZE entries.
  // An account with > PAGE_SIZE entries occupies its own page.
  const pages = useMemo(() => {
    const result: AccountLedger[][] = [];
    let current: AccountLedger[] = [];
    let currentCount = 0;
    for (const acc of filtered) {
      const n = acc.entries.length || 1;
      if (currentCount > 0 && currentCount + n > PAGE_SIZE) {
        result.push(current);
        current = [];
        currentCount = 0;
      }
      current.push(acc);
      currentCount += n;
    }
    if (current.length > 0) result.push(current);
    return result.length > 0 ? result : [[]];
  }, [filtered]);

  const totalEntries = useMemo(() => filtered.reduce((s, a) => s + a.entries.length, 0), [filtered]);

  const totalPages = pages.length;
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pageAccounts = pages[safePage - 1] ?? [];

  // Back to page 1 when the filter or the data changes.
  const resetKey = `${searchTerm}|${startDate}|${endDate}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const [prevData, setPrevData] = useState(ledgerData);
  if (prevResetKey !== resetKey || prevData !== ledgerData) {
    setPrevResetKey(resetKey);
    setPrevData(ledgerData);
    setPage(1);
  }

  const toggleAccount = useCallback((accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  const handleExportExcel = () => {
    const h = {
      number: t('reportsShared.accountNumber'),
      name: t('reportsShared.accountName'),
      date: t('reportsShared.date'),
      description: t('reportsShared.description'),
      debit: t('reportsShared.debitRp'),
      credit: t('reportsShared.creditRp'),
      balance: t('reportsShared.balanceRp'),
    };
    type Cell = string | number;
    const row = (number: Cell, name: Cell, date: Cell, description: Cell, debit: Cell, credit: Cell, balance: Cell) => ({
      [h.number]: number,
      [h.name]: name,
      [h.date]: date,
      [h.description]: description,
      [h.debit]: debit,
      [h.credit]: credit,
      [h.balance]: balance,
    });
    const rows: Record<string, Cell>[] = [];
    for (const account of filtered) {
      const { accountNumber: no, accountName: name } = account;
      rows.push(row(no, name, '', t('ledgerBook.excel.openingMarker'), '', '', account.openingBalance));
      for (const entry of account.entries) {
        rows.push(row(no, name, format(new Date(entry.date), 'dd/MM/yyyy'), entry.description || '', entry.debit || '', entry.credit || '', entry.runningBalance));
      }
      rows.push(row(no, name, '', t('ledgerBook.excel.totalMarker'), account.totalDebit, account.totalCredit, account.closingBalance));
      rows.push(row('', '', '', '', '', '', ''));
    }
    exportToExcel(rows, `Buku-Besar-${startDate}-sd-${endDate}`);
  };

  const period = startDate && endDate ? periodLabel({ startDate, endDate }) : t('kit.filters.allHistory');
  const pageBtn = 'max-sm:size-11';

  return (
    <ReportPage
      title={t('ledgerBook.title')}
      description={t('ledgerBook.description')}
      period={period}
      actions={<ExportMenu disabled={isLoading || isError} onExcel={handleExportExcel} />}
      filters={
        <ReportFilters mode="range" allowAll value={{ startDate, endDate }} onChange={setRange}>
          <div className="grid w-full gap-1.5 sm:w-auto sm:min-w-60">
            <Label htmlFor="ledger-search">{t('ledgerBook.search')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="ledger-search"
                type="search"
                value={list.searchInput}
                onChange={(e) => list.setSearch(e.target.value)}
                placeholder={t('ledgerBook.searchPlaceholder')}
                autoComplete="off"
                className="pl-9 pr-9 max-sm:h-11 [&::-webkit-search-cancel-button]:hidden"
              />
              {list.searchInput && (
                <button
                  type="button"
                  onClick={() => list.setSearch('')}
                  aria-label={t('reportsHub.clearSearch')}
                  className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
          <Button variant="outline" className="max-sm:h-11" onClick={() => setExpandedAccounts(new Set(filtered.map((a) => a.accountId)))}>
            {t('ledgerBook.expandAll')}
          </Button>
          <Button variant="outline" className="max-sm:h-11" onClick={() => setExpandedAccounts(new Set())}>
            {t('ledgerBook.collapseAll')}
          </Button>
        </ReportFilters>
      }
    >
      <ReportState
        isLoading={isLoading}
        isError={isError}
        isEmpty={filtered.length === 0}
        filtered={!!searchTerm}
        onRetry={() => refetch()}
      >
        <p className="text-xs text-muted-foreground" role="status">
          {t('ledgerBook.accountCount', { count: filtered.length })} · {t('ledgerBook.entryCount', { count: totalEntries, formatted: formatNumber(totalEntries) })}
        </p>
        <div className="space-y-3">
          {pageAccounts.length === 0 ? (
            <EmptyState kind="empty" title={t('ledgerBook.empty')} compact />
          ) : (
            pageAccounts.map((account) => (
              <LedgerAccountCard
                key={account.accountId}
                account={account}
                expanded={expandedAccounts.has(account.accountId)}
                onToggle={toggleAccount}
              />
            ))
          )}
        </div>

        {totalPages > 1 && (
          <nav aria-label={t('ledgerBook.pagination')} className="no-print flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {t('ledgerBook.pageInfo', { page: safePage, total: totalPages, size: PAGE_SIZE })}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className={pageBtn} aria-label={t('ledgerBook.firstPage')} onClick={() => setPage(1)} disabled={safePage === 1}>
                <ChevronsLeft className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" className={pageBtn} aria-label={t('ledgerBook.prevPage')} onClick={() => setPage(safePage - 1)} disabled={safePage === 1}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <span className="num px-2 text-xs">{safePage} / {totalPages}</span>
              <Button variant="outline" size="icon" className={pageBtn} aria-label={t('ledgerBook.nextPage')} onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" size="icon" className={pageBtn} aria-label={t('ledgerBook.lastPage')} onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>
                <ChevronsRight className="size-4" aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </ReportState>
    </ReportPage>
  );
};

export default LedgerBook;

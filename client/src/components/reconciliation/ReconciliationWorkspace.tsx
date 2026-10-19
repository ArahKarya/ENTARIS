/**
 * Matching workspace for one bank reconciliation session. Clicking a ledger entry
 * pairs it with the first unmatched statement line.
 */
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { AlertTriangle, ArrowLeft, Building2, Check, CheckCircle2, Circle, CreditCard, Link2, Plus, Trash2, Unlink } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog, DateInput, EmptyState, LoadingState, PageHeader, StatCard, StatusBadge } from '@/components/shared';

type Money = number | string;

export interface ReconciliationItem {
  id: string;
  reconciliationId: string;
  ledgerEntryId: string | null;
  isMatched: boolean;
  statementAmount: Money | null;
  statementDesc: string | null;
  statementDate: string | null;
}

export interface LedgerEntry {
  id: string;
  date: string;
  debit: Money;
  credit: Money;
  description: string | null;
  referenceType: string;
  referenceId: string;
  referenceNumber?: string | null;
}

/** Human label for a book entry: description, then journal number, then the reference type. */
function ledgerEntryLabel(entry: LedgerEntry): string {
  if (entry.description) return entry.description;
  if (entry.referenceNumber) return entry.referenceNumber;
  return entry.referenceType === 'JournalEntry' ? i18n.t('finance:reconciliationWorkspace.generalJournal') : entry.referenceType;
}

export interface ReconciliationDetail {
  id: string;
  accountId: string;
  account: { id: string; name: string; accountNumber: string; balance: Money };
  statementDate: string;
  statementBalance: Money;
  bookBalance: Money;
  status: string;
  notes: string | null;
  items?: ReconciliationItem[];
  unmatchedLedgerEntries?: LedgerEntry[];
}

interface NewItemRow {
  amount: string;
  desc: string;
  date: string;
}

const EMPTY_ROW: NewItemRow = { amount: '', desc: '', date: '' };
const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });
const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/** Amount header with the currency unit in normal case. */
const AmountHead = ({ label }: { label: string }) => (
  <TableHead numeric className="bg-muted">
    {label} <span className="normal-case">(Rp)</span>
  </TableHead>
);

interface Props {
  id: string;
  canEdit: boolean;
  onBack: () => void;
}

export function ReconciliationWorkspace({ id, canEdit, onBack }: Props) {
  const { t } = useTranslation('finance');
  const queryClient = useQueryClient();
  const formId = useId();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [newItems, setNewItems] = useState<NewItemRow[]>([EMPTY_ROW]);

  const detailQuery = useQuery<ReconciliationDetail>({
    queryKey: ['reconciliation', id],
    queryFn: async () => (await api.get(`/reconciliation/${id}`)).data,
  });

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });

  const matchMutation = useMutation({
    mutationFn: async ({ itemId, ledgerEntryId }: { itemId: string; ledgerEntryId: string }) =>
      api.patch(`/reconciliation/${id}/match`, { itemId, ledgerEntryId }),
    onSuccess: () => {
      invalidateDetail();
      toast.success(t('reconciliationWorkspace.toast.matched'));
    },
    onError: (e) => toast.error(errorMessage(e, t('reconciliationWorkspace.toast.matchFailed'))),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (itemId: string) => api.patch(`/reconciliation/${id}/unmatch`, { itemId }),
    onSuccess: () => {
      invalidateDetail();
      toast.success(t('reconciliationWorkspace.toast.unmatched'));
    },
    onError: (e) => toast.error(errorMessage(e, t('reconciliationWorkspace.toast.unmatchFailed'))),
  });

  const completeMutation = useMutation({
    mutationFn: async () => api.post(`/reconciliation/${id}/complete`),
    onSuccess: () => {
      invalidateDetail();
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success(t('reconciliationWorkspace.toast.completed'));
    },
    onError: (e) => toast.error(errorMessage(e, t('reconciliationWorkspace.toast.completeFailed'))),
  });

  const addItemsMutation = useMutation({
    mutationFn: async (
      items: Array<{ statementAmount: number; statementDesc: string | null; statementDate: string | null }>,
    ) => api.post(`/reconciliation/${id}/items`, { items }),
    onSuccess: () => {
      invalidateDetail();
      setAddingItems(false);
      setNewItems([EMPTY_ROW]);
      toast.success(t('reconciliationWorkspace.toast.itemsAdded'));
    },
    onError: (e) => toast.error(errorMessage(e, t('reconciliationWorkspace.toast.itemsFailed'))),
  });

  const updateRow = (idx: number, patch: Partial<NewItemRow>) =>
    setNewItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleAddItems = () => {
    const valid = newItems.filter((i) => i.amount !== '');
    if (valid.length === 0) {
      toast.error(t('reconciliationWorkspace.toast.itemRequired'));
      return;
    }
    addItemsMutation.mutate(
      valid.map((i) => ({
        statementAmount: parseFloat(i.amount),
        statementDesc: i.desc || null,
        statementDate: i.date || null,
      })),
    );
  };

  const backButton = (
    <Button variant="outline" onClick={onBack}>
      <ArrowLeft aria-hidden />
      {t('reconciliationWorkspace.back')}
    </Button>
  );
  const crumbs = [{ label: t('reconciliationWorkspace.breadcrumb'), href: '/reconciliation' }, { label: t('reconciliationWorkspace.matching') }];

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader title={t('reconciliationWorkspace.title')} breadcrumbs={crumbs} actions={backButton} />
        <LoadingState label={t('reconciliationWorkspace.loading')} />
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className="space-y-5 pb-8">
        <PageHeader title={t('reconciliationWorkspace.title')} breadcrumbs={crumbs} actions={backButton} />
        <EmptyState
          kind={detailQuery.isError ? 'error' : 'empty'}
          title={detailQuery.isError ? undefined : t('reconciliationWorkspace.notFound.title')}
          description={detailQuery.isError ? undefined : t('reconciliationWorkspace.notFound.description')}
          action={
            detailQuery.isError ? (
              <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
                {t('reconciliationWorkspace.retry')}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const difference = num(detail.statementBalance) - num(detail.bookBalance);
  const balanced = Math.abs(difference) < 0.01;
  const items = detail.items ?? [];
  const ledger = detail.unmatchedLedgerEntries ?? [];
  const matchedCount = items.filter((i) => i.isMatched).length;
  const isDraft = detail.status === 'Draft';
  const editable = isDraft && canEdit;

  const matchEntry = (entryId: string) => {
    // Pair with the first unmatched statement line.
    const unmatched = items.find((i) => !i.isMatched);
    if (unmatched) {
      matchMutation.mutate({ itemId: unmatched.id, ledgerEntryId: entryId });
    } else {
      toast.error(t('reconciliationWorkspace.toast.noUnmatched'));
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        breadcrumbs={[{ label: t('reconciliationWorkspace.breadcrumb'), href: '/reconciliation' }, { label: detail.account.name }]}
        title={`${detail.account.accountNumber} - ${detail.account.name}`}
        description={t('reconciliationWorkspace.statementAsOf', { date: formatDate(detail.statementDate) })}
        actions={
          <>
            <StatusBadge status={detail.status} />
            {backButton}
            {editable && (
              <Button onClick={() => setConfirmComplete(true)} loading={completeMutation.isPending}>
                <Check aria-hidden />
                {t('reconciliationWorkspace.complete')}
              </Button>
            )}
          </>
        }
      />

      <section aria-label={t('reconciliationWorkspace.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('reconciliationWorkspace.summary.book')} icon={CreditCard} value={formatRupiah(detail.bookBalance, { compact: true })} valueTitle={formatRupiah(detail.bookBalance)} hint={formatRupiah(detail.bookBalance)} />
        <StatCard label={t('reconciliationWorkspace.summary.statement')} icon={Building2} value={formatRupiah(detail.statementBalance, { compact: true })} valueTitle={formatRupiah(detail.statementBalance)} hint={formatRupiah(detail.statementBalance)} />
        <StatCard
          label={t('reconciliationWorkspace.summary.difference')}
          icon={AlertTriangle}
          value={<span className={balanced ? 'text-success-text' : 'text-warning-text'}>{formatRupiah(difference, { compact: true })}</span>}
          valueTitle={formatRupiah(difference)}
          hint={balanced ? t('reconciliationWorkspace.summary.balanced') : formatRupiah(difference)}
        />
        <StatCard
          label={t('reconciliationWorkspace.summary.matched')}
          icon={CheckCircle2}
          value={`${formatNumber(matchedCount)} / ${formatNumber(items.length)}`}
          hint={t('reconciliationWorkspace.summary.matchedHint')}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: book transactions not matched yet */}
        <section aria-labelledby={`${formId}-book`} className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]">
          <header className="border-b border-border px-4 py-3">
            <h2 id={`${formId}-book`} className="text-sm font-semibold text-foreground">
              {t('reconciliationWorkspace.book.title')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('reconciliationWorkspace.book.unmatched', { count: ledger.length })}</p>
          </header>
          {ledger.length === 0 ? (
            <EmptyState compact title={t('reconciliationWorkspace.book.empty.title')} description={t('reconciliationWorkspace.book.empty.description')} />
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            <div role="region" aria-label={t('reconciliationWorkspace.book.region')} tabIndex={0} className="max-h-96 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              <table className="w-full border-collapse text-sm">
                <TableHeader className="sticky top-0 z-[1]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="hidden bg-muted sm:table-cell">{t('reconciliationWorkspace.columns.date')}</TableHead>
                    <TableHead className="bg-muted">{t('reconciliationWorkspace.columns.description')}</TableHead>
                    <AmountHead label={t('reconciliationWorkspace.columns.amount')} />
                    {editable && (
                      <TableHead className="w-px bg-muted">
                        <span className="sr-only">{t('reconciliationWorkspace.columns.actions')}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => {
                    const amount = num(entry.debit) - num(entry.credit);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="num hidden whitespace-nowrap py-2 text-muted-foreground sm:table-cell">
                          {formatDate(entry.date)}
                        </TableCell>
                        <TableCell className="max-w-40 py-2 sm:max-w-56" title={ledgerEntryLabel(entry)}>
                          <p className="truncate text-foreground">{ledgerEntryLabel(entry)}</p>
                          {/* Mobile: date stacked here because its column is hidden. */}
                          <p className="num text-xs text-muted-foreground sm:hidden">{formatDate(entry.date)}</p>
                        </TableCell>
                        <TableCell numeric className={cn('py-2 font-medium', amount >= 0 ? 'text-foreground' : 'text-danger-text')}>
                          {money(amount)}
                        </TableCell>
                        {editable && (
                          <TableCell className="w-px whitespace-nowrap py-1 pl-1 pr-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => matchEntry(entry.id)}
                              disabled={matchMutation.isPending}
                              aria-label={t('reconciliationWorkspace.matchLabel', { entry: ledgerEntryLabel(entry), date: formatDate(entry.date) })}
                              className="text-primary-hover"
                            >
                              <Link2 aria-hidden />
                              <span className="hidden sm:inline">{t('reconciliationWorkspace.match')}</span>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>
          )}
        </section>

        {/* Right: bank statement lines */}
        <section aria-labelledby={`${formId}-bank`} className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 id={`${formId}-bank`} className="text-sm font-semibold text-foreground">
                {t('reconciliationWorkspace.bank.title')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('reconciliationWorkspace.bank.count', { count: items.length })}</p>
            </div>
            {editable && !addingItems && (
              <Button variant="outline" size="sm" onClick={() => setAddingItems(true)}>
                <Plus aria-hidden />
                {t('reconciliationWorkspace.bank.add')}
              </Button>
            )}
          </header>

          {addingItems && (
            <div className="space-y-2 border-b border-border bg-muted px-4 py-3">
              {newItems.map((item, idx) => (
                <fieldset key={idx} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <legend className="sr-only">{t('reconciliationWorkspace.bank.item', { n: idx + 1 })}</legend>
                  <label htmlFor={`${formId}-date-${idx}`} className="sr-only">
                    {t('reconciliationWorkspace.columns.date')}
                  </label>
                  <DateInput id={`${formId}-date-${idx}`} value={item.date} onChange={(v) => updateRow(idx, { date: v })} className="w-36 shrink-0" />
                  <label htmlFor={`${formId}-desc-${idx}`} className="sr-only">
                    {t('reconciliationWorkspace.columns.description')}
                  </label>
                  <Input id={`${formId}-desc-${idx}`} value={item.desc} onChange={(e) => updateRow(idx, { desc: e.target.value })} placeholder={t('reconciliationWorkspace.columns.description')} className="min-w-0 flex-1" />
                  <label htmlFor={`${formId}-amount-${idx}`} className="sr-only">
                    {t('reconciliationWorkspace.bank.amountRp')}
                  </label>
                  <Input
                    id={`${formId}-amount-${idx}`}
                    type="number"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => updateRow(idx, { amount: e.target.value })}
                    placeholder={t('reconciliationWorkspace.columns.amount')}
                    className="num w-32 text-right"
                  />
                  {newItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setNewItems((rows) => rows.filter((_, i) => i !== idx))}
                      aria-label={t('reconciliationWorkspace.bank.removeRow', { n: idx + 1 })}
                      className="text-danger-text hover:bg-danger-subtle"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </fieldset>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="link" size="sm" onClick={() => setNewItems((rows) => [...rows, EMPTY_ROW])}>
                  <Plus aria-hidden />
                  {t('reconciliationWorkspace.bank.newRow')}
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddingItems(false);
                    setNewItems([EMPTY_ROW]);
                  }}
                >
                  {t('reconciliationWorkspace.cancel')}
                </Button>
                <Button size="sm" onClick={handleAddItems} loading={addItemsMutation.isPending}>
                  {t('reconciliationWorkspace.save')}
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState compact title={t('reconciliationWorkspace.bank.empty.title')} description={editable ? t('reconciliationWorkspace.bank.empty.description') : undefined} />
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            <div role="region" aria-label={t('reconciliationWorkspace.bank.region')} tabIndex={0} className="max-h-96 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              <table className="w-full border-collapse text-sm">
                <TableHeader className="sticky top-0 z-[1]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 bg-muted">
                      <span className="sr-only">{t('reconciliationWorkspace.columns.status')}</span>
                    </TableHead>
                    <TableHead className="bg-muted">{t('reconciliationWorkspace.columns.description')}</TableHead>
                    <AmountHead label={t('reconciliationWorkspace.columns.amount')} />
                    {editable && (
                      <TableHead className="w-px bg-muted">
                        <span className="sr-only">{t('reconciliationWorkspace.columns.actions')}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="py-2">
                        {item.isMatched ? (
                          <CheckCircle2 className="size-4 text-success-text" aria-label={t('reconciliationWorkspace.matched')} />
                        ) : (
                          <Circle className="size-4 text-muted-foreground" aria-label={t('reconciliationWorkspace.notMatched')} />
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 py-2 sm:max-w-56">
                        <p className="truncate text-foreground">{item.statementDesc || t('reconciliationWorkspace.noDescription')}</p>
                        {item.statementDate && <p className="num text-xs text-muted-foreground">{formatDate(item.statementDate)}</p>}
                      </TableCell>
                      <TableCell numeric className="py-2 font-medium text-foreground">
                        {money(item.statementAmount)}
                      </TableCell>
                      {editable && (
                        <TableCell className="w-px whitespace-nowrap py-1 pl-1 pr-2 text-right">
                          {item.isMatched && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unmatchMutation.mutate(item.id)}
                              disabled={unmatchMutation.isPending}
                              aria-label={t('reconciliationWorkspace.unmatchLabel', { item: item.statementDesc || t('reconciliationWorkspace.itemFallback') })}
                              className="text-danger-text hover:bg-danger-subtle"
                            >
                              <Unlink aria-hidden />
                              <span className="hidden sm:inline">{t('reconciliationWorkspace.unmatch')}</span>
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title={t('reconciliationWorkspace.completeDialog.title')}
        description={t('reconciliationWorkspace.completeDialog.description')}
        confirmLabel={t('reconciliationWorkspace.completeDialog.confirm')}
        tone="danger"
        onConfirm={() => {
          completeMutation.mutate();
          setConfirmComplete(false);
        }}
      />
    </div>
  );
}

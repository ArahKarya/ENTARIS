/** Recurring templates (/recurring). GET /recurring returns every template, so filtering runs in memory. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pause, Pencil, Play, Plus, Zap } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/api';
import { formatDate } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { ComboboxFilter, ConfirmDialog, DataTable, FilterBar, PageHeader, RowActions, StatusBadge } from '@/components/shared';
import RecurringTemplateModal from '@/components/RecurringTemplateModal';

interface RecurringTemplate {
  id: string;
  name: string;
  templateType: string;
  frequency: string;
  dayOfMonth?: number | null;
  nextRunDate: string;
  lastRunDate?: string | null;
  isActive: boolean;
  templateData: unknown;
  createdBy: string;
  user?: { fullName: string };
  createdAt: string;
  updatedAt: string;
}

const TEMPLATE_TYPES = ['journal', 'sales_invoice', 'purchase_invoice'] as const;
type TemplateType = (typeof TEMPLATE_TYPES)[number];
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
type Frequency = (typeof FREQUENCIES)[number];
const isFrequency = (v: string): v is Frequency => (FREQUENCIES as readonly string[]).includes(v);

const FILTER_KEYS = ['status', 'templateType'] as const;

const typeLabel = (type: string) =>
  i18n.t(`finance:recurringTransactions.type.${(TEMPLATE_TYPES as readonly string[]).includes(type) ? (type as TemplateType) : 'journal'}`);
const frequencyLabel = (tpl: RecurringTemplate) => {
  const base = isFrequency(tpl.frequency) ? i18n.t(`finance:recurringTransactions.frequency.${tpl.frequency}`) : tpl.frequency;
  return tpl.dayOfMonth && tpl.frequency === 'monthly'
    ? i18n.t('finance:recurringTransactions.frequencyDay', { frequency: base, day: tpl.dayOfMonth })
    : base;
};
/** One schedule period, used to explain how a manual run moves the next run. */
const periodLabel = (frequency: string) =>
  isFrequency(frequency) ? i18n.t(`finance:recurringTransactions.period.${frequency}`) : i18n.t('finance:recurringTransactions.period.fallback');
const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

export const RecurringTransactions = () => {
  const { t } = useTranslation('finance');
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<RecurringTemplate | null>(null);
  // "Jalankan sekarang" posts a real journal, so it asks for confirmation first.
  const [runTarget, setRunTarget] = useState<RecurringTemplate | null>(null);
  const canEdit = can('recurring', 'edit');

  const templatesQuery = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: async () => (await api.get('/recurring')).data.data as RecurringTemplate[],
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recurring/${id}/execute`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      if (res.data.success) toast.success(t('recurringTransactions.toast.executed'));
      else toast.error(res.data.error || t('recurringTransactions.toast.executeFailed'));
    },
    onError: (e) => toast.error(errorMessage(e, t('recurringTransactions.toast.executeFailed'))),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/recurring/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      toast.success(t('recurringTransactions.toast.statusUpdated'));
    },
    onError: (e) => toast.error(errorMessage(e, t('recurringTransactions.toast.statusFailed'))),
  });

  const openCreate = () => {
    setEditTemplate(null);
    setIsModalOpen(true);
  };
  const openEdit = (template: RecurringTemplate) => {
    setEditTemplate(template);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditTemplate(null);
  };

  const { search, filters } = list;
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return (templatesQuery.data ?? []).filter(
      (tpl) =>
        (!q || tpl.name.toLowerCase().includes(q)) &&
        (!filters.status || (filters.status === 'active') === tpl.isActive) &&
        (!filters.templateType || tpl.templateType === filters.templateType),
    );
  }, [templatesQuery.data, search, filters]);

  const columns = useMemo<ColumnDef<RecurringTemplate>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (tpl) => tpl.name,
        header: t('recurringTransactions.columns.name'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-44 sm:max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            {/* Mobile: type + frequency stacked here because their columns are hidden. */}
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {typeLabel(row.original.templateType)} · {frequencyLabel(row.original)}
            </p>
          </div>
        ),
      },
      {
        id: 'templateType',
        accessorFn: (tpl) => typeLabel(tpl.templateType),
        header: t('recurringTransactions.columns.type'),
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ getValue }) => getValue<string>(),
      },
      {
        id: 'frequency',
        accessorFn: (tpl) => frequencyLabel(tpl),
        header: t('recurringTransactions.columns.frequency'),
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ getValue }) => getValue<string>(),
      },
      {
        id: 'nextRunDate',
        accessorFn: (tpl) => new Date(tpl.nextRunDate).getTime(),
        header: () => (
          <>
            <span className="sm:hidden">{t('recurringTransactions.columns.nextShort')}</span>
            <span className="hidden sm:inline">{t('recurringTransactions.columns.next')}</span>
          </>
        ),
        enableSorting: true,
        meta: { cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className="text-foreground">{formatDate(row.original.nextRunDate)}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.isActive ? 'Active' : 'Inactive'} className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'lastRunDate',
        accessorFn: (tpl) => (tpl.lastRunDate ? new Date(tpl.lastRunDate).getTime() : 0),
        header: t('recurringTransactions.columns.last'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.lastRunDate ? formatDate(row.original.lastRunDate) : '—'),
      },
      {
        id: 'status',
        accessorFn: (tpl) => (tpl.isActive ? 0 : 1),
        header: t('recurringTransactions.columns.status'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'Active' : 'Inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('recurringTransactions.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const tpl = row.original;
          return (
            <RowActions
              label={t('recurringTransactions.rowActions', { name: tpl.name })}
              actions={[
                { label: t('recurringTransactions.actions.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => openEdit(tpl) },
                {
                  label: t('recurringTransactions.actions.run'),
                  icon: Zap,
                  hidden: !canEdit,
                  disabled: executeMutation.isPending,
                  onSelect: () => setRunTarget(tpl),
                },
                {
                  label: tpl.isActive ? t('recurringTransactions.actions.deactivate') : t('recurringTransactions.actions.activate'),
                  icon: tpl.isActive ? Pause : Play,
                  hidden: !canEdit,
                  disabled: toggleMutation.isPending,
                  onSelect: () => toggleMutation.mutate({ id: tpl.id, isActive: !tpl.isActive }),
                },
              ]}
            />
          );
        },
      },
    ],
    // Mutations/openEdit are stable enough; re-create when pending flags flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, executeMutation.isPending, toggleMutation.isPending, t],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('recurringTransactions.title')}
        description={t('recurringTransactions.description')}
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('recurringTransactions.create')}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('recurringTransactions.filters.searchLabel')}
          searchPlaceholder={t('recurringTransactions.filters.searchPlaceholder')}
          status={{
            options: [
              { value: 'active', label: t('recurringTransactions.filters.active') },
              { value: 'inactive', label: t('recurringTransactions.filters.inactive') },
            ],
          }}
        >
          <ComboboxFilter
            label={t('recurringTransactions.filters.type')}
            allLabel={t('recurringTransactions.filters.allTypes')}
            searchPlaceholder={t('recurringTransactions.filters.typeSearch')}
            value={list.filters.templateType}
            onChange={(v) => list.setFilter('templateType', v)}
            options={TEMPLATE_TYPES.map((value) => ({ value, label: typeLabel(value) }))}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
        </FilterBar>

        <DataTable
          label={t('recurringTransactions.table.label')}
          itemLabel={t('recurringTransactions.table.itemLabel')}
          columns={columns}
          data={templatesQuery.data ? rows : undefined}
          getRowId={(row) => row.id}
          pageSize={25}
          loading={templatesQuery.isLoading}
          error={templatesQuery.error}
          onRetry={() => templatesQuery.refetch()}
          filtered={list.hasActiveFilters}
          onClearFilters={list.resetFilters}
          onRowClick={canEdit ? openEdit : undefined}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('recurringTransactions.empty.title'),
            description: t('recurringTransactions.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('recurringTransactions.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <RecurringTemplateModal isOpen={isModalOpen} onClose={closeModal} editTemplate={editTemplate} />

      <ConfirmDialog
        open={runTarget !== null}
        onOpenChange={(open) => !open && setRunTarget(null)}
        title={t('recurringTransactions.runDialog.title')}
        description={
          runTarget ? (
            <Trans
              t={t}
              i18nKey="recurringTransactions.runDialog.description"
              values={{
                name: runTarget.name,
                period: periodLabel(runTarget.frequency),
                current: formatDate(runTarget.nextRunDate),
              }}
              components={{ b: <strong /> }}
            />
          ) : null
        }
        confirmLabel={t('recurringTransactions.runDialog.confirm')}
        loading={executeMutation.isPending}
        onConfirm={() => (runTarget ? executeMutation.mutateAsync(runTarget.id) : undefined)}
      />
    </div>
  );
};

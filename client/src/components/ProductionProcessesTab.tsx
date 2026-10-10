/**
 * Proses Produksi → Master Proses (?view=processes). Traceability master:
 * processes staff can tick on a production run (no cost, no stock).
 * Writes need can('production','edit'); delete also needs cap('doc.cancel')
 * (server: a used process is deactivated instead of deleted).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { can, cap } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, DataTable, Field, RowActions, StatusBadge } from '@/components/shared';
import { FormNumberInput, FormSheet, InfoNote, MasterToolbar } from '@/components/inventory/master-data-kit';
import {
  countActive,
  filterMasterRows,
  hasErrors,
  validateProcess,
  type ActiveFilter,
  type FormErrors,
} from '@/components/inventory/master-data';
import { errorMessage } from '@/components/inventory/inventory-rows';

interface ProductionProcess {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface FormState {
  name: string;
  description: string;
  sortOrder: string;
}

const QUERY_KEY = ['production-processes-all'];
const blankForm: FormState = { name: '', description: '', sortOrder: '0' };

export default function ProductionProcessesTab() {
  const { t } = useTranslation('production');
  const canEdit = can('production', 'edit');
  const canDelete = canEdit && cap('doc.cancel');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ActiveFilter>('');
  const [sheet, setSheet] = useState<{ edit: ProductionProcess | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductionProcess | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<{ data: ProductionProcess[] }>('/inventory/production-processes')).data,
  });
  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const rows = useMemo(
    () => filterMasterRows(all, { search, status }, (p) => [p.name, p.description]),
    [all, search, status],
  );
  const counts = countActive(all);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['production-processes-active'] });
  };

  const toggleActive = async (p: ProductionProcess) => {
    try {
      await api.put(`/inventory/production-processes/${p.id}`, { isActive: !p.isActive });
      toast.success(p.isActive ? t('productionProcessesTab.toast.deactivated', { name: p.name }) : t('productionProcessesTab.toast.activated', { name: p.name }));
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, t('productionProcessesTab.toast.toggleFailed')));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete(`/inventory/production-processes/${deleteTarget.id}`);
      toast.success(res.data?.message || t('productionProcessesTab.toast.deleted'));
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, t('productionProcessesTab.toast.deleteFailed')));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<ProductionProcess>[]>(
    () => [
      {
        id: 'sortOrder',
        accessorKey: 'sortOrder',
        header: t('productionProcessesTab.columns.sortOrder'),
        enableSorting: true,
        meta: { align: 'right', hideBelow: 'sm', headerClassName: 'w-24' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatNumber(row.original.sortOrder)}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('productionProcessesTab.columns.name'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium text-foreground">{p.name}</p>
              {p.description && <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorFn: (p) => (p.isActive ? 1 : 0),
        header: t('productionProcessesTab.columns.status'),
        enableSorting: true,
        meta: { headerClassName: 'w-28' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('productionProcessesTab.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <RowActions
              label={t('productionProcessesTab.actionsFor', { name: p.name })}
              actions={[
                { label: t('productionProcessesTab.actions.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ edit: p }) },
                {
                  label: p.isActive ? t('productionProcessesTab.actions.deactivate') : t('productionProcessesTab.actions.activate'),
                  icon: p.isActive ? PowerOff : Power,
                  hidden: !canEdit,
                  onSelect: () => toggleActive(p),
                },
                { label: t('productionProcessesTab.actions.delete'), icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => setDeleteTarget(p) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive only closes over stable setters
    [canEdit, canDelete, t],
  );

  return (
    <div className="space-y-4">
      <InfoNote>
        {t('productionProcessesTab.info')}
      </InfoNote>

      <MasterToolbar
        search={search}
        onSearch={setSearch}
        searchLabel={t('productionProcessesTab.searchLabel')}
        searchPlaceholder={t('productionProcessesTab.searchPlaceholder')}
        status={status}
        onStatus={setStatus}
        summary={all.length > 0 ? t('productionProcessesTab.summary', { total: formatNumber(counts.total), active: formatNumber(counts.active) }) : undefined}
        action={
          canEdit && (
            <Button onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              {t('productionProcessesTab.newProcess')}
            </Button>
          )
        }
      />

      <DataTable
        label={t('productionProcessesTab.tableLabel')}
        itemLabel={t('productionProcessesTab.itemLabel')}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => query.refetch()}
        filtered={!!search.trim() || !!status}
        onClearFilters={() => {
          setSearch('');
          setStatus('');
        }}
        onRowClick={canEdit ? (p) => setSheet({ edit: p }) : undefined}
        rowClassName={(p) => (p.isActive ? undefined : 'text-muted-foreground')}
        pageSize={25}
        empty={{
          title: t('productionProcessesTab.empty.title'),
          description: t('productionProcessesTab.empty.description'),
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              {t('productionProcessesTab.empty.action')}
            </Button>
          ) : undefined,
        }}
      />

      {sheet && (
        <ProcessFormSheet
          editTarget={sheet.edit}
          onClose={() => setSheet(null)}
          onSaved={() => {
            invalidate();
            setSheet(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title={t('productionProcessesTab.deleteDialog.title')}
        description={t('productionProcessesTab.deleteDialog.description', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('productionProcessesTab.deleteDialog.confirm')}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ProcessFormSheet({
  editTarget,
  onClose,
  onSaved,
}: {
  editTarget: ProductionProcess | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('production');
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() =>
    editTarget
      ? { name: editTarget.name, description: editTarget.description ?? '', sortOrder: String(editTarget.sortOrder) }
      : blankForm,
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors: FormErrors<'name' | 'sortOrder'> = touched ? validateProcess(form) : {};
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (hasErrors(validateProcess(form))) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (isEdit) {
        await api.put(`/inventory/production-processes/${editTarget.id}`, payload);
        toast.success(t('productionProcessesTab.toast.updated'));
      } else {
        await api.post('/inventory/production-processes', payload);
        toast.success(t('productionProcessesTab.toast.created'));
      }
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err, t('productionProcessesTab.toast.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? t('productionProcessesTab.form.editTitle') : t('productionProcessesTab.form.newTitle')}
      description={t('productionProcessesTab.form.description')}
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? t('productionProcessesTab.form.saveChanges') : t('productionProcessesTab.form.save')}
      onSubmit={submit}
    >
      <Field label={t('productionProcessesTab.form.name')} required error={errors.name}>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => form.name && setTouched(true)}
          placeholder={t('productionProcessesTab.form.namePlaceholder')}
          maxLength={100}
        />
      </Field>
      <Field label={t('productionProcessesTab.form.descriptionLabel')}>
        <Textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder={t('productionProcessesTab.form.descriptionPlaceholder')}
          rows={3}
        />
      </Field>
      <Field label={t('productionProcessesTab.form.sortOrder')} hint={t('productionProcessesTab.form.sortOrderHint')} error={errors.sortOrder}>
        <FormNumberInput value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} step={1} className="w-32" />
      </Field>
    </FormSheet>
  );
}

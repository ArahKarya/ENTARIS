/**
 * Machine master for OEE: ideal capacity (unit/hour) drives Performance. The
 * 30-day OEE column is hidden without inventory read permission.
 */
import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatNumber, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog, DataTable, Field, RowActions, StatusBadge } from '@/components/shared';
import { FormNumberInput, FormSheet, InfoNote, MasterToolbar } from '@/components/inventory/master-data-kit';
import {
  countActive,
  filterMasterRows,
  hasErrors,
  parseOptionalNonNegative,
  validateMachine,
  type ActiveFilter,
} from '@/components/inventory/master-data';
import { toIsoDate } from '@/components/inventory/dashboard-model';
import { errorMessage } from '@/components/inventory/inventory-rows';

interface Machine {
  id: string;
  code: string;
  name: string;
  idealRatePerHour: string | number | null;
  unit: string;
  isActive: boolean;
  notes: string | null;
}

interface MachineOee {
  machineId: string;
  runs: number;
  avgOee: number;
}

interface FormState {
  code: string;
  name: string;
  idealRatePerHour: string;
  unit: string;
  notes: string;
  isActive: boolean;
}

const QUERY_KEY = ['machines-all'];
const blankForm: FormState = { code: '', name: '', idealRatePerHour: '', unit: 'kg', notes: '', isActive: true };
const OEE_DAYS = 30;

const fmtRate = (v: string | number | null) => (v == null ? null : formatNumber(v, { maxDecimals: 3 }));

function payloadOf(m: Machine, patch: Partial<{ isActive: boolean }> = {}) {
  return {
    code: m.code,
    name: m.name,
    idealRatePerHour: m.idealRatePerHour == null ? null : Number(m.idealRatePerHour),
    unit: m.unit || 'kg',
    notes: m.notes,
    isActive: m.isActive,
    ...patch,
  };
}

export default function MachinesTab() {
  const { t } = useTranslation('production');
  const canEdit = can('production', 'edit');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ActiveFilter>('');
  const [sheet, setSheet] = useState<{ edit: Machine | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await api.get<{ data: Machine[] }>('/inventory/machines')).data,
  });
  const oeeRange = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (OEE_DAYS - 1));
    return { startDate: toIsoDate(start), endDate: toIsoDate(today) };
  }, []);
  const oeeQuery = useQuery({
    queryKey: ['inventory-dashboard', 'oee', oeeRange],
    queryFn: async () => (await api.get<{ perMachine: MachineOee[] }>('/inventory/dashboard/oee', { params: oeeRange })).data,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const oeeById = useMemo(() => new Map((oeeQuery.data?.perMachine ?? []).map((m) => [m.machineId, m])), [oeeQuery.data]);
  const showOee = !oeeQuery.isError;

  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const rows = useMemo(
    () => filterMasterRows(all, { search, status }, (m) => [m.code, m.name, m.notes]),
    [all, search, status],
  );
  const counts = countActive(all);
  const missingRate = all.filter((m) => m.isActive && m.idealRatePerHour == null).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['machines-active'] });
    queryClient.invalidateQueries({ queryKey: ['machines-namemap'] });
  };

  const toggleActive = async (m: Machine) => {
    try {
      await api.put(`/inventory/machines/${m.id}`, payloadOf(m, { isActive: !m.isActive }));
      toast.success(m.isActive ? t('machinesTab.toast.deactivated', { name: m.name }) : t('machinesTab.toast.activated', { name: m.name }));
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, t('machinesTab.toast.toggleFailed')));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete(`/inventory/machines/${deleteTarget.id}`);
      toast.success(res.data?.message || t('machinesTab.toast.deleted'));
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, t('machinesTab.toast.deleteFailed')));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<Machine>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: t('machinesTab.columns.code'),
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <span className="num font-mono text-xs text-foreground">{row.original.code}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: t('machinesTab.columns.name'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-36' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium text-foreground">{m.name}</p>
              <p className="num font-mono text-xs text-muted-foreground md:hidden">{m.code}</p>
              {m.notes && <p className="line-clamp-1 text-xs text-muted-foreground max-md:hidden">{m.notes}</p>}
            </div>
          );
        },
      },
      {
        id: 'idealRatePerHour',
        accessorFn: (m) => (m.idealRatePerHour == null ? -1 : Number(m.idealRatePerHour)),
        header: t('machinesTab.columns.idealRate'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original;
          const rate = fmtRate(m.idealRatePerHour);
          return rate != null ? (
            <span className="text-foreground">
              {rate} <span className="text-xs text-muted-foreground">{t('machinesTab.perHour', { unit: m.unit })}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text" title={t('machinesTab.rateMissingTitle')}>
              <AlertTriangle className="size-3.5" aria-hidden />
              {t('machinesTab.rateMissing')}
            </span>
          );
        },
      },
      ...(showOee
        ? ([
            {
              id: 'oee',
              accessorFn: (m) => oeeById.get(m.id)?.avgOee ?? -1,
              header: t('machinesTab.columns.oee', { days: OEE_DAYS }),
              enableSorting: true,
              sortDescFirst: true,
              meta: { align: 'right', hideBelow: 'md' },
              cell: ({ row }) => {
                const o = oeeById.get(row.original.id);
                if (!o || o.runs === 0) return <span className="text-muted-foreground">—</span>;
                return (
                  <span
                    className={cn(
                      'font-medium',
                      o.avgOee >= 85 ? 'text-success-text' : o.avgOee >= 60 ? 'text-foreground' : 'text-danger-text',
                    )}
                  >
                    {formatPercent(o.avgOee / 100, { decimals: 1 })}
                  </span>
                );
              },
            },
            {
              id: 'runs',
              accessorFn: (m) => oeeById.get(m.id)?.runs ?? 0,
              header: t('machinesTab.columns.runs', { days: OEE_DAYS }),
              enableSorting: true,
              sortDescFirst: true,
              meta: { align: 'right', hideBelow: 'lg' },
              cell: ({ row }) => (
                <span className="text-muted-foreground">{formatNumber(oeeById.get(row.original.id)?.runs ?? 0)}</span>
              ),
            },
          ] satisfies ColumnDef<Machine>[])
        : []),
      {
        id: 'status',
        accessorFn: (m) => (m.isActive ? 1 : 0),
        header: t('machinesTab.columns.status'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('machinesTab.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <RowActions
              label={t('machinesTab.actionsFor', { code: m.code })}
              actions={[
                { label: t('machinesTab.actions.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ edit: m }) },
                {
                  label: m.isActive ? t('machinesTab.actions.deactivate') : t('machinesTab.actions.activate'),
                  icon: m.isActive ? PowerOff : Power,
                  hidden: !canEdit,
                  onSelect: () => toggleActive(m),
                },
                { label: t('machinesTab.actions.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(m) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive only closes over stable setters
    [canEdit, showOee, oeeById, t],
  );

  return (
    <div className="space-y-4">
      <InfoNote>
        {t('machinesTab.info')}
        {missingRate > 0 && (
          <span className="mt-1 block font-medium text-warning-text">
            {t('machinesTab.missingRate', { count: missingRate, value: formatNumber(missingRate) })}
          </span>
        )}
      </InfoNote>

      <MasterToolbar
        search={search}
        onSearch={setSearch}
        searchLabel={t('machinesTab.searchLabel')}
        searchPlaceholder={t('machinesTab.searchPlaceholder')}
        status={status}
        onStatus={setStatus}
        summary={all.length > 0 ? t('machinesTab.summary', { total: formatNumber(counts.total), active: formatNumber(counts.active) }) : undefined}
        action={
          canEdit && (
            <Button onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              {t('machinesTab.newMachine')}
            </Button>
          )
        }
      />

      <DataTable
        label={t('machinesTab.tableLabel')}
        itemLabel={t('machinesTab.itemLabel')}
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
        onRowClick={canEdit ? (m) => setSheet({ edit: m }) : undefined}
        rowClassName={(m) => (m.isActive ? undefined : 'text-muted-foreground')}
        pageSize={25}
        empty={{
          title: t('machinesTab.empty.title'),
          description: t('machinesTab.empty.description'),
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              {t('machinesTab.empty.action')}
            </Button>
          ) : undefined,
        }}
      />

      {sheet && (
        <MachineFormSheet
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
        title={t('machinesTab.deleteDialog.title')}
        description={t('machinesTab.deleteDialog.description', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('machinesTab.deleteDialog.confirm')}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function MachineFormSheet({ editTarget, onClose, onSaved }: { editTarget: Machine | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('production');
  const isEdit = !!editTarget;
  const switchId = useId();
  const [form, setForm] = useState<FormState>(() =>
    editTarget
      ? {
          code: editTarget.code,
          name: editTarget.name,
          idealRatePerHour: editTarget.idealRatePerHour != null ? String(Number(editTarget.idealRatePerHour)) : '',
          unit: editTarget.unit ?? 'kg',
          notes: editTarget.notes ?? '',
          isActive: editTarget.isActive,
        }
      : blankForm,
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = touched ? validateMachine(form) : {};
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const unit = form.unit.trim() || 'kg';

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (hasErrors(validateMachine(form))) return;
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        idealRatePerHour: parseOptionalNonNegative(form.idealRatePerHour).value,
        unit,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      };
      if (isEdit) {
        await api.put(`/inventory/machines/${editTarget.id}`, payload);
        toast.success(t('machinesTab.toast.updated'));
      } else {
        await api.post('/inventory/machines', payload);
        toast.success(t('machinesTab.toast.created'));
      }
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err, t('machinesTab.toast.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? t('machinesTab.form.editTitle') : t('machinesTab.form.newTitle')}
      description={t('machinesTab.form.description')}
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? t('machinesTab.form.saveChanges') : t('machinesTab.form.save')}
      onSubmit={submit}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('machinesTab.form.code')} required error={errors.code}>
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="MSN-PELLET-01" maxLength={50} />
        </Field>
        <Field label={t('machinesTab.form.unit')} hint={t('machinesTab.form.unitHint')} error={errors.unit}>
          <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="kg" maxLength={20} />
        </Field>
      </div>
      <Field label={t('machinesTab.form.name')} required error={errors.name}>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('machinesTab.form.namePlaceholder')} maxLength={150} />
      </Field>
      <Field
        label={t('machinesTab.form.idealRate', { unit })}
        hint={t('machinesTab.form.idealRateHint')}
        error={errors.idealRatePerHour}
      >
        <FormNumberInput
          value={form.idealRatePerHour}
          onChange={(e) => set('idealRatePerHour', e.target.value)}
          min={0}
          step="0.001"
          placeholder={t('machinesTab.form.idealRatePlaceholder')}
          className="num text-right"
        />
      </Field>
      <Field label={t('machinesTab.form.notes')}>
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('machinesTab.form.notesPlaceholder')} rows={3} />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
        <div>
          <label htmlFor={switchId} className="text-sm font-medium text-foreground">
            {t('machinesTab.form.active')}
          </label>
          <p className="text-xs text-muted-foreground">{t('machinesTab.form.activeHint')}</p>
        </div>
        <Switch id={switchId} checked={form.isActive} onCheckedChange={(v: boolean) => set('isActive', v)} />
      </div>
    </FormSheet>
  );
}

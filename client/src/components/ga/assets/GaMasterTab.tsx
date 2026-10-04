/**
 * One Data Induk Aset entity: searchable table (+ Aktif/Nonaktif filter where
 * the entity has isActive), side-sheet form, activate/deactivate and delete.
 * Writes are hidden without can('ga_master','edit').
 */
import { useId, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, PowerOff, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog, DataTable, Field, RowActions, StatusBadge } from '@/components/shared';
import { FormSheet, InfoNote, MasterToolbar } from '@/components/inventory/master-data-kit';
import { countActive, filterMasterRows, type ActiveFilter } from '@/components/inventory/master-data';
import { apiErrorMessage } from './asset-model';
import { masterPayload, validateMaster, type MasterEntity, type MasterRow } from './master-config';
import { OptionSelect } from './OptionSelect';
import { masterOptions, useGaMaster } from './useGaMaster';

interface GaMasterTabProps {
  entity: MasterEntity;
  canEdit: boolean;
}

const asActiveRow = (r: MasterRow) => ({ ...r, isActive: r.isActive ?? true });

export function GaMasterTab({ entity, canEdit }: GaMasterTabProps) {
  const queryClient = useQueryClient();
  const query = useGaMaster<MasterRow>(entity.id);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ActiveFilter>('');
  const [sheet, setSheet] = useState<{ row: MasterRow | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MasterRow | null>(null);

  const all = useMemo(() => (query.data ?? []).map(asActiveRow), [query.data]);
  const rows = useMemo(
    () =>
      filterMasterRows(all, { search, status: entity.hasActive ? status : '' }, (r) => [
        r.code,
        r.name,
        ...(entity.searchText?.(r) ?? []),
      ]),
    [all, search, status, entity],
  );
  const counts = countActive(all);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ga-master', entity.id] });

  const toggleActive = async (row: MasterRow) => {
    const form = Object.fromEntries(entity.fields.map((f) => [f.key, String(row[f.key] ?? '')]));
    try {
      await api.put(`/ga/master/${entity.id}/${row.id}`, masterPayload(entity, form, !row.isActive));
      toast.success(row.isActive ? `"${row.name}" dinonaktifkan.` : `"${row.name}" diaktifkan.`);
      invalidate();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal mengubah status.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/ga/master/${entity.id}/${deleteTarget.id}`);
      toast.success('Data dihapus.');
      invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Gagal menghapus data. Data yang sudah dipakai tidak bisa dihapus.'));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<MasterRow>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Kode',
        enableSorting: true,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <span className="num font-mono text-xs text-foreground">{row.original.code}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Nama',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="break-words font-medium text-foreground">{r.name}</p>
              {r.branch?.name && <p className="text-xs text-muted-foreground md:hidden">{r.branch.name}</p>}
              {entity.hasActive && <StatusBadge status={r.isActive ? 'active' : 'inactive'} className="mt-0.5 sm:hidden" />}
            </div>
          );
        },
      },
      ...entity.extraColumns.map<ColumnDef<MasterRow>>((c) => ({
        id: c.id,
        header: c.header,
        meta: { hideBelow: c.hideBelow, cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => c.render(row.original),
      })),
      ...(entity.hasActive
        ? [
            {
              id: 'status',
              accessorFn: (r: MasterRow) => (r.isActive ? 1 : 0),
              header: 'Status',
              enableSorting: true,
              meta: { hideBelow: 'sm' as const },
              cell: ({ row }: { row: { original: MasterRow } }) => (
                <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />
              ),
            } satisfies ColumnDef<MasterRow>,
          ]
        : []),
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${r.code}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ row: r }) },
                {
                  label: r.isActive ? 'Nonaktifkan' : 'Aktifkan',
                  icon: r.isActive ? PowerOff : Power,
                  hidden: !canEdit || !entity.hasActive,
                  onSelect: () => toggleActive(r),
                },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(r) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive only closes over stable setters
    [canEdit, entity],
  );

  const summary =
    all.length > 0
      ? entity.hasActive
        ? `${formatNumber(counts.total)} ${entity.noun} · ${formatNumber(counts.active)} aktif`
        : `${formatNumber(all.length)} ${entity.noun}`
      : undefined;
  const createAction = canEdit && (
    <Button onClick={() => setSheet({ row: null })}>
      <Plus aria-hidden />
      Tambah
    </Button>
  );

  return (
    <div className="space-y-4">
      <InfoNote>{entity.info}</InfoNote>

      {entity.hasActive ? (
        <MasterToolbar
          search={search}
          onSearch={setSearch}
          searchLabel={`Cari ${entity.noun}`}
          searchPlaceholder="Cari kode atau nama"
          status={status}
          onStatus={setStatus}
          summary={summary}
          action={createAction}
        />
      ) : (
        <SearchToolbar search={search} onSearch={setSearch} label={`Cari ${entity.noun}`} summary={summary} action={createAction} />
      )}

      <DataTable
        label={`Daftar ${entity.noun}`}
        itemLabel={entity.noun}
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
        onRowClick={canEdit ? (r) => setSheet({ row: r }) : undefined}
        rowClassName={(r) => (r.isActive ? undefined : 'text-muted-foreground')}
        pageSize={25}
        empty={{
          title: `Belum ada ${entity.noun}`,
          description: entity.info,
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ row: null })}>
              <Plus aria-hidden />
              Tambah {entity.noun}
            </Button>
          ) : undefined,
        }}
      />

      {sheet && (
        <MasterFormSheet
          key={sheet.row?.id ?? 'new'}
          entity={entity}
          row={sheet.row}
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
        title={`Hapus ${entity.noun}?`}
        description={`Hapus "${deleteTarget?.name ?? ''}"? Data yang sudah dipakai aset atau dokumen tidak bisa dihapus${entity.hasActive ? ' — nonaktifkan saja' : ''}.`}
        confirmLabel="Ya, hapus"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function SearchToolbar({
  search,
  onSearch,
  label,
  summary,
  action,
}: {
  search: string;
  onSearch: (v: string) => void;
  label: string;
  summary?: string;
  action?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div role="search" aria-label="Filter daftar" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-auto sm:min-w-60 sm:max-w-sm sm:flex-1">
        <label htmlFor={`${id}-q`} className="sr-only">
          {label}
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={`${id}-q`}
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Cari kode atau nama"
          autoComplete="off"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch('')}
            aria-label="Hapus pencarian"
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {action && <div className="ml-auto flex items-center gap-2 sm:order-last">{action}</div>}
      {summary && <p className="num order-last w-full text-xs text-muted-foreground sm:order-none sm:w-auto">{summary}</p>}
    </div>
  );
}

function MasterFormSheet({
  entity,
  row,
  onClose,
  onSaved,
}: {
  entity: MasterEntity;
  row: MasterRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const switchId = useId();
  const needsBranches = entity.fields.some((f) => f.type === 'branch');
  const branches = useGaMaster('branches', needsBranches);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(entity.fields.map((f) => [f.key, row ? String(row[f.key] ?? '') : (f.defaultValue ?? '')])),
  );
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = touched ? validateMaster(entity, form) : {};
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(validateMaster(entity, form)).length > 0) return;
    setSaving(true);
    try {
      const payload = masterPayload(entity, form, isActive);
      if (isEdit) await api.put(`/ga/master/${entity.id}/${row.id}`, payload);
      else await api.post(`/ga/master/${entity.id}`, payload);
      toast.success(isEdit ? 'Data diperbarui.' : 'Data dibuat.');
      onSaved();
    } catch (err) {
      setServerError(apiErrorMessage(err, 'Gagal menyimpan data.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? `Edit ${entity.noun}` : `${entity.label} baru`}
      description={isEdit ? `${row.code} — ${row.name}` : entity.info}
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan'}
      onSubmit={submit}
    >
      {entity.fields.map((f) => (
        <Field key={f.key} label={f.label} required={f.required} hint={f.hint} error={errors[f.key]}>
          {f.type === 'branch' ? (
            <OptionSelect
              value={form[f.key] ?? ''}
              onChange={(v) => set(f.key, v)}
              options={masterOptions(branches.data, row?.branchId)}
              placeholder={branches.isLoading ? 'Memuat…' : 'Pilih cabang'}
            />
          ) : f.type === 'select' ? (
            <OptionSelect value={form[f.key] ?? ''} onChange={(v) => set(f.key, v)} options={f.options ?? []} />
          ) : (
            <Input
              value={form[f.key] ?? ''}
              onChange={(e) => set(f.key, e.target.value)}
              maxLength={f.maxLength}
              placeholder={f.placeholder}
              className={f.key === 'code' ? 'font-mono' : undefined}
            />
          )}
        </Field>
      ))}
      {entity.hasActive && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div>
            <label htmlFor={switchId} className="text-sm font-medium text-foreground">
              Aktif
            </label>
            <p className="text-xs text-muted-foreground">Data nonaktif tidak ditawarkan saat membuat aset baru.</p>
          </div>
          <Switch id={switchId} checked={isActive} onCheckedChange={(v: boolean) => setIsActive(v)} />
        </div>
      )}
    </FormSheet>
  );
}

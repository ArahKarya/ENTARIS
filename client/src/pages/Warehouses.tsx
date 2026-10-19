/** Warehouse master (/warehouses). GET /warehouses returns every warehouse, so filtering runs in memory. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Pause, Pencil, Play, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { can, cap } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog, DataTable, FilterBar, Field, PageHeader, RowActions, StatusBadge } from '@/components/shared';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  itemCount?: number;
  totalStock?: number;
}

interface WarehousePayload {
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
}

const FILTER_KEYS = ['status'] as const;

const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

const matches = (w: Warehouse, q: string) =>
  [w.code, w.name, w.location, w.description].some((v) => v?.toLowerCase().includes(q));

/** "Default" marker with text, so it does not rely on the star colour alone. */
function DefaultMark() {
  const { t } = useTranslation('inventory');
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium leading-none text-warning-text">
      <Star className="size-3 fill-current" aria-hidden />
      {t('warehouses.defaultMark')}
    </span>
  );
}

export const Warehouses = () => {
  const { t } = useTranslation('inventory');
  const statusFilter = useMemo(
    () => [
      { value: 'active', label: t('warehouses.filters.active') },
      { value: 'inactive', label: t('warehouses.filters.inactive') },
    ],
    [t],
  );
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Warehouse | null>(null);
  const canEdit = can('warehouse', 'edit');
  // DELETE /warehouses/:id additionally requires the doc.cancel capability.
  const canDelete = canEdit && cap('doc.cancel');

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data.data as Warehouse[],
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/warehouses/${id}`),
    onSuccess: () => {
      toast.success(t('warehouses.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(errorMessage(e, t('warehouses.toast.deleteFailed'))),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/warehouses/${id}`, { isActive }),
    onSuccess: (_res, vars) => {
      toast.success(vars.isActive ? t('warehouses.toast.activated') : t('warehouses.toast.deactivated'));
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setDeactivateTarget(null);
    },
    onError: (e) => toast.error(errorMessage(e, t('warehouses.toast.toggleFailed'))),
  });

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };
  const openEdit = (w: Warehouse) => {
    setEditTarget(w);
    setIsModalOpen(true);
  };

  const { search, filters } = list;
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return (warehousesQuery.data ?? []).filter(
      (w) => (!q || matches(w, q)) && (!filters.status || (filters.status === 'active') === w.isActive),
    );
  }, [warehousesQuery.data, search, filters]);

  const columns = useMemo<ColumnDef<Warehouse>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (w) => w.name,
        header: t('warehouses.columns.warehouse'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-40 max-w-52 sm:max-w-96' },
        cell: ({ row }) => {
          const w = row.original;
          return (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-medium text-foreground">{w.name}</p>
                {w.isDefault && <DefaultMark />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{w.code}</span>
                {/* Mobile: location stacked here because its column is hidden. */}
                {w.location && <span className="md:hidden"> · {w.location}</span>}
              </p>
              {w.description && (
                <p className="hidden truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden lg:block">
                  {w.description}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'location',
        accessorFn: (w) => w.location ?? '',
        header: t('warehouses.columns.location'),
        enableSorting: true,
        meta: {
          hideBelow: 'md',
          cellClassName: 'max-w-56 truncate text-muted-foreground',
        },
        cell: ({ row }) => row.original.location || '—',
      },
      {
        id: 'itemCount',
        accessorFn: (w) => w.itemCount ?? 0,
        header: t('warehouses.columns.itemCount'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ getValue }) => formatNumber(getValue<number>()),
      },
      {
        id: 'totalStock',
        accessorFn: (w) => Number(w.totalStock ?? 0),
        header: t('warehouses.columns.totalStock'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ getValue }) => formatNumber(getValue<number>(), { maxDecimals: 3 }),
      },
      {
        id: 'status',
        accessorFn: (w) => (w.isActive ? 0 : 1),
        header: t('warehouses.columns.status'),
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'Active' : 'Inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('warehouses.columns.actions')}</span>,
        meta: {
          align: 'right',
          headerClassName: 'w-12',
          cellClassName: 'w-12 py-0',
        },
        cell: ({ row }) => {
          const w = row.original;
          return (
            <RowActions
              label={t('warehouses.rowActions.label', { name: w.name })}
              actions={[
                {
                  label: t('warehouses.rowActions.edit'),
                  icon: Pencil,
                  hidden: !canEdit,
                  onSelect: () => openEdit(w),
                },
                {
                  label: w.isActive ? t('warehouses.rowActions.deactivate') : t('warehouses.rowActions.activate'),
                  icon: w.isActive ? Pause : Play,
                  hidden: !canEdit,
                  disabled: toggleMut.isPending,
                  onSelect: () =>
                    w.isActive ? setDeactivateTarget(w) : toggleMut.mutate({ id: w.id, isActive: true }),
                },
                {
                  label: t('warehouses.rowActions.delete'),
                  icon: Trash2,
                  tone: 'danger',
                  // The default warehouse cannot be deleted (server rule).
                  hidden: !canDelete || w.isDefault,
                  onSelect: () => setDeleteTarget(w),
                },
              ]}
            />
          );
        },
      },
    ],
    // Setters/openEdit are stable enough; re-create when pending flags flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete, toggleMut.isPending, t],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('warehouses.title')}
        description={t('warehouses.description')}
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('warehouses.create')}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('warehouses.filters.searchLabel')}
          searchPlaceholder={t('warehouses.filters.searchPlaceholder')}
          status={{ options: statusFilter }}
        />

        <DataTable
          label={t('warehouses.table.label')}
          itemLabel={t('warehouses.table.itemLabel')}
          columns={columns}
          data={warehousesQuery.data ? rows : undefined}
          getRowId={(row) => row.id}
          pageSize={25}
          loading={warehousesQuery.isLoading}
          error={warehousesQuery.error}
          onRetry={() => warehousesQuery.refetch()}
          filtered={list.hasActiveFilters}
          onClearFilters={list.resetFilters}
          onRowClick={canEdit ? openEdit : undefined}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('warehouses.empty.title'),
            description: t('warehouses.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('warehouses.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <WarehouseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditTarget(null);
        }}
        editTarget={editTarget}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title={t('warehouses.deactivateDialog.title')}
        description={
          deactivateTarget ? (
            <>
              <Trans
                t={t}
                i18nKey="warehouses.deactivateDialog.description"
                values={{ name: deactivateTarget.name }}
                components={{ strong: <strong /> }}
              />
              {deactivateTarget.isDefault && <> {t('warehouses.deactivateDialog.defaultNote')}</>}
            </>
          ) : null
        }
        confirmLabel={t('warehouses.deactivateDialog.confirm')}
        loading={toggleMut.isPending}
        onConfirm={() =>
          deactivateTarget
            ? toggleMut.mutateAsync({
                id: deactivateTarget.id,
                isActive: false,
              })
            : undefined
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title={t('warehouses.deleteDialog.title')}
        description={
          deleteTarget ? (
            <>
              <Trans
                t={t}
                i18nKey="warehouses.deleteDialog.description"
                values={{ name: deleteTarget.name }}
                components={{ strong: <strong /> }}
              />
            </>
          ) : null
        }
        confirmLabel={t('warehouses.deleteDialog.confirm')}
        loading={deleteMut.isPending}
        onConfirm={() => (deleteTarget ? deleteMut.mutateAsync(deleteTarget.id) : undefined)}
      />
    </div>
  );
};

export default Warehouses;

// Modal
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTarget: Warehouse | null;
}

function WarehouseModal({ isOpen, onClose, editTarget }: ModalProps) {
  const { t } = useTranslation('inventory');
  const isEdit = Boolean(editTarget?.id);
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    code?: string;
    name?: string;
  }>({});

  // Hydrate form whenever the modal opens (with or without edit target).
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget) {
      setCode(editTarget.code);
      setName(editTarget.name);
      setLocation(editTarget.location ?? '');
      setDescription(editTarget.description ?? '');
      setIsActive(editTarget.isActive);
      setIsDefault(editTarget.isDefault);
      setSortOrder(editTarget.sortOrder ?? 0);
    } else {
      setCode('');
      setName('');
      setLocation('');
      setDescription('');
      setIsActive(true);
      setIsDefault(false);
      setSortOrder(0);
    }
    setError('');
    setFieldErrors({});
    // Re-hydrate only when the modal opens or the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editTarget?.id]);

  const mutation = useMutation({
    mutationFn: async (data: WarehousePayload) => {
      const res = isEdit ? await api.put(`/warehouses/${editTarget!.id}`, data) : await api.post('/warehouses', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? t('warehouses.modal.toast.updated') : t('warehouses.modal.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e, t('warehouses.modal.toast.saveFailed'))),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const nextErrors = {
      code: code.trim() ? undefined : t('warehouses.modal.errors.codeRequired'),
      name: name.trim() ? undefined : t('warehouses.modal.errors.nameRequired'),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.code || nextErrors.name) return;
    mutation.mutate({
      code: code.trim(),
      name: name.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      isActive,
      isDefault,
      sortOrder,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? t('warehouses.modal.editTitle') : t('warehouses.modal.createTitle')}</DialogTitle>
            <DialogDescription>{t('warehouses.modal.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label={t('warehouses.modal.fields.code')} required error={fieldErrors.code} hint={t('warehouses.modal.fields.codeHint')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('warehouses.modal.fields.codePlaceholder')}
                maxLength={30}
                autoComplete="off"
              />
            </Field>
            <Field label={t('warehouses.modal.fields.name')} required error={fieldErrors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('warehouses.modal.fields.namePlaceholder')}
                maxLength={100}
              />
            </Field>
            <Field label={t('warehouses.modal.fields.location')}>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('warehouses.modal.fields.locationPlaceholder')}
                maxLength={200}
              />
            </Field>
            <Field label={t('warehouses.modal.fields.description')}>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="inline-flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 rounded accent-primary"
                />
                {t('warehouses.modal.fields.active')}
              </label>
              <label className="inline-flex items-center gap-2 text-foreground">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="size-4 rounded accent-primary"
                />
                {t('warehouses.modal.fields.isDefault')}
              </label>
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger-text"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('warehouses.modal.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {isEdit ? t('warehouses.modal.save') : t('warehouses.modal.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

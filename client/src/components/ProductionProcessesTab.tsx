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
      toast.success(p.isActive ? `Proses "${p.name}" dinonaktifkan.` : `Proses "${p.name}" diaktifkan.`);
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah status proses.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete(`/inventory/production-processes/${deleteTarget.id}`);
      toast.success(res.data?.message || 'Proses dihapus.');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus proses.'));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<ProductionProcess>[]>(
    () => [
      {
        id: 'sortOrder',
        accessorKey: 'sortOrder',
        header: 'Urutan',
        enableSorting: true,
        meta: { align: 'right', hideBelow: 'sm', headerClassName: 'w-24' },
        cell: ({ row }) => <span className="text-muted-foreground">{formatNumber(row.original.sortOrder)}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Nama Proses',
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
        header: 'Status',
        enableSorting: true,
        meta: { headerClassName: 'w-28' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${p.name}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ edit: p }) },
                {
                  label: p.isActive ? 'Nonaktifkan' : 'Aktifkan',
                  icon: p.isActive ? PowerOff : Power,
                  hidden: !canEdit,
                  onSelect: () => toggleActive(p),
                },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => setDeleteTarget(p) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive only closes over stable setters
    [canEdit, canDelete],
  );

  return (
    <div className="space-y-4">
      <InfoNote>
        Daftar proses yang dipilih staf saat mencatat produksi (mis. Drying, Huller, Polishing, Packing). Hanya untuk
        ketertelusuran — tidak ada biaya atau gerakan stok yang terkait ke proses.
      </InfoNote>

      <MasterToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Cari proses"
        searchPlaceholder="Cari nama atau keterangan"
        status={status}
        onStatus={setStatus}
        summary={all.length > 0 ? `${formatNumber(counts.total)} proses · ${formatNumber(counts.active)} aktif` : undefined}
        action={
          canEdit && (
            <Button onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Proses Baru
            </Button>
          )
        }
      />

      <DataTable
        label="Daftar master proses"
        itemLabel="proses"
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
          title: 'Belum ada master proses',
          description: 'Tambahkan proses seperti Drying, Huller, Polishing, atau Packing.',
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Tambah proses pertama
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
        title="Hapus proses?"
        description={`Hapus proses "${deleteTarget?.name ?? ''}"? Jika sudah dipakai di produksi, proses akan dinonaktifkan agar histori tetap utuh.`}
        confirmLabel="Ya, hapus"
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
        toast.success('Proses diperbarui.');
      } else {
        await api.post('/inventory/production-processes', payload);
        toast.success('Proses dibuat.');
      }
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err, 'Gagal menyimpan proses.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? 'Edit proses produksi' : 'Proses produksi baru'}
      description="Master ketertelusuran — tidak memposting jurnal atau stok."
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan proses'}
      onSubmit={submit}
    >
      <Field label="Nama proses" required error={errors.name}>
        <Input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => form.name && setTouched(true)}
          placeholder="Drying / Huller / Polishing / Packing"
          maxLength={100}
        />
      </Field>
      <Field label="Keterangan">
        <Textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Mis. mengeringkan gabah dengan dryer vertikal sampai kadar air 14%"
          rows={3}
        />
      </Field>
      <Field label="Urutan tampil" hint="Angka kecil tampil lebih dulu saat memilih proses di input produksi." error={errors.sortOrder}>
        <FormNumberInput value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} step={1} className="w-32" />
      </Field>
    </FormSheet>
  );
}

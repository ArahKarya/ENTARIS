/**
 * Proses Produksi → Mesin (?view=machines). Machine master for OEE: the ideal
 * capacity (unit/hour) drives the Performance factor. The list also shows each
 * machine's average OEE over the last 30 days (/inventory/dashboard/oee —
 * inventory module; hidden when that read is not permitted).
 * Writes need can('production','edit') (server: requireWrite('production')).
 */
import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
      toast.success(m.isActive ? `Mesin "${m.name}" dinonaktifkan.` : `Mesin "${m.name}" diaktifkan.`);
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah status mesin.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete(`/inventory/machines/${deleteTarget.id}`);
      toast.success(res.data?.message || 'Mesin dihapus.');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus mesin.'));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<Machine>[]>(
    () => [
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Kode',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <span className="num font-mono text-xs text-foreground">{row.original.code}</span>,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Nama Mesin',
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
        header: 'Kapasitas Ideal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original;
          const rate = fmtRate(m.idealRatePerHour);
          return rate != null ? (
            <span className="text-foreground">
              {rate} <span className="text-xs text-muted-foreground">{m.unit}/jam</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text" title="Performance OEE tidak terhitung">
              <AlertTriangle className="size-3.5" aria-hidden />
              Belum diisi
            </span>
          );
        },
      },
      ...(showOee
        ? ([
            {
              id: 'oee',
              accessorFn: (m) => oeeById.get(m.id)?.avgOee ?? -1,
              header: `OEE ${OEE_DAYS} hr`,
              enableSorting: true,
              sortDescFirst: true,
              meta: { align: 'right', hideBelow: 'md' },
              cell: ({ row }) => {
                const o = oeeById.get(row.original.id);
                if (!o || o.runs === 0) return <span className="text-muted-foreground">-</span>;
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
              header: `Proses ${OEE_DAYS} hr`,
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
        header: 'Status',
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${m.code}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ edit: m }) },
                {
                  label: m.isActive ? 'Nonaktifkan' : 'Aktifkan',
                  icon: m.isActive ? PowerOff : Power,
                  hidden: !canEdit,
                  onSelect: () => toggleActive(m),
                },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(m) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toggleActive only closes over stable setters
    [canEdit, showOee, oeeById],
  );

  return (
    <div className="space-y-4">
      <InfoNote>
        Mesin produksi beserta kapasitas idealnya per jam. Kapasitas dipakai untuk menghitung Performance pada OEE
        (Overall Equipment Effectiveness) saat produksi dicatat.
        {missingRate > 0 && (
          <span className="mt-1 block font-medium text-warning-text">
            {formatNumber(missingRate)} mesin aktif belum punya kapasitas ideal — Performance OEE-nya tidak terhitung.
          </span>
        )}
      </InfoNote>

      <MasterToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Cari mesin"
        searchPlaceholder="Cari kode, nama, atau catatan"
        status={status}
        onStatus={setStatus}
        summary={all.length > 0 ? `${formatNumber(counts.total)} mesin · ${formatNumber(counts.active)} aktif` : undefined}
        action={
          canEdit && (
            <Button onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Mesin Baru
            </Button>
          )
        }
      />

      <DataTable
        label="Daftar mesin"
        itemLabel="mesin"
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
          title: 'Belum ada master mesin',
          description: 'Tambahkan mesin produksi (mis. Mesin Pellet 1) beserta kapasitas idealnya.',
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Tambah mesin pertama
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
        title="Hapus mesin?"
        description={`Hapus mesin "${deleteTarget?.name ?? ''}"? Mesin yang sudah dipakai di produksi tidak bisa dihapus — nonaktifkan saja agar histori OEE tetap utuh.`}
        confirmLabel="Ya, hapus"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function MachineFormSheet({ editTarget, onClose, onSaved }: { editTarget: Machine | null; onClose: () => void; onSaved: () => void }) {
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
        toast.success('Mesin diperbarui.');
      } else {
        await api.post('/inventory/machines', payload);
        toast.success('Mesin dibuat.');
      }
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err, 'Gagal menyimpan mesin.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? 'Edit mesin' : 'Mesin baru'}
      description="Master mesin untuk perhitungan OEE."
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan mesin'}
      onSubmit={submit}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kode" required error={errors.code}>
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="MSN-PELLET-01" maxLength={50} />
        </Field>
        <Field label="Satuan" hint="Default kg" error={errors.unit}>
          <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="kg" maxLength={20} />
        </Field>
      </div>
      <Field label="Nama mesin" required error={errors.name}>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mesin Pellet 1" maxLength={150} />
      </Field>
      <Field
        label={`Kapasitas ideal (${unit}/jam)`}
        hint="Output maksimal mesin per jam; dipakai untuk komponen Performance OEE. Kosongkan bila belum diketahui."
        error={errors.idealRatePerHour}
      >
        <FormNumberInput
          value={form.idealRatePerHour}
          onChange={(e) => set('idealRatePerHour', e.target.value)}
          min={0}
          step="0.001"
          placeholder="Mis. 1000"
          className="num text-right"
        />
      </Field>
      <Field label="Catatan">
        <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Keterangan tambahan…" rows={3} />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
        <div>
          <label htmlFor={switchId} className="text-sm font-medium text-foreground">
            Mesin aktif
          </label>
          <p className="text-xs text-muted-foreground">Mesin nonaktif tidak muncul saat mencatat produksi.</p>
        </div>
        <Switch id={switchId} checked={form.isActive} onCheckedChange={(v: boolean) => set('isActive', v)} />
      </div>
    </FormSheet>
  );
}

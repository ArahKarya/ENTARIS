/**
 * Proses Produksi → Standar Biaya (?view=costStandards). Standard conversion
 * cost rates used when a production run computes its loaded HPP/kg. The
 * master never posts to the GL; editing it does not change historical HPP
 * (each run keeps a snapshot).
 *
 * The warehouse filter is sent to the API (?warehouseId → standards for that
 * warehouse plus the global ones); search, side and status filter in memory.
 * Writes need can('production','edit'); delete also needs cap('doc.cancel')
 * (server: a used standard is deactivated instead of deleted).
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can, cap } from '@/lib/permissions';
import { formatNumber, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ComboboxFilter, ConfirmDialog, DataTable, Field, RowActions, StatusBadge } from '@/components/shared';
import { SelectFilter, WarehouseFilter } from '@/components/inventory/filters';
import { ChoiceCards, FormNumberInput, FormSection, FormSheet, InfoNote, MasterToolbar } from '@/components/inventory/master-data-kit';
import {
  countActive,
  filterMasterRows,
  hasErrors,
  validateCostStandard,
  type ActiveFilter,
} from '@/components/inventory/master-data';
import { errorMessage } from '@/components/inventory/inventory-rows';

type CostSide = 'InputSide' | 'OutputSide';
type Basis = 'InputQty' | 'OutputQty' | 'Fixed';

interface CostStandard {
  id: string;
  name: string;
  description: string | null;
  costSide: CostSide;
  basis: Basis;
  defaultRate: string | number;
  isActive: boolean;
  costAccountId: string | null;
  costAccount: { id: string; accountNumber: string; name: string } | null;
  itemId: string | null;
  item: { id: string; code: string; name: string; unit: string } | null;
  warehouseId: string | null;
  warehouse: { id: string; code: string; name: string } | null;
}

interface FormState {
  name: string;
  description: string;
  costSide: CostSide;
  basis: Basis;
  defaultRate: string;
  costAccountId: string;
  itemId: string;
  warehouseId: string;
}

const blankForm: FormState = {
  name: '',
  description: '',
  costSide: 'InputSide',
  basis: 'InputQty',
  defaultRate: '',
  costAccountId: '',
  itemId: '',
  warehouseId: '',
};

const SIDE_LABEL: Record<CostSide, string> = { InputSide: 'Sisi input', OutputSide: 'Sisi output' };
const BASIS_LABEL: Record<Basis, string> = { InputQty: 'Per kg input', OutputQty: 'Per kg output', Fixed: 'Tetap per proses' };
const BASIS_UNIT: Record<Basis, string> = { InputQty: '/kg input', OutputQty: '/kg output', Fixed: '/proses' };
const SIDE_FILTER = [
  { value: 'InputSide', label: 'Sisi input' },
  { value: 'OutputSide', label: 'Sisi output' },
];

const fmtRate = (v: string | number) => formatRupiah(v, { decimals: Number(v) % 1 === 0 ? 0 : 2 });

export default function ProductionCostStandardsTab() {
  const canEdit = can('production', 'edit');
  const canDelete = canEdit && cap('doc.cancel');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ActiveFilter>('');
  const [side, setSide] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [sheet, setSheet] = useState<{ edit: CostStandard | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CostStandard | null>(null);

  const query = useQuery({
    queryKey: ['production-cost-standards', warehouseId],
    queryFn: async () =>
      (
        await api.get<{ data: CostStandard[] }>('/inventory/production-cost-standards', {
          params: warehouseId ? { warehouseId } : {},
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const all = useMemo(() => query.data?.data ?? [], [query.data]);
  const rows = useMemo(
    () =>
      filterMasterRows(all, { search, status }, (s) => [s.name, s.description, s.item?.name, s.costAccount?.name]).filter(
        (s) => !side || s.costSide === side,
      ),
    [all, search, status, side],
  );
  const counts = countActive(all);
  const inputCount = all.filter((s) => s.costSide === 'InputSide').length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['production-cost-standards'] });

  const toggleActive = async (s: CostStandard) => {
    try {
      await api.put(`/inventory/production-cost-standards/${s.id}`, { isActive: !s.isActive });
      toast.success(s.isActive ? `Standar "${s.name}" dinonaktifkan.` : `Standar "${s.name}" diaktifkan.`);
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengubah status standar biaya.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api.delete(`/inventory/production-cost-standards/${deleteTarget.id}`);
      toast.success(res.data?.message || 'Standar biaya dihapus.');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal menghapus standar biaya.'));
      throw err;
    }
  };

  const columns = useMemo<ColumnDef<CostStandard>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Standar Biaya',
        enableSorting: true,
        meta: { cellClassName: 'min-w-40 max-w-80' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium text-foreground">{s.name}</p>
              {s.description && <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>}
              <p className="text-xs text-muted-foreground md:hidden">
                {SIDE_LABEL[s.costSide]} · {BASIS_LABEL[s.basis]}
              </p>
            </div>
          );
        },
      },
      {
        id: 'costSide',
        accessorKey: 'costSide',
        header: 'Sisi',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const input = row.original.costSide === 'InputSide';
          const Icon = input ? ArrowDownToLine : ArrowUpFromLine;
          return (
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <Icon className={input ? 'size-4 text-info-text' : 'size-4 text-success-text'} aria-hidden />
              {input ? 'Input' : 'Output'}
            </span>
          );
        },
      },
      {
        id: 'basis',
        accessorKey: 'basis',
        header: 'Basis',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => BASIS_LABEL[row.original.basis],
      },
      {
        id: 'defaultRate',
        accessorFn: (s) => Number(s.defaultRate),
        header: 'Tarif',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-foreground">
            {fmtRate(row.original.defaultRate)}
            <span className="ml-1 text-xs text-muted-foreground">{BASIS_UNIT[row.original.basis]}</span>
          </span>
        ),
      },
      {
        id: 'scope',
        header: 'Lingkup',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-56' },
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="min-w-0 text-xs">
              <p className="truncate text-foreground">{s.warehouse ? `${s.warehouse.code} — ${s.warehouse.name}` : 'Semua gudang'}</p>
              <p className="truncate text-muted-foreground">{s.item ? s.item.name : 'Semua item'}</p>
            </div>
          );
        },
      },
      {
        id: 'account',
        header: 'Akun (tag)',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-48 text-xs' },
        cell: ({ row }) => {
          const a = row.original.costAccount;
          return a ? (
            <span className="block truncate" title={`${a.accountNumber} — ${a.name}`}>
              <span className="num font-mono">{a.accountNumber}</span> <span className="text-muted-foreground">{a.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: 'status',
        accessorFn: (s) => (s.isActive ? 1 : 0),
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
          const s = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${s.name}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setSheet({ edit: s }) },
                {
                  label: s.isActive ? 'Nonaktifkan' : 'Aktifkan',
                  icon: s.isActive ? PowerOff : Power,
                  hidden: !canEdit,
                  onSelect: () => toggleActive(s),
                },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => setDeleteTarget(s) },
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
        Tarif acuan untuk menghitung HPP per kg pada proses produksi. <strong className="font-medium text-foreground">Tidak memposting jurnal</strong> —
        biaya riil (listrik, gaji, dll.) tetap masuk laba rugi lewat tagihan/jurnal. Mengubah master tidak mengubah HPP
        produksi yang sudah tercatat.
      </InfoNote>

      <MasterToolbar
        search={search}
        onSearch={setSearch}
        searchLabel="Cari standar biaya"
        searchPlaceholder="Cari nama, item, atau akun"
        status={status}
        onStatus={setStatus}
        summary={
          all.length > 0
            ? `${formatNumber(counts.total)} standar · ${formatNumber(inputCount)} input · ${formatNumber(counts.total - inputCount)} output`
            : undefined
        }
        action={
          canEdit && (
            <Button onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Standar Baru
            </Button>
          )
        }
      >
        <SelectFilter label="Sisi biaya" allLabel="Semua sisi" options={SIDE_FILTER} value={side} onChange={setSide} />
        <WarehouseFilter value={warehouseId} onChange={setWarehouseId} allLabel="Semua gudang" />
      </MasterToolbar>

      <DataTable
        label="Daftar standar biaya produksi"
        itemLabel="standar"
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={query.isLoading}
        fetching={query.isFetching && query.isPlaceholderData}
        error={query.error}
        onRetry={() => query.refetch()}
        filtered={!!search.trim() || !!status || !!side || !!warehouseId}
        onClearFilters={() => {
          setSearch('');
          setStatus('');
          setSide('');
          setWarehouseId('');
        }}
        onRowClick={canEdit ? (s) => setSheet({ edit: s }) : undefined}
        rowClassName={(s) => (s.isActive ? undefined : 'text-muted-foreground')}
        pageSize={25}
        empty={{
          title: 'Belum ada standar biaya',
          description: 'Tambahkan tarif seperti listrik mesin per kg input atau ongkos angkut per kg output.',
          action: canEdit ? (
            <Button size="sm" onClick={() => setSheet({ edit: null })}>
              <Plus aria-hidden />
              Tambah standar pertama
            </Button>
          ) : undefined,
        }}
      />

      {sheet && (
        <CostStandardFormSheet
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
        title="Hapus standar biaya?"
        description={`Hapus "${deleteTarget?.name ?? ''}"? Jika sudah dipakai di produksi, standar akan dinonaktifkan.`}
        confirmLabel="Ya, hapus"
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface Option {
  value: string;
  label: string;
  hint?: string;
}

function useOptions(key: string, url: string, map: (rows: Array<Record<string, unknown>>) => Option[]) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const raw = (await api.get(url)).data;
      const arr = (Array.isArray(raw) ? raw : (raw?.data ?? [])) as Array<Record<string, unknown>>;
      return map(arr);
    },
    staleTime: 60_000,
  });
}

function CostStandardFormSheet({
  editTarget,
  onClose,
  onSaved,
}: {
  editTarget: CostStandard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() =>
    editTarget
      ? {
          name: editTarget.name,
          description: editTarget.description ?? '',
          costSide: editTarget.costSide,
          basis: editTarget.basis,
          defaultRate: String(editTarget.defaultRate),
          costAccountId: editTarget.costAccountId ?? '',
          itemId: editTarget.itemId ?? '',
          warehouseId: editTarget.warehouseId ?? '',
        }
      : blankForm,
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = touched ? validateCostStandard(form) : {};
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const accounts = useOptions('accounts-flat-for-cost-standard', '/coa', (arr) =>
    arr
      .filter((a) => !a.isGroup)
      .map((a) => ({ value: String(a.id), label: `${a.accountNumber} — ${a.name}` })),
  );
  const items = useOptions('inventory-items-for-cost-standards', '/inventory/items?limit=200', (arr) =>
    arr
      .filter((i) => i.isActive !== false)
      .map((i) => ({ value: String(i.id), label: String(i.name), hint: `${i.code} · ${i.unit}` })),
  );
  const warehouses = useOptions('warehouses-for-cost-standards', '/warehouses', (arr) =>
    arr.filter((w) => w.isActive !== false).map((w) => ({ value: String(w.id), label: `${w.code} — ${w.name}` })),
  );

  // Pair the basis with the side unless the user picked a fixed rate.
  const pickSide = (costSide: CostSide) =>
    setForm((f) => ({
      ...f,
      costSide,
      basis:
        costSide === 'InputSide' && f.basis === 'OutputQty'
          ? 'InputQty'
          : costSide === 'OutputSide' && f.basis === 'InputQty'
            ? 'OutputQty'
            : f.basis,
    }));

  const rate = Number(form.defaultRate.replace(',', '.'));
  const example = Number.isFinite(rate) && rate > 0 && form.basis !== 'Fixed' ? rate * 10_000 : null;

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (hasErrors(validateCostStandard(form))) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        costSide: form.costSide,
        basis: form.basis,
        defaultRate: rate,
        costAccountId: form.costAccountId || null,
        itemId: form.itemId || null,
        warehouseId: form.warehouseId || null,
      };
      if (isEdit) {
        await api.put(`/inventory/production-cost-standards/${editTarget.id}`, payload);
        toast.success('Standar biaya diperbarui.');
      } else {
        await api.post('/inventory/production-cost-standards', payload);
        toast.success('Standar biaya dibuat.');
      }
      onSaved();
    } catch (err) {
      setServerError(errorMessage(err, 'Gagal menyimpan standar biaya.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? 'Edit standar biaya' : 'Standar biaya baru'}
      description={isEdit ? `Mengubah ${editTarget.name}. HPP produksi lama tidak berubah.` : 'Tarif acuan untuk menghitung HPP loaded.'}
      error={serverError}
      saving={saving}
      submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan standar'}
      onSubmit={submit}
      footerNote={
        <>
          {SIDE_LABEL[form.costSide]} · {BASIS_LABEL[form.basis]}
          {Number.isFinite(rate) && form.defaultRate && <> · {fmtRate(rate)}</>}
        </>
      }
    >
      <FormSection title="Sisi biaya">
        <ChoiceCards
          label="Sisi biaya"
          value={form.costSide}
          onChange={pickSide}
          options={[
            { value: 'InputSide', label: 'Sisi input', hint: 'biaya bahan baku masuk', icon: <ArrowDownToLine className="size-4" aria-hidden /> },
            { value: 'OutputSide', label: 'Sisi output', hint: 'biaya hasil produksi', icon: <ArrowUpFromLine className="size-4" aria-hidden /> },
          ]}
        />
      </FormSection>

      <FormSection title="Identitas">
        <Field label="Nama standar" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Listrik mesin produksi" />
        </Field>
        <Field label="Keterangan">
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Estimasi listrik per kg bahan baku" />
        </Field>
      </FormSection>

      <FormSection title="Tarif & basis">
        <ChoiceCards
          label="Basis perhitungan"
          value={form.basis}
          onChange={(v) => set('basis', v)}
          columns={3}
          options={[
            { value: 'InputQty', label: 'Per kg input', hint: 'tarif × qty input' },
            { value: 'OutputQty', label: 'Per kg output', hint: 'tarif × qty output' },
            { value: 'Fixed', label: 'Tetap per proses', hint: 'tarif = total' },
          ]}
        />
        <Field
          label={`Tarif (Rp ${BASIS_UNIT[form.basis]})`}
          required
          error={errors.defaultRate}
          hint={example !== null ? `Contoh: 10.000 kg × ${fmtRate(rate)} = ${formatRupiah(example)}` : undefined}
        >
          <FormNumberInput
            value={form.defaultRate}
            onChange={(e) => set('defaultRate', e.target.value)}
            min={0}
            step="0.0001"
            placeholder="100"
            className="num text-right"
          />
        </Field>
      </FormSection>

      <FormSection title="Lingkup (opsional)">
        <Field label="Berlaku untuk gudang" hint="Kosongkan agar berlaku untuk semua gudang.">
          {(control) => (
            <div id={control.id}>
              <ComboboxFilter
                label="Berlaku untuk gudang"
                value={form.warehouseId}
                onChange={(v) => set('warehouseId', v)}
                options={warehouses.data ?? []}
                allLabel="Semua gudang"
                loading={warehouses.isLoading}
                className="w-full"
              />
            </div>
          )}
        </Field>
        <Field label="Berlaku untuk item" hint="Kosongkan agar bisa dipakai untuk item apa pun.">
          {(control) => (
            <div id={control.id}>
              <ComboboxFilter
                label="Berlaku untuk item"
                value={form.itemId}
                onChange={(v) => set('itemId', v)}
                options={items.data ?? []}
                allLabel="Semua item"
                searchPlaceholder="Cari item…"
                loading={items.isLoading}
                className="w-full"
              />
            </div>
          )}
        </Field>
        <Field label="Akun biaya (tag laporan)" hint="Tidak ada posting jurnal ke akun ini; hanya untuk pengelompokan laporan.">
          {(control) => (
            <div id={control.id}>
              <ComboboxFilter
                label="Akun biaya"
                value={form.costAccountId}
                onChange={(v) => set('costAccountId', v)}
                options={accounts.data ?? []}
                allLabel="Tidak ditandai"
                searchPlaceholder="Cari akun…"
                loading={accounts.isLoading}
                className="w-full"
              />
            </div>
          )}
        </Field>
      </FormSection>
    </FormSheet>
  );
}

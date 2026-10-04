/** Pajak & STNK: tax / STNK / KIR records with due state, and tax requests (approval flow). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, ClipboardList, FileCheck2, Pencil, Plus, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { TAX_TYPE_LABELS, URGENCY_LABELS } from '../constants';
import { viewDocument } from '../documents-api';
import { TaxModal, TaxRequestModal } from '../modals/TaxInsuranceModals';
import type { TaxRecord, TaxRequest, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError, dueStateOf } from '../vehicle-model';
import { DueDateCell, UnitHeader } from '../vehicle-ui';

const money = (v: string | number | null | undefined) => (v == null ? '-' : formatRupiah(toNumber(v) ?? 0, { symbol: false }));

export function TaxSection({ assetId, canEdit, canApprove }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const [modal, setModal] = useState<TaxRecord | 'new' | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaxRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TaxRequest | null>(null);

  const taxesQuery = useQuery<TaxRecord[]>({
    queryKey: vehicleKeys.taxes(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/taxes`)).data,
  });
  const requestsQuery = useQuery<TaxRequest[]>({
    queryKey: vehicleKeys.taxRequests(assetId),
    queryFn: async () => (await api.get('/ga/vehicle/tax-requests', { params: { assetId } })).data,
  });

  const afterRequestChange = () => invalidate(['taxRequests', 'taxes']);
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/taxes/${id}`),
    onSuccess: () => {
      toast.success('Data pajak dihapus.');
      invalidate(['taxes']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus data pajak.')),
  });
  const approveReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/tax-requests/${id}/approve`),
    onSuccess: () => {
      toast.success('Pengajuan pajak disetujui. Data pajak dibuat (status Diproses).');
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal approve pengajuan pajak.')),
  });
  const rejectReq = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.patch(`/ga/vehicle/tax-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Pengajuan pajak ditolak.');
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal reject pengajuan pajak.')),
  });
  const cancelReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/tax-requests/${id}/cancel`),
    onSuccess: () => {
      toast.success('Pengajuan pajak dibatalkan.');
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal cancel pengajuan pajak.')),
  });

  const taxColumns = useMemo<ColumnDef<TaxRecord>[]>(
    () => [
      {
        id: 'type',
        header: 'Jenis',
        meta: { cellClassName: 'min-w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TAX_TYPE_LABELS[row.original.type] ?? row.original.type}</p>
            <p className="num text-xs text-muted-foreground">Periode {row.original.periodYear}</p>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: 'Jatuh Tempo',
        cell: ({ row }) => (
          <DueDateCell date={row.original.dueDate} state={dueStateOf(row.original.dueDate, row.original.status === 'ACTIVE')} />
        ),
      },
      {
        id: 'paidAt',
        header: 'Dibayar',
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.paidAt),
      },
      {
        id: 'amount',
        header: () => <UnitHeader label="Biaya" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(row.original.amount),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const t = row.original;
          const label = `${TAX_TYPE_LABELS[t.type] ?? t.type} ${t.periodYear}`;
          return (
            <RowActions
              label={`Aksi untuk ${label}`}
              actions={[
                { label: 'Lihat dokumen', icon: FileCheck2, hidden: !t.document, onSelect: () => t.document && viewDocument(t.document.id) },
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setModal(t) },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(t) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit],
  );

  const requestColumns = useMemo<ColumnDef<TaxRequest>[]>(
    () => [
      {
        id: 'type',
        header: 'Jenis',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TAX_TYPE_LABELS[row.original.type] ?? row.original.type}</p>
            <p className="num text-xs text-muted-foreground">Periode {row.original.periodYear}</p>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: 'Jatuh Tempo',
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        id: 'estimatedAmount',
        header: () => <UnitHeader label="Estimasi" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(row.original.estimatedAmount),
      },
      {
        id: 'urgensi',
        header: 'Urgensi',
        meta: { hideBelow: 'md' },
        cell: ({ row }) => URGENCY_LABELS[row.original.urgensi] ?? row.original.urgensi,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={row.original.status} />
            {row.original.status === 'REJECTED' && row.original.rejectedReason && (
              <span className="text-xs text-danger-text">{row.original.rejectedReason}</span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const open = r.status === 'SUBMITTED' && canEdit;
          return (
            <RowActions
              label={`Aksi untuk pengajuan ${TAX_TYPE_LABELS[r.type] ?? r.type} ${r.periodYear}`}
              actions={[
                { label: 'Setujui', icon: Check, hidden: !open || !canApprove, onSelect: () => approveReq.mutate(r.id) },
                { label: 'Tolak', icon: X, tone: 'danger', hidden: !open || !canApprove, onSelect: () => setRejectTarget(r) },
                { label: 'Batalkan pengajuan', icon: XCircle, tone: 'danger', hidden: !open || canApprove, onSelect: () => cancelReq.mutate(r.id) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canApprove],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="Pajak, STNK & KIR"
        description="Jatuh tempo ditandai bila sudah lewat atau kurang dari 30 hari lagi."
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setModal('new')}>
              <Plus aria-hidden />
              Tambah
            </Button>
          )
        }
      >
        <DataTable
          label="Data pajak, STNK dan KIR"
          itemLabel="data"
          columns={taxColumns}
          data={taxesQuery.data}
          getRowId={(r) => r.id}
          loading={taxesQuery.isLoading}
          error={taxesQuery.error}
          onRetry={() => taxesQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada data pajak/STNK', description: 'Catat pajak tahunan, STNK 5 tahunan, dan KIR beserta jatuh temponya.' }}
        />
      </Panel>

      <Panel
        title="Pengajuan Pajak / STNK"
        description="Setelah disetujui, data pajak dibuat dengan status Diproses."
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowRequest(true)}>
              <ClipboardList aria-hidden />
              Ajukan
            </Button>
          )
        }
      >
        <DataTable
          label="Pengajuan pajak dan STNK"
          itemLabel="pengajuan"
          columns={requestColumns}
          data={requestsQuery.data}
          getRowId={(r) => r.id}
          loading={requestsQuery.isLoading}
          error={requestsQuery.error}
          onRetry={() => requestsQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada pengajuan pajak' }}
        />
      </Panel>

      {modal && (
        <TaxModal
          assetId={assetId}
          editRecord={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            invalidate(['taxes']);
          }}
        />
      )}
      {showRequest && (
        <TaxRequestModal
          assetId={assetId}
          onClose={() => setShowRequest(false)}
          onSaved={() => {
            setShowRequest(false);
            afterRequestChange();
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus Data Pajak"
        description={`Hapus data pajak "${deleteTarget ? `${TAX_TYPE_LABELS[deleteTarget.type] ?? deleteTarget.type} ${deleteTarget.periodYear}` : ''}"?`}
        confirmLabel="Ya, Hapus"
        tone="danger"
        loading={deleteMut.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMut.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="Tolak Pengajuan Pajak"
        description={rejectTarget ? `${TAX_TYPE_LABELS[rejectTarget.type] ?? rejectTarget.type} ${rejectTarget.periodYear}` : undefined}
        confirmLabel="Tolak"
        tone="danger"
        requireReason={{ label: 'Alasan penolakan', minLength: 1 }}
        loading={rejectReq.isPending}
        onConfirm={async (reason) => {
          if (!rejectTarget || !reason) return;
          await rejectReq.mutateAsync({ id: rejectTarget.id, reason });
          setRejectTarget(null);
        }}
      />
    </div>
  );
}

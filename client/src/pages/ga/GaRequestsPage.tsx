import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Wrench, ReceiptText, Check, X, Ban, AlertTriangle, Clock, CheckCircle2, ListChecks,
} from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ConfirmDialog, EmptyState, LoadingState, StatCard, StatusBadge } from '@/components/shared';
import { CreateRequestModal } from './requests/CreateRequestModal';
import {
  REQ_STATUS_LABELS, REQ_STATUS_FILTERS,
  SERVICE_TYPE_LABELS, TAX_TYPE_LABELS, URGENSI_LABELS, URGENSI_TONE,
  apiErrorMessage,
  type ReqStatus, type ServiceRequestRow, type TaxRequestRow, type UnifiedRow,
} from './requests/types';

type KindFilter = '' | 'SERVICE' | 'TAX';

/**
 * Panel pengajuan terpusat: satu tempat untuk mengajukan servis kendaraan &
 * pajak/STNK/KIR (tanpa harus buka halaman kendaraan dulu) sekaligus memantau
 * status semua pengajuan. Approve/reject dikerjakan dari sini juga.
 * Dipakai sebagai TAB di dalam halaman Maintenance & Work Order.
 */
export function RequestsTab() {
  const canEdit = can('ga_vehicle', 'edit');
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ReqStatus | ''>('SUBMITTED');
  const [kindFilter, setKindFilter] = useState<KindFilter>('');
  const [createMode, setCreateMode] = useState<'SERVICE' | 'TAX' | null>(null);
  const [rejectTarget, setRejectTarget] = useState<UnifiedRow | null>(null);

  const svcQuery = useQuery<ServiceRequestRow[]>({
    queryKey: ['ga-service-requests', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/ga/vehicle/service-requests', { params })).data;
    },
  });

  const taxQuery = useQuery<TaxRequestRow[]>({
    queryKey: ['ga-tax-requests', statusFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return (await api.get('/ga/vehicle/tax-requests', { params })).data;
    },
  });

  const isLoading = svcQuery.isLoading || taxQuery.isLoading;
  const isError = svcQuery.isError || taxQuery.isError;

  const rows = useMemo<UnifiedRow[]>(() => {
    const svc: UnifiedRow[] = (svcQuery.data ?? []).map((r) => ({
      kind: 'SERVICE',
      id: r.id,
      status: r.status,
      urgensi: r.urgensi,
      jenis: SERVICE_TYPE_LABELS[r.jenisService] ?? r.jenisService,
      keterangan: r.deskripsi,
      assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '—',
      nominal: null,
      createdAt: r.createdAt,
      tindakLanjut: r.workOrder ? `WO ${r.workOrder.code}` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
    }));
    const tax: UnifiedRow[] = (taxQuery.data ?? []).map((r) => ({
      kind: 'TAX',
      id: r.id,
      status: r.status,
      urgensi: r.urgensi,
      jenis: `${TAX_TYPE_LABELS[r.type] ?? r.type} ${r.periodYear}`,
      keterangan: r.deskripsi || `Jatuh tempo ${formatDate(r.dueDate)}`,
      assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '—',
      nominal: r.estimatedAmount != null ? Number(r.estimatedAmount) : null,
      createdAt: r.createdAt,
      tindakLanjut: r.tax ? `Pajak ${r.tax.periodYear} (${r.tax.status})` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
    }));
    const all = [...svc, ...tax].filter((r) => !kindFilter || r.kind === kindFilter);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [svcQuery.data, taxQuery.data, kindFilter]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-service-requests'] });
    queryClient.invalidateQueries({ queryKey: ['ga-tax-requests'] });
  };

  const basePath = (r: UnifiedRow) =>
    r.kind === 'SERVICE' ? '/ga/vehicle/service-requests' : '/ga/vehicle/tax-requests';

  const approve = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/approve`),
    onSuccess: () => { toast.success('Pengajuan disetujui.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal approve.')),
  });

  const reject = useMutation({
    mutationFn: ({ row, reason }: { row: UnifiedRow; reason: string }) =>
      api.patch(`${basePath(row)}/${row.id}/reject`, { reason }),
    onSuccess: () => { toast.success('Pengajuan ditolak.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal reject.')),
  });

  const cancel = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/cancel`),
    onSuccess: () => { toast.success('Pengajuan dibatalkan.'); refresh(); },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal cancel.')),
  });

  const confirmReject = async (reason?: string) => {
    if (!rejectTarget || !reason) return;
    await reject.mutateAsync({ row: rejectTarget, reason });
  };

  // Ringkasan cepat (dihitung dari data yang tampil).
  const counts = useMemo(() => {
    const submitted = rows.filter((r) => r.status === 'SUBMITTED').length;
    const urgent = rows.filter((r) => r.status === 'SUBMITTED' && (r.urgensi === 'URGENT' || r.urgensi === 'HIGH')).length;
    const approved = rows.filter((r) => r.status === 'APPROVED').length;
    return { submitted, urgent, approved, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ajukan servis kendaraan atau pajak/STNK/KIR di sini; setelah disetujui, tindak lanjutnya
          muncul sebagai Work Order / catatan pajak.
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreateMode('SERVICE')}>
              <Plus aria-hidden /> Ajukan Servis
            </Button>
            <Button variant="outline" onClick={() => setCreateMode('TAX')}>
              <Plus aria-hidden /> Ajukan Pajak / KIR
            </Button>
          </div>
        )}
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Menunggu Approval" value={counts.submitted} icon={Clock} loading={isLoading} />
        <StatCard label="Mendesak" value={counts.urgent} icon={AlertTriangle} loading={isLoading} />
        <StatCard label="Disetujui" value={counts.approved} icon={CheckCircle2} loading={isLoading} />
        <StatCard label="Total Tampil" value={counts.total} icon={ListChecks} loading={isLoading} />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status">
          <Chip active={statusFilter === ''} onClick={() => setStatusFilter('')}>Semua Status</Chip>
          {REQ_STATUS_FILTERS.map((s) => (
            <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {REQ_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-border md:block" aria-hidden />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter jenis">
          <Chip active={kindFilter === ''} onClick={() => setKindFilter('')}>Semua Jenis</Chip>
          <Chip active={kindFilter === 'SERVICE'} onClick={() => setKindFilter('SERVICE')}>Servis</Chip>
          <Chip active={kindFilter === 'TAX'} onClick={() => setKindFilter('TAX')}>Pajak / KIR</Chip>
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]">
        {isLoading ? (
          <LoadingState size="sm" />
        ) : isError ? (
          <EmptyState kind="error" compact />
        ) : rows.length === 0 ? (
          <EmptyState
            kind="no-results"
            compact
            title="Tidak ada pengajuan"
            description="Tidak ada pengajuan pada filter ini."
          />
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Kendaraan</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead numeric>Estimasi</TableHead>
                <TableHead className="text-center">Urgensi</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Tindak Lanjut</TableHead>
                {canEdit && <TableHead className="text-center">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.id}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      {r.kind === 'SERVICE'
                        ? <Wrench className="size-3.5 text-primary" aria-hidden />
                        : <ReceiptText className="size-3.5 text-info-text" aria-hidden />}
                      {r.jenis}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground-secondary">{r.assetLabel}</TableCell>
                  <TableCell className="max-w-xs truncate text-foreground-secondary" title={r.keterangan}>
                    {r.keterangan}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {r.nominal != null ? formatRupiah(r.nominal) : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge label={URGENSI_LABELS[r.urgensi]} tone={URGENSI_TONE[r.urgensi]} dot={false} />
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground" title={r.tindakLanjut ?? ''}>
                    {r.tindakLanjut ?? '—'}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {r.status === 'SUBMITTED' && (
                          <>
                            <IconBtn title="Setujui" tone="success" onClick={() => approve.mutate(r)}>
                              <Check aria-hidden />
                            </IconBtn>
                            <IconBtn title="Tolak" tone="danger" onClick={() => setRejectTarget(r)}>
                              <X aria-hidden />
                            </IconBtn>
                            <IconBtn title="Batalkan" tone="neutral" onClick={() => cancel.mutate(r)}>
                              <Ban aria-hidden />
                            </IconBtn>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <IconBtn title="Batalkan" tone="neutral" onClick={() => cancel.mutate(r)}>
                            <Ban aria-hidden />
                          </IconBtn>
                        )}
                        {['REJECTED', 'COMPLETED', 'CANCELLED'].includes(r.status) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {createMode && <CreateRequestModal mode={createMode} onClose={() => setCreateMode(null)} />}

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        tone="danger"
        title="Tolak pengajuan?"
        description={rejectTarget ? `${rejectTarget.jenis} — ${rejectTarget.assetLabel}` : undefined}
        confirmLabel="Tolak"
        requireReason={{ label: 'Alasan penolakan', minLength: 1 }}
        onConfirm={confirmReject}
        loading={reject.isPending}
      />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      size="sm"
      variant={active ? 'primary' : 'secondary'}
      aria-pressed={active}
      className="rounded-full"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const TONE_BTN: Record<'success' | 'danger' | 'neutral', string> = {
  success: 'text-success-text hover:bg-success-subtle',
  danger: 'text-danger-text hover:bg-danger-subtle',
  neutral: 'text-muted-foreground hover:bg-accent',
};

function IconBtn({
  title, tone, onClick, children,
}: { title: string; tone: keyof typeof TONE_BTN; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn('[&_svg]:size-3.5', TONE_BTN[tone])}
    >
      {children}
    </Button>
  );
}

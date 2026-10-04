/** Inspeksi: periodic inspections, next-due reminder, detail dialog (checklist + photos) and PDF export. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { pdf } from '@react-pdf/renderer';
import { CalendarClock, Camera, Eye, FileDown, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { getStoredUser } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog, DataTable, RowActions } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import InspectionDetailPDF from '@/lib/pdf/InspectionDetailPDF';
import type { InspectionPdfAsset, InspectionPdfPhoto } from '@/lib/pdf/InspectionDetailPDF';
import { useCompanyPDF } from '@/lib/pdf/useCompanyPDF';
import { CHECKPOINT_LABELS, CHECK_STATE_META, FUEL_LEVEL_LABELS, INSPECTION_RESULT_META } from '../constants';
import { downloadBlob, fetchInspectionPhotoDataUrl } from '../documents-api';
import { InspectionModal } from '../modals/InspectionModal';
import type { Inspection, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { fetchInspectionCategories, useInspectionCategories, useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError, daysUntil, dueStateOf } from '../vehicle-model';
import { DetailItem, DueDateCell, DueMarker, ToneBadge, UnitHeader } from '../vehicle-ui';

interface InspectionSectionProps extends VehicleContext {
  pdfAsset: InspectionPdfAsset;
}

function ResultBadge({ result }: { result: string }) {
  const m = INSPECTION_RESULT_META[result];
  return m ? <ToneBadge label={m.label} tone={m.tone} /> : <span>{result}</span>;
}

function InspectionDetailDialog({
  assetId,
  inspection,
  canEdit,
  onClose,
  onPhotoDeleted,
}: {
  assetId: string;
  inspection: Inspection | null;
  canEdit: boolean;
  onClose: () => void;
  onPhotoDeleted: () => void;
}) {
  const categories = useInspectionCategories();
  const deletePhoto = useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/ga/vehicle/assets/${assetId}/inspections/${inspection?.id}/photos/${photoId}`),
    onSuccess: () => {
      toast.success('Foto dihapus.');
      onPhotoDeleted();
    },
    onError: () => toast.error('Gagal menghapus foto.'),
  });

  const checklist = inspection?.checklist ?? {};
  const photos = inspection?.photos ?? [];
  // Old 12-item checklists have keys outside the categories: show them in a "format lama" group.
  const known = new Set(categories.flatMap((c) => c.items.map((i) => i.key)));
  const legacyKeys = Object.keys(checklist).filter((k) => !known.has(k));
  const photoBase = `${api.defaults.baseURL ?? '/api'}/ga/vehicle/assets/${assetId}/inspections/${inspection?.id}/photos`;

  const items = (keys: string[]) => (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => {
        const m = CHECK_STATE_META[checklist[k] ?? ''];
        return (
          <li key={k} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
            <span className="text-xs text-foreground">{CHECKPOINT_LABELS[k] ?? k}</span>
            {m ? <ToneBadge label={m.label} tone={m.tone} /> : <span className="text-xs">{checklist[k]}</span>}
          </li>
        );
      })}
    </ul>
  );

  return (
    <Dialog open={!!inspection} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        {inspection && (
          <>
            <DialogHeader>
              <DialogTitle>Inspeksi {formatDate(inspection.tanggal)}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-2">
                  Hasil: <ResultBadge result={inspection.overallResult} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailItem label="Inspektor">{inspection.inspectorName || '-'}</DetailItem>
              <DetailItem label="Level BBM">{inspection.fuelLevel ? FUEL_LEVEL_LABELS[inspection.fuelLevel] ?? inspection.fuelLevel : '-'}</DetailItem>
              <DetailItem label="Odometer">
                <span className="num">{inspection.odometer != null ? `${formatNumber(inspection.odometer)} km` : '-'}</span>
              </DetailItem>
              <DetailItem label="Inspeksi berikutnya">
                <DueDateCell date={inspection.nextDueDate} state={dueStateOf(inspection.nextDueDate)} />
              </DetailItem>
            </dl>
            <div className="space-y-3">
              {categories.map((cat) => {
                const keys = cat.items.map((i) => i.key).filter((k) => checklist[k]);
                const catPhotos = photos.filter((p) => p.category === cat.key);
                if (keys.length === 0 && catPhotos.length === 0) return null;
                return (
                  <section key={cat.key} aria-label={cat.label}>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h3>
                    {keys.length > 0 && items(keys)}
                    {catPhotos.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {catPhotos.map((ph) => (
                          <li key={ph.id} className="relative">
                            <img src={`${photoBase}/${ph.id}/file`} alt={`Foto ${cat.label}`} className="h-24 w-32 rounded-md border border-border object-cover" />
                            {canEdit && (
                              <Button
                                variant="danger"
                                size="icon-sm"
                                className="absolute right-1 top-1 size-7"
                                aria-label={`Hapus foto ${cat.label}`}
                                onClick={() => deletePhoto.mutate(ph.id)}
                              >
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
              {legacyKeys.length > 0 && (
                <section aria-label="Checklist format lama">
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Checklist (format lama)</h3>
                  {items(legacyKeys)}
                </section>
              )}
              {Object.keys(checklist).length === 0 && <p className="text-sm text-muted-foreground">Checklist tidak tersedia untuk inspeksi ini.</p>}
              {inspection.notes && (
                <section aria-label="Catatan">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catatan</h3>
                  <p className="text-sm text-foreground">{inspection.notes}</p>
                </section>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InspectionSection({ assetId, canEdit, pdfAsset }: InspectionSectionProps) {
  const invalidate = useInvalidateVehicle(assetId);
  const queryClient = useQueryClient();
  const company = useCompanyPDF();
  const [showModal, setShowModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Inspection | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const query = useQuery<Inspection[]>({
    queryKey: vehicleKeys.inspections(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/inspections`)).data,
  });
  const inspections = useMemo(() => query.data ?? [], [query.data]);
  const detail = inspections.find((i) => i.id === detailId) ?? null;

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/inspections/${id}`),
    onSuccess: () => {
      toast.success('Data inspeksi dihapus.');
      invalidate(['inspections']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus data inspeksi.')),
  });

  const exportPdf = async (insp: Inspection) => {
    setPdfBusy(insp.id);
    try {
      const categories = await queryClient.ensureQueryData({
        queryKey: vehicleKeys.inspectionCategories,
        queryFn: fetchInspectionCategories,
      });
      const photos: InspectionPdfPhoto[] = [];
      let failed = 0;
      for (const ph of insp.photos ?? []) {
        try {
          photos.push({ category: ph.category, src: await fetchInspectionPhotoDataUrl(assetId, insp.id, ph.id), caption: ph.caption ?? null });
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) toast.warning(`${failed} foto gagal dimuat, PDF tetap dibuat.`);
      const blob = await pdf(
        <InspectionDetailPDF
          inspection={insp}
          asset={pdfAsset}
          categories={categories}
          photos={photos}
          company={{ name: company.name, address: company.address, logoUrl: company.logoUrl }}
          printedBy={getStoredUser()?.fullName ?? 'Pengguna'}
          generatedAt={new Date()}
        />,
      ).toBlob();
      downloadBlob(blob, `Inspeksi_${pdfAsset.noPlat || pdfAsset.code}_${String(insp.tanggal ?? '').slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error(apiError(e, 'Gagal membuat PDF inspeksi.'));
    } finally {
      setPdfBusy(null);
    }
  };

  // Next inspection = nextDueDate of the latest inspection (list is newest first).
  const next = inspections[0]?.nextDueDate ?? null;
  const nextState = dueStateOf(next);
  const nextDays = daysUntil(next);

  const columns = useMemo<ColumnDef<Inspection>[]>(
    () => [
      {
        id: 'tanggal',
        header: 'Tanggal',
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">{row.original.inspectorName || '-'}</p>
          </div>
        ),
      },
      {
        id: 'result',
        header: 'Hasil',
        cell: ({ row }) => <ResultBadge result={row.original.overallResult} />,
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label="Odometer" unit="km" />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '-'),
      },
      {
        id: 'next',
        header: 'Berikutnya',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <DueDateCell date={row.original.nextDueDate} state={dueStateOf(row.original.nextDueDate)} />,
      },
      {
        id: 'photos',
        header: 'Foto',
        meta: { hideBelow: 'lg' },
        cell: ({ row }) =>
          row.original.photos?.length ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="size-3.5" aria-hidden />
              {row.original.photos.length}
            </span>
          ) : (
            '-'
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <RowActions
              label={`Aksi untuk inspeksi ${formatDate(i.tanggal)}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setDetailId(i.id) },
                { label: pdfBusy === i.id ? 'Membuat PDF…' : 'Unduh PDF', icon: FileDown, disabled: !!pdfBusy, onSelect: () => exportPdf(i) },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(i) },
              ]}
            />
          );
        },
      },
    ],
    // exportPdf reads pdfAsset/company at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, pdfBusy, pdfAsset, company],
  );

  return (
    <>
      <Panel
        title="Inspeksi Berkala"
        description="Klik baris untuk melihat checklist dan foto."
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus aria-hidden />
              Inspeksi baru
            </Button>
          )
        }
      >
        {next && (
          <p
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5 text-sm',
              nextState === 'overdue' ? 'bg-danger-subtle' : nextState === 'dueSoon' ? 'bg-warning-subtle' : 'bg-muted/40',
            )}
          >
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            Jadwal inspeksi berikutnya <strong className="num">{formatDate(next)}</strong>
            {nextDays !== null && (
              <span className="text-muted-foreground">
                ({nextDays < 0 ? `terlambat ${Math.abs(nextDays)} hari` : `${nextDays} hari lagi`})
              </span>
            )}
            <DueMarker state={nextState} hideOk />
          </p>
        )}
        <DataTable
          label="Riwayat inspeksi"
          itemLabel="inspeksi"
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(r) => setDetailId(r.id)}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada data inspeksi', description: 'Inspeksi berkala menjaga kendaraan tetap laik jalan.' }}
        />
      </Panel>

      <InspectionDetailDialog
        assetId={assetId}
        inspection={detail}
        canEdit={canEdit}
        onClose={() => setDetailId(null)}
        onPhotoDeleted={() => invalidate(['inspections'], { fleet: false })}
      />
      {showModal && (
        <InspectionModal
          assetId={assetId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            invalidate(['inspections']);
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus Data Inspeksi"
        description={`Hapus data inspeksi "${deleteTarget ? formatDate(deleteTarget.tanggal) : ''}"?`}
        confirmLabel="Ya, Hapus"
        tone="danger"
        loading={deleteMut.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMut.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

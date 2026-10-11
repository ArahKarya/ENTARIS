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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('eam');
  const categories = useInspectionCategories();
  const deletePhoto = useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/ga/vehicle/assets/${assetId}/inspections/${inspection?.id}/photos/${photoId}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.inspections.photoDeleted'));
      onPhotoDeleted();
    },
    onError: () => toast.error(t('vehicleSections.inspections.photoDeleteFailed')),
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
              <DialogTitle>{t('vehicleSections.inspections.dialogTitle', { date: formatDate(inspection.tanggal) })}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-2">
                  {t('vehicleSections.inspections.resultLabel')} <ResultBadge result={inspection.overallResult} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <DetailItem label={t('vehicleSections.inspections.inspector')}>{inspection.inspectorName || '—'}</DetailItem>
              <DetailItem label={t('vehicleSections.inspections.fuelLevel')}>{inspection.fuelLevel ? FUEL_LEVEL_LABELS[inspection.fuelLevel] ?? inspection.fuelLevel : '—'}</DetailItem>
              <DetailItem label={t('vehicleSections.inspections.odometer')}>
                <span className="num">{inspection.odometer != null ? `${formatNumber(inspection.odometer)} km` : '—'}</span>
              </DetailItem>
              <DetailItem label={t('vehicleSections.inspections.nextInspection')}>
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
                            <img src={`${photoBase}/${ph.id}/file`} alt={t('vehicleSections.inspections.photoAlt', { name: cat.label })} className="h-24 w-32 rounded-md border border-border object-cover" />
                            {canEdit && (
                              <Button
                                variant="danger"
                                size="icon-sm"
                                className="absolute right-1 top-1 size-7"
                                aria-label={t('vehicleSections.inspections.deletePhoto', { name: cat.label })}
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
                <section aria-label={t('vehicleSections.inspections.legacy')}>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vehicleSections.inspections.legacyHeading')}</h3>
                  {items(legacyKeys)}
                </section>
              )}
              {Object.keys(checklist).length === 0 && <p className="text-sm text-muted-foreground">{t('vehicleSections.inspections.noChecklist')}</p>}
              {inspection.notes && (
                <section aria-label={t('shared.notes')}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('shared.notes')}</h3>
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
  const { t } = useTranslation('eam');
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
      toast.success(t('vehicleSections.inspections.deleted'));
      invalidate(['inspections']);
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.inspections.deleteFailed'))),
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
      if (failed > 0) toast.warning(t('vehicleSections.inspections.pdfPhotosFailed', { count: failed }));
      const blob = await pdf(
        <InspectionDetailPDF
          inspection={insp}
          asset={pdfAsset}
          categories={categories}
          photos={photos}
          company={{ name: company.name, address: company.address, logoUrl: company.logoUrl }}
          printedBy={getStoredUser()?.fullName ?? t('vehicleSections.inspections.defaultUser')}
          generatedAt={new Date()}
        />,
      ).toBlob();
      downloadBlob(blob, `${t('vehicleSections.inspections.filePrefix')}_${pdfAsset.noPlat || pdfAsset.code}_${String(insp.tanggal ?? '').slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error(apiError(e, t('vehicleSections.inspections.pdfFailed')));
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
        header: t('shared.date'),
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">{row.original.inspectorName || '—'}</p>
          </div>
        ),
      },
      {
        id: 'result',
        header: t('vehicleSections.inspections.result'),
        cell: ({ row }) => <ResultBadge result={row.original.overallResult} />,
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label={t('vehicleSections.inspections.odometer')} unit="km" />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '—'),
      },
      {
        id: 'next',
        header: t('vehicleSections.inspections.next'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <DueDateCell date={row.original.nextDueDate} state={dueStateOf(row.original.nextDueDate)} />,
      },
      {
        id: 'photos',
        header: t('vehicleSections.inspections.photos'),
        meta: { hideBelow: 'lg' },
        cell: ({ row }) =>
          row.original.photos?.length ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="size-3.5" aria-hidden />
              {row.original.photos.length}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <RowActions
              label={t('vehicleSections.inspections.actionsFor', { date: formatDate(i.tanggal) })}
              actions={[
                { label: t('vehicleSections.inspections.viewDetail'), icon: Eye, onSelect: () => setDetailId(i.id) },
                { label: pdfBusy === i.id ? t('vehicleSections.inspections.pdfBusy') : t('vehicleSections.inspections.downloadPdf'), icon: FileDown, disabled: !!pdfBusy, onSelect: () => exportPdf(i) },
                { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(i) },
              ]}
            />
          );
        },
      },
    ],
    // exportPdf reads pdfAsset/company at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, pdfBusy, pdfAsset, company, t],
  );

  return (
    <>
      <Panel
        title={t('vehicleSections.inspections.title')}
        description={t('vehicleSections.inspections.description')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus aria-hidden />
              {t('vehicleSections.inspections.add')}
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
            {t('vehicleSections.inspections.nextSchedule')} <strong className="num">{formatDate(next)}</strong>
            {nextDays !== null && (
              <span className="text-muted-foreground">
                ({nextDays < 0 ? t('vehicleSections.inspections.lateDays', { count: Math.abs(nextDays) }) : t('vehicleSections.inspections.inDays', { count: nextDays })})
              </span>
            )}
            <DueMarker state={nextState} hideOk />
          </p>
        )}
        <DataTable
          label={t('vehicleSections.inspections.tableLabel')}
          itemLabel={t('vehicleSections.inspections.itemLabel')}
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(r) => setDetailId(r.id)}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.inspections.emptyTitle'), description: t('vehicleSections.inspections.emptyDescription') }}
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
        title={t('vehicleSections.inspections.deleteTitle')}
        description={t('vehicleSections.inspections.deleteConfirm', { name: deleteTarget ? formatDate(deleteTarget.tanggal) : '' })}
        confirmLabel={t('shared.confirmDelete')}
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

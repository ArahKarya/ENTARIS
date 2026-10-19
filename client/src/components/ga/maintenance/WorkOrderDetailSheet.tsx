/**
 * Work order detail sheet (deep-linked as ?wo=<id>). Picker forms open as
 * dialogs, so the sheet steps aside while one is open.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  FilePlus,
  ImagePlus,
  Lock,
  PackagePlus,
  Play,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { getStoredUser } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, EmptyState, StatusBadge } from '@/components/shared';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';
import { CreateMrModal } from '@/pages/ga/materialRequest/CreateMrModal';
import { PhotoUploadModal } from '@/pages/ga/maintenance/PhotoUploadModal';
import { PriorityBadge } from './wo-badges';
import { AddPartModal, AssignModal, CompleteModal } from './wo-forms';
import { workOrderKey } from './queries';
import { useTranslation } from 'react-i18next';
import {
  TYPE_LABELS,
  apiErrorMessage,
  assetLabel,
  canUploadPhoto,
  MAX_WO_PHOTOS,
  toNum,
  woActions,
  woDueState,
  type WorkOrderDetail,
} from './wo-meta';

type SubForm = 'assign' | 'complete' | 'part' | 'photo' | 'mr' | null;

export interface WorkOrderDetailSheetProps {
  /** Work order id from the URL; null closes the sheet. */
  id: string | null;
  onClose: () => void;
  /** ga_maintenance edit. */
  canEdit: boolean;
  /** ga_material_request edit (create MR from the WO). */
  canCreateMr: boolean;
  /** ga_material_request view (link to the MR page). */
  canViewMr: boolean;
  /** Technician name from the list row, when known (the detail endpoint has only the id). */
  assigneeName?: string | null;
}


function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WorkOrderDetailSheet({
  id,
  onClose,
  canEdit,
  canCreateMr,
  canViewMr,
  assigneeName,
}: WorkOrderDetailSheetProps) {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();
  const [sub, setSub] = useState<SubForm>(null);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const query = useQuery({
    queryKey: workOrderKey(id ?? ''),
    queryFn: async () => (await api.get<WorkOrderDetail>(`/ga/maintenance/work-orders/${id}`)).data,
    enabled: !!id,
  });
  const wo = query.data;

  const invalidate = () => {
    if (id) queryClient.invalidateQueries({ queryKey: workOrderKey(id) });
    queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['ga-schedules'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/start`),
    onSuccess: () => {
      toast.success(t('workOrder.detail.started'));
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.detail.startFailed'))),
  });

  const closeMutation = useMutation({
    mutationFn: () => api.patch(`/ga/maintenance/work-orders/${id}/close`),
    onSuccess: () => {
      toast.success(t('workOrder.detail.closed'));
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.detail.closeFailed'))),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.patch(`/ga/maintenance/work-orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success(t('workOrder.detail.cancelled'));
      invalidate();
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.detail.cancelFailed'))),
  });

  const actions = wo ? woActions(wo.status) : null;
  const userId = getStoredUser()?.id;
  const dueState = wo ? woDueState(wo) : null;
  const partsTotal = (wo?.parts ?? []).reduce((s, p) => s + toNum(p.quantity) * toNum(p.unitCost), 0);
  const assignee = wo?.assignedToId ? assigneeName || t('workOrder.detail.technicianAssigned') : null;

  const hasFooter =
    !!wo && canEdit && !!actions && (actions.assign || actions.start || actions.complete || actions.close || actions.cancel);

  return (
    <>
      <Sheet open={!!id && sub === null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="lg">
          <SheetHeader>
            {wo ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-mono text-sm text-muted-foreground">{wo.code}</span>
                  <StatusBadge status={wo.status} docType="ga_work_order" />
                  <PriorityBadge priority={wo.priority} />
                </div>
                <SheetTitle>{wo.title}</SheetTitle>
                <SheetDescription>
                  {TYPE_LABELS[wo.type] ?? wo.type} · {assetLabel(wo.asset)}
                </SheetDescription>
              </>
            ) : (
              <>
                <SheetTitle>{t('workOrder.detail.title')}</SheetTitle>
                <SheetDescription className="sr-only">{t('workOrder.detail.loading')}</SheetDescription>
              </>
            )}
          </SheetHeader>

          <SheetBody className="space-y-6">
            {query.isError ? (
              <EmptyState
                kind="error"
                compact
                description={t('workOrder.detail.loadError')}
                action={
                  <Button size="sm" variant="outline" onClick={() => query.refetch()}>
                    {t('workOrder.detail.retry')}
                  </Button>
                }
              />
            ) : !wo ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Detail label={t('workOrder.detail.dueDate')}>
                    {wo.dueAt ? <DueDate date={wo.dueAt} dueState={dueState} /> : '—'}
                  </Detail>
                  <Detail label={t('workOrder.detail.technician')}>{assignee ?? <span className="text-muted-foreground">{t('workOrder.detail.unassigned')}</span>}</Detail>
                  <Detail label={t('workOrder.detail.reported')}>{formatDate(wo.reportedAt)}</Detail>
                  <Detail label={t('workOrder.detail.startedAt')}>{wo.startedAt ? formatDate(wo.startedAt) : '—'}</Detail>
                  <Detail label={t('workOrder.detail.completedAt')}>{wo.completedAt ? formatDate(wo.completedAt) : '—'}</Detail>
                  <Detail label={t('workOrder.detail.closedAt')}>{wo.closedAt ? formatDate(wo.closedAt) : '—'}</Detail>
                  <Detail label={t('workOrder.detail.component')}>{wo.component || '—'}</Detail>
                  <Detail label={t('workOrder.detail.schedule')}>{wo.scheduleId ? t('workOrder.detail.linked') : '—'}</Detail>
                  {wo.description && (
                    <Detail label={t('workOrder.detail.description')} wide>
                      <span className="whitespace-pre-wrap">{wo.description}</span>
                    </Detail>
                  )}
                  {wo.resolution && (
                    <Detail label={t('workOrder.detail.resolution')} wide>
                      <span className="whitespace-pre-wrap">{wo.resolution}</span>
                    </Detail>
                  )}
                  {wo.status === 'CANCELLED' && wo.cancelReason && (
                    <Detail label={t('workOrder.detail.cancelReason')} wide>
                      {wo.cancelReason}
                    </Detail>
                  )}
                </dl>

                <Section id="wo-cost" title={t('workOrder.detail.cost')}>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <CostFigure label={t('workOrder.detail.labor')} value={toNum(wo.laborCost)} hint={wo.laborHours ? t('workOrder.detail.hours', { hours: formatNumber(toNum(wo.laborHours), { maxDecimals: 2 }) }) : undefined} />
                    <CostFigure label={t('workOrder.detail.vendor')} value={toNum(wo.externalCost)} hint={wo.externalVendor ?? undefined} />
                    <CostFigure label={t('workOrder.detail.parts')} value={partsTotal} />
                    <CostFigure label={t('workOrder.detail.total')} value={toNum(wo.totalCost)} emphasis />
                  </dl>
                </Section>

                <Section
                  id="wo-parts"
                  title={t('workOrder.detail.partsTitle', { count: wo.parts.length })}
                  action={
                    canEdit &&
                    actions?.addParts && (
                      <Button size="sm" variant="ghost" onClick={() => setSub('part')}>
                        <PackagePlus aria-hidden /> {t('workOrder.detail.addPart')}
                      </Button>
                    )
                  }
                >
                  {wo.parts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('workOrder.detail.noParts')}</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {wo.parts.map((p) => (
                        <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate text-foreground">{p.inventoryItem?.name ?? '—'}</p>
                            <p className="num text-xs text-muted-foreground">
                              {formatNumber(toNum(p.quantity), { maxDecimals: 2 })} {p.inventoryItem?.uom ?? ''} ×{' '}
                              {formatRupiah(toNum(p.unitCost))}
                              {p.fromLocation ? ` · ${t('workOrder.detail.fromLocation', { code: p.fromLocation.code })}` : ''}
                            </p>
                          </div>
                          <span className="num shrink-0 text-foreground">
                            {formatRupiah(toNum(p.quantity) * toNum(p.unitCost))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {Array.isArray(wo.checklist) && wo.checklist.length > 0 && (
                  <Section
                    id="wo-checklist"
                    title={t('workOrder.detail.checklistTitle', { done: wo.checklist.filter((c) => c.done).length, total: wo.checklist.length })}
                  >
                    <ul className="space-y-1.5">
                      {wo.checklist.map((c) => (
                        <li key={c.id} className="flex items-start gap-2 text-sm">
                          {c.done ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <span className="text-foreground">
                              <span className="sr-only">{c.done ? t('workOrder.detail.doneSr') : t('workOrder.detail.notDoneSr')} </span>
                              {c.label}
                            </span>
                            {c.required && <span className="ml-1.5 text-xs font-medium text-danger-text">{t('workOrder.detail.required')}</span>}
                            {c.notes && <span className="block text-xs text-muted-foreground">{c.notes}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section
                  id="wo-photos"
                  title={t('workOrder.detail.photosTitle', { count: wo.photos.length, max: MAX_WO_PHOTOS })}
                  action={
                    canEdit &&
                    canUploadPhoto(wo, userId) && (
                      <Button size="sm" variant="ghost" onClick={() => setSub('photo')}>
                        <ImagePlus aria-hidden /> {t('workOrder.detail.addPhoto')}
                      </Button>
                    )
                  }
                >
                  {wo.photos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('workOrder.detail.noPhotos')}</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {wo.photos.map((ph) => (
                        <li key={ph.id} className="relative">
                          <a href={`/uploads/${ph.filePath}`} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <img
                              src={`/uploads/${ph.filePath}`}
                              alt={ph.caption || (ph.type === 'BEFORE' ? t('workOrder.detail.photoBeforeAlt') : t('workOrder.detail.photoAfterAlt'))}
                              className="h-24 w-full rounded-md border border-border object-cover"
                            />
                          </a>
                          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                            {ph.type === 'BEFORE' ? t('workOrder.detail.before') : t('workOrder.detail.after')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section
                  id="wo-mr"
                  title={t('workOrder.detail.mrTitle')}
                  action={
                    canCreateMr &&
                    actions?.requestMaterial && (
                      <Button size="sm" variant="ghost" onClick={() => setSub('mr')}>
                        <FilePlus aria-hidden /> {t('workOrder.detail.requestParts')}
                      </Button>
                    )
                  }
                >
                  {wo.materialRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('workOrder.detail.noMr')}</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {wo.materialRequests.map((mr) => (
                        <li key={mr.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0">
                            {canViewMr ? (
                              <Link
                                to={`/ga/material-requests?mr=${mr.id}`}
                                className="num font-mono text-primary underline-offset-4 hover:underline"
                              >
                                {mr.code}
                              </Link>
                            ) : (
                              <span className="num font-mono text-foreground">{mr.code}</span>
                            )}
                            <span className="ml-1.5 text-xs text-muted-foreground">{t('workOrder.detail.mrItems', { count: mr._count?.items ?? 0 })}</span>
                          </span>
                          <StatusBadge status={mr.status} docType="ga_material_request" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </>
            )}
          </SheetBody>

          {hasFooter && wo && actions && (
            <SheetFooter className="flex-row flex-wrap justify-end sm:flex-row">
              {actions.cancel && (
                <Button variant="ghost" className="mr-auto text-danger-text hover:bg-danger-subtle" onClick={() => setCancelConfirm(true)}>
                  <XCircle aria-hidden /> {t('workOrder.detail.cancelWo')}
                </Button>
              )}
              {actions.assign && (
                <Button variant={wo.status === 'OPEN' ? 'primary' : 'outline'} onClick={() => setSub('assign')}>
                  <UserPlus aria-hidden /> {wo.status === 'ASSIGNED' ? t('workOrder.detail.changeTechnician') : t('workOrder.detail.assign')}
                </Button>
              )}
              {actions.start && (
                <Button variant="outline" onClick={() => startMutation.mutate()} loading={startMutation.isPending}>
                  <Play aria-hidden /> {t('workOrder.detail.start')}
                </Button>
              )}
              {actions.complete && (
                <Button onClick={() => setSub('complete')}>
                  <CheckCircle2 aria-hidden /> {t('workOrder.detail.complete')}
                </Button>
              )}
              {actions.close && (
                <Button onClick={() => setCloseConfirm(true)} loading={closeMutation.isPending}>
                  <Lock aria-hidden /> {t('workOrder.detail.closeWo')}
                </Button>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {id && sub === 'assign' && (
        <AssignModal id={id} currentAssigneeId={wo?.assignedToId} onClose={() => setSub(null)} onDone={invalidate} />
      )}
      {id && sub === 'complete' && <CompleteModal id={id} onClose={() => setSub(null)} onDone={invalidate} />}
      {id && sub === 'part' && <AddPartModal id={id} onClose={() => setSub(null)} onDone={invalidate} />}
      {id && sub === 'photo' && <PhotoUploadModal id={id} onClose={() => setSub(null)} onDone={invalidate} />}
      {id && sub === 'mr' && wo && (
        <CreateMrModal
          woContext={{ workOrderId: id, assetId: wo.asset?.id ?? null, woCode: wo.code }}
          onClose={() => {
            setSub(null);
            invalidate();
          }}
        />
      )}

      <ConfirmDialog
        open={closeConfirm}
        onOpenChange={setCloseConfirm}
        title={t('workOrder.detail.closeTitle')}
        description={t('workOrder.detail.closeDescription', { code: wo?.code ?? '' })}
        confirmLabel={t('workOrder.detail.confirmClose')}
        loading={closeMutation.isPending}
        onConfirm={() => closeMutation.mutateAsync()}
      />
      <ConfirmDialog
        open={cancelConfirm}
        onOpenChange={setCancelConfirm}
        tone="danger"
        title={t('workOrder.detail.cancelTitle')}
        description={t('workOrder.detail.cancelDescription', { code: wo?.code ?? '' })}
        confirmLabel={t('workOrder.detail.cancelWo')}
        requireReason={{ label: t('workOrder.detail.cancelReason'), minLength: 1 }}
        loading={cancelMutation.isPending}
        onConfirm={(reason) => cancelMutation.mutateAsync((reason ?? '').slice(0, 500))}
      />
    </>
  );
}

function CostFigure({ label, value, hint, emphasis }: { label: string; value: number; hint?: string; emphasis?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'num mt-0.5 font-semibold text-foreground' : 'num mt-0.5 text-foreground'}>
        {formatRupiah(value)}
      </dd>
      {hint && <dd className="truncate text-xs text-muted-foreground" title={hint}>{hint}</dd>}
    </div>
  );
}

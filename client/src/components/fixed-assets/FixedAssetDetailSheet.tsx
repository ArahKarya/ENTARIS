/**
 * Detail sheet for one fixed asset: master data, GL accounts, value figures
 * and the depreciation schedule. Each unposted period can be posted on its own
 * (the page owns the confirmation dialog and the mutation). Write actions are
 * passed in only when the user has the `fixed_assets` edit permission.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, StatusBadge } from '@/components/shared';
import { ACTIVE_STATUS, type DepreciationEntryRow, type DepreciationPostTarget, type FixedAssetRow } from './types';

interface FixedAssetDetailSheetProps {
  /** Asset id from the URL (?asset=…); null closes the sheet. */
  assetId: string | null;
  /** List row for an instant header while the detail loads. */
  fallback?: FixedAssetRow | null;
  onClose: () => void;
  /** Present only with edit permission. */
  onEdit?: (asset: FixedAssetRow) => void;
  onDispose?: (asset: FixedAssetRow) => void;
  onPostEntry?: (target: DepreciationPostTarget) => void;
  postingEntryId?: string | null;
}

const num = (v: unknown) => toNumber(v as string | number | null) ?? 0;
const account = (a?: { accountNumber: string; name: string } | null) => (a ? `${a.accountNumber} · ${a.name}` : '—');

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Figure({ label, value, emphasis, className }: { label: string; value: number; emphasis?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-md border border-border px-3 py-2', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? 'num mt-0.5 font-semibold text-foreground' : 'num mt-0.5 text-foreground'}>
        {formatRupiah(value)}
      </dd>
    </div>
  );
}

export function FixedAssetDetailSheet({
  assetId,
  fallback,
  onClose,
  onEdit,
  onDispose,
  onPostEntry,
  postingEntryId,
}: FixedAssetDetailSheetProps) {
  const { t } = useTranslation('finance');
  const detailQuery = useQuery({
    queryKey: ['fixed-asset', assetId],
    queryFn: async () => (await api.get<FixedAssetRow>(`/fixed-assets/${assetId}`)).data,
    enabled: !!assetId,
  });

  const asset = detailQuery.data ?? (fallback && fallback.id === assetId ? fallback : null);
  const entries = detailQuery.data?.depreciationEntries ?? [];
  const postedCount = entries.filter((e) => e.isPosted).length;
  const isActive = asset?.status === ACTIVE_STATUS;

  const toTarget = (a: FixedAssetRow, e: DepreciationEntryRow): DepreciationPostTarget => ({
    assetId: a.id,
    assetName: a.name,
    assetNumber: a.assetNumber,
    entryId: e.id,
    periodDate: e.periodDate,
    amount: num(e.amount),
    depAccount: `${a.depreciationAccount.accountNumber} ${a.depreciationAccount.name}`,
    accumAccount: `${a.accumulatedDepAccount.accountNumber} ${a.accumulatedDepAccount.name}`,
  });

  return (
    <Sheet open={assetId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {!asset ? (
          <>
            <SheetHeader>
              <SheetTitle>{t('fixedAssetDetailSheet.title')}</SheetTitle>
              <SheetDescription>{detailQuery.isError ? t('fixedAssetDetailSheet.loadError') : t('fixedAssetDetailSheet.loading')}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              {detailQuery.isError ? (
                <EmptyState
                  kind="error"
                  compact
                  action={
                    <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
                      {t('fixedAssetDetailSheet.retry')}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-24 w-full" />
                </div>
              )}
            </SheetBody>
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="num font-mono">{asset.assetNumber}</SheetTitle>
                <StatusBadge status={asset.status} docType="fixed_asset" />
              </div>
              <SheetDescription>{asset.name}</SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label={t('fixedAssetDetailSheet.fields.category')}>{asset.category}</Detail>
                <Detail label={t('fixedAssetDetailSheet.fields.acquisitionDate')}>{formatDate(asset.acquisitionDate)}</Detail>
                <Detail label={t('fixedAssetDetailSheet.fields.usefulLife')}>{t('fixedAssetDetailSheet.months', { count: asset.usefulLifeMonths })}</Detail>
                <Detail label={t('fixedAssetDetailSheet.fields.salvageValue')}>{formatRupiah(asset.salvageValue)}</Detail>
                <Detail label={t('fixedAssetDetailSheet.fields.method')}>
                  {asset.depreciationMethod === 'straight_line' ? t('fixedAssetDetailSheet.straightLine') : asset.depreciationMethod}
                </Detail>
                <Detail label={t('fixedAssetDetailSheet.fields.createdBy')}>{asset.user?.fullName ?? '—'}</Detail>
                {asset.gaAsset && (
                  <Detail label={t('fixedAssetDetailSheet.fields.eamAsset')}>
                    <span className="font-mono">{asset.gaAsset.code}</span> · {asset.gaAsset.name}
                  </Detail>
                )}
                {asset.disposalDate && <Detail label={t('fixedAssetDetailSheet.fields.disposalDate')}>{formatDate(asset.disposalDate)}</Detail>}
                <Detail wide label={t('fixedAssetDetailSheet.fields.assetAccount')}>{account(asset.assetAccount)}</Detail>
                <Detail wide label={t('fixedAssetDetailSheet.fields.depreciationAccount')}>{account(asset.depreciationAccount)}</Detail>
                <Detail wide label={t('fixedAssetDetailSheet.fields.accumulatedAccount')}>{account(asset.accumulatedDepAccount)}</Detail>
                {asset.description && (
                  <Detail wide label={t('fixedAssetDetailSheet.fields.description')}>
                    {asset.description}
                  </Detail>
                )}
              </dl>

              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Figure label={t('fixedAssetDetailSheet.figures.cost')} value={num(asset.acquisitionCost)} />
                <Figure label={t('fixedAssetDetailSheet.figures.accumulated')} value={num(asset.accumulatedDepreciation)} />
                <Figure label={t('fixedAssetDetailSheet.figures.bookValue')} value={num(asset.bookValue)} emphasis className="col-span-2 sm:col-span-1" />
              </dl>

              <section aria-labelledby="fa-schedule">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 id="fa-schedule" className="text-sm font-semibold text-foreground">
                    {t('fixedAssetDetailSheet.schedule.title')}
                  </h3>
                  {detailQuery.data && (
                    <p className="text-xs text-muted-foreground">
                      {t('fixedAssetDetailSheet.schedule.progress', { posted: formatNumber(postedCount), total: formatNumber(entries.length) })}
                    </p>
                  )}
                </div>
                {!detailQuery.data ? (
                  <Skeleton className="mt-2 h-32 w-full" />
                ) : entries.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">{t('fixedAssetDetailSheet.schedule.empty')}</p>
                ) : (
                  <div
                    role="region"
                    aria-label={t('fixedAssetDetailSheet.schedule.region')}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                    tabIndex={0}
                    className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t('fixedAssetDetailSheet.schedule.caption', { number: asset.assetNumber })}</caption>
                      <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-2 sm:px-3 py-2 text-left font-medium">{t('fixedAssetDetailSheet.schedule.period')}</th>
                          <th scope="col" className="whitespace-nowrap px-2 sm:px-3 py-2 text-right font-medium">
                            {t('fixedAssetDetailSheet.schedule.amount')} <span className="normal-case">(Rp)</span>
                          </th>
                          <th scope="col" className="px-2 sm:px-3 py-2 text-left font-medium">{t('fixedAssetDetailSheet.schedule.status')}</th>
                          <th scope="col" className="px-2 sm:px-3 py-2 text-right font-medium sm:w-24">
                            <span className="sr-only">{t('fixedAssetDetailSheet.schedule.actions')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="num whitespace-nowrap px-2 sm:px-3 py-1.5 text-muted-foreground">
                              {formatDate(e.periodDate)}
                            </td>
                            <td className="num px-2 sm:px-3 py-1.5 text-right text-foreground">
                              {formatRupiah(e.amount, { symbol: false })}
                            </td>
                            <td className="px-2 sm:px-3 py-1.5">
                              <StatusBadge
                                status={e.isPosted ? 'Posted' : 'Pending'}
                                label={e.isPosted ? t('fixedAssetDetailSheet.schedule.posted') : t('fixedAssetDetailSheet.schedule.pending')}
                                tone={e.isPosted ? 'success' : 'warning'}
                              />
                            </td>
                            <td className="px-2 sm:px-3 py-1 text-right">
                              {!e.isPosted && isActive && onPostEntry && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  loading={postingEntryId === e.id}
                                  disabled={!!postingEntryId}
                                  onClick={() => onPostEntry(toTarget(asset, e))}
                                  aria-label={t('fixedAssetDetailSheet.schedule.postLabel', { date: formatDate(e.periodDate) })}
                                >
                                  <Play aria-hidden />
                                  <span className="hidden sm:inline">{t('fixedAssetDetailSheet.schedule.post')}</span>
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </SheetBody>

            {isActive && (onEdit || onDispose) && (
              <SheetFooter>
                {onDispose && (
                  <Button variant="outline" className="text-danger-text" onClick={() => onDispose(asset)}>
                    <Trash2 aria-hidden />
                    {t('fixedAssetDetailSheet.dispose')}
                  </Button>
                )}
                {onEdit && (
                  <Button variant="outline" onClick={() => onEdit(asset)}>
                    <Pencil aria-hidden />
                    {t('fixedAssetDetailSheet.edit')}
                  </Button>
                )}
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Detail sheet for one asset (Daftar Aset, ?asset=<id>): photos, identity,
 * status, acquisition and the linked fixed asset. Actions are passed in by the
 * page, which owns the permission checks (QR is always available).
 */
import { useQuery } from '@tanstack/react-query';
import { FileText, Pencil, QrCode, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, StatusBadge } from '@/components/shared';
import { conditionMeta, photoUrl, type AssetRow } from './asset-model';
import { AssetThumb, Detail } from './asset-ui';
import { useTranslation } from 'react-i18next';

interface AssetDetailSheetProps {
  /** Asset id from the URL; null closes the sheet. */
  assetId: string | null;
  /** List row for an instant header while the detail loads. */
  fallback?: AssetRow | null;
  onClose: () => void;
  onQr: (asset: AssetRow) => void;
  /** Present only with ga_documents view permission. */
  onDocuments?: (asset: AssetRow) => void;
  /** Present only with ga_assets edit permission. */
  onEdit?: (asset: AssetRow) => void;
  onDelete?: (asset: AssetRow) => void;
}

export function AssetDetailSheet({ assetId, fallback, onClose, onQr, onDocuments, onEdit, onDelete }: AssetDetailSheetProps) {
  const { t } = useTranslation('eam');
  const detailQuery = useQuery({
    queryKey: ['ga-asset-detail', assetId],
    queryFn: async () => (await api.get<AssetRow>(`/ga/assets/${assetId}`)).data,
    enabled: !!assetId,
  });
  const asset = detailQuery.data ?? (fallback && fallback.id === assetId ? fallback : null);
  const photos = detailQuery.data?.photos ?? [];
  const condition = conditionMeta(asset?.condition);
  // The linked fixed asset (accounting) is the fallback source for acquisition data.
  const acquisitionDate = asset?.acquisitionDate ?? asset?.fixedAsset?.acquisitionDate ?? null;
  const acquisitionCost = asset?.acquisitionCost ?? asset?.fixedAsset?.acquisitionCost ?? null;

  return (
    <Sheet open={assetId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {!asset ? (
          <>
            <SheetHeader>
              <SheetTitle>{t('assets.detail.title')}</SheetTitle>
              <SheetDescription>{detailQuery.isError ? t('assets.detail.loadError') : t('assets.detail.loading')}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              {detailQuery.isError ? (
                <EmptyState
                  kind="error"
                  compact
                  description={t('assets.detail.loadErrorDescription')}
                  action={
                    <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
                      {t('assets.detail.retry')}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  <Skeleton className="h-40 w-full" />
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
                <SheetTitle className="num font-mono">{asset.code}</SheetTitle>
                <StatusBadge status={asset.status} docType="ga_asset" />
              </div>
              <SheetDescription className="text-foreground">{asset.name}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-5">
              {photos.length > 0 ? (
                <ul className="grid grid-cols-3 gap-2" aria-label={t('assets.detail.photos')}>
                  {photos.map((ph, i) => (
                    <li key={ph.id} className={i === 0 ? 'col-span-3' : undefined}>
                      <a href={photoUrl(ph.filePath)} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <img
                          src={photoUrl(ph.filePath)}
                          alt={ph.caption ?? `${t('assets.detail.photoAlt', { name: asset.name })}${photos.length > 1 ? ` (${i + 1})` : ''}`}
                          className={i === 0 ? 'h-48 w-full rounded-md border border-border object-cover' : 'h-20 w-full rounded-md border border-border object-cover'}
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  <AssetThumb alt="" />
                  {detailQuery.isLoading ? t('assets.detail.loadingPhotos') : onEdit ? t('assets.detail.noPhotoEdit') : t('assets.detail.noPhoto')}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label={t('assets.detail.category')}>{asset.category?.name ?? '—'}</Detail>
                <Detail label={t('assets.detail.condition')}>
                  <StatusBadge label={condition.label} tone={condition.tone} dot={false} />
                </Detail>
                <Detail label={t('assets.detail.branch')}>{asset.branch ? `${asset.branch.name} (${asset.branch.code})` : '—'}</Detail>
                <Detail label={t('assets.detail.location')}>{asset.location || '—'}</Detail>
                <Detail label={t('assets.detail.costCenter')}>{asset.costCenter ? `${asset.costCenter.code} · ${asset.costCenter.name}` : '—'}</Detail>
                <Detail label={t('assets.detail.pic')}>{asset.pic?.fullName ?? '—'}</Detail>
                <Detail label={t('assets.detail.serial')}>{asset.serialNumber ? <span className="font-mono">{asset.serialNumber}</span> : '—'}</Detail>
                <Detail label={t('assets.detail.acquisitionDate')}>
                  <span className="num">{formatDate(acquisitionDate)}</span>
                </Detail>
                <Detail label={t('assets.detail.acquisitionCost')}>
                  <span className="num">{acquisitionCost != null ? formatRupiah(acquisitionCost) : '—'}</span>
                </Detail>
                {asset.vehicleData?.noPlat && <Detail label={t('assets.detail.plate')}>{asset.vehicleData.noPlat}</Detail>}
                {asset.fixedAsset && (
                  <Detail label={t('assets.detail.fixedAsset')} wide>
                    <span className="num font-mono">{asset.fixedAsset.assetNumber}</span>
                    <span className="text-muted-foreground"> · {t('assets.detail.bookValue')} </span>
                    <span className="num">{formatRupiah(asset.fixedAsset.bookValue)}</span>
                  </Detail>
                )}
                {asset.notes && (
                  <Detail label={t('shared.notes')} wide>
                    <span className="whitespace-pre-line">{asset.notes}</span>
                  </Detail>
                )}
              </dl>
            </SheetBody>
            <SheetFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onQr(asset)}>
                  <QrCode aria-hidden />
                  {t('assets.detail.qr')}
                </Button>
                {onDocuments && (
                  <Button variant="outline" onClick={() => onDocuments(asset)}>
                    <FileText aria-hidden />
                    {t('assets.detail.documents')}
                  </Button>
                )}
              </div>
              {(onEdit || onDelete) && (
                <div className="flex flex-wrap gap-2">
                  {onDelete && (
                    <Button variant="ghost" className="text-danger-text hover:bg-danger-subtle" onClick={() => onDelete(asset)}>
                      <Trash2 aria-hidden />
                      {t('shared.delete')}
                    </Button>
                  )}
                  {onEdit && (
                    <Button onClick={() => onEdit(asset)}>
                      <Pencil aria-hidden />
                      {t('shared.edit')}
                    </Button>
                  )}
                </div>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

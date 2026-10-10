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
              <SheetTitle>Detail aset</SheetTitle>
              <SheetDescription>{detailQuery.isError ? 'Aset tidak dapat dimuat.' : 'Memuat…'}</SheetDescription>
            </SheetHeader>
            <SheetBody>
              {detailQuery.isError ? (
                <EmptyState
                  kind="error"
                  compact
                  description="Aset mungkin sudah dihapus, atau koneksi terputus."
                  action={
                    <Button variant="outline" size="sm" onClick={() => detailQuery.refetch()}>
                      Coba lagi
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
                <ul className="grid grid-cols-3 gap-2" aria-label="Foto aset">
                  {photos.map((ph, i) => (
                    <li key={ph.id} className={i === 0 ? 'col-span-3' : undefined}>
                      <a href={photoUrl(ph.filePath)} target="_blank" rel="noreferrer" className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <img
                          src={photoUrl(ph.filePath)}
                          alt={ph.caption ?? `Foto ${asset.name}${photos.length > 1 ? ` (${i + 1})` : ''}`}
                          className={i === 0 ? 'h-48 w-full rounded-md border border-border object-cover' : 'h-20 w-full rounded-md border border-border object-cover'}
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  <AssetThumb alt="" />
                  {detailQuery.isLoading ? 'Memuat foto…' : onEdit ? 'Belum ada foto. Tambahkan lewat Edit.' : 'Belum ada foto.'}
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label="Kategori">{asset.category?.name ?? '-'}</Detail>
                <Detail label="Kondisi">
                  <StatusBadge label={condition.label} tone={condition.tone} dot={false} />
                </Detail>
                <Detail label="Cabang">{asset.branch ? `${asset.branch.name} (${asset.branch.code})` : '-'}</Detail>
                <Detail label="Lokasi">{asset.location || '-'}</Detail>
                <Detail label="Cost center">{asset.costCenter ? `${asset.costCenter.code} · ${asset.costCenter.name}` : '-'}</Detail>
                <Detail label="Penanggung jawab">{asset.pic?.fullName ?? '-'}</Detail>
                <Detail label="No. seri">{asset.serialNumber ? <span className="font-mono">{asset.serialNumber}</span> : '-'}</Detail>
                <Detail label="Tanggal perolehan">
                  <span className="num">{formatDate(acquisitionDate)}</span>
                </Detail>
                <Detail label="Nilai perolehan">
                  <span className="num">{acquisitionCost != null ? formatRupiah(acquisitionCost) : '-'}</span>
                </Detail>
                {asset.vehicleData?.noPlat && <Detail label="No. polisi">{asset.vehicleData.noPlat}</Detail>}
                {asset.fixedAsset && (
                  <Detail label="Aset tetap (akuntansi)" wide>
                    <span className="num font-mono">{asset.fixedAsset.assetNumber}</span>
                    <span className="text-muted-foreground"> · nilai buku </span>
                    <span className="num">{formatRupiah(asset.fixedAsset.bookValue)}</span>
                  </Detail>
                )}
                {asset.notes && (
                  <Detail label="Catatan" wide>
                    <span className="whitespace-pre-line">{asset.notes}</span>
                  </Detail>
                )}
              </dl>
            </SheetBody>
            <SheetFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => onQr(asset)}>
                  <QrCode aria-hidden />
                  QR aset
                </Button>
                {onDocuments && (
                  <Button variant="outline" onClick={() => onDocuments(asset)}>
                    <FileText aria-hidden />
                    Dokumen
                  </Button>
                )}
              </div>
              {(onEdit || onDelete) && (
                <div className="flex flex-wrap gap-2">
                  {onDelete && (
                    <Button variant="ghost" className="text-danger-text hover:bg-danger-subtle" onClick={() => onDelete(asset)}>
                      <Trash2 aria-hidden />
                      Hapus
                    </Button>
                  )}
                  {onEdit && (
                    <Button onClick={() => onEdit(asset)}>
                      <Pencil aria-hidden />
                      Edit
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

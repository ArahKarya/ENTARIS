/**
 * Item photo thumbnail (served by the secure /ga/inventory/items/:id/image
 * endpoint) and the enlarged preview dialog.
 */
import { useState } from 'react';
import { Package } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { itemImageUrl, type GaItemRow } from './ga-inventory-model';
import i18n from '@/i18n';

interface ItemThumbProps {
  item: Pick<GaItemRow, 'id' | 'name' | 'imagePath'>;
  onPreview?: (item: Pick<GaItemRow, 'id' | 'name' | 'imagePath'>) => void;
  className?: string;
}

const BOX = 'size-10 shrink-0 overflow-hidden rounded-md border border-border';

/** 40px thumbnail; a button that opens the preview when the item has a photo. */
export function ItemThumb({ item, onPreview, className }: ItemThumbProps) {
  const [failed, setFailed] = useState(false);
  if (!item.imagePath || failed) {
    return (
      <span className={cn(BOX, 'flex items-center justify-center border-dashed bg-muted text-muted-foreground', className)}>
        <Package className="size-4" aria-hidden />
        <span className="sr-only">{i18n.t('eam:itemImage.noPhoto')}</span>
      </span>
    );
  }
  const img = (
    <img
      src={itemImageUrl(item.id, item.imagePath)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
  if (!onPreview) return <span className={cn(BOX, className)}>{img}</span>;
  return (
    <button
      type="button"
      onClick={() => onPreview(item)}
      aria-label={`Perbesar foto ${item.name}`}
      className={cn(BOX, 'cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {img}
    </button>
  );
}

interface ItemImageDialogProps {
  item: Pick<GaItemRow, 'id' | 'name' | 'imagePath'> | null;
  onClose: () => void;
}

export function ItemImageDialog({ item, onClose }: ItemImageDialogProps) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" className="gap-3">
        {item && (
          <>
            <DialogTitle className="pr-8">{item.name}</DialogTitle>
            <DialogDescription className="sr-only">{i18n.t('eam:itemImage.photo')}</DialogDescription>
            <img
              src={itemImageUrl(item.id, item.imagePath)}
              alt={`Foto ${item.name}`}
              className="max-h-[70dvh] w-full rounded-md object-contain"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

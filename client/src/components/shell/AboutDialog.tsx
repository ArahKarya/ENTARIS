import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wordmark } from '@/components/shared/brand-mark';
import { APP_BUILD_DATE, APP_VERSION } from '@/lib/version';
import { formatDate } from '@/lib/format';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useTranslation } from 'react-i18next';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAKER = 'PT Arah Karya Sinergi';
const DEVELOPER = 'Yayang Setya Nugroho';

/** Version, build date and credits: kept out of the app chrome (sidebar/topbar). */
export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useTranslation('shell');
  const year = new Date().getFullYear();
  // Opened from the user menu (no Dialog.Trigger): send focus back there on close.
  const returnFocus = useReturnFocus();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" onOpenAutoFocus={returnFocus.capture} onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{t('about.title')}</DialogTitle>
          <DialogDescription>{t('about.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center rounded-lg border border-border bg-muted px-4 py-6">
          <Wordmark size="lg" product="ERP" tagline />
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t('about.version')}</dt>
          <dd className="num font-medium text-foreground">{APP_VERSION}</dd>
          <dt className="text-muted-foreground">{t('about.releaseDate')}</dt>
          <dd className="font-medium text-foreground">{formatDate(APP_BUILD_DATE, 'long')}</dd>
          <dt className="text-muted-foreground">{t('about.developer')}</dt>
          <dd className="font-medium text-foreground">{DEVELOPER}</dd>
        </dl>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          {t('about.credits', { maker: MAKER, year })}
        </p>
      </DialogContent>
    </Dialog>
  );
}

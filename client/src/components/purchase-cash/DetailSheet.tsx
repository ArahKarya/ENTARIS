/**
 * Detail drawer shell: header (title, status, subtitle), scrolling body and an
 * optional pinned action footer. Full width on mobile, side panel from `sm`.
 */
import type { ReactNode } from 'react';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

export interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Status badge etc., shown next to the title. */
  badge?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Header-right actions (PDF, edit…) that sit before the close button. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function DetailSheet({
  open,
  onClose,
  title,
  badge,
  description,
  size = 'md',
  className,
  headerActions,
  footer,
  children,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent size={size} className={className}>
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="min-w-0 break-words">{title}</SheetTitle>
            {badge}
          </div>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{i18n.t('purchasing:documentDetails')}</SheetDescription>
          )}
          {headerActions && <div className={cn('flex flex-wrap items-center gap-2 pt-1')}>{headerActions}</div>}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

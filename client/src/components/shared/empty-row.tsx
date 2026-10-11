import type { ReactNode } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type EmptyRowProps = {
  colSpan: number;
  children?: ReactNode;
  className?: string;
};

export function EmptyRow({ colSpan, children, className }: EmptyRowProps) {
  const { t } = useTranslation('common');
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className={cn('h-24 text-center text-sm text-muted-foreground', className)}
      >
        {children ?? t('emptyRow')}
      </TableCell>
    </TableRow>
  );
}

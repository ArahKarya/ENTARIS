/**
 * Read-only detail drawer for one stock movement, rendered from the list row
 * (no extra request). Edit / cancel are passed in by the tab, which owns the
 * permission checks; the server's blocking rules are explained here.
 */
import type { ReactNode } from 'react';
import { Factory, Pencil, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/shared';
import {
  formatQty,
  isInbound,
  movementCancelBlock,
  movementEditBlock,
  movementTypeLabel,
  referenceTypeLabel,
  type StockMovementRow,
} from './inventory-rows';

interface MovementDetailSheetProps {
  movement: StockMovementRow | null;
  onClose: () => void;
  onEdit?: (m: StockMovementRow) => void;
  onCancel?: (m: StockMovementRow) => void;
  onOpenProductionRun?: (runId: string) => void;
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function MovementDetailSheet({ movement: m, onClose, onEdit, onCancel, onOpenProductionRun }: MovementDetailSheetProps) {
  const { t } = useTranslation('inventory');
  const editBlock = m ? movementEditBlock(m) : null;
  const cancelBlock = m ? movementCancelBlock(m) : null;
  const showEdit = !!m && !!onEdit && !editBlock;
  const showCancel = !!m && !!onCancel && !cancelBlock;
  const runId = m?.referenceType === 'ProductionRun' ? m.referenceId : null;
  const note = m && !m.isCancelled ? (editBlock ?? cancelBlock) : null;

  return (
    <Sheet open={m !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md">
        {m && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="num font-mono">{m.movementNumber ?? m.id.slice(0, 8)}</SheetTitle>
                <StatusBadge status={m.isCancelled ? 'Cancelled' : 'Posted'} />
              </div>
              <SheetDescription>
                {movementTypeLabel(m.movementType)} · {m.item?.name ?? '—'}
              </SheetDescription>
            </SheetHeader>

            <SheetBody className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Detail label={t('movementDetailSheet.fields.date')}>{formatDate(m.date)}</Detail>
                <Detail label={t('movementDetailSheet.fields.warehouse')}>{m.warehouse?.name ?? '—'}</Detail>
                <Detail label={t('movementDetailSheet.fields.item')}>
                  {m.item?.name ?? '—'}
                  {m.item?.code && <span className="num ml-1.5 font-mono text-xs text-muted-foreground">{m.item.code}</span>}
                </Detail>
                <Detail label={t('movementDetailSheet.fields.type')}>{movementTypeLabel(m.movementType)}</Detail>
                <Detail label={t('movementDetailSheet.fields.quantity')}>
                  <span className="num font-medium">
                    {isInbound(m.movementType) ? '+' : '−'}
                    {formatQty(m.quantity)} {m.item?.unit ?? ''}
                  </span>
                </Detail>
                <Detail label={t('movementDetailSheet.fields.unitCost')}>
                  <span className="num">{formatRupiah(m.unitCost ?? 0)}</span>
                </Detail>
                <Detail label={t('movementDetailSheet.fields.value')}>
                  <span className="num font-medium">{m.totalValue != null ? formatRupiah(m.totalValue) : '—'}</span>
                </Detail>
                <Detail label={t('movementDetailSheet.fields.offsetAccount')}>
                  {m.offsetAccount ? `${m.offsetAccount.accountNumber} · ${m.offsetAccount.name}` : '—'}
                </Detail>
                <Detail label={t('movementDetailSheet.fields.reference')} wide>
                  {m.referenceNumber ? (
                    <span>
                      {referenceTypeLabel(m.referenceType)}{' '}
                      <span className="num font-mono">{m.referenceNumber}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </Detail>
                {m.notes && (
                  <Detail label={t('movementDetailSheet.fields.notes')} wide>
                    {m.notes}
                  </Detail>
                )}
                {m.createdAt && <Detail label={t('movementDetailSheet.fields.recordedAt')}>{formatDateTime(m.createdAt)}</Detail>}
              </dl>

              {note && (
                <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{note}</p>
              )}
            </SheetBody>

            {(showEdit || showCancel || (runId && onOpenProductionRun)) && (
              <SheetFooter>
                {runId && onOpenProductionRun && (
                  <Button variant="outline" onClick={() => onOpenProductionRun(runId)}>
                    <Factory aria-hidden />
                    {t('movementDetailSheet.actions.openProductionRun')}
                  </Button>
                )}
                {showCancel && (
                  <Button variant="outline" className="text-danger-text" onClick={() => onCancel?.(m)}>
                    <XCircle aria-hidden />
                    {t('movementDetailSheet.actions.cancel')}
                  </Button>
                )}
                {showEdit && (
                  <Button onClick={() => onEdit?.(m)}>
                    <Pencil aria-hidden />
                    {t('movementDetailSheet.actions.edit')}
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

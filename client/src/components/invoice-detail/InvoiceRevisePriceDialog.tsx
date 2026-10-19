/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/** "Revisi Harga" dialog (purchase invoices only). State + validation live in InvoiceDetailDrawer. */
import { Trans, useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';

interface InvoiceRevisePriceDialogProps {
  open: boolean;
  onClose: () => void;
  invoice: any;
  items: any[];
  rates: Record<string, string>;
  onRateChange: (itemId: string, value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  pending: boolean;
  onSubmit: () => void;
}

export function InvoiceRevisePriceDialog({
  open,
  onClose,
  invoice,
  items,
  rates,
  onRateChange,
  reason,
  onReasonChange,
  pending,
  onSubmit,
}: InvoiceRevisePriceDialogProps) {
  const { t } = useTranslation('sales');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-2xl`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle>{t('invoiceRevisePriceDialog.title')}</DialogTitle>
            <DialogDescription>
              {invoice.invoiceNumber} · {invoice.supplier?.name}
            </DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-3">
            <p className="rounded-lg border border-primary/30 bg-primary-subtle p-2.5 text-xs text-primary-subtle-foreground">
              <Trans t={t} i18nKey="invoiceRevisePriceDialog.explainer" components={{ strong: <strong /> }} />
            </p>
            <ul className="space-y-2">
              {items.map((it: any) => {
                const oldRate = Number(it.rate);
                const qty = Number(it.quantity);
                const raw = rates[it.id] ?? String(oldRate);
                const newRate = Number(raw);
                const delta = Number.isFinite(newRate) ? (newRate - oldRate) * qty : 0;
                return (
                  <li key={it.id} className="rounded-lg border border-border p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{it.itemName}</span>
                      <span className="text-[11px] text-muted-foreground">{qty.toLocaleString(LOCALE)} {it.unit}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{t('invoiceRevisePriceDialog.oldRate', { value: oldRate.toLocaleString(LOCALE) })}</span>
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <NumberInput
                        aria-label={t('invoiceRevisePriceDialog.newRateAria', { name: it.itemName })}
                        value={raw}
                        min={0}
                        onChange={(e) => onRateChange(it.id, e.target.value)}
                        className={`${numberInputClass} w-36`}
                        placeholder={t('invoiceRevisePriceDialog.newRatePlaceholder')}
                      />
                      {delta !== 0 && (
                        <span className={`ml-auto font-medium tabular-nums ${delta > 0 ? 'text-danger-text' : 'text-success-text'}`}>
                          {delta > 0 ? '+' : ''}{delta.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Field label={t('invoiceRevisePriceDialog.reason')} required>
              <Textarea
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                rows={2}
                placeholder={t('invoiceRevisePriceDialog.reasonPlaceholder')}
              />
            </Field>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={pending}>{t('invoiceRevisePriceDialog.cancel')}</FooterButton>
            <FooterButton type="submit" loading={pending}>
              {pending ? t('invoiceRevisePriceDialog.saving') : t('invoiceRevisePriceDialog.save')}
            </FooterButton>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/** "Revisi Harga" dialog (purchase invoices only). State + validation live in InvoiceDetailDrawer. */
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
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-2xl`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={formShellClass}>
          <FormDialogHeader>
            <DialogTitle>Revisi Harga Invoice</DialogTitle>
            <DialogDescription>
              {invoice.invoiceNumber} · {invoice.supplier?.name}
            </DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-3">
            <p className="rounded-lg border border-primary/30 bg-primary-subtle p-2.5 text-xs text-primary-subtle-foreground">
              Selisih harga diposting otomatis: porsi barang yang <strong>masih di stok</strong> menyesuaikan nilai Persediaan + harga rata-rata; porsi yang <strong>sudah keluar</strong> (produksi/jual) masuk akun <strong>5.11 Selisih Harga Pembelian</strong>. Hutang ke supplier ikut disesuaikan.
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
                      <span className="text-[11px] text-muted-foreground">{qty.toLocaleString('id-ID')} {it.unit}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Lama: {oldRate.toLocaleString('id-ID')}</span>
                      <span aria-hidden className="text-muted-foreground">→</span>
                      <NumberInput
                        aria-label={`Harga baru ${it.itemName}`}
                        value={raw}
                        min={0}
                        onChange={(e) => onRateChange(it.id, e.target.value)}
                        className={`${numberInputClass} w-36`}
                        placeholder="harga baru"
                      />
                      {delta !== 0 && (
                        <span className={`ml-auto font-medium tabular-nums ${delta > 0 ? 'text-danger-text' : 'text-success-text'}`}>
                          {delta > 0 ? '+' : ''}{delta.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Field label="Alasan revisi (min 10 karakter)" required>
              <Textarea
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                rows={2}
                placeholder="contoh: Supplier koreksi harga gabah dari Rp 5.000 → 5.200 sesuai kesepakatan akhir"
              />
            </Field>
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={pending}>Batal</FooterButton>
            <FooterButton type="submit" loading={pending}>
              {pending ? 'Menyimpan…' : 'Simpan Revisi'}
            </FooterButton>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

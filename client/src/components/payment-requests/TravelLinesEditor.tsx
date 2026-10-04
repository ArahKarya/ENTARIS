import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/shared';
import { TRAVEL_CATEGORIES, TRAVEL_CATEGORY_LABEL, formatMoney, type TravelCategory } from './payment-request';
import { MoneyInput } from './MoneyInput';
import { linesTotal, newLine, rateAmount, totalsByCategory, type DraftLine } from './lines';

/** Categories that are priced as tarif × hari/malam. */
const RATE_CATEGORIES: ReadonlySet<TravelCategory> = new Set<TravelCategory>(['PER_DIEM', 'LODGING']);
const UNIT_LABEL: Partial<Record<TravelCategory, { rate: string; qty: string }>> = {
  PER_DIEM: { rate: 'Tarif/hari', qty: 'Hari' },
  LODGING: { rate: 'Tarif/malam', qty: 'Malam' },
};

interface TravelLinesEditorProps {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  error?: string;
  /** Trip length in days (from the travel section) — prefilled into uang saku / penginapan quantity. */
  days: number | null;
  /** Label of the amount column: "Nominal" (plan) or "Realisasi". */
  amountLabel?: string;
  /** Hide the planned rate helper (settlement: realization is usually just an amount). */
  allowRate?: boolean;
}

const isBlank = (l: DraftLine) => !l.description.trim() && !l.amount;

/**
 * Travel expense lines: a category per line, quick-add buttons per category and
 * a rate × days helper (uang saku/penginapan) that fills the amount and keeps
 * tarif × jumlah on the line.
 */
export function TravelLinesEditor({ lines, onChange, error, days, amountLabel = 'Nominal', allowRate = true }: TravelLinesEditorProps) {
  const update = (key: string, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  const updateRate = (l: DraftLine, patch: { unitAmount?: number | null; quantity?: number | null }) => {
    const unitAmount = patch.unitAmount !== undefined ? patch.unitAmount : l.unitAmount;
    const quantity = patch.quantity !== undefined ? patch.quantity : l.quantity;
    const computed = rateAmount(unitAmount, quantity);
    update(l.key, { unitAmount, quantity, ...(computed !== null ? { amount: computed } : {}) });
  };

  const quickAdd = (category: TravelCategory) => {
    const rate = RATE_CATEGORIES.has(category) && allowRate;
    const qty = rate && days ? (category === 'LODGING' ? Math.max(days - 1, 1) : days) : null;
    const line = newLine({ category, description: category === 'OTHER' ? '' : TRAVEL_CATEGORY_LABEL[category], quantity: qty });
    onChange([...lines.filter((l) => !isBlank(l) || l.category), line]);
  };

  const subtotals = [...totalsByCategory(lines).entries()].filter(([, v]) => v > 0);

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Tambah rincian per kategori" className="flex flex-wrap gap-2">
        {TRAVEL_CATEGORIES.map((c) => (
          <Button key={c} type="button" variant="outline" size="sm" onClick={() => quickAdd(c)} disabled={lines.length >= 100}>
            <Plus aria-hidden />
            {TRAVEL_CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Belum ada rincian. Pilih kategori di atas untuk menambah baris biaya perjalanan.
        </p>
      ) : (
        <ol className="space-y-2">
          {lines.map((l, i) => {
            const rate = allowRate && !!l.category && RATE_CATEGORIES.has(l.category);
            const labels = l.category ? UNIT_LABEL[l.category] : undefined;
            const rateDriven = rate && rateAmount(l.unitAmount, l.quantity) !== null;
            return (
              <li key={l.key} className="space-y-2 rounded-lg border border-border bg-card p-3">
                <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <Select value={l.category ?? 'OTHER'} onValueChange={(v) => update(l.key, { category: v as TravelCategory })}>
                    <SelectTrigger aria-label={`Kategori baris ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAVEL_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {TRAVEL_CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`Uraian baris ${i + 1}`}
                    placeholder="mis. Tiket kereta Jakarta–Surabaya"
                    value={l.description}
                    maxLength={500}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <label htmlFor={`${l.key}-date`} className="sr-only">
                      Tanggal biaya baris {i + 1}
                    </label>
                    <DateInput id={`${l.key}-date`} value={l.expenseDate} onChange={(v) => update(l.key, { expenseDate: v })} />
                  </div>
                  {rate && labels && (
                    <>
                      <label className="grid w-36 gap-1 text-xs text-muted-foreground">
                        {labels.rate}
                        <MoneyInput aria-label={`${labels.rate} baris ${i + 1}`} value={l.unitAmount} onChange={(v) => updateRate(l, { unitAmount: v })} />
                      </label>
                      <span aria-hidden className="pb-2 text-muted-foreground">×</span>
                      <label className="grid w-20 gap-1 text-xs text-muted-foreground">
                        {labels.qty}
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="decimal"
                          className="num text-right"
                          aria-label={`${labels.qty} baris ${i + 1}`}
                          value={l.quantity ?? ''}
                          onChange={(e) => updateRate(l, { quantity: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                        />
                      </label>
                      <span aria-hidden className="pb-2 text-muted-foreground">=</span>
                    </>
                  )}
                  <label className="ml-auto grid w-40 gap-1 text-xs text-muted-foreground">
                    {amountLabel} (Rp)
                    <MoneyInput
                      aria-label={`${amountLabel} baris ${i + 1}`}
                      value={l.amount}
                      onChange={(v) => update(l.key, { amount: v, ...(rate ? { unitAmount: null, quantity: null } : {}) })}
                      className={rateDriven ? 'bg-muted/60' : undefined}
                    />
                  </label>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Hapus baris ${i + 1}`} onClick={() => remove(l.key)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Subtotal per kategori">
          {subtotals.map(([c, v]) => (
            <li key={c}>
              {TRAVEL_CATEGORY_LABEL[c]} <span className="num font-medium text-foreground">{formatMoney(v)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Total <span className="num ml-2 text-lg font-semibold text-foreground">{formatMoney(linesTotal(lines))}</span>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

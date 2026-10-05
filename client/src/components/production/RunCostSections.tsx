/** Cost components, HPP / yield summaries, process picker and admin override of the production run dialog. */
import { Plus, Trash2, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';
import { cn } from '@/lib/utils';
import { fmtRupiah, type CostLine, type CostStandard } from './run-form-utils';

const NONE = '__none';

interface CostSectionProps {
  title: string;
  hint: string;
  rows: { c: CostLine; idx: number }[];
  standards: CostStandard[];
  usedStandardIds: Set<string>;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<CostLine>) => void;
  onPickStandard: (idx: number, standardId: string) => void;
  computeTotal: (c: CostLine) => number;
}

export function RunCostSection({
  title, hint, rows, standards, usedStandardIds, onAdd, onRemove, onUpdate, onPickStandard, computeTotal,
}: CostSectionProps) {
  const sectionTotal = rows.reduce((s, { c }) => s + computeTotal(c), 0);
  // "Tambah Biaya" stays enabled even when every standard is used — staff can still enter manually.
  const hasMoreStandards = standards.length > usedStandardIds.size;
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={onAdd}>
          <Plus aria-hidden /> Tambah Biaya
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(({ c, idx }) => {
            // Standards used on another row are hidden; this row keeps its own pick.
            const available = standards.filter((s) => !usedStandardIds.has(s.id) || s.id === c.standardId);
            return (
              <div key={idx} className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <Select value={c.standardId || NONE} onValueChange={(v) => onPickStandard(idx, v === NONE ? '' : v)}>
                      <SelectTrigger aria-label={`Standar biaya ${title} baris ${idx + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Manual (free input) —</SelectItem>
                        {available.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} (default Rp {Number(s.defaultRate)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Select value={c.basis} onValueChange={(v) => onUpdate(idx, { basis: v as CostLine['basis'] })}>
                    <SelectTrigger aria-label={`Basis biaya ${title} baris ${idx + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="InputQty">× qty input</SelectItem>
                      <SelectItem value="OutputQty">× qty output</SelectItem>
                      <SelectItem value="Fixed">Flat (run)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon-touch" className="text-muted-foreground hover:text-danger-text" onClick={() => onRemove(idx)} aria-label={`Hapus biaya ${title} baris ${idx + 1}`}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2">
                  <Input
                    value={c.description}
                    onChange={(e) => onUpdate(idx, { description: e.target.value, standardId: '' })}
                    placeholder="Keterangan…"
                    aria-label={`Keterangan biaya ${title} baris ${idx + 1}`}
                  />
                  <NumberInput
                    step="0.0001"
                    value={c.rate}
                    onChange={(e) => onUpdate(idx, { rate: e.target.value, standardId: '' })}
                    placeholder="Rate"
                    aria-label={`Rate biaya ${title} baris ${idx + 1}`}
                    className="h-10 text-right font-mono tabular-nums"
                  />
                  <span className="col-span-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    = Rp {fmtRupiah(computeTotal(c))}
                  </span>
                </div>
              </div>
            );
          })}
          <div className="pr-1 text-right font-mono text-xs tabular-nums text-muted-foreground">
            Subtotal: <span className="font-semibold text-foreground">Rp {fmtRupiah(sectionTotal)}</span>
          </div>
        </div>
      )}
      {!hasMoreStandards && standards.length > 0 && rows.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Semua master standar di sisi ini sudah dipakai. Tambah baris berikutnya hanya bisa pakai mode manual (free input).
        </p>
      )}
    </section>
  );
}

interface HppSummaryProps {
  materialCost: number;
  costInputSide: number;
  costOutputSide: number;
  byproductValue: number;
  mainOutputQty: number;
  previewHpp: number;
  hasOverride: boolean;
  autoHpp: number;
  hppOverride: string;
  onHppOverride: (v: string) => void;
}

export function RunHppSummary(p: HppSummaryProps) {
  const row = (label: string, value: number) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums text-foreground">Rp {fmtRupiah(value)}</span>
    </>
  );
  return (
    <section aria-label="HPP loaded" className="space-y-1.5 rounded-lg border border-success/30 bg-success-subtle px-4 py-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Calculator className="size-3.5 text-success-text" aria-hidden />
        <h3 className="text-xs font-bold uppercase tracking-wide text-success-text">HPP Loaded (auto-calculated)</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {row('Biaya Material', p.materialCost)}
        {row('+ Biaya Sisi Input', p.costInputSide)}
        {row('+ Biaya Sisi Output', p.costOutputSide)}
        {row('− Nilai Produk Samping (NRV)', p.byproductValue)}
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-success/30 pt-1.5">
        <span className="text-xs text-success-text">
          HPP per Kg main output ({p.mainOutputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })} Kg):
        </span>
        <span className="font-mono text-base font-bold tabular-nums text-success-text">Rp {fmtRupiah(p.previewHpp)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex min-h-9 items-center gap-2">
          <Checkbox
            id="run-hpp-override"
            checked={p.hasOverride}
            onCheckedChange={(v) => p.onHppOverride(v === true ? String(p.autoHpp.toFixed(4)) : '')}
          />
          <Label htmlFor="run-hpp-override" className="cursor-pointer text-xs font-normal text-muted-foreground">
            Override manual HPP
          </Label>
        </div>
        {p.hasOverride && (
          <NumberInput
            step="0.0001"
            value={p.hppOverride}
            onChange={(e) => p.onHppOverride(e.target.value)}
            placeholder="Override Rp/Kg"
            aria-label="Nilai override HPP (Rp per Kg)"
            className="h-9 w-40 text-right font-mono tabular-nums"
          />
        )}
      </div>
    </section>
  );
}

interface YieldSummaryProps {
  yieldPct: string;
  mainOutputQty: number;
  inputQty: number;
  unit: string;
  hasByproduct: boolean;
}

export function RunYieldSummary({ yieldPct, mainOutputQty, inputQty, unit, hasByproduct }: YieldSummaryProps) {
  return (
    <p role="status" className="rounded-lg bg-info-subtle px-4 py-3 text-sm text-info-text">
      <span className="font-semibold">Yield: </span>
      {yieldPct}%
      <span className="ml-1">
        ({mainOutputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
        {' / '}
        {inputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {unit})
      </span>
      {hasByproduct && <span className="ml-2 text-xs text-warning-text">(produk samping tidak dihitung)</span>}
    </p>
  );
}

interface ProcessPickerProps {
  processes: { id: string; name: string; description: string | null }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

export function RunProcessPicker({ processes, selectedIds, onToggle }: ProcessPickerProps) {
  return (
    <section aria-labelledby="run-process-heading">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 id="run-process-heading" className="text-xs font-bold uppercase tracking-wide text-foreground">Proses Yang Dijalankan</h3>
        <span className="text-xs text-muted-foreground">
          {selectedIds.length > 0 ? `${selectedIds.length} dipilih` : 'opsional · traceability saja'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {processes.map((p) => {
          const active = selectedIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(p.id)}
              title={p.description || undefined}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors md:min-h-9',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span className={cn('inline-block size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/50')} aria-hidden />
              {p.name}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Klik untuk pilih/batal. Hanya untuk catatan traceability — tidak posting GL, tidak pengaruhi HPP. Master diatur di tab{' '}
        <span className="font-semibold">Master Proses</span>.
      </p>
    </section>
  );
}

interface NegativeStockProps {
  allow: boolean;
  reason: string;
  onAllow: (v: boolean) => void;
  onReason: (v: string) => void;
}

export function RunNegativeStockOverride({ allow, reason, onAllow, onReason }: NegativeStockProps) {
  return (
    <section aria-label="Admin override stok minus" className="space-y-3 rounded-lg border border-warning/30 bg-warning-subtle/40 p-3">
      <div className="flex items-start gap-2">
        <Checkbox id="run-negative-stock" checked={allow} onCheckedChange={(v) => onAllow(v === true)} className="mt-0.5" />
        <Label htmlFor="run-negative-stock" className="block cursor-pointer text-xs font-normal leading-snug text-foreground">
          <strong>Admin override:</strong> izinkan stok bahan baku minus
          <span className="mt-0.5 block text-xs text-warning-text">
            Pakai saat produksi backdate / barang fisik sudah keluar tapi system belum tahu. Audit log dicatat.
          </span>
        </Label>
      </div>
      {allow && (
        <Field label="Alasan bypass (min 10 karakter)" required>
          <Textarea
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder="contoh: Output 50 ton sudah dikirim ke 2 pelanggan, input produksi menyusul"
            rows={2}
          />
        </Field>
      )}
    </section>
  );
}

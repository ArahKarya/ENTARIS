/**
 * Line editor for the purchase invoice form: one responsive card per line
 * (bahan baku with timbangan, or jasa/biaya). Presentational only — all state
 * and calculations stay in PurchaseInvoiceModal.
 */
import { Plus, Trash2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OptionPicker } from '@/components/purchase-cash/OptionPicker';
import { WarehouseField } from '@/components/purchase-cash/WarehouseField';
import type { InvoiceItem, LineCalc } from './invoice-item';

interface InventoryOption {
  id: string;
  code?: string;
  name: string;
}

interface InvoiceLineEditorProps {
  items: InvoiceItem[];
  lineCalcs: LineCalc[];
  inventoryItems: InventoryOption[] | undefined;
  onUpdate: (index: number, field: keyof InvoiceItem, value: string | number) => void;
  onSelectInventory: (index: number, inventoryId: string) => void;
  onRemove: (index: number) => void;
  onAddMaterial: () => void;
  onAddService: () => void;
}

const numCls = 'num h-10 text-right md:h-9';

function Cell({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export function InvoiceLineEditor({
  items,
  lineCalcs,
  inventoryItems,
  onUpdate,
  onSelectInventory,
  onRemove,
  onAddMaterial,
  onAddService,
}: InvoiceLineEditorProps) {
  const clampPct = (v: string) => Math.max(0, Math.min(100, Number(v)));
  return (
    <section aria-labelledby="pi-items-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="pi-items-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Daftar Barang
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={onAddMaterial}>
            <Plus aria-hidden /> Tambah Bahan
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={onAddService}>
            <Plus aria-hidden /> Tambah Jasa/Biaya
          </Button>
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((item, idx) => {
          const calc = lineCalcs[idx];
          const isService = item.itemType === 'service';
          const n = idx + 1;
          const k = item.id;
          return (
            <li
              key={k}
              aria-label={`${isService ? 'Jasa / Biaya' : 'Bahan Baku'} baris ${n}`}
              className={cn(
                'space-y-3 rounded-xl border p-3',
                isService ? 'border-success/40 bg-success-subtle/40' : 'border-border bg-card',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs font-semibold uppercase',
                    isService ? 'bg-success-subtle text-success-text' : 'bg-info-subtle text-info-text',
                  )}
                >
                  {isService ? 'Jasa / Biaya' : 'Bahan Baku'} #{n}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Harga Akhir</span>
                  <span className="num text-sm font-bold text-foreground">{formatRupiah(calc.hargaAkhir)}</span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      className="text-muted-foreground hover:text-danger-text md:size-9"
                      onClick={() => onRemove(idx)}
                      aria-label={`Hapus baris ${n}`}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {isService ? (
                  <Cell label="Nama Jasa/Biaya" htmlFor={`pi-name-${k}`}>
                    <Input
                      id={`pi-name-${k}`}
                      value={item.itemName}
                      onChange={(e) => onUpdate(idx, 'itemName', e.target.value)}
                      placeholder="Biaya angkutan, jasa giling..."
                    />
                  </Cell>
                ) : (
                  <Cell label="Jenis Barang" htmlFor={`pi-inv-${k}`}>
                    <OptionPicker
                      id={`pi-inv-${k}`}
                      value={item.inventoryItemId}
                      onChange={(v) => onSelectInventory(idx, v)}
                      placeholder="— Pilih dari Stok —"
                      emptyLabel="— Pilih dari Stok —"
                      options={(inventoryItems ?? []).map((inv) => ({
                        value: inv.id,
                        label: inv.code ? `${inv.code} — ${inv.name}` : inv.name,
                      }))}
                    />
                    {!item.inventoryItemId && (
                      <Input
                        aria-label={`Nama manual baris ${n}`}
                        value={item.itemName}
                        onChange={(e) => onUpdate(idx, 'itemName', e.target.value)}
                        placeholder="atau nama manual..."
                      />
                    )}
                  </Cell>
                )}
                {!isService && (
                  <Cell label="Gudang Tujuan" htmlFor={`pi-wh-${k}`}>
                    <WarehouseField
                      id={`pi-wh-${k}`}
                      value={item.warehouseId}
                      onChange={(v) => onUpdate(idx, 'warehouseId', v)}
                      placeholder="Pilih gudang..."
                    />
                  </Cell>
                )}
                <Cell label="No. Mobil" htmlFor={`pi-car-${k}`}>
                  <Input
                    id={`pi-car-${k}`}
                    value={item.nomorMobil}
                    onChange={(e) => onUpdate(idx, 'nomorMobil', e.target.value)}
                    placeholder={isService ? '—' : 'B 1234 ABC'}
                    className="font-mono uppercase placeholder:normal-case"
                  />
                </Cell>
                <Cell label={isService ? 'Catatan' : 'Kualitas'} htmlFor={`pi-note-${k}`}>
                  {isService ? (
                    <Input
                      id={`pi-note-${k}`}
                      value={item.description}
                      onChange={(e) => onUpdate(idx, 'description', e.target.value)}
                      placeholder="catatan..."
                    />
                  ) : (
                    <Input
                      id={`pi-note-${k}`}
                      value={item.kualitas}
                      onChange={(e) => onUpdate(idx, 'kualitas', e.target.value)}
                      placeholder="KA 18%, bersih..."
                    />
                  )}
                </Cell>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {!isService && (
                  <>
                    <Cell label="Timb. Truk (kg)" htmlFor={`pi-truk-${k}`}>
                      <NumberInput
                        id={`pi-truk-${k}`}
                        inputMode="decimal"
                        value={item.timbanganTruk || ''}
                        onChange={(e) => onUpdate(idx, 'timbanganTruk', Number(e.target.value))}
                        placeholder="0"
                        className={numCls}
                      />
                    </Cell>
                    <Cell label="Refaksi (kg)" htmlFor={`pi-ref-${k}`}>
                      <NumberInput
                        id={`pi-ref-${k}`}
                        inputMode="decimal"
                        value={item.refaksi || ''}
                        onChange={(e) => onUpdate(idx, 'refaksi', Number(e.target.value))}
                        placeholder="0"
                        className={numCls}
                      />
                    </Cell>
                  </>
                )}
                <Cell label={isService ? 'Jumlah *' : 'Diterima (kg) *'} htmlFor={`pi-qty-${k}`}>
                  <NumberInput
                    id={`pi-qty-${k}`}
                    inputMode="decimal"
                    value={item.timbanganDiterima || ''}
                    onChange={(e) => onUpdate(idx, 'timbanganDiterima', Number(e.target.value))}
                    placeholder={isService ? '1' : '0'}
                    className={cn(numCls, 'font-semibold')}
                  />
                </Cell>
                <Cell label={isService ? 'Harga per unit *' : 'Harga per unit (kg) *'} htmlFor={`pi-rate-${k}`}>
                  <NumberInput
                    id={`pi-rate-${k}`}
                    aria-label={`Harga per unit baris ${n}`}
                    inputMode="decimal"
                    value={item.rate || ''}
                    onChange={(e) => onUpdate(idx, 'rate', Number(e.target.value))}
                    placeholder="0"
                    className={numCls}
                  />
                </Cell>
                <Cell label="PPN %" htmlFor={`pi-ppn-${k}`}>
                  <NumberInput
                    id={`pi-ppn-${k}`}
                    inputMode="decimal"
                    value={item.taxPct || ''}
                    onChange={(e) => onUpdate(idx, 'taxPct', clampPct(e.target.value))}
                    placeholder="0"
                    className={numCls}
                  />
                </Cell>
                <Cell label="PPh %" htmlFor={`pi-pph-${k}`}>
                  <NumberInput
                    id={`pi-pph-${k}`}
                    inputMode="decimal"
                    value={item.pphPct || ''}
                    onChange={(e) => onUpdate(idx, 'pphPct', clampPct(e.target.value))}
                    placeholder="0"
                    className={numCls}
                  />
                </Cell>
                <Cell label="Potongan (Rp)" htmlFor={`pi-pot-${k}`}>
                  <NumberInput
                    id={`pi-pot-${k}`}
                    inputMode="decimal"
                    value={item.potonganItem || ''}
                    onChange={(e) => onUpdate(idx, 'potonganItem', Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className={numCls}
                  />
                </Cell>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

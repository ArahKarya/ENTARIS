/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/**
 * One editable row of the sales-invoice line table (SalesInvoiceModal).
 * Presentational: all state and calculations stay in the modal.
 */
import { Trash2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { PickerSelect, type PickerOption } from './PickerSelect';
import { OptionSelect } from './OptionSelect';
import { WarehouseSelect } from './WarehouseSelect';
import { BatchSelect } from '../overlays/BatchSelect';
import { numberInputClass } from './overlay-classes';
import { UNITS } from './invoice-units';

export interface InvoiceItem {
  id: string;
  itemName: string;
  itemType: 'product' | 'service';
  inventoryItemId: string;
  warehouseId: string; // sumber gudang stock-out (product only)
  serviceItemId: string;
  accountId: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number; // percent
  taxPct: number; // PPN % per item
  pphPct: number; // PPh % per item
  deliveryOrderItemId?: string | null;
  deliveryOrderNumber?: string;
  // Optional batch pick: the server locks COGS to the batch's unit cost instead of WAC.
  sourceMovementId?: string;
}

interface InvoiceLineRowProps {
  item: InvoiceItem;
  idx: number;
  items: InvoiceItem[];
  canRemove: boolean;
  lineAmount: number;
  inventoryOptions: PickerOption[];
  serviceOptions: PickerOption[];
  updateItem: (idx: number, field: keyof InvoiceItem, value: any) => void;
  toggleItemType: (idx: number, type: 'product' | 'service') => void;
  selectInventoryItem: (idx: number, inventoryId: string) => void;
  selectServiceItem: (idx: number, serviceId: string) => void;
  removeItemAt: (idx: number) => void;
}

const bareInput = 'h-9 text-xs';

export function InvoiceLineRow({
  item,
  idx,
  items,
  canRemove,
  lineAmount,
  inventoryOptions,
  serviceOptions,
  updateItem,
  toggleItemType,
  selectInventoryItem,
  selectServiceItem,
  removeItemAt,
}: InvoiceLineRowProps) {
  const n = idx + 1;
  const fromDO = !!item.deliveryOrderItemId;
  return (
    <tr className={cn('border-b border-border last:border-0', fromDO && 'bg-primary-subtle/30')}>
      <td className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">{n}</td>
      <td className="min-w-[240px] px-4 py-3">
        {fromDO ? (
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary-subtle px-2 py-0.5 font-mono text-[11px] font-medium text-primary-subtle-foreground">
              <Truck size={11} aria-hidden /> {item.deliveryOrderNumber || 'DO'}
            </span>
            <div className="text-sm font-medium text-foreground">{item.itemName}</div>
            <Input
              aria-label={`Keterangan baris ${n}`}
              value={item.description}
              onChange={(e) => updateItem(idx, 'description', e.target.value)}
              placeholder="Keterangan baris (opsional)..."
              className={bareInput}
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div role="group" aria-label={`Jenis item baris ${n}`} className="flex items-center gap-1">
              {(['product', 'service'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={item.itemType === type}
                  onClick={() => item.itemType !== type && toggleItemType(idx, type)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-xs font-medium transition-colors max-sm:min-h-11 max-sm:px-3',
                    item.itemType === type
                      ? type === 'product'
                        ? 'bg-success-subtle text-success-text'
                        : 'bg-info-subtle text-info-text'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {type === 'product' ? 'Barang' : 'Jasa'}
                </button>
              ))}
            </div>

            {item.itemType === 'product' ? (
              <>
                <PickerSelect
                  aria-label={`Barang baris ${n}`}
                  options={inventoryOptions}
                  value={item.inventoryItemId}
                  onChange={(v) => selectInventoryItem(idx, v)}
                  placeholder="Pilih dari Stok Gudang"
                />
                {!item.inventoryItemId && (
                  <Input
                    aria-label={`Nama barang manual baris ${n}`}
                    value={item.itemName}
                    onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                    placeholder="Atau ketik nama barang manual..."
                    className={bareInput}
                    autoComplete="off"
                  />
                )}
                <WarehouseSelect
                  value={item.warehouseId}
                  onChange={(v) => updateItem(idx, 'warehouseId', v)}
                  label={`Gudang sumber baris ${n}`}
                />
                {/* Optional batch picker (hybrid FIFO/specific-id) */}
                {item.inventoryItemId && item.warehouseId && !fromDO && (
                  <div>
                    <p className="mb-0.5 text-[10px] text-muted-foreground">Batch (opsional, default WAC)</p>
                    <BatchSelect
                      label={`Batch baris ${n}`}
                      itemId={item.inventoryItemId}
                      warehouseId={item.warehouseId}
                      value={item.sourceMovementId ?? ''}
                      excludeIds={items
                        .filter((r, i) => i !== idx && r.inventoryItemId === item.inventoryItemId && r.warehouseId === item.warehouseId && r.sourceMovementId)
                        .map((r) => r.sourceMovementId as string)}
                      onChange={(id) => updateItem(idx, 'sourceMovementId', id as any)}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <PickerSelect
                  aria-label={`Layanan baris ${n}`}
                  options={serviceOptions}
                  value={item.serviceItemId}
                  onChange={(v) => selectServiceItem(idx, v)}
                  placeholder="Pilih Layanan"
                />
                {!item.serviceItemId && (
                  <Input
                    aria-label={`Nama jasa manual baris ${n}`}
                    value={item.itemName}
                    onChange={(e) => updateItem(idx, 'itemName', e.target.value)}
                    placeholder="Atau ketik nama jasa manual..."
                    className={bareInput}
                    autoComplete="off"
                  />
                )}
              </>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <NumberInput
          aria-label={`Qty baris ${n}`}
          value={item.quantity}
          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
          min={1}
          readOnly={fromDO}
          className={cn(numberInputClass, fromDO && 'cursor-not-allowed bg-muted text-muted-foreground')}
        />
      </td>
      <td className="px-3 py-3">
        {fromDO ? (
          <span className="text-sm text-muted-foreground">{item.unit}</span>
        ) : (
          <OptionSelect
            aria-label={`Satuan baris ${n}`}
            value={item.unit}
            onChange={(v) => updateItem(idx, 'unit', v)}
            options={UNITS.map((u) => ({ value: u, label: u }))}
          />
        )}
      </td>
      <td className="px-3 py-3">
        <NumberInput
          aria-label={`Harga satuan baris ${n}`}
          value={item.rate || ''}
          onChange={(e) => updateItem(idx, 'rate', Number(e.target.value))}
          placeholder="0"
          className={numberInputClass}
        />
      </td>
      <td className="px-3 py-3">
        <NumberInput
          aria-label={`Diskon persen baris ${n}`}
          value={item.discount || ''}
          onChange={(e) => updateItem(idx, 'discount', Math.min(100, Number(e.target.value)))}
          placeholder="0"
          min={0}
          max={100}
          className={numberInputClass}
        />
      </td>
      <td className="px-3 py-3">
        <NumberInput
          aria-label={`PPN persen baris ${n}`}
          value={item.taxPct || ''}
          onChange={(e) => updateItem(idx, 'taxPct', Math.max(0, Math.min(100, Number(e.target.value))))}
          placeholder="0"
          min={0}
          max={100}
          className={numberInputClass}
        />
      </td>
      <td className="px-3 py-3">
        <NumberInput
          aria-label={`PPh persen baris ${n}`}
          value={item.pphPct || ''}
          onChange={(e) => updateItem(idx, 'pphPct', Math.max(0, Math.min(100, Number(e.target.value))))}
          placeholder="0"
          min={0}
          max={100}
          className={numberInputClass}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm font-medium tabular-nums text-foreground">{formatRupiah(lineAmount)}</span>
      </td>
      <td className="px-2 py-3 text-center">
        {canRemove && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-danger-text max-sm:size-11"
            aria-label={`Hapus baris ${n}`}
            onClick={() => removeItemAt(idx)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </td>
    </tr>
  );
}

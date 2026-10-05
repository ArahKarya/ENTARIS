// Rice-mill purchase invoice item.
// Flow: timbanganTruk (info only) → refaksi (kg deducted) → timbanganDiterima (net received)
// → rate → ppn/pph → potonganItem → hargaAkhir.
export type ItemType = 'material' | 'service';

export interface InvoiceItem {
  id: string;
  itemType: ItemType;          // 'material' = bahan baku w/ timbangan; 'service' = jasa/biaya
  itemName: string;
  inventoryItemId: string;
  warehouseId: string;         // gudang tujuan stock-in (material only)
  description: string;
  unit: string;
  kualitas: string;
  refaksi: number;            // kg, optional (material only)
  timbanganTruk: number;       // kg, informational only (material only)
  timbanganDiterima: number;   // kg (material) atau qty (service) — selalu jadi quantity
  rate: number;                // harga per kg (material) atau total harga per unit (service)
  taxPct: number;              // PPN % per item
  pphPct: number;              // PPh % per item
  potonganItem: number;        // IDR per item
  nomorMobil: string;          // plat nomor mobil (material only, optional)
  /** Link ke baris STT/BPB. Kalau di-set: stok tidak dibuat ulang oleh PI
   *  (sudah diset saat STT submit). Diisi otomatis saat user pakai "Dari STT". */
  goodsReceiptItemId?: string | null;
}

export const defaultItem = (type: ItemType = 'material'): InvoiceItem => ({
  id: crypto.randomUUID(),
  itemType: type,
  itemName: '',
  inventoryItemId: '',
  warehouseId: '',
  description: '',
  unit: type === 'service' ? 'pcs' : 'Kg',
  kualitas: '',
  refaksi: 0,
  timbanganTruk: 0,
  timbanganDiterima: type === 'service' ? 1 : 0,
  rate: 0,
  taxPct: 0,
  pphPct: 0,
  potonganItem: 0,
  nomorMobil: '',
  goodsReceiptItemId: null,
});

// Per-item calc — mirrors server/src/services/purchaseInvoiceCalc.ts
// so the UI total matches what the backend will persist.
export interface LineCalc {
  effectiveQty: number;
  subtotal: number;
  ppn: number;
  pph: number;
  hargaAkhir: number;
}

export const computeLine = (item: InvoiceItem): LineCalc => {
  const qty = item.timbanganDiterima > 0 ? item.timbanganDiterima : 0;
  const subtotal = Math.round(qty * item.rate * 100) / 100;
  const ppn = Math.round(subtotal * (item.taxPct / 100) * 100) / 100;
  const pph = Math.round(subtotal * (item.pphPct / 100) * 100) / 100;
  const hargaAkhir = Math.round((subtotal + ppn - pph - item.potonganItem) * 100) / 100;
  return { effectiveQty: qty, subtotal, ppn, pph, hargaAkhir };
};


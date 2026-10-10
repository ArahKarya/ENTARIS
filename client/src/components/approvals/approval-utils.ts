/** Pure formatting + estimation helpers shared by ApprovalPanel and its detail dialog. */

export const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const docTypeLabel: Record<string, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
  SalesReturn: 'Retur Penjualan',
  DeliveryOrder: 'Surat Jalan',
  PurchaseOrder: 'Purchase Order',
  ProductionRunEdit: 'Edit Data Produksi',
  PurchaseInvoiceRevisePrice: 'Revisi Harga Invoice Pembelian',
};

/** Pengajuan yang MENGUBAH dokumen existing (bukan membuat baru) → tampil sebagai perbandingan. */
export const isEditApprovalType = (t: string) => t === 'ProductionRunEdit' || t === 'PurchaseInvoiceRevisePrice';

/** Permintaan dari agen AIRA lewat MCP (documentType `ai_tool:<nama>`): dijalankan sebagai pengaju saat disetujui. */
export const isAiToolApproval = (t: string) => t.startsWith('ai_tool:');

/** Label tampilan tipe pengajuan (mengenali ai_tool:*). */
export const approvalTypeLabel = (t: string) => (isAiToolApproval(t) ? 'Permintaan AIRA' : docTypeLabel[t] ?? t);

// Total harga akhir satu baris PI dari payload pengajuan.
// hargaAkhir = qty×rate×(1−disc%) + PPN − PPh − potonganItem.
// Payload pengajuan TIDAK menyimpan it.amount → harus dihitung di sini,
// jangan andalkan it.amount (selalu undefined → tampil Rp 0).
export function piLineTotal(it: any): number {
  const qty = Number(it.timbanganDiterima ?? it.quantity ?? 0);
  const base = qty * Number(it.rate ?? 0);
  const afterDisc = base - base * (Number(it.discount ?? 0) / 100);
  const ppn = afterDisc * (Number(it.taxPct ?? 0) / 100);
  const pph = afterDisc * (Number(it.pphPct ?? 0) / 100);
  return afterDisc + ppn - pph - Number(it.potonganItem ?? 0);
}

// Hitung estimasi total PI dari payload (mirror server purchaseInvoiceCalc).
export function piTotals(payload: any): { subtotal: number; grandTotal: number } {
  const items: any[] = payload?.items ?? [];
  const subtotal = items.reduce((s, it) => s + piLineTotal(it), 0);
  const grandTotal = subtotal - Number(payload?.potongan ?? 0) + Number(payload?.biayaLain ?? 0);
  return { subtotal: Math.round(subtotal), grandTotal: Math.round(grandTotal) };
}

// Estimasi HPP/Kg produksi dari payload. Material hanya pasti bila batchUnitCost
// terisi; jika tidak, material tak diketahui (return knownMaterial=false).
export function prodHppEstimate(payload: any): { hpp: number | null; knownMaterial: boolean; byproductValue: number; costTotal: number; mainQty: number } {
  const inputs: any[] = payload?.inputs ?? [];
  const outputs: any[] = payload?.outputs ?? [];
  const costs: any[] = payload?.costs ?? [];
  const mainQty = outputs.filter((o) => !o.isByProduct).reduce((s, o) => s + Number(o.quantity ?? 0), 0);
  const inputQty = inputs.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const byproductValue = outputs.filter((o) => o.isByProduct).reduce((s, o) => s + Number(o.quantity ?? 0) * Number(o.unitPrice ?? 0), 0);
  // Material: hanya jika SEMUA input punya batchUnitCost > 0.
  const allHaveBatch = inputs.length > 0 && inputs.every((i) => Number(i.batchUnitCost ?? 0) > 0);
  const material = allHaveBatch ? inputs.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.batchUnitCost ?? 0), 0) : 0;
  // Biaya: rate × basisQty (InputQty/OutputQty/Fixed).
  let costTotal = 0;
  for (const c of costs) {
    const rate = Number(c.rate ?? 0);
    if (c.basis === 'InputQty') costTotal += rate * inputQty;
    else if (c.basis === 'OutputQty') costTotal += rate * mainQty;
    else costTotal += rate; // Fixed
  }
  if (!allHaveBatch || mainQty <= 0) return { hpp: null, knownMaterial: allHaveBatch, byproductValue, costTotal: Math.round(costTotal), mainQty };
  const hpp = (material + costTotal - byproductValue) / mainQty;
  return { hpp: Math.round(hpp), knownMaterial: true, byproductValue, costTotal: Math.round(costTotal), mainQty };
}

/** Party / item names the server resolves in GET /approvals/requests/:id/context. */
export interface ApprovalLookupContext {
  party?: { id: string; name: string } | null;
  supplier?: { name?: string | null } | null;
  items?: Record<string, { name: string; unit: string }>;
}

export interface ApprovalLabels {
  partyName: (partyId: string | null | undefined) => string;
  itemName: (itemId: string | null | undefined) => string;
  itemUnit: (itemId: string | null | undefined) => string;
}

/**
 * Display labels for ids stored in an approval payload. While the context is loading the
 * placeholder is an ellipsis; a missing record falls back to a short id instead of a bare dash.
 */
export function approvalLabels(ctx: ApprovalLookupContext | null | undefined, loading: boolean): ApprovalLabels {
  const shortId = (id: string | null | undefined) => (id ? id.slice(0, 8) : '?');
  return {
    partyName: (partyId) => {
      if (!partyId) return '—';
      const name = (ctx?.party?.id === partyId ? ctx.party.name : null) ?? ctx?.supplier?.name;
      if (name) return name;
      return loading ? '…' : `(pihak ${shortId(partyId)})`;
    },
    itemName: (itemId) => {
      const name = itemId ? ctx?.items?.[itemId]?.name : undefined;
      if (name) return name;
      return loading ? '…' : `(item ${shortId(itemId)})`;
    },
    itemUnit: (itemId) => (itemId ? ctx?.items?.[itemId]?.unit : undefined) ?? '',
  };
}

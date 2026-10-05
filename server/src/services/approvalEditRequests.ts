// Approval gate untuk MUTASI dokumen yang sudah ada (bukan pembuatan baru):
//   - 'ProductionRunEdit'          → PUT /inventory/production-runs/:id
//   - 'PurchaseInvoiceRevisePrice' → POST /purchase/invoices/:id/revise-price
//
// Beda dgn antrian pembuatan: documentId + documentNumber sudah terisi saat
// request dibuat, dan payload = body asli + snapshot kondisi SAAT INI (`_before`)
// supaya layar approval bisa menampilkan perbandingan sebelum/sesudah.
// Eksekusi (saat approve) ada di services/approvalDecision.ts.

import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { approvalsLink, GATED_LABELS, type GatedDocumentType } from './approvalGate';
import { notifyAdmins } from './notificationService';

export const EDIT_DOCUMENT_TYPES = ['ProductionRunEdit', 'PurchaseInvoiceRevisePrice'] as const;
export type EditDocumentType = (typeof EDIT_DOCUMENT_TYPES)[number];

export function isEditDocumentType(t: unknown): t is EditDocumentType {
  return typeof t === 'string' && (EDIT_DOCUMENT_TYPES as readonly string[]).includes(t);
}

/** Kunci snapshot di dalam payload tersimpan; dibuang sebelum validasi Zod saat approve. */
export const BEFORE_KEY = '_before';

// ─── Tipe perbandingan (dikirim ke client apa adanya) ─────────────────────────

export type ComparisonValue = number | string | null;
export interface ComparisonRow {
  label: string;
  before: ComparisonValue;
  after: ComparisonValue;
  kind: 'number' | 'currency' | 'percent' | 'text';
  changed: boolean;
  note?: string;
}
export interface ComparisonSection { title: string; rows: ComparisonRow[] }
export interface ApprovalComparison {
  title: string;
  targetNumber: string | null;
  targetType: 'ProductionRun' | 'PurchaseInvoice';
  targetId: string | null;
  amountLabel: string;
  sections: ComparisonSection[];
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

interface BeforeLine { itemId: string; itemName: string; quantity: number; byProduct?: boolean }
export interface ProductionBefore {
  kind: 'ProductionRunEdit';
  runNumber: string;
  date: string;
  inputs: BeforeLine[];
  outputs: BeforeLine[];
  computedHpp: number | null;
  itemNames: Record<string, string>;
}

interface RunLike {
  runNumber: string;
  date: Date | string;
  computedHpp?: unknown;
  items: Array<{ itemId: string; lineType: string; quantity: unknown; item?: { name?: string | null } | null }>;
}

interface ProdBody {
  date?: unknown;
  inputs?: Array<{ itemId?: unknown; quantity?: unknown }>;
  outputs?: Array<{ itemId?: unknown; quantity?: unknown; isByProduct?: unknown }>;
}
interface InvBody { lines?: Array<{ itemId?: unknown; newRate?: unknown }>; reason?: unknown }
type Body = Record<string, unknown>;

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const isoDay = (d: Date | string): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

export function buildProductionBefore(run: RunLike, extraNames: Record<string, string> = {}): ProductionBefore {
  const itemNames: Record<string, string> = { ...extraNames };
  const inputs: BeforeLine[] = [];
  const outputs: BeforeLine[] = [];
  for (const it of run.items) {
    const name = it.item?.name ?? it.itemId;
    itemNames[it.itemId] = name;
    const line = { itemId: it.itemId, itemName: name, quantity: num(it.quantity) };
    if (it.lineType === 'Input') inputs.push(line);
    else outputs.push({ ...line, byProduct: it.lineType === 'ByProduct' });
  }
  return {
    kind: 'ProductionRunEdit',
    runNumber: run.runNumber,
    date: isoDay(run.date),
    inputs,
    outputs,
    computedHpp: run.computedHpp == null ? null : num(run.computedHpp),
    itemNames,
  };
}

export interface InvoiceBefore {
  kind: 'PurchaseInvoiceRevisePrice';
  invoiceNumber: string;
  grandTotal: number;
  lines: Array<{ itemId: string; itemName: string; quantity: number; unit: string; rate: number }>;
}

interface InvoiceLike {
  invoiceNumber: string;
  grandTotal: unknown;
  items: Array<{ id: string; itemName: string; quantity: unknown; unit: string; rate: unknown }>;
}

export function buildInvoiceBefore(inv: InvoiceLike): InvoiceBefore {
  return {
    kind: 'PurchaseInvoiceRevisePrice',
    invoiceNumber: inv.invoiceNumber,
    grandTotal: num(inv.grandTotal),
    lines: inv.items.map((l) => ({ itemId: l.id, itemName: l.itemName, quantity: num(l.quantity), unit: l.unit, rate: num(l.rate) })),
  };
}

/** Pisahkan payload tersimpan → body asli (utk Zod) + snapshot. */
export function splitStoredPayload(payload: unknown): { body: Record<string, unknown>; before: unknown } {
  const obj = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  const before: unknown = obj[BEFORE_KEY] ?? null;
  delete obj[BEFORE_KEY];
  return { body: obj, before };
}

// ─── Comparison builders (pure) ───────────────────────────────────────────────

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function diffRows(
  before: BeforeLine[], afterLines: Array<{ itemId: string; quantity: number; byProduct?: boolean }>,
  names: Record<string, string>, suffixByProduct: boolean,
): ComparisonRow[] {
  const keyOf = (id: string, bp?: boolean) => `${id}|${bp ? 1 : 0}`;
  const map = new Map<string, { id: string; bp: boolean; b: number; a: number }>();
  for (const l of before) {
    const k = keyOf(l.itemId, l.byProduct);
    const cur = map.get(k) ?? { id: l.itemId, bp: !!l.byProduct, b: 0, a: 0 };
    cur.b += l.quantity; map.set(k, cur);
  }
  for (const l of afterLines) {
    const k = keyOf(l.itemId, l.byProduct);
    const cur = map.get(k) ?? { id: l.itemId, bp: !!l.byProduct, b: 0, a: 0 };
    cur.a += l.quantity; map.set(k, cur);
  }
  return [...map.values()].map((e) => ({
    label: `${names[e.id] ?? e.id}${suffixByProduct && e.bp ? ' (produk sampingan)' : ''}`,
    before: round(e.b), after: round(e.a), kind: 'number' as const,
    changed: round(e.b) !== round(e.a),
  }));
}

export function buildProductionEditComparison(before: ProductionBefore, rawBody: Body): ApprovalComparison {
  const body = rawBody as ProdBody;
  const names = before.itemNames ?? {};
  const afterInputs = (body.inputs ?? []).map((i) => ({ itemId: String(i.itemId), quantity: num(i.quantity) }));
  const afterOutputs = (body.outputs ?? []).map((o) => ({ itemId: String(o.itemId), quantity: num(o.quantity), byProduct: !!o.isByProduct }));

  const bIn = round(sum(before.inputs.map((l) => l.quantity)));
  const aIn = round(sum(afterInputs.map((l) => l.quantity)));
  const bMain = round(sum(before.outputs.filter((l) => !l.byProduct).map((l) => l.quantity)));
  const aMain = round(sum(afterOutputs.filter((l) => !l.byProduct).map((l) => l.quantity)));
  const bOut = round(sum(before.outputs.map((l) => l.quantity)));
  const aOut = round(sum(afterOutputs.map((l) => l.quantity)));
  const bYield = bIn > 0 ? round((bMain / bIn) * 100, 2) : null;
  const aYield = aIn > 0 ? round((aMain / aIn) * 100, 2) : null;
  const aDate = typeof body.date === 'string' ? body.date.slice(0, 10) : '';

  const summary: ComparisonRow[] = [
    { label: 'Tanggal produksi', before: before.date, after: aDate, kind: 'text', changed: before.date !== aDate },
    { label: 'Total input', before: bIn, after: aIn, kind: 'number', changed: bIn !== aIn },
    { label: 'Total output (termasuk sampingan)', before: bOut, after: aOut, kind: 'number', changed: bOut !== aOut },
    { label: 'Rendemen produk utama', before: bYield, after: aYield, kind: 'percent', changed: bYield !== aYield },
    {
      label: 'HPP terhitung (per kg produk utama)', before: before.computedHpp, after: null, kind: 'currency', changed: false,
      note: 'Dihitung ulang oleh sistem saat disetujui.',
    },
  ];
  return {
    title: 'Edit Data Produksi',
    targetNumber: before.runNumber,
    targetType: 'ProductionRun',
    targetId: null,
    amountLabel: 'Total input (baru)',
    sections: [
      { title: 'Ringkasan', rows: summary },
      { title: 'Bahan baku (input)', rows: diffRows(before.inputs, afterInputs, names, false) },
      { title: 'Hasil (output)', rows: diffRows(before.outputs, afterOutputs, names, true) },
    ],
  };
}

export function computeInvoiceRevise(before: InvoiceBefore, rawBody: Body) {
  const body = rawBody as InvBody;
  const byId = new Map(before.lines.map((l) => [l.itemId, l]));
  const lines = (body.lines ?? []).map((l) => {
    const old = byId.get(String(l.itemId));
    const newRate = num(l.newRate);
    return {
      itemId: String(l.itemId),
      itemName: old?.itemName ?? 'Baris tidak dikenal',
      quantity: old?.quantity ?? 0,
      unit: old?.unit ?? '',
      oldRate: old?.rate ?? 0,
      newRate,
      delta: round((newRate - (old?.rate ?? 0)) * (old?.quantity ?? 0), 2),
    };
  });
  const totalDelta = round(sum(lines.map((l) => l.delta)), 2);
  return { lines, totalDelta, newTotal: round(before.grandTotal + totalDelta, 2) };
}

export function buildInvoiceReviseComparison(before: InvoiceBefore, body: Body): ApprovalComparison {
  const { lines, totalDelta, newTotal } = computeInvoiceRevise(before, body);
  const rateRows: ComparisonRow[] = lines.map((l) => ({
    label: `${l.itemName} — harga per ${l.unit || 'unit'}`,
    before: l.oldRate, after: l.newRate, kind: 'currency', changed: l.oldRate !== l.newRate,
  }));
  const valueRows: ComparisonRow[] = lines.map((l) => ({
    label: `${l.itemName} — nilai (${l.quantity.toLocaleString('id-ID')} ${l.unit})`.trim(),
    before: round(l.oldRate * l.quantity, 2), after: round(l.newRate * l.quantity, 2), kind: 'currency',
    changed: l.oldRate !== l.newRate,
  }));
  return {
    title: 'Revisi Harga Invoice Pembelian',
    targetNumber: before.invoiceNumber,
    targetType: 'PurchaseInvoice',
    targetId: null,
    amountLabel: 'Total invoice (baru)',
    sections: [
      {
        title: 'Ringkasan',
        rows: [
          { label: 'Total invoice', before: before.grandTotal, after: newTotal, kind: 'currency', changed: totalDelta !== 0, note: 'Estimasi dari selisih harga × qty; pajak/potongan dihitung sistem.' },
          { label: 'Selisih harga', before: 0, after: totalDelta, kind: 'currency', changed: totalDelta !== 0 },
          { label: 'Alasan revisi', before: null, after: String((body as InvBody).reason ?? ''), kind: 'text', changed: false },
        ],
      },
      { title: 'Harga per baris', rows: rateRows },
      { title: 'Nilai per baris', rows: valueRows },
    ],
  };
}

/** Dispatcher untuk endpoint detail; null bila bukan tipe edit / snapshot hilang. */
export function buildApprovalComparison(
  request: { documentType: string; documentId: string | null; documentNumber: string | null; payload: unknown },
): ApprovalComparison | null {
  if (!isEditDocumentType(request.documentType)) return null;
  const { body, before } = splitStoredPayload(request.payload);
  if (!before) return null;
  const cmp = request.documentType === 'ProductionRunEdit'
    ? buildProductionEditComparison(before as ProductionBefore, body)
    : buildInvoiceReviseComparison(before as InvoiceBefore, body);
  return { ...cmp, targetId: request.documentId, targetNumber: request.documentNumber ?? cmp.targetNumber };
}

// ─── Antrian ──────────────────────────────────────────────────────────────────

type Db = Prisma.TransactionClient | typeof import('../lib/prisma').prisma;

export const PENDING_EXISTS_MESSAGE = 'Sudah ada pengajuan yang menunggu persetujuan untuk dokumen ini. Tunggu keputusan manajer terlebih dahulu.';

export async function findPendingForTarget(db: Db, documentType: EditDocumentType, documentId: string) {
  return db.approvalRequest.findFirst({
    where: { documentType, documentId, status: 'Pending' },
    select: { id: true, createdAt: true, requestedBy: true },
  });
}

export type QueueEditResult =
  | { ok: true; status: 202; body: { pendingApproval: true; request: unknown; message: string } }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Validasi target di waktu request + tolak duplikat Pending + simpan antrian
 * + notifikasi admin. Tidak mengeksekusi apa pun.
 */
export async function queueEditApproval(
  db: typeof import('../lib/prisma').prisma,
  params: { documentType: EditDocumentType; targetId: string; body: Body; rawBody: unknown; userId: string },
): Promise<QueueEditResult> {
  const { documentType, targetId, body, rawBody, userId } = params;
  let prepared: { number: string; before: object; amount: number; summary: string };
  try {
    prepared = documentType === 'ProductionRunEdit'
      ? await prepareProductionEdit(db, targetId, body)
      : await prepareInvoiceRevise(db, targetId, body);
  } catch (e) {
    if (e instanceof BusinessError) {
      return { ok: false, status: /tidak ditemukan/i.test(e.message) ? 404 : 400, error: e.message };
    }
    throw e;
  }

  const request = await db.$transaction(async (tx) => {
    if (await findPendingForTarget(tx, documentType, targetId)) return null;
    return tx.approvalRequest.create({
      data: {
        documentType,
        documentId: targetId,
        documentNumber: prepared.number,
        amount: prepared.amount,
        payload: { ...(rawBody as object), [BEFORE_KEY]: prepared.before } as Prisma.InputJsonValue,
        requestedBy: userId,
        status: 'Pending',
      },
    });
  });
  if (!request) return { ok: false, status: 409, error: PENDING_EXISTS_MESSAGE };

  const requester = await db.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  const link = approvalsLink(request.id);
  await notifyAdmins({
    type: 'approval_pending',
    title: `🔔 Persetujuan: ${GATED_LABELS[documentType as GatedDocumentType]}`,
    message: `${GATED_LABELS[documentType as GatedDocumentType]} ${prepared.number} (${prepared.summary}) dari ${requester?.fullName ?? 'staf'} menunggu persetujuan Anda.${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
    metadata: { kind: 'approval', requestId: request.id, documentType },
    excludeUserId: userId,
  });
  return {
    ok: true,
    status: 202,
    body: {
      pendingApproval: true,
      request,
      message: documentType === 'ProductionRunEdit'
        ? 'Perubahan data produksi menunggu persetujuan manajer sebelum diproses.'
        : 'Revisi harga menunggu persetujuan manajer sebelum diproses.',
    },
  };
}

async function prepareProductionEdit(db: Db, runId: string, rawBody: Body) {
  const body = rawBody as ProdBody;
  const run = await db.productionRun.findUnique({
    where: { id: runId },
    select: {
      runNumber: true, date: true, isCancelled: true, computedHpp: true,
      items: { select: { itemId: true, lineType: true, quantity: true, item: { select: { name: true } } } },
    },
  });
  if (!run) throw new BusinessError('Data proses produksi tidak ditemukan.');
  if (run.isCancelled) throw new BusinessError('Proses produksi yang sudah dibatalkan tidak bisa diedit.');

  const ids = Array.from(new Set([...(body.inputs ?? []), ...(body.outputs ?? [])].map((l) => String(l.itemId))));
  const inv = ids.length ? await db.inventoryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const before = buildProductionBefore(run as RunLike, Object.fromEntries(inv.map((i) => [i.id, i.name])));
  const amount = round(sum((body.inputs ?? []).map((i) => num(i.quantity))));
  return { number: run.runNumber, before, amount, summary: `${amount.toLocaleString('id-ID')} kg input baru` };
}

async function prepareInvoiceRevise(db: Db, invoiceId: string, rawBody: Body) {
  const body = rawBody as InvBody;
  const inv = await db.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true, status: true, grandTotal: true,
      items: { select: { id: true, itemName: true, quantity: true, unit: true, rate: true } },
    },
  });
  if (!inv) throw new BusinessError('Invoice pembelian tidak ditemukan.');
  if (inv.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan, tidak bisa direvisi.');
  if (inv.status === 'Draft') throw new BusinessError('Invoice masih Draft — edit langsung, bukan revisi harga.');
  const known = new Set(inv.items.map((i) => i.id));
  for (const l of body.lines ?? []) {
    if (!known.has(String(l.itemId))) throw new BusinessError('Ada baris revisi yang bukan bagian dari invoice ini.');
  }
  const before = buildInvoiceBefore(inv as InvoiceLike);
  const { totalDelta, newTotal } = computeInvoiceRevise(before, rawBody);
  return { number: inv.invoiceNumber, before, amount: newTotal, summary: `selisih Rp ${totalDelta.toLocaleString('id-ID')}` };
}

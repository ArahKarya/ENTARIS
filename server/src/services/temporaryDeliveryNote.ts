import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BusinessError } from '../utils/errors';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';
import { assertSalesOrderLinkable } from './salesDocumentLinks';

type Tx = Prisma.TransactionClient;

/**
 * Surat Jalan Sementara (SJS) — dokumen pengiriman sementara.
 * TIDAK menyentuh stok, GL, WAC, maupun antrean COGS. Tidak bisa diinvoice.
 * Ditautkan ke DO resmi setelah produksi diinput. Tabel baru dikelola via SQL
 * mentah supaya tidak perlu regenerasi Prisma Client.
 *
 * Status: Open (belum ada DO) | Linked (sudah ditautkan ke DO) | Cancelled.
 */

export interface TdnItemInput {
  inventoryItemId: string; // wajib dari master item (keputusan Ndoro #3)
  itemName?: string;
  quantity: number;
  unit?: string;
  description?: string | null;
}

export interface TdnInput {
  date: string;
  partyId: string;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  salesOrderId?: string | null;
  notes?: string | null;
  items: TdnItemInput[];
}

/** Nomor berurutan SJS-YYYYMM-NNNN dengan advisory lock per bulan. */
async function nextNumber(tx: Tx, date: Date): Promise<string> {
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const series = `SJS-${ym}-`;
  let hash = 2166136261;
  for (let i = 0; i < series.length; i++) {
    hash ^= series.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hash % 2147483647})`;
  const rows = await tx.$queryRaw<{ number: string }[]>`
    SELECT number FROM temporary_delivery_notes WHERE number LIKE ${series + '%'} ORDER BY number DESC LIMIT 1`;
  const last = rows[0]?.number ? parseInt(rows[0].number.slice(series.length), 10) : 0;
  return `${series}${String((isNaN(last) ? 0 : last) + 1).padStart(4, '0')}`;
}

async function validateAndResolveItems(tx: Tx, items: TdnItemInput[]) {
  if (!items || items.length === 0) throw new BusinessError('Minimal satu item.');
  const out: { inventoryItemId: string; itemName: string; quantity: number; unit: string; description: string | null }[] = [];
  for (const it of items) {
    if (!it.inventoryItemId) throw new BusinessError('Barang wajib dipilih dari master item.');
    if (!(Number(it.quantity) > 0)) throw new BusinessError('Qty harus lebih dari 0.');
    const inv = await tx.inventoryItem.findUnique({ where: { id: it.inventoryItemId }, select: { id: true, name: true, unit: true } });
    if (!inv) throw new BusinessError('Barang tidak ditemukan di master item.');
    out.push({
      inventoryItemId: inv.id,
      itemName: inv.name,
      quantity: Number(it.quantity),
      unit: it.unit || inv.unit,
      description: it.description || null,
    });
  }
  return out;
}

async function validateParty(tx: Tx, partyId: string) {
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new BusinessError('Customer tidak ditemukan.');
  if (!party.isActive) throw new BusinessError(`Customer '${party.name}' tidak aktif.`);
  if (party.partyType !== 'Customer' && party.partyType !== 'Both') {
    throw new BusinessError(`Party '${party.name}' bukan customer.`);
  }
}

export async function createTemporaryNoteInTx(tx: Tx, body: TdnInput, userId: string) {
  const date = new Date(body.date);
  if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fy = await getOpenFiscalYear(tx, date);
  await validateParty(tx, body.partyId);
  if (body.salesOrderId) await assertSalesOrderLinkable(tx, body.salesOrderId, body.partyId);
  const items = await validateAndResolveItems(tx, body.items);

  const id = randomUUID();
  const number = await nextNumber(tx, date);
  await tx.$executeRaw`
    INSERT INTO temporary_delivery_notes
      (id, number, date, party_id, nomor_mobil, driver_name, recipient_name, sales_order_id, status, notes, fiscal_year_id, created_by)
    VALUES (${id}, ${number}, ${date}, ${body.partyId}, ${body.nomorMobil || null}, ${body.driverName || null},
            ${body.recipientName || null}, ${body.salesOrderId || null}, 'Open', ${body.notes || null}, ${fy.id}, ${userId})`;
  for (const it of items) {
    await tx.$executeRaw`
      INSERT INTO temporary_delivery_note_items (id, temporary_delivery_note_id, inventory_item_id, item_name, quantity, unit, description)
      VALUES (${randomUUID()}, ${id}, ${it.inventoryItemId}, ${it.itemName}, ${it.quantity}, ${it.unit}, ${it.description})`;
  }
  logger.info({ number, items: items.length, partyId: body.partyId }, 'Temporary delivery note created');
  return getTemporaryNote(tx, id);
}

export async function updateTemporaryNoteInTx(tx: Tx, id: string, body: TdnInput) {
  const rows = await tx.$queryRaw<{ status: string; sales_order_id: string | null }[]>`
    SELECT status, sales_order_id FROM temporary_delivery_notes WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw new BusinessError('Surat jalan sementara tidak ditemukan.');
  if (rows[0].status !== 'Open') {
    throw new BusinessError('Hanya surat jalan sementara berstatus Terbuka yang bisa diubah.'); // keputusan #2
  }
  const date = new Date(body.date);
  if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  await validateParty(tx, body.partyId);
  if (body.salesOrderId) {
    const keptLink = body.salesOrderId === rows[0].sales_order_id;
    await assertSalesOrderLinkable(tx, body.salesOrderId, body.partyId, { keptLink });
  }
  const items = await validateAndResolveItems(tx, body.items);

  await tx.$executeRaw`
    UPDATE temporary_delivery_notes SET date=${date}, party_id=${body.partyId}, nomor_mobil=${body.nomorMobil || null},
      driver_name=${body.driverName || null}, recipient_name=${body.recipientName || null},
      sales_order_id=${body.salesOrderId || null}, notes=${body.notes || null}, updated_at=now() WHERE id=${id}`;
  await tx.$executeRaw`DELETE FROM temporary_delivery_note_items WHERE temporary_delivery_note_id = ${id}`;
  for (const it of items) {
    await tx.$executeRaw`
      INSERT INTO temporary_delivery_note_items (id, temporary_delivery_note_id, inventory_item_id, item_name, quantity, unit, description)
      VALUES (${randomUUID()}, ${id}, ${it.inventoryItemId}, ${it.itemName}, ${it.quantity}, ${it.unit}, ${it.description})`;
  }
  return getTemporaryNote(tx, id);
}

export async function cancelTemporaryNoteInTx(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM temporary_delivery_notes WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw new BusinessError('Surat jalan sementara tidak ditemukan.');
  if (rows[0].status === 'Cancelled') throw new BusinessError('Surat jalan sementara sudah dibatalkan.');
  if (rows[0].status === 'Linked') throw new BusinessError('Sudah ditautkan ke surat jalan resmi, tidak bisa dibatalkan. Batalkan surat jalan resmi dulu.');
  await tx.$executeRaw`UPDATE temporary_delivery_notes SET status='Cancelled', cancelled_at=now(), updated_at=now() WHERE id=${id}`;
  return { id, status: 'Cancelled' as const };
}

/** Tautkan SJS (harus Open, pelanggan sama) ke DO resmi. Dipanggil dalam transaksi pembuatan DO. */
export async function linkTemporaryNotesToDoInTx(tx: Tx, doId: string, partyId: string, noteIds: string[]) {
  if (!noteIds || noteIds.length === 0) return 0;
  const uniq = [...new Set(noteIds)];
  const rows = await tx.$queryRaw<{ id: string; number: string; status: string; party_id: string }[]>`
    SELECT id, number, status, party_id FROM temporary_delivery_notes WHERE id = ANY(${uniq}::text[]) FOR UPDATE`;
  if (rows.length !== uniq.length) throw new BusinessError('Ada surat jalan sementara yang tidak ditemukan.');
  for (const r of rows) {
    if (r.party_id !== partyId) throw new BusinessError(`Surat jalan sementara ${r.number} milik customer lain.`);
    if (r.status !== 'Open') throw new BusinessError(`Surat jalan sementara ${r.number} sudah tidak berstatus Terbuka.`);
  }
  await tx.$executeRaw`
    UPDATE temporary_delivery_notes SET status='Linked', delivery_order_id=${doId}, linked_at=now(), updated_at=now()
    WHERE id = ANY(${uniq}::text[])`;
  return uniq.length;
}

/**
 * Tautkan SJS Terbuka ke DO resmi yang SUDAH ada (lupa dicentang saat membuat DO).
 * Hanya mengubah status SJS — tidak menyentuh stok/GL/DO. DO wajib Submitted
 * (belum Cancelled) dan satu pelanggan dengan SJS.
 */
export async function linkTemporaryNoteToExistingDoInTx(tx: Tx, noteId: string, doId: string) {
  const dos = await tx.$queryRaw<{ id: string; do_number: string; status: string; party_id: string }[]>`
    SELECT id, do_number, status::text AS status, party_id FROM delivery_orders WHERE id = ${doId} FOR UPDATE`;
  if (dos.length === 0) throw new BusinessError('Surat jalan resmi tidak ditemukan.');
  const d = dos[0];
  if (d.status !== 'Submitted') throw new BusinessError(`Surat jalan resmi ${d.do_number} tidak aktif (status ${d.status}).`);
  await linkTemporaryNotesToDoInTx(tx, d.id, d.party_id, [noteId]);
  return getTemporaryNote(tx, noteId);
}

/** Saat DO dibatalkan: SJS yang tertaut kembali Terbuka. */
export async function unlinkTemporaryNotesFromDoInTx(tx: Tx, doId: string) {
  const n = await tx.$executeRaw`
    UPDATE temporary_delivery_notes SET status='Open', delivery_order_id=NULL, linked_at=NULL, updated_at=now()
    WHERE delivery_order_id = ${doId} AND status = 'Linked'`;
  return Number(n);
}

export async function getTemporaryNote(tx: Tx, id: string) {
  const heads = await tx.$queryRaw<any[]>`
    SELECT t.id, t.number, t.date, t.party_id AS "partyId", p.name AS "customerName",
           p.address AS "customerAddress", p.phone AS "customerPhone", t.nomor_mobil AS "nomorMobil",
           t.driver_name AS "driverName", t.recipient_name AS "recipientName", t.sales_order_id AS "salesOrderId",
           so.so_number AS "soNumber", t.status, t.notes, t.delivery_order_id AS "deliveryOrderId", d.do_number AS "doNumber",
           t.linked_at AS "linkedAt", t.created_at AS "createdAt"
    FROM temporary_delivery_notes t
    JOIN parties p ON p.id = t.party_id
    LEFT JOIN delivery_orders d ON d.id = t.delivery_order_id
    LEFT JOIN sales_orders so ON so.id = t.sales_order_id
    WHERE t.id = ${id}`;
  if (!heads[0]) return null;
  const items = await tx.$queryRaw<any[]>`
    SELECT id, inventory_item_id AS "inventoryItemId", item_name AS "itemName", quantity::float8 AS quantity, unit, description
    FROM temporary_delivery_note_items WHERE temporary_delivery_note_id = ${id} ORDER BY created_at, id`;
  return { ...heads[0], items };
}

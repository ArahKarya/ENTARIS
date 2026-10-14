import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { handleRouteError } from '../utils/errors';
import {
  linkTemporaryNoteToExistingDoInTx,
  createTemporaryNoteInTx,
  updateTemporaryNoteInTx,
  cancelTemporaryNoteInTx,
  getTemporaryNote,
} from '../services/temporaryDeliveryNote';
import { localDayRange, parseListPaging, parseSort } from '../utils/listQuery';
import {
  DEFAULT_TDN_SORT,
  parseTdnFilters,
  TDN_SORT_FIELDS,
  tdnOrderBySql,
} from '../services/temporaryDeliveryNoteList';

const router = Router();

// Akses modul 'delivery_order' di-enforce di mount (index.ts). Cancel = capability 'doc.cancel'.

const ItemSchema = z.object({
  inventoryItemId: z.string().min(1, 'Barang wajib dipilih dari master item.'),
  itemName: z.string().optional(),
  quantity: z.number().positive('Qty harus lebih dari 0.'),
  unit: z.string().max(30).optional(),
  description: z.string().nullable().optional(),
});

const TdnSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  partyId: z.string().uuid('Customer wajib dipilih.'),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  salesOrderId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(ItemSchema).min(1, 'Minimal satu item.'),
});

// GET / — daftar. Query: page, limit (≤200), status (Open | Linked | Cancelled),
// partyId, startDate, endDate (YYYY-MM-DD; dateFrom/dateTo masih diterima),
// search (nomor / pelanggan / no. mobil), sort (date | number | customer, "-" = desc).
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const parsed = parseTdnFilters(query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { status, partyId, startDate, endDate, search } = parsed.filters;
    const { page, limit, skip: offset } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const like = `%${search}%`;
    // Calendar days in the business time zone (WIB by default), not UTC days.
    const day = localDayRange(startDate || undefined, endDate || undefined);
    const startSql = day.gte ? Prisma.sql`AND t.date >= ${day.gte}` : Prisma.empty;
    const endSql = day.lt ? Prisma.sql`AND t.date < ${day.lt}` : Prisma.empty;
    const whereSql = Prisma.sql`
      WHERE (${status} = '' OR t.status = ${status})
        AND (${partyId} = '' OR t.party_id = ${partyId})
        ${startSql}
        ${endSql}
        AND (${search} = '' OR t.number ILIKE ${like} OR p.name ILIKE ${like} OR t.nomor_mobil ILIKE ${like})`;
    const orderBy = Prisma.raw(tdnOrderBySql(parseSort(query.sort, TDN_SORT_FIELDS, DEFAULT_TDN_SORT)));

    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.id, t.number, t.date, t.status, t.nomor_mobil AS "nomorMobil", t.driver_name AS "driverName",
             t.party_id AS "partyId", p.name AS "customerName", t.delivery_order_id AS "deliveryOrderId", d.do_number AS "doNumber",
             (SELECT string_agg(i.item_name || ' ' || trim(trailing '.' from trim(trailing '0' from i.quantity::text)) || ' ' || i.unit, ', ')
                FROM temporary_delivery_note_items i WHERE i.temporary_delivery_note_id = t.id) AS ringkasan,
             (CURRENT_DATE - t.date::date)::int AS umur_hari,
             count(*) OVER()::int AS total
      FROM temporary_delivery_notes t
      JOIN parties p ON p.id = t.party_id
      LEFT JOIN delivery_orders d ON d.id = t.delivery_order_id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}`;
    // count(*) OVER() is only present when the page has rows; past the last
    // page fall back to a plain count so the client can clamp.
    let total: number = rows[0]?.total ?? 0;
    if (rows.length === 0 && offset > 0) {
      const c = await prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        FROM temporary_delivery_notes t
        JOIN parties p ON p.id = t.party_id
        ${whereSql}`;
      total = c[0]?.total ?? 0;
    }
    return res.json({ data: rows.map(({ total: _t, ...r }) => r), total, page, limit });
  } catch (error) {
    return handleRouteError(res, error, 'GET /temporary-delivery-notes', 'Gagal mengambil daftar surat jalan sementara.');
  }
});

// GET /linkable?partyId= — SJS Terbuka milik pelanggan (untuk form DO)
router.get('/linkable', async (req, res) => {
  try {
    const partyId = (req.query.partyId as string) || '';
    if (!partyId) return res.json([]);
    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.id, t.number, t.date, t.nomor_mobil AS "nomorMobil", t.driver_name AS "driverName", t.recipient_name AS "recipientName",
             (SELECT json_agg(json_build_object('itemName', i.item_name, 'quantity', i.quantity::float8, 'unit', i.unit, 'inventoryItemId', i.inventory_item_id) ORDER BY i.created_at)
                FROM temporary_delivery_note_items i WHERE i.temporary_delivery_note_id = t.id) AS items
      FROM temporary_delivery_notes t WHERE t.party_id = ${partyId} AND t.status = 'Open' ORDER BY t.date, t.number`;
    return res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, 'GET /temporary-delivery-notes/linkable', 'Gagal mengambil daftar surat jalan sementara.');
  }
});

// GET /summary — jumlah Terbuka + yang melewati batas umur (default 7 hari), untuk badge pengingat
router.get('/summary', async (req, res) => {
  try {
    const days = Math.max(1, Number(req.query.days) || 7);
    const r = await prisma.$queryRaw<any[]>`
      SELECT count(*) FILTER (WHERE status='Open')::int AS open,
             count(*) FILTER (WHERE status='Open' AND (CURRENT_DATE - date::date) > ${days})::int AS overdue
      FROM temporary_delivery_notes`;
    return res.json({ ...r[0], days });
  } catch (error) {
    return handleRouteError(res, error, 'GET /temporary-delivery-notes/summary', 'Gagal mengambil ringkasan.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const note = await prisma.$transaction((tx) => getTemporaryNote(tx, req.params.id as string));
    if (!note) return res.status(404).json({ error: 'Surat jalan sementara tidak ditemukan.' });
    return res.json(note);
  } catch (error) {
    return handleRouteError(res, error, 'GET /temporary-delivery-notes/:id', 'Gagal mengambil detail surat jalan sementara.');
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(TdnSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction((tx) => createTemporaryNoteInTx(tx, body as any, req.user!.userId), { timeout: 15000 });
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /temporary-delivery-notes', 'Gagal membuat surat jalan sementara.');
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(TdnSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction((tx) => updateTemporaryNoteInTx(tx, req.params.id as string, body as any), { timeout: 15000 });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /temporary-delivery-notes/:id', 'Gagal mengubah surat jalan sementara.');
  }
});

router.post('/:id/link', async (req: AuthRequest, res) => {
  const body = validateBody(z.object({ deliveryOrderId: z.string().min(1) }), req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction((tx) => linkTemporaryNoteToExistingDoInTx(tx, req.params.id as string, body.deliveryOrderId), { timeout: 15000 });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /temporary-delivery-notes/:id/link', 'Gagal menautkan surat jalan sementara.');
  }
});

router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction((tx) => cancelTemporaryNoteInTx(tx, req.params.id as string), { timeout: 15000 });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /temporary-delivery-notes/:id/cancel', 'Gagal membatalkan surat jalan sementara.');
  }
});

export default router;

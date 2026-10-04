// GA Material Request (MR) — rantai pengadaan sparepart internal EAM (OPSI A).
//
// Mounted under /api/ga/material-requests with requirePerm('ga_material_request')
// by index.ts. Alur: DRAFT → SUBMITTED → APPROVED → (procurement per-item) →
// RECEIVE (stok masuk atomik) → FULFILLED. Bisa lahir dari Work Order atau standalone.
//
// PRINSIP: sparepart maintenance dicatat sederhana (vendor, harga, status) TANPA
// double-entry GL / PurchaseOrder resmi (itu OPSI B). Kolom forward-compat
// (purchaseOrderId, glAccountId) disediakan nullable tapi belum dipakai.
//
// ERP conventions: inline Zod schemas, validateBody + handleRouteError +
// BusinessError, prisma.ga* accessors, req.user!.userId. Auth + requirePerm
// dilampirkan di index.ts (bukan di sini).
//
// DESAIN AUTO-CREATE ITEM SAAT RECEIVE (dipilih paling aman):
//   GaInventoryItem punya categoryId NOT NULL (FK). Jadi RECEIVE TIDAK
//   membuat item inventory secara implisit dari itemName saja. Aturan:
//     - Jika MR item sudah punya inventoryItemId → langsung dipakai.
//     - Jika belum, body receive WAJIB salah satu dari:
//         (a) inventoryItemId  → link ke item GA inventory yang sudah ada, ATAU
//         (b) newItem { sku, categoryId }  → buat GaInventoryItem baru
//             (name/uom diambil dari MR item) lalu link.
//   Ini mencegah item stok "yatim" tanpa kategori dan menjaga integritas GA inventory.

import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  DEFAULT_MR_SORT,
  MR_SORT_FIELDS,
  buildMaterialRequestWhere,
  countByStatus,
  materialRequestOrderBy,
} from '../../services/gaMaterialRequestList';

const router = Router();

// ─── Validation schemas ──────────────────────────────────────────────

const MrItemInputSchema = z.object({
  inventoryItemId: z.string().min(1).optional().nullable(),
  itemName: z.string().min(1, 'Nama barang wajib diisi.').max(200),
  sku: z.string().max(100).optional().nullable(),
  uom: z.string().min(1, 'Satuan (UOM) wajib diisi.').max(50),
  quantity: z.number().positive('Qty harus lebih dari 0.'),
  notes: z.string().max(500).optional().nullable(),
});

const CreateMrSchema = z.object({
  workOrderId: z.string().min(1).optional().nullable(),
  assetId: z.string().min(1).optional().nullable(),
  machineTarget: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(MrItemInputSchema).min(1, 'Minimal satu item.'),
});

const UpdateMrSchema = z.object({
  assetId: z.string().min(1).optional().nullable(),
  machineTarget: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(MrItemInputSchema).min(1, 'Minimal satu item.'),
});

const RejectSchema = z.object({
  reason: z.string().min(1, 'Alasan wajib diisi.').max(500),
});

const PROCUREMENT_STATUS = ['REQUESTED', 'QUOTED', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const;

const ProcurementUpdateSchema = z.object({
  vendorName: z.string().max(200).optional().nullable(),
  unitPrice: z.number().nonnegative().optional(),
  poNumber: z.string().max(100).optional().nullable(),
  // RECEIVED/CANCELLED dikelola lewat endpoint khusus (receive) atau bila
  // memang sekadar penanda status non-stok — izinkan tapi jangan sentuh stok di sini.
  procurementStatus: z.enum(PROCUREMENT_STATUS).optional(),
});

const ReceiveSchema = z.object({
  receivedQty: z.number().positive('Qty diterima harus lebih dari 0.'),
  locationId: z.string().min(1, 'Lokasi gudang wajib dipilih.'),
  inventoryItemId: z.string().min(1).optional().nullable(),
  newItem: z
    .object({
      sku: z.string().min(1, 'SKU wajib diisi.').max(100),
      categoryId: z.string().min(1, 'Kategori wajib dipilih.'),
    })
    .optional()
    .nullable(),
});

// ─── Helpers ─────────────────────────────────────────────────────────

/** Generate next MR code MR-YYYY-NNNN, serialized via a year-scoped advisory lock. */
async function generateMaterialRequestCode(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MR-${year}-`;
  const lockKey = 0xa71000 + (year - 2000);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const latest = await tx.gaMaterialRequest.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  const lastSeq = latest ? parseInt(latest.code.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

const mrItemInclude = {
  inventoryItem: { select: { id: true, sku: true, name: true, uom: true } },
  receivedIntoLocation: { select: { id: true, code: true, name: true } },
} as const;

// ═══════════════════════════════════════════════════════════════════
// LIST / DETAIL
// ═══════════════════════════════════════════════════════════════════

// GET /material-requests — list, filters status/workOrderId/mine
//
// Two modes (backward compatible):
//  • without `page` (legacy callers): bare array, raw filters, newest first.
//  • with `page` (Permintaan Barang page): `page`, `limit` (≤200), `status`,
//    `workOrderId`, `assetId`, `mine`, `startDate`/`endDate` (request date),
//    `search`, `sort` (code | requestedAt | status) → `{ data, total, page,
//    limit }`; rows also carry `requester` `{ id, fullName }`.
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (req.query.page !== undefined) return await listMaterialRequestsPaged(req, res);
    const where: Prisma.GaMaterialRequestWhereInput = {};
    if (req.query.status) where.status = req.query.status as Prisma.EnumGaMaterialRequestStatusFilter['equals'];
    if (req.query.workOrderId) where.workOrderId = String(req.query.workOrderId);
    if (req.query.mine === 'true' && req.user) where.requestedById = req.user.userId;

    const items = await prisma.gaMaterialRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        asset: { select: { id: true, code: true, name: true } },
        workOrder: { select: { id: true, code: true } },
        items: { select: { id: true, itemName: true, quantity: true, uom: true, procurementStatus: true } },
        _count: { select: { items: true } },
      },
    });
    return res.json(items);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/material-requests', 'Gagal mengambil daftar permintaan barang.');
  }
});

const MR_LIST_INCLUDE = {
  asset: { select: { id: true, code: true, name: true } },
  workOrder: { select: { id: true, code: true } },
  items: { select: { id: true, itemName: true, quantity: true, uom: true, procurementStatus: true } },
  _count: { select: { items: true } },
} as const;

async function listMaterialRequestsPaged(req: AuthRequest, res: Response) {
  const query = req.query as Record<string, unknown>;
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const filter = buildMaterialRequestWhere(query, { userId: req.user?.userId });
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const sort = parseSort(query.sort, MR_SORT_FIELDS, DEFAULT_MR_SORT);

  const [items, total] = await prisma.$transaction([
    prisma.gaMaterialRequest.findMany({
      where: filter.where,
      orderBy: materialRequestOrderBy(sort),
      skip,
      take: limit,
      include: MR_LIST_INCLUDE,
    }),
    prisma.gaMaterialRequest.count({ where: filter.where }),
  ]);
  const ids = [...new Set(items.map((m) => m.requestedById))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  const data = items.map((m) => ({
    ...m,
    requester: { id: m.requestedById, fullName: names.get(m.requestedById) ?? null },
  }));
  return res.json({ data, total, page, limit });
}

// GET /material-requests/summary — counts per status for the list filters
// (the status filter itself is ignored so every status keeps its count):
// { total, byStatus: { DRAFT, SUBMITTED, … } }. Declared before '/:id'.
router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const filter = buildMaterialRequestWhere(req.query as Record<string, unknown>, {
      userId: req.user?.userId,
      ignoreStatus: true,
    });
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const groups = await prisma.gaMaterialRequest.groupBy({
      by: ['status'],
      where: filter.where,
      _count: { _all: true },
    });
    const byStatus = countByStatus(groups);
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return res.json({ total, byStatus });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/material-requests/summary', 'Gagal mengambil ringkasan permintaan barang.');
  }
});

// GET /material-requests/:id — detail + items + WO ref + asset
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const mr = await prisma.gaMaterialRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        asset: { select: { id: true, code: true, name: true } },
        workOrder: { select: { id: true, code: true, title: true, status: true } },
        items: { include: mrItemInclude, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!mr) return res.status(404).json({ error: 'Permintaan barang tidak ditemukan.' });
    return res.json(mr);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/material-requests/:id', 'Gagal mengambil detail permintaan barang.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════

/** Shared MR create logic (dipakai endpoint standalone & dari-WO). */
async function createMaterialRequest(
  userId: string,
  input: {
    workOrderId?: string | null;
    assetId?: string | null;
    machineTarget?: string | null;
    notes?: string | null;
    items: z.infer<typeof MrItemInputSchema>[];
  },
) {
  return prisma.$transaction(async (tx) => {
    if (input.workOrderId) {
      const wo = await tx.gaWorkOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true } });
      if (!wo) throw new BusinessError('Work order tidak ditemukan.');
    }
    if (input.assetId) {
      const asset = await tx.gaAsset.findUnique({ where: { id: input.assetId }, select: { id: true } });
      if (!asset) throw new BusinessError('Aset tidak ditemukan.');
    }
    // Validasi referensi item existing (bila diisi).
    const linkedIds = input.items.map((it) => it.inventoryItemId).filter((v): v is string => !!v);
    if (linkedIds.length > 0) {
      const found = await tx.gaInventoryItem.count({ where: { id: { in: linkedIds } } });
      if (found !== new Set(linkedIds).size) throw new BusinessError('Sebagian item inventory tidak ditemukan.');
    }

    const code = await generateMaterialRequestCode(tx);
    return tx.gaMaterialRequest.create({
      data: {
        code,
        status: 'DRAFT',
        workOrderId: input.workOrderId ?? null,
        assetId: input.assetId ?? null,
        machineTarget: input.machineTarget ?? null,
        notes: input.notes ?? null,
        requestedById: userId,
        requestedAt: new Date(),
        items: {
          create: input.items.map((it) => ({
            inventoryItemId: it.inventoryItemId ?? null,
            itemName: it.itemName,
            sku: it.sku ?? null,
            uom: it.uom,
            quantity: new Prisma.Decimal(it.quantity),
            notes: it.notes ?? null,
          })),
        },
      },
      select: { id: true, code: true },
    });
  });
}

// POST /material-requests — buat MR standalone atau ter-link WO
router.post('/', async (req: AuthRequest, res) => {
  const input = validateBody(CreateMrSchema, req.body, res);
  if (!input) return;
  try {
    const created = await createMaterialRequest(req.user!.userId, input);
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/material-requests', 'Gagal membuat permintaan barang.');
  }
});

// POST /material-requests/from-work-order/:workOrderId — buat MR LANGSUNG dari WO.
// Prefill workOrderId + asset dari WO; body cukup { machineTarget?, notes?, items[] }.
const FromWoSchema = z.object({
  machineTarget: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(MrItemInputSchema).min(1, 'Minimal satu item.'),
});
router.post('/from-work-order/:workOrderId', async (req: AuthRequest, res) => {
  const input = validateBody(FromWoSchema, req.body, res);
  if (!input) return;
  try {
    const wo = await prisma.gaWorkOrder.findUnique({
      where: { id: String(req.params.workOrderId) },
      select: { id: true, assetId: true },
    });
    if (!wo) return res.status(404).json({ error: 'Work order tidak ditemukan.' });
    const created = await createMaterialRequest(req.user!.userId, {
      workOrderId: wo.id,
      assetId: wo.assetId,
      machineTarget: input.machineTarget ?? null,
      notes: input.notes ?? null,
      items: input.items,
    });
    return res.status(201).json(created);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/material-requests/from-work-order/:workOrderId', 'Gagal membuat permintaan barang dari WO.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// EDIT (DRAFT only)
// ═══════════════════════════════════════════════════════════════════

// PUT /material-requests/:id — edit header + ganti seluruh items (hanya DRAFT)
router.put('/:id', async (req: AuthRequest, res) => {
  const input = validateBody(UpdateMrSchema, req.body, res);
  if (!input) return;
  try {
    await prisma.$transaction(async (tx) => {
      const mr = await tx.gaMaterialRequest.findUnique({ where: { id: String(req.params.id) }, select: { id: true, status: true } });
      if (!mr) throw new BusinessError('Permintaan barang tidak ditemukan.');
      if (mr.status !== 'DRAFT') throw new BusinessError('Hanya MR berstatus DRAFT yang bisa diubah.');

      if (input.assetId) {
        const asset = await tx.gaAsset.findUnique({ where: { id: input.assetId }, select: { id: true } });
        if (!asset) throw new BusinessError('Aset tidak ditemukan.');
      }
      const linkedIds = input.items.map((it) => it.inventoryItemId).filter((v): v is string => !!v);
      if (linkedIds.length > 0) {
        const found = await tx.gaInventoryItem.count({ where: { id: { in: linkedIds } } });
        if (found !== new Set(linkedIds).size) throw new BusinessError('Sebagian item inventory tidak ditemukan.');
      }

      await tx.gaMaterialRequestItem.deleteMany({ where: { materialRequestId: mr.id } });
      await tx.gaMaterialRequest.update({
        where: { id: mr.id },
        data: {
          assetId: input.assetId ?? null,
          machineTarget: input.machineTarget ?? null,
          notes: input.notes ?? null,
          items: {
            create: input.items.map((it) => ({
              inventoryItemId: it.inventoryItemId ?? null,
              itemName: it.itemName,
              sku: it.sku ?? null,
              uom: it.uom,
              quantity: new Prisma.Decimal(it.quantity),
              notes: it.notes ?? null,
            })),
          },
        },
      });
    });
    return res.json({ id: String(req.params.id) });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/material-requests/:id', 'Gagal mengubah permintaan barang.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

/** Simple status-transition helper with a BusinessError guard. */
async function transitionStatus(
  id: string,
  allowedFrom: string[],
  data: Prisma.GaMaterialRequestUpdateInput,
  errMsg: (cur: string) => string,
) {
  return prisma.$transaction(async (tx) => {
    const mr = await tx.gaMaterialRequest.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!mr) throw new BusinessError('Permintaan barang tidak ditemukan.');
    if (!allowedFrom.includes(mr.status)) throw new BusinessError(errMsg(mr.status));
    return tx.gaMaterialRequest.update({ where: { id: mr.id }, data, select: { id: true, status: true } });
  });
}

// PATCH /:id/submit — DRAFT → SUBMITTED
router.patch('/:id/submit', async (req: AuthRequest, res) => {
  try {
    const out = await transitionStatus(
      String(req.params.id),
      ['DRAFT'],
      { status: 'SUBMITTED' },
      (cur) => `Tidak bisa submit MR berstatus ${cur}.`,
    );
    return res.json(out);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/submit', 'Gagal submit permintaan barang.');
  }
});

// PATCH /:id/approve — SUBMITTED → APPROVED
// Approval memakai izin edit modul ga_material_request (router-level requirePerm),
// bukan capability terpisah — konsisten dgn pola lifecycle di maintenance.ts.
router.patch('/:id/approve', async (req: AuthRequest, res) => {
  try {
    const out = await transitionStatus(
      String(req.params.id),
      ['SUBMITTED'],
      { status: 'APPROVED', approvedById: req.user!.userId, approvedAt: new Date() },
      (cur) => `Tidak bisa approve MR berstatus ${cur}.`,
    );
    return res.json(out);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/approve', 'Gagal approve permintaan barang.');
  }
});

// PATCH /:id/reject — SUBMITTED → REJECTED
router.patch('/:id/reject', async (req: AuthRequest, res) => {
  const input = validateBody(RejectSchema, req.body, res);
  if (!input) return;
  try {
    const out = await transitionStatus(
      String(req.params.id),
      ['SUBMITTED'],
      { status: 'REJECTED', rejectedById: req.user!.userId, rejectedAt: new Date(), rejectReason: input.reason },
      (cur) => `Tidak bisa reject MR berstatus ${cur}.`,
    );
    return res.json(out);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/reject', 'Gagal reject permintaan barang.');
  }
});

// PATCH /:id/cancel — DRAFT/SUBMITTED/APPROVED → CANCELLED
router.patch('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const out = await transitionStatus(
      String(req.params.id),
      ['DRAFT', 'SUBMITTED', 'APPROVED'],
      { status: 'CANCELLED' },
      (cur) => `Tidak bisa membatalkan MR berstatus ${cur}.`,
    );
    return res.json(out);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/cancel', 'Gagal membatalkan permintaan barang.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// PROCUREMENT (per-item)
// ═══════════════════════════════════════════════════════════════════

// PATCH /:id/items/:itemId/procurement — update vendor/harga/PO/status (non-stok)
router.patch('/:id/items/:itemId/procurement', async (req: AuthRequest, res) => {
  const input = validateBody(ProcurementUpdateSchema, req.body, res);
  if (!input) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.gaMaterialRequestItem.findFirst({
        where: { id: String(req.params.itemId), materialRequestId: String(req.params.id) },
        select: { id: true, procurementStatus: true, materialRequest: { select: { status: true } } },
      });
      if (!item) throw new BusinessError('Item permintaan tidak ditemukan.');
      const mrStatus = item.materialRequest.status;
      if (['REJECTED', 'CANCELLED'].includes(mrStatus)) {
        throw new BusinessError(`Tidak bisa mengubah procurement pada MR berstatus ${mrStatus}.`);
      }
      // Guard: RECEIVED tidak boleh di-set manual lewat endpoint ini (harus lewat receive).
      if (input.procurementStatus === 'RECEIVED' && item.procurementStatus !== 'RECEIVED') {
        throw new BusinessError('Status RECEIVED hanya bisa lewat aksi Terima Barang (receive).');
      }
      const data: Prisma.GaMaterialRequestItemUpdateInput = {};
      if (input.vendorName !== undefined) data.vendorName = input.vendorName ?? null;
      if (input.unitPrice !== undefined) data.unitPrice = new Prisma.Decimal(input.unitPrice);
      if (input.poNumber !== undefined) data.poNumber = input.poNumber ?? null;
      if (input.procurementStatus !== undefined) data.procurementStatus = input.procurementStatus;
      return tx.gaMaterialRequestItem.update({ where: { id: item.id }, data, select: { id: true, procurementStatus: true } });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/items/:itemId/procurement', 'Gagal update procurement item.');
  }
});

// ═══════════════════════════════════════════════════════════════════
// RECEIVE (kunci) — stok masuk atomik ke GA inventory
// ═══════════════════════════════════════════════════════════════════

// PATCH /:id/items/:itemId/receive
// Dalam TRANSAKSI: resolve/buat GaInventoryItem → upsert +qty ke GaStockByLocation
// (atomic ON CONFLICT) → GaInventoryMovement type IN referenceNo=MR_<code> →
// set item RECEIVED. Saat semua item RECEIVED/CANCELLED → MR.status FULFILLED.
router.patch('/:id/items/:itemId/receive', async (req: AuthRequest, res) => {
  const input = validateBody(ReceiveSchema, req.body, res);
  if (!input) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const mr = await tx.gaMaterialRequest.findUnique({
        where: { id: String(req.params.id) },
        select: { id: true, code: true, status: true },
      });
      if (!mr) throw new BusinessError('Permintaan barang tidak ditemukan.');
      if (mr.status !== 'APPROVED') {
        throw new BusinessError(`Barang hanya bisa diterima saat MR berstatus APPROVED (sekarang ${mr.status}).`);
      }

      const item = await tx.gaMaterialRequestItem.findFirst({
        where: { id: String(req.params.itemId), materialRequestId: mr.id },
      });
      if (!item) throw new BusinessError('Item permintaan tidak ditemukan.');
      if (item.procurementStatus === 'RECEIVED') throw new BusinessError('Item ini sudah diterima.');
      if (item.procurementStatus === 'CANCELLED') throw new BusinessError('Item ini sudah dibatalkan.');

      const location = await tx.gaLocation.findUnique({ where: { id: input.locationId }, select: { id: true } });
      if (!location) throw new BusinessError('Lokasi gudang tidak ditemukan.');

      // Resolve inventory item target (lihat catatan desain di header file).
      let inventoryItemId = item.inventoryItemId ?? input.inventoryItemId ?? null;
      if (!inventoryItemId) {
        if (!input.newItem) {
          throw new BusinessError(
            'Item belum tertaut ke inventaris GA. Pilih item inventaris yang ada, atau isi SKU + kategori untuk membuat item baru.',
          );
        }
        const category = await tx.gaInventoryCategory.findUnique({ where: { id: input.newItem.categoryId }, select: { id: true } });
        if (!category) throw new BusinessError('Kategori inventaris tidak ditemukan.');
        const dupe = await tx.gaInventoryItem.findUnique({ where: { sku: input.newItem.sku }, select: { id: true } });
        if (dupe) throw new BusinessError(`SKU "${input.newItem.sku}" sudah dipakai item lain. Pilih item itu atau gunakan SKU lain.`);
        const newItem = await tx.gaInventoryItem.create({
          data: {
            sku: input.newItem.sku,
            name: item.itemName,
            categoryId: input.newItem.categoryId,
            uom: item.uom,
          },
          select: { id: true },
        });
        inventoryItemId = newItem.id;
      } else {
        const exists = await tx.gaInventoryItem.findUnique({ where: { id: inventoryItemId }, select: { id: true } });
        if (!exists) throw new BusinessError('Item inventaris tidak ditemukan.');
      }

      const qty = new Decimal(input.receivedQty);

      // Atomic upsert + increment (Postgres ON CONFLICT) — kebalikan dari konsumsi part.
      await tx.$queryRaw`
        INSERT INTO "ga_stock_by_location" ("id", "item_id", "location_id", "quantity", "updated_at")
        VALUES (gen_random_uuid()::text, ${inventoryItemId}, ${input.locationId}, ${qty.toString()}::numeric, NOW())
        ON CONFLICT ("item_id", "location_id")
        DO UPDATE SET "quantity" = "ga_stock_by_location"."quantity" + ${qty.toString()}::numeric, "updated_at" = NOW()
        RETURNING "quantity"
      `;

      await tx.gaInventoryMovement.create({
        data: {
          itemId: inventoryItemId,
          type: 'IN',
          quantity: qty.toNumber(),
          fromLocationId: null,
          toLocationId: input.locationId,
          referenceNo: `MR_${mr.code}`,
          notes: `Penerimaan sparepart dari MR ${mr.code}`,
          createdBy: req.user!.userId,
        },
      });

      await tx.gaMaterialRequestItem.update({
        where: { id: item.id },
        data: {
          inventoryItemId,
          procurementStatus: 'RECEIVED',
          receivedQty: qty,
          receivedAt: new Date(),
          receivedIntoLocationId: input.locationId,
        },
      });

      // Auto-fulfill: semua item sudah RECEIVED atau CANCELLED → MR FULFILLED.
      const remaining = await tx.gaMaterialRequestItem.count({
        where: { materialRequestId: mr.id, procurementStatus: { notIn: ['RECEIVED', 'CANCELLED'] } },
      });
      if (remaining === 0) {
        await tx.gaMaterialRequest.update({ where: { id: mr.id }, data: { status: 'FULFILLED' } });
      }

      logger.info(
        { materialRequestId: mr.id, itemId: item.id, inventoryItemId, qty: qty.toString(), locationId: input.locationId },
        'MR item received into GA stock',
      );
      return { itemId: item.id, inventoryItemId, fulfilled: remaining === 0 };
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/material-requests/:id/items/:itemId/receive', 'Gagal menerima barang.');
  }
});

export default router;
export { createMaterialRequest, CreateMrSchema, MrItemInputSchema };

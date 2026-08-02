// GA Finance — jembatan tagihan EAM/HRGA ke pembukuan ERP.
//
// Mounted di /api/ga/finance dengan requirePerm('ga_finance') (index.ts).
// Modul ini MILIK AKUNTAN: HRGA mengajukan & menyetujui kebutuhan di EAM,
// Akuntan yang memilih COA lalu membayar di ERP.
//
// Tiga sumber tagihan:
//   1. VEHICLE_TAX     — pajak/STNK/KIR yang sudah di-approve (status IN_PROCESS)
//   2. SERVICE_LOG     — service kendaraan input EAM (source='EAM', belum terjurnal)
//   3. MATERIAL_REQUEST— MR sparepart yang sudah APPROVED/FULFILLED
//
// Dua metode bayar:
//   JOURNAL          → DR beban / CR kas-bank  (langsung lunas)
//   PURCHASE_INVOICE → DR beban / CR 2.1.1 Hutang Usaha (ditagih vendor,
//                      pelunasan lewat modul Pembayaran ERP yang sudah ada)
//
// Data historis (service log source='IMPORT') SENGAJA tidak muncul di antrian —
// nilainya sudah tercatat di GL lewat input manual, posting ulang = dobel.

import { Router } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError, BusinessError } from '../../utils/errors';
import {
  payVehicleTaxInTx,
  cancelVehicleTaxPaymentInTx,
  payServiceLogViaInvoiceInTx,
  cancelServiceLogInvoiceInTx,
  payMaterialRequestInTx,
  cancelMaterialRequestPaymentInTx,
  ACC_VEHICLE_TAX,
  ACC_VEHICLE_MAINTENANCE,
} from '../../services/gaFinance';
import { postVehicleServiceJournalInTx } from '../../services/gaVehicleServiceJournal';

const router = Router();

const PaySchema = z.object({
  method: z.enum(['JOURNAL', 'PURCHASE_INVOICE']),
  accountId: z.string().min(1).optional().nullable(),
  creditAccountId: z.string().min(1).optional().nullable(),
  partyId: z.string().min(1).optional().nullable(),
  amount: z.number().positive().optional().nullable(),
  date: z.string().min(1).optional().nullable(),
  dueDate: z.string().min(1).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const TX_OPTS = { timeout: 30000, maxWait: 10000 };

// ─── GET /bills — antrian tagihan GA yang belum masuk pembukuan ──────
router.get('/bills', async (req: AuthRequest, res) => {
  try {
    const kind = String(req.query.kind || 'ALL').toUpperCase();
    const includePaid = String(req.query.includePaid || 'false') === 'true';

    const [taxes, logs, mrs] = await Promise.all([
      kind === 'ALL' || kind === 'VEHICLE_TAX'
        ? prisma.gaVehicleTax.findMany({
            where: includePaid
              ? { status: { in: ['IN_PROCESS', 'PAID'] } }
              : { status: 'IN_PROCESS', journalEntryId: null },
            include: {
              asset: { select: { id: true, code: true, name: true } },
              journalEntry: { select: { id: true, entryNumber: true, status: true } },
              purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true, outstanding: true } },
            },
            orderBy: { dueDate: 'asc' },
          })
        : Promise.resolve([]),
      kind === 'ALL' || kind === 'SERVICE_LOG'
        ? prisma.gaVehicleServiceLog.findMany({
            where: includePaid
              ? { source: 'EAM' }
              : { source: 'EAM', journalEntryId: null, biaya: { gt: 0 } },
            include: {
              asset: { select: { id: true, code: true, name: true } },
              journalEntry: { select: { id: true, entryNumber: true, status: true } },
              purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true, outstanding: true } },
            },
            orderBy: { tanggal: 'desc' },
            take: 300,
          })
        : Promise.resolve([]),
      kind === 'ALL' || kind === 'MATERIAL_REQUEST'
        ? prisma.gaMaterialRequest.findMany({
            where: includePaid
              ? { status: { in: ['APPROVED', 'FULFILLED', 'PAID'] } }
              : { status: { in: ['APPROVED', 'FULFILLED'] }, journalEntryId: null },
            include: {
              items: true,
              asset: { select: { id: true, code: true, name: true } },
              journalEntry: { select: { id: true, entryNumber: true, status: true } },
              purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true, outstanding: true } },
            },
            orderBy: { requestedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const bills = [
      ...taxes.map((t) => ({
        kind: 'VEHICLE_TAX' as const,
        id: t.id,
        ref: `${t.type.replace(/_/g, ' ')} ${t.periodYear}`,
        date: t.dueDate,
        assetCode: t.asset?.code ?? null,
        assetName: t.asset?.name ?? null,
        description: `${t.type.replace(/_/g, ' ')} — ${t.asset?.name ?? '-'} TA ${t.periodYear}`,
        amount: Number(t.paidAmount ?? t.amount ?? 0),
        status: t.status,
        defaultAccountNumber: ACC_VEHICLE_TAX,
        journalEntry: t.journalEntry,
        purchaseInvoice: t.purchaseInvoice,
        notes: t.notes,
      })),
      ...logs.map((l) => ({
        kind: 'SERVICE_LOG' as const,
        id: l.id,
        ref: l.jenisService,
        date: l.tanggal,
        assetCode: l.asset?.code ?? null,
        assetName: l.asset?.name ?? null,
        description: `${l.deskripsi}${l.bengkel ? ` (${l.bengkel})` : ''}`,
        amount: Number(l.biaya ?? 0),
        status: l.journalEntryId ? 'PAID' : 'PENDING',
        defaultAccountNumber: ACC_VEHICLE_MAINTENANCE,
        journalEntry: l.journalEntry,
        purchaseInvoice: l.purchaseInvoice,
        notes: null,
      })),
      ...mrs.map((m) => {
        const total = m.items.reduce(
          (s, it) => s.plus(new Decimal(it.unitPrice?.toString() ?? '0').times(it.quantity.toString())),
          new Decimal(0),
        );
        return {
          kind: 'MATERIAL_REQUEST' as const,
          id: m.id,
          ref: m.code,
          date: m.approvedAt ?? m.requestedAt,
          assetCode: m.asset?.code ?? null,
          assetName: m.asset?.name ?? m.machineTarget ?? null,
          description: `Sparepart ${m.code} — ${m.items.length} item`,
          amount: Number(m.paidAmount ?? total.toNumber()),
          status: m.status,
          defaultAccountNumber: ACC_VEHICLE_MAINTENANCE,
          journalEntry: m.journalEntry,
          purchaseInvoice: m.purchaseInvoice,
          notes: m.notes,
          items: m.items.map((it) => ({
            itemName: it.itemName,
            quantity: Number(it.quantity),
            uom: it.uom,
            unitPrice: Number(it.unitPrice ?? 0),
          })),
        };
      }),
    ];

    const pending = bills.filter((b) => !b.journalEntry);
    res.json({
      bills,
      summary: {
        pendingCount: pending.length,
        pendingAmount: pending.reduce((s, b) => s + b.amount, 0),
      },
    });
  } catch (error) {
    handleRouteError(res, error, 'GET /ga/finance/bills', 'Gagal memuat antrian tagihan GA.');
  }
});

// ─── POST /:kind/:id/pay ─────────────────────────────────────────────
router.post('/:kind/:id/pay', async (req: AuthRequest, res) => {
  try {
    const input = validateBody(PaySchema, req.body, res);
    if (!input) return;

    const kind = String(req.params.kind).toUpperCase();
    const billId = String(req.params.id);
    const userId = req.user!.userId;
    const args = { ...input, id: billId, userId } as any;

    const result = await prisma.$transaction(async (tx) => {
      if (kind === 'VEHICLE_TAX') {
        return payVehicleTaxInTx(tx, { ...args, kind: 'VEHICLE_TAX' });
      }
      if (kind === 'SERVICE_LOG') {
        if (input.method === 'PURCHASE_INVOICE') {
          return payServiceLogViaInvoiceInTx(tx, { ...args, kind: 'SERVICE_LOG' });
        }
        // Jalur jurnal langsung memakai service lama yang sudah teruji.
        return postVehicleServiceJournalInTx(tx, {
          serviceLogId: billId,
          accountId: input.accountId!,
          creditAccountId: input.creditAccountId!,
          userId,
        });
      }
      if (kind === 'MATERIAL_REQUEST') {
        return payMaterialRequestInTx(tx, { ...args, kind: 'MATERIAL_REQUEST' });
      }
      throw new BusinessError(`Jenis tagihan "${kind}" tidak dikenal.`);
    }, TX_OPTS);

    res.json({ success: true, data: result });
  } catch (error) {
    handleRouteError(res, error, 'POST /ga/finance/:kind/:id/pay', 'Gagal memposting tagihan GA.');
  }
});

// ─── POST /:kind/:id/cancel ──────────────────────────────────────────
router.post('/:kind/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const kind = String(req.params.kind).toUpperCase();
    const id = String(req.params.id);

    const result = await prisma.$transaction(async (tx) => {
      if (kind === 'VEHICLE_TAX') return cancelVehicleTaxPaymentInTx(tx, id);
      if (kind === 'SERVICE_LOG') return cancelServiceLogInvoiceInTx(tx, id);
      if (kind === 'MATERIAL_REQUEST') return cancelMaterialRequestPaymentInTx(tx, id);
      throw new BusinessError(`Jenis tagihan "${kind}" tidak dikenal.`);
    }, TX_OPTS);

    res.json({ success: true, data: result });
  } catch (error) {
    handleRouteError(res, error, 'POST /ga/finance/:kind/:id/cancel', 'Gagal membatalkan posting tagihan GA.');
  }
});

export default router;

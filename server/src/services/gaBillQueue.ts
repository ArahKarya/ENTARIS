// EAM bill queue: merges VEHICLE_TAX, SERVICE_LOG and MATERIAL_REQUEST into one bill shape; posting
// goes only through gaFinance. SERVICE_LOG source='IMPORT' is excluded (already in the GL).
import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BusinessError } from '../utils/errors';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';
import {
  payVehicleTaxInTx,
  cancelVehicleTaxPaymentInTx,
  payServiceLogViaInvoiceInTx,
  cancelServiceLogInvoiceInTx,
  payMaterialRequestInTx,
  cancelMaterialRequestPaymentInTx,
  ACC_VEHICLE_TAX,
  ACC_VEHICLE_MAINTENANCE,
} from './gaFinance';
import { postVehicleServiceJournalInTx } from './gaVehicleServiceJournal';

export const BILL_KINDS = ['VEHICLE_TAX', 'SERVICE_LOG', 'MATERIAL_REQUEST'] as const;
export type BillKind = (typeof BILL_KINDS)[number];

export const BILL_TX_OPTS = { timeout: 30000, maxWait: 10000 };

export async function loadGaBills(kind: string, includePaid: boolean) {
  const wants = (k: BillKind) => kind === 'ALL' || kind === k;
  const [taxes, logs, mrs] = await Promise.all([
    wants('VEHICLE_TAX')
      ? prisma.gaVehicleTax.findMany({
          // Do not rely on status alone: an EAM asset edit can reset it to ACTIVE. The source of
          // truth is "not journaled yet and from an approved request (or IN_PROCESS)".
          where: includePaid
            ? {
                OR: [
                  { status: { in: ['IN_PROCESS', 'PAID'] } },
                  { journalEntryId: { not: null } },
                  { request: { status: 'APPROVED' } },
                ],
              }
            : {
                journalEntryId: null,
                purchaseInvoiceId: null,
                // status PAID = sudah dibayar & dicatat manual di modul
                // keuangan (tanpa jurnal dari GA). Jangan masuk antrian
                // pending — kalau diposting lagi jadi dobel beban.
                status: { not: 'PAID' },
                OR: [{ status: 'IN_PROCESS' }, { request: { status: 'APPROVED' } }],
              },
          include: {
            asset: { select: { id: true, code: true, name: true } },
            journalEntry: { select: { id: true, entryNumber: true, status: true } },
            purchaseInvoice: { select: { id: true, invoiceNumber: true, status: true, outstanding: true } },
          },
          orderBy: { dueDate: 'asc' },
        })
      : Promise.resolve([]),
    wants('SERVICE_LOG')
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
    wants('MATERIAL_REQUEST')
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
      description: `${t.type.replace(/_/g, ' ')}: ${t.asset?.name ?? '-'} TA ${t.periodYear}`,
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
        description: `Sparepart ${m.code} (${m.items.length} item)`,
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
  return bills;
}

export type GaBill = Awaited<ReturnType<typeof loadGaBills>>[number];

/** Posted = has a journal or a purchase invoice. */
export const isBillPosted = (b: Pick<GaBill, 'journalEntry' | 'purchaseInvoice'>) => !!b.journalEntry || !!b.purchaseInvoice;

// Paged / filtered list for /api/payment-requests/eam

export const EAM_SORT_FIELDS = ['date', 'amount', 'kind', 'asset'] as const;
export type EamSortField = (typeof EAM_SORT_FIELDS)[number];
export const DEFAULT_EAM_SORT: SortSpec<EamSortField> = { field: 'date', dir: 'desc' };

export interface EamQuery {
  kind: string;
  posting: 'pending' | 'posted' | 'all';
  search: string;
  startDate?: string;
  endDate?: string;
}

export type EamQueryResult = { ok: true; query: EamQuery } | { ok: false; error: string };

/** Validate the query string: kind, posting (''=queue | posted | all), search, startDate/endDate. */
export function parseEamQuery(raw: Record<string, unknown>): EamQueryResult {
  const kind = (firstString(raw.kind) ?? 'ALL').toUpperCase();
  if (kind !== 'ALL' && !(BILL_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: 'Jenis tagihan tidak dikenal.' };
  }
  const postingRaw = firstString(raw.posting) ?? 'pending';
  if (!['pending', 'posted', 'all'].includes(postingRaw)) return { ok: false, error: 'Status posting tidak dikenal.' };
  const startDate = parseDateParam(raw.startDate);
  const endDate = parseDateParam(raw.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: 'Tanggal awal tidak boleh setelah tanggal akhir.' };
  }
  return {
    ok: true,
    query: {
      kind,
      posting: postingRaw as EamQuery['posting'],
      search: (firstString(raw.search) ?? '').toLowerCase(),
      startDate,
      endDate,
    },
  };
}

const textCmp = (a: string, b: string) => a.localeCompare(b, 'id', { sensitivity: 'base' });
const KIND_LABEL: Record<BillKind, string> = {
  VEHICLE_TAX: 'Pajak / STNK / KIR',
  SERVICE_LOG: 'Service Kendaraan',
  MATERIAL_REQUEST: 'Permintaan Sparepart (MR)',
};

/** Pure: filter + sort an already loaded bill list. */
export function filterAndSortBills(bills: readonly GaBill[], q: EamQuery, sort: SortSpec<EamSortField>): GaBill[] {
  const range = localDayRange(q.startDate, q.endDate);
  const rows = bills.filter((b) => {
    if (q.kind !== 'ALL' && b.kind !== q.kind) return false;
    const posted = isBillPosted(b);
    if (q.posting === 'pending' && posted) return false;
    if (q.posting === 'posted' && !posted) return false;
    if (q.search) {
      const hay = [b.description, b.assetName ?? '', b.assetCode ?? '', b.ref].join(' ').toLowerCase();
      if (!hay.includes(q.search)) return false;
    }
    if (range.gte || range.lt) {
      if (!b.date) return false;
      const t = new Date(b.date).getTime();
      if (range.gte && t < range.gte.getTime()) return false;
      if (range.lt && t >= range.lt.getTime()) return false;
    }
    return true;
  });
  const sign = sort.dir === 'desc' ? -1 : 1;
  return rows.sort((a, b) => {
    switch (sort.field) {
      case 'date': {
        if (!a.date || !b.date) return a.date === b.date ? 0 : a.date ? -1 : 1;
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * sign;
      }
      case 'amount':
        return (a.amount - b.amount) * sign;
      case 'kind':
        return textCmp(KIND_LABEL[a.kind], KIND_LABEL[b.kind]) * sign;
      default:
        return textCmp(a.assetName ?? '', b.assetName ?? '') * sign;
    }
  });
}

export interface EamSummary {
  /** Unposted bills overall (all kinds, ignores filters) — the tab badge. */
  pendingCount: number;
  pendingAmount: number;
  /** Rows matching the current filters. */
  matchedCount: number;
  matchedAmount: number;
}

export function summarizeEam(all: readonly GaBill[], matched: readonly GaBill[]): EamSummary {
  const pending = all.filter((b) => !isBillPosted(b));
  const sum = (rows: readonly GaBill[]) => rows.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  return { pendingCount: pending.length, pendingAmount: sum(pending), matchedCount: matched.length, matchedAmount: sum(matched) };
}

// Posting / cancel dispatchers (shared by both routers)

export interface EamPayInput {
  method: 'JOURNAL' | 'PURCHASE_INVOICE';
  accountId?: string | null;
  creditAccountId?: string | null;
  partyId?: string | null;
  amount?: number | null;
  date?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export function payGaBill(kindRaw: string, billId: string, input: EamPayInput, userId: string) {
  const kind = kindRaw.toUpperCase();
  const args = { ...input, id: billId, userId } as any;
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (kind === 'VEHICLE_TAX') return payVehicleTaxInTx(tx, { ...args, kind: 'VEHICLE_TAX' });
    if (kind === 'SERVICE_LOG') {
      if (input.method === 'PURCHASE_INVOICE') return payServiceLogViaInvoiceInTx(tx, { ...args, kind: 'SERVICE_LOG' });
      // Direct journal path keeps using the long-tested service.
      return postVehicleServiceJournalInTx(tx, {
        serviceLogId: billId,
        accountId: input.accountId!,
        creditAccountId: input.creditAccountId!,
        userId,
      });
    }
    if (kind === 'MATERIAL_REQUEST') return payMaterialRequestInTx(tx, { ...args, kind: 'MATERIAL_REQUEST' });
    throw new BusinessError(`Jenis tagihan "${kind}" tidak dikenal.`);
  }, BILL_TX_OPTS);
}

export function cancelGaBill(kindRaw: string, id: string) {
  const kind = kindRaw.toUpperCase();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (kind === 'VEHICLE_TAX') return cancelVehicleTaxPaymentInTx(tx, id);
    if (kind === 'SERVICE_LOG') return cancelServiceLogInvoiceInTx(tx, id);
    if (kind === 'MATERIAL_REQUEST') return cancelMaterialRequestPaymentInTx(tx, id);
    throw new BusinessError(`Jenis tagihan "${kind}" tidak dikenal.`);
  }, BILL_TX_OPTS);
}

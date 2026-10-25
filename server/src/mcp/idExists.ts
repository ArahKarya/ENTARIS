// Pra-cek KEBERADAAN ID di DB untuk argumen tool tulis AIRA/MCP (lapis 2).
// Hanya untuk daftar kecil param yang pemetaannya ke model jelas; param lain dibiarkan ke handler.
// Gagal-terbuka: DB lambat / error / model tak dikenal = lolos (handler tetap memvalidasi).

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import type { ToolDef, ToolParam } from '../ai/types';
import { isEntityId } from './idShape';

type Model = 'party' | 'account' | 'salesInvoice' | 'purchaseInvoice' | 'payment';

const LABEL: Record<Model, string> = {
  party: 'pelanggan/pemasok',
  account: 'akun',
  salesInvoice: 'invoice penjualan',
  purchaseInvoice: 'invoice pembelian',
  payment: 'pembayaran',
};

const SEARCH: Record<Model, string> = {
  party: 'party_search',
  account: 'coa_flat',
  salesInvoice: 'si_list / si_summary',
  purchaseInvoice: 'pi_list / pi_summary',
  payment: 'pay_list / pay_ledger',
};

/** Nama param (daun) -> model. `invoiceId` ditentukan oleh `invoiceType` sebaris (lihat resolveModel). */
const MODEL_BY_LEAF: Record<string, Model> = {
  partyId: 'party',
  accountId: 'account',
  cashAccountId: 'account',
  creditAccountId: 'account',
  expenseAccountId: 'account',
  defaultExpenseAccountId: 'account',
  offsetAccountId: 'account',
  salesInvoiceId: 'salesInvoice',
  refundSourcePaymentId: 'payment',
};

const MAX_IDS = 50;
const LOOKUP_TIMEOUT_MS = 1500;

export interface MissingId {
  path: string;
  value: string;
  model: Model;
}

type Ref = MissingId;

function resolveModel(leaf: string, row: Record<string, unknown> | undefined): Model | undefined {
  if (leaf === 'invoiceId') {
    const t = row?.invoiceType;
    return t === 'SalesInvoice' ? 'salesInvoice' : t === 'PurchaseInvoice' ? 'purchaseInvoice' : undefined;
  }
  return MODEL_BY_LEAF[leaf];
}

function collect(p: ToolParam, v: unknown, path: string, row: Record<string, unknown> | undefined, out: Ref[]): void {
  if (v === undefined || v === null || v === '') return;
  if (p.type === 'array<object>' || p.type === 'object') {
    const rows = p.type === 'object' ? [v] : Array.isArray(v) ? v : [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const rec = r as Record<string, unknown>;
      for (const f of p.fields ?? []) collect(f, rec[f.name], `${path}${p.type === 'object' ? '' : '[]'}.${f.name}`, rec, out);
    }
    return;
  }
  const model = resolveModel(p.name, row);
  if (!model || typeof v !== 'string' || !isEntityId(v)) return; // bentuk salah sudah ditolak lapis 1
  out.push({ path, value: v, model });
}

async function existing(model: Model, ids: string[]): Promise<Set<string>> {
  const delegate = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Array<{ id: string }>> }>)[model];
  const rows = await delegate.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** ID berbentuk benar yang TIDAK ada di DB. Tool baca / gangguan DB = []. */
export async function findMissingIds(tool: Pick<ToolDef, 'risk' | 'params'>, args: Record<string, unknown>): Promise<MissingId[]> {
  if (tool.risk === 'read') return [];
  const refs: Ref[] = [];
  for (const p of tool.params ?? []) collect(p, args[p.name], p.name, undefined, refs);
  if (!refs.length || refs.length > MAX_IDS) return [];

  const byModel = new Map<Model, string[]>();
  for (const r of refs) byModel.set(r.model, [...new Set([...(byModel.get(r.model) ?? []), r.value])]);

  try {
    const lookup = Promise.all([...byModel].map(async ([model, ids]) => [model, await existing(model, ids)] as const));
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS).unref());
    const found = await Promise.race([lookup, timeout]);
    if (!found) return []; // lambat: jangan blok panggilan
    const present = new Map(found);
    return refs.filter((r) => !present.get(r.model)?.has(r.value));
  } catch (err) {
    logger.warn({ err }, 'MCP: pra-cek keberadaan ID dilewati');
    return [];
  }
}

export function formatMissingIds(missing: MissingId[]): string {
  return missing
    .map((m) => `${m.path} "${m.value.slice(0, 8)}…" tidak ditemukan sebagai ${LABEL[m.model]}. Cari ID yang benar lewat ${SEARCH[m.model]}`)
    .join('; ');
}

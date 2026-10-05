import { z } from 'zod';
import { DIRECTIONS, TXN_TYPES } from './cashBookRules';

/**
 * One row as read from a cash book page. Fields are intentionally loose (`unknown`):
 * every row is validated by utils/cashBookRules.normalizeRowInput so the error names the
 * row ("Baris 7: ..."), which is far more useful to the engine/user than a generic schema error.
 */
export const CashBookRowInputSchema = z.looseObject({
  date: z.unknown().optional(),
  description: z.unknown().optional(),
  masuk: z.unknown().optional(),
  keluar: z.unknown().optional(),
  amount: z.unknown().optional(),
  direction: z.unknown().optional(),
  txnType: z.unknown().optional(),
  accountCode: z.unknown().optional(),
  accountId: z.unknown().optional(),
  confidence: z.unknown().optional(),
  reason: z.unknown().optional(),
});

const money = z.union([z.number(), z.string()]);

export const CreateCashBookDraftSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  entryDate: z.string().min(1, 'Tanggal halaman buku kas wajib diisi.'),
  cashAccountId: z.string().min(1, 'Akun kas wajib dipilih.'),
  openingBalance: money.nullable().optional(),
  closingBalance: money.nullable().optional(),
  sourceRef: z.string().max(200).nullable().optional(),
  sourceNote: z.string().max(1000).nullable().optional(),
  rows: z.array(CashBookRowInputSchema, 'Baris wajib berupa daftar.'),
});

export const UpdateCashBookDraftSchema = z.object({
  title: z.string().max(200).optional(),
  entryDate: z.string().optional(),
  cashAccountId: z.string().optional(),
  openingBalance: money.nullable().optional(),
  closingBalance: money.nullable().optional(),
  sourceNote: z.string().max(1000).nullable().optional(),
});

export const CashBookRowPatchSchema = z.object({
  id: z.string().min(1, 'ID baris wajib diisi.'),
  description: z.string().optional(),
  amount: money.optional(),
  date: z.string().optional(),
  direction: z.enum(DIRECTIONS).optional(),
  txnType: z.enum(TXN_TYPES).optional(),
  accountId: z.string().nullable().optional(),
  skip: z.boolean().optional(),
  reviewed: z.boolean().optional(),
});

export const UpdateCashBookRowsSchema = z.object({
  rows: z.array(CashBookRowPatchSchema).min(1, 'Minimal satu baris.'),
});

export const AppendCashBookRowsSchema = z.object({
  rows: z.array(CashBookRowInputSchema, 'Baris wajib berupa daftar.'),
});

export const PostCashBookDraftSchema = z.object({
  partial: z.boolean().optional(),
});

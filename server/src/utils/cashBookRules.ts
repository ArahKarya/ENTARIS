/**
 * Draft Buku Kas — pure rules (no DB). Direction and the DR/CR of every
 * journal are decided HERE, deterministically; the AIRA Engine (LLM) only
 * proposes {txnType, account, confidence, reason} per row and is never trusted
 * for the accounting direction.
 *
 *   txnType         direction  journal
 *   pengeluaran     keluar     DR <akun lawan (beban)>       / CR <kas>
 *   pemasukan       masuk      DR <kas>                      / CR <akun lawan (sumber)>
 *   uang_muka       keluar     DR <Uang Muka Karyawan>       / CR <kas>
 *   terima_kasbon   masuk      DR <kas>                      / CR <Uang Muka Karyawan>
 *   lainnya         keluar     DR <akun usulan>              / CR <kas>   (selalu needsReview)
 *   lainnya         masuk      DR <kas>                      / CR <akun usulan>
 */
import Decimal from 'decimal.js';

export const TXN_TYPES = ['pengeluaran', 'pemasukan', 'uang_muka', 'terima_kasbon', 'lainnya'] as const;
export type TxnType = (typeof TXN_TYPES)[number];

export const DIRECTIONS = ['masuk', 'keluar'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Hard limit of rows per draft (create + appends). */
export const ROW_LIMIT = 300;
/** Rows below this confidence are flagged needsReview. */
export const REVIEW_THRESHOLD = 0.7;
export const MAX_DESCRIPTION = 500;
const MAX_REASON = 500;

export const isTxnType = (v: unknown): v is TxnType => typeof v === 'string' && (TXN_TYPES as readonly string[]).includes(v);
export const isDirection = (v: unknown): v is Direction => v === 'masuk' || v === 'keluar';
export const isAdvanceType = (t: TxnType): boolean => t === 'uang_muka' || t === 'terima_kasbon';

/** Direction each type implies; `lainnya` fits both. */
export function txnTypeFits(type: TxnType, direction: Direction): boolean {
  if (type === 'lainnya') return true;
  if (type === 'pengeluaran' || type === 'uang_muka') return direction === 'keluar';
  return direction === 'masuk';
}

export const defaultTxnType = (direction: Direction): TxnType => (direction === 'masuk' ? 'pemasukan' : 'pengeluaran');

/** A type that contradicts the direction is coerced to the plain type of the real direction. */
export function coerceTxnType(type: TxnType, direction: Direction): TxnType {
  return txnTypeFits(type, direction) ? type : defaultTxnType(direction);
}

// Money / dates / text

export const roundMoney = (v: Decimal.Value): Decimal => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Parse an amount given as number or text ("Rp 1.250.000,50", "1,250,000.50", "(500)").
 * absent/blank → 0; unparseable → null; result rounded to 2 dp (half up).
 */
export function parseMoney(v: unknown): Decimal | null {
  if (v === undefined || v === null) return new Decimal(0);
  if (typeof v === 'number') return Number.isFinite(v) ? roundMoney(v) : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^(rp\.?|idr)\s*/i, '').replace(/\s+/g, '');
  if (s === '') return new Decimal(0);
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    const isThousands = parts.length > 2 || (tail.length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== '0');
    normalized = isThousands ? parts.join('') : `${parts[0]}.${tail}`;
  } else {
    normalized = s;
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  try {
    const d = roundMoney(normalized);
    return negative ? d.negated() : d;
  } catch {
    return null;
  }
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY; returns a validated YYYY-MM-DD or null. */
export function normalizeDateInput(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export const collapseSpaces = (s: string): string => s.replace(/\s+/g, ' ').trim();

const stripDiacritics = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Pattern used by learned maps: lower-case, no diacritics/punctuation, numbers
 * and single characters dropped (so "Beli ATK 2 box" ≈ "beli atk box").
 */
export function descriptionPattern(description: string): string {
  const tokens = stripDiacritics(description.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
  return tokens.slice(0, 12).join(' ').slice(0, 120);
}

/** Strict key for duplicate detection (keeps digits). */
export function duplicateKey(date: string, amount: Decimal.Value, direction: Direction, description: string): string {
  const norm = stripDiacritics(description.toLowerCase()).replace(/[^a-z0-9]+/g, '');
  return `${date}|${roundMoney(amount).toFixed(2)}|${direction}|${norm}`;
}

export function mergeReasons(parts: ReadonlyArray<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = p ? collapseSpaces(p) : '';
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  if (out.length === 0) return null;
  const joined = out.join('; ');
  return joined.length > MAX_REASON ? `${joined.slice(0, MAX_REASON - 1)}…` : joined;
}

export const clampConfidence = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
};

// Row input

export interface RawRowInput {
  date?: unknown;
  description?: unknown;
  masuk?: unknown;
  keluar?: unknown;
  amount?: unknown;
  direction?: unknown;
}

export interface NormalizedRow {
  idx: number;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  amount: Decimal;
  direction: Direction;
}

export type RowResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Normalise one input row ({date?, description, masuk?|keluar?} or {amount, direction}).
 * `idx` is 1-based and only used in error text. Exactly one direction with amount > 0.
 */
export function normalizeRowInput(raw: RawRowInput, idx: number, fallbackDate: string): RowResult<NormalizedRow> {
  const at = `Baris ${idx}`;
  const description = typeof raw.description === 'string' ? collapseSpaces(raw.description) : '';
  if (!description) return { ok: false, error: `${at}: keterangan wajib diisi.` };
  if (description.length > MAX_DESCRIPTION) return { ok: false, error: `${at}: keterangan maksimal ${MAX_DESCRIPTION} karakter.` };

  let date = fallbackDate;
  if (raw.date !== undefined && raw.date !== null && raw.date !== '') {
    const d = normalizeDateInput(raw.date);
    if (!d) return { ok: false, error: `${at}: tanggal "${String(raw.date)}" tidak valid (format YYYY-MM-DD).` };
    date = d;
  }

  let amount: Decimal;
  let direction: Direction;
  const hasPair = raw.masuk !== undefined || raw.keluar !== undefined;
  if (hasPair) {
    const masuk = parseMoney(raw.masuk);
    const keluar = parseMoney(raw.keluar);
    if (masuk === null || keluar === null) return { ok: false, error: `${at}: nominal masuk/keluar bukan angka yang valid.` };
    if (masuk.isNegative() || keluar.isNegative()) return { ok: false, error: `${at}: nominal tidak boleh negatif.` };
    const hasIn = masuk.gt(0);
    const hasOut = keluar.gt(0);
    if (hasIn && hasOut) return { ok: false, error: `${at}: isi salah satu saja, masuk atau keluar (bukan keduanya).` };
    if (!hasIn && !hasOut) return { ok: false, error: `${at}: nominal masuk atau keluar harus lebih dari 0.` };
    amount = hasIn ? masuk : keluar;
    direction = hasIn ? 'masuk' : 'keluar';
  } else {
    if (!isDirection(raw.direction)) return { ok: false, error: `${at}: arah harus "masuk" atau "keluar".` };
    const a = parseMoney(raw.amount);
    if (a === null) return { ok: false, error: `${at}: nominal bukan angka yang valid.` };
    if (!a.gt(0)) return { ok: false, error: `${at}: nominal harus lebih dari 0.` };
    amount = a;
    direction = raw.direction;
  }
  if (amount.gte(new Decimal('1e18'))) return { ok: false, error: `${at}: nominal terlalu besar.` };
  return { ok: true, value: { idx, date, description, amount, direction } };
}

/** Row-count guard for create (existing = 0) and append. */
export function checkRowCount(existing: number, adding: number): string | null {
  if (adding < 1) return 'Minimal satu baris diperlukan.';
  if (existing + adding > ROW_LIMIT) {
    return `Maksimal ${ROW_LIMIT} baris per draft (saat ini ${existing}, menambah ${adding}). Pecah menjadi beberapa draft.`;
  }
  return null;
}

// Learned maps

export interface LearnedMapEntry {
  pattern: string;
  txnType: string;
  accountId: string;
  hits: number;
}

const tokensOf = (pattern: string): Set<string> => new Set(pattern.split(' ').filter(Boolean));

const MIN_JACCARD = 0.6;

/** Confidence given to an account suggested by a learned map (1 hit stays "ragu"). */
export function learnedConfidence(hits: number): number {
  if (hits >= 3) return 0.85;
  if (hits === 2) return 0.75;
  return 0.65;
}

/** Best learned map for a description: exact pattern first, else token-Jaccard >= 0.6. Types must fit the direction. */
export function matchLearned(description: string, direction: Direction, maps: readonly LearnedMapEntry[]): LearnedMapEntry | null {
  const pattern = descriptionPattern(description);
  if (!pattern) return null;
  const mine = tokensOf(pattern);
  let best: { map: LearnedMapEntry; score: number } | null = null;
  for (const map of maps) {
    if (!isTxnType(map.txnType) || !txnTypeFits(map.txnType, direction)) continue;
    let score: number;
    if (map.pattern === pattern) {
      score = 1;
    } else {
      const theirs = tokensOf(map.pattern);
      let inter = 0;
      for (const t of mine) if (theirs.has(t)) inter += 1;
      const union = mine.size + theirs.size - inter;
      score = union === 0 ? 0 : inter / union;
      if (score < MIN_JACCARD) continue;
    }
    if (!best || score > best.score || (score === best.score && map.hits > best.map.hits)) best = { map, score };
  }
  return best?.map ?? null;
}

// Classification

export interface ClassifyInput {
  direction: Direction;
  engine: {
    txnType?: unknown;
    /** Resolved COA id of the engine's account code (null = not given / not usable). */
    accountId?: string | null;
    /** Why the engine's account could not be used (unknown code, group account…). */
    accountProblem?: string | null;
    confidence?: unknown;
    reason?: unknown;
  };
  learned: LearnedMapEntry | null;
  learnedAccountLabel?: string | null;
  engineAccountLabel?: string | null;
  cashAccountId: string;
  advanceAccountId: string | null;
  defaultExpenseAccountId: string | null;
  defaultIncomeAccountId: string | null;
}

export type ClassifySource = 'engine' | 'learned' | 'advance' | 'default' | 'none';

export interface ClassifyResult {
  txnType: TxnType;
  accountId: string | null;
  confidence: number;
  needsReview: boolean;
  reason: string | null;
  source: ClassifySource;
  contradiction: boolean;
}

/** Deterministic classification of one row (see file header for the journal rules). */
export function classifyRow(input: ClassifyInput): ClassifyResult {
  const { direction, engine } = input;
  const reasons: string[] = [];
  if (typeof engine.reason === 'string' && engine.reason.trim()) reasons.push(engine.reason.trim().slice(0, 200));
  let confidence = clampConfidence(engine.confidence);

  // The cash direction decides txnType, never the engine's type.
  let engineType: TxnType | null = null;
  if (isTxnType(engine.txnType)) engineType = engine.txnType;
  else if (engine.txnType !== undefined && engine.txnType !== null && engine.txnType !== '') {
    reasons.push(`jenis transaksi "${String(engine.txnType)}" tidak dikenal; diperkirakan dari arah kas`);
  }
  let txnType: TxnType = engineType ?? defaultTxnType(direction);
  let contradiction = false;
  let engineAccountId = engine.accountId ?? null;
  if (engineType && !txnTypeFits(engineType, direction)) {
    contradiction = true;
    txnType = coerceTxnType(engineType, direction);
    reasons.push(`jenis "${engineType}" tidak cocok dengan arah kas ${direction}; dikoreksi menjadi "${txnType}"`);
    confidence = Math.min(confidence, 0.5);
    // The account was chosen for the wrong kind of transaction (e.g. a revenue account for a cash-out row):
    // never carry it over, fall back to learned map / default account for the real direction.
    engineAccountId = null;
  }
  if (engineAccountId && engineAccountId === input.cashAccountId) {
    reasons.push('akun lawan sama dengan akun kas; diabaikan');
    engineAccountId = null;
  } else if (!engineAccountId && engine.accountProblem) {
    reasons.push(engine.accountProblem);
  }

  let accountId: string | null = null;
  let source: ClassifySource = 'none';
  if (isAdvanceType(txnType)) {
    accountId = input.advanceAccountId;
    source = accountId ? 'advance' : 'none';
    if (!accountId) reasons.push('akun sistem Uang Muka Karyawan belum dipetakan (Pengaturan > Akun Sistem)');
  } else {
    const learned = input.learned && input.learned.accountId !== input.cashAccountId ? input.learned : null;
    if (engineAccountId && confidence >= REVIEW_THRESHOLD) {
      accountId = engineAccountId;
      source = 'engine';
      if (learned && learned.accountId !== engineAccountId) {
        reasons.push(`pola terpelajari menyarankan ${input.learnedAccountLabel ?? 'akun lain'} (tidak diterapkan: keyakinan engine tinggi)`);
      }
    } else if (learned) {
      accountId = learned.accountId;
      source = 'learned';
      confidence = Math.max(confidence, learnedConfidence(learned.hits));
      reasons.push(`akun dari pola terpelajari (${learned.hits}x dikoreksi manusia)`);
      if (engineAccountId && engineAccountId !== learned.accountId) {
        reasons.push(`menggantikan usulan engine berkeyakinan rendah (${input.engineAccountLabel ?? 'akun lain'})`);
      }
    } else if (engineAccountId) {
      accountId = engineAccountId;
      source = 'engine';
    } else {
      const fallback = direction === 'keluar' ? input.defaultExpenseAccountId : input.defaultIncomeAccountId;
      confidence = Math.min(confidence, 0.3);
      if (fallback && fallback !== input.cashAccountId) {
        accountId = fallback;
        source = 'default';
        reasons.push(direction === 'keluar' ? 'belum terklasifikasi; akun usulan default beban lain-lain' : 'belum terklasifikasi; akun usulan default pendapatan lain-lain');
      } else {
        reasons.push('akun lawan belum dipilih');
      }
    }
  }

  const needsReview = confidence < REVIEW_THRESHOLD || txnType === 'lainnya' || contradiction || !accountId || source === 'default';
  if (txnType === 'lainnya') reasons.push('jenis "lainnya": wajib ditinjau');
  return { txnType, accountId, confidence, needsReview, reason: mergeReasons(reasons), source, contradiction };
}

// Editing (Draft only)

export interface EditState {
  direction: Direction;
  txnType: TxnType;
  accountId: string | null;
}

export interface EditPatch {
  direction?: Direction;
  txnType?: TxnType;
  /** undefined = unchanged, null = clear. */
  accountId?: string | null;
}

/** Apply a human edit with the same deterministic rules (advance types force the advance account). */
export function applyRowEdit(current: EditState, patch: EditPatch, advanceAccountId: string | null): RowResult<EditState> {
  const direction = patch.direction ?? current.direction;
  let txnType = patch.txnType ?? current.txnType;
  if (!txnTypeFits(txnType, direction)) {
    if (patch.txnType && !patch.direction) {
      return { ok: false, error: `Jenis "${txnType}" tidak cocok dengan arah kas ${direction}.` };
    }
    txnType = coerceTxnType(txnType, direction);
  }
  let accountId = patch.accountId !== undefined ? patch.accountId : current.accountId;
  if (isAdvanceType(txnType)) {
    if (!advanceAccountId) return { ok: false, error: 'Akun sistem "Uang Muka Karyawan" belum dipetakan (Pengaturan > Akun Sistem).' };
    accountId = advanceAccountId;
  } else if (isAdvanceType(current.txnType) && patch.accountId === undefined && accountId === advanceAccountId) {
    accountId = null; // left an advance type: the user must pick the counter account
  }
  return { ok: true, value: { direction, txnType, accountId } };
}

// Journal

export interface JournalLineDraft {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface PostableRow {
  direction: string;
  txnType: string;
  amount: Decimal.Value;
  accountId: string | null;
  description: string;
}

/** The one balanced journal of a row. Never trusts txnType for the direction. */
export function buildRowJournalLines(
  row: PostableRow,
  cashAccountId: string,
  narration: string,
): RowResult<JournalLineDraft[]> {
  if (!isDirection(row.direction)) return { ok: false, error: 'Arah baris tidak valid.' };
  if (!isTxnType(row.txnType) || !txnTypeFits(row.txnType, row.direction)) {
    return { ok: false, error: `Jenis transaksi tidak cocok dengan arah kas ${row.direction}.` };
  }
  const amount = roundMoney(row.amount);
  if (!amount.gt(0)) return { ok: false, error: 'Nominal harus lebih dari 0.' };
  if (!row.accountId) return { ok: false, error: 'Akun lawan belum dipilih.' };
  if (row.accountId === cashAccountId) return { ok: false, error: 'Akun lawan tidak boleh sama dengan akun kas.' };
  const n = amount.toNumber();
  const desc = row.description.slice(0, 250);
  const lines: JournalLineDraft[] =
    row.direction === 'keluar'
      ? [
          { accountId: row.accountId, debit: n, credit: 0, description: desc },
          { accountId: cashAccountId, debit: 0, credit: n, description: narration.slice(0, 250) },
        ]
      : [
          { accountId: cashAccountId, debit: n, credit: 0, description: narration.slice(0, 250) },
          { accountId: row.accountId, debit: 0, credit: n, description: desc },
        ];
  return { ok: true, value: lines };
}

// Totals / balance check

export interface TotalsRow {
  amount: Decimal.Value;
  direction: string;
  skip: boolean;
}

export interface Totals {
  masuk: number;
  keluar: number;
  rowCount: number;
  activeCount: number;
}

export function computeTotals(rows: readonly TotalsRow[]): Totals {
  let masuk = new Decimal(0);
  let keluar = new Decimal(0);
  let active = 0;
  for (const r of rows) {
    if (r.skip) continue;
    active += 1;
    if (r.direction === 'masuk') masuk = masuk.plus(r.amount);
    else if (r.direction === 'keluar') keluar = keluar.plus(r.amount);
  }
  return { masuk: roundMoney(masuk).toNumber(), keluar: roundMoney(keluar).toNumber(), rowCount: rows.length, activeCount: active };
}

export interface BalanceCheck {
  checked: boolean;
  expectedClosing: number | null;
  difference: number | null;
  ok: boolean;
  warning: string | null;
}

const fmtIdr = (n: number): string => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** opening + Σmasuk − Σkeluar vs closing (non-skipped rows). A warning, never a block. */
export function balanceCheck(
  opening: Decimal.Value | null | undefined,
  closing: Decimal.Value | null | undefined,
  rows: readonly TotalsRow[],
): BalanceCheck {
  if (opening === null || opening === undefined || closing === null || closing === undefined) {
    return { checked: false, expectedClosing: null, difference: null, ok: true, warning: null };
  }
  const t = computeTotals(rows);
  const expected = roundMoney(new Decimal(opening).plus(t.masuk).minus(t.keluar));
  const diff = roundMoney(new Decimal(closing).minus(expected));
  const ok = diff.isZero();
  return {
    checked: true,
    expectedClosing: expected.toNumber(),
    difference: diff.toNumber(),
    ok,
    warning: ok
      ? null
      : `Saldo akhir tidak cocok: saldo awal + masuk − keluar = ${fmtIdr(expected.toNumber())}, saldo akhir tertulis ${fmtIdr(roundMoney(closing).toNumber())} (selisih ${fmtIdr(diff.toNumber())}). Periksa baris yang terlewat atau salah baca.`,
  };
}

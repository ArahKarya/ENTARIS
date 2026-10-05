/**
 * Parse pasted rows (copied from Excel = tab separated) or a CSV file into
 * cash book rows with the columns tanggal, keterangan, masuk, keluar
 * (synonyms: debit = masuk, kredit = keluar). Amount/date strings are passed
 * through as typed; the server normalises them ("1.250.000,50", "05/10/2026").
 */
import { CB_ROW_LIMIT } from './cash-book';

export interface ParsedRow {
  /** 1-based line number in the source text (header included). */
  line: number;
  date: string;
  description: string;
  masuk: string;
  keluar: string;
  /** Problem that blocks creating the draft, if any. */
  error: string | null;
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Problems not tied to one row (empty input, missing columns, too many rows). */
  problems: string[];
  hasHeader: boolean;
}

const HEADER_SYNONYMS = {
  date: ['tanggal', 'tgl', 'date'],
  description: ['keterangan', 'uraian', 'deskripsi', 'description', 'ket'],
  masuk: ['masuk', 'debit', 'kas masuk', 'penerimaan'],
  keluar: ['keluar', 'kredit', 'kas keluar', 'pengeluaran'],
} as const;

type Field = keyof typeof HEADER_SYNONYMS;

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n');
  if (firstLines.includes('\t')) return '\t';
  const semi = (firstLines.match(/;/g) ?? []).length;
  const comma = (firstLines.match(/,/g) ?? []).length;
  return semi >= comma && semi > 0 ? ';' : ',';
}

/** Minimal RFC-4180 style tokenizer (quotes, doubled quotes, newlines in quotes). */
export function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

function mapHeader(cells: string[]): Partial<Record<Field, number>> | null {
  const found: Partial<Record<Field, number>> = {};
  cells.forEach((c, i) => {
    const n = norm(c);
    for (const field of Object.keys(HEADER_SYNONYMS) as Field[]) {
      if (found[field] === undefined && (HEADER_SYNONYMS[field] as readonly string[]).includes(n)) found[field] = i;
    }
  });
  return found.description !== undefined && (found.masuk !== undefined || found.keluar !== undefined) ? found : null;
}

/** "" / "-" / "0" / "0,00" all mean "no amount". */
export const isBlankAmount = (s: string): boolean => /^[\s\-–.,0]*$/.test(s);

export function parseCashBookText(text: string): ParseResult {
  const input = text.trim();
  if (!input) return { rows: [], problems: ['Belum ada data. Tempel baris dari Excel atau pilih berkas CSV.'], hasHeader: false };
  const table = tokenize(input, detectDelimiter(input));
  if (table.length === 0) return { rows: [], problems: ['Data kosong.'], hasHeader: false };

  const header = mapHeader(table[0]);
  const cols: Record<Field, number> = header
    ? { date: header.date ?? -1, description: header.description ?? 1, masuk: header.masuk ?? -1, keluar: header.keluar ?? -1 }
    : { date: 0, description: 1, masuk: 2, keluar: 3 };
  const body = header ? table.slice(1) : table;
  const problems: string[] = [];
  if (!header && table[0].length < 3) problems.push('Kolom tidak dikenali. Pakai urutan: tanggal, keterangan, masuk, keluar (atau beri baris judul).');

  const cell = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '');
  const rows: ParsedRow[] = body.map((r, i) => {
    const line = i + 1 + (header ? 1 : 0);
    const description = cell(r, cols.description);
    const masuk = cell(r, cols.masuk);
    const keluar = cell(r, cols.keluar);
    let error: string | null = null;
    if (!description) error = 'Keterangan kosong';
    else if (isBlankAmount(masuk) && isBlankAmount(keluar)) error = 'Isi nominal masuk atau keluar';
    else if (!isBlankAmount(masuk) && !isBlankAmount(keluar)) error = 'Isi salah satu saja: masuk atau keluar';
    return { line, date: cell(r, cols.date), description, masuk: isBlankAmount(masuk) ? '' : masuk, keluar: isBlankAmount(keluar) ? '' : keluar, error };
  });
  if (rows.length === 0) problems.push('Tidak ada baris data setelah baris judul.');
  if (rows.length > CB_ROW_LIMIT) problems.push(`Maksimal ${CB_ROW_LIMIT} baris per draft (ada ${rows.length}). Pecah menjadi beberapa draft.`);
  return { rows, problems, hasHeader: !!header };
}

/** Rows as the create endpoint expects them. */
export function toCreateRows(rows: readonly ParsedRow[]): Array<Record<string, string>> {
  return rows.map((r) => ({
    ...(r.date ? { date: r.date } : {}),
    description: r.description,
    ...(r.masuk ? { masuk: r.masuk } : {}),
    ...(r.keluar ? { keluar: r.keluar } : {}),
  }));
}

export const hasBlockingProblems = (res: ParseResult): boolean => res.problems.length > 0 || res.rows.length === 0 || res.rows.some((r) => r.error);

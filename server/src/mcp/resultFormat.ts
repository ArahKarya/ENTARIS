// Bentuk hasil handler → hasil MCP: redaksi rahasia, pemotongan ukuran, petunjuk paginasi,
// pesan error Indonesia dari upstream (apa adanya, tanpa membocorkan stack).

import { redactSecrets } from '../utils/redact';
import { MAX_RESULT_CHARS } from './constants';
import type { HandlerResult } from './execute';

export interface AgentResult {
  isError: boolean;
  structured: Record<string, unknown>;
  text: string;
}

const ARRAY_KEYS = ['data', 'items', 'rows', 'entries', 'results', 'records'];

function findArrayHolder(data: unknown): { holder: Record<string, unknown>; key: string } | { holder: null; key: null } {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const k of ARRAY_KEYS) if (Array.isArray(obj[k])) return { holder: obj, key: k };
    // Array terbesar di level atas.
    let best: string | null = null;
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v) && (best === null || v.length > (obj[best] as unknown[]).length)) best = k;
    if (best) return { holder: obj, key: best };
  }
  return { holder: null, key: null };
}

function paginationMeta(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const d = data as Record<string, unknown>;
  const src = (d.pagination && typeof d.pagination === 'object' ? d.pagination : d) as Record<string, unknown>;
  const page = Number(src.page);
  const limit = Number(src.limit);
  const total = Number(src.total);
  if (!Number.isFinite(page) || !Number.isFinite(limit) || !Number.isFinite(total) || limit <= 0) return undefined;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < totalPages;
  return {
    page, limit, total, totalPages, hasMore,
    hint: hasMore ? `Halaman ${page} dari ${totalPages}. Panggil lagi dengan page=${page + 1} (atau persempit filter / kecilkan limit).` : `Halaman terakhir (${page} dari ${totalPages}).`,
  };
}

function size(x: unknown): number {
  return JSON.stringify(x).length;
}

/** Potong data agar JSON hasil ≤ maxChars. Mengembalikan data baru + keterangan. */
export function truncateData(data: unknown, maxChars: number): { data: unknown; truncated?: Record<string, unknown> } {
  if (size(data) <= maxChars) return { data };
  if (Array.isArray(data)) {
    let n = data.length;
    while (n > 1 && size(data.slice(0, n)) > maxChars) n = Math.floor(n / 2);
    return { data: data.slice(0, n), truncated: { shown: n, total: data.length, notice: `Hasil dipotong: ${n} dari ${data.length} baris. Gunakan filter atau paginasi (page/limit).` } };
  }
  const { holder, key } = findArrayHolder(data);
  if (holder && key) {
    const arr = holder[key] as unknown[];
    let n = arr.length;
    const build = (k: number) => ({ ...holder, [key]: arr.slice(0, k) });
    while (n > 1 && size(build(n)) > maxChars) n = Math.floor(n / 2);
    return { data: build(n), truncated: { field: key, shown: n, total: arr.length, notice: `Hasil dipotong: ${n} dari ${arr.length} baris pada '${key}'. Gunakan filter atau paginasi (page/limit).` } };
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return { data: text.slice(0, maxChars), truncated: { shown: maxChars, total: text.length, notice: `Hasil dipotong pada ${maxChars} dari ${text.length} karakter.` } };
}

function upstreamMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    const m = o.error ?? o.message ?? o.detail;
    if (typeof m === 'string' && m) return m;
    if (m && typeof m === 'object') return JSON.stringify(m).slice(0, 500);
  }
  if (typeof data === 'string' && data) return data.slice(0, 500);
  if (status === 403) return 'Akses ditolak: Tidak memiliki izin.';
  if (status === 404) return 'Data tidak ditemukan.';
  return `Permintaan ditolak oleh sistem (HTTP ${status}).`;
}

export function formatHandlerResult(res: HandlerResult, maxChars: number = MAX_RESULT_CHARS): AgentResult {
  const b = res.body;
  let data: unknown;
  if (b.kind === 'json') data = redactSecrets(b.data);
  else if (b.kind === 'text') data = b.data;
  else if (b.kind === 'binary') data = { notice: `Respons berkas (${b.contentType}, ${b.bytes} byte) tidak dapat ditampilkan lewat MCP. Unduh lewat aplikasi Entaris.` };
  else data = null;

  if (!res.ok) {
    const error = upstreamMessage(res.status, data);
    const structured = { ok: false, status: res.status, error, ...(res.status >= 400 && res.status < 500 && data && typeof data === 'object' ? { details: data } : {}) };
    return { isError: true, structured, text: `Gagal (HTTP ${res.status}): ${error}` };
  }

  const cut = truncateData(data, maxChars);
  const pagination = paginationMeta(cut.data);
  const structured: Record<string, unknown> = {
    ok: true,
    status: res.status,
    data: cut.data,
    ...(cut.truncated ? { truncated: cut.truncated } : {}),
    ...(pagination ? { pagination } : {}),
  };
  return { isError: false, structured, text: JSON.stringify(structured) };
}

/**
 * airaApproval.ts — Verifier A3 (HMAC-SHA256 ber-runId + timestamp).
 *
 * Setiap request write/critical dari AIRA ke ERP Tool Router WAJIB membawa
 * 3 header A3:
 *   X-AIRA-Run : <runId>   — UUID unik per-run AIRA (sekali pakai)
 *   X-AIRA-Ts  : <epoch>   — Unix timestamp detik saat sign
 *   X-AIRA-Sig : <hmac>    — HMAC-SHA256 hex dari message berikut:
 *                            `${tool}|${sha256(canonicalArgs)}|${runId}|${ts}`
 *
 * Perlindungan:
 *   - Timestamp kadaluarsa ±5 menit (anti basi / delayed replay).
 *   - runId sekali pakai (cek tabel ai_executed_runs → anti replay eksak).
 *   - Signature ngiket tool + args + runId + ts (anti tamper + anti forge).
 *   - timingSafeEqual (anti timing attack).
 */

import crypto from 'crypto';
import type { Request } from 'express';
import prisma from '../lib/prisma.js';

const SKEW_MS = 5 * 60 * 1000; // ±5 menit

/** Hasil verifikasi. ok=false → respond 403, jangan fallback ke ApprovalRequest. */
export interface AiraApprovalResult {
  ok: boolean;
  reason?: string;
  runId?: string;
}

/**
 * Verifikasi header A3 dari request AIRA.
 * Dipanggil di router.ts SEBELUM memutuskan jalur eksekusi/approval.
 *
 * @param req     - Express request (cek header + env)
 * @param tool    - Nama tool (harus cocok dgn isi signature)
 * @param args    - Args tool (object, di-canonicalize sebelum hash)
 */
export async function verifyAiraApproval(
  req: Request,
  tool: string,
  args: unknown,
): Promise<AiraApprovalResult> {
  const secret = process.env.AIRA_SERVICE_SECRET;
  if (!secret) {
    return { ok: false, reason: 'AIRA_SERVICE_SECRET tidak terkonfigurasi di server.' };
  }

  const runId = req.headers['x-aira-run'] as string | undefined;
  const tsRaw = req.headers['x-aira-ts'] as string | undefined;
  const sig = req.headers['x-aira-sig'] as string | undefined;

  if (!runId || !tsRaw || !sig) {
    return { ok: false, reason: 'Header A3 tidak lengkap (x-aira-run/ts/sig).' };
  }

  // 1. Validasi timestamp
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'x-aira-ts bukan angka valid.' };
  }
  const now = Date.now();
  const tsMs = ts * 1000;
  if (Math.abs(now - tsMs) > SKEW_MS) {
    return { ok: false, reason: `Timestamp kadaluarsa (skew ${Math.round((now - tsMs) / 1000)}s > 300s).` };
  }

  // 2. Hitung signature yang diharapkan
  const canonicalArgs = canonicalize(args);
  const argsHash = crypto.createHash('sha256').update(canonicalArgs).digest('hex');
  const message = `${tool}|${argsHash}|${runId}|${ts}`;
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');

  // 3. Bandingkan dengan timing-safe
  let sigMatch = false;
  try {
    sigMatch = crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return { ok: false, reason: 'Signature format tidak valid.' };
  }
  if (!sigMatch) {
    return { ok: false, reason: 'Signature tidak cocok (A3 HMAC gagal).' };
  }

  // 4. Cek runId belum dipakai (anti-replay sekali pakai)
  const existing = await prisma.aiExecutedRun.findUnique({ where: { runId } });
  if (existing) {
    return { ok: false, reason: `runId ${runId} sudah pernah dieksekusi (anti-replay).` };
  }

  return { ok: true, runId };
}

/**
 * Catat runId sebagai sudah dieksekusi (panggil SETELAH handler berhasil).
 */
export async function recordExecutedRun(runId: string, tool: string, ref?: string): Promise<void> {
  await prisma.aiExecutedRun.create({
    data: { runId, tool, ref: ref ?? null },
  });
}

/** Canonicalize args: sort keys rekursif → JSON deterministik. */
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`)
    .join(',');
  return '{' + sorted + '}';
}

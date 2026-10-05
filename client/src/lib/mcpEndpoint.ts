/** Helper tampilan untuk Settings → AIRA (MCP): URL endpoint, header Authorization, health check. */

/** Hapus garis miring akhir & spasi; kosong tetap kosong. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function mcpUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/mcp`;
}

/** Header Authorization yang dipasang klien MCP mana pun (placeholder bila token tak diberikan). */
export function authorizationHeader(token = '<TOKEN_MCP>'): string {
  return `Authorization: Bearer ${token}`;
}

/** Cek jangkauan tanpa auth. */
export function healthCurl(baseUrl: string): string {
  return `curl -s ${mcpUrl(baseUrl)}/health`;
}

/** Contoh initialize dengan token (placeholder bila token tak diberikan). */
export function initializeCurl(baseUrl: string, token = '<TOKEN_MCP>'): string {
  const body = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}';
  return [
    `curl -s ${mcpUrl(baseUrl)} \\`,
    `  -H 'Authorization: Bearer ${token}' \\`,
    `  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \\`,
    `  -d '${body}'`,
  ].join('\n');
}

export type CallDecision = 'allowed' | 'queued' | 'denied' | 'error' | 'inflight';

export const DECISION_LABEL: Record<CallDecision, string> = {
  allowed: 'Dijalankan',
  queued: 'Menunggu persetujuan',
  denied: 'Ditolak',
  error: 'Galat',
  inflight: 'Diproses',
};

export const DECISION_TONE: Record<CallDecision, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  allowed: 'success',
  queued: 'warning',
  denied: 'danger',
  error: 'danger',
  inflight: 'info',
};

export const TIER_LABEL = { read: 'Baca saja', standard: 'Standar', direct: 'Langsung' } as const;
export type AiraTier = keyof typeof TIER_LABEL;

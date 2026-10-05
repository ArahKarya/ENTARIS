// Penanda tangan actor assertion (implementasi referensi, setara PANDUAN-KLIEN-MCP.md bagian 4).
// Dipakai agen tiruan agar seluruh putaran chat → agen → MCP dapat diuji tanpa engine sungguhan.

import { createHmac, randomUUID } from 'node:crypto';

export interface ActorClaims {
  uid: string;
  ch: 'whatsapp' | 'telegram' | 'panel' | 'cli';
  gf?: boolean;
  ref?: string;
}

export function signActor(signingSecret: string, claims: ActorClaims, nowSec: number = Math.floor(Date.now() / 1000)): Record<string, string> {
  const payload = { v: 1, uid: claims.uid, ch: claims.ch, gf: !!claims.gf, ts: nowSec, nonce: randomUUID(), ...(claims.ref ? { ref: claims.ref } : {}) };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', signingSecret).update(b64).digest('hex');
  return { 'X-Entaris-Actor': b64, 'X-Entaris-Actor-Sig': sig };
}

export interface McpCallOptions {
  baseUrl: string;
  token: string;
  signingSecret: string;
  claims: ActorClaims;
  name: string;
  args?: Record<string, unknown>;
}

/** tools/call ke /mcp dengan assertion segar; mengembalikan structuredContent (atau error). */
export async function callMcpTool(o: McpCallOptions): Promise<{ status: number; structured: Record<string, unknown> | null; isError: boolean }> {
  const res = await fetch(`${o.baseUrl.replace(/\/+$/, '')}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${o.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...signActor(o.signingSecret, o.claims),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: o.name, arguments: o.args ?? {} } }),
  });
  const body = (await res.json().catch(() => null)) as { result?: { structuredContent?: Record<string, unknown>; isError?: boolean } } | null;
  return { status: res.status, structured: body?.result?.structuredContent ?? null, isError: !!body?.result?.isError || !res.ok };
}

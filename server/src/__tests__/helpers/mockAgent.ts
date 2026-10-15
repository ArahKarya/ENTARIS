// Agen tiruan (engine-netral) untuk menguji panel chat: server HTTP kompatibel-OpenAI
// (POST /v1/chat/completions streaming SSE + non-streaming, GET /v1/models) yang merekam setiap
// permintaan dan dapat MEMANGGIL tool Entaris lewat /mcp dengan actor assertion bertanda tangan,
// persis seperti plugin sisi engine (identitas diambil dari tiket giliran / metadata permintaan).

import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { verifyTurnTicket } from '../../services/chat/turnTicket';
import { callMcpTool } from './actorSigner';

export type ToolResultRecord = { name: string; structured: Record<string, unknown> | null; isError: boolean };

export interface MockToolCall {
  name: string;
  /** argumen tetap, atau fungsi dari hasil tool sebelumnya (mis. id akun dari kas_daftar_akun) */
  args?: Record<string, unknown> | ((previous: ToolResultRecord[]) => Record<string, unknown>);
}

export interface MockBehavior {
  /** potongan teks yang dialirkan */
  chunks?: string[];
  chunkDelayMs?: number;
  /** HTTP status galat (mis. 500) sebelum streaming */
  status?: number;
  /** tool MCP yang dipanggil SEBELUM teks (hasilnya dicatat di `toolResults`) */
  toolCalls?: MockToolCall[];
  /** tahan koneksi setelah potongan terakhir (uji abort) */
  hangAfterChunks?: boolean;
  /** jawaban untuk permintaan non-streaming (ringkasan); undefined = galat 500 */
  completion?: string | null;
  /** tunda sebelum respons mulai */
  startDelayMs?: number;
  /** kartu konfirmasi (event `aira.confirm`) yang dikirim setelah teks; giliran berakhir di situ */
  confirm?: Record<string, unknown>;
}

export interface RecordedRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: {
    model?: string;
    stream?: boolean;
    user?: string;
    metadata?: Record<string, unknown>;
    messages: Array<{ role: string; content: unknown }>;
  };
  /** teks pesan system pertama (blok identitas) */
  identity: string;
  toolResults: ToolResultRecord[];
}

export interface MockAgentOptions {
  port?: number;
  apiKey?: string;
  /** rahasia tiket giliran bersama Entaris (agar hook meniru verifikasi tiket) */
  turnSecret?: string;
  mcp?: { baseUrl: string; token: string; signingSecret: string };
  behavior?: (req: RecordedRequest, index: number) => MockBehavior;
}

export interface MockAgent {
  url: string;
  port: number;
  requests: RecordedRequest[];
  setBehavior: (fn: (req: RecordedRequest, index: number) => MockBehavior) => void;
  close: () => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function readJson(req: IncomingMessage): Promise<RecordedRequest['body']> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as RecordedRequest['body'];
}

const firstText = (c: unknown): string => (typeof c === 'string' ? c : '');

function chunkJson(content: string | null, finish: string | null = null): string {
  return JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion.chunk', model: 'mock-agent', choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }] });
}

export async function startMockAgent(opts: MockAgentOptions = {}): Promise<MockAgent> {
  const apiKey = opts.apiKey ?? 'mock-key';
  const requests: RecordedRequest[] = [];
  let behavior: (req: RecordedRequest, index: number) => MockBehavior = opts.behavior ?? (() => ({ chunks: ['Halo, ', 'ini jawaban uji.'] }));
  const open = new Set<ServerResponse>();

  const server = http.createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'mock failure' } }));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.authorization !== `Bearer ${apiKey}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bad key' } }));
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-agent', object: 'model' }] }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      res.writeHead(404);
      res.end();
      return;
    }
    const body = await readJson(req);
    const rec: RecordedRequest = { path: req.url, headers: req.headers, body, identity: firstText(body.messages[0]?.content), toolResults: [] };
    const index = requests.push(rec) - 1;
    const b = behavior(rec, index);
    if (b.startDelayMs) await sleep(b.startDelayMs);

    if (b.status) {
      res.writeHead(b.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `mock error ${b.status}` } }));
      return;
    }

    // Peran hook sisi engine: identitas dari tiket giliran (diverifikasi) atau metadata.
    const ticket = typeof req.headers['x-entaris-turn'] === 'string' ? req.headers['x-entaris-turn'] : undefined;
    const verified = ticket && opts.turnSecret ? verifyTurnTicket(opts.turnSecret, ticket) : null;
    const uid = verified?.uid ?? (typeof body.metadata?.uid === 'string' ? body.metadata.uid : undefined);
    const ref = verified?.ref ?? (typeof body.metadata?.ref === 'string' ? body.metadata.ref : undefined);

    if (body.stream !== true) {
      if (b.completion === undefined || b.completion === null) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'no completion' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: b.completion }, finish_reason: 'stop' }] }));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    open.add(res);
    res.on('close', () => open.delete(res));
    res.write(': keepalive\n\n');
    for (const call of b.toolCalls ?? []) {
      if (!opts.mcp || !uid) {
        rec.toolResults.push({ name: call.name, structured: null, isError: true });
        continue;
      }
      const r = await callMcpTool({ ...opts.mcp, claims: { uid, ch: 'panel', ref }, name: call.name, args: typeof call.args === 'function' ? call.args(rec.toolResults) : call.args });
      rec.toolResults.push({ name: call.name, structured: r.structured, isError: r.isError });
    }
    for (const c of b.chunks ?? []) {
      if (res.destroyed) return;
      res.write(`data: ${chunkJson(c)}\n\n`);
      if (b.chunkDelayMs) await sleep(b.chunkDelayMs);
    }
    if (b.hangAfterChunks) return; // koneksi dibiarkan terbuka sampai klien memutus
    if (b.confirm) res.write(`event: aira.confirm\ndata: ${JSON.stringify(b.confirm)}\n\n`);
    res.write(`data: ${chunkJson(null, 'stop')}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    setBehavior: (fn) => {
      behavior = fn;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const r of open) r.destroy();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

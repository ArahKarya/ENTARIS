// Klien engine AIRA lewat API HTTP kompatibel-OpenAI (POST /v1/chat/completions, stream:true,
// Bearer key). Hanya engine-netral: tidak ada kontrak khusus produk. Basis URL & key dari ENV.

import { getEngineConfig, isEngineConfigured, type EngineConfig } from './config';

export type EngineErrorCode =
  | 'engine_not_configured'
  | 'engine_offline'
  | 'engine_timeout'
  | 'engine_auth'
  | 'engine_busy'
  | 'engine_rejected'
  | 'engine_error'
  | 'aborted';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

export interface UpstreamMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface EngineRequest {
  messages: UpstreamMessage[];
  /** id pengguna Entaris (stabil per orang) → field `user` OpenAI */
  user: string;
  metadata?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Pertanyaan balik dari AIRA (tool clarify): giliran berakhir, pilihan ditampilkan sebagai tombol. */
export interface ClarifyPrompt {
  question: string;
  choices: string[];
}

export type EngineStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'clarify'; prompt: ClarifyPrompt }
  | { type: 'done'; finishReason: string | null; model: string | null };

const MAX_CLARIFY_QUESTION = 300;
const MAX_CLARIFY_CHOICES = 4;
const MAX_CLARIFY_CHOICE = 60;

/** Bentuk aman dari event `aira.clarify` (teks dibatasi, maksimal 4 pilihan); null bila tidak sah. */
export function parseClarify(data: string): ClarifyPrompt | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { question, choices } = raw as { question?: unknown; choices?: unknown };
  if (typeof question !== 'string' || !question.trim()) return null;
  const list = Array.isArray(choices) ? choices.filter((c): c is string => typeof c === 'string' && !!c.trim()) : [];
  return {
    question: question.trim().slice(0, MAX_CLARIFY_QUESTION),
    choices: [...new Set(list.map((c) => c.trim().slice(0, MAX_CLARIFY_CHOICE)))].slice(0, MAX_CLARIFY_CHOICES),
  };
}

type FetchLike = typeof fetch;

function endpoint(cfg: EngineConfig, path: string): string {
  return `${cfg.baseUrl}${path}`;
}

function authHeaders(cfg: EngineConfig, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${cfg.apiKey}`, ...extra };
}

async function upstreamMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text) as { error?: { message?: unknown } | string };
    const m = typeof j.error === 'string' ? j.error : j.error?.message;
    if (typeof m === 'string' && m) return m.slice(0, 300);
  } catch {
    // bukan JSON
  }
  return text.slice(0, 200);
}

async function mapHttpError(res: Response): Promise<EngineError> {
  const detail = await upstreamMessage(res);
  if (res.status === 401 || res.status === 403) return new EngineError('engine_auth', 'Kunci engine AIRA ditolak. Hubungi administrator.', res.status);
  if (res.status === 429) return new EngineError('engine_busy', 'Engine AIRA sedang sibuk. Coba lagi sebentar.', res.status);
  if (res.status >= 400 && res.status < 500) return new EngineError('engine_rejected', `Engine AIRA menolak permintaan${detail ? `: ${detail}` : '.'}`, res.status);
  return new EngineError('engine_error', `Engine AIRA mengalami gangguan (HTTP ${res.status}).`, res.status);
}

interface Idle {
  controller: AbortController;
  arm: () => void;
  stop: () => void;
  timedOut: () => boolean;
}

function idleGuard(timeoutMs: number, external?: AbortSignal): Idle {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const arm = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  const stop = (): void => {
    if (timer) clearTimeout(timer);
    external?.removeEventListener('abort', onExternal);
  };
  const onExternal = (): void => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternal, { once: true });
  }
  arm();
  return { controller, arm, stop, timedOut: () => timedOut };
}

function wrapFetchError(err: unknown, idle: Idle, external?: AbortSignal): EngineError {
  if (err instanceof EngineError) return err;
  if (idle.timedOut()) return new EngineError('engine_timeout', 'Engine AIRA tidak merespons tepat waktu.');
  if (external?.aborted || (err as Error)?.name === 'AbortError') return new EngineError('aborted', 'Permintaan dibatalkan.');
  return new EngineError('engine_offline', 'Engine AIRA tidak dapat dihubungi.');
}

function parseSseBlock(block: string): { event: string; data: string } {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // komentar keepalive
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return { event, data: data.join('\n') };
}

interface ChatChunk {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }>;
  model?: string;
  error?: { message?: unknown } | string;
}

/** Stream chat completion; menghasilkan delta teks lalu satu event `done`. */
export async function* streamChat(req: EngineRequest, cfg: EngineConfig = getEngineConfig(), fetchImpl: FetchLike = fetch): AsyncGenerator<EngineStreamEvent> {
  if (!isEngineConfigured(cfg)) throw new EngineError('engine_not_configured', 'Engine AIRA belum dikonfigurasi (AIRA_ENGINE_URL / AIRA_ENGINE_KEY).');
  const idle = idleGuard(cfg.timeoutMs, req.signal);
  try {
    let res: Response;
    try {
      res = await fetchImpl(endpoint(cfg, '/v1/chat/completions'), {
        method: 'POST',
        headers: authHeaders(cfg, { 'content-type': 'application/json', accept: 'text/event-stream', ...req.headers }),
        body: JSON.stringify({ model: cfg.model, messages: req.messages, stream: true, user: req.user, ...(req.metadata ? { metadata: req.metadata } : {}) }),
        signal: idle.controller.signal,
      });
    } catch (err) {
      throw wrapFetchError(err, idle, req.signal);
    }
    if (!res.ok) throw await mapHttpError(res);
    if (!res.body) throw new EngineError('engine_error', 'Engine AIRA tidak mengirim aliran jawaban.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finish: string | null = null;
    let model: string | null = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        idle.arm();
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const { event, data } = parseSseBlock(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
          if (event === 'aira.clarify') {
            const prompt = parseClarify(data);
            if (prompt) yield { type: 'clarify', prompt };
            continue;
          }
          if (event !== 'message' || !data) continue; // event kustom engine lain (progres tool, status) diabaikan
          if (data === '[DONE]') {
            yield { type: 'done', finishReason: finish, model };
            return;
          }
          let chunk: ChatChunk;
          try {
            chunk = JSON.parse(data) as ChatChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            const m = typeof chunk.error === 'string' ? chunk.error : chunk.error.message;
            throw new EngineError('engine_error', `Engine AIRA melaporkan galat${typeof m === 'string' && m ? `: ${m.slice(0, 200)}` : '.'}`);
          }
          if (typeof chunk.model === 'string') model = chunk.model;
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finish = choice.finish_reason;
          const text = choice?.delta?.content;
          if (typeof text === 'string' && text) yield { type: 'delta', text };
        }
      }
    } catch (err) {
      throw wrapFetchError(err, idle, req.signal);
    }
    yield { type: 'done', finishReason: finish, model };
  } finally {
    idle.stop();
  }
}

/** Satu panggilan non-streaming (ringkasan). Mengembalikan teks jawaban. */
export async function completeChat(
  req: Omit<EngineRequest, 'metadata'> & { metadata?: Record<string, unknown>; timeoutMs?: number },
  cfg: EngineConfig = getEngineConfig(),
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (!isEngineConfigured(cfg)) throw new EngineError('engine_not_configured', 'Engine AIRA belum dikonfigurasi.');
  const idle = idleGuard(req.timeoutMs ?? Math.min(cfg.timeoutMs, 60_000), req.signal);
  try {
    let res: Response;
    try {
      res = await fetchImpl(endpoint(cfg, '/v1/chat/completions'), {
        method: 'POST',
        headers: authHeaders(cfg, { 'content-type': 'application/json', ...req.headers }),
        body: JSON.stringify({ model: cfg.model, messages: req.messages, stream: false, user: req.user, ...(req.metadata ? { metadata: req.metadata } : {}) }),
        signal: idle.controller.signal,
      });
    } catch (err) {
      throw wrapFetchError(err, idle, req.signal);
    }
    if (!res.ok) throw await mapHttpError(res);
    const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new EngineError('engine_error', 'Engine AIRA mengembalikan jawaban kosong.');
    return content.trim();
  } catch (err) {
    throw wrapFetchError(err, idle, req.signal);
  } finally {
    idle.stop();
  }
}

export interface EngineHealth {
  configured: boolean;
  online: boolean;
  latencyMs: number | null;
  reason?: 'not_configured' | 'auth' | 'unreachable' | 'timeout' | 'error';
}

/** Pemeriksaan ringan (GET /v1/models, timeout pendek). Tidak pernah melempar. */
export async function checkHealth(cfg: EngineConfig = getEngineConfig(), fetchImpl: FetchLike = fetch, timeoutMs = 3_000): Promise<EngineHealth> {
  if (!isEngineConfigured(cfg)) return { configured: false, online: false, latencyMs: null, reason: 'not_configured' };
  const started = Date.now();
  try {
    const res = await fetchImpl(endpoint(cfg, '/v1/models'), { method: 'GET', headers: authHeaders(cfg), signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - started;
    if (res.ok) return { configured: true, online: true, latencyMs };
    return { configured: true, online: false, latencyMs, reason: res.status === 401 || res.status === 403 ? 'auth' : 'error' };
  } catch (err) {
    const timeout = (err as Error)?.name === 'TimeoutError';
    return { configured: true, online: false, latencyMs: null, reason: timeout ? 'timeout' : 'unreachable' };
  }
}

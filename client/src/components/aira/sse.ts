// Pembaca SSE untuk POST /api/ai/chat/stream (fetch + ReadableStream; EventSource tak bisa POST).

import i18n from '@/i18n';
import type { StreamEvent, ConfirmChoice } from './types';

export class StreamHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StreamHttpError';
    this.status = status;
    this.code = code;
  }
}

/** Pecah buffer menjadi blok event lengkap + sisa. Murni agar mudah diuji. */
export function splitSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: StreamEvent[] = [];
  for (const block of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) } as StreamEvent);
    } catch {
      // blok rusak diabaikan
    }
  }
  return { events, rest };
}

function csrfToken(): string | undefined {
  return document.cookie.split('; ').find((c) => c.startsWith('csrf-token='))?.split('=')[1];
}

export interface StreamRequest {
  input: string;
  sessionId?: string;
  retryMessageId?: string;
  file?: File;
  /** jawaban atas kartu konfirmasi AIRA */
  confirm?: { id: string; choice: ConfirmChoice };
}

/** Mulai giliran; melempar StreamHttpError untuk penolakan JSON (400/403/404/409/429). */
export async function* streamTurn(req: StreamRequest, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const csrf = csrfToken();
  let init: RequestInit;
  if (req.file) {
    const fd = new FormData();
    fd.append('input', req.input);
    if (req.sessionId) fd.append('session_id', req.sessionId);
    if (req.retryMessageId) fd.append('retry_message_id', req.retryMessageId);
    fd.append('file', req.file, req.file.name);
    init = { method: 'POST', body: fd };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: req.input,
        session_id: req.sessionId,
        retry_message_id: req.retryMessageId,
        ...(req.confirm ? { konfirmasi_id: req.confirm.id, konfirmasi_pilihan: req.confirm.choice } : {}),
      }),
    };
  }
  const res = await fetch('/api/ai/chat/stream', {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    credentials: 'include',
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new StreamHttpError(res.status, body?.error ?? 'http_error', body?.message ?? i18n.t('aira:conversation.requestFailed', { status: res.status }));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSse(buffer);
    buffer = rest;
    for (const e of events) yield e;
  }
}

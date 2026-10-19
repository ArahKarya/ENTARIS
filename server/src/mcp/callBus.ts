// Bus in-process untuk panggilan tool MCP: panel chat berlangganan per `ref` (`<sessionId>:<turnId>`)
// agar progres tool & kartu hasil muncul seketika. Replika lain tak terjangkau bus ini; panel
// juga mem-polling mcp_call_logs (fallback), jadi bus hanyalah jalur cepat.

import { EventEmitter } from 'node:events';

export interface CallStartEvent {
  phase: 'start';
  ref: string;
  tool: string;
}

export interface CallEndEvent {
  phase: 'end';
  ref: string;
  tool: string;
  risk: string;
  decision: string;
  callId?: string;
  durationMs: number;
  error?: string | null;
  card?: Record<string, unknown> | null;
}

export type CallEvent = CallStartEvent | CallEndEvent;

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function emitCall(e: CallEvent): void {
  try {
    bus.emit('call', e);
  } catch {
    // pendengar tidak boleh menggagalkan panggilan tool
  }
}

/** Berlangganan semua panggilan; mengembalikan fungsi berhenti. */
export function onCall(listener: (e: CallEvent) => void): () => void {
  bus.on('call', listener);
  return () => bus.off('call', listener);
}

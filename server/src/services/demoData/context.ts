import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import type { DemoActor, DemoApi } from './api';
import type { DemoMasterTable } from './tables';

/** Days covered by the demo, ending today. Split into three 30-day windows (oldest first). */
export const DEMO_SPAN_DAYS = 90;
export const WINDOW_DAYS = 30;

export interface DemoItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  sellPrice: number;
  cost: number;
}

export interface DemoContext {
  api: DemoApi;
  batchId: string;
  admin: DemoActor;
  /** A user whose role must go through approvals; null when the company has none. */
  staff: DemoActor | null;
  today: Date;
  accounts: { cash: string; bank: string; openingEquity: string; salary: string; utilities: string; serviceRevenue: string };
  warehouses: { plant: string; distribution: string };
  parties: Record<string, string>;
  items: Record<string, DemoItem>;
  serviceItems: Record<string, { id: string; name: string; rate: number }>;
  /** Temporary delivery note waiting to be linked to the next delivery order, if any. */
  temporaryNote: string | null;
  /** Track a master row the demo created so deleting demo data removes it. */
  record(table: DemoMasterTable | 'fiscal_years', id: string): Promise<void>;
  /** Log a step that was skipped because it does not apply to this company. */
  skip(step: string, reason: string): void;
  /**
   * Queue a dated event. The runner executes all events in date order (then queue order), so stock,
   * WAC and payment allocation see documents in the same order a real company would create them.
   * Events dated after today are dropped.
   */
  schedule(date: Date, label: string, run: () => Promise<void>): void;
}

export interface DemoEvent {
  date: Date;
  label: string;
  seq: number;
  run: () => Promise<void>;
}

export function makeScheduler(today: Date, queue: DemoEvent[]): DemoContext['schedule'] {
  return (date, label, run) => {
    if (date.getTime() > today.getTime()) return;
    queue.push({ date, label, seq: queue.length, run });
  };
}

export function sortEvents(queue: DemoEvent[]): DemoEvent[] {
  return [...queue].sort((a, b) => a.date.getTime() - b.date.getTime() || a.seq - b.seq);
}

export function makeRecorder(batchId: string): DemoContext['record'] {
  return async (table, id) => {
    await prisma.demoDataRecord.create({ data: { batchId, model: table, recordId: id } });
  };
}

export function makeSkipper(batchId: string): DemoContext['skip'] {
  return (step, reason) => logger.warn({ batchId, step, reason }, 'Demo data step skipped');
}

/** 'YYYY-MM-DD' in server local time (document numbers and fiscal years use local dates). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + days);
  return r;
}

/** Date `day` (0-29) inside window `w` (0 = oldest, 2 = the last 30 days). */
export function windowDate(ctx: Pick<DemoContext, 'today'>, w: number, day: number): Date {
  const start = addDays(ctx.today, -DEMO_SPAN_DAYS + w * WINDOW_DAYS);
  return addDays(start, day);
}

export function isPast(ctx: Pick<DemoContext, 'today'>, d: Date): boolean {
  return d.getTime() <= ctx.today.getTime();
}

export const num = (v: unknown): number => Number(v ?? 0);

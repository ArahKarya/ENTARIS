import { describe, it, expect } from 'vitest';
import { calcWeightedAverage } from '../weightedAverage';
import {
  replayWeightedAverage,
  sortMovementsForReplay,
  type ReplayMovement,
  type ReplayMovementType,
} from '../weightedAverageReplay';

let seq = 0;
const mv = (
  movementType: ReplayMovementType,
  quantity: number,
  unitCost: number,
  extra: Partial<ReplayMovement> = {},
): ReplayMovement => {
  seq += 1;
  return {
    id: `m${String(seq).padStart(6, '0')}`,
    movementType,
    quantity,
    unitCost,
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 1000),
    ...extra,
  };
};

/** Independent re-implementation of the LIVE incremental paths (state = stock, avg). */
interface Live { stock: number; avg: number }
function applyLive(s: Live, m: ReplayMovement): Live {
  const q = Number(m.quantity);
  const c = Number(m.unitCost);
  switch (m.movementType) {
    case 'In':
      if (m.referenceType === 'SalesReturn') return { stock: s.stock + q, avg: s.avg }; // restock, avg untouched
      return { stock: s.stock + q, avg: c > 0 ? calcWeightedAverage(s.stock, s.avg, q, c) : s.avg };
    case 'AdjustmentIn':
      if (m.referenceType === 'StockOpname') return { stock: s.stock + q, avg: s.avg };
      return { stock: s.stock + q, avg: c > 0 ? calcWeightedAverage(s.stock, s.avg, q, c) : s.avg };
    case 'TransferIn':
      return { stock: s.stock + q, avg: s.avg };
    default: // Out, AdjustmentOut, TransferOut
      return { stock: s.stock - q, avg: s.avg };
  }
}
const live = (ms: ReplayMovement[], start: Live = { stock: 0, avg: 0 }) => ms.reduce(applyLive, start);

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSequence(rand: () => number, n: number): ReplayMovement[] {
  const out: ReplayMovement[] = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    const qty = 1 + Math.floor(rand() * 500);
    const cost = Math.round((500 + rand() * 12000) * 100) / 100;
    if (r < 0.25) out.push(mv('In', qty, cost, { referenceType: 'GoodsReceipt' }));
    else if (r < 0.4) out.push(mv('In', qty, cost, { referenceType: 'ProductionRun' }));
    else if (r < 0.5) out.push(mv('AdjustmentIn', qty, rand() < 0.2 ? 0 : cost));
    else if (r < 0.55) out.push(mv('In', qty, cost, { referenceType: 'SalesReturn' }));
    else if (r < 0.6) out.push(mv('AdjustmentIn', qty, cost, { referenceType: 'StockOpname' }));
    else if (r < 0.65) out.push(mv('In', qty, 0, { referenceType: 'GoodsReceipt' })); // customer-owned
    else if (r < 0.9) out.push(mv('Out', qty, 0, { referenceType: rand() < 0.5 ? 'ProductionRun' : null }));
    else if (r < 0.95) out.push(mv('AdjustmentOut', qty, 0));
    else {
      out.push(mv('TransferOut', qty, cost));
      out.push(mv('TransferIn', qty, cost));
    }
  }
  return out;
}

describe('replayWeightedAverage - basics', () => {
  it('matches the incremental formula for plain inbound', () => {
    const ms = [mv('In', 100, 10), mv('In', 100, 20)];
    const r = replayWeightedAverage(ms, { fallbackAverageCost: 0 });
    expect(r.averageCost).toBe(15);
    expect(r.stock).toBe(200);
    expect(r.hasCostedInbound).toBe(true);
  });

  it('outbound changes the stock base, not the average', () => {
    const ms = [mv('In', 100, 10), mv('Out', 90, 10), mv('In', 100, 20)];
    // stock before 2nd In = 10 -> (10*10 + 100*20)/110 = 19.09, NOT 15
    expect(replayWeightedAverage(ms, { fallbackAverageCost: 0 }).averageCost).toBe(19.09);
  });

  it('negative-stock window anchors to the incoming cost', () => {
    const ms = [mv('In', 10, 100), mv('Out', 30, 100), mv('In', 50, 300)];
    expect(replayWeightedAverage(ms, { fallbackAverageCost: 0 }).averageCost).toBe(300);
  });

  it('skips cancelled movements and sorts by createdAt then id regardless of input order', () => {
    const a = mv('In', 100, 10);
    const b = mv('In', 100, 30, { isCancelled: true });
    const c = mv('Out', 50, 10);
    const d = mv('In', 50, 20);
    const forward = replayWeightedAverage([a, b, c, d], { fallbackAverageCost: 0 });
    const shuffled = replayWeightedAverage([d, c, b, a], { fallbackAverageCost: 0 });
    expect(forward).toEqual(shuffled);
    expect(forward.averageCost).toBe(15); // (50*10 + 50*20)/100
  });

  it('breaks createdAt ties by id', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const x = { ...mv('In', 10, 10), id: 'b', createdAt: t };
    const y = { ...mv('In', 10, 30), id: 'a', createdAt: t };
    expect(sortMovementsForReplay([x, y]).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('keeps the last known cost when no costed inbound remains (never zeroes)', () => {
    const none = replayWeightedAverage([mv('In', 5, 10, { isCancelled: true })], { fallbackAverageCost: 777.5 });
    expect(none.averageCost).toBe(777.5);
    expect(none.hasCostedInbound).toBe(false);
    const onlyOut = replayWeightedAverage([mv('Out', 5, 0)], { fallbackAverageCost: 12 });
    expect(onlyOut.averageCost).toBe(12);
  });

  it('zero-cost inbound and stock-only paths never dilute the average', () => {
    const ms = [
      mv('In', 100, 10),
      mv('In', 500, 0, { referenceType: 'GoodsReceipt' }),
      mv('In', 50, 99, { referenceType: 'SalesReturn' }),
      mv('AdjustmentIn', 50, 99, { referenceType: 'StockOpname' }),
      mv('TransferOut', 20, 10),
      mv('TransferIn', 20, 10),
    ];
    const r = replayWeightedAverage(ms, { fallbackAverageCost: 0 });
    expect(r.averageCost).toBe(10);
    expect(r.stock).toBe(700);
  });

  it('does not mutate its input', () => {
    const ms = [mv('Out', 1, 0), mv('In', 5, 10)];
    const copy = JSON.stringify(ms);
    replayWeightedAverage(ms, { fallbackAverageCost: 0 });
    expect(JSON.stringify(ms)).toBe(copy);
  });
});

describe('replayWeightedAverage - property: replay == incremental', () => {
  it('matches incremental apply for 500 random sequences (shuffled input)', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = mulberry32(seed);
      const ms = randomSequence(rand, 5 + Math.floor(rand() * 40));
      const expected = live(ms);
      const shuffled = [...ms].sort(() => rand() - 0.5);
      const r = replayWeightedAverage(shuffled, { fallbackAverageCost: 0 });
      expect(r.stock).toBeCloseTo(expected.stock, 6);
      // Incremental path rounds avg to 2dp at every step; replay rounds identically.
      expect(r.averageCost).toBeCloseTo(expected.avg, 2);
    }
  });

  it('cancel of an earlier movement: live-up-to-cancel, replay-at-cancel, live-after == replay of all', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rand = mulberry32(10_000 + seed);
      const ms = randomSequence(rand, 8 + Math.floor(rand() * 40));
      const cancelAt = 3 + Math.floor(rand() * (ms.length - 3));
      const victimIdx = Math.floor(rand() * cancelAt);

      // Live world: process up to cancelAt, then the victim is cancelled and the
      // production code replays; then processing continues incrementally.
      const before = ms.slice(0, cancelAt);
      const afterCancel = before.map((m, i) => (i === victimIdx ? { ...m, isCancelled: true } : m));
      const replayed = replayWeightedAverage(afterCancel, { fallbackAverageCost: 0 });
      const cont = ms.slice(cancelAt).reduce(applyLive, { stock: replayed.stock, avg: replayed.averageCost });

      const full = ms.map((m, i) => (i === victimIdx ? { ...m, isCancelled: true } : m));
      const whole = replayWeightedAverage(full, { fallbackAverageCost: 0 });
      expect(whole.stock).toBeCloseTo(cont.stock, 6);
      expect(whole.averageCost).toBeCloseTo(cont.avg, 2);

      // And equals incremental apply of the sequence without the victim.
      const without = live(ms.filter((_, i) => i !== victimIdx));
      expect(whole.averageCost).toBeCloseTo(without.avg, 2);
    }
  });

  it('the old "average all inbound" shortcut is demonstrably wrong on the same data', () => {
    const ms = [mv('In', 100, 10), mv('Out', 90, 10), mv('In', 100, 20)];
    const replay = replayWeightedAverage(ms, { fallbackAverageCost: 0 }).averageCost;
    const oneShot = (100 * 10 + 100 * 20) / 200;
    expect(replay).not.toBe(oneShot);
  });
});

describe('fixture: dev DB "Beras Premium" (production cancel jumped 2330.15 -> 11500)', () => {
  // Dev history (quantities from keuangan_db): 6 sales Outs @12000 totalling 3381,
  // AdjustmentIn 850 @11500 ("Data uji dashboard"), 3 production-run Ins
  // 60/90/72 @6135.03. Stock 4195 is NOT explained by movements: 6726 kg was
  // present before any movement (dummy generator writes stock without movements),
  // modelled here as the opening base at the stored average 2330.15.
  const opening = { openingStock: 6726, openingAverageCost: 2330.15 };
  const outs = [643, 611, 694, 421, 577, 435].map((q) => mv('Out', q, 12000));
  const adj = mv('AdjustmentIn', 850, 11500);
  const runs = [60, 90, 72].map((q) => mv('In', q, 6135.03, { referenceType: 'ProductionRun' }));
  const history = [...outs, adj, ...runs];

  it('old behaviour (average ALL active inbound) jumps to 11500 once the runs are cancelled', () => {
    const activeInbound = [adj]; // runs cancelled
    const oneShot = activeInbound.reduce((v, m) => v + Number(m.quantity) * Number(m.unitCost), 0)
      / activeInbound.reduce((q, m) => q + Number(m.quantity), 0);
    expect(oneShot).toBe(11500);
  });

  it('replay: before/after cancelling the three runs stays near the running average (no jump to 11500)', () => {
    const before = replayWeightedAverage(history, { fallbackAverageCost: 2330.15, ...opening });
    const afterCancel = replayWeightedAverage(
      history.map((m) => (runs.includes(m) ? { ...m, isCancelled: true } : m)),
      { fallbackAverageCost: 2330.15, ...opening },
    );
    // Out first: 6726-3381 = 3345 @2330.15, then +850 @11500 -> 4188.16 (the AdjustmentIn is real data)
    expect(afterCancel.averageCost).toBe(4188.16);
    expect(afterCancel.stock).toBe(4195);
    // runs add 222 kg @6135.03 on top: avg moves only slightly, and cancel restores the pre-run value
    expect(before.averageCost).toBeGreaterThan(afterCancel.averageCost);
    expect(before.averageCost).toBeLessThan(4400);
    expect(afterCancel.averageCost).toBeLessThan(11500);
  });

  it('with no opening base and only the AdjustmentIn left, replay returns 11500 (data, not a logic jump)', () => {
    const r = replayWeightedAverage([adj], { fallbackAverageCost: 2330.15 });
    expect(r.averageCost).toBe(11500);
  });
});

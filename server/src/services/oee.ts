import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * OEE (Overall Equipment Effectiveness) computation — MULTI-MACHINE.
 *
 * A production run is a LINE running several machines in PARALLEL. Each
 * machine has its own on/off window; output is DERIVED from the run's item
 * lines (no manual good/reject) and allocated to machines proportional to
 * their effective run time:
 *   - inputQty   = Σ Input line quantities
 *   - produkQty  = Σ main Output line quantities (NOT by-product)
 *   - sampingQty = Σ ByProduct line quantities
 *   - totalOutput = produkQty + sampingQty (basis for allocation)
 *   - loss = max(inputQty − produkQty − sampingQty, 0) (only loss lowers Quality)
 *
 * OEE = Availability × Performance × Quality, computed PER machine and
 * also as a run-level (line) aggregate. Performance reflects the MAIN
 * product only; Quality is run-level ((produk+samping)/input) so it is the
 * same for every machine.
 *
 * Each component is a ratio (0..1) clamped to that range; persisted values
 * are percentages with 2 decimals, allocated quantities with 3. Any
 * component that is not computable (no planned time, no machine rate,
 * zero output, ...) is null, and OEE is null unless all three are present.
 *
 * Pure function — no DB access, no side effects. The caller derives the
 * three quantities from the run's line arrays and resolves the machine
 * rates and downtime list before calling.
 */

export interface OeeMachineInput {
  machineId: string;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
  // machine.idealRatePerHour (kg/jam). null when no rate set.
  idealRatePerHour?: number | string | null;
}

export interface OeeDowntimeInput {
  // When set, attributes this downtime to a specific machine for the
  // per-machine calculation. Downtimes without machineId still count in the
  // run-level total downtime.
  machineId?: string | null;
  durationMin: number | string | null | undefined;
}

export interface ComputeOeeInput {
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  breakStart?: Date | string | null;
  breakEnd?: Date | string | null;
  runMachines: OeeMachineInput[];
  downtimes?: OeeDowntimeInput[];
  // Derived from the run's item lines (no manual good/reject):
  //   inputQty   = Σ Input line quantities
  //   produkQty  = Σ main Output line quantities (NOT by-product)
  //   sampingQty = Σ ByProduct line quantities
  inputQty?: number | string | null;
  produkQty?: number | string | null;
  sampingQty?: number | string | null;
}

export interface ComputeOeeMachineResult {
  machineId: string;
  runMin: number;
  downtimeMin: number;
  allocatedQty: number;
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
}

export interface ComputeOeeResult {
  // Run-level (line) aggregate, persisted on ProductionRun.
  downtimeMin: number;
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  // Per-machine results, persisted on each ProductionRunMachine row.
  machines: ComputeOeeMachineResult[];
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clamp01(x: Decimal): Decimal {
  if (x.lt(0)) return new Decimal(0);
  if (x.gt(1)) return new Decimal(1);
  return x;
}

const toPct2 = (ratio: Decimal): number => ratio.mul(100).toDecimalPlaces(2).toNumber();
const toQty3 = (qty: Decimal): number => qty.toDecimalPlaces(3).toNumber();

// Minutes between two dates (0 if missing / non-positive span).
function minutesBetween(a: Date | null, b: Date | null): Decimal {
  if (!a || !b) return new Decimal(0);
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return new Decimal(0);
  return new Decimal(ms).div(60000);
}

// Overlap minutes of [aStart,aEnd] ∩ [bStart,bEnd] (0 if either window missing).
function overlapMinutes(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date | null,
  bEnd: Date | null,
): Decimal {
  if (!aStart || !aEnd || !bStart || !bEnd) return new Decimal(0);
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  const ms = end - start;
  if (!Number.isFinite(ms) || ms <= 0) return new Decimal(0);
  return new Decimal(ms).div(60000);
}

export function computeOee(input: ComputeOeeInput): ComputeOeeResult {
  const plannedStart = toDate(input.plannedStart);
  const plannedEnd = toDate(input.plannedEnd);
  const breakStart = toDate(input.breakStart);
  const breakEnd = toDate(input.breakEnd);

  // ─── Planned production time ─────────────────────────────────────────
  // plannedMin = (plannedEnd − plannedStart) − (breakEnd − breakStart).
  const breakMin =
    breakStart && breakEnd ? minutesBetween(breakStart, breakEnd) : new Decimal(0);
  const plannedMin = Decimal.max(
    minutesBetween(plannedStart, plannedEnd).minus(breakMin),
    new Decimal(0),
  );

  // ─── Derived output (from the run's item lines) ──────────────────────
  const inputQty = new Decimal(toNum(input.inputQty));
  const produkQty = new Decimal(toNum(input.produkQty));
  const sampingQty = new Decimal(toNum(input.sampingQty));
  // totalOutput = produk + samping → basis for run-time allocation.
  const totalOutput = produkQty.plus(sampingQty);

  // ─── Run-level total downtime: sum of ALL downtimes ──────────────────
  const downtimes = input.downtimes ?? [];
  const totalDowntimeMin = downtimes.reduce(
    (s, d) => s.plus(new Decimal(toNum(d.durationMin))),
    new Decimal(0),
  );

  // ─── Per machine: run minutes ────────────────────────────────────────
  // runMin_m = max(onMin − breakOverlap − machineDowntime, 0).
  const machineRunMins = input.runMachines.map((m) => {
    const mStart = toDate(m.startAt);
    const mEnd = toDate(m.endAt);
    const onMin = minutesBetween(mStart, mEnd);
    const breakOverlapMin =
      breakStart && breakEnd ? overlapMinutes(mStart, mEnd, breakStart, breakEnd) : new Decimal(0);
    // Downtimes WITHOUT machineId are not attributed to any machine for the
    // per-machine calc (but still in the run-level total above).
    const machineDowntimeMin = downtimes
      .filter((d) => d.machineId != null && d.machineId === m.machineId)
      .reduce((s, d) => s.plus(new Decimal(toNum(d.durationMin))), new Decimal(0));
    const runMin = Decimal.max(
      onMin.minus(breakOverlapMin).minus(machineDowntimeMin),
      new Decimal(0),
    );
    return { input: m, runMin, machineDowntimeMin };
  });

  const totalRunMin = machineRunMins.reduce((s, x) => s.plus(x.runMin), new Decimal(0));

  // ─── Per machine: allocation + A/P/Q/OEE ─────────────────────────────
  const machines: ComputeOeeMachineResult[] = machineRunMins.map((x) => {
    const { input: m, runMin, machineDowntimeMin } = x;

    const allocFraction = totalRunMin.gt(0) ? runMin.div(totalRunMin) : new Decimal(0);
    // allocatedQty = total output (produk + samping) allocated, for display.
    const allocatedQty = totalRunMin.gt(0) ? totalOutput.mul(allocFraction) : new Decimal(0);
    // allocatedProduk = MAIN product only — drives Performance.
    const allocatedProduk = totalRunMin.gt(0) ? produkQty.mul(allocFraction) : new Decimal(0);

    // Availability = runMin / plannedMin.
    let availability: Decimal | null = null;
    if (plannedMin.gt(0)) {
      availability = clamp01(runMin.div(plannedMin));
    }

    // Performance = allocatedProduk / (idealPerMin × runMin) — MAIN PRODUCT only.
    const idealRatePerHour = toNum(m.idealRatePerHour);
    let performance: Decimal | null = null;
    if (idealRatePerHour > 0 && runMin.gt(0) && allocatedProduk.gt(0)) {
      const idealPerMin = new Decimal(idealRatePerHour).div(60);
      const idealQty = idealPerMin.mul(runMin);
      if (idealQty.gt(0)) {
        performance = clamp01(allocatedProduk.div(idealQty));
      }
    }

    // Quality = (produk + samping) / input — RUN-LEVEL (only loss reduces it),
    // so it is identical for every machine.
    let quality: Decimal | null = null;
    if (inputQty.gt(0)) {
      quality = clamp01(totalOutput.div(inputQty));
    }

    let oee: Decimal | null = null;
    if (availability != null && performance != null && quality != null) {
      oee = availability.mul(performance).mul(quality);
    }

    return {
      machineId: m.machineId,
      runMin: runMin.toDecimalPlaces(2).toNumber(),
      downtimeMin: machineDowntimeMin.toDecimalPlaces(2).toNumber(),
      allocatedQty: toQty3(allocatedQty),
      availabilityPct: availability != null ? toPct2(availability) : null,
      performancePct: performance != null ? toPct2(performance) : null,
      qualityPct: quality != null ? toPct2(quality) : null,
      oeePct: oee != null ? toPct2(oee) : null,
    };
  });

  // ─── Run-level (line) aggregate ──────────────────────────────────────
  const n = input.runMachines.length;

  // Availability = totalRunMin / (plannedMin × n).
  let runAvailability: Decimal | null = null;
  if (n > 0 && plannedMin.gt(0)) {
    runAvailability = clamp01(totalRunMin.div(plannedMin.mul(n)));
  }

  // Performance = produkQty / Σ(idealPerMin_m × runMin_m) — MAIN PRODUCT only.
  let runPerformance: Decimal | null = null;
  const perfDenom = machineRunMins.reduce((s, x) => {
    const idealRatePerHour = toNum(x.input.idealRatePerHour);
    if (idealRatePerHour <= 0) return s;
    const idealPerMin = new Decimal(idealRatePerHour).div(60);
    return s.plus(idealPerMin.mul(x.runMin));
  }, new Decimal(0));
  if (perfDenom.gt(0) && produkQty.gt(0)) {
    runPerformance = clamp01(produkQty.div(perfDenom));
  }

  // Quality = (produk + samping) / input — only loss reduces it.
  let runQuality: Decimal | null = null;
  if (inputQty.gt(0)) {
    runQuality = clamp01(totalOutput.div(inputQty));
  }

  let runOee: Decimal | null = null;
  if (runAvailability != null && runPerformance != null && runQuality != null) {
    runOee = runAvailability.mul(runPerformance).mul(runQuality);
  }

  return {
    downtimeMin: totalDowntimeMin.toDecimalPlaces(2).toNumber(),
    availabilityPct: runAvailability != null ? toPct2(runAvailability) : null,
    performancePct: runPerformance != null ? toPct2(runPerformance) : null,
    qualityPct: runQuality != null ? toPct2(runQuality) : null,
    oeePct: runOee != null ? toPct2(runOee) : null,
    machines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helper — shared by submit & edit services. Recreates downtime &
// ProductionRunMachine rows from the payload, computes OEE per machine + line
// aggregate, and stores everything. Caller is responsible for deleteMany on
// edit BEFORE calling this; this only creates + updates.
// ─────────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

export interface OeePersistInput {
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  breakStart?: Date | string | null;
  breakEnd?: Date | string | null;
  runMachines?: Array<{ machineId: string; startAt?: Date | string | null; endAt?: Date | string | null }>;
  downtimes?: Array<{ machineId?: string | null; category: string; reason?: string | null; durationMin: number }>;
  // Derived from the run's item lines (see computeOee). The caller (submit /
  // edit service) sums the line arrays it already builds and passes them here.
  inputQty?: number | null;
  produkQty?: number | null;
  sampingQty?: number | null;
}

/**
 * Persist OEE downtime + per-machine rows for a run, compute metrics, and write
 * the run-level aggregate onto ProductionRun. Idempotent w.r.t. creation: the
 * caller must clear existing rows first on edit.
 */
export async function persistOeeInTx(
  tx: Tx,
  runId: string,
  body: OeePersistInput,
): Promise<void> {
  const downtimeRows = body.downtimes ?? [];
  const machineRows = body.runMachines ?? [];

  // (Re)create downtime rows (with optional machineId attribution).
  if (downtimeRows.length > 0) {
    await tx.productionDowntime.createMany({
      data: downtimeRows.map((d) => ({
        productionRunId: runId,
        machineId: d.machineId ?? null,
        category: d.category,
        reason: d.reason ?? null,
        durationMin: d.durationMin,
      })),
    });
  }

  // Resolve ideal rates (kg/jam) for the machines in this run.
  const uniqueMachineIds = Array.from(new Set(machineRows.map((m) => m.machineId)));
  const machineMasters =
    uniqueMachineIds.length > 0
      ? await tx.machine.findMany({
          where: { id: { in: uniqueMachineIds } },
          select: { id: true, idealRatePerHour: true },
        })
      : [];
  const rateById = new Map(
    machineMasters.map((m) => [m.id, m.idealRatePerHour != null ? Number(m.idealRatePerHour) : null]),
  );

  const oee = computeOee({
    plannedStart: body.plannedStart ?? null,
    plannedEnd: body.plannedEnd ?? null,
    breakStart: body.breakStart ?? null,
    breakEnd: body.breakEnd ?? null,
    runMachines: machineRows.map((m) => ({
      machineId: m.machineId,
      startAt: m.startAt ?? null,
      endAt: m.endAt ?? null,
      idealRatePerHour: rateById.get(m.machineId) ?? null,
    })),
    downtimes: downtimeRows.map((d) => ({ machineId: d.machineId ?? null, durationMin: d.durationMin })),
    inputQty: body.inputQty ?? null,
    produkQty: body.produkQty ?? null,
    sampingQty: body.sampingQty ?? null,
  });

  // (Re)create per-machine rows with computed metrics. Map preserves payload
  // order so each machine row aligns with its computed result.
  if (machineRows.length > 0) {
    await tx.productionRunMachine.createMany({
      data: machineRows.map((m, idx) => {
        const res = oee.machines[idx]!;
        return {
          productionRunId: runId,
          machineId: m.machineId,
          startAt: m.startAt ? new Date(m.startAt) : null,
          endAt: m.endAt ? new Date(m.endAt) : null,
          runMin: res.runMin,
          downtimeMin: res.downtimeMin,
          allocatedQty: res.allocatedQty,
          availabilityPct: res.availabilityPct,
          performancePct: res.performancePct,
          qualityPct: res.qualityPct,
          oeePct: res.oeePct,
        };
      }),
    });
  }

  // Run-level (line) aggregate.
  await tx.productionRun.update({
    where: { id: runId },
    data: {
      downtimeMin: oee.downtimeMin,
      availabilityPct: oee.availabilityPct,
      performancePct: oee.performancePct,
      qualityPct: oee.qualityPct,
      oeePct: oee.oeePct,
    },
  });
}

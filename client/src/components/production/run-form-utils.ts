/** Types, pure helpers and the OEE preview calculation for the production run form. */

export interface LineItem {
  itemId: string;
  quantity: string;
  // Phase 2 batch tracking: when sourceMovementId is set, server locks the
  // cost to batchUnitCost. Empty string = WAC fallback (legacy).
  sourceMovementId: string;
  batchUnitCost: string;
}

// Phase 3: cost component row in the modal.
export interface CostLine {
  standardId: string;        // '' = freetext
  description: string;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  rate: string;              // user-editable; defaults from master standard
  costAccountId: string;     // optional tag
}

export interface CostStandard {
  id: string;
  name: string;
  description: string | null;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  defaultRate: string | number;
  costAccountId: string | null;
  itemId: string | null;
}

export const fmtRupiah = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 });

export interface OutputLineItem {
  itemId: string;
  quantity: string;
  unitPrice: string;
  isByProduct: boolean;
}

// OEE: downtime row in the modal (B2: optional per-machine attribution).
export interface DowntimeLine {
  machineId: string;       // '' = run-level (tidak dialokasi ke mesin)
  category: string;
  durationMin: string;
  reason: string;
}

// B2: one machine running in the run (parallel; own start/stop).
export interface MachineLine {
  machineId: string;
  startAt: string;         // datetime-local
  endAt: string;           // datetime-local
}

export interface MachineOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  idealRatePerHour: string | number | null;
  isActive: boolean;
}

export const DOWNTIME_CATEGORIES = ['Breakdown', 'Setup', 'Material', 'Lain'] as const;

export const clamp01Num = (x: number) => Math.max(0, Math.min(1, x));

// Convert a stored ISO/date string to a value usable by <input type="datetime-local">.
export const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Build a datetime-local string for a given YYYY-MM-DD date at HH:MM.
export const dateAtTime = (ymd: string, hour: number, minute: number): string => {
  if (!ymd) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ymd}T${pad(hour)}:${pad(minute)}`;
};

// Minutes between two datetime-local strings (0 if invalid / non-positive).
export const minutesBetweenLocal = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60000 : 0;
};

// Overlap minutes of [aStart,aEnd] ∩ [bStart,bEnd] (0 if any window missing).
export const overlapMinutesLocal = (aStart: string, aEnd: string, bStart: string, bEnd: string): number => {
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  const ms = end - start;
  return Number.isFinite(ms) && ms > 0 ? ms / 60000 : 0;
};

export interface OeeInputs {
  plannedStart: string;
  plannedEnd: string;
  breakStart: string;
  breakEnd: string;
  runMachines: MachineLine[];
  downtimes: DowntimeLine[];
  inputs: LineItem[];
  outputs: OutputLineItem[];
  machineById: Map<string, MachineOption>;
}

/**
 * OEE live preview (B2 multi-machine); mirrors server logic in services/oee.ts.
 * Server re-computes authoritatively on submit; this is purely cosmetic.
 */
export function computeOeePreview({
  plannedStart, plannedEnd, breakStart, breakEnd, runMachines, downtimes, inputs, outputs, machineById,
}: OeeInputs) {

  // Planned production time = (plannedEnd − plannedStart) − break.
  const breakMin = breakStart && breakEnd ? minutesBetweenLocal(breakStart, breakEnd) : 0;
  const plannedMin = Math.max(minutesBetweenLocal(plannedStart, plannedEnd) - breakMin, 0);

  // Output is DERIVED from the run's Input/Output line state (no manual
  // good/reject). produk = main output, samping = by-product, loss reduces Q.
  const inputQty = inputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const produkQty = outputs
    .filter(o => !o.isByProduct)
    .reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0);
  const sampingQty = outputs
    .filter(o => o.isByProduct)
    .reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0);
  const totalOutput = produkQty + sampingQty;

  // Per machine: effective run time.
  const perMachine = runMachines.map(m => {
    const onMin = minutesBetweenLocal(m.startAt, m.endAt);
    const breakOverlap = breakStart && breakEnd
      ? overlapMinutesLocal(m.startAt, m.endAt, breakStart, breakEnd)
      : 0;
    const machineDowntime = downtimes
      .filter(d => d.machineId && d.machineId === m.machineId)
      .reduce((s, d) => s + (parseFloat(d.durationMin) || 0), 0);
    const runMin = Math.max(onMin - breakOverlap - machineDowntime, 0);
    const ideal = machineById.get(m.machineId)?.idealRatePerHour;
    const idealRate = ideal != null ? Number(ideal) : 0;
    return { machineId: m.machineId, runMin, idealRate };
  });
  const totalRunMin = perMachine.reduce((s, m) => s + m.runMin, 0);

  const machineRows = perMachine.map(m => {
    const allocFraction = totalRunMin > 0 ? m.runMin / totalRunMin : 0;
    // allocatedQty = total output allocated (display); allocatedProduk = main
    // product only (drives Performance).
    const allocatedQty = totalRunMin > 0 ? totalOutput * allocFraction : 0;
    const allocatedProduk = totalRunMin > 0 ? produkQty * allocFraction : 0;

    let availabilityPct: number | null = null;
    if (plannedMin > 0) availabilityPct = clamp01Num(m.runMin / plannedMin) * 100;

    let performancePct: number | null = null;
    if (m.idealRate > 0 && m.runMin > 0 && allocatedProduk > 0) {
      const idealQty = (m.idealRate / 60) * m.runMin;
      if (idealQty > 0) performancePct = clamp01Num(allocatedProduk / idealQty) * 100;
    }

    // Quality = (produk + samping) / input — run-level, same per machine.
    let qualityPct: number | null = null;
    if (inputQty > 0) qualityPct = clamp01Num(totalOutput / inputQty) * 100;

    let oeePct: number | null = null;
    if (availabilityPct != null && performancePct != null && qualityPct != null) {
      oeePct = (availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100;
    }

    const machine = machineById.get(m.machineId);
    return {
      machineId: m.machineId,
      label: machine ? `${machine.code} · ${machine.name}` : '(mesin?)',
      runMin: m.runMin,
      allocatedQty,
      availabilityPct,
      performancePct,
      qualityPct,
      oeePct,
    };
  });

  // Run-level (line) aggregate.
  const n = runMachines.length;
  let availabilityPct: number | null = null;
  if (n > 0 && plannedMin > 0) availabilityPct = clamp01Num(totalRunMin / (plannedMin * n)) * 100;

  const perfDenom = perMachine.reduce(
    (s, m) => (m.idealRate > 0 ? s + (m.idealRate / 60) * m.runMin : s),
    0,
  );
  // Performance basis = MAIN product only.
  let performancePct: number | null = null;
  if (perfDenom > 0 && produkQty > 0) performancePct = clamp01Num(produkQty / perfDenom) * 100;

  // Quality = (produk + samping) / input — only loss reduces it.
  let qualityPct: number | null = null;
  if (inputQty > 0) qualityPct = clamp01Num(totalOutput / inputQty) * 100;

  let oeePct: number | null = null;
  if (availabilityPct != null && performancePct != null && qualityPct != null) {
    oeePct = (availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100;
  }

  // Derived production summary feeding OEE (read-only display).
  const lossQty = Math.max(inputQty - produkQty - sampingQty, 0);
  const yieldPct = inputQty > 0 ? clamp01Num(totalOutput / inputQty) * 100 : null;
  const summary = { inputQty, produkQty, sampingQty, lossQty, yieldPct };

  return {
    machines: machineRows,
    line: { availabilityPct, performancePct, qualityPct, oeePct },
    summary,
  };
}

export type OeePreview = ReturnType<typeof computeOeePreview>;

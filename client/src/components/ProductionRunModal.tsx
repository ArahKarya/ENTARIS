import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Calculator, ChevronDown, ChevronRight, Gauge, Layers } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';
import WarehousePicker from './WarehousePicker';
import BatchPicker from './BatchPicker';
import type { Batch } from './BatchPicker';
import Select from './Select';
import { cap } from '../lib/permissions';
import { fetchBatches, allocateFifo } from '../lib/fifoAllocate';

interface LineItem {
  itemId: string;
  quantity: string;
  // Phase 2 batch tracking: when sourceMovementId is set, server locks the
  // cost to batchUnitCost. Empty string = WAC fallback (legacy).
  sourceMovementId: string;
  batchUnitCost: string;
}

// Phase 3: cost component row in the modal.
interface CostLine {
  standardId: string;        // '' = freetext
  description: string;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  rate: string;              // user-editable; defaults from master standard
  costAccountId: string;     // optional tag
}

interface CostStandard {
  id: string;
  name: string;
  description: string | null;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  defaultRate: string | number;
  costAccountId: string | null;
  itemId: string | null;
}

const fmtRupiah = (n: number) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 });

interface OutputLineItem {
  itemId: string;
  quantity: string;
  unitPrice: string;
  isByProduct: boolean;
}

// OEE: downtime row in the modal (B2: optional per-machine attribution).
interface DowntimeLine {
  machineId: string;       // '' = run-level (tidak dialokasi ke mesin)
  category: string;
  durationMin: string;
  reason: string;
}

// B2: one machine running in the run (parallel; own start/stop).
interface MachineLine {
  machineId: string;
  startAt: string;         // datetime-local
  endAt: string;           // datetime-local
}

interface MachineOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  idealRatePerHour: string | number | null;
  isActive: boolean;
}

const DOWNTIME_CATEGORIES = ['Breakdown', 'Setup', 'Material', 'Lain'] as const;

const clamp01Num = (x: number) => Math.max(0, Math.min(1, x));

// Convert a stored ISO/date string to a value usable by <input type="datetime-local">.
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Build a datetime-local string for a given YYYY-MM-DD date at HH:MM.
const dateAtTime = (ymd: string, hour: number, minute: number): string => {
  if (!ymd) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ymd}T${pad(hour)}:${pad(minute)}`;
};

// Minutes between two datetime-local strings (0 if invalid / non-positive).
const minutesBetweenLocal = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60000 : 0;
};

// Overlap minutes of [aStart,aEnd] ∩ [bStart,bEnd] (0 if any window missing).
const overlapMinutesLocal = (aStart: string, aEnd: string, bStart: string, bEnd: string): number => {
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  const ms = end - start;
  return Number.isFinite(ms) && ms > 0 ? ms / 60000 : 0;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  editRun?: any | null;
  // Resubmit mode: hydrate dari create-body payload (bukan run-record) +
  // submit ke endpoint resubmit alih-alih create.
  prefillPayload?: any | null;
  resubmitRequestId?: string | null;
}

const today = () => new Date().toISOString().split('T')[0];

export function ProductionRunModal({ isOpen, onClose, items, editRun, prefillPayload, resubmitRequestId }: Props) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<LineItem[]>([{ itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
  const [outputs, setOutputs] = useState<OutputLineItem[]>([{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [hppOverride, setHppOverride] = useState<string>('');
  // Traceability: selected master process IDs (multiselect, optional)
  const [processIds, setProcessIds] = useState<string[]>([]);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [negativeStockReason, setNegativeStockReason] = useState('');
  // ─── OEE capture (B2 multi-machine) ─────────────────────────────────────────
  const [oeeOpen, setOeeOpen] = useState(false);
  // Shift window (planned production time) + break window.
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [shift, setShift] = useState('');
  const [shiftLead, setShiftLead] = useState('');
  const [manpowerCount, setManpowerCount] = useState('');
  const [runMachines, setRunMachines] = useState<MachineLine[]>([]);
  const [downtimes, setDowntimes] = useState<DowntimeLine[]>([]);
  const isAdmin = cap('inventory.negative_stock');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset form when opened (prefill if editing)
  useEffect(() => {
    if (isOpen) {
      // ── Resubmit mode: hydrate langsung dari create-body payload ──
      if (prefillPayload) {
        const p = prefillPayload;
        setDate(p.date ? new Date(p.date).toISOString().split('T')[0] : today());
        setWarehouseId(p.warehouseId ?? '');
        setReferenceNumber(p.referenceNumber ?? '');
        setNotes(p.notes ?? '');
        setInputs(Array.isArray(p.inputs) && p.inputs.length > 0
          ? p.inputs.map((i: any) => ({
              itemId: i.itemId ?? '', quantity: String(Number(i.quantity ?? 0)),
              sourceMovementId: i.sourceMovementId ?? '',
              batchUnitCost: i.batchUnitCost != null ? String(Number(i.batchUnitCost)) : '',
            }))
          : [{ itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
        setOutputs(Array.isArray(p.outputs) && p.outputs.length > 0
          ? p.outputs.map((o: any) => ({
              itemId: o.itemId ?? '', quantity: String(Number(o.quantity ?? 0)),
              unitPrice: o.unitPrice != null && Number(o.unitPrice) > 0 ? String(Number(o.unitPrice)) : '',
              isByProduct: !!o.isByProduct,
            }))
          : [{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
        setCosts(Array.isArray(p.costs)
          ? p.costs.map((c: any) => ({
              standardId: c.standardId ?? '', description: c.description ?? '',
              costSide: c.costSide, basis: c.basis,
              rate: c.rate != null ? String(Number(c.rate)) : '', costAccountId: c.costAccountId ?? '',
            }))
          : []);
        setHppOverride(p.hppOverride != null ? String(Number(p.hppOverride)) : '');
        setProcessIds(Array.isArray(p.processIds) ? p.processIds : []);
        setShift(p.shift ?? '');
        setShiftLead(p.shiftLead ?? '');
        setManpowerCount(p.manpowerCount != null ? String(p.manpowerCount) : '');
        setPlannedStart(p.plannedStart ? toLocalInput(p.plannedStart) : '');
        setPlannedEnd(p.plannedEnd ? toLocalInput(p.plannedEnd) : '');
        setBreakStart(p.breakStart ? toLocalInput(p.breakStart) : '');
        setBreakEnd(p.breakEnd ? toLocalInput(p.breakEnd) : '');
        setRunMachines(Array.isArray(p.runMachines)
          ? p.runMachines.map((m: any) => ({ machineId: m.machineId ?? '', startAt: toLocalInput(m.startAt), endAt: toLocalInput(m.endAt) }))
          : []);
        setDowntimes(Array.isArray(p.downtimes)
          ? p.downtimes.map((d: any) => ({ machineId: d.machineId ?? '', category: d.category ?? 'Lain', durationMin: d.durationMin != null ? String(Number(d.durationMin)) : '', reason: d.reason ?? '' }))
          : []);
        setOeeOpen(!!(p.shift || p.plannedStart || (Array.isArray(p.runMachines) && p.runMachines.length > 0) || (Array.isArray(p.downtimes) && p.downtimes.length > 0)));
        setAllowNegativeStock(false);
        setNegativeStockReason('');
        setErrors([]);
        return;
      }
      if (editRun) {
        const runItems = editRun.items ?? [];
        const inputItems = runItems.filter((i: any) => i.lineType === 'Input');
        const outputItems = runItems.filter((i: any) => i.lineType === 'Output' || i.lineType === 'ByProduct');
        setDate(editRun.date ? new Date(editRun.date).toISOString().split('T')[0] : today());
        // Reload warehouse from the run's first item movement (all input/output
        // moves share the same warehouseId per run).
        const firstItem = (editRun.items ?? [])[0];
        setWarehouseId(firstItem?.warehouseId ?? firstItem?.warehouse?.id ?? '');
        setReferenceNumber(editRun.referenceNumber ?? '');
        setNotes(editRun.notes ?? '');
        setInputs(inputItems.length > 0
          ? inputItems.map((i: any) => ({
              itemId: i.itemId ?? i.item?.id ?? '',
              quantity: String(Number(i.quantity)),
              sourceMovementId: i.sourceMovementId ?? '',
              batchUnitCost: i.batchUnitCost != null ? String(Number(i.batchUnitCost)) : '',
            }))
          : [{ itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]
        );
        setOutputs(outputItems.length > 0
          ? outputItems.map((o: any) => ({
              itemId: o.itemId ?? o.item?.id ?? '',
              quantity: String(Number(o.quantity)),
              unitPrice: o.unitPrice != null && Number(o.unitPrice) > 0 ? String(Number(o.unitPrice)) : '',
              isByProduct: o.isByProduct || o.lineType === 'ByProduct',
            }))
          : [{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]
        );
      } else {
        setDate(today());
        setWarehouseId('');
        setReferenceNumber('');
        setNotes('');
        setInputs([{ itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
        setOutputs([{ itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
      }
      // Phase 3: load existing cost components when editing
      if (editRun && Array.isArray(editRun.runCosts)) {
        setCosts(editRun.runCosts.map((c: any) => ({
          standardId: c.standardId ?? '',
          description: c.description ?? '',
          costSide: c.costSide,
          basis: c.basis,
          rate: c.rate != null ? String(Number(c.rate)) : '',
          costAccountId: c.costAccountId ?? '',
        })));
      } else {
        setCosts([]);
      }
      setHppOverride(
        editRun && editRun.hppManualOverride && editRun.computedHpp != null
          ? String(Number(editRun.computedHpp))
          : '',
      );
      // Process selections
      if (editRun && Array.isArray(editRun.runProcesses)) {
        setProcessIds(
          editRun.runProcesses
            .map((rp: any) => rp.processId ?? rp.process?.id)
            .filter(Boolean),
        );
      } else {
        setProcessIds([]);
      }
      // OEE capture prefill (edit) / reset (create) — B2 multi-machine.
      const runYmd = editRun?.date
        ? new Date(editRun.date).toISOString().split('T')[0]!
        : today();
      if (editRun) {
        setShift(editRun.shift ?? '');
        setShiftLead(editRun.shiftLead ?? '');
        setManpowerCount(editRun.manpowerCount != null ? String(editRun.manpowerCount) : '');
        // Shift window: prefill from stored planned*, else default 08:00–17:00.
        setPlannedStart(editRun.plannedStart ? toLocalInput(editRun.plannedStart) : dateAtTime(runYmd, 8, 0));
        setPlannedEnd(editRun.plannedEnd ? toLocalInput(editRun.plannedEnd) : dateAtTime(runYmd, 17, 0));
        setBreakStart(editRun.breakStart ? toLocalInput(editRun.breakStart) : dateAtTime(runYmd, 12, 0));
        setBreakEnd(editRun.breakEnd ? toLocalInput(editRun.breakEnd) : dateAtTime(runYmd, 13, 0));
        setRunMachines(
          Array.isArray(editRun.runMachines) && editRun.runMachines.length > 0
            ? editRun.runMachines.map((m: any) => ({
                machineId: m.machineId ?? m.machine?.id ?? '',
                startAt: toLocalInput(m.startAt),
                endAt: toLocalInput(m.endAt),
              }))
            : [],
        );
        setDowntimes(
          Array.isArray(editRun.downtimes)
            ? editRun.downtimes.map((d: any) => ({
                machineId: d.machineId ?? d.machine?.id ?? '',
                category: d.category ?? 'Lain',
                durationMin: d.durationMin != null ? String(Number(d.durationMin)) : '',
                reason: d.reason ?? '',
              }))
            : [],
        );
        const hasOee = !!(
          (Array.isArray(editRun.runMachines) && editRun.runMachines.length > 0)
          || editRun.machineId || editRun.plannedStart || editRun.startAt
          || editRun.oeePct != null || editRun.availabilityPct != null
          || (Array.isArray(editRun.downtimes) && editRun.downtimes.length > 0)
        );
        setOeeOpen(hasOee);
      } else {
        setShift('');
        setShiftLead('');
        setManpowerCount('');
        setPlannedStart(dateAtTime(runYmd, 8, 0));
        setPlannedEnd(dateAtTime(runYmd, 17, 0));
        setBreakStart(dateAtTime(runYmd, 12, 0));
        setBreakEnd(dateAtTime(runYmd, 13, 0));
        setRunMachines([]);
        setDowntimes([]);
        setOeeOpen(false);
      }
      setAllowNegativeStock(false);
      setErrors([]);
      setIsSubmitting(false);
    }
  }, [isOpen, editRun, prefillPayload]);

  // Phase 3: load master cost standards for the picker.
  // Phase 3b: scope by warehouseId — staff hanya lihat standar yg match dengan
  // gudang produksi terpilih atau yg berlaku semua (warehouseId null). Saat
  // warehouse belum dipilih, list disembunyikan untuk menghindari false picks.
  const { data: standardsData } = useQuery({
    queryKey: ['production-cost-standards', 'active', warehouseId],
    queryFn: () => api
      .get('/inventory/production-cost-standards', {
        params: { active: true, ...(warehouseId ? { warehouseId } : {}) },
      })
      .then(r => r.data),
    enabled: isOpen && !!warehouseId,
    staleTime: 60_000,
  });
  const standards: CostStandard[] = standardsData?.data ?? [];

  // Master proses produksi (multiselect untuk traceability)
  const { data: processesData } = useQuery({
    queryKey: ['production-processes-active'],
    queryFn: () => api
      .get('/inventory/production-processes', { params: { active: true } })
      .then(r => r.data),
    enabled: isOpen,
    staleTime: 60_000,
  });
  const allProcesses: { id: string; name: string; description: string | null; sortOrder: number }[] =
    processesData?.data ?? [];

  // OEE: master mesin aktif untuk dropdown.
  const { data: machinesData } = useQuery({
    queryKey: ['machines-active'],
    queryFn: () => api
      .get('/inventory/machines', { params: { active: true } })
      .then(r => r.data),
    enabled: isOpen,
    staleTime: 60_000,
  });
  const machines: MachineOption[] = machinesData?.data ?? [];
  const machineById = useMemo(
    () => new Map(machines.map(m => [m.id, m])),
    [machines],
  );

  const toggleProcess = (id: string) => {
    setProcessIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Escape key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isSubmitting) onClose();
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const itemOptions = useMemo((): SelectOption[] =>
    items.filter((i: any) => i.isActive !== false).map((i: any) => ({
      value: i.id,
      label: `${i.code} — ${i.name}`,
    })),
    [items],
  );

  // OEE live preview (B2 multi-machine) — mirrors server logic in
  // services/oee.ts. Server re-computes authoritatively on submit; this is
  // purely cosmetic. NOTE: must stay ABOVE the early `if (!isOpen) return null`
  // — hooks may not be called conditionally (React error #310).
  const oeePreview = useMemo(() => {
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
        label: machine ? `${machine.code} — ${machine.name}` : '(mesin?)',
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
  }, [plannedStart, plannedEnd, breakStart, breakEnd, runMachines, downtimes, inputs, outputs, machineById]);

  if (!isOpen) return null;

  // Helpers
  const getItemById = (id: string) => items.find(i => i.id === id);

  const updateInput = (idx: number, field: keyof LineItem, value: string) => {
    setInputs(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      // Changing the item resets the batch pick (different item = different batches).
      if (field === 'itemId') {
        return { ...row, itemId: value, sourceMovementId: '', batchUnitCost: '' };
      }
      return { ...row, [field]: value };
    }));
  };

  const onPickBatch = (idx: number, batchId: string, batch: Batch | null) => {
    setInputs(prev => prev.map((row, i) => i === idx
      ? {
          ...row,
          sourceMovementId: batchId,
          batchUnitCost: batch ? String(batch.unitCost) : '',
        }
      : row,
    ));
  };
  const updateOutput = (idx: number, field: string, value: string | boolean) => {
    setOutputs(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };
  // Bagi Batch Otomatis (FIFO): pecah baris idx menjadi N baris per batch.
  // Sisa yang tak tertampung batch → baris tanpa batch (fallback WAC, valid
  // di server) + warning. Batch yang sudah dipakai baris lain tidak dialokasi ulang.
  const splitInputRow = async (idx: number) => {
    const row = inputs[idx];
    const qty = parseFloat(row.quantity) || 0;
    if (!row.itemId || !warehouseId || qty <= 0) return;
    try {
      const batches = await fetchBatches(row.itemId, warehouseId);
      const claimed = new Map<string, number>();
      inputs.forEach((r, i) => {
        if (i !== idx && r.itemId === row.itemId && r.sourceMovementId) {
          claimed.set(r.sourceMovementId, (claimed.get(r.sourceMovementId) ?? 0) + (parseFloat(r.quantity) || 0));
        }
      });
      const { allocations, shortfall } = allocateFifo(batches, qty, claimed);
      if (allocations.length === 0) {
        toast.error('Tidak ada batch tersedia untuk item ini di gudang terpilih.');
        return;
      }
      const newRows: LineItem[] = allocations.map(a => ({
        itemId: row.itemId,
        quantity: String(a.qty),
        sourceMovementId: a.batch.id,
        batchUnitCost: String(a.batch.unitCost),
      }));
      if (shortfall > 0) {
        newRows.push({ itemId: row.itemId, quantity: String(shortfall), sourceMovementId: '', batchUnitCost: '' });
        toast.warning(`${shortfall.toLocaleString('id-ID')} melebihi total batch tersedia — baris sisa memakai biaya rata-rata (WAC).`);
      } else {
        toast.success(`Dibagi ke ${allocations.length} batch (FIFO).`);
      }
      setInputs(prev => [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)]);
    } catch {
      toast.error('Gagal mengambil daftar batch.');
    }
  };

  const addInput = () => setInputs(prev => [...prev, { itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
  const removeInput = (idx: number) => setInputs(prev => prev.filter((_, i) => i !== idx));
  const addOutput = () => setOutputs(prev => [...prev, { itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const removeOutput = (idx: number) => setOutputs(prev => prev.filter((_, i) => i !== idx));

  // OEE: machine helpers (B2 multi-machine). New rows default their window to
  // the shift window so staff only edit when a machine ran a different span.
  const addMachine = () => setRunMachines(prev => [
    ...prev,
    { machineId: '', startAt: plannedStart, endAt: plannedEnd },
  ]);
  const removeMachine = (idx: number) => setRunMachines(prev => prev.filter((_, i) => i !== idx));
  const updateMachine = (idx: number, patch: Partial<MachineLine>) =>
    setRunMachines(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

  // OEE: downtime helpers
  const addDowntime = () => setDowntimes(prev => [...prev, { machineId: '', category: 'Breakdown', durationMin: '', reason: '' }]);
  const removeDowntime = (idx: number) => setDowntimes(prev => prev.filter((_, i) => i !== idx));
  const updateDowntime = (idx: number, patch: Partial<DowntimeLine>) =>
    setDowntimes(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

  // Phase 3: cost component helpers
  const addCost = (side: 'InputSide' | 'OutputSide') => {
    setCosts(prev => [
      ...prev,
      {
        standardId: '',
        description: '',
        costSide: side,
        basis: side === 'InputSide' ? 'InputQty' : 'OutputQty',
        rate: '',
        costAccountId: '',
      },
    ]);
  };
  const removeCost = (idx: number) => setCosts(prev => prev.filter((_, i) => i !== idx));
  const updateCost = (idx: number, patch: Partial<CostLine>) => {
    setCosts(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));
  };
  const applyStandardToCost = (idx: number, standardId: string) => {
    const std = standards.find(s => s.id === standardId);
    if (!std) {
      updateCost(idx, { standardId: '' });
      return;
    }
    updateCost(idx, {
      standardId: std.id,
      description: std.name,
      costSide: std.costSide,
      basis: std.basis,
      rate: String(Number(std.defaultRate)),
      costAccountId: std.costAccountId ?? '',
    });
  };

  // Yield calculation: total main output / total input
  const totalInputQty = inputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalMainOutputQty = outputs
    .filter(o => !o.isByProduct)
    .reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const yieldPct = totalInputQty > 0 && totalMainOutputQty > 0
    ? ((totalMainOutputQty / totalInputQty) * 100).toFixed(1)
    : null;

  // Phase 3: live HPP computation for preview. Mirrors server logic so user
  // sees the loaded HPP before submitting. Server re-computes authoritatively.
  const totalMaterialCostPreview = inputs.reduce((s, r) => {
    const qty = parseFloat(r.quantity) || 0;
    let unitCost = parseFloat(r.batchUnitCost) || 0;
    if (!r.batchUnitCost) {
      // Fallback to WAC if no batch picked
      const item = getItemById(r.itemId);
      unitCost = item ? Number(item.averageCost) : 0;
    }
    return s + qty * unitCost;
  }, 0);

  const computeCostTotal = (c: CostLine): number => {
    const rate = parseFloat(c.rate) || 0;
    if (c.basis === 'InputQty') return rate * totalInputQty;
    if (c.basis === 'OutputQty') return rate * totalMainOutputQty;
    return rate;
  };

  const totalCostInputSidePreview = costs
    .filter(c => c.costSide === 'InputSide')
    .reduce((s, c) => s + computeCostTotal(c), 0);
  const totalCostOutputSidePreview = costs
    .filter(c => c.costSide === 'OutputSide')
    .reduce((s, c) => s + computeCostTotal(c), 0);
  const totalByproductValuePreview = outputs
    .filter(o => o.isByProduct)
    .reduce((s, o) => s + (parseFloat(o.quantity) || 0) * (parseFloat(o.unitPrice) || 0), 0);

  const overrideNum = parseFloat(hppOverride);
  const hasOverride = !isNaN(overrideNum) && overrideNum >= 0;

  const autoHpp = totalMainOutputQty > 0
    ? (totalMaterialCostPreview + totalCostInputSidePreview + totalCostOutputSidePreview - totalByproductValuePreview) / totalMainOutputQty
    : 0;
  const previewHpp = hasOverride ? overrideNum : autoHpp;

  const inputCostRows = costs
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.costSide === 'InputSide');
  const outputCostRows = costs
    .map((c, idx) => ({ c, idx }))
    .filter(({ c }) => c.costSide === 'OutputSide');


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const errs: string[] = [];
    if (!date) errs.push('Tanggal wajib diisi.');
    if (!warehouseId) errs.push('Gudang wajib dipilih.');
    const validInputs = inputs.filter(i => i.itemId && i.quantity && parseFloat(i.quantity) > 0);
    const validOutputs = outputs.filter(o => o.itemId && o.quantity && parseFloat(o.quantity) > 0);
    if (validInputs.length === 0) errs.push('Minimal satu item input.');
    if (validOutputs.length === 0) errs.push('Minimal satu item output.');
    // Byproducts require explicit NRV. Main outputs may omit unitPrice — the
    // server back-fills it from loaded HPP.
    validOutputs.forEach((o, i) => {
      if (o.isByProduct && (!o.unitPrice || parseFloat(o.unitPrice) < 0)) {
        errs.push(`Produk samping baris ke-${i + 1}: NRV wajib diisi.`);
      }
    });
    if (allowNegativeStock && negativeStockReason.trim().length < 10) {
      errs.push('Alasan bypass stok minus wajib diisi (minimal 10 karakter).');
    }
    // OEE: shift window — if both set, end must be after start.
    if (plannedStart && plannedEnd && new Date(plannedEnd).getTime() <= new Date(plannedStart).getTime()) {
      errs.push('Jam selesai shift harus setelah jam mulai shift.');
    }
    // OEE: each machine row with both times — end must be after start.
    runMachines.forEach((m, i) => {
      if (m.startAt && m.endAt && new Date(m.endAt).getTime() <= new Date(m.startAt).getTime()) {
        errs.push(`Mesin baris ke-${i + 1}: jam selesai harus setelah jam mulai.`);
      }
    });
    if (errs.length) { setErrors(errs); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        date,
        warehouseId,
        notes: notes || null,
        referenceNumber: referenceNumber || null,
        inputs: validInputs.map(i => ({
          itemId: i.itemId,
          quantity: parseFloat(i.quantity),
          sourceMovementId: i.sourceMovementId || null,
          batchUnitCost: i.batchUnitCost ? parseFloat(i.batchUnitCost) : null,
        })),
        outputs: validOutputs.map(o => ({
          itemId: o.itemId,
          quantity: parseFloat(o.quantity),
          unitPrice: o.unitPrice ? parseFloat(o.unitPrice) : null,
          isByProduct: o.isByProduct,
        })),
        allowNegativeStock,
        negativeStockReason: allowNegativeStock ? negativeStockReason.trim() : null,
      };

      const fullPayload: any = {
        ...payload,
        costs: costs
          .filter(c => c.description.trim() && (parseFloat(c.rate) || 0) >= 0)
          .map(c => ({
            standardId: c.standardId || null,
            description: c.description.trim(),
            costSide: c.costSide,
            basis: c.basis,
            rate: parseFloat(c.rate) || 0,
            costAccountId: c.costAccountId || null,
          })),
        hppOverride: hasOverride ? overrideNum : null,
        processIds: processIds,
        // ─── OEE capture (B2 multi-machine, all optional) ─────────────────
        plannedStart: plannedStart ? new Date(plannedStart).toISOString() : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd).toISOString() : null,
        breakStart: breakStart ? new Date(breakStart).toISOString() : null,
        breakEnd: breakEnd ? new Date(breakEnd).toISOString() : null,
        shift: shift || null,
        shiftLead: shiftLead.trim() || null,
        manpowerCount: manpowerCount.trim() ? parseInt(manpowerCount, 10) : null,
        // OEE Quality/output is DERIVED server-side from inputs/outputs lines.
        // We no longer send goodQty/rejectQty.
        runMachines: runMachines
          .filter(m => m.machineId)
          .map(m => ({
            machineId: m.machineId,
            startAt: m.startAt ? new Date(m.startAt).toISOString() : null,
            endAt: m.endAt ? new Date(m.endAt).toISOString() : null,
          })),
        downtimes: downtimes
          .filter(d => d.category && d.durationMin.trim() && parseFloat(d.durationMin) >= 0)
          .map(d => ({
            machineId: d.machineId || null,
            category: d.category,
            durationMin: parseFloat(d.durationMin),
            reason: d.reason.trim() || null,
          })),
      };

      let pendingApproval = false;
      let resubmitted = false;
      if (resubmitRequestId) {
        await api.put(`/approvals/requests/${resubmitRequestId}/resubmit`, { payload: fullPayload });
        resubmitted = true;
      } else if (editRun) {
        await api.put(`/inventory/production-runs/${editRun.id}`, fullPayload);
      } else {
        const res = await api.post('/inventory/production-runs', fullPayload);
        pendingApproval = res.data?.pendingApproval === true;
      }
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['production-run-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      if (resubmitted) {
        toast.success('Pengajuan diperbarui & dikirim ulang untuk persetujuan.');
      } else if (pendingApproval) {
        toast.success('Data produksi dikirim untuk persetujuan manajer. Akan diproses setelah disetujui.');
      } else {
        toast.success(editRun ? 'Proses produksi berhasil diperbarui.' : 'Proses produksi berhasil dicatat.');
      }
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || (editRun ? 'Gagal mengedit proses produksi.' : 'Gagal mencatat proses produksi.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-modal-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="production-modal-title" className="text-base font-semibold text-gray-900">
            {editRun ? `Edit ${editRun.runNumber}` : 'Proses Produksi'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {errors.length > 0 && (
              <ul className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 space-y-1">
                {errors.map((e, i) => <li key={i}>{'\u2022'} {e}</li>)}
              </ul>
            )}

            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Gudang <span className="text-red-500">*</span>
                </label>
                <WarehousePicker
                  value={warehouseId}
                  onChange={setWarehouseId}
                  size="md"
                  autoDefault={true}
                  placeholder="Pilih gudang produksi..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Referensi (No. PI / Opsional)
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="Misal: PI-202603-0001"
                  className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Catatan</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Keterangan tambahan..."
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Inputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Bahan Input</h3>
                <button
                  type="button"
                  onClick={addInput}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus size={13} /> Tambah Input
                </button>
              </div>
              <div className="space-y-2">
                {inputs.map((row, idx) => {
                  const item = getItemById(row.itemId);
                  return (
                    <div key={idx} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 space-y-1.5">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <SearchableSelect
                            options={itemOptions}
                            value={row.itemId}
                            onChange={(v) => updateInput(idx, 'itemId', v)}
                            placeholder="— Pilih Item —"
                          />
                          {item && (
                            <p className="text-xs text-gray-400 mt-0.5 ml-1">
                              Stok gudang: {Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} {item.unit}
                            </p>
                          )}
                        </div>
                        <div className="w-36 flex gap-1 items-center">
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={e => updateInput(idx, 'quantity', e.target.value)}
                            placeholder="Qty"
                            min="0.001"
                            step="0.001"
                            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {item && <span className="text-xs text-gray-400 whitespace-nowrap">{item.unit}</span>}
                        </div>
                        {inputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeInput(idx)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      {row.itemId && (
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 mb-0.5">Batch sumber</label>
                          <div className="flex gap-2 items-center">
                            <div className="flex-1 min-w-0">
                              <BatchPicker
                                itemId={row.itemId}
                                warehouseId={warehouseId}
                                value={row.sourceMovementId}
                                excludeIds={inputs
                                  .filter((r, i) => i !== idx && r.itemId === row.itemId && r.sourceMovementId)
                                  .map((r) => r.sourceMovementId)}
                                onChange={(id, batch) => onPickBatch(idx, id, batch)}
                              />
                            </div>
                            {!row.sourceMovementId && (parseFloat(row.quantity) || 0) > 0 && warehouseId && (
                              <button
                                type="button"
                                onClick={() => void splitInputRow(idx)}
                                className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-300 rounded-lg px-2 py-1.5 transition-colors"
                                title="Pecah otomatis jadi beberapa baris sesuai batch tersedia (FIFO, tertua dulu)"
                              >
                                <Layers size={12} /> Bagi Batch
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Outputs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Hasil Output</h3>
                <button
                  type="button"
                  onClick={addOutput}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <Plus size={13} /> Tambah Output
                </button>
              </div>
              <div className="space-y-3">
                {outputs.map((row, idx) => {
                  const item = getItemById(row.itemId);
                  const qty = parseFloat(row.quantity) || 0;
                  const price = parseFloat(row.unitPrice) || 0;
                  const rPct = totalInputQty > 0 && qty > 0 && !row.isByProduct
                    ? ((qty / totalInputQty) * 100).toFixed(1)
                    : null;
                  return (
                    <div key={idx} className={`border rounded-lg p-2.5 space-y-2 ${row.isByProduct ? 'border-amber-200 bg-amber-50/50' : 'border-gray-100 bg-gray-50/50'}`}>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <SearchableSelect
                            options={itemOptions}
                            value={row.itemId}
                            onChange={(v) => updateOutput(idx, 'itemId', v)}
                            placeholder="— Pilih Item —"
                          />
                        </div>
                        <div className="w-28 flex gap-1 items-center">
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={e => updateOutput(idx, 'quantity', e.target.value)}
                            placeholder="Qty"
                            min="0.001"
                            step="0.001"
                            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {item && <span className="text-xs text-gray-400 whitespace-nowrap">{item.unit}</span>}
                        </div>
                        {rPct !== null && (
                          <div className="flex items-center px-2 py-2 bg-green-50 rounded-lg min-w-[46px] text-center">
                            <span className="text-xs font-semibold text-green-700">{rPct}%</span>
                          </div>
                        )}
                        {row.isByProduct && (
                          <div className="flex items-center px-2 py-2 bg-amber-100 rounded-lg">
                            <span className="text-xs font-semibold text-amber-700">Samping</span>
                          </div>
                        )}
                        {outputs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOutput(idx)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      {/* HPP / Unit Price row + By-product toggle */}
                      <div className="flex items-center gap-2 pl-0.5">
                        <label className="text-xs text-gray-400 font-medium whitespace-nowrap">
                          {row.isByProduct ? 'NRV/kg (Rp)' : 'HPP/kg (Rp)'}
                        </label>
                        <input
                          type="number"
                          value={row.unitPrice}
                          onChange={e => updateOutput(idx, 'unitPrice', e.target.value)}
                          placeholder={
                            row.isByProduct
                              ? 'Nilai NRV per kg'
                              : (autoHpp > 0
                                  ? `auto: Rp ${autoHpp.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`
                                  : 'kosongkan = ikut HPP loaded')
                          }
                          min="0"
                          className="w-44 border border-gray-200 rounded-lg py-1.5 px-2.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-emerald-500/70 placeholder:text-[10.5px]"
                        />
                        {price > 0 && qty > 0 ? (
                          <span className="text-xs text-gray-400 font-mono">
                            = Rp {(price * qty).toLocaleString('id-ID')}
                          </span>
                        ) : !row.isByProduct && qty > 0 && autoHpp > 0 ? (
                          <span className="text-[10.5px] text-emerald-600 font-mono whitespace-nowrap">
                            = Rp {Math.round(autoHpp * qty).toLocaleString('id-ID')} (auto)
                          </span>
                        ) : null}
                        <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={row.isByProduct}
                            onChange={e => updateOutput(idx, 'isByProduct', e.target.checked)}
                            className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                          />
                          <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Produk Samping</span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OEE: Data Produksi & OEE (collapsible, all optional) */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setOeeOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-sky-50/60 hover:bg-sky-50 transition-colors"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-sky-800 uppercase tracking-wide">
                  <Gauge size={14} /> Data Produksi & OEE
                  <span className="text-[10px] font-normal text-sky-500 normal-case">(opsional)</span>
                </span>
                {oeeOpen ? <ChevronDown size={16} className="text-sky-600" /> : <ChevronRight size={16} className="text-sky-600" />}
              </button>
              {oeeOpen && (
                <div className="p-4 space-y-4">
                  {/* Shift window + break */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Jam Shift Mulai</label>
                      <input
                        type="datetime-local"
                        value={plannedStart}
                        onChange={e => setPlannedStart(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Jam Shift Selesai</label>
                      <input
                        type="datetime-local"
                        value={plannedEnd}
                        onChange={e => setPlannedEnd(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Istirahat Mulai</label>
                      <input
                        type="datetime-local"
                        value={breakStart}
                        onChange={e => setBreakStart(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Istirahat Selesai</label>
                      <input
                        type="datetime-local"
                        value={breakEnd}
                        onChange={e => setBreakEnd(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Shift</label>
                      <Select
                        value={shift}
                        onChange={e => setShift(e.target.value)}
                        className="w-full"
                      >
                        <option value="">— Pilih shift —</option>
                        <option value="1">Shift 1</option>
                        <option value="2">Shift 2</option>
                        <option value="3">Shift 3</option>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Kepala Shift</label>
                      <input
                        type="text"
                        value={shiftLead}
                        onChange={e => setShiftLead(e.target.value)}
                        placeholder="Nama kepala shift"
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Jumlah MP (orang)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={manpowerCount}
                        onChange={e => setManpowerCount(e.target.value)}
                        placeholder="Misal: 4"
                        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>

                  {/* Mesin list (B2 multi-machine, parallel) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Mesin (paralel)</h4>
                      <button
                        type="button"
                        onClick={addMachine}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                      >
                        <Plus size={13} /> Tambah Mesin
                      </button>
                    </div>
                    {runMachines.length === 0 ? (
                      <p className="text-[11px] text-gray-400">
                        Belum ada mesin. Tambah mesin untuk menghitung OEE per mesin + agregat line.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {runMachines.map((m, idx) => {
                          const machine = machineById.get(m.machineId);
                          return (
                            <div key={idx} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/50 space-y-2">
                              <div className="flex gap-2 items-center">
                                <Select
                                  value={m.machineId}
                                  onChange={e => updateMachine(idx, { machineId: e.target.value })}
                                  className="flex-1 min-w-0"
                                >
                                  <option value="">— Pilih mesin —</option>
                                  {machines.map(opt => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.code} — {opt.name}
                                      {opt.idealRatePerHour != null ? ` (${Number(opt.idealRatePerHour).toLocaleString('id-ID')} ${opt.unit}/jam)` : ''}
                                    </option>
                                  ))}
                                </Select>
                                <button
                                  type="button"
                                  onClick={() => removeMachine(idx)}
                                  className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Mulai Mesin</label>
                                  <input
                                    type="datetime-local"
                                    value={m.startAt}
                                    onChange={e => updateMachine(idx, { startAt: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Selesai Mesin</label>
                                  <input
                                    type="datetime-local"
                                    value={m.endAt}
                                    onChange={e => updateMachine(idx, { endAt: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                                  />
                                </div>
                              </div>
                              {m.machineId && machine && machine.idealRatePerHour == null && (
                                <p className="text-[10px] text-amber-600">
                                  Mesin ini belum punya kapasitas ideal — Performance OEE tidak terhitung.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Output derived from Input/Output lines (read-only). Quality
                      = (produk + samping) / input; only loss reduces it. */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Output (otomatis dari baris Input/Output)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <OeeQtyChip label="Input" value={oeePreview?.summary.inputQty ?? 0} />
                      <OeeQtyChip label="Produk" value={oeePreview?.summary.produkQty ?? 0} />
                      <OeeQtyChip label="Samping" value={oeePreview?.summary.sampingQty ?? 0} />
                      <OeeQtyChip label="Loss" value={oeePreview?.summary.lossQty ?? 0} tone="rose" />
                      <OeeQtyChip
                        label="Yield"
                        text={oeePreview?.summary.yieldPct != null ? `${oeePreview.summary.yieldPct.toFixed(1)}%` : '—'}
                        tone="emerald"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      Quality OEE = (Produk + Samping) / Input. Hanya selisih hilang (loss) yang menurunkan Quality.
                    </p>
                  </div>

                  {/* Downtime list (with optional per-machine attribution) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">Downtime</h4>
                      <button
                        type="button"
                        onClick={addDowntime}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium"
                      >
                        <Plus size={13} /> Tambah Downtime
                      </button>
                    </div>
                    {downtimes.length === 0 ? (
                      <p className="text-[11px] text-gray-400">
                        Belum ada downtime. Downtime per mesin mengurangi waktu jalan mesin tsb (Availability).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {downtimes.map((d, idx) => (
                          <div key={idx} className="border border-gray-100 rounded-lg p-2 bg-gray-50/50 flex flex-wrap gap-2 items-center">
                            <Select
                              value={d.machineId}
                              onChange={e => updateDowntime(idx, { machineId: e.target.value })}
                              className="max-w-[160px]"
                            >
                              <option value="">— Semua / line —</option>
                              {runMachines.filter(m => m.machineId).map(m => {
                                const opt = machineById.get(m.machineId);
                                return (
                                  <option key={m.machineId} value={m.machineId}>
                                    {opt ? `${opt.code} — ${opt.name}` : m.machineId}
                                  </option>
                                );
                              })}
                            </Select>
                            <Select
                              value={d.category}
                              onChange={e => updateDowntime(idx, { category: e.target.value })}
                              className="w-full"
                            >
                              {DOWNTIME_CATEGORIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </Select>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={d.durationMin}
                                onChange={e => updateDowntime(idx, { durationMin: e.target.value })}
                                placeholder="Durasi"
                                className="w-24 text-xs py-1.5 px-2 border border-gray-200 rounded font-mono bg-white"
                              />
                              <span className="text-[10px] text-gray-400">menit</span>
                            </div>
                            <input
                              type="text"
                              value={d.reason}
                              onChange={e => updateDowntime(idx, { reason: e.target.value })}
                              placeholder="Alasan (opsional)"
                              className="flex-1 min-w-[120px] text-xs py-1.5 px-2 border border-gray-200 rounded bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => removeDowntime(idx)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* OEE preview: per-machine table + line aggregate. Shown
                      only when there's at least one machine or a computable
                      line metric (the derived qty summary above always shows). */}
                  {oeePreview && (
                    oeePreview.machines.length > 0 ||
                    oeePreview.line.availabilityPct != null ||
                    oeePreview.line.performancePct != null ||
                    oeePreview.line.qualityPct != null
                  ) && (
                    <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Gauge size={13} className="text-sky-700" />
                        <span className="text-xs font-bold text-sky-800 uppercase tracking-wide">
                          Estimasi OEE
                        </span>
                      </div>
                      {oeePreview.machines.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-sky-700 text-left">
                                <th className="font-semibold py-1 pr-2">Mesin</th>
                                <th className="font-semibold py-1 px-1 text-right">Jam jalan</th>
                                <th className="font-semibold py-1 px-1 text-right">Alokasi</th>
                                <th className="font-semibold py-1 px-1 text-right">A</th>
                                <th className="font-semibold py-1 px-1 text-right">P</th>
                                <th className="font-semibold py-1 px-1 text-right">Q</th>
                                <th className="font-semibold py-1 pl-1 text-right">OEE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {oeePreview.machines.map((m, i) => (
                                <tr key={i} className="border-t border-sky-100 text-sky-900">
                                  <td className="py-1 pr-2 truncate max-w-[120px]">{m.label}</td>
                                  <td className="py-1 px-1 text-right font-mono">{m.runMin.toLocaleString('id-ID', { maximumFractionDigits: 1 })} m</td>
                                  <td className="py-1 px-1 text-right font-mono">{m.allocatedQty.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</td>
                                  <td className="py-1 px-1 text-right font-mono">{m.availabilityPct != null ? `${m.availabilityPct.toFixed(1)}%` : '—'}</td>
                                  <td className="py-1 px-1 text-right font-mono">{m.performancePct != null ? `${m.performancePct.toFixed(1)}%` : '—'}</td>
                                  <td className="py-1 px-1 text-right font-mono">{m.qualityPct != null ? `${m.qualityPct.toFixed(1)}%` : '—'}</td>
                                  <td className="py-1 pl-1 text-right font-mono font-bold">{m.oeePct != null ? `${m.oeePct.toFixed(1)}%` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide mb-1">Line (agregat)</p>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          <OeePreviewMetric label="Availability" pct={oeePreview.line.availabilityPct} />
                          <OeePreviewMetric label="Performance" pct={oeePreview.line.performancePct} />
                          <OeePreviewMetric label="Quality" pct={oeePreview.line.qualityPct} />
                          <OeePreviewMetric label="OEE" pct={oeePreview.line.oeePct} highlight />
                        </div>
                      </div>
                      <p className="text-[10px] text-sky-700">
                        Estimasi — server menghitung ulang saat disimpan.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Traceability: proses produksi yg dijalankan (multiselect, optional) */}
            {allProcesses.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                    Proses Yang Dijalankan
                  </h3>
                  <span className="text-[10px] text-gray-400">
                    {processIds.length > 0
                      ? `${processIds.length} dipilih`
                      : 'opsional · traceability saja'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allProcesses.map(p => {
                    const active = processIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProcess(p.id)}
                        title={p.description || undefined}
                        className={
                          active
                            ? 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-purple-500 bg-purple-100 text-purple-800 transition-colors'
                            : 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 transition-colors'
                        }
                      >
                        <span className={active ? 'inline-block w-1.5 h-1.5 rounded-full bg-purple-600' : 'inline-block w-1.5 h-1.5 rounded-full bg-gray-300'} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Klik untuk pilih/batal. Hanya untuk catatan traceability — tidak posting GL, tidak
                  pengaruhi HPP. Master diatur di tab <span className="font-semibold">Master Proses</span>.
                </p>
              </div>
            )}

            {/* Phase 3: Cost components — Input side.
                usedStandardIds: standar yg sudah dipakai di baris lain SISI ini
                tidak muncul lagi di dropdown (cegah double-entry). */}
            <CostSectionUI
              title="Biaya Produksi (Sisi Input)"
              hint="Contoh: Listrik mesin giling per Kg gabah masuk. Tidak posting GL — informational saja."
              rows={inputCostRows}
              standards={standards.filter(s => s.costSide === 'InputSide')}
              usedStandardIds={new Set(inputCostRows.map(r => r.c.standardId).filter(Boolean))}
              onAdd={() => addCost('InputSide')}
              onRemove={removeCost}
              onUpdate={updateCost}
              onPickStandard={applyStandardToCost}
              computeTotal={computeCostTotal}
            />

            {/* Phase 3: Cost components — Output side */}
            <CostSectionUI
              title="Biaya Produksi (Sisi Output)"
              hint="Contoh: Biaya kirim hasil ke gudang per Kg beras."
              rows={outputCostRows}
              standards={standards.filter(s => s.costSide === 'OutputSide')}
              usedStandardIds={new Set(outputCostRows.map(r => r.c.standardId).filter(Boolean))}
              onAdd={() => addCost('OutputSide')}
              onRemove={removeCost}
              onUpdate={updateCost}
              onPickStandard={applyStandardToCost}
              computeTotal={computeCostTotal}
            />

            {/* Phase 3: HPP summary */}
            {(totalMainOutputQty > 0 || costs.length > 0) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calculator size={14} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                    HPP Loaded (auto-calculated)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  <span className="text-gray-600">Biaya Material</span>
                  <span className="text-right font-mono text-gray-900">
                    Rp {fmtRupiah(totalMaterialCostPreview)}
                  </span>
                  <span className="text-gray-600">+ Biaya Sisi Input</span>
                  <span className="text-right font-mono text-gray-900">
                    Rp {fmtRupiah(totalCostInputSidePreview)}
                  </span>
                  <span className="text-gray-600">+ Biaya Sisi Output</span>
                  <span className="text-right font-mono text-gray-900">
                    Rp {fmtRupiah(totalCostOutputSidePreview)}
                  </span>
                  <span className="text-gray-600">− Nilai Produk Samping (NRV)</span>
                  <span className="text-right font-mono text-gray-900">
                    Rp {fmtRupiah(totalByproductValuePreview)}
                  </span>
                </div>
                <div className="border-t border-emerald-200 pt-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-emerald-800">
                    HPP per Kg main output ({totalMainOutputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })} Kg):
                  </span>
                  <span className="text-base font-bold text-emerald-900 font-mono">
                    Rp {fmtRupiah(previewHpp)}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasOverride}
                      onChange={(e) => setHppOverride(e.target.checked ? String(autoHpp.toFixed(4)) : '')}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-gray-600">Override manual HPP</span>
                  </label>
                  {hasOverride && (
                    <input
                      type="number"
                      step="0.0001"
                      value={hppOverride}
                      onChange={(e) => setHppOverride(e.target.value)}
                      placeholder="Override Rp/Kg"
                      className="text-xs px-2 py-1 border border-gray-200 rounded font-mono w-32 bg-white"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Yield summary */}
            {yieldPct !== null && (
              <div className="bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-800">
                <span className="font-semibold">Yield: </span>
                {yieldPct}%
                <span className="text-blue-600 ml-1">
                  ({totalMainOutputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                  {' / '}
                  {totalInputQty.toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                  {' '}
                  {getItemById(inputs[0]?.itemId)?.unit ?? 'Kg'})
                </span>
                {outputs.some(o => o.isByProduct && parseFloat(o.quantity) > 0) && (
                  <span className="text-amber-700 ml-2 text-xs">
                    (produk samping tidak dihitung)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Admin override: izinkan stok minus */}
          {isAdmin && (
            <div className="mx-6 mt-2 mb-0 p-3 border border-amber-200 bg-amber-50/40 rounded-lg space-y-2">
              <label className="flex items-start gap-2 cursor-pointer text-xs text-amber-900">
                <input
                  type="checkbox"
                  checked={allowNegativeStock}
                  onChange={(e) => setAllowNegativeStock(e.target.checked)}
                  className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <strong>Admin override:</strong> izinkan stok bahan baku minus
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                    Pakai saat produksi backdate / barang fisik sudah keluar tapi system belum tahu. Audit log dicatat.
                  </span>
                </span>
              </label>
              {allowNegativeStock && (
                <textarea
                  value={negativeStockReason}
                  onChange={(e) => setNegativeStockReason(e.target.value)}
                  placeholder="Alasan bypass (min 10 karakter): contoh 'Output 50 ton sudah dikirim ke customer Garuda + Walemu, input produksi menyusul'"
                  className="w-full text-xs border border-amber-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  rows={2}
                  required
                />
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary min-w-[120px]"
            >
              {isSubmitting ? 'Menyimpan...' : editRun ? 'Simpan Perubahan' : 'Simpan Produksi'}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-component: derived qty chip (read-only OEE output summary) ──────────
function OeeQtyChip({
  label, value, text, tone,
}: { label: string; value?: number; text?: string; tone?: 'rose' | 'emerald' }) {
  const labelCls =
    tone === 'rose' ? 'text-rose-500' : tone === 'emerald' ? 'text-emerald-600' : 'text-gray-400';
  const valueCls =
    tone === 'rose' ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-gray-800';
  const display =
    text != null ? text : (value ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 3 });
  return (
    <div className="rounded-md bg-white border border-gray-100 px-1.5 py-1.5">
      <p className={`text-[9px] font-semibold uppercase tracking-wide truncate ${labelCls}`}>{label}</p>
      <p className={`text-sm font-semibold font-mono ${valueCls}`}>{display}</p>
    </div>
  );
}

// ─── Sub-component: OEE preview metric ───────────────────────────────────────
function OeePreviewMetric({ label, pct, highlight }: { label: string; pct: number | null; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-lg bg-sky-100 px-1.5 py-2' : 'px-1.5 py-2'}>
      <p className="text-[9px] font-semibold text-sky-600 uppercase tracking-wide truncate">{label}</p>
      <p className={highlight ? 'text-base font-bold text-sky-900 font-mono' : 'text-sm font-semibold text-sky-800 font-mono'}>
        {pct != null ? `${pct.toFixed(1)}%` : '—'}
      </p>
    </div>
  );
}

// ─── Sub-component: Cost section (input-side or output-side) ─────────────────
interface CostSectionProps {
  title: string;
  hint: string;
  rows: { c: CostLine; idx: number }[];
  standards: CostStandard[];
  usedStandardIds: Set<string>;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<CostLine>) => void;
  onPickStandard: (idx: number, standardId: string) => void;
  computeTotal: (c: CostLine) => number;
}

function CostSectionUI({
  title, hint, rows, standards, usedStandardIds, onAdd, onRemove, onUpdate, onPickStandard, computeTotal,
}: CostSectionProps) {
  const sectionTotal = rows.reduce((s, { c }) => s + computeTotal(c), 0);
  // Tombol "Tambah Biaya" tetap aktif walau semua standar terpakai — staff
  // masih bisa input manual (standardId = '').
  const hasMoreStandards = standards.length > usedStandardIds.size;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <Plus size={13} /> Tambah Biaya
        </button>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(({ c, idx }) => {
            // Standar yg sudah dipakai di baris lain disembunyikan; baris ini
            // tetap bisa lihat pilihannya sendiri.
            const availableStandards = standards.filter(
              s => !usedStandardIds.has(s.id) || s.id === c.standardId,
            );
            return (
            <div key={idx} className="border border-gray-100 rounded-lg p-2 bg-gray-50/50 space-y-1.5">
              <div className="flex gap-2 items-center">
                <Select
                  value={c.standardId}
                  onChange={(e) => onPickStandard(idx, e.target.value)}
                  className="flex-1 min-w-0"
                >
                  <option value="">— Manual (free input) —</option>
                  {availableStandards.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (default Rp {Number(s.defaultRate)})
                    </option>
                  ))}
                </Select>
                {/* Lebar tetap — w-full di flex row menjepit picker standar
                    (flex-1 min-w-0) sampai 0px sejak sweep dropdown custom. */}
                <Select
                  value={c.basis}
                  onChange={(e) => onUpdate(idx, { basis: e.target.value as CostLine['basis'] })}
                  className="w-32 shrink-0"
                >
                  <option value="InputQty">× qty input</option>
                  <option value="OutputQty">× qty output</option>
                  <option value="Fixed">Flat (run)</option>
                </Select>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={c.description}
                  onChange={(e) => onUpdate(idx, { description: e.target.value, standardId: '' })}
                  placeholder="Keterangan..."
                  className="flex-1 text-xs py-1 px-2 border border-gray-200 rounded bg-white"
                />
                <input
                  type="number"
                  step="0.0001"
                  value={c.rate}
                  onChange={(e) => onUpdate(idx, { rate: e.target.value, standardId: '' })}
                  placeholder="Rate"
                  className="w-24 text-xs py-1 px-2 border border-gray-200 rounded font-mono bg-white"
                />
                <span className="text-[10px] text-gray-400 whitespace-nowrap font-mono">
                  = Rp {fmtRupiah(computeTotal(c))}
                </span>
              </div>
            </div>
            );
          })}
          <div className="text-right text-xs text-gray-500 font-mono pr-1">
            Subtotal: <span className="font-semibold text-gray-700">Rp {fmtRupiah(sectionTotal)}</span>
          </div>
        </div>
      )}
      {!hasMoreStandards && standards.length > 0 && rows.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-1.5">
          Semua master standar di sisi ini sudah dipakai. Tambah baris berikutnya hanya bisa pakai mode manual (free input).
        </p>
      )}
    </div>
  );
}

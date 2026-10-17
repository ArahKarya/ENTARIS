import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { LOCALE } from '@/lib/format';
import type { Batch } from './overlays/BatchSelect';
import { cap } from '../lib/permissions';
import { fetchBatches, allocateFifo } from '../lib/fifoAllocate';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DateInput, Field, type ComboboxOption } from '@/components/shared';
import { PinnedBody, PinnedFooter, PinnedHeader, pinnedDialogClass } from '@/components/overlays/dialog-parts';
import { WarehouseSelectField } from '@/components/overlays/WarehouseSelectField';
import { RunInputsSection, RunOutputsSection } from './production/RunLinesSections';
import { useRunFormLookups } from './production/useRunFormLookups';
import { RunOeeSection } from './production/RunOeeSection';
import {
  RunCostSection,
  RunHppSummary,
  RunNegativeStockOverride,
  RunProcessPicker,
  RunYieldSummary,
} from './production/RunCostSections';
import {
  computeOeePreview,
  dateAtTime,
  toLocalInput,
  type CostLine,
  type DowntimeLine,
  type LineItem,
  type MachineLine,
  type OutputLineItem,
} from './production/run-form-utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  editRun?: any | null;
  // Resubmit mode: hydrate from the create-body payload and submit to the resubmit endpoint.
  prefillPayload?: any | null;
  resubmitRequestId?: string | null;
  // Draft mode: saving updates the draft (PUT) and never posts. With no draft,
  // editRun or resubmit, saving creates a new draft.
  draft?: { id: string; draftNumber: string; lastError?: string | null } | null;
}

const DRAFTS_ENDPOINT = '/inventory/production-runs/drafts';
const today = () => new Date().toISOString().split('T')[0];

export function ProductionRunModal({ isOpen, onClose, items, editRun, prefillPayload, resubmitRequestId, draft }: Props) {
  const { t } = useTranslation('production');
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
  // OEE capture (multi-machine)
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
  const errorsRef = useRef<HTMLDivElement>(null);
  // Bring validation errors into view and announce them (the body scrolls).
  useEffect(() => {
    if (errors.length > 0) errorsRef.current?.focus();
  }, [errors]);

  // Reset form when opened (prefill if editing)
  useEffect(() => {
    if (isOpen) {
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
        setAllowNegativeStock(!!p.allowNegativeStock);
        setNegativeStockReason(typeof p.negativeStockReason === 'string' ? p.negativeStockReason : '');
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
      if (editRun && Array.isArray(editRun.runProcesses)) {
        setProcessIds(
          editRun.runProcesses
            .map((rp: any) => rp.processId ?? rp.process?.id)
            .filter(Boolean),
        );
      } else {
        setProcessIds([]);
      }
      // OEE capture: prefill on edit, reset on create.
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

  const { standards, allProcesses, machines, machineById } = useRunFormLookups(isOpen, warehouseId);

  const toggleProcess = (id: string) => {
    setProcessIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const itemOptions = useMemo((): ComboboxOption[] =>
    items.filter((i: any) => i.isActive !== false).map((i: any) => ({
      value: i.id,
      label: `${i.code} · ${i.name}`,
    })),
    [items],
  );

  // OEE preview is cosmetic; the server re-computes on submit.
  const oeePreview = useMemo(
    () => computeOeePreview({ plannedStart, plannedEnd, breakStart, breakEnd, runMachines, downtimes, inputs, outputs, machineById }),
    [plannedStart, plannedEnd, breakStart, breakEnd, runMachines, downtimes, inputs, outputs, machineById],
  );

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
  // FIFO auto-split: one row per batch; any shortfall becomes a no-batch row (WAC
  // fallback, valid on the server). Batches claimed by other rows are not reused.
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
        toast.error(t('productionRunModal.noBatches'));
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
        toast.warning(t('productionRunModal.batchShortfall', { qty: shortfall.toLocaleString(LOCALE) }));
      } else {
        toast.success(t('productionRunModal.batchSplit', { count: allocations.length }));
      }
      setInputs(prev => [...prev.slice(0, idx), ...newRows, ...prev.slice(idx + 1)]);
    } catch {
      toast.error(t('productionRunModal.batchLoadFailed'));
    }
  };

  const addInput = () => setInputs(prev => [...prev, { itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
  const removeInput = (idx: number) => setInputs(prev => prev.filter((_, i) => i !== idx));
  const addOutput = () => setOutputs(prev => [...prev, { itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const removeOutput = (idx: number) => setOutputs(prev => prev.filter((_, i) => i !== idx));

  // New machine rows default to the shift window; staff edit only when a machine ran a different span.
  const addMachine = () => setRunMachines(prev => [
    ...prev,
    { machineId: '', startAt: plannedStart, endAt: plannedEnd },
  ]);
  const removeMachine = (idx: number) => setRunMachines(prev => prev.filter((_, i) => i !== idx));
  const updateMachine = (idx: number, patch: Partial<MachineLine>) =>
    setRunMachines(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

  const addDowntime = () => setDowntimes(prev => [...prev, { machineId: '', category: 'Breakdown', durationMin: '', reason: '' }]);
  const removeDowntime = (idx: number) => setDowntimes(prev => prev.filter((_, i) => i !== idx));
  const updateDowntime = (idx: number, patch: Partial<DowntimeLine>) =>
    setDowntimes(prev => prev.map((row, i) => i === idx ? { ...row, ...patch } : row));

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

  // Yield = main output / total input (by-products excluded).
  const totalInputQty = inputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalMainOutputQty = outputs
    .filter(o => !o.isByProduct)
    .reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const yieldPct = totalInputQty > 0 && totalMainOutputQty > 0
    ? ((totalMainOutputQty / totalInputQty) * 100).toFixed(1)
    : null;

  // Live HPP preview mirrors the server logic; the server re-computes authoritatively.
  const totalMaterialCostPreview = inputs.reduce((s, r) => {
    const qty = parseFloat(r.quantity) || 0;
    let unitCost = parseFloat(r.batchUnitCost) || 0;
    if (!r.batchUnitCost) {
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


  const handleSubmit = async (e: React.FormEvent, postAfterSave = false) => {
    e.preventDefault();
    setErrors([]);

    const errs: string[] = [];
    if (!date) errs.push(t('productionRunModal.errors.dateRequired'));
    if (!warehouseId) errs.push(t('productionRunModal.errors.warehouseRequired'));
    const validInputs = inputs.filter(i => i.itemId && i.quantity && parseFloat(i.quantity) > 0);
    const validOutputs = outputs.filter(o => o.itemId && o.quantity && parseFloat(o.quantity) > 0);
    if (validInputs.length === 0) errs.push(t('productionRunModal.errors.inputRequired'));
    if (validOutputs.length === 0) errs.push(t('productionRunModal.errors.outputRequired'));
    // By-products require an explicit NRV. Main outputs may omit unitPrice; the
    // server back-fills it from loaded HPP.
    validOutputs.forEach((o, i) => {
      if (o.isByProduct && (!o.unitPrice || parseFloat(o.unitPrice) < 0)) {
        errs.push(t('productionRunModal.errors.byProductNrv', { n: i + 1 }));
      }
    });
    if (allowNegativeStock && negativeStockReason.trim().length < 10) {
      errs.push(t('productionRunModal.errors.bypassReason'));
    }
    if (plannedStart && plannedEnd && new Date(plannedEnd).getTime() <= new Date(plannedStart).getTime()) {
      errs.push(t('productionRunModal.errors.shiftEndBeforeStart'));
    }
    runMachines.forEach((m, i) => {
      if (m.startAt && m.endAt && new Date(m.endAt).getTime() <= new Date(m.startAt).getTime()) {
        errs.push(t('productionRunModal.errors.machineEndBeforeStart', { n: i + 1 }));
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
        // OEE capture (all optional)
        plannedStart: plannedStart ? new Date(plannedStart).toISOString() : null,
        plannedEnd: plannedEnd ? new Date(plannedEnd).toISOString() : null,
        breakStart: breakStart ? new Date(breakStart).toISOString() : null,
        breakEnd: breakEnd ? new Date(breakEnd).toISOString() : null,
        shift: shift || null,
        shiftLead: shiftLead.trim() || null,
        manpowerCount: manpowerCount.trim() ? parseInt(manpowerCount, 10) : null,
        // OEE quality is derived server-side from the input/output lines.
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
      let editPending = false;
      let resubmitted = false;
      let draftSaved: { draft?: { draftNumber?: string }; warnings?: string[] } | null = null;
      if (resubmitRequestId) {
        await api.put(`/approvals/requests/${resubmitRequestId}/resubmit`, { payload: fullPayload });
        resubmitted = true;
      } else if (editRun) {
        const res = await api.put(`/inventory/production-runs/${editRun.id}`, fullPayload);
        editPending = res.data?.pendingApproval === true;
      } else if (draft) {
        const res = await api.put(`${DRAFTS_ENDPOINT}/${draft.id}`, fullPayload);
        draftSaved = res.data;
      } else {
        const res = await api.post('/inventory/production-runs', fullPayload);
        if (res.data?.draft) draftSaved = res.data;
        else pendingApproval = res.data?.pendingApproval === true;
      }
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['production-run-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['approval-pending'] });
      if (draftSaved && postAfterSave) {
        const draftId = draft?.id ?? (draftSaved.draft as { id?: string } | undefined)?.id;
        const number = draftSaved.draft?.draftNumber ?? draft?.draftNumber ?? '';
        if (!draftId) {
          toast.warning(t('productionRunModal.toast.postAfterSaveNoId', { number }));
        } else {
          try {
            const posted = await api.post(`${DRAFTS_ENDPOINT}/${draftId}/post`);
            queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
            queryClient.invalidateQueries({ queryKey: ['approval-pending'] });
            toast.success(
              posted.data?.pendingApproval
                ? t('productionRunModal.toast.postedPending', { number })
                : t('productionRunModal.toast.posted', { number, run: posted.data?.runNumber ?? '' }),
            );
          } catch (postErr) {
            // Draft sudah tersimpan; hanya posting yang gagal. Jangan hilangkan perubahan user.
            toast.error(
              `${t('productionRunModal.toast.draftSavedPostFailed', { number })} ${(postErr as { response?: { data?: { error?: string } } }).response?.data?.error ?? ''}`.trim(),
            );
          }
        }
      } else if (draftSaved) {
        toast.success(t('productionRunModal.toast.draftSaved', { number: draftSaved.draft?.draftNumber ?? '' }));
        for (const w of draftSaved.warnings ?? []) toast.warning(w);
      } else if (editPending) {
        // The edit is only queued for approval, so no optimistic update.
        toast.success(t('productionRunModal.toast.editPending'));
      } else if (resubmitted) {
        toast.success(t('productionRunModal.toast.resubmitted'));
      } else if (pendingApproval) {
        toast.success(t('productionRunModal.toast.pendingApproval'));
      } else {
        toast.success(editRun ? t('productionRunModal.toast.updated') : t('productionRunModal.toast.recorded'));
      }
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || (editRun ? t('productionRunModal.toast.editFailed') : resubmitRequestId ? t('productionRunModal.toast.resubmitFailed') : t('productionRunModal.toast.saveDraftFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const unit = getItemById(inputs[0]?.itemId)?.unit ?? 'Kg';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent size="lg" className={pinnedDialogClass}>
        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <PinnedHeader>
            <DialogTitle>
              {editRun ? t('productionRunModal.titleEdit', { number: editRun.runNumber }) : draft ? t('productionRunModal.titleEditDraft', { number: draft.draftNumber }) : resubmitRequestId ? t('productionRunModal.titleResubmit') : t('productionRunModal.titleNew')}
            </DialogTitle>
            <DialogDescription>
              {editRun || resubmitRequestId
                ? t('productionRunModal.descriptionEdit')
                : t('productionRunModal.descriptionDraft')}
            </DialogDescription>
          </PinnedHeader>

          <PinnedBody className="space-y-5">
            {draft?.lastError && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger-text">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium">{t('productionRunModal.lastErrorTitle')}</p>
                  <p className="break-words">{draft.lastError}</p>
                </div>
              </div>
            )}
            {errors.length > 0 && (
              <div
                ref={errorsRef}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger-text focus-visible:outline-none"
              >
                <ul className="space-y-1">
                  {errors.map((e, i) => (
                    <li key={i}>{'\u2022'} {e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('productionRunModal.date')} required>
                <DateInput value={date} onChange={setDate} />
              </Field>
              <WarehouseSelectField
                label={t('productionRunModal.warehouse')}
                required
                value={warehouseId}
                onChange={setWarehouseId}
                autoDefault
                placeholder={t('productionRunModal.warehousePlaceholder')}
              />
              <Field label={t('productionRunModal.reference')}>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder={t('productionRunModal.referencePlaceholder')}
                />
              </Field>
            </div>

            <Field label={t('productionRunModal.notes')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t('productionRunModal.notesPlaceholder')} className="resize-none" />
            </Field>

            <RunInputsSection
              inputs={inputs}
              itemOptions={itemOptions}
              warehouseId={warehouseId}
              getItemById={getItemById}
              onUpdate={updateInput}
              onPickBatch={onPickBatch}
              onSplit={(idx) => void splitInputRow(idx)}
              onAdd={addInput}
              onRemove={removeInput}
            />

            <RunOutputsSection
              outputs={outputs}
              itemOptions={itemOptions}
              getItemById={getItemById}
              totalInputQty={totalInputQty}
              autoHpp={autoHpp}
              onUpdate={updateOutput}
              onAdd={addOutput}
              onRemove={removeOutput}
            />

            <RunOeeSection
              open={oeeOpen}
              onToggle={() => setOeeOpen((o) => !o)}
              plannedStart={plannedStart}
              plannedEnd={plannedEnd}
              breakStart={breakStart}
              breakEnd={breakEnd}
              shift={shift}
              shiftLead={shiftLead}
              manpowerCount={manpowerCount}
              onPlannedStart={setPlannedStart}
              onPlannedEnd={setPlannedEnd}
              onBreakStart={setBreakStart}
              onBreakEnd={setBreakEnd}
              onShift={setShift}
              onShiftLead={setShiftLead}
              onManpowerCount={setManpowerCount}
              runMachines={runMachines}
              machines={machines}
              machineById={machineById}
              onAddMachine={addMachine}
              onRemoveMachine={removeMachine}
              onUpdateMachine={updateMachine}
              downtimes={downtimes}
              onAddDowntime={addDowntime}
              onRemoveDowntime={removeDowntime}
              onUpdateDowntime={updateDowntime}
              preview={oeePreview}
            />

            {allProcesses.length > 0 && (
              <RunProcessPicker processes={allProcesses} selectedIds={processIds} onToggle={toggleProcess} />
            )}

            {/* Cost components. usedStandardIds: standards already used on another row of this side are hidden (prevents double entry). */}
            <RunCostSection
              title={t('productionRunModal.inputCostTitle')}
              hint={t('productionRunModal.inputCostHint')}
              rows={inputCostRows}
              standards={standards.filter((s) => s.costSide === 'InputSide')}
              usedStandardIds={new Set(inputCostRows.map((r) => r.c.standardId).filter(Boolean))}
              onAdd={() => addCost('InputSide')}
              onRemove={removeCost}
              onUpdate={updateCost}
              onPickStandard={applyStandardToCost}
              computeTotal={computeCostTotal}
            />
            <RunCostSection
              title={t('productionRunModal.outputCostTitle')}
              hint={t('productionRunModal.outputCostHint')}
              rows={outputCostRows}
              standards={standards.filter((s) => s.costSide === 'OutputSide')}
              usedStandardIds={new Set(outputCostRows.map((r) => r.c.standardId).filter(Boolean))}
              onAdd={() => addCost('OutputSide')}
              onRemove={removeCost}
              onUpdate={updateCost}
              onPickStandard={applyStandardToCost}
              computeTotal={computeCostTotal}
            />

            {(totalMainOutputQty > 0 || costs.length > 0) && (
              <RunHppSummary
                materialCost={totalMaterialCostPreview}
                costInputSide={totalCostInputSidePreview}
                costOutputSide={totalCostOutputSidePreview}
                byproductValue={totalByproductValuePreview}
                mainOutputQty={totalMainOutputQty}
                previewHpp={previewHpp}
                hasOverride={hasOverride}
                autoHpp={autoHpp}
                hppOverride={hppOverride}
                onHppOverride={setHppOverride}
              />
            )}

            {yieldPct !== null && (
              <RunYieldSummary
                yieldPct={yieldPct}
                mainOutputQty={totalMainOutputQty}
                inputQty={totalInputQty}
                unit={unit}
                hasByproduct={outputs.some((o) => o.isByProduct && parseFloat(o.quantity) > 0)}
              />
            )}

            {isAdmin && (
              <RunNegativeStockOverride
                allow={allowNegativeStock}
                reason={negativeStockReason}
                onAllow={setAllowNegativeStock}
                onReason={setNegativeStockReason}
              />
            )}
          </PinnedBody>

          <PinnedFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('productionRunModal.cancel')}
            </Button>
            {!editRun && !resubmitRequestId && (
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
              >
                {t('productionRunModal.saveAndPost')}
              </Button>
            )}
            <Button type="submit" loading={isSubmitting} className="min-w-[120px]">
              {isSubmitting ? t('productionRunModal.saving') : editRun ? t('productionRunModal.saveChanges') : resubmitRequestId ? t('productionRunModal.resubmit') : t('productionRunModal.saveDraft')}
            </Button>
          </PinnedFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

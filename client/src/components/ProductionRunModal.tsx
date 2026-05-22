import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Trash2, Calculator } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import SearchableSelect from './SearchableSelect';
import type { SelectOption } from './SearchableSelect';
import WarehousePicker from './WarehousePicker';
import BatchPicker from './BatchPicker';
import type { Batch } from './BatchPicker';

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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  editRun?: any | null;
}

const today = () => new Date().toISOString().split('T')[0];

export function ProductionRunModal({ isOpen, onClose, items, editRun }: Props) {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Reset form when opened (prefill if editing)
  useEffect(() => {
    if (isOpen) {
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
      setAllowNegativeStock(false);
      setErrors([]);
      setIsSubmitting(false);
    }
  }, [isOpen, editRun]);

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
  const addInput = () => setInputs(prev => [...prev, { itemId: '', quantity: '', sourceMovementId: '', batchUnitCost: '' }]);
  const removeInput = (idx: number) => setInputs(prev => prev.filter((_, i) => i !== idx));
  const addOutput = () => setOutputs(prev => [...prev, { itemId: '', quantity: '', unitPrice: '', isByProduct: false }]);
  const removeOutput = (idx: number) => setOutputs(prev => prev.filter((_, i) => i !== idx));

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
      };

      if (editRun) {
        await api.put(`/inventory/production-runs/${editRun.id}`, fullPayload);
      } else {
        await api.post('/inventory/production-runs', fullPayload);
      }
      queryClient.invalidateQueries({ queryKey: ['production-runs'] });
      queryClient.invalidateQueries({ queryKey: ['production-run-detail'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast.success(editRun ? 'Proses produksi berhasil diperbarui.' : 'Proses produksi berhasil dicatat.');
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
                          <BatchPicker
                            itemId={row.itemId}
                            warehouseId={warehouseId}
                            value={row.sourceMovementId}
                            onChange={(id, batch) => onPickBatch(idx, id, batch)}
                          />
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
                <select
                  value={c.standardId}
                  onChange={(e) => onPickStandard(idx, e.target.value)}
                  className="text-xs py-1 px-2 border border-gray-200 rounded bg-white flex-1 min-w-0"
                >
                  <option value="">— Manual (free input) —</option>
                  {availableStandards.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (default Rp {Number(s.defaultRate)})
                    </option>
                  ))}
                </select>
                <select
                  value={c.basis}
                  onChange={(e) => onUpdate(idx, { basis: e.target.value as CostLine['basis'] })}
                  className="text-xs py-1 px-2 border border-gray-200 rounded bg-white"
                >
                  <option value="InputQty">× qty input</option>
                  <option value="OutputQty">× qty output</option>
                  <option value="Fixed">Flat (run)</option>
                </select>
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

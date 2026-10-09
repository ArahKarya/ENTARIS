import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AlertCircle, FileText, Image as ImageIcon, Paperclip, Plus, Truck, X, AlertTriangle } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { PickerSelect, type PickerOption } from '@/components/sales-a/PickerSelect';
import { OptionSelect } from '@/components/sales-a/OptionSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import {
  FooterButton,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FormError,
  TableRegion,
} from '@/components/sales-a/overlay-parts';
import { formDialogClass, formShellClass, numberInputClass } from '@/components/sales-a/overlay-classes';
import { InvoiceLineRow, type InvoiceItem } from '@/components/sales-a/InvoiceLineRow';
import { InvoiceDOPicker, type PendingDO } from '@/components/sales-a/InvoiceDOPicker';


const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const defaultItem = (): InvoiceItem => ({
  id: crypto.randomUUID(), itemName: '', itemType: 'product', inventoryItemId: '', warehouseId: '', serviceItemId: '', accountId: '', description: '', quantity: 1, unit: 'Kg', rate: 0, discount: 0, taxPct: 0, pphPct: 0, deliveryOrderItemId: null, deliveryOrderNumber: undefined, sourceMovementId: '',
});

const SalesInvoiceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  prefillFromDO?: { doId: string; partyId: string } | null;
}> = ({ isOpen, onClose, prefillFromDO }) => {
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Net 30');
  const [customerRefNo, setCustomerRefNo] = useState(''); // No. PO / Penawaran pelanggan

  const calcDueDate = (baseDate: string, term: string): string => {
    const days = term === 'Cash' ? 0 : parseInt(term.replace('Net ', ''), 10) || 30;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const [potongan, setPotongan] = useState(0);     // deduction amount
  const [biayaLain, setBiayaLain] = useState(0);   // extra charge amount
  const [labelPotongan, setLabelPotongan] = useState('Potongan');
  const [labelBiaya, setLabelBiaya] = useState('Biaya Lain');
  const [items, setItems] = useState<InvoiceItem[]>([defaultItem()]);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [fromDOMode, setFromDOMode] = useState(false);
  const [selectedDOIds, setSelectedDOIds] = useState<string[]>([]);
  const [expandedDOIds, setExpandedDOIds] = useState<string[]>([]);

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-customers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Customer');
      return res.data.data ?? res.data;
    }
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  const { data: serviceItems } = useQuery({
    queryKey: ['service-items-active'],
    queryFn: async () => {
      const res = await api.get('/service-items?isActive=true');
      return res.data.data ?? res.data;
    },
  });

  const { data: pendingDOs } = useQuery<PendingDO[]>({
    queryKey: ['delivery-orders-pending', partyId],
    queryFn: async () => {
      if (!partyId) return [];
      const res = await api.get(`/delivery-orders/pending?partyId=${partyId}`);
      return res.data.data ?? res.data;
    },
    enabled: fromDOMode && !!partyId,
  });

  const selectedParty = parties?.find((p: any) => p.id === partyId);
  const isWapu = !!selectedParty?.isWapu;

  // Auto-zero tax_pct for all lines when WAPU customer is picked.
  // Pemerintah/BUMN WAPU memungut PPN sendiri ke kas negara — tagihan kita
  // tidak include PPN. (Mis. pelanggan BUMN pemungut PPN.)
  React.useEffect(() => {
    if (isWapu) {
      setItems((prev) => prev.map((it) => (it.taxPct > 0 ? { ...it, taxPct: 0 } : it)));
    }
  }, [isWapu]);

  // Deep-link dari Surat Jalan (/sales?fromDO=…): set pelanggan + mode "dari DO",
  // lalu auto-pilih DO-nya saat daftar pending termuat (efek di bawah).
  const [autoSelectDOId, setAutoSelectDOId] = useState<string | null>(null);
  React.useEffect(() => {
    if (isOpen && prefillFromDO) {
      setPartyId(prefillFromDO.partyId);
      setFromDOMode(true);
      setAutoSelectDOId(prefillFromDO.doId);
    }
  }, [isOpen, prefillFromDO]);

  const inventoryOptions = useMemo<PickerOption[]>(
    () =>
      (inventoryItems ?? []).map((inv: any) => ({
        value: inv.id,
        label: `${inv.code} · ${inv.name} (${inv.currentStock} ${inv.unit})`,
      })),
    [inventoryItems],
  );

  const serviceOptions = useMemo<PickerOption[]>(
    () =>
      (serviceItems ?? []).map((svc: any) => ({
        value: svc.id,
        label: `${svc.code} · ${svc.name} (${svc.unit})`,
      })),
    [serviceItems],
  );

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/sales/invoices', data);
      const invoice = res.data;
      if (stagedFiles.length > 0 && invoice?.id) {
        const fd = new FormData();
        fd.append('referenceType', 'sales_invoice');
        fd.append('referenceId', invoice.id);
        for (const f of stagedFiles) fd.append('files', f);
        try {
          await api.post('/attachments/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err) {
          console.warn('Upload lampiran gagal:', err);
        }
      }
      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['attachments'] });
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setPartyId('');
      setNotes('');
      setTerms('Net 30');
      setCustomerRefNo('');
      setPotongan(0);
      setBiayaLain(0);
      setLabelPotongan('Potongan');
      setLabelBiaya('Biaya Lain');
      setItems([defaultItem()]);
      setAllowNegativeStock(false);
      setStagedFiles([]);
      setError('');
      setFromDOMode(false);
      setSelectedDOIds([]);
      setExpandedDOIds([]);
      queryClient.invalidateQueries({ queryKey: ['delivery-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-orders-pending'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan invoice.')
  });

  const addItem = () => setItems([...items, defaultItem()]);
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    setItems(next);
  };
  const selectInventoryItem = (idx: number, inventoryId: string) => {
    const inv = inventoryItems?.find((i: any) => i.id === inventoryId);
    const next = [...items];
    if (inv) {
      next[idx] = { ...next[idx], inventoryItemId: inventoryId, itemName: inv.name, unit: inv.unit || 'Kg' };
    } else {
      next[idx] = { ...next[idx], inventoryItemId: '', itemName: '' };
    }
    setItems(next);
  };
  const selectServiceItem = (idx: number, serviceId: string) => {
    const svc = serviceItems?.find((s: any) => s.id === serviceId);
    const next = [...items];
    if (svc) {
      next[idx] = {
        ...next[idx],
        serviceItemId: serviceId,
        itemName: svc.name,
        unit: svc.unit || 'Jasa',
        rate: svc.defaultRate ? Number(svc.defaultRate) : next[idx].rate,
        accountId: svc.accountId || '',
      };
    } else {
      next[idx] = { ...next[idx], serviceItemId: '', itemName: '', accountId: '' };
    }
    setItems(next);
  };
  const toggleItemType = (idx: number, newType: 'product' | 'service') => {
    const next = [...items];
    next[idx] = {
      ...next[idx],
      itemType: newType,
      inventoryItemId: '',
      serviceItemId: '',
      accountId: '',
      itemName: '',
      unit: newType === 'service' ? 'Jasa' : 'Kg',
      rate: 0,
    };
    setItems(next);
  };

  const toggleDOSelection = (doId: string) => {
    const doc = pendingDOs?.find((d) => d.id === doId);
    if (!doc) return;

    if (selectedDOIds.includes(doId)) {
      // Deselect → remove all rows linked to this DO
      setSelectedDOIds(selectedDOIds.filter((id) => id !== doId));
      const itemIdsToRemove = new Set(doc.items.map((it) => it.id));
      const remaining = items.filter(
        (row) => !row.deliveryOrderItemId || !itemIdsToRemove.has(row.deliveryOrderItemId),
      );
      setItems(remaining.length > 0 ? remaining : [defaultItem()]);
    } else {
      // Select → push DO items as invoice rows
      setSelectedDOIds([...selectedDOIds, doId]);
      const newRows: InvoiceItem[] = doc.items.map((doi) => ({
        id: crypto.randomUUID(),
        itemName: doi.itemName || doi.inventoryItem?.name || '',
        itemType: 'product',
        inventoryItemId: doi.inventoryItemId,
        warehouseId: doi.warehouseId,
        serviceItemId: '',
        accountId: '',
        description: doi.description ?? '',
        quantity: Number(doi.quantity) || 0,
        unit: doi.unit,
        // Harga jual & diskon diturunkan dari SO (via salesOrderItem) agar tak
        // perlu ketik ulang; tetap bisa diedit di tabel.
        rate: Number(doi.salesOrderItem?.rate) || 0,
        discount: Number(doi.salesOrderItem?.discount) || 0,
        taxPct: 0,
        pphPct: 0,
        deliveryOrderItemId: doi.id,
        deliveryOrderNumber: doc.doNumber,
      }));
      // Drop any default empty row when adding first DO
      const base = items.filter(
        (row) => row.deliveryOrderItemId || row.itemName || row.inventoryItemId || row.serviceItemId,
      );
      setItems([...base, ...newRows]);
      // Auto-isi No. PO/SO di invoice (bila belum diisi manual): PO pelanggan
      // dari SO; kalau SO tak punya No. PO, pakai No. SO.
      if (!customerRefNo.trim()) {
        const ref = doc.salesOrder?.customerRefNo?.trim() || doc.salesOrder?.soNumber || '';
        if (ref) setCustomerRefNo(ref);
      }
    }
  };

  // Auto-pilih DO saat deep-link dari Surat Jalan, begitu daftar pending termuat.
  React.useEffect(() => {
    if (!autoSelectDOId) return;
    if (pendingDOs?.some((d) => d.id === autoSelectDOId) && !selectedDOIds.includes(autoSelectDOId)) {
      toggleDOSelection(autoSelectDOId);
      setAutoSelectDOId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectDOId, pendingDOs]);

  const toggleDOExpanded = (doId: string) => {
    setExpandedDOIds(
      expandedDOIds.includes(doId)
        ? expandedDOIds.filter((id) => id !== doId)
        : [...expandedDOIds, doId],
    );
  };

  const removeItemAt = (idx: number) => {
    const target = items[idx];
    if (target?.deliveryOrderItemId) {
      // If this is the last row tied to its DO, also unselect the DO.
      const targetDONumber = target.deliveryOrderNumber;
      const remainingRowsForDO = items.filter(
        (row, i) => i !== idx && row.deliveryOrderNumber === targetDONumber,
      );
      if (remainingRowsForDO.length === 0 && targetDONumber) {
        const matchingDO = pendingDOs?.find((d) => d.doNumber === targetDONumber);
        if (matchingDO) {
          setSelectedDOIds(selectedDOIds.filter((id) => id !== matchingDO.id));
        }
      }
    }
    const next = items.filter((_, i) => i !== idx);
    setItems(next.length > 0 ? next : [defaultItem()]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const f of files) {
      if (!ALLOWED_MIME.includes(f.type)) {
        setError(`${f.name}: tipe file tidak didukung (JPG/PNG/WebP/PDF).`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(`${f.name}: ukuran melebihi 5 MB.`);
        continue;
      }
      valid.push(f);
    }
    const merged = [...stagedFiles, ...valid].slice(0, MAX_ATTACHMENTS);
    setStagedFiles(merged);
    e.target.value = '';
  };
  const removeStagedFile = (idx: number) => setStagedFiles(stagedFiles.filter((_, i) => i !== idx));

  const lineTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.rate;
    return base - (base * (item.discount / 100));
  };
  const lineTax = (item: InvoiceItem) => lineTotal(item) * (item.taxPct / 100);
  const linePph = (item: InvoiceItem) => lineTotal(item) * (item.pphPct / 100);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const taxAmount = items.reduce((s, it) => s + lineTax(it), 0);
  const pphAmount = items.reduce((s, it) => s + linePph(it), 0);
  const grandTotal = subtotal + taxAmount - pphAmount - potongan + biayaLain;
  // Sum quantities only for rows that share a unit so the figure stays
  // meaningful (mixing Kg + Pcs would be misleading).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    if (!it.itemName || !it.quantity) return acc;
    const u = it.unit || 'Pcs';
    acc[u] = (acc[u] ?? 0) + it.quantity;
    return acc;
  }, {});

  // Policy (2026-05): inventory item HARUS via Surat Jalan. Direct-sale
  // dari invoice di-tolak backend, jadi lebih baik kasih guidance + cegah
  // submit dari client supaya tidak ke-throw error pertama kali.
  const orphanInventoryLines = items.filter(
    (i) => i.itemType === 'product' && i.inventoryItemId && !i.deliveryOrderItemId,
  );
  const hasOrphanInventory = orphanInventoryLines.length > 0;

  const canSubmit = partyId && items.some(i => i.itemName) && grandTotal >= 0 && !mutation.isPending
    && !hasOrphanInventory;

  const handleSave = () =>
    mutation.mutate({
      date: invoiceDate, dueDate, partyId, notes, terms,
      customerRefNo: customerRefNo || null,
      potongan, biayaLain, labelPotongan, labelBiaya,
      allowNegativeStock,
      items: items.map(i => ({
        ...i,
        itemType: i.itemType,
        inventoryItemId: i.inventoryItemId || null,
        warehouseId: i.itemType === 'product' ? (i.warehouseId || null) : null,
        serviceItemId: i.serviceItemId || null,
        accountId: i.accountId || null,
        taxPct: i.taxPct,
        pphPct: i.pphPct,
        deliveryOrderItemId: i.deliveryOrderItemId ?? null,
        sourceMovementId: i.sourceMovementId || null,
      })),
    });

  const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className={`${formDialogClass} sm:max-w-5xl`}>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) handleSave(); }}
          className={formShellClass}
        >
          <FormDialogHeader>
            <DialogTitle>Invoice Penjualan Baru</DialogTitle>
            <DialogDescription>Draft • belum disimpan</DialogDescription>
          </FormDialogHeader>

          <FormDialogBody className="space-y-0 p-0">
            {/* Top meta section */}
            <div className="grid grid-cols-1 gap-6 border-b border-border p-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-2">
                <Field label="Tagihkan Kepada" required>
                  {() => (
                    <PickerSelect
                      options={(parties ?? []).map((p: any) => ({
                        value: p.id,
                        label: p.phone ? `${p.name} · ${p.phone}` : p.name,
                      }))}
                      value={partyId}
                      onChange={(v) => {
                        setPartyId(v);
                        // Switching customer → reset any DO selections (DOs are scoped to a party).
                        if (selectedDOIds.length > 0 || items.some((i) => i.deliveryOrderItemId)) {
                          setSelectedDOIds([]);
                          setExpandedDOIds([]);
                          setItems([defaultItem()]);
                        }
                      }}
                      placeholder="Pilih / cari pelanggan"
                      aria-label="Pilih pelanggan"
                    />
                  )}
                </Field>
                {selectedParty && (
                  <div className="space-y-0.5 pl-1 text-xs text-muted-foreground">
                    {selectedParty.email && <p>{selectedParty.email}</p>}
                    {selectedParty.phone && <p>{selectedParty.phone}</p>}
                    {selectedParty.address && <p>{selectedParty.address}</p>}
                  </div>
                )}
                {isWapu && (
                  <div role="status" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle p-2">
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-warning-text"><AlertTriangle className="size-3.5" aria-hidden />WAPU</span>
                    <p className="text-xs leading-snug text-warning-text">
                      Customer ini Wajib Pungut. PPN dipungut sendiri oleh customer ke kas negara.
                      Semua baris item akan otomatis PPN 0%.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tanggal Invoice">
                  {(c) => (
                    <DateInput
                      id={c.id}
                      value={invoiceDate}
                      onChange={(v) => { setInvoiceDate(v); setDueDate(calcDueDate(v, terms)); }}
                    />
                  )}
                </Field>
                <Field label="Jatuh Tempo">
                  {(c) => <DateInput id={c.id} value={dueDate} onChange={setDueDate} />}
                </Field>
                <Field label="Termin Pembayaran" className="sm:col-span-2">
                  {() => (
                    <OptionSelect
                      aria-label="Termin Pembayaran"
                      value={terms}
                      onChange={(v) => { setTerms(v); setDueDate(calcDueDate(invoiceDate, v)); }}
                      options={['Cash', 'Net 7', 'Net 14', 'Net 30', 'Net 60'].map((t) => ({ value: t, label: t }))}
                    />
                  )}
                </Field>
                <Field
                  label="No. Referensi PO / Penawaran (opsional)"
                  hint="Akan dicetak di invoice sebagai referensi pembeli. PPN & PPh diatur per baris item."
                  className="sm:col-span-2"
                >
                  <Input
                    value={customerRefNo}
                    onChange={(e) => setCustomerRefNo(e.target.value)}
                    placeholder="mis. PO-2026-001 atau QO-202604-0012"
                    maxLength={100}
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>

            {partyId && (
              <InvoiceDOPicker
                fromDOMode={fromDOMode}
                onToggleMode={(checked) => {
                  setFromDOMode(checked);
                  setItems([defaultItem()]);
                  setSelectedDOIds([]);
                  setExpandedDOIds([]);
                }}
                pendingDOs={pendingDOs}
                selectedDOIds={selectedDOIds}
                expandedDOIds={expandedDOIds}
                onToggleSelect={toggleDOSelection}
                onToggleExpand={toggleDOExpanded}
              />
            )}

            {/* Items table */}
            <section aria-labelledby="inv-items-title" className="px-6 pb-4 pt-5">
              {fromDOMode && items.some((i) => i.deliveryOrderItemId) && (
                <p role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary-subtle p-2.5 text-xs text-primary-subtle-foreground">
                  <Truck size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Item ditarik dari Surat Jalan terpilih. Stok tidak akan dikurangi lagi saat invoice dikirim. COGS pakai biaya per unit yang dikunci di Surat Jalan.
                  </span>
                </p>
              )}
              <div className="mb-3 flex items-center justify-between">
                <h3 id="inv-items-title" className={sectionLabel}>Daftar Barang / Jasa</h3>
                <Button variant="ghost" size="sm" className="text-primary max-sm:h-11" onClick={addItem}>
                  <Plus aria-hidden /> Tambah Baris
                </Button>
              </div>

              <TableRegion label="Daftar barang dan jasa invoice">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="w-8 px-4 py-3 text-left">#</th>
                      <th scope="col" className="min-w-[240px] px-4 py-3 text-left">Nama Barang / Jasa</th>
                      <th scope="col" className="w-28 min-w-[112px] px-3 py-3 text-right">Qty</th>
                      <th scope="col" className="w-32 min-w-[112px] px-3 py-3 text-left">Satuan</th>
                      <th scope="col" className="w-36 min-w-[130px] px-3 py-3 text-right">Harga Satuan</th>
                      <th scope="col" className="w-28 min-w-[96px] px-3 py-3 text-right">Diskon %</th>
                      <th scope="col" className="w-28 min-w-[96px] px-3 py-3 text-right">PPN %</th>
                      <th scope="col" className="w-28 min-w-[96px] px-3 py-3 text-right">PPh %</th>
                      <th scope="col" className="w-36 min-w-[130px] px-4 py-3 text-right">Jumlah</th>
                      <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Aksi</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <InvoiceLineRow
                        key={item.id}
                        item={item}
                        idx={idx}
                        items={items}
                        canRemove={items.length > 1}
                        lineAmount={lineTotal(item)}
                        inventoryOptions={inventoryOptions}
                        serviceOptions={serviceOptions}
                        updateItem={updateItem}
                        toggleItemType={toggleItemType}
                        selectInventoryItem={selectInventoryItem}
                        selectServiceItem={selectServiceItem}
                        removeItemAt={removeItemAt}
                      />
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            </section>

            {/* Summary + notes */}
            <div className="grid grid-cols-1 items-start gap-6 px-6 pb-6 md:grid-cols-2 md:gap-8">
              <Field label="Catatan untuk Pelanggan">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Misal: Terima kasih atas kepercayaan Anda. Pembayaran via transfer ke rekening BCA..."
                  rows={4}
                  className="resize-none"
                />
              </Field>

              <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-4">
                {Object.keys(totalQtyByUnit).length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Qty</span>
                    <span className="tabular-nums text-foreground">
                      {Object.entries(totalQtyByUnit)
                        .map(([u, q]) => `${q.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${u}`)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums text-foreground">{formatRupiah(subtotal)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PPN (per item)</span>
                    <span className="tabular-nums text-foreground">+ {formatRupiah(taxAmount)}</span>
                  </div>
                )}
                {pphAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PPh (per item)</span>
                    <span className="tabular-nums text-warning-text">− {formatRupiah(pphAmount)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    aria-label="Label potongan"
                    value={labelPotongan}
                    onChange={(e) => setLabelPotongan(e.target.value)}
                    className="min-w-0 flex-1"
                    placeholder="Label potongan..."
                  />
                  <NumberInput
                    aria-label="Nilai potongan"
                    value={potongan || ''}
                    onChange={(e) => setPotongan(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className={`${numberInputClass} w-32 shrink-0`}
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    aria-label="Label biaya lain"
                    value={labelBiaya}
                    onChange={(e) => setLabelBiaya(e.target.value)}
                    className="min-w-0 flex-1"
                    placeholder="Label biaya lain..."
                  />
                  <NumberInput
                    aria-label="Nilai biaya lain"
                    value={biayaLain || ''}
                    onChange={(e) => setBiayaLain(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    className={`${numberInputClass} w-32 shrink-0`}
                  />
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-2.5">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-2xl font-bold tabular-nums text-primary">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Policy 2026-05: barang keluar HANYA via Surat Jalan */}
            {hasOrphanInventory && (
              <div role="alert" className="mx-6 mb-4 rounded-lg border border-danger/30 bg-danger-subtle p-3 text-sm text-danger-text">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
                  <div>
                    <p className="font-medium">Item inventori harus via Surat Jalan</p>
                    <p className="mt-0.5 text-xs">
                      Sejak 20 Mei 2026, stok keluar wajib lewat Surat Jalan (DO). Invoice = tagihan saja.
                      Berikut item yg masih direct-sale di invoice ini:
                    </p>
                    <ul className="ml-1 mt-1.5 list-inside list-disc space-y-0.5 text-xs">
                      {orphanInventoryLines.map((l) => (
                        <li key={l.id}>
                          <span className="font-medium">{l.itemName}</span>
                          <span>: belum link ke Surat Jalan</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">
                      <strong>Solusi:</strong> buat <span className="font-semibold">Surat Jalan</span> dulu di menu Penjualan → Surat Jalan,
                      lalu kembali ke sini dan pilih dari daftar <span className="font-semibold">Pending Surat Jalan</span> di atas.
                      Atau hapus baris item inventory di sini dan ganti dengan service / akun bebas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Attachments */}
            <section aria-labelledby="inv-attach-title" className="px-6 pb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 id="inv-attach-title" className={`${sectionLabel} flex items-center gap-1`}>
                  <Paperclip size={12} aria-hidden /> Dokumen Pendukung
                </h3>
                <label className="relative flex cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-accent focus-within:ring-2 focus-within:ring-ring max-sm:min-h-11">
                  <Plus size={13} aria-hidden /> Tambah File
                  <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileSelect} className="sr-only" />
                </label>
              </div>
              {stagedFiles.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">Belum ada file. Max {MAX_ATTACHMENTS} file, 5 MB/file (JPG/PNG/PDF).</p>
              ) : (
                <ul className="space-y-1.5">
                  {stagedFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs">
                      {f.type === 'application/pdf' ? <FileText size={14} className="text-danger-text" aria-hidden /> : <ImageIcon size={14} className="text-info-text" aria-hidden />}
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <Button variant="ghost" size="icon-sm" className="max-sm:size-11" aria-label={`Hapus file ${f.name}`} onClick={() => removeStagedFile(i)}>
                        <X aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {error && (
              <div className="px-6 pb-4">
                <FormError>{error}</FormError>
              </div>
            )}
          </FormDialogBody>

          <FormDialogFooter>
            <FooterButton variant="ghost" onClick={onClose} disabled={mutation.isPending}>Batal</FooterButton>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-xs text-muted-foreground">
                {canSubmit
                  ? `Total: ${formatRupiah(grandTotal)}`
                  : hasOrphanInventory
                    ? 'Item inventori harus via Surat Jalan. Lihat peringatan di atas.'
                    : 'Lengkapi pelanggan dan minimal 1 item untuk melanjutkan'}
              </p>
              <FooterButton type="submit" loading={mutation.isPending} disabled={!canSubmit && !mutation.isPending}>
                {mutation.isPending ? 'Menyimpan…' : 'Simpan Invoice'}
              </FooterButton>
            </div>
          </FormDialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SalesInvoiceModal;

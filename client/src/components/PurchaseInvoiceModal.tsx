import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { Plus, X, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { formatRupiah, formatNumber } from '@/lib/format';
import { NumberInput } from '@/components/ui/number-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Field, DateInput, ConfirmDialog } from '@/components/shared';
import { FormDialog } from './purchase-cash/FormDialog';
import { OptionPicker } from './purchase-cash/OptionPicker';
import { Callout, ErrorAlert } from './purchase-cash/ErrorAlert';
import { InvoiceLineEditor } from './purchase/InvoiceLineEditor';
import { defaultItem, computeLine, type InvoiceItem } from './purchase/invoice-item';
import { ThreeWayMatchPanel } from './purchase/ThreeWayMatchPanel';
import { useMatchPreview } from './purchase/useMatchPreview';
import { hasMatchVariance } from './purchase/three-way-match';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface PurchaseInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, modal opens with these values prefilled (re-create after cancel). */
  prefill?: {
    date?: string;
    dueDate?: string;
    partyId?: string;
    notes?: string;
    biayaLain?: number;
    items?: InvoiceItem[];
  } | null;
  /** Resubmit mode: submit ke endpoint resubmit alih-alih create. */
  resubmitRequestId?: string | null;
}

const PurchaseInvoiceModal: React.FC<PurchaseInvoiceModalProps> = ({ isOpen, onClose, prefill, resubmitRequestId }) => {
  const [invoiceDate, setInvoiceDate] = useState(() => prefill?.date ?? new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => prefill?.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState(prefill?.partyId ?? '');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [biayaLain, setBiayaLain] = useState(prefill?.biayaLain ?? 0);
  const [items, setItems] = useState<InvoiceItem[]>(prefill?.items && prefill.items.length > 0 ? prefill.items : [defaultItem()]);

  // Reset state when prefill changes (e.g. user edits a different invoice)
  React.useEffect(() => {
    if (isOpen && prefill) {
      setInvoiceDate(prefill.date ?? new Date().toISOString().split('T')[0]);
      setDueDate(prefill.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setPartyId(prefill.partyId ?? '');
      setNotes(prefill.notes ?? '');
      setBiayaLain(prefill.biayaLain ?? 0);
      if (prefill.items && prefill.items.length > 0) setItems(prefill.items);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefill]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const queryClient = useQueryClient();

  const { data: parties } = useQuery({
    queryKey: ['parties-suppliers'],
    queryFn: async () => {
      const res = await api.get('/parties?type=Supplier');
      return res.data.data ?? res.data;
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['inventory-items-active'],
    queryFn: async () => {
      const res = await api.get('/inventory/items');
      const all: any[] = res.data.data ?? res.data;
      return all.filter((i: any) => i.isActive !== false);
    },
  });

  // Pending STTs (sudah submit, belum di-invoice, non-legacy) untuk supplier
  // yang dipilih. Dipakai oleh toggle "Dari STT/BPB" untuk pre-fill items.
  const { data: pendingSTTs } = useQuery({
    queryKey: ['stt-pending', partyId],
    queryFn: async () => {
      if (!partyId) return [];
      const res = await api.get(`/goods-receipts/pending?partyId=${partyId}`);
      return res.data.data ?? res.data ?? [];
    },
    enabled: !!partyId,
  });

  const [fromSTTMode, setFromSTTMode] = useState(false);
  // Multi-pilih: 1 invoice bisa digabung dari beberapa STT sekaligus
  // (mis. beberapa rit dari supplier yang sama pada tanggal berdekatan).
  const [selectedSTTIds, setSelectedSTTIds] = useState<Set<string>>(new Set());

  const sttLinesOf = (stt: any): InvoiceItem[] =>
    (stt.items ?? []).map((line: any) => ({
      id: crypto.randomUUID(),
      itemType: 'material',
      itemName: line.itemName,
      inventoryItemId: line.inventoryItemId ?? '',
      warehouseId: line.warehouseId ?? '',
      description: line.description ?? '',
      unit: line.unit ?? 'Kg',
      kualitas: '',
      refaksi: 0,
      timbanganTruk: 0,
      timbanganDiterima: Number(line.quantity),
      rate: 0, // user fill harga aktual di sini
      taxPct: 0,
      pphPct: 0,
      potonganItem: 0,
      nomorMobil: stt.nomorMobil ?? '',
      goodsReceiptItemId: line.id,
    }));

  // Toggle satu STT: tambah/hapus baris-barisnya dari daftar item,
  // tanpa mengganggu STT lain yang sudah dicentang lebih dulu.
  const toggleSTT = (sttId: string) => {
    const stt = (pendingSTTs ?? []).find((s: any) => s.id === sttId);
    if (!stt) return;
    // Updaters stay pure (StrictMode runs them twice in dev): decide once,
    // then update both states; adding skips STT lines already present.
    const wasSelected = selectedSTTIds.has(sttId);
    const grItemIds = new Set((stt.items ?? []).map((l: any) => l.id));
    setSelectedSTTIds((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(sttId);
      else next.add(sttId);
      return next;
    });
    setItems((cur) => {
      if (wasSelected) {
        const rest = cur.filter((i) => !i.goodsReceiptItemId || !grItemIds.has(i.goodsReceiptItemId));
        return rest.length > 0 ? rest : [defaultItem()];
      }
      // Buang placeholder kosong bawaan modal sebelum menambah baris pertama.
      const base = cur.filter(
        (i) => (i.goodsReceiptItemId || i.itemName || i.rate > 0) && !(i.goodsReceiptItemId && grItemIds.has(i.goodsReceiptItemId)),
      );
      return [...base, ...sttLinesOf(stt)];
    });
  };

  const selectedParty = parties?.find((p: any) => p.id === partyId);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      // Resubmit mode: perbarui payload pengajuan & kirim ulang (status → Pending).
      // Upload staged files ke referensi tertentu. Pengajuan (dokumen belum dibuat)
      // → simpan sbg lampiran 'approval_request'; saat disetujui server memindahkan
      // lampiran ke invoice yang dibuat. Gagal upload → peringatan, bukan diam.
      const uploadStaged = async (referenceType: string, referenceId: string) => {
        if (stagedFiles.length === 0 || !referenceId) return;
        const fd = new FormData();
        fd.append('referenceType', referenceType);
        fd.append('referenceId', referenceId);
        for (const f of stagedFiles) fd.append('files', f);
        try {
          await api.post('/attachments/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (err: any) {
          console.warn('Upload lampiran gagal:', err);
          toast.error('Lampiran gagal diunggah: ' + (err?.response?.data?.error ?? err?.message ?? 'error'));
        }
      };
      if (resubmitRequestId) {
        const res = await api.put(`/approvals/requests/${resubmitRequestId}/resubmit`, { payload: data });
        await uploadStaged('approval_request', resubmitRequestId);
        return { ...res.data, resubmitted: true };
      }
      const res = await api.post('/purchase/invoices', data);
      const invoice = res.data;
      if (invoice?.pendingApproval) {
        await uploadStaged('approval_request', invoice?.request?.id);
        return invoice;
      }
      if (invoice?.id) await uploadStaged('purchase_invoice', invoice.id);
      return invoice;
    },
    onSuccess: (result: any) => {
      if (result?.resubmitted) {
        toast.success('Pengajuan diperbarui & dikirim ulang untuk persetujuan.');
      } else if (result?.pendingApproval) {
        toast.success('Invoice dikirim untuk persetujuan manajer. Akan diproses setelah disetujui.');
      }
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
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
      setBiayaLain(0);
      setItems([defaultItem()]);
      setStagedFiles([]);
      setError('');
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan invoice.'),
  });

  const addItem = () => setItems([...items, defaultItem('material')]);
  const addServiceItem = () => setItems([...items, defaultItem('service')]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof InvoiceItem, value: any) => {
    const next = [...items];
    next[i] = { ...next[i], [field]: value };
    // Auto-derive timbanganDiterima when refaksi/timbanganTruk change
    if (field === 'timbanganTruk' || field === 'refaksi') {
      const truk = field === 'timbanganTruk' ? Number(value) : next[i].timbanganTruk;
      const ref = field === 'refaksi' ? Number(value) : next[i].refaksi;
      if (truk > 0) {
        next[i].timbanganDiterima = Math.max(0, truk - (ref || 0));
      }
    }
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

  const lineCalcs = useMemo(() => items.map(computeLine), [items]);
  const subtotalItems = lineCalcs.reduce((s, c) => s + c.hargaAkhir, 0);
  const totalPpn = lineCalcs.reduce((s, c) => s + c.ppn, 0);
  const totalPph = lineCalcs.reduce((s, c) => s + c.pph, 0);
  const totalPotongan = items.reduce((s, i) => s + (i.potonganItem || 0), 0);
  const grandTotal = subtotalItems + biayaLain;
  // Sum effective quantity (timbanganDiterima) per unit so the total stays
  // meaningful when items use different units (Kg vs Sak vs Pcs).
  const totalQtyByUnit = items.reduce<Record<string, number>>((acc, it) => {
    const q = Number(it.timbanganDiterima ?? 0);
    if (!it.itemName || q <= 0) return acc;
    const u = it.unit || 'Kg';
    acc[u] = (acc[u] ?? 0) + q;
    return acc;
  }, {});
  // Every row must be valid; at least one row must produce value.
  // rate boleh negatif (baris jasa/biaya yang mengurangi tagihan), tapi tidak boleh 0.
  const allRowsValid = items.every(
    (i) => i.itemName.trim().length > 0 && i.rate !== 0 && i.timbanganDiterima > 0,
  );
  // Policy (2026-05): inventory item HARUS via STT/BPB (mirror dari sales).
  // Direct-purchase ditutup di backend, cegah submit dari client supaya
  // staff dapat guidance jelas sebelum dilempar error.
  const orphanInventoryLines = items.filter(
    (i) => i.itemType === 'material' && i.inventoryItemId && !i.goodsReceiptItemId,
  );
  const hasOrphanInventory = orphanInventoryLines.length > 0;

  // Payload builder shared by submit and the live three-way match preview.
  const payloadItems = items.map((i) => ({
    itemName: i.itemName,
    inventoryItemId: i.inventoryItemId || null,
    warehouseId: i.itemType === 'material' ? (i.warehouseId || null) : null,
    description: i.description || null,
    quantity: i.timbanganDiterima > 0 ? i.timbanganDiterima : 0,
    unit: i.unit,
    rate: i.rate,
    discount: 0,
    taxPct: i.taxPct,
    pphPct: i.pphPct,
    potonganItem: i.potonganItem,
    kualitas: i.kualitas || null,
    refaksi: i.refaksi || null,
    timbanganTruk: i.timbanganTruk || null,
    timbanganDiterima: i.timbanganDiterima || null,
    nomorMobil: i.nomorMobil?.trim() || null,
    goodsReceiptItemId: i.goodsReceiptItemId || null,
  }));
  const matchItems = payloadItems.map((i) => ({
    itemName: i.itemName,
    unit: i.unit,
    quantity: i.quantity,
    timbanganDiterima: i.timbanganDiterima,
    rate: i.rate,
    discount: i.discount,
    goodsReceiptItemId: i.goodsReceiptItemId,
  }));
  const matchQuery = useMatchPreview(isOpen ? matchItems : null);
  const [confirmVariance, setConfirmVariance] = useState(false);
  const submitPayload = () =>
    mutation.mutate({ date: invoiceDate, dueDate, partyId, notes, biayaLain, items: payloadItems });
  const handleSave = () => {
    // Non-blocking three-way match: ask once when a line exceeds tolerance.
    if (hasMatchVariance(matchQuery.data)) setConfirmVariance(true);
    else submitPayload();
  };
  // Legacy guard: warehouse picker validation (relevan saat direct-purchase
  // masih aktif). Sekarang STT yg handle warehouse, jadi tidak ke-trigger.
  const canSubmit =
    partyId &&
    items.length > 0 &&
    allRowsValid &&
    !hasOrphanInventory &&
    grandTotal > 0 &&
    !mutation.isPending;

  return (
    <>
      <FormDialog
        open={isOpen}
        onClose={onClose}
        size="doc"
        className="lg:max-w-6xl"
        title="Invoice Pembelian Baru"
        description="Draft • belum disimpan"
        busy={mutation.isPending}
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {canSubmit
                ? `Total: ${formatRupiah(grandTotal)}`
                : hasOrphanInventory
                  ? 'Bahan baku harus via STT — lihat peringatan di atas.'
                  : 'Lengkapi supplier & minimal 1 item'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" className="h-11 sm:h-9" onClick={onClose} disabled={mutation.isPending}>
                Batal
              </Button>
              <Button className="h-11 sm:h-9" onClick={handleSave} disabled={!canSubmit} loading={mutation.isPending}>
                {mutation.isPending ? 'Menyimpan…' : 'Simpan Invoice'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2 sm:gap-8">
          <div className="space-y-2">
            <Field label="Supplier / Pemasok" required>
              <OptionPicker
                value={partyId}
                onChange={setPartyId}
                placeholder="— Pilih Supplier —"
                options={(parties ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            {selectedParty && (
              <div className="space-y-0.5 pl-1 text-xs text-muted-foreground">
                {selectedParty.email && <p>{selectedParty.email}</p>}
                {selectedParty.phone && <p>{selectedParty.phone}</p>}
                {selectedParty.address && <p>{selectedParty.address}</p>}
              </div>
            )}

            {/* "Dari STT/BPB": load items from submitted, not-yet-invoiced STTs; user fills prices. */}
            {partyId && (
              <div className="rounded-lg border border-info/30 bg-info-subtle p-3">
                <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm font-medium text-info-text sm:min-h-0">
                  <Checkbox
                    className="mt-0.5"
                    checked={fromSTTMode}
                    onCheckedChange={(v) => {
                      const checked = v === true;
                      setFromSTTMode(checked);
                      if (!checked) {
                        setSelectedSTTIds(new Set());
                        setItems([defaultItem()]);
                      }
                    }}
                  />
                  Buat dari STT / BPB (Bukti Penerimaan Barang) — bisa pilih lebih dari 1
                </label>
                {fromSTTMode && (
                  <div className="mt-2 space-y-1">
                    <ul
                      aria-label="STT tertunda"
                      className="max-h-40 space-y-1 overflow-y-auto pr-1"
                    >
                      {(pendingSTTs ?? []).map((s: any) => (
                        <li key={s.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded bg-card px-2 py-1.5 text-xs text-foreground hover:bg-accent sm:min-h-0">
                            <Checkbox checked={selectedSTTIds.has(s.id)} onCheckedChange={() => toggleSTT(s.id)} />
                            <span className="flex-1">
                              {s.sttNumber} • {new Date(s.date).toLocaleDateString('id-ID')} • {s.items?.length ?? 0} item
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {(pendingSTTs ?? []).length === 0 && (
                      <p className="text-xs text-info-text">
                        Tidak ada STT pending untuk supplier ini. Buat STT/BPB dulu di menu Pembelian → BPB.
                      </p>
                    )}
                    {selectedSTTIds.size > 0 && (
                      <p className="text-xs text-info-text" role="status">
                        {selectedSTTIds.size} STT dipilih, items sudah di-load. Tinggal isi harga per baris. Stok tidak akan dibuat ulang oleh PI ini.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tanggal Invoice">
              <DateInput value={invoiceDate} onChange={setInvoiceDate} />
            </Field>
            <Field label="Jatuh Tempo">
              <DateInput value={dueDate} onChange={setDueDate} />
            </Field>
          </div>
        </div>

        <InvoiceLineEditor
          items={items}
          lineCalcs={lineCalcs}
          inventoryItems={inventoryItems}
          onUpdate={(i, field, value) => updateItem(i, field, value)}
          onSelectInventory={selectInventoryItem}
          onRemove={removeItem}
          onAddMaterial={addItem}
          onAddService={addServiceItem}
        />

        <section aria-labelledby="pi-docs-title" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 id="pi-docs-title" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Paperclip className="size-3" aria-hidden /> Dokumen Pendukung
            </h3>
            <Button type="button" variant="outline" size="sm" className="h-11 sm:h-8" onClick={() => fileInputRef.current?.click()}>
              <Plus aria-hidden /> Tambah File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
              aria-label="Berkas dokumen pendukung"
            />
          </div>
          {stagedFiles.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Belum ada file. Max {MAX_ATTACHMENTS} file, 5 MB/file (JPG/PNG/PDF).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {stagedFiles.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                  {f.type === 'application/pdf' ? (
                    <FileText className="size-4 text-danger-text" aria-hidden />
                  ) : (
                    <ImageIcon className="size-4 text-info-text" aria-hidden />
                  )}
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-danger-text"
                    onClick={() => removeStagedFile(i)}
                    aria-label={`Hapus file ${f.name}`}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 items-start gap-4 sm:gap-8 md:grid-cols-2">
          <Field label="Catatan">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No. PO, referensi..." rows={4} className="resize-none" />
          </Field>
          <dl className="space-y-2 rounded-xl border border-border bg-muted p-4 text-sm" aria-label="Ringkasan invoice">
            {Object.keys(totalQtyByUnit).length > 0 && (
              <div className="flex justify-between gap-2 text-xs font-medium text-muted-foreground">
                <dt>Total Qty</dt>
                <dd className="num text-right">
                  {Object.entries(totalQtyByUnit)
                    .map(([u, q]) => `${formatNumber(q, { maxDecimals: 3 })} ${u}`)
                    .join(' · ')}
                </dd>
              </div>
            )}
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Total PPN (info)</dt>
              <dd className="num">{formatRupiah(totalPpn)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Total PPh (info)</dt>
              <dd className="num">−{formatRupiah(totalPph)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Total Potongan</dt>
              <dd className="num text-danger-text">−{formatRupiah(totalPotongan)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="text-muted-foreground">Subtotal Item</dt>
              <dd className="num text-foreground">{formatRupiah(subtotalItems)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="flex-1 text-muted-foreground">
                <label htmlFor="pi-biaya-lain">Biaya Lain</label>
              </dt>
              <dd className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-muted-foreground" aria-hidden>{biayaLain < 0 ? '−' : '+'}</span>
                <NumberInput
                  id="pi-biaya-lain"
                  inputMode="decimal"
                  value={biayaLain || ''}
                  onChange={(e) => setBiayaLain(Number(e.target.value) || 0)}
                  placeholder="0"
                  title="Boleh negatif untuk potong tagihan"
                  className="num h-10 w-32 text-right md:h-9"
                />
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-2.5">
              <dt className="text-sm font-semibold text-foreground">Total</dt>
              <dd className="num text-xl font-bold text-primary sm:text-2xl">{formatRupiah(grandTotal)}</dd>
            </div>
          </dl>
        </div>

        {/* Policy 2026-05: barang masuk HANYA via STT/BPB */}
        {hasOrphanInventory && (
          <Callout tone="danger">
            <p className="font-medium">Bahan baku harus via STT / BPB</p>
            <p className="mt-0.5 text-xs">
              Sejak 20 Mei 2026, stok masuk wajib lewat STT (Surat Tanda Terima / Bukti Penerimaan Barang).
              Invoice = tagihan saja. Berikut item yg masih direct-purchase di invoice ini:
            </p>
            <ul className="ml-1 mt-1.5 list-inside list-disc space-y-0.5 text-xs">
              {orphanInventoryLines.map((l) => (
                <li key={l.id}>
                  <span className="font-medium">{l.itemName}</span>
                  <span> — belum link ke STT</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              <strong>Solusi:</strong> buat <span className="font-semibold">STT/BPB</span> dulu di menu Pembelian → STT,
              lalu kembali ke sini dan pilih dari daftar <span className="font-semibold">STT Tertunda</span> di atas.
            </p>
          </Callout>
        )}

        {matchItems.some((i) => i.goodsReceiptItemId) && (
          <ThreeWayMatchPanel match={matchQuery.data} loading={matchQuery.isFetching} />
        )}

        <ErrorAlert message={error} />
      </FormDialog>

      <ConfirmDialog
        open={confirmVariance}
        onOpenChange={setConfirmVariance}
        title="Tetap simpan dengan selisih?"
        description={`${matchQuery.data?.summary.qtyVariance ?? 0} baris selisih qty dan ${matchQuery.data?.summary.priceVariance ?? 0} baris selisih harga melebihi toleransi terhadap PO/STT. Faktur tetap bisa disimpan; selisih harga dicatat seperti biasa.`}
        confirmLabel="Tetap simpan"
        cancelLabel="Periksa lagi"
        onConfirm={() => submitPayload()}
      />
    </>
  );
};

export default PurchaseInvoiceModal;

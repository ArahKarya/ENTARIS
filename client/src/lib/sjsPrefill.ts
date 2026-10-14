// Isi otomatis form DO resmi dari Surat Jalan Sementara (SJS) yang dicentang di dialog tautan.
// Fungsi murni supaya bisa diuji tanpa merender modal.

export interface SjsLinkableItem {
  itemName: string;
  quantity: number | string;
  unit: string;
  inventoryItemId?: string | null;
}

export interface SjsLinkable {
  id: string;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  items?: SjsLinkableItem[] | null;
}

/** Baris DO yang dibentuk dari SJS; `fromNoteId` menandai asal supaya bisa ditarik lagi saat centang dilepas. */
export interface SjsDoRow {
  id: string;
  inventoryItemId: string;
  warehouseId: string;
  itemName: string;
  quantity: number;
  unit: string;
  description: string;
  fromNoteId: string;
}

export function rowsFromNote(note: SjsLinkable, newId: () => string): SjsDoRow[] {
  return (note.items ?? []).map((it) => ({
    id: newId(),
    inventoryItemId: it.inventoryItemId ?? '',
    warehouseId: '', // SJS tidak mencatat gudang: staf memilih sendiri karena DO resmi memotong stok
    itemName: it.itemName,
    quantity: Number(it.quantity),
    unit: it.unit,
    description: '',
    fromNoteId: note.id,
  }));
}

/** Baris bawaan yang belum disentuh (tanpa barang) dibuang saat baris SJS masuk. */
export const isPristineRow = (r: { inventoryItemId: string; itemName: string }): boolean =>
  !r.inventoryItemId && !r.itemName.trim();

/** Tambah baris SJS ke daftar baris DO; baris kosong bawaan diganti. */
export function addNoteRows<T extends { inventoryItemId: string; itemName: string; fromNoteId?: string }>(
  current: T[],
  noteRows: T[],
): T[] {
  if (noteRows.length === 0) return current;
  return [...current.filter((r) => !isPristineRow(r)), ...noteRows];
}

/** Tarik baris asal SJS tertentu (atau semua SJS bila `noteId` kosong); sisakan satu baris kosong bila habis. */
export function removeNoteRows<T extends { fromNoteId?: string }>(current: T[], noteId: string | null, blank: () => T): T[] {
  const rest = current.filter((r) => (noteId ? r.fromNoteId !== noteId : !r.fromNoteId));
  return rest.length > 0 ? rest : [blank()];
}

/** Isi header hanya bila masih kosong (tidak menimpa ketikan staf). */
export function fillIfEmpty(current: string, fromNote?: string | null): string {
  return current.trim() ? current : (fromNote ?? '').trim();
}

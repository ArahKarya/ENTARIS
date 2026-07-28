// Klasifikasi stok per gudang berdasarkan field `category` item.
// Urutan tampil tetap (Bahan Baku → Setengah Jadi → Produk Jadi → Samping →
// Perlengkapan → Lainnya). Kategori tak dikenal / kosong masuk "Lainnya".

export const CATEGORY_ORDER = [
  'Bahan Baku',
  'Barang Setengah Jadi',
  'Produk Jadi',
  'Produk Samping',
  'Perlengkapan',
] as const;

const OTHER_LABEL = 'Lainnya';

export function categoryGroupLabel(cat?: string | null): string {
  const c = (cat ?? '').trim();
  return (CATEGORY_ORDER as readonly string[]).includes(c) ? c : OTHER_LABEL;
}

export interface CategoryGroup<T> {
  label: string;
  rows: T[];
}

/** Kelompokkan baris berdasarkan kategori, dalam urutan tetap. */
export function groupByCategory<T>(
  rows: T[],
  getCategory: (row: T) => string | null | undefined,
): CategoryGroup<T>[] {
  const order = [...CATEGORY_ORDER, OTHER_LABEL];
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const label = categoryGroupLabel(getCategory(row));
    const bucket = map.get(label);
    if (bucket) bucket.push(row);
    else map.set(label, [row]);
  }
  return order
    .filter((label) => map.has(label))
    .map((label) => ({ label, rows: map.get(label)! }));
}

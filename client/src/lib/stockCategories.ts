// Klasifikasi stok per gudang berdasarkan field `category` item.
// Urutan tampil tetap (Bahan Baku → Setengah Jadi → Produk Jadi → Samping →
// Perlengkapan → Lainnya). Kategori tak dikenal / kosong masuk "Lainnya".
// Nilai kategori adalah data (field `category` item), bukan teks UI: tampilkan
// lewat categoryDisplayName() supaya ikut bahasa pengguna.

import i18n from '@/i18n';

export const CATEGORY_ORDER = [
  'Bahan Baku',
  'Barang Setengah Jadi',
  'Produk Jadi',
  'Produk Samping',
  'Perlengkapan',
] as const;

export const OTHER_LABEL = 'Lainnya';

const DISPLAY_KEY = {
  'Bahan Baku': 'stockCategories.rawMaterial',
  'Barang Setengah Jadi': 'stockCategories.semiFinished',
  'Produk Jadi': 'stockCategories.finishedGoods',
  'Produk Samping': 'stockCategories.byProduct',
  Perlengkapan: 'stockCategories.supplies',
  [OTHER_LABEL]: 'stockCategories.other',
} as const;

/** Translated name for a category group value (CATEGORY_ORDER entry or OTHER_LABEL). */
export function categoryDisplayName(label: string): string {
  const key = DISPLAY_KEY[label as keyof typeof DISPLAY_KEY];
  return key ? i18n.t(key, { ns: 'inventory' }) : label;
}

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

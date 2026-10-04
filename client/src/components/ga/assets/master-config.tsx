/**
 * Entity definitions for Data Induk Aset (/ga/master). Each tab reads
 * GET /ga/master/<path> and writes POST / PUT /:id / DELETE /:id with the same
 * payload shape as before (fields below).
 */
import type { ReactNode } from 'react';

export interface MasterRow {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
  address?: string | null;
  category?: string | null;
  type?: string | null;
  branchId?: string | null;
  branch?: { code: string; name: string } | null;
}

export type MasterFieldType = 'text' | 'select' | 'branch';

export interface MasterField {
  key: 'code' | 'name' | 'address' | 'category' | 'type' | 'branchId';
  label: string;
  type: MasterFieldType;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
  options?: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
}

export interface MasterColumn {
  id: string;
  header: string;
  hideBelow?: 'sm' | 'md' | 'lg';
  render: (row: MasterRow) => ReactNode;
}

export interface MasterEntity {
  id: 'branches' | 'cost-centers' | 'asset-categories' | 'document-types' | 'inventory-categories' | 'locations';
  /** Tab label. */
  label: string;
  /** Singular noun, lower case ("cabang"). */
  noun: string;
  info: string;
  /** Has an isActive flag (Aktif / Nonaktif filter + toggle). */
  hasActive: boolean;
  fields: MasterField[];
  extraColumns: MasterColumn[];
  /** Extra searchable text. */
  searchText?: (row: MasterRow) => Array<string | null | undefined>;
}

export const INVENTORY_TYPE_OPTIONS = [
  { value: 'SPAREPART', label: 'Sparepart' },
  { value: 'CONSUMABLE', label: 'Consumable (habis pakai)' },
] as const;

const CODE: MasterField = { key: 'code', label: 'Kode', type: 'text', required: true, maxLength: 50 };
const NAME: MasterField = { key: 'name', label: 'Nama', type: 'text', required: true, maxLength: 200 };
const BRANCH_FIELD: MasterField = { key: 'branchId', label: 'Cabang', type: 'branch', required: true };
const branchColumn: MasterColumn = {
  id: 'branch',
  header: 'Cabang',
  hideBelow: 'md',
  render: (r) => r.branch?.name ?? '-',
};

export const MASTER_ENTITIES: readonly MasterEntity[] = [
  {
    id: 'asset-categories',
    label: 'Kategori Aset',
    noun: 'kategori aset',
    info: 'Kategori menentukan awalan kode aset (mis. BANGUNAN → BLD-…) dan halaman yang menampilkannya: Bangunan/Gudang di Gedung & Sewa, Peralatan di Peralatan & Kalibrasi, Kendaraan di Kendaraan.',
    hasActive: true,
    fields: [{ ...CODE, placeholder: 'Mis. IT_EQUIPMENT', hint: 'Kode baku dipakai sistem; hindari mengubahnya bila sudah ada aset.' }, NAME],
    extraColumns: [],
  },
  {
    id: 'branches',
    label: 'Cabang',
    noun: 'cabang',
    info: 'Cabang/lokasi kantor pemilik aset. Kode cabang menjadi bagian kode aset (mis. BLD-PST-0001).',
    hasActive: true,
    fields: [CODE, NAME, { key: 'address', label: 'Alamat', type: 'text' }],
    extraColumns: [{ id: 'address', header: 'Alamat', hideBelow: 'lg', render: (r) => r.address || '-' }],
    searchText: (r) => [r.address],
  },
  {
    id: 'cost-centers',
    label: 'Cost Center',
    noun: 'cost center',
    info: 'Pusat biaya per cabang yang dapat dikaitkan ke setiap aset.',
    hasActive: true,
    fields: [CODE, NAME, BRANCH_FIELD],
    extraColumns: [branchColumn],
    searchText: (r) => [r.branch?.name],
  },
  {
    id: 'locations',
    label: 'Lokasi',
    noun: 'lokasi',
    info: 'Lokasi (gudang, ruang) di tiap cabang, dipakai Inventaris Kantor, Pemeliharaan, dan Permintaan Barang.',
    hasActive: false,
    fields: [CODE, NAME, BRANCH_FIELD],
    extraColumns: [branchColumn],
    searchText: (r) => [r.branch?.name],
  },
  {
    id: 'document-types',
    label: 'Tipe Dokumen',
    noun: 'tipe dokumen',
    info: 'Jenis dokumen legal & sertifikat (STNK, IMB, sertifikat kalibrasi, …) untuk Dokumen & Sertifikat.',
    hasActive: true,
    fields: [CODE, NAME, { key: 'category', label: 'Kelompok', type: 'text', placeholder: 'Mis. Kendaraan' }],
    extraColumns: [{ id: 'category', header: 'Kelompok', hideBelow: 'md', render: (r) => r.category || '-' }],
    searchText: (r) => [r.category],
  },
  {
    id: 'inventory-categories',
    label: 'Kategori Inventaris',
    noun: 'kategori inventaris',
    info: 'Kelompok barang Inventaris Kantor: sparepart atau barang habis pakai.',
    hasActive: false,
    fields: [
      CODE,
      NAME,
      { key: 'type', label: 'Tipe', type: 'select', required: true, options: INVENTORY_TYPE_OPTIONS, defaultValue: 'SPAREPART' },
    ],
    extraColumns: [
      {
        id: 'type',
        header: 'Tipe',
        render: (r) => (r.type === 'SPAREPART' ? 'Sparepart' : r.type === 'CONSUMABLE' ? 'Consumable' : r.type || '-'),
      },
    ],
  },
];

export const DEFAULT_MASTER_TAB = MASTER_ENTITIES[0].id;

export function findMasterEntity(id: string | null): MasterEntity {
  return MASTER_ENTITIES.find((e) => e.id === id) ?? MASTER_ENTITIES[0];
}

/** Write payload for an entity (same shape as the previous generic modal). */
export function masterPayload(
  entity: MasterEntity,
  form: Record<string, string>,
  isActive: boolean,
): Record<string, string | boolean | null> {
  const payload: Record<string, string | boolean | null> = {};
  for (const f of entity.fields) {
    const v = (form[f.key] ?? '').trim();
    payload[f.key] = v === '' ? (f.required ? '' : null) : v;
  }
  if (entity.hasActive) payload.isActive = isActive;
  return payload;
}

export function validateMaster(entity: MasterEntity, form: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of entity.fields) {
    const v = (form[f.key] ?? '').trim();
    if (f.required && !v) errors[f.key] = `${f.label} wajib diisi.`;
    else if (f.maxLength && v.length > f.maxLength) errors[f.key] = `${f.label} maksimal ${f.maxLength} karakter.`;
  }
  return errors;
}

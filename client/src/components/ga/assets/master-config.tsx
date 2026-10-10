/** Entity definitions for the asset master data tabs (GET/POST/PUT/DELETE /ga/master/<path>). */
import type { ReactNode } from 'react';
import { tEam } from '../eam-i18n';

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

/** Defines `props` on `base` as getters reading `eam:master.<key>`, so the text follows the UI language. */
function withText<T extends object>(base: T, props: Record<string, string>): T {
  for (const [prop, key] of Object.entries(props)) {
    Object.defineProperty(base, prop, { enumerable: true, configurable: true, get: () => tEam(`master.${key}`) });
  }
  return base;
}

export const INVENTORY_TYPE_OPTIONS = (['SPAREPART', 'CONSUMABLE'] as const).map((value) =>
  withText({ value, label: '' }, { label: `inventoryType.${value}` }),
);

const codeField = (texts: Record<string, string> = {}): MasterField =>
  withText<MasterField>({ key: 'code', label: '', type: 'text', required: true, maxLength: 50 }, { label: 'field.code', ...texts });
const nameField = (): MasterField =>
  withText<MasterField>({ key: 'name', label: '', type: 'text', required: true, maxLength: 200 }, { label: 'field.name' });
const branchField = (): MasterField =>
  withText<MasterField>({ key: 'branchId', label: '', type: 'branch', required: true }, { label: 'field.branch' });
const branchColumn = (): MasterColumn =>
  withText<MasterColumn>({ id: 'branch', header: '', hideBelow: 'md', render: (r) => r.branch?.name ?? '—' }, { header: 'field.branch' });

const entity = (id: MasterEntity['id'], rest: Omit<MasterEntity, 'id' | 'label' | 'noun' | 'info'>): MasterEntity =>
  withText<MasterEntity>({ id, label: '', noun: '', info: '', ...rest }, {
    label: `entity.${id}.label`,
    noun: `entity.${id}.noun`,
    info: `entity.${id}.info`,
  });

export const MASTER_ENTITIES: readonly MasterEntity[] = [
  entity('asset-categories', {
    hasActive: true,
    fields: [codeField({ placeholder: 'field.categoryCodePlaceholder', hint: 'field.categoryCodeHint' }), nameField()],
    extraColumns: [],
  }),
  entity('branches', {
    hasActive: true,
    fields: [codeField(), nameField(), withText<MasterField>({ key: 'address', label: '', type: 'text' }, { label: 'field.address' })],
    extraColumns: [withText<MasterColumn>({ id: 'address', header: '', hideBelow: 'lg', render: (r) => r.address || '—' }, { header: 'field.address' })],
    searchText: (r) => [r.address],
  }),
  entity('cost-centers', {
    hasActive: true,
    fields: [codeField(), nameField(), branchField()],
    extraColumns: [branchColumn()],
    searchText: (r) => [r.branch?.name],
  }),
  entity('locations', {
    hasActive: false,
    fields: [codeField(), nameField(), branchField()],
    extraColumns: [branchColumn()],
    searchText: (r) => [r.branch?.name],
  }),
  entity('document-types', {
    hasActive: true,
    fields: [
      codeField(),
      nameField(),
      withText<MasterField>({ key: 'category', label: '', type: 'text' }, { label: 'field.group', placeholder: 'field.groupPlaceholder' }),
    ],
    extraColumns: [withText<MasterColumn>({ id: 'category', header: '', hideBelow: 'md', render: (r) => r.category || '—' }, { header: 'field.group' })],
    searchText: (r) => [r.category],
  }),
  entity('inventory-categories', {
    hasActive: false,
    fields: [
      codeField(),
      nameField(),
      withText<MasterField>(
        { key: 'type', label: '', type: 'select', required: true, options: INVENTORY_TYPE_OPTIONS, defaultValue: 'SPAREPART' },
        { label: 'field.type' },
      ),
    ],
    extraColumns: [
      withText<MasterColumn>(
        {
          id: 'type',
          header: '',
          render: (r) =>
            r.type === 'SPAREPART' ? tEam('master.typeShort.SPAREPART') : r.type === 'CONSUMABLE' ? tEam('master.typeShort.CONSUMABLE') : r.type || '—',
        },
        { header: 'field.type' },
      ),
    ],
  }),
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
    if (f.required && !v) errors[f.key] = tEam('master.validation.required', { field: f.label });
    else if (f.maxLength && v.length > f.maxLength) errors[f.key] = tEam('master.validation.maxLength', { field: f.label, max: f.maxLength });
  }
  return errors;
}

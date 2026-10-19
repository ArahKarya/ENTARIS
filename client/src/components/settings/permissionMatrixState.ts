/**
 * Pure helpers for the role permission matrix (RolePermissionsTab).
 * Rules mirror the legacy editor: edit implies view; removing view removes edit.
 */
export type PermAction = 'view' | 'edit';
export interface PermFlags { view: boolean; edit: boolean }
export type PermDraft = Record<string, PermFlags>;
export type CheckState = boolean | 'indeterminate';

export interface RolePermLike { module: string; canView: boolean; canEdit: boolean }
export interface ModuleLike { key: string; label: string; group: string }

const NONE: PermFlags = { view: false, edit: false };

export function draftFromRole(perms: RolePermLike[]): PermDraft {
  const out: PermDraft = {};
  for (const p of perms) out[p.module] = { view: p.canView, edit: p.canEdit };
  return out;
}

export function setPerm(draft: PermDraft, mod: string, action: PermAction, val: boolean): PermDraft {
  const cur = draft[mod] ?? NONE;
  const next = { ...cur, [action]: val };
  if (action === 'edit' && val) next.view = true;
  if (action === 'view' && !val) next.edit = false;
  return { ...draft, [mod]: next };
}

export function setMany(draft: PermDraft, mods: string[], action: PermAction, val: boolean): PermDraft {
  return mods.reduce((acc, m) => setPerm(acc, m, action, val), draft);
}

/** Row toggle: full access (view + edit) or none. */
export function setRow(draft: PermDraft, mod: string, val: boolean): PermDraft {
  return { ...draft, [mod]: { view: val, edit: val } };
}

export function setRows(draft: PermDraft, mods: string[], val: boolean): PermDraft {
  return mods.reduce((acc, m) => setRow(acc, m, val), draft);
}

function aggregate(values: boolean[]): CheckState {
  if (values.length === 0) return false;
  const on = values.filter(Boolean).length;
  if (on === 0) return false;
  return on === values.length ? true : 'indeterminate';
}

export function columnState(draft: PermDraft, mods: string[], action: PermAction): CheckState {
  return aggregate(mods.map((m) => !!draft[m]?.[action]));
}

export function rowState(draft: PermDraft, mod: string): CheckState {
  const p = draft[mod] ?? NONE;
  return aggregate([p.view, p.edit]);
}

export function rowsState(draft: PermDraft, mods: string[]): CheckState {
  return aggregate(mods.flatMap((m) => [!!draft[m]?.view, !!draft[m]?.edit]));
}

/** Payload sent to PUT /roles/:id — identical to the legacy editor. */
export function toPermissionsPayload(draft: PermDraft): RolePermLike[] {
  return Object.entries(draft)
    .filter(([, v]) => v.view || v.edit)
    .map(([module, v]) => ({ module, canView: v.view || v.edit, canEdit: v.edit }));
}

function permKey(list: RolePermLike[]): string {
  return list
    .filter((p) => p.canView || p.canEdit)
    .map((p) => `${p.module}:${p.canView || p.canEdit ? 1 : 0}${p.canEdit ? 1 : 0}`)
    .sort()
    .join('|');
}

export function isPermDraftDirty(original: RolePermLike[], draft: PermDraft): boolean {
  return permKey(original) !== permKey(toPermissionsPayload(draft));
}

export function isCapsDirty(original: string[], draft: Set<string>): boolean {
  if (original.length !== draft.size) return true;
  return original.some((c) => !draft.has(c));
}

/**
 * Groups catalog modules by group (catalog order). Modules present in the role
 * but missing from the catalog are listed under "Lainnya" so nothing is hidden.
 */
export function groupModules(catalog: ModuleLike[], extraKeys: string[] = []): Array<[string, ModuleLike[]]> {
  const groups = new Map<string, ModuleLike[]>();
  for (const m of catalog) {
    const list = groups.get(m.group) ?? [];
    groups.set(m.group, [...list, m]);
  }
  const known = new Set(catalog.map((m) => m.key));
  const extras = extraKeys.filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, group: 'Lainnya' }));
  if (extras.length > 0) groups.set('Lainnya', [...(groups.get('Lainnya') ?? []), ...extras]);
  return [...groups.entries()];
}

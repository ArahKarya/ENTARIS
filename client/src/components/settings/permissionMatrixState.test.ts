import { describe, expect, it } from 'vitest';
import {
  columnState, draftFromRole, groupModules, isCapsDirty, isPermDraftDirty, rowState, rowsState,
  setMany, setPerm, setRow, toPermissionsPayload,
} from './permissionMatrixState';

describe('permissionMatrix', () => {
  it('edit implies view and removing view removes edit', () => {
    const a = setPerm({}, 'sales', 'edit', true);
    expect(a.sales).toEqual({ view: true, edit: true });
    const b = setPerm(a, 'sales', 'view', false);
    expect(b.sales).toEqual({ view: false, edit: false });
    expect(a.sales).toEqual({ view: true, edit: true }); // immutable
  });

  it('bulk column and row toggles', () => {
    const d = setMany({}, ['a', 'b'], 'edit', true);
    expect(columnState(d, ['a', 'b'], 'view')).toBe(true);
    const e = setRow(d, 'a', false);
    expect(rowState(e, 'a')).toBe(false);
    expect(columnState(e, ['a', 'b'], 'edit')).toBe('indeterminate');
    expect(rowsState(e, ['a', 'b'])).toBe('indeterminate');
    expect(columnState({}, [], 'view')).toBe(false);
  });

  it('builds the same payload as the legacy editor', () => {
    const draft = { a: { view: true, edit: false }, b: { view: false, edit: false }, c: { view: false, edit: true } };
    expect(toPermissionsPayload(draft)).toEqual([
      { module: 'a', canView: true, canEdit: false },
      { module: 'c', canView: true, canEdit: true },
    ]);
  });

  it('detects dirty state', () => {
    const orig = [{ module: 'a', canView: true, canEdit: false }];
    expect(isPermDraftDirty(orig, draftFromRole(orig))).toBe(false);
    expect(isPermDraftDirty(orig, setPerm(draftFromRole(orig), 'a', 'edit', true))).toBe(true);
    expect(isPermDraftDirty(orig, { ...draftFromRole(orig), z: { view: false, edit: false } })).toBe(false);
    expect(isCapsDirty(['x'], new Set(['x']))).toBe(false);
    expect(isCapsDirty(['x'], new Set(['y']))).toBe(true);
  });

  it('groups catalog modules and keeps unknown role modules visible', () => {
    const groups = groupModules(
      [{ key: 'a', label: 'A', group: 'G1' }, { key: 'b', label: 'B', group: 'G2' }, { key: 'c', label: 'C', group: 'G1' }],
      ['a', 'ga_finance'],
    );
    expect(groups.map(([g, ms]) => [g, ms.map((m) => m.key)])).toEqual([
      ['G1', ['a', 'c']], ['G2', ['b']], ['Lainnya', ['ga_finance']],
    ]);
  });
});

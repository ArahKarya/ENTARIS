import { describe, expect, it } from 'vitest';
import { addNoteRows, fillIfEmpty, isPristineRow, removeNoteRows, rowsFromNote } from './sjsPrefill';

let n = 0;
const newId = () => `id-${++n}`;
const note = {
  id: 'sjs-1',
  items: [
    { itemName: 'Beras Medium', quantity: '1500.5', unit: 'Kg', inventoryItemId: 'inv-1' },
    { itemName: 'Dedak', quantity: 200, unit: 'Kg', inventoryItemId: null },
  ],
};
type Row = { id: string; inventoryItemId: string; itemName: string; fromNoteId?: string };
const blank = (): Row => ({ id: 'blank', inventoryItemId: '', itemName: '' });
const manual = (): Row => ({ id: 'm', inventoryItemId: 'inv-9', itemName: 'Katul' });

describe('rowsFromNote', () => {
  it('membentuk baris DO dari item SJS: qty angka, gudang kosong, penanda asal', () => {
    const rows = rowsFromNote(note, newId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ itemName: 'Beras Medium', quantity: 1500.5, unit: 'Kg', inventoryItemId: 'inv-1', warehouseId: '', fromNoteId: 'sjs-1' });
    expect(rows[1].inventoryItemId).toBe('');
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
  it('SJS tanpa item → tidak ada baris', () => {
    expect(rowsFromNote({ id: 'x', items: null }, newId)).toEqual([]);
  });
});

describe('addNoteRows', () => {
  it('mengganti baris kosong bawaan, mempertahankan baris yang sudah diisi staf', () => {
    const out = addNoteRows<Row>([blank(), manual()], rowsFromNote(note, newId));
    expect(out.map((r) => r.itemName)).toEqual(['Katul', 'Beras Medium', 'Dedak']);
  });
  it('tanpa baris SJS → daftar tidak berubah', () => {
    const cur = [blank()];
    expect(addNoteRows(cur, [])).toBe(cur);
  });
  it('baris tanpa inventoryItemId tapi bernama dianggap sudah diisi', () => {
    expect(isPristineRow({ inventoryItemId: '', itemName: 'Manual' })).toBe(false);
    expect(isPristineRow({ inventoryItemId: '', itemName: '   ' })).toBe(true);
  });
});

describe('removeNoteRows', () => {
  it('melepas centang SJS menarik hanya baris SJS itu', () => {
    const a = rowsFromNote(note, newId);
    const b = rowsFromNote({ id: 'sjs-2', items: [{ itemName: 'Menir', quantity: 5, unit: 'Kg' }] }, newId);
    const cur = addNoteRows<Row>([blank()], [...a, ...b]);
    const out = removeNoteRows(cur, 'sjs-1', blank);
    expect(out.map((r) => r.itemName)).toEqual(['Menir']);
  });
  it('baris ketikan staf tidak ikut tertarik; bila habis disisakan satu baris kosong', () => {
    const cur = addNoteRows<Row>([manual()], rowsFromNote(note, newId));
    expect(removeNoteRows(cur, 'sjs-1', blank).map((r) => r.itemName)).toEqual(['Katul']);
    const only = addNoteRows<Row>([blank()], rowsFromNote(note, newId));
    expect(removeNoteRows(only, 'sjs-1', blank)).toEqual([blank()]);
  });
  it('noteId null → buang semua baris asal SJS (ganti pelanggan)', () => {
    const cur = addNoteRows<Row>([manual()], rowsFromNote(note, newId));
    expect(removeNoteRows(cur, null, blank).map((r) => r.itemName)).toEqual(['Katul']);
  });
});

describe('fillIfEmpty', () => {
  it('mengisi hanya bila kosong, tidak menimpa ketikan staf', () => {
    expect(fillIfEmpty('', ' b 1234 xy ')).toBe('b 1234 xy');
    expect(fillIfEmpty('  ', 'Ujang')).toBe('Ujang');
    expect(fillIfEmpty('E 9240 QA', 'B 1 X')).toBe('E 9240 QA');
    expect(fillIfEmpty('', null)).toBe('');
  });
});

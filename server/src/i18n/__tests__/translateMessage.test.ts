import { describe, expect, it } from 'vitest';
import { MESSAGE_DICTIONARIES, hasTranslation, isPatternKey, translateMessage } from '../translateMessage';

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort();

describe('translateMessage', () => {
  it('translates exact entries to English', () => {
    expect(translateMessage('Akun tidak ditemukan.', 'en')).toBe('Account not found.');
    expect(translateMessage('Customer wajib dipilih.', 'en')).toBe('Customer is required.');
  });

  it('leaves Indonesian untouched for id', () => {
    expect(translateMessage('Akun tidak ditemukan.', 'id')).toBe('Akun tidak ditemukan.');
  });

  it('fills pattern entries with the dynamic parts', () => {
    expect(translateMessage('Item stok tidak ditemukan.', 'en')).toBe('Stock item not found.');
    expect(translateMessage("Kode item 'BRS-01' sudah digunakan.", 'en')).toBe("Item code 'BRS-01' is already in use.");
    expect(
      translateMessage("Stok 'Beras' di gudang Utama tidak cukup. Tersedia: 5 kg, dibutuhkan: 10 kg.", 'en'),
    ).toBe("Not enough stock of 'Beras' in warehouse Utama. Available: 5 kg, required: 10 kg.");
  });

  it('allows empty dynamic parts', () => {
    expect(translateMessage('PO-1 ditolak.', 'en')).toBe('PO-1 rejected.');
  });

  it('translates a known message nested in a pattern', () => {
    expect(translateMessage('Payload invoice tidak valid: Tanggal wajib diisi.', 'en')).toBe(
      'Invalid invoice payload: Date is required.',
    );
  });

  it('passes unknown messages through unchanged', () => {
    expect(translateMessage('Pesan yang belum terdaftar.', 'en')).toBe('Pesan yang belum terdaftar.');
    expect(translateMessage('', 'en')).toBe('');
    expect(hasTranslation('Pesan yang belum terdaftar.')).toBe(false);
  });
});

describe('message dictionaries', () => {
  const entries = MESSAGE_DICTIONARIES.flatMap((d) => Object.entries(d));

  it('have no key defined twice', () => {
    const keys = entries.map(([k]) => k);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('keep the same placeholders in English', () => {
    const bad = entries.filter(([id, en]) => placeholders(id).join() !== placeholders(en).join());
    expect(bad).toEqual([]);
  });

  it('follow the English style rules', () => {
    const bad = entries.filter(([, en]) => !en.trim() || /!|successfully/i.test(en));
    expect(bad).toEqual([]);
  });

  it('use the glossary in the Indonesian text', () => {
    const bad = entries.filter(([id]) => /\b(pemasok|vendor|pelanggan)\b|faktur (penjualan|pembelian)/i.test(id));
    expect(bad).toEqual([]);
  });

  it('have patterns with literal text, not only placeholders', () => {
    const bad = entries.filter(([id]) => isPatternKey(id) && id.replace(/\{\d+\}/g, '').replace(/[\s\p{P}]/gu, '').length < 3);
    expect(bad).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { getTool } from '../../ai/registry';
import { explainExecutionError, findBadIds, formatBadIds, isEntityId } from '../idShape';

const UUID = '8e836864-57b1-4c6a-ad34-14dfe6cc5eb1';
const CUID = 'cmv5hp0u9002frxvdxzhgvvmq';

describe('isEntityId', () => {
  it('menerima UUID dan CUID, menolak nama / nomor dokumen / kode akun', () => {
    expect(isEntityId(UUID)).toBe(true);
    expect(isEntityId(UUID.toUpperCase())).toBe(true);
    expect(isEntityId(CUID)).toBe(true);
    for (const bad of ['Hermanto', 'SI-202610-0053', 'Bank BCA', '1.1.5', '', 'c123', UUID.slice(1)]) expect(isEntityId(bad)).toBe(false);
  });
});

describe('findBadIds: pay_record (kasus laporan PMD)', () => {
  const tool = getTool('pay_record')!;
  const ok = { date: '2026-10-25', amount: 1000, paymentType: 'Receive' };

  it('partyId berupa nama ditolak, dengan petunjuk party_search', () => {
    const r = findBadIds(tool, { ...ok, partyId: 'Hermanto', accountId: UUID });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ path: 'partyId', value: 'Hermanto' });
    expect(formatBadIds(r)).toContain('party_search');
  });

  it('accountId berupa nama akun ditolak, dengan petunjuk coa_flat', () => {
    const r = findBadIds(tool, { ...ok, partyId: UUID, accountId: 'Bank BCA' });
    expect(r.map((i) => i.path)).toEqual(['accountId']);
    expect(formatBadIds(r)).toContain('coa_flat');
  });

  it('allocations[].invoiceId berupa nomor dokumen ditolak (field bersarang)', () => {
    const r = findBadIds(tool, { ...ok, partyId: UUID, accountId: UUID, allocations: [{ invoiceType: 'SalesInvoice', invoiceId: 'SI-202610-0053', amount: 1000 }] });
    expect(r.map((i) => i.path)).toEqual(['allocations[].invoiceId']);
    expect(formatBadIds(r)).toContain('si_list');
  });

  it('splits[].accountId diperiksa untuk tiap baris', () => {
    const r = findBadIds(tool, { ...ok, partyId: UUID, splits: [{ accountId: UUID, amount: 1 }, { accountId: 'Kas', amount: 2 }] });
    expect(r.map((i) => i.path)).toEqual(['splits[].accountId']);
  });

  it('semua ID valid → lolos; argumen kosong diabaikan (urusan missingRequired)', () => {
    expect(findBadIds(tool, { ...ok, partyId: UUID, accountId: UUID, allocations: [{ invoiceType: 'SalesInvoice', invoiceId: UUID, amount: 1 }] })).toEqual([]);
    expect(findBadIds(tool, { ...ok })).toEqual([]);
  });

  it('banyak kesalahan dilaporkan sekaligus', () => {
    const r = findBadIds(tool, { ...ok, partyId: 'Hermanto', accountId: 'Bank BCA' });
    expect(r.map((i) => i.path)).toEqual(['partyId', 'accountId']);
  });
});

describe('findBadIds: batas aman', () => {
  it('tool baca tidak diperiksa (party_search search bebas)', () => {
    expect(findBadIds(getTool('party_search')!, { search: 'Hermanto' })).toEqual([]);
    expect(findBadIds({ risk: 'read', params: [{ name: 'partyId', in: 'query', type: 'string', required: false }] }, { partyId: 'x' })).toEqual([]);
  });

  it('param ber-nama Id yang bukan ID entitas dikecualikan (taxId = NPWP)', () => {
    expect(findBadIds(getTool('party_create')!, { name: 'PT X', partyType: 'Customer', taxId: '01.234.567.8-901.000' })).toEqual([]);
  });

  it('CUID (modul GA) diterima', () => {
    expect(findBadIds(getTool('ga_asset_create')!, { branchId: CUID, categoryId: CUID, name: 'x' })).toEqual([]);
  });

  it('ID bertipe array dicek per elemen', () => {
    const t = { risk: 'write' as const, params: [{ name: 'processIds', in: 'body' as const, type: 'array<uuid>', required: false }] };
    expect(findBadIds(t, { processIds: [UUID, 'Giling'] }).map((i) => i.path)).toEqual(['processIds']);
    expect(findBadIds(t, { processIds: [UUID] })).toEqual([]);
  });

  it('nilai non-teks untuk param ID ditolak, panjang dipotong', () => {
    const t = { risk: 'write' as const, params: [{ name: 'partyId', in: 'body' as const, type: 'string', required: true }] };
    expect(findBadIds(t, { partyId: 42 })).toHaveLength(1);
    expect(findBadIds(t, { partyId: 'x'.repeat(200) })[0].value.length).toBeLessThanOrEqual(41);
  });

  it('semua petunjuk mengarah ke tool yang ada di registry', () => {
    const msg = ['partyId', 'accountId', 'invoiceId', 'itemId', 'assetId', 'warehouseId', 'salesOrderId', 'quotationId'];
    const t = { risk: 'write' as const, params: msg.map((n) => ({ name: n, in: 'body' as const, type: 'string', required: false })) };
    const hints = findBadIds(t, Object.fromEntries(msg.map((n) => [n, 'x']))).flatMap((i) => (i.hint ?? '').match(/[a-z]+_[a-z_]+/g) ?? []);
    for (const h of hints) expect(getTool(h), h).toBeTruthy();
  });
});

describe('explainExecutionError (lapis 3: pesan gagal yang bisa ditindaklanjuti)', () => {
  it('menambah petunjuk untuk galat handler khas dan mempertahankan pesan asli', () => {
    const a = explainExecutionError('Data mitra tidak ditemukan.');
    expect(a).toContain('Data mitra tidak ditemukan.');
    expect(a).toContain('party_search');
    expect(explainExecutionError('Akun kas/bank tidak ditemukan.')).toContain('coa_flat');
    expect(explainExecutionError('Invoice penjualan tidak ditemukan.')).toContain('si_list');
    expect(explainExecutionError('Akun yang dipilih bukan akun kas/bank.')).toContain('akun kas/bank (1.1.x)');
  });
  it('pesan lain dikembalikan apa adanya', () => {
    expect(explainExecutionError('Stok tidak mencukupi.')).toBe('Stok tidak mencukupi.');
  });
});

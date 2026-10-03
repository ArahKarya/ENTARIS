import { describe, expect, it } from 'vitest';
import { STATUS_TONES, getStatusLabel, getStatusMeta, getStatusTone, normalizeStatusKey } from './status';

describe('normalizeStatusKey', () => {
  it('ignores case, underscores, spaces and dashes', () => {
    expect(normalizeStatusKey('IN_PROGRESS')).toBe('inprogress');
    expect(normalizeStatusKey('PartiallyPaid')).toBe('partiallypaid');
    expect(normalizeStatusKey(' on-hold ')).toBe('onhold');
  });
});

describe('getStatusMeta', () => {
  it('maps Prisma enum values in either casing to the same Indonesian label', () => {
    expect(getStatusMeta('Draft')).toEqual({ label: 'Draf', tone: 'neutral' });
    expect(getStatusMeta('DRAFT')).toEqual({ label: 'Draf', tone: 'neutral' });
  });

  it('covers invoice payment states', () => {
    expect(getStatusMeta('Paid')).toEqual({ label: 'Lunas', tone: 'success' });
    expect(getStatusMeta('PartiallyPaid')).toEqual({ label: 'Dibayar Sebagian', tone: 'warning' });
    expect(getStatusMeta('Overdue')).toEqual({ label: 'Jatuh Tempo', tone: 'danger' });
  });

  it('applies document-specific meaning for Submitted', () => {
    expect(getStatusMeta('Submitted').label).toBe('Diajukan');
    expect(getStatusMeta('Submitted', 'sales_invoice')).toEqual({ label: 'Belum Lunas', tone: 'warning' });
    expect(getStatusMeta('Submitted', 'journal')).toEqual({ label: 'Diposting', tone: 'success' });
    expect(getStatusMeta('Submitted', 'sales_order')).toEqual({ label: 'Dikonfirmasi', tone: 'info' });
  });

  it('falls back to the generic map when the doc type has no override', () => {
    expect(getStatusMeta('Cancelled', 'sales_invoice')).toEqual({ label: 'Dibatalkan', tone: 'neutral' });
  });

  it('covers GA / EAM enums and Indonesian-valued statuses', () => {
    expect(getStatusMeta('IN_REPAIR')).toEqual({ label: 'Dalam Perbaikan', tone: 'warning' });
    expect(getStatusMeta('KLAIM_ASURANSI').label).toBe('Klaim Asuransi');
    expect(getStatusMeta('Disetor')).toEqual({ label: 'Disetor', tone: 'info' });
    expect(getStatusMeta('Baru').tone).toBe('info');
  });

  it('humanises unknown statuses with a neutral tone instead of throwing', () => {
    expect(getStatusMeta('SOME_NEW_STATE')).toEqual({ label: 'Some New State', tone: 'neutral' });
    expect(getStatusMeta('')).toEqual({ label: '-', tone: 'neutral' });
    expect(getStatusMeta(null)).toEqual({ label: '-', tone: 'neutral' });
  });

  it('only ever returns a known tone', () => {
    for (const s of ['Draft', 'Paid', 'Overdue', 'ACTIVE', 'whatever']) {
      expect(STATUS_TONES).toContain(getStatusTone(s));
    }
  });

  it('exposes label/tone shortcuts', () => {
    expect(getStatusLabel('Approved')).toBe('Disetujui');
    expect(getStatusTone('Rejected')).toBe('danger');
  });
});

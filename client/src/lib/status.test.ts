import { describe, expect, it } from 'vitest';
import { STATUS_TONES, getStatusLabel, getStatusMeta, getStatusTone, normalizeStatusKey, statusOptions } from './status';

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

describe('statusOptions', () => {
  it('labels filter options for sales invoices in Indonesian', () => {
    expect(statusOptions(['Submitted', 'PartiallyPaid', 'Paid', 'Overdue', 'Cancelled', 'Draft'], 'sales_invoice')).toEqual([
      { value: 'Submitted', label: 'Belum Lunas' },
      { value: 'PartiallyPaid', label: 'Dibayar Sebagian' },
      { value: 'Paid', label: 'Lunas' },
      { value: 'Overdue', label: 'Jatuh Tempo' },
      { value: 'Cancelled', label: 'Dibatalkan' },
      { value: 'Draft', label: 'Draf' },
    ]);
  });
});

describe('sales order / delivery statuses', () => {
  it('labels sales order statuses', () => {
    expect(statusOptions(['Draft', 'Submitted', 'PartiallyDelivered', 'FullyDelivered', 'Cancelled'], 'sales_order')).toEqual([
      { value: 'Draft', label: 'Draf' },
      { value: 'Submitted', label: 'Dikonfirmasi' },
      { value: 'PartiallyDelivered', label: 'Terkirim Sebagian' },
      { value: 'FullyDelivered', label: 'Terkirim Penuh' },
      { value: 'Cancelled', label: 'Dibatalkan' },
    ]);
  });

  it('labels the derived delivery order statuses', () => {
    expect(getStatusMeta('Invoiced', 'delivery_order')).toEqual({ label: 'Sudah Diinvoice', tone: 'success' });
    expect(getStatusMeta('Uninvoiced', 'delivery_order')).toEqual({ label: 'Belum Diinvoice', tone: 'warning' });
    expect(getStatusLabel('Submitted', 'delivery_order')).toBe('Diposting');
  });

  it('labels Surat Jalan Sementara statuses', () => {
    expect(getStatusMeta('Open', 'temporary_delivery_note')).toEqual({ label: 'Terbuka', tone: 'warning' });
    expect(getStatusMeta('Linked', 'temporary_delivery_note')).toEqual({ label: 'Tertaut', tone: 'success' });
    expect(getStatusLabel('Cancelled', 'temporary_delivery_note')).toBe('Dibatalkan');
    // Generic "open" elsewhere stays informational.
    expect(getStatusTone('Open')).toBe('info');
  });

  it('labels customer/vendor deposit usage states', () => {
    expect(getStatusMeta('Active', 'deposit')).toEqual({ label: 'Aktif', tone: 'info' });
    expect(getStatusMeta('PartiallyUsed', 'deposit')).toEqual({ label: 'Terpakai Sebagian', tone: 'warning' });
    expect(getStatusMeta('FullyUsed', 'deposit')).toEqual({ label: 'Terpakai', tone: 'success' });
    expect(getStatusLabel('Cancelled', 'deposit')).toBe('Dibatalkan');
    expect(statusOptions(['Active', 'PartiallyUsed', 'FullyUsed', 'Cancelled'], 'deposit').map((o) => o.label)).toEqual([
      'Aktif',
      'Terpakai Sebagian',
      'Terpakai',
      'Dibatalkan',
    ]);
  });
});

describe('purchasing statuses (PO / STT)', () => {
  it('labels purchase order statuses', () => {
    expect(statusOptions(['Submitted', 'Cancelled'], 'purchase_order')).toEqual([
      { value: 'Submitted', label: 'Dipesan' },
      { value: 'Cancelled', label: 'Dibatalkan' },
    ]);
  });

  it('labels the derived goods receipt (STT) billing statuses', () => {
    expect(getStatusMeta('Invoiced', 'goods_receipt')).toEqual({ label: 'Sudah Ditagih', tone: 'success' });
    expect(getStatusMeta('Uninvoiced', 'goods_receipt')).toEqual({ label: 'Belum Ditagih', tone: 'warning' });
    expect(getStatusMeta('CustomerOwned', 'goods_receipt')).toEqual({ label: 'Titipan', tone: 'info' });
    expect(getStatusLabel('Submitted', 'goods_receipt')).toBe('Diposting');
    expect(
      statusOptions(['Uninvoiced', 'Invoiced', 'CustomerOwned', 'Cancelled'], 'goods_receipt').map((o) => o.label),
    ).toEqual(['Belum Ditagih', 'Sudah Ditagih', 'Titipan', 'Dibatalkan']);
  });
});

describe('project guarantee statuses', () => {
  it('labels the stored Indonesian statuses', () => {
    expect(getStatusMeta('Disetor', 'project_guarantee')).toEqual({ label: 'Disetor', tone: 'info' });
    expect(getStatusMeta('Selesai', 'project_guarantee')).toEqual({ label: 'Selesai', tone: 'success' });
    expect(getStatusMeta('Dibatalkan', 'project_guarantee')).toEqual({ label: 'Dibatalkan', tone: 'neutral' });
    expect(statusOptions(['Disetor', 'Selesai', 'Dibatalkan'], 'project_guarantee').map((o) => o.label)).toEqual([
      'Disetor',
      'Selesai',
      'Dibatalkan',
    ]);
  });
});

describe('inventory statuses', () => {
  it('labels the derived item stock levels', () => {
    expect(getStatusMeta('out', 'inventory_item')).toEqual({ label: 'Habis', tone: 'danger' });
    expect(getStatusMeta('low', 'inventory_item')).toEqual({ label: 'Menipis', tone: 'warning' });
    expect(getStatusMeta('ok', 'inventory_item')).toEqual({ label: 'Aman', tone: 'success' });
  });

  it('labels production run states', () => {
    expect(getStatusLabel('active', 'production_run')).toBe('Diposting');
    expect(getStatusLabel('Cancelled', 'production_run')).toBe('Dibatalkan');
  });
});

describe('approval statuses', () => {
  it('labels the approval request lifecycle', () => {
    expect(getStatusMeta('Pending', 'approval')).toEqual({ label: 'Menunggu', tone: 'warning' });
    expect(getStatusMeta('Approved', 'approval')).toEqual({ label: 'Disetujui', tone: 'success' });
    expect(getStatusMeta('Rejected', 'approval')).toEqual({ label: 'Ditolak', tone: 'danger' });
    expect(getStatusMeta('NeedsRevision', 'approval')).toEqual({ label: 'Perlu Revisi', tone: 'warning' });
  });
});

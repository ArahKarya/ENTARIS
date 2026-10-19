import { describe, it, expect } from 'vitest';
import {
  buildInquiryWhere,
  DEFAULT_INQUIRY_SORT,
  inquiryOrderBy,
  summarizeInquiries,
  type InquiryStatusGroupRow,
} from '../inquiryList';

const group = (status: string, n: number): InquiryStatusGroupRow => ({ status, _count: { _all: n } });

describe('summarizeInquiries', () => {
  it('counts per status and computes the conversion rate over all matching inquiries', () => {
    const summary = summarizeInquiries([
      group('Baru', 4),
      group('Diproses', 2),
      group('Dikonversi', 3),
      group('Hilang', 1),
      group('Ditutup', 2),
    ]);
    expect(summary).toEqual({
      count: 12,
      newCount: 4,
      inProgressCount: 2,
      convertedCount: 3,
      lostCount: 1,
      closedCount: 2,
      conversionRate: 0.25,
      byStatus: { Baru: 4, Diproses: 2, Dikonversi: 3, Hilang: 1, Ditutup: 2 },
    });
  });

  it('rounds the rate to 4 decimals', () => {
    expect(summarizeInquiries([group('Dikonversi', 1), group('Baru', 2)]).conversionRate).toBe(0.3333);
  });

  it('handles an empty result', () => {
    expect(summarizeInquiries([])).toEqual({
      count: 0,
      newCount: 0,
      inProgressCount: 0,
      convertedCount: 0,
      lostCount: 0,
      closedCount: 0,
      conversionRate: 0,
      byStatus: {},
    });
  });
});

describe('buildInquiryWhere', () => {
  it('builds filters shared by list and summary', () => {
    const r = buildInquiryWhere({
      status: 'Baru',
      channel: 'WhatsApp',
      partyId: 'p1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: '  budi ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('Baru');
    expect(r.where.channel).toBe('WhatsApp');
    expect(r.where.partyId).toBe('p1');
    expect(r.where.date).toEqual({
      gte: new Date('2025-12-31T17:00:00.000Z'),
      lt: new Date('2026-01-31T17:00:00.000Z'),
    });
    // inquiry number, prospect name and linked customer name
    expect(r.where.OR).toHaveLength(3);
    expect(JSON.stringify(r.where.OR)).toContain('"budi"');
  });

  it('returns an empty filter when nothing is set', () => {
    expect(buildInquiryWhere({ status: '', channel: '', search: '  ' })).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown statuses/channels and malformed dates', () => {
    expect(buildInquiryWhere({ status: 'Open' }).ok).toBe(false);
    expect(buildInquiryWhere({ channel: 'Fax' }).ok).toBe(false);
    expect(buildInquiryWhere({ endDate: '2026/01/31' }).ok).toBe(false);
  });
});

describe('inquiryOrderBy', () => {
  it('adds a stable inquiry number tie-breaker', () => {
    expect(inquiryOrderBy(DEFAULT_INQUIRY_SORT)).toEqual([{ date: 'desc' }, { inquiryNumber: 'desc' }]);
    expect(inquiryOrderBy({ field: 'inquiryNumber', dir: 'asc' })).toEqual([{ inquiryNumber: 'asc' }]);
    expect(inquiryOrderBy({ field: 'prospectName', dir: 'asc' })).toEqual([
      { prospectName: 'asc' },
      { inquiryNumber: 'asc' },
    ]);
  });
});

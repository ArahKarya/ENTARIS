import { describe, expect, it } from 'vitest';
import { buildCard } from '../cards';

const ok = (data: unknown) => ({ ok: true, status: 201, data });

describe('buildCard', () => {
  it('Draft Buku Kas: link to the review page with number, title and row count', () => {
    const c = buildCard('kas_buat_draft_dari_baris', ok({ id: 'd1', draftNumber: 'DKB-202610-0001', title: 'Buku kas Oktober', status: 'Draft', rows: [{}, {}, {}], needsReviewCount: 1, reviewPath: '/cash-book-drafts/d1' }));
    expect(c).toMatchObject({ kind: 'cash_book_draft', title: 'Draft Buku Kas DKB-202610-0001', href: '/cash-book-drafts/d1', entityId: 'd1' });
    expect(c?.summary).toContain('3 baris');
    expect(c?.summary).toContain('1 perlu ditinjau');
  });

  it('production draft (nested draft + warnings) links to the Draft tab', () => {
    const c = buildCard('prod_draft_create', ok({ draft: { id: 'p1', draftNumber: 'DPR-202610-0003', status: 'Draft' }, warnings: ['stok kurang'] }));
    expect(c).toMatchObject({ kind: 'production_draft', title: 'Draft Produksi DPR-202610-0003', href: '/inventory?tab=production&view=draft' });
    expect(c?.summary).toContain('1 peringatan');
  });

  it('payment request, PO, quotation, SO drafts', () => {
    expect(buildCard('payreq_create', ok({ id: 'r1', number: 'PP-1', status: 'DRAFT', totalAmount: 1500000 }))).toMatchObject({ kind: 'payment_request_draft', href: '/payment-requests/r1' });
    expect(buildCard('po_create', ok({ id: 'o1', poNumber: 'PO-1', status: 'Draft', grandTotal: 1000 }))).toMatchObject({ kind: 'purchase_order_draft', href: '/purchase-orders' });
    expect(buildCard('quot_create', ok({ id: 'q1', quotationNumber: 'QT-1', status: 'Draft' }))).toMatchObject({ kind: 'quotation_draft', href: '/quotations' });
    expect(buildCard('so_create', ok({ id: 's1', soNumber: 'SO-1', status: 'Draft' }))).toMatchObject({ kind: 'sales_order_draft', href: '/sales-orders' });
  });

  it('queued approval → approval card to /approvals with the confirm text', () => {
    const c = buildCard('kas_draft_posting', { ok: true, status: 'pending_approval', approvalId: 'a1', confirm: 'Posting draft DKB-1?' });
    expect(c).toMatchObject({ kind: 'approval', href: '/approvals', entityId: 'a1', summary: 'Posting draft DKB-1?' });
  });

  it('handler that queued internally (approvalRequestId) → approval card', () => {
    expect(buildCard('po_create', ok({ id: 'o1', poNumber: 'PO-1', approvalRequestId: 'ar9' }))?.kind).toBe('approval');
  });

  it('no card for read tools, failures, or results without an id', () => {
    expect(buildCard('coa_list', ok({ data: [] }))).toBeUndefined();
    expect(buildCard('kas_buat_draft_dari_baris', { ok: false, error: 'x' })).toBeUndefined();
    expect(buildCard('kas_buat_draft_dari_baris', ok({ title: 'tanpa id' }))).toBeUndefined();
  });
});

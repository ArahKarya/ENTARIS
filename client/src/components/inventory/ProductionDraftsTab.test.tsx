import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get } }));

import { ProductionDraftsTab } from './ProductionDraftsTab';

const draft = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  draftNumber: 'DPR-202610-0003',
  date: '2026-10-14',
  status: 'Draft',
  createdAt: '2026-10-14T01:00:00Z',
  createdBy: { id: 'u1', fullName: 'Aditya' },
  summary: null,
  ...over,
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => get.mockReset());

function renderTab(props: Partial<React.ComponentProps<typeof ProductionDraftsTab>> = {}) {
  const handlers = { onEdit: vi.fn(), onPost: vi.fn(), onDelete: vi.fn(), onOpenRun: vi.fn() };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProductionDraftsTab canEdit canManage={() => true} {...handlers} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return handlers;
}

describe('ProductionDraftsTab: tombol Posting langsung di baris', () => {
  it('draft berstatus Draft punya tombol Posting yang memanggil onPost (tanpa membuka edit)', async () => {
    get.mockResolvedValue({ data: { data: [draft()], total: 1, counts: {} } });
    const h = renderTab();
    const btn = await screen.findByRole('button', { name: /DPR-202610-0003/ , description: undefined }).catch(() => null);
    const post = btn ?? (await screen.findAllByRole('button')).find((b) => /posting|post draft/i.test(b.getAttribute('aria-label') ?? ''))!;
    fireEvent.click(post);
    await waitFor(() => expect(h.onPost).toHaveBeenCalledTimes(1));
    expect(h.onPost.mock.calls[0][0].id).toBe('d1');
    expect(h.onEdit).not.toHaveBeenCalled(); // klik tombol tidak boleh ikut membuka baris
  });

  it('tidak muncul untuk draft yang sudah Posted', async () => {
    get.mockResolvedValue({ data: { data: [draft({ status: 'Posted', postedRunId: 'r1', postedRunNumber: 'PR-1' })], total: 1, counts: {} } });
    renderTab();
    await screen.findByText('PR-1');
    expect(screen.queryByRole('button', { name: /posting draft|post draft/i })).toBeNull();
  });

  it('tidak muncul bila user tidak boleh mengelola draft', async () => {
    get.mockResolvedValue({ data: { data: [draft()], total: 1, counts: {} } });
    renderTab({ canManage: () => false });
    await screen.findByText('DPR-202610-0003');
    expect(screen.queryByRole('button', { name: /posting draft|post draft/i })).toBeNull();
  });
});

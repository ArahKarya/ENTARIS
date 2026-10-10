import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get } }));

import { PARTY_PICKER_LIMIT, usePartyPicker } from './usePartyPicker';

const ALPHA = { id: 'p-1', name: 'Alpha', email: 'a@x.id', isWapu: true };
const BETA = { id: 'p-2', name: 'Beta' };

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// GET /parties returns rows matching `search` (by name); GET /parties/:id returns one party.
function serve(rows: Array<{ id: string; name: string }>, byId: Record<string, object> = {}) {
  get.mockImplementation(async (url: string, config?: { params?: { search?: string } }) => {
    if (url === '/parties') {
      const q = config?.params?.search?.toLowerCase();
      const data = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
      return { data: { data, total: data.length } };
    }
    const id = url.split('/').pop() as string;
    return { data: byId[id] };
  });
}

beforeEach(() => {
  get.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('usePartyPicker', () => {
  it('queries the paged list mode (sort + limit 500) filtered by type', async () => {
    serve([ALPHA, BETA]);
    const { result } = renderHook(() => usePartyPicker({ type: 'Supplier' }), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(2));
    expect(get).toHaveBeenCalledWith('/parties', {
      params: { type: 'Supplier', search: undefined, isActive: undefined, sort: 'name', limit: PARTY_PICKER_LIMIT },
    });
    expect(result.current.pickerProps.options.map((o) => o.label)).toEqual(['Alpha', 'Beta']);
  });

  it('sends the debounced search term to the server', async () => {
    serve([ALPHA, BETA]);
    const { result } = renderHook(() => usePartyPicker({ type: 'Customer', activeOnly: true }), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(2));
    act(() => result.current.pickerProps.onSearchChange('  bet '));
    await waitFor(() => expect(result.current.options.map((o) => o.value)).toEqual(['p-2']));
    expect(get).toHaveBeenLastCalledWith('/parties', {
      params: { type: 'Customer', search: 'bet', isActive: 'true', sort: 'name', limit: PARTY_PICKER_LIMIT },
    });
  });

  it('always includes the selected party, loading it by id when outside the page', async () => {
    const zeta = { id: 'p-900', name: 'Zeta', outstandingAmount: '5000' };
    serve([ALPHA], { 'p-900': zeta });
    const { result } = renderHook(() => usePartyPicker({ selectedId: 'p-900' }), { wrapper });
    await waitFor(() => expect(result.current.selectedParty).toEqual(zeta));
    expect(result.current.options.map((o) => o.label)).toEqual(['Alpha', 'Zeta']);
    expect(get).toHaveBeenCalledWith('/parties/p-900');
  });

  it('keeps the selected party and its details after the search changes', async () => {
    serve([ALPHA, BETA]);
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePartyPicker({ selectedId: id }), {
      wrapper,
      initialProps: { id: null as string | null },
    });
    await waitFor(() => expect(result.current.options).toHaveLength(2));
    rerender({ id: 'p-1' });
    expect(result.current.selectedParty).toEqual(ALPHA);
    act(() => result.current.pickerProps.onSearchChange('beta'));
    await waitFor(() => expect(result.current.parties.map((p) => p.id)).toEqual(['p-2']));
    expect(result.current.selectedParty).toEqual(ALPHA);
    expect(result.current.options.map((o) => o.value)).toEqual(['p-2', 'p-1']);
    expect(get).not.toHaveBeenCalledWith('/parties/p-1');
  });

  it('uses a party known from the document without fetching it', async () => {
    serve([ALPHA]);
    const { result } = renderHook(() => usePartyPicker({ selectedId: 'p-7', known: { id: 'p-7', name: 'Dokumen' } }), { wrapper });
    await waitFor(() => expect(result.current.options.map((o) => o.label)).toEqual(['Alpha', 'Dokumen']));
  });

  it('does not query while disabled', () => {
    serve([ALPHA]);
    renderHook(() => usePartyPicker({ enabled: false, selectedId: 'p-1' }), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  it('refetches when party queries are invalidated', async () => {
    serve([ALPHA]);
    const { result } = renderHook(() => usePartyPicker(), { wrapper });
    await waitFor(() => expect(result.current.options).toHaveLength(1));
    serve([ALPHA, BETA]);
    await act(() => qc.invalidateQueries({ queryKey: ['parties'] }));
    await waitFor(() => expect(result.current.options).toHaveLength(2));
  });
});

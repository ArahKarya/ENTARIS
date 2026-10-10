import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get } }));

import { mergeSelectedPartyOption, useSelectedPartyOption } from './useSelectedPartyOption';

const options = [{ value: 'p-1', label: 'Alpha' }];

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('mergeSelectedPartyOption', () => {
  it('appends a selected party missing from the capped list', () => {
    expect(mergeSelectedPartyOption(options, { id: 'p-250', name: 'Zeta' })).toEqual([
      { value: 'p-1', label: 'Alpha' },
      { value: 'p-250', label: 'Zeta' },
    ]);
  });

  it('does not duplicate a party already listed and ignores an empty selection', () => {
    expect(mergeSelectedPartyOption(options, { id: 'p-1', name: 'Alpha' })).toEqual(options);
    expect(mergeSelectedPartyOption(options, null)).toEqual(options);
  });
});

describe('useSelectedPartyOption', () => {
  beforeEach(() => get.mockReset());

  it('uses the party already known from the document without fetching', () => {
    const { result } = renderHook(() => useSelectedPartyOption(options, 'p-250', { id: 'p-250', name: 'Zeta' }), { wrapper });
    expect(result.current.map((o) => o.label)).toEqual(['Alpha', 'Zeta']);
    expect(get).not.toHaveBeenCalled();
  });

  it('loads the selected party by id when it is not in the list', async () => {
    get.mockResolvedValue({ data: { id: 'p-250', name: 'Zeta' } });
    const { result } = renderHook(() => useSelectedPartyOption(options, 'p-250'), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(get).toHaveBeenCalledWith('/parties/p-250');
  });

  it('does not fetch when the selected party is already listed', () => {
    renderHook(() => useSelectedPartyOption(options, 'p-1'), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });
});

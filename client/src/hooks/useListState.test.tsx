import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useListState, parseSort, serializeSort, type UseListStateOptions } from './useListState';

type Key = 'status' | 'partyId';

function setup(initial = '/sales', options: UseListStateOptions<Key> = { filters: ['status', 'partyId'] }) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      const list = useListState<Key>(options);
      const location = useLocation();
      const navigate = useNavigate();
      return { list, location, navigate };
    },
    { wrapper },
  );
}

const query = (r: ReturnType<typeof setup>) => new URLSearchParams(r.result.current.location.search);

afterEach(() => {
  vi.useRealTimers();
});

describe('useListState', () => {
  it('reads defaults and builds API params without empty values', () => {
    const r = setup();
    const { list } = r.result.current;
    expect(list.page).toBe(1);
    expect(list.pageSize).toBe(25);
    expect(list.filters).toEqual({ status: '', partyId: '' });
    expect(list.hasActiveFilters).toBe(false);
    expect(list.params).toEqual({ page: 1, limit: 25 });
    expect(list.filterParams).toEqual({});
  });

  it('hydrates from a shared link', () => {
    const r = setup('/sales?page=3&size=50&q=beras&sort=-date&status=Paid&fromDO=x');
    const { list } = r.result.current;
    expect(list.page).toBe(3);
    expect(list.pageSize).toBe(50);
    expect(list.search).toBe('beras');
    expect(list.searchInput).toBe('beras');
    expect(list.sort).toEqual({ id: 'date', desc: true });
    expect(list.params).toEqual({ page: 3, limit: 50, search: 'beras', status: 'Paid', sort: '-date' });
    expect(list.filterParams).toEqual({ search: 'beras', status: 'Paid' });
    expect(list.hasActiveFilters).toBe(true);
  });

  it('ignores page sizes that are not offered', () => {
    const r = setup('/sales?size=37&page=-4');
    expect(r.result.current.list.pageSize).toBe(25);
    expect(r.result.current.list.page).toBe(1);
  });

  it('writes page to the URL and omits it on page 1', () => {
    const r = setup();
    act(() => r.result.current.list.setPage(4));
    expect(query(r).get('page')).toBe('4');
    act(() => r.result.current.list.setPage(1));
    expect(query(r).has('page')).toBe(false);
  });

  it('resets page to 1 when a filter, the page size or the sort changes', () => {
    const r = setup('/sales?page=5');
    act(() => r.result.current.list.setFilter('status', 'Paid'));
    expect(query(r).get('status')).toBe('Paid');
    expect(r.result.current.list.page).toBe(1);

    act(() => r.result.current.list.setPage(3));
    act(() => r.result.current.list.setPageSize(100));
    expect(query(r).get('size')).toBe('100');
    expect(r.result.current.list.page).toBe(1);

    act(() => r.result.current.list.setPage(2));
    act(() => r.result.current.list.setSort({ id: 'outstanding', desc: true }));
    expect(query(r).get('sort')).toBe('-outstanding');
    expect(r.result.current.list.page).toBe(1);
  });

  it('does not write the default page size or default sort', () => {
    const r = setup('/sales', { filters: ['status'], defaultSort: { id: 'date', desc: true } });
    expect(r.result.current.list.sort).toEqual({ id: 'date', desc: true });
    act(() => r.result.current.list.setSort({ id: 'date', desc: false }));
    expect(query(r).get('sort')).toBe('date');
    act(() => r.result.current.list.setSort({ id: 'date', desc: true }));
    expect(query(r).has('sort')).toBe(false);
    act(() => r.result.current.list.setPageSize(25));
    expect(query(r).has('size')).toBe(false);
  });

  it('debounces search by 300ms, trims it and resets the page', () => {
    vi.useFakeTimers();
    const r = setup('/sales?page=2');
    act(() => r.result.current.list.setSearch('  ber'));
    expect(r.result.current.list.searchInput).toBe('  ber');
    expect(query(r).has('q')).toBe(false);

    act(() => vi.advanceTimersByTime(299));
    expect(query(r).has('q')).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(query(r).get('q')).toBe('ber');
    expect(r.result.current.list.search).toBe('ber');
    expect(r.result.current.list.page).toBe(1);
    // Our own commit must not clobber the input the user is typing in.
    expect(r.result.current.list.searchInput).toBe('  ber');
  });

  it('follows back/forward navigation, including the search box', () => {
    vi.useFakeTimers();
    const r = setup();
    act(() => r.result.current.list.setFilter('status', 'Paid'));
    act(() => r.result.current.list.setSearch('abc'));
    act(() => vi.advanceTimersByTime(300));
    expect(r.result.current.list.filterParams).toEqual({ search: 'abc', status: 'Paid' });

    act(() => r.result.current.list.setFilter('partyId', 'p1'));
    expect(r.result.current.list.filters.partyId).toBe('p1');

    act(() => r.result.current.navigate(-1));
    expect(r.result.current.list.filters).toEqual({ status: 'Paid', partyId: '' });
    // Search typing replaced the history entry, so it is still applied here.
    expect(r.result.current.list.searchInput).toBe('abc');

    act(() => r.result.current.navigate(-1));
    expect(r.result.current.list.filters.status).toBe('');
    expect(r.result.current.list.search).toBe('');
    expect(r.result.current.list.searchInput).toBe('');

    act(() => r.result.current.navigate(1));
    expect(r.result.current.list.filters.status).toBe('Paid');
    expect(r.result.current.list.searchInput).toBe('abc');
  });

  it('resetFilters clears search and filters but keeps unrelated params, size and sort', () => {
    const r = setup('/sales?q=x&status=Paid&partyId=p&size=50&sort=date&page=3&fromDO=1');
    act(() => r.result.current.list.resetFilters());
    const q = query(r);
    expect(q.has('q') || q.has('status') || q.has('partyId') || q.has('page')).toBe(false);
    expect(q.get('size')).toBe('50');
    expect(q.get('sort')).toBe('date');
    expect(q.get('fromDO')).toBe('1');
    expect(r.result.current.list.searchInput).toBe('');
    expect(r.result.current.list.hasActiveFilters).toBe(false);
  });

  it('setFilters applies several keys in one history entry', () => {
    const r = setup();
    act(() => r.result.current.list.setFilters({ status: 'Paid', partyId: 'p9' }));
    expect(query(r).toString()).toBe('status=Paid&partyId=p9');
    act(() => r.result.current.navigate(-1));
    expect(r.result.current.list.filters).toEqual({ status: '', partyId: '' });
  });
});

describe('sort serialisation', () => {
  it('round-trips', () => {
    expect(serializeSort({ id: 'date', desc: true })).toBe('-date');
    expect(serializeSort({ id: 'date', desc: false })).toBe('date');
    expect(serializeSort(null)).toBe('');
    expect(parseSort('-outstanding')).toEqual({ id: 'outstanding', desc: true });
    expect(parseSort('-')).toBeNull();
    expect(parseSort(null)).toBeNull();
  });
});

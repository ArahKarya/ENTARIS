import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get } }));

import { PartyFilter } from './party-filter';
import { ComboboxFilter } from './combobox-filter';
import { OptionPicker } from '@/components/purchase-cash/OptionPicker';

beforeAll(() => {
  // jsdom lacks these; cmdk and Radix popper use them.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => get.mockReset());

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ComboboxFilter with server search', () => {
  it('reports each keystroke, skips local filtering and resets the search on close', () => {
    const onSearchChange = vi.fn();
    render(
      <ComboboxFilter
        label="Pemasok"
        value=""
        onChange={vi.fn()}
        allLabel="Semua pemasok"
        options={[{ value: 'p-1', label: 'Alpha' }]}
        onSearchChange={onSearchChange}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Cari…'), { target: { value: 'npwp-123' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('npwp-123');
    // Server already matched by NPWP; the option stays although its label does not contain the term.
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText('Cari…'), { key: 'Escape' });
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });
});

describe('OptionPicker with server search', () => {
  it('is always a searchable combobox (even with few options) and shows a loading state', () => {
    const onSearchChange = vi.fn();
    render(<OptionPicker value="" onChange={vi.fn()} options={[]} placeholder="Pilih Supplier" onSearchChange={onSearchChange} loading />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Memuat…')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cari pilihan'), { target: { value: 'abc' } });
    expect(onSearchChange).toHaveBeenLastCalledWith('abc');
  });
});

describe('PartyFilter', () => {
  it('searches parties on the server instead of loading a capped list', async () => {
    get.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url !== '/parties') return { data: { id: 'p-999', name: 'Pemasok Terpilih' } };
      const search = config?.params?.search as string | undefined;
      const data = search ? [{ id: 'p-450', name: 'Zulu Makmur' }] : [{ id: 'p-1', name: 'Alpha' }];
      return { data: { data, total: data.length } };
    });
    const onChange = vi.fn();
    renderWithQuery(<PartyFilter partyType="Supplier" value="p-999" onChange={onChange} />);
    // The selected party outside the first page still gets its label.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Pemasok Terpilih'));

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Cari supplier…'), { target: { value: 'zulu' } });
    const option = await screen.findByRole('option', { name: 'Zulu Makmur' });
    expect(get).toHaveBeenCalledWith('/parties', {
      params: { type: 'Supplier', search: 'zulu', isActive: undefined, sort: 'name', limit: 500 },
    });
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('p-450');
  });
});

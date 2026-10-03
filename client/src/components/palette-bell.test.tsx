import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const get = vi.fn();
const patch = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));
vi.mock('../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    patch: (...args: unknown[]) => patch(...args),
  },
}));

import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { ShortcutHelp } from './ShortcutHelp';

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  });
}

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
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  }
});

function setUser(user: Record<string, unknown>) {
  localStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'u', fullName: 'Uji', ...user }));
}

function Path() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function wrap(ui: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          {ui}
          <Path />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    stubStorage();
    get.mockReset();
    patch.mockReset();
  });

  it('is a labelled dialog whose combobox has focus on open', async () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    wrap(<CommandPalette isOpen onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: 'Palet perintah' });
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toHaveFocus());
  });

  it('finds pages by label and keyword, opens them with arrows + Enter, then closes', async () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    get.mockResolvedValue({ data: [] });
    const onClose = vi.fn();
    wrap(<CommandPalette isOpen onClose={onClose} />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'general ledger' } }); // old English name → keyword of Jurnal Umum
    const option = await screen.findByRole('option', { name: /Jurnal Umum/ });
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));
    // Arrow down to the page if it is not first, then Enter opens it.
    const options = screen.getAllByRole('option');
    for (let i = 0; i < options.indexOf(option); i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('path')).toHaveTextContent('/gl');
    expect(onClose).toHaveBeenCalled();
  });

  it('only lists pages the user can view (same rule as the sidebar)', async () => {
    setUser({ role: 'Viewer', permissions: { sales_invoice: { view: true, edit: false } } });
    wrap(<CommandPalette isOpen onClose={() => {}} />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'faktur' } });
    expect(await screen.findByRole('option', { name: /Faktur Penjualan/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Faktur Pembelian/ })).not.toBeInTheDocument();
  });

  it('keeps record search and drops records whose page is not allowed', async () => {
    setUser({ role: 'Viewer', permissions: { sales_invoice: { view: true, edit: false } } });
    get.mockResolvedValue({
      data: [
        { type: 'sales', id: '1', title: 'INV-001', subtitle: 'Penjualan - PT A', url: '/sales' },
        { type: 'journal', id: '2', title: 'JV-001', subtitle: 'x', url: '/gl' },
      ],
    });
    wrap(<CommandPalette isOpen onClose={() => {}} />);
    const input = await screen.findByRole('combobox');
    fireEvent.change(input, { target: { value: 'INV' } });
    expect(await screen.findByRole('option', { name: /INV-001/ }, { timeout: 2000 })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/search', expect.objectContaining({ params: { q: 'INV', limit: 15 } }));
    expect(screen.queryByRole('option', { name: /JV-001/ })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    const onClose = vi.fn();
    wrap(<CommandPalette isOpen onClose={onClose} />);
    const input = await screen.findByRole('combobox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('NotificationBell', () => {
  beforeEach(() => {
    stubStorage();
    get.mockReset();
  });

  it('labels the button with the unread count and shows the empty state', async () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.endsWith('unread-count') ? { count: 3 } : { data: [] } }),
    );
    wrap(<NotificationBell />);
    const button = await screen.findByRole('button', { name: 'Notifikasi, 3 belum dibaca' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('Belum ada notifikasi')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Notifikasi/ })).toBeInTheDocument();
  });

  it('lists notifications, marks unread ones and navigates on click', async () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    patch.mockResolvedValue({});
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.endsWith('unread-count')
          ? { count: 1 }
          : {
              data: [
                { id: 'n1', type: 'low_stock', title: 'Stok menipis', message: 'Beras', isRead: false, createdAt: new Date().toISOString() },
              ],
            },
      }),
    );
    wrap(<NotificationBell />);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Notifikasi, 1 belum dibaca/ }));
    });
    const row = await screen.findByRole('button', { name: /Stok menipis/ });
    expect(row).toHaveTextContent('Belum dibaca');
    fireEvent.click(row);
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/notifications/n1/read'));
    expect(screen.getByTestId('path')).toHaveTextContent('/inventory');
  });
});

describe('ShortcutHelp', () => {
  beforeEach(stubStorage);

  it('lists the shared map in Indonesian and hides go-to targets the user cannot open', () => {
    setUser({ role: 'Viewer', permissions: { sales_invoice: { view: true, edit: false } } });
    wrap(<ShortcutHelp isOpen onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Pintasan Keyboard' });
    expect(within(dialog).getByText('Cari halaman, data, atau aksi')).toBeInTheDocument();
    expect(within(dialog).getByText('Buka Faktur Penjualan')).toBeInTheDocument();
    expect(within(dialog).queryByText('Buka Faktur Pembelian')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Buat baru/)).not.toBeInTheDocument();
  });
});

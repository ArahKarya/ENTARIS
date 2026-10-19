import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { breadcrumbsFor } from '@/app/routes';
import { roleLabel, initials } from './role-label';
import { UserMenu } from './UserMenu';
import { ThemeProvider } from '@/contexts/ThemeContext';

/** Node ≥22 ships a global localStorage that shadows jsdom's; use a clean in-memory one. */
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

function setUser(user: Record<string, unknown>) {
  localStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'u', fullName: 'Uji Coba', ...user }));
}

function renderSidebar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(stubStorage);

  it('marks exactly one item as the current page (/sales-orders is not /sales)', () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    renderSidebar('/sales-orders');
    const nav = screen.getByRole('navigation', { name: 'Navigasi utama' });
    const current = within(nav).getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Sales Order/);
    expect(within(nav).getByRole('link', { name: 'Invoice Penjualan' })).not.toHaveAttribute('aria-current');
  });

  it('highlights the parent item for nav-hidden report pages and opens its section', () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    renderSidebar('/reports/profit-loss');
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Semua Laporan');
    expect(screen.getByRole('button', { name: 'Laporan' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows only modules the user can view (RBAC unchanged)', () => {
    setUser({ role: 'Viewer', permissions: { sales_invoice: { view: true, edit: false } } });
    renderSidebar('/');
    const sales = screen.getByRole('button', { name: 'Penjualan' });
    expect(sales).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(sales);
    expect(sales).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Invoice Penjualan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dasbor' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sales Order/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sistem' })).not.toBeInTheDocument();
  });

  it('has no personal credit or version in the chrome', () => {
    setUser({ role: 'Admin', isSuperAdmin: true });
    const { container } = renderSidebar('/');
    expect(container.textContent).not.toMatch(/Yayang|v\d+\.\d+/);
  });
});

describe('Breadcrumbs', () => {
  it('renders section, linked parent and the current page', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs items={breadcrumbsFor('/ga/vehicle/report')} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Kendaraan' })).toHaveAttribute('href', '/ga/vehicle');
    expect(screen.getByText('Laporan Armada')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Aset & Pemeliharaan')).toBeInTheDocument();
  });
});

describe('role labels', () => {
  it('maps role codes to Indonesian', () => {
    expect(roleLabel('Admin')).toBe('Administrator');
    expect(roleLabel('Accountant')).toBe('Akuntan');
    expect(roleLabel('StaffProduksi')).toBe('Staf Produksi');
    expect(roleLabel('Viewer')).toBe('Peninjau');
    expect(roleLabel('Custom')).toBe('Custom');
    expect(roleLabel(undefined)).toBe('Pengguna');
    expect(initials('Budi Santoso Putra')).toBe('BP');
    expect(initials('')).toBe('U');
  });
});

describe('UserMenu trigger', () => {
  beforeEach(stubStorage);

  const renderMenu = (fullName: string, role: string) =>
    render(
      <ThemeProvider>
        <UserMenu
          user={{ fullName, role }}
          onChangePassword={() => {}}
          onOpenShortcuts={() => {}}
          onOpenAbout={() => {}}
          onLogout={() => {}}
        />
      </ThemeProvider>,
    );

  it('shows the name and the Indonesian role', () => {
    renderMenu('Budi Santoso', 'Accountant');
    const trigger = screen.getByRole('button', { name: 'Menu pengguna: Budi Santoso' });
    expect(trigger).toHaveTextContent('Budi Santoso');
    expect(trigger).toHaveTextContent('Akuntan');
  });

  it('does not repeat a role that equals the name', () => {
    renderMenu('Administrator', 'Admin');
    const trigger = screen.getByRole('button', { name: 'Menu pengguna: Administrator' });
    expect(trigger.textContent?.match(/Administrator/g)).toHaveLength(1);
  });
});

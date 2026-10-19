import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post, put: vi.fn() } }));
vi.mock('@/lib/permissions', () => ({ cap: () => false }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import DeliveryOrderModal from './DeliveryOrderModal';

// jsdom tidak punya ResizeObserver / scrollIntoView yang dipakai komponen picker (cmdk, Radix).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;

const CUSTOMER = { id: 'p-1', name: 'PT Contoh Demo', partyType: 'Customer' };
const INV = [
  { id: 'inv-1', code: 'BRS', name: 'Beras Uji', unit: 'Kg', isActive: true, currentStock: 5000 },
  { id: 'inv-2', code: 'DDK', name: 'Dedak Uji', unit: 'Kg', isActive: true, currentStock: 5000 },
];
const NOTE = {
  id: 'sjs-1',
  number: 'SJS-202610-0001',
  date: '2026-10-14T00:00:00.000Z',
  nomorMobil: 'e9240qa',
  driverName: 'Andreas',
  recipientName: 'Pak Penerima',
  items: [
    { itemName: 'Beras Uji', quantity: 1500.5, unit: 'Kg', inventoryItemId: 'inv-1' },
    { itemName: 'Dedak Uji', quantity: 200, unit: 'Kg', inventoryItemId: 'inv-2' },
  ],
};

function serve() {
  get.mockImplementation(async (url: string) => {
    if (url === '/parties') return { data: { data: [CUSTOMER], total: 1 } };
    if (url.startsWith('/parties/')) return { data: CUSTOMER };
    if (url === '/inventory/items') return { data: { data: INV } };
    if (url.startsWith('/warehouses')) return { data: { data: [{ id: 'w-1', name: 'Gudang 1' }] } };
    if (url === '/sales-orders') return { data: { data: [] } };
    if (url === '/temporary-delivery-notes/linkable') return { data: [NOTE] };
    return { data: [] };
  });
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DeliveryOrderModal onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

async function pickCustomer() {
  const combo = await screen.findAllByRole('combobox');
  const customer = combo.find((c) => /pelanggan|customer/i.test(c.getAttribute('aria-label') ?? '')) ?? combo[1];
  fireEvent.click(customer);
  fireEvent.click(await screen.findByText(CUSTOMER.name));
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  serve();
});

describe('DeliveryOrderModal — centang Surat Jalan Sementara', () => {
  it('mencentang SJS mengisi baris barang dan header yang masih kosong; melepas centang menariknya lagi', async () => {
    renderModal();
    await pickCustomer();

    const box = await screen.findByRole('checkbox', { name: /SJS-202610-0001/ });
    expect(screen.queryByDisplayValue('E9240QA')).not.toBeInTheDocument();

    fireEvent.click(box);
    await waitFor(() => expect(screen.getByDisplayValue('E9240QA')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Andreas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pak Penerima')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row').length - 1).toBe(2); // header + 2 baris SJS
    expect(within(table).getByDisplayValue('1500.5')).toBeInTheDocument();
    expect(within(table).getByDisplayValue('200')).toBeInTheDocument();

    fireEvent.click(box);
    await waitFor(() => expect(within(screen.getByRole('table')).queryByDisplayValue('1500.5')).not.toBeInTheDocument());
    expect(within(screen.getByRole('table')).getAllByRole('row').length - 1).toBe(1); // satu baris kosong tersisa
  });

  it('tidak menimpa nomor mobil / sopir yang sudah diketik staf', async () => {
    renderModal();
    await pickCustomer();
    const plate = screen.getAllByRole('textbox').find((e) => /mobil|vehicle|plat/i.test((e as HTMLInputElement).placeholder + (e.getAttribute('aria-label') ?? '')));
    if (plate) fireEvent.change(plate, { target: { value: 'B 1234 XY' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: /SJS-202610-0001/ }));
    await waitFor(() => expect(screen.getByDisplayValue('Andreas')).toBeInTheDocument());
    if (plate) expect((plate as HTMLInputElement).value).toBe('B 1234 XY');
  });
});

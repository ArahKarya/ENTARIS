import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { get, post, put: vi.fn() } }));
vi.mock('@/lib/api', () => ({ default: { get, post, put: vi.fn() } }));

import ProformaModal from './ProformaModal';

type EditTarget = NonNullable<React.ComponentProps<typeof ProformaModal>['editTarget']>;

const coa = [
  { id: 'rev-4-1', accountNumber: '4.1', name: 'Penjualan', isGroup: false },
  { id: 'rev-4-2', accountNumber: '4.2', name: 'Pendapatan Jasa', isGroup: false },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/coa/flat') return { data: coa };
    return { data: { data: [] } };
  });
  post.mockResolvedValue({ data: { id: 'pf1' } });
});

/** Item dari Sales Order tidak membawa accountId (tabel sales_order_items tidak menyimpannya). */
const fromSalesOrder: EditTarget = {
  sourceKey: 'so-1', salesOrderId: 'so-1', partyId: 'cust-1',
  items: [
    { itemName: 'Pellet Sekam', itemType: 'product', inventoryItemId: 'inv-1', quantity: 10, unit: 'Kg', rate: 1000 },
    { itemName: 'Jasa Giling', itemType: 'service', serviceItemId: 'svc-1', quantity: 2, unit: 'Jam', rate: 5000 },
  ],
};

describe('ProformaModal: prefill dari Sales Order tanpa akun pendapatan', () => {
  it('memakai akun default 4.1 (barang) dan 4.2 (jasa), tidak menolak dengan "belum punya akun pendapatan"', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ProformaModal isOpen onClose={vi.fn()} editTarget={fromSalesOrder} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith('/coa/flat'));
    // akun default tersedia setelah COA termuat
    await new Promise((r) => setTimeout(r, 50));
    const submit = await screen.findByRole('button', { name: /simpan|buat|save|create/i });
    fireEvent.click(submit);

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.queryByText(/belum punya akun pendapatan/i)).toBeNull();
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/proforma-invoices');
    expect(body.items.map((i: { accountId: string }) => i.accountId)).toEqual(['rev-4-1', 'rev-4-2']);
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post } }));
vi.mock('../lib/api', () => ({ default: { get, post } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import GoodsReceiptModal, { type GoodsReceiptSourcePO } from './GoodsReceiptModal';

const NEW_ITEM = { id: 'item-new', code: 'BRS-HJT IR', name: 'Beras IR ', unit: 'Kg', averageCost: '0.00' };
const OLD_ITEM = { id: 'item-old', code: 'BRS-HJT', name: 'Beras Hajat', unit: 'Kg', averageCost: '12508.21' };

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  get.mockImplementation(async (url: string) => {
    if (url.startsWith('/inventory/items')) return { data: { data: [NEW_ITEM, OLD_ITEM] } };
    if (url.startsWith('/warehouses')) return { data: [{ id: 'wh-1', name: 'Gudang Utama', isActive: true }] };
    if (url.startsWith('/purchase-orders')) return { data: { data: [] } };
    if (url.startsWith('/parties')) return { data: { data: [{ id: 'sup-1', name: 'Supplier A', partyType: 'Supplier', isActive: true }], hasMore: false } };
    return { data: {} };
  });
});

const poFor = (item: typeof NEW_ITEM, estimatedRate: number): GoodsReceiptSourcePO => ({
  id: 'po-1',
  partyId: 'sup-1',
  warehouseId: 'wh-1',
  items: [{ id: 'poi-1', inventoryItemId: item.id, itemName: item.name, unit: 'Kg', quantity: 1000, qtyReceived: 0, estimatedRate }],
});

function renderModal(po: GoodsReceiptSourcePO) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GoodsReceiptModal onClose={vi.fn()} initialPurchaseOrder={po} />
    </QueryClientProvider>,
  );
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Simpan STT' }));
const sentLine = () => post.mock.calls[0][1].items[0];

describe('GoodsReceiptModal — Harga perkiraan untuk item baru', () => {
  it('item baru: menampilkan Harga perkiraan, wajib diisi, dan mengirimnya sebagai lockedUnitCost', async () => {
    renderModal(poFor(NEW_ITEM, 0));
    const price = await screen.findByLabelText(/Harga perkiraan \/ satuan/);
    expect(screen.getByText(/Item baru \(belum pernah ada stok masuk\)\. Harga per Kg/)).toBeInTheDocument();

    submit();
    expect(await screen.findByText(/Isi Harga perkiraan untuk 'Beras IR '/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(price, { target: { value: '12000' } });
    submit();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(sentLine()).toMatchObject({ inventoryItemId: 'item-new', quantity: 1000, lockedUnitCost: 12000, purchaseOrderItemId: 'poi-1' });
  });

  it('STT dari PO: Harga perkiraan terisi dari harga PO', async () => {
    renderModal(poFor(NEW_ITEM, 11500));
    const price = await screen.findByLabelText(/Harga perkiraan \/ satuan/);
    expect(price).toHaveValue(11500);
    submit();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(sentLine().lockedUnitCost).toBe(11500);
  });

  it('item lama (sudah punya harga rata-rata): kolom tidak muncul, server memakai averageCost', async () => {
    renderModal(poFor(OLD_ITEM, 0));
    await screen.findByText('BRS-HJT · Beras Hajat');
    expect(screen.queryByLabelText(/Harga perkiraan \/ satuan/)).not.toBeInTheDocument();
    submit();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(sentLine().lockedUnitCost).toBe(0);
  });
});

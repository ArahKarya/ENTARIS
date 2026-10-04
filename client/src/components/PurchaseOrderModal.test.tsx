import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: { get, post, put: vi.fn() } }));
vi.mock('../lib/api', () => ({ default: { get, post, put: vi.fn() } }));

import PurchaseOrderModal from './PurchaseOrderModal';

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PurchaseOrderModal onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const num = (s: string | null) => Number((s ?? '').replace(/[^\d,-]/g, '').replace(',', '.'));

describe('PurchaseOrderModal', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockImplementation((url: string) =>
      Promise.resolve({ data: url.startsWith('/approvals/check') ? { required: false } : [] }),
    );
  });

  it('computes line amount and footer totals live (discount, PPN, other costs)', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Nama item baris 1'), { target: { value: 'Gabah' } });
    fireEvent.change(screen.getByLabelText('Qty baris 1'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Harga baris 1'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('Diskon persen baris 1'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('PPN persen baris 1'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Jumlah biaya lain'), { target: { value: '75000' } });

    expect(num(screen.getByTestId('po-subtotal').textContent)).toBe(1000000);
    // 950.000 + 104.500 PPN + 75.000 ongkir
    expect(num(screen.getByTestId('po-grand-total').textContent)).toBe(1129500);
  });

  it('shows field errors instead of submitting an empty PO', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Simpan Draf/ }));
    expect(screen.getByText('Pilih supplier atau centang "PO Umum".')).toBeTruthy();
    expect(screen.getByText('Minimal satu item dengan nama dan qty > 0.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});

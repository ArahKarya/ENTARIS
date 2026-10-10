import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { put, get, post } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { put, get, post } }));

import PartyFormModal from './PartyFormModal';

const PARTY = { id: 'p-1', name: 'PT Contoh', partyType: 'Supplier', phone: '0812', email: '', address: 'Jl. A', taxId: '01.234.567.8-901.000', isWapu: false };

beforeEach(() => {
  put.mockReset().mockResolvedValue({ data: PARTY });
  get.mockReset().mockResolvedValue({ data: { data: [] } });
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PartyFormModal isOpen onClose={vi.fn()} editParty={PARTY} />
    </QueryClientProvider>,
  );
}

describe('PartyFormModal (edit)', () => {
  it('sends taxId null when NPWP is cleared so the server removes it', async () => {
    renderModal();
    const npwp = screen.getByDisplayValue(PARTY.taxId);
    fireEvent.change(npwp, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][0]).toBe('/parties/p-1');
    expect(put.mock.calls[0][1]).toMatchObject({ taxId: null });
  });

  it('sends the trimmed NPWP when filled', async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue(PARTY.taxId), { target: { value: ' 99.888 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Perubahan' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0][1]).toMatchObject({ taxId: '99.888' });
  });
});

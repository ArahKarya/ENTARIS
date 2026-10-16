import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { get, post } }));

import JournalEntryModal from './JournalEntryModal';

const coa = [
  { id: 'a1', accountNumber: '1.1.1', name: 'Petty Cash', isGroup: false },
  { id: 'a2', accountNumber: '1.1.3', name: 'Bank Mandiri', isGroup: false },
  { id: 'a3', accountNumber: '6.20', name: 'Beban Sewa Kendaraan', isGroup: false },
  { id: 'g1', accountNumber: '6', name: 'Beban', isGroup: true, children: [{ id: 'a4', accountNumber: '6.40', name: 'Beban Marketing', isGroup: false }] },
];

beforeAll(() => {
  // jsdom lacks these; cmdk and Radix popper use them.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ data: coa });
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <JournalEntryModal isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('JournalEntryModal: pemilih akun dengan pencarian', () => {
  it('mengetik di kolom cari menyaring akun, tanpa scroll manual', async () => {
    renderModal();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/coa'));
    const [firstPicker] = await screen.findAllByRole('combobox');
    fireEvent.click(firstPicker);

    const search = await screen.findByRole('combobox', { name: /cari|search/i }).catch(() => null);
    const input = search ?? (await screen.findAllByRole('combobox')).find((el) => el.tagName === 'INPUT')!;
    fireEvent.change(input, { target: { value: 'mandiri' } });

    await waitFor(() => {
      expect(screen.getByText('1.1.3 - Bank Mandiri')).toBeTruthy();
      expect(screen.queryByText('1.1.1 - Petty Cash')).toBeNull();
    });
  });

  it('mencari lewat nomor akun, dan akun anak dari grup ikut muncul', async () => {
    renderModal();
    const [firstPicker] = await screen.findAllByRole('combobox');
    fireEvent.click(firstPicker);
    const input = (await screen.findAllByRole('combobox')).find((el) => el.tagName === 'INPUT')!;

    fireEvent.change(input, { target: { value: '6.40' } });
    await waitFor(() => expect(screen.getByText('6.40 - Beban Marketing')).toBeTruthy());
    // akun grup (isGroup) tidak boleh bisa dipilih
    expect(screen.queryByText('6 - Beban')).toBeNull();
  });

  it('memilih akun mengisi baris dan tampil di pemicu', async () => {
    renderModal();
    const [firstPicker] = await screen.findAllByRole('combobox');
    fireEvent.click(firstPicker);
    const input = (await screen.findAllByRole('combobox')).find((el) => el.tagName === 'INPUT')!;
    fireEvent.change(input, { target: { value: 'sewa' } });
    fireEvent.click(await screen.findByText('6.20 - Beban Sewa Kendaraan'));

    await waitFor(() => {
      const trigger = screen.getAllByRole('combobox')[0];
      expect(within(trigger).getByText('6.20 - Beban Sewa Kendaraan')).toBeTruthy();
    });
  });
});

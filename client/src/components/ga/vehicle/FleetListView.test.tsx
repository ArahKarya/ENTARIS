import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../lib/api', () => ({ default: { get } }));
vi.mock('./modals/ServiceModals', () => ({
  ServiceLogModal: ({ assetId }: { assetId: string }) => <div data-testid="service-modal">{assetId}</div>,
}));

import { FleetListView } from './FleetListView';

const row = (id: string, noPlat: string) => ({
  id, code: id.toUpperCase(), name: 'Truk', status: 'ACTIVE', condition: 'GOOD', categoryName: 'Kendaraan',
  noPlat, brand: 'Mitsubishi', tipe: 'Colt Diesel', tahunProduksi: 2020, jenisBBM: 'Solar', odometer: 1000,
  driver: null,
  due: Object.fromEntries(['tax', 'stnk', 'kir', 'insurance', 'inspection'].map((d) => [d, { dueDate: null, state: null }])), attention: null, nextDueDate: null, openIncidentCount: 0,
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) =>
    url.includes('fleet-summary')
      ? { data: { totalVehicles: 2 } }
      : { data: { data: [row('v1', 'E 9237 QA'), row('v2', 'E 9238 QA')], total: 2 } },
  );
});

function renderList(canEdit: boolean) {
  const onOpen = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FleetListView canEdit={canEdit} onOpen={onOpen} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpen;
}

describe('FleetListView: tombol Catat servis langsung di baris', () => {
  it('klik tombol membuka dialog servis untuk kendaraan baris itu, tanpa membuka detail', async () => {
    const onOpen = renderList(true);
    const buttons = await screen.findAllByRole('button', { name: /catat servis|log service/i });
    expect(buttons).toHaveLength(2); // satu per baris
    fireEvent.click(buttons[1]);
    expect((await screen.findByTestId('service-modal')).textContent).toBe('v2');
    expect(onOpen).not.toHaveBeenCalled(); // klik tombol tidak boleh ikut membuka baris
  });

  it('tidak tampil bila user tidak punya izin edit', async () => {
    renderList(false);
    await screen.findAllByText(/E 9237 QA/);
    expect(screen.queryByRole('button', { name: /catat servis|log service/i })).toBeNull();
  });
});

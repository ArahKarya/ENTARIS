import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getTemporaryNote } from '../temporaryDeliveryNote';

describe('getTemporaryNote', () => {
  it('returns the customer address and phone for the "Kepada" block of the PDF', async () => {
    const head = { id: 'n1', number: 'SJS-1', customerName: 'Toko A', customerAddress: 'Jl. Mawar 1', customerPhone: '0812' };
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([head])
      .mockResolvedValueOnce([{ id: 'it1', itemName: 'Beras', quantity: 10, unit: 'kg' }]);
    const tx = { $queryRaw: queryRaw } as unknown as Parameters<typeof getTemporaryNote>[0];

    const note = await getTemporaryNote(tx, 'n1');

    const headSql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(headSql).toContain('p.address AS "customerAddress"');
    expect(headSql).toContain('p.phone AS "customerPhone"');
    expect(note).toMatchObject({ customerAddress: 'Jl. Mawar 1', customerPhone: '0812', items: [{ id: 'it1' }] });
  });

  it('returns null when the note does not exist', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([]) } as unknown as Parameters<typeof getTemporaryNote>[0];
    expect(await getTemporaryNote(tx, 'missing')).toBeNull();
  });
});

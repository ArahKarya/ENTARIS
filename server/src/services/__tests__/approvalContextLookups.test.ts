import { describe, expect, it, vi } from 'vitest';
import { collectPayloadItemIds, loadApprovalLookups } from '../approvalContextLookups';

function makeDb() {
  return {
    party: { findUnique: vi.fn(async () => ({ id: 'p-250', name: 'Supplier ke-250' })) },
    inventoryItem: {
      findMany: vi.fn(async () => [
        { id: 'i-1', name: 'Gabah Kering Panen', unit: 'kg' },
        { id: 'i-2', name: 'Beras Premium', unit: 'karung' },
      ]),
    },
  };
}
const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Parameters<typeof loadApprovalLookups>[0];

describe('collectPayloadItemIds', () => {
  it('collects distinct item ids from production inputs and outputs', () => {
    const payload = { inputs: [{ itemId: 'i-1' }, { itemId: 'i-1' }, { itemId: '' }], outputs: [{ itemId: 'i-2' }, null] };
    expect(collectPayloadItemIds(payload)).toEqual(['i-1', 'i-2']);
  });

  it('returns nothing for payloads without production lines', () => {
    expect(collectPayloadItemIds(null)).toEqual([]);
    expect(collectPayloadItemIds({ items: [{ inventoryItemId: 'x' }] })).toEqual([]);
    expect(collectPayloadItemIds({ inputs: 'nope' })).toEqual([]);
  });
});

describe('loadApprovalLookups', () => {
  it('resolves the payload party and item names/units by id (no list cap involved)', async () => {
    const db = makeDb();
    const out = await loadApprovalLookups(asDb(db), { partyId: 'p-250', inputs: [{ itemId: 'i-1' }], outputs: [{ itemId: 'i-2' }] });
    expect(out.party).toEqual({ id: 'p-250', name: 'Supplier ke-250' });
    expect(out.items).toEqual({ 'i-1': { name: 'Gabah Kering Panen', unit: 'kg' }, 'i-2': { name: 'Beras Premium', unit: 'karung' } });
    expect(db.party.findUnique).toHaveBeenCalledWith({ where: { id: 'p-250' }, select: { id: true, name: true } });
    expect(db.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['i-1', 'i-2'] } } }),
    );
  });

  it('skips queries when the payload has no party or items', async () => {
    const db = makeDb();
    const out = await loadApprovalLookups(asDb(db), { notes: 'x' });
    expect(out).toEqual({ party: null, items: {} });
    expect(db.party.findUnique).not.toHaveBeenCalled();
    expect(db.inventoryItem.findMany).not.toHaveBeenCalled();
  });

  it('returns a null party when the id no longer exists', async () => {
    const db = makeDb();
    db.party.findUnique.mockResolvedValueOnce(null as never);
    expect((await loadApprovalLookups(asDb(db), { partyId: 'gone' })).party).toBeNull();
  });
});

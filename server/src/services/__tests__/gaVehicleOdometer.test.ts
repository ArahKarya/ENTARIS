import { describe, expect, it, vi } from 'vitest';
import { bumpVehicleOdometer } from '../gaVehicleOdometer';

type Row = { assetId: string; odometerTerakhir: number | null };

/** In-memory stand-in for prisma.gaVehicleData with the upsert / updateMany semantics used. */
function fakeDb(initial: Row[] = []) {
  const rows = new Map(initial.map((r) => [r.assetId, { ...r }]));
  const gaVehicleData = {
    upsert: vi.fn(async ({ where, create }: { where: { assetId: string }; create: Row }) => {
      if (!rows.has(where.assetId)) rows.set(where.assetId, { ...create });
      return rows.get(where.assetId);
    }),
    updateMany: vi.fn(
      async ({ where, data }: { where: { assetId: string; OR: unknown }; data: { odometerTerakhir: number } }) => {
        const row = rows.get(where.assetId);
        if (row && (row.odometerTerakhir == null || row.odometerTerakhir < data.odometerTerakhir)) {
          row.odometerTerakhir = data.odometerTerakhir;
          return { count: 1 };
        }
        return { count: 0 };
      },
    ),
  };
  return { db: { gaVehicleData } as never, rows, gaVehicleData };
}

describe('bumpVehicleOdometer', () => {
  it('creates the vehicle data row when missing (no more `vd &&` guard)', async () => {
    const { db, rows } = fakeDb();
    await bumpVehicleOdometer(db, 'a1', 12000);
    expect(rows.get('a1')?.odometerTerakhir).toBe(12000);
  });

  it('fills a null odometer on an existing row', async () => {
    const { db, rows } = fakeDb([{ assetId: 'a1', odometerTerakhir: null }]);
    await bumpVehicleOdometer(db, 'a1', 500);
    expect(rows.get('a1')?.odometerTerakhir).toBe(500);
  });

  it('only increases: a lower or equal reading never overwrites', async () => {
    const { db, rows } = fakeDb([{ assetId: 'a1', odometerTerakhir: 20000 }]);
    await bumpVehicleOdometer(db, 'a1', 15000);
    expect(rows.get('a1')?.odometerTerakhir).toBe(20000);
    await bumpVehicleOdometer(db, 'a1', 20000);
    expect(rows.get('a1')?.odometerTerakhir).toBe(20000);
    await bumpVehicleOdometer(db, 'a1', 20500);
    expect(rows.get('a1')?.odometerTerakhir).toBe(20500);
  });

  it('uses a conditional update guarded by lt so concurrent writes cannot go backwards', async () => {
    const { db, gaVehicleData } = fakeDb();
    await bumpVehicleOdometer(db, 'a1', 100);
    expect(gaVehicleData.upsert).toHaveBeenCalledWith({
      where: { assetId: 'a1' },
      create: { assetId: 'a1', odometerTerakhir: 100 },
      update: {},
    });
    expect(gaVehicleData.updateMany).toHaveBeenCalledWith({
      where: { assetId: 'a1', OR: [{ odometerTerakhir: null }, { odometerTerakhir: { lt: 100 } }] },
      data: { odometerTerakhir: 100 },
    });
  });

  it('does nothing without a valid reading', async () => {
    const { db, gaVehicleData } = fakeDb();
    await bumpVehicleOdometer(db, 'a1', null);
    await bumpVehicleOdometer(db, 'a1', undefined);
    await bumpVehicleOdometer(db, 'a1', -5);
    await bumpVehicleOdometer(db, 'a1', 1.5);
    expect(gaVehicleData.upsert).not.toHaveBeenCalled();
    expect(gaVehicleData.updateMany).not.toHaveBeenCalled();
  });
});

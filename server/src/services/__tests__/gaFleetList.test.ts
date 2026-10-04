import { describe, it, expect } from 'vitest';
import {
  buildFleetRows,
  deriveFleetDueState,
  filterFleetRows,
  pageFleetRows,
  parseFleetFilters,
  parseFleetSort,
  sortFleetRows,
  type FleetAssetSource,
  type FleetSources,
} from '../gaFleetList';
import { dueBoundaries } from '../projectGuaranteeList';

const WIB = '+07:00';
// 2026-10-04 10:00 WIB
const NOW = new Date('2026-10-04T03:00:00.000Z');
const bounds = dueBoundaries(NOW, WIB);
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const asset = (over: Partial<FleetAssetSource> & { id: string }): FleetAssetSource => ({
  code: over.id.toUpperCase(),
  name: `Kendaraan ${over.id}`,
  status: 'ACTIVE',
  condition: 'GOOD',
  picUserId: null,
  category: { name: 'Kendaraan' },
  vehicleData: { noPlat: null, brand: null, tipe: null, tahunProduksi: null, jenisBBM: null, odometerTerakhir: null },
  ...over,
});

const sources = (over: Partial<FleetSources> = {}): FleetSources => ({
  assets: [],
  taxes: [],
  insurances: [],
  inspections: [],
  openIncidents: [],
  driverNames: new Map(),
  ...over,
});

describe('deriveFleetDueState', () => {
  it('classifies by business day: past = overdue, today..+30 = dueSoon, later = ok', () => {
    expect(deriveFleetDueState(null, bounds)).toBeNull();
    expect(deriveFleetDueState(d('2026-10-03'), bounds)).toBe('overdue');
    expect(deriveFleetDueState(d('2026-10-04'), bounds)).toBe('dueSoon');
    expect(deriveFleetDueState(d('2026-11-03'), bounds)).toBe('dueSoon');
    expect(deriveFleetDueState(d('2026-11-04'), bounds)).toBe('ok');
  });
});

describe('buildFleetRows', () => {
  const src = sources({
    assets: [
      asset({
        id: 'a',
        picUserId: 'u1',
        vehicleData: { noPlat: 'B 1 A', brand: 'Toyota', tipe: 'Avanza', tahunProduksi: 2022, jenisBBM: 'PERTALITE', odometerTerakhir: 1000 },
      }),
      asset({ id: 'b' }),
      asset({ id: 'c', vehicleData: null }),
    ],
    taxes: [
      // Old STNK_TAHUNAN still ACTIVE but superseded by the newer one → only the latest counts.
      { assetId: 'a', type: 'STNK_TAHUNAN', dueDate: d('2025-09-01') },
      { assetId: 'a', type: 'STNK_TAHUNAN', dueDate: d('2027-01-01') },
      // PAJAK_KENDARAAN overdue → annual-tax group takes the worst type.
      { assetId: 'a', type: 'PAJAK_KENDARAAN', dueDate: d('2026-09-20') },
      { assetId: 'a', type: 'KIR', dueDate: d('2026-10-20') },
      { assetId: 'b', type: 'STNK_5_TAHUNAN', dueDate: d('2030-01-01') },
    ],
    insurances: [{ assetId: 'a', endDate: d('2027-06-01') }],
    inspections: [
      { assetId: 'b', nextDueDate: d('2026-10-10') },
      { assetId: 'b', nextDueDate: d('2026-01-01') },
    ],
    openIncidents: [{ assetId: 'a' }, { assetId: 'a' }],
    driverNames: new Map([['u1', 'Andi']]),
  });
  const rows = buildFleetRows(src, bounds);
  const [a, b, c] = rows;

  it('maps identity, driver and incidents', () => {
    expect(a).toMatchObject({ id: 'a', noPlat: 'B 1 A', brand: 'Toyota', odometer: 1000, openIncidentCount: 2 });
    expect(a!.driver).toEqual({ id: 'u1', fullName: 'Andi' });
    expect(c).toMatchObject({ noPlat: null, odometer: null, driver: null, attention: null, nextDueDate: null });
  });

  it('derives due state per obligation group', () => {
    expect(a!.due.tax).toEqual({ dueDate: d('2026-09-20').toISOString(), state: 'overdue' });
    expect(a!.due.kir.state).toBe('dueSoon');
    expect(a!.due.stnk.state).toBeNull();
    expect(a!.due.insurance.state).toBe('ok');
    expect(b!.due.stnk.state).toBe('ok');
    // Only the newest inspection counts.
    expect(b!.due.inspection).toEqual({ dueDate: d('2026-10-10').toISOString(), state: 'dueSoon' });
  });

  it('flags the worst state and its date as attention / nextDueDate', () => {
    expect(a!.attention).toBe('overdue');
    expect(a!.nextDueDate).toBe(d('2026-09-20').toISOString());
    expect(b!.attention).toBe('dueSoon');
    expect(b!.nextDueDate).toBe(d('2026-10-10').toISOString());
  });

  it('filters by search, status, due state and document', () => {
    expect(filterFleetRows(rows, { search: 'andi' }).map((r) => r.id)).toEqual(['a']);
    expect(filterFleetRows(rows, { search: 'b 1' }).map((r) => r.id)).toEqual(['a']);
    expect(filterFleetRows(rows, { due: 'overdue' }).map((r) => r.id)).toEqual(['a']);
    expect(filterFleetRows(rows, { due: 'attention' }).map((r) => r.id)).toEqual(['a', 'b']);
    expect(filterFleetRows(rows, { due: 'dueSoon', doc: 'kir' }).map((r) => r.id)).toEqual(['a']);
    expect(filterFleetRows(rows, { due: 'overdue', doc: 'insurance' })).toEqual([]);
    expect(filterFleetRows(rows, { doc: 'stnk' }).map((r) => r.id)).toEqual(['b']);
    expect(filterFleetRows(rows, { status: 'IN_REPAIR' })).toEqual([]);
    expect(filterFleetRows(rows, { id: 'b' }).map((r) => r.id)).toEqual(['b']);
  });

  it('sorts with nulls last and pages', () => {
    expect(sortFleetRows(rows, { field: 'nextDue', dir: 'asc' }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortFleetRows(rows, { field: 'nextDue', dir: 'desc' }).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortFleetRows(rows, { field: 'odometer', dir: 'desc' }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(pageFleetRows(rows, { page: 2, limit: 2, skip: 2 }).map((r) => r.id)).toEqual(['c']);
  });
});

describe('parseFleetFilters / parseFleetSort', () => {
  it('accepts known values and rejects unknown ones', () => {
    expect(parseFleetFilters({ search: ' avanza ', due: 'attention', doc: 'kir', status: 'ACTIVE' })).toEqual({
      ok: true,
      filters: { search: 'avanza', due: 'attention', doc: 'kir', status: 'ACTIVE' },
    });
    expect(parseFleetFilters({ id: 'x1' })).toMatchObject({ ok: true, filters: { id: 'x1' } });
    expect(parseFleetFilters({ due: 'soon' }).ok).toBe(false);
    expect(parseFleetFilters({ doc: 'sim' }).ok).toBe(false);
    expect(parseFleetFilters({ status: 'Aktif' }).ok).toBe(false);
  });

  it('whitelists sort fields', () => {
    expect(parseFleetSort('-nextDue')).toEqual({ field: 'nextDue', dir: 'desc' });
    expect(parseFleetSort('-hack')).toEqual({ field: 'code', dir: 'asc' });
  });
});

import { describe, it, expect } from 'vitest';
import { localDayRange } from '../listQuery';

const WIB = '+07:00';

describe('localDayRange', () => {
  it('maps a calendar day to [00:00, next 00:00) in the business time zone', () => {
    const r = localDayRange('2026-10-03', '2026-10-03', WIB);
    expect(r.gte?.toISOString()).toBe('2026-10-02T17:00:00.000Z');
    expect(r.lt?.toISOString()).toBe('2026-10-03T17:00:00.000Z');
  });

  it('includes documents stored at local midnight and at UTC midnight of the same day', () => {
    const r = localDayRange('2026-10-03', '2026-10-03', WIB);
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= r.gte!.getTime() && t < r.lt!.getTime();
    };
    expect(inRange('2026-10-02T17:00:00.000Z')).toBe(true); // 3 Oct 00:00 WIB
    expect(inRange('2026-10-03T00:00:00.000Z')).toBe(true); // "2026-10-03" parsed as UTC
    expect(inRange('2026-10-03T16:59:59.999Z')).toBe(true); // 3 Oct 23:59 WIB
    expect(inRange('2026-10-03T17:00:00.000Z')).toBe(false); // 4 Oct 00:00 WIB
    expect(inRange('2026-10-02T16:59:59.999Z')).toBe(false); // 2 Oct 23:59 WIB
  });

  it('handles open-ended ranges and month boundaries', () => {
    expect(localDayRange(undefined, '2026-10-31', WIB)).toEqual({ lt: new Date('2026-10-31T17:00:00.000Z') });
    expect(localDayRange('2026-11-01', undefined, WIB)).toEqual({ gte: new Date('2026-10-31T17:00:00.000Z') });
    expect(localDayRange(undefined, undefined, WIB)).toEqual({});
  });

  it('supports other Indonesian offsets', () => {
    expect(localDayRange('2026-10-03', undefined, '+09:00').gte?.toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });
});

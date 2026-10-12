import { describe, expect, it } from 'vitest';
import { DEMO_SPAN_DAYS, makeScheduler, sortEvents, windowDate, ymd, type DemoEvent } from '../context';

const today = new Date(2026, 9, 12);
const noop = async () => {};

describe('demo data dates and ordering', () => {
  it('keeps every window date within the span and not after today', () => {
    for (let w = 0; w < 3; w++) {
      for (let day = 0; day <= 29; day++) {
        const d = windowDate({ today }, w, day);
        expect(d.getTime()).toBeLessThan(today.getTime());
        expect(today.getTime() - d.getTime()).toBeLessThanOrEqual(DEMO_SPAN_DAYS * 86_400_000);
      }
    }
  });

  it('drops future events and runs the rest by date, then queue order', () => {
    const queue: DemoEvent[] = [];
    const schedule = makeScheduler(today, queue);
    schedule(new Date(2026, 9, 5), 'b', noop);
    schedule(new Date(2026, 9, 1), 'a', noop);
    schedule(new Date(2026, 9, 5), 'c', noop);
    schedule(new Date(2026, 9, 13), 'future', noop);
    expect(sortEvents(queue).map((e) => e.label)).toEqual(['a', 'b', 'c']);
  });

  it('formats local dates without a timezone shift', () => {
    expect(ymd(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

import { describe, it, expect } from 'vitest';
import { clampPage, getPageCount, getPageItems, getRowRange, normalizePageSize } from './pagination';

describe('getPageCount', () => {
  it('rounds up and never returns less than 1', () => {
    expect(getPageCount(312, 25)).toBe(13);
    expect(getPageCount(300, 25)).toBe(12);
    expect(getPageCount(1, 25)).toBe(1);
    expect(getPageCount(0, 25)).toBe(1);
    expect(getPageCount(Number.NaN, 25)).toBe(1);
  });
});

describe('getRowRange', () => {
  it('returns the 1-based inclusive range for "Menampilkan 1–25 dari 312"', () => {
    expect(getRowRange(1, 25, 312)).toEqual({ from: 1, to: 25 });
    expect(getRowRange(13, 25, 312)).toEqual({ from: 301, to: 312 });
    expect(getRowRange(2, 10, 15)).toEqual({ from: 11, to: 15 });
  });

  it('is empty for no rows and clamps out-of-range pages', () => {
    expect(getRowRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
    expect(getRowRange(99, 25, 30)).toEqual({ from: 26, to: 30 });
  });
});

describe('clampPage', () => {
  it('keeps the page within 1..pageCount', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(7, 5)).toBe(5);
    expect(clampPage(3.7, 5)).toBe(3);
    expect(clampPage(Number.NaN, 5)).toBe(1);
  });
});

describe('getPageItems', () => {
  it('lists every page when they fit', () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses with ellipses and keeps a stable length', () => {
    expect(getPageItems(1, 13)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 13]);
    expect(getPageItems(4, 13)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 13]);
    expect(getPageItems(5, 13)).toEqual([1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 13]);
    expect(getPageItems(10, 13)).toEqual([1, 'ellipsis-start', 9, 10, 11, 12, 13]);
    expect(getPageItems(13, 13)).toEqual([1, 'ellipsis-start', 9, 10, 11, 12, 13]);
    for (let p = 1; p <= 13; p += 1) expect(getPageItems(p, 13)).toHaveLength(7);
  });

  it('always contains the current page', () => {
    for (let p = 1; p <= 40; p += 1) expect(getPageItems(p, 40, 2)).toContain(p);
  });
});

describe('normalizePageSize', () => {
  it('only accepts offered sizes', () => {
    expect(normalizePageSize(50)).toBe(50);
    expect(normalizePageSize(37)).toBe(25);
    expect(normalizePageSize(20, [20, 40], 20)).toBe(20);
  });
});

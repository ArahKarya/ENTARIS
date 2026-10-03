import { describe, it, expect } from 'vitest';
import appSource from '../App.tsx?raw';
import {
  ROUTES,
  NAV_SECTIONS,
  matchRoute,
  activeNavPath,
  breadcrumbsFor,
  documentTitleFor,
  navSections,
  normalizePath,
  searchRoutes,
  isNavVisible,
} from './routes';

/** Protected paths declared in App.tsx (everything after <ProtectedRoute>), minus "*". */
function protectedAppPaths(source: string): string[] {
  const start = source.indexOf('<ProtectedRoute');
  const re = /<Route\s+path="([^"]+)"/g;
  const paths = new Set<string>();
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m.index > start && m[1] !== '*') paths.add(m[1]);
  }
  return [...paths];
}

/** PermRoute module per App.tsx path ('' = no PermRoute). */
function appModules(source: string): Map<string, string> {
  const re = /<Route\s+path="([^"]+)"\s+element=\{(<PermRoute module="([^"]+)">)?/g;
  const out = new Map<string, string>();
  for (let m = re.exec(source); m; m = re.exec(source)) out.set(m[1], m[3] ?? '');
  return out;
}

const APP_PATHS = protectedAppPaths(appSource);
const ALL = () => true;
const NAV_PATHS = navSections(ALL).flatMap((s) => s.items.map((i) => i.path));
/** Pages reached from the topbar only (the bell); they have no sidebar item. */
const TOPBAR_ONLY = new Set(['/notifications']);

describe('route registry', () => {
  it('parses a realistic route list from App.tsx', () => {
    expect(APP_PATHS.length).toBeGreaterThan(50);
    expect(APP_PATHS).toContain('/sales-orders');
  });

  it('has exactly one entry per App.tsx route, and no stale entries', () => {
    for (const path of APP_PATHS) {
      expect(ROUTES.filter((e) => e.path === path), path).toHaveLength(1);
      expect(matchRoute(path)?.path, path).toBe(path);
    }
    expect(ROUTES.map((e) => e.path).sort()).toEqual([...APP_PATHS].sort());
  });

  it('mirrors the PermRoute module of every route (RBAC unchanged)', () => {
    const modules = appModules(appSource);
    for (const entry of ROUTES) {
      expect(entry.module ?? '', entry.path).toBe(modules.get(entry.path));
    }
  });

  it('gives every route exactly one active nav item (topbar-only pages: none)', () => {
    for (const path of APP_PATHS) {
      const active = NAV_PATHS.filter((p) => p === activeNavPath(path));
      expect(active, path).toHaveLength(TOPBAR_ONLY.has(path) ? 0 : 1);
    }
  });

  it('does not let /sales highlight /sales-orders or /sales-returns', () => {
    expect(matchRoute('/sales-orders')?.label).toBe('Pesanan Penjualan');
    expect(activeNavPath('/sales-orders')).toBe('/sales-orders');
    expect(activeNavPath('/sales-returns')).toBe('/sales-returns');
    expect(activeNavPath('/sales')).toBe('/sales');
    expect(activeNavPath('/warehouse-stock')).toBe('/warehouse-stock');
    expect(activeNavPath('/warehouses')).toBe('/warehouses');
  });

  it('matches by whole segment and prefers the longest path', () => {
    expect(matchRoute('/ga/vehicle/report')?.path).toBe('/ga/vehicle/report');
    expect(matchRoute('/ga/vehicle/abc-123')?.path).toBe('/ga/vehicle');
    expect(matchRoute('/sales/INV-001')?.path).toBe('/sales');
    expect(matchRoute('/salesx')).toBeUndefined();
    expect(matchRoute('/unknown')).toBeUndefined();
    expect(matchRoute('/sales/?tab=1')?.path).toBe('/sales');
    expect(normalizePath('/reports/')).toBe('/reports');
  });

  it('builds nested breadcrumbs for /reports/* and /ga/*', () => {
    expect(breadcrumbsFor('/reports/profit-loss')).toEqual([
      { label: 'Laporan' },
      { label: 'Semua Laporan', href: '/reports' },
      { label: 'Laba Rugi' },
    ]);
    expect(activeNavPath('/reports/oee')).toBe('/reports');
    expect(breadcrumbsFor('/ga/vehicle/report')).toEqual([
      { label: 'Aset & Pemeliharaan' },
      { label: 'Kendaraan', href: '/ga/vehicle' },
      { label: 'Laporan Armada' },
    ]);
    expect(breadcrumbsFor('/ga/assets')).toEqual([{ label: 'Aset & Pemeliharaan' }, { label: 'Daftar Aset' }]);
    expect(breadcrumbsFor('/ga')).toEqual([{ label: 'Aset & Pemeliharaan' }, { label: 'Ringkasan' }]);
    expect(activeNavPath('/ga')).toBe('/ga');
    expect(activeNavPath('/ga/assets')).toBe('/ga/assets');
    expect(navSections(ALL).find((s) => s.id === 'assets')?.items[0].path).toBe('/ga');
    expect(breadcrumbsFor('/')).toEqual([{ label: 'Dasbor' }]);
    expect(breadcrumbsFor('/nope')).toEqual([]);
  });

  it('never ends a breadcrumb with a link and never repeats a label', () => {
    for (const path of APP_PATHS) {
      const crumbs = breadcrumbsFor(path);
      expect(crumbs.at(-1)?.href, path).toBeUndefined();
      expect(crumbs.at(-1)?.label, path).toBe(matchRoute(path)?.label);
    }
  });

  it('uses unique labels so nav, breadcrumb and tab title agree', () => {
    const labels = ROUTES.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('uses Indonesian labels (no leftover English nav terms)', () => {
    const banned = /\b(Dashboard|Inquiry|Invoice|Approval|Report|Overview|Health Check|Purchase|Order|User)\b/;
    for (const e of ROUTES) expect(e.label, e.path).not.toMatch(banned);
    for (const s of NAV_SECTIONS) expect(s.label).not.toMatch(banned);
  });

  it('only links parents that exist', () => {
    for (const e of ROUTES) if (e.parent) expect(ROUTES.some((p) => p.path === e.parent), e.path).toBe(true);
  });
});

describe('navSections', () => {
  it('hides items the user cannot view and drops empty sections', () => {
    const onlySales = navSections((m) => m === 'sales_invoice');
    expect(onlySales.map((s) => s.id)).toEqual(['main', 'sales']);
    expect(onlySales[1].items.map((i) => i.path)).toEqual(['/sales']);
    // Items without a module are visible to everyone.
    expect(onlySales[0].items.map((i) => i.path)).toEqual(['/', '/aira']);
  });

  it('never lists nav-hidden pages', () => {
    for (const p of NAV_PATHS) expect(isNavVisible(matchRoute(p)!), p).toBe(true);
    expect(NAV_PATHS).not.toContain('/reports/profit-loss');
    expect(NAV_PATHS).not.toContain('/notifications');
  });
});

describe('document title and search', () => {
  it('formats "<label> · <company>" with an Entaris fallback', () => {
    expect(documentTitleFor('/sales-orders', 'PT Contoh')).toBe('Pesanan Penjualan · PT Contoh');
    expect(documentTitleFor('/sales-orders', '')).toBe('Pesanan Penjualan · Entaris');
    expect(documentTitleFor('/nope', null)).toBe('Entaris');
  });

  it('finds pages by label, abbreviation and old names, respecting permissions', () => {
    expect(searchRoutes('SO', ALL)[0].path).toBe('/sales-orders');
    expect(searchRoutes('invoice penjualan', ALL)[0].path).toBe('/sales');
    expect(searchRoutes('laba', ALL)[0].path).toBe('/reports/profit-loss');
    expect(searchRoutes('laba', () => false)).toEqual([]);
  });
});

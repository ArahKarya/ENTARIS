import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Route catalog derived from client/src/App.tsx so new routes are picked up
 * automatically. Routes declared before the <ProtectedRoute /> element are public.
 * Dynamic segments are filled with harmless placeholder values.
 */
export interface AppRoute {
  path: string
  slug: string
  isPublic: boolean
}

const here = path.dirname(fileURLToPath(import.meta.url))
const APP_FILE = path.join(here, '..', 'src', 'App.tsx')

const PARAM_FILL: Record<string, string> = {
  qrCode: 'QA-SAMPLE-0000',
}

export function fillParams(routePath: string): string {
  return routePath.replace(/:(\w+)\??/g, (_m, name: string) => PARAM_FILL[name] ?? 'qa-sample')
}

export function slugify(routePath: string): string {
  if (routePath === '/') return 'dashboard'
  return routePath.replace(/^\//, '').replace(/[/:]+/g, '-').replace(/[^\w-]/g, '') || 'root'
}

export function loadRoutes(source: string = fs.readFileSync(APP_FILE, 'utf8')): AppRoute[] {
  const protectedAt = source.indexOf('<ProtectedRoute')
  const re = /<Route\s+path="([^"]+)"/g
  const seen = new Set<string>()
  const routes: AppRoute[] = []
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const raw = m[1]
    if (raw === '*' || seen.has(raw)) continue
    seen.add(raw)
    const filled = fillParams(raw)
    routes.push({
      path: filled,
      slug: slugify(raw),
      isPublic: protectedAt === -1 || m.index < protectedAt,
    })
  }
  return routes
}

export const ALL_ROUTES = loadRoutes()

/** Mobile project captures only a representative subset. */
export const MOBILE_ROUTES = new Set([
  '/login', '/welcome', '/tanya',
  '/', '/sales', '/purchase', '/payments', '/parties',
  '/inventory', '/coa', '/gl', '/reports', '/settings',
])

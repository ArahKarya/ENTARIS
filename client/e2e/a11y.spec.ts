import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { LOGGED_OUT, prepareTheme, settle } from './helpers'

/**
 * axe scan of the key entry routes. Results are appended per project/route to
 * $AXE_OUT (JSON). The run only FAILS on serious/critical violations for routes
 * listed in $AXE_STRICT (comma separated, e.g. "/login,/"); default: report only.
 */
const AXE_OUT = process.env.AXE_OUT ?? path.resolve('test-results', 'axe.json')
const STRICT = new Set(
  (process.env.AXE_STRICT ?? '').split(',').map((s) => s.trim()).filter(Boolean),
)
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BLOCKING = new Set(['serious', 'critical'])

const TARGETS = [
  { path: '/login', isPublic: true },
  { path: '/welcome', isPublic: true },
  { path: '/tanya', isPublic: true },
  // Placeholder code: captures the public not-found state (no seeded QR asset).
  { path: '/aset/QA-SAMPLE-0000', isPublic: true },
  { path: '/', isPublic: false },
  // Phase 3 reference list page (list kit).
  { path: '/sales', isPublic: false },
  { path: '/inquiries', isPublic: false },
  { path: '/quotations', isPublic: false },
  { path: '/sales-orders', isPublic: false },
  { path: '/delivery-orders', isPublic: false },
  { path: '/delivery-orders?tab=sjs', isPublic: false },
  { path: '/sales-returns', isPublic: false },
  { path: '/customer-deposits', isPublic: false },
  { path: '/purchase', isPublic: false },
  { path: '/purchase?tab=approval', isPublic: false },
  { path: '/purchase-orders', isPublic: false },
  { path: '/goods-receipts', isPublic: false },
  { path: '/vendor-deposits', isPublic: false },
  { path: '/payments', isPublic: false },
  { path: '/reconciliation', isPublic: false },
  { path: '/recurring', isPublic: false },
  { path: '/project-guarantees', isPublic: false },
  { path: '/inventory', isPublic: false },
  { path: '/inventory?tab=items', isPublic: false },
  { path: '/inventory?tab=movements', isPublic: false },
  { path: '/inventory?tab=production', isPublic: false },
  { path: '/inventory?tab=services', isPublic: false },
  { path: '/stock-opname', isPublic: false },
  { path: '/stock-transfers', isPublic: false },
  { path: '/warehouses', isPublic: false },
  { path: '/warehouse-stock', isPublic: false },
  { path: '/coa', isPublic: false },
  { path: '/gl', isPublic: false },
  { path: '/approvals', isPublic: false },
  { path: '/approvals?tab=rules', isPublic: false },
  { path: '/fixed-assets', isPublic: false },
  { path: '/fixed-assets?tab=depreciation', isPublic: false },
  { path: '/ga/finance', isPublic: false },
]

interface AxeRecord {
  project: string
  route: string
  scannedAt: string
  violations: Array<{ id: string; impact: string | null; help: string; nodes: number; targets: string[] }>
  counts: Record<string, number>
}

function writeRecord(record: AxeRecord): void {
  fs.mkdirSync(path.dirname(AXE_OUT), { recursive: true })
  let existing: AxeRecord[] = []
  try {
    existing = JSON.parse(fs.readFileSync(AXE_OUT, 'utf8')) as AxeRecord[]
  } catch {
    existing = []
  }
  const next = [
    ...existing.filter((r) => !(r.project === record.project && r.route === record.route)),
    record,
  ]
  fs.writeFileSync(AXE_OUT, JSON.stringify(next, null, 2))
}

for (const target of TARGETS) {
  test.describe(`axe ${target.path}`, () => {
    if (target.isPublic) test.use({ storageState: LOGGED_OUT })

    test(`a11y ${target.path}`, async ({ page }, testInfo) => {
      await prepareTheme(page, testInfo)
      await page.goto(target.path)
      await settle(page)
      if (!target.isPublic) {
        expect(new URL(page.url()).pathname, 'session expired?').not.toBe('/login')
      }
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()

      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? null,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }))
      const counts = violations.reduce<Record<string, number>>((acc, v) => {
        const key = v.impact ?? 'unknown'
        return { ...acc, [key]: (acc[key] ?? 0) + 1 }
      }, {})
      writeRecord({
        project: testInfo.project.name,
        route: target.path,
        scannedAt: new Date().toISOString(),
        violations,
        counts,
      })

      if (STRICT.has(target.path)) {
        const blocking = violations.filter((v) => v.impact && BLOCKING.has(v.impact))
        expect(blocking, `serious/critical axe violations on ${target.path}`).toEqual([])
      }
    })
  })
}

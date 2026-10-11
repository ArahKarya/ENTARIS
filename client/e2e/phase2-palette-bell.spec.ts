import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { prepareTheme, settle } from './helpers'

/**
 * Phase 2 palette/bell/shortcut checks: opens each overlay, asserts the
 * keyboard contract and captures $SHOT_DIR/<project>__<state>.png. axe results
 * for the open overlays go to $SHOT_DIR/axe-<project>.json.
 */
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'phase2-palette-bell')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.beforeAll(() => fs.mkdirSync(SHOT_DIR, { recursive: true }))

async function shot(page: Page, project: string, name: string) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOT_DIR, `${project}__${name}.png`), animations: 'disabled' })
}

const axeResults: Record<string, unknown> = {}
async function axe(page: Page, project: string, name: string, include: string) {
  const res = await new AxeBuilder({ page }).withTags(TAGS).include(include).analyze()
  axeResults[name] = res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')) }))
  fs.writeFileSync(path.join(SHOT_DIR, `axe-${project}.json`), JSON.stringify(axeResults, null, 2))
  return res.violations
}

test.describe('palette, bell, shortcuts', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('palette.recent', JSON.stringify(['/sales-orders', '/reports', '/parties']))
      } catch {
        /* ignore */
      }
    })
    await page.goto('/sales')
    await settle(page)
  })

  test('command palette', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const mobile = project === 'mobile'
    const trigger = page.getByRole('button', { name: 'Cari halaman atau data' })

    if (mobile) {
      await trigger.tap()
    } else {
      // Shortcut, then type immediately: the first character must not be lost.
      await page.locator('body').click({ position: { x: 700, y: 400 } })
      await page.keyboard.press('ControlOrMeta+k')
      await page.keyboard.type('fak')
      await expect(page.getByRole('combobox')).toHaveValue('fak')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Palet perintah' })).toBeHidden()
      await trigger.click()
    }

    const dialog = page.getByRole('dialog', { name: 'Palet perintah' })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('combobox')).toBeFocused()
    await shot(page, project, 'palette-empty')
    expect(await axe(page, project, 'palette-empty', '[data-testid="command-palette"]')).toEqual([])

    // The old term still finds the renamed page (search covers legacy names).
    await page.getByRole('combobox').fill('faktur')
    await expect(dialog.getByRole('option', { name: /Invoice Penjualan/ })).toBeVisible()
    await page.waitForTimeout(700)
    await shot(page, project, 'palette-pages')

    await page.getByRole('combobox').fill('INV')
    await page.waitForTimeout(900)
    await shot(page, project, 'palette-records')
    expect(await axe(page, project, 'palette-records', '[data-testid="command-palette"]')).toEqual([])

    await page.getByRole('combobox').fill('zzqx')
    await page.waitForTimeout(900)
    await shot(page, project, 'palette-noresults')

    // Arrow + Enter opens a page; focus returns out of the dialog.
    await page.getByRole('combobox').fill('stok opname')
    await expect(dialog.getByRole('option', { name: /Stok Opname/ }).first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/stock-opname/)
    await expect(dialog).toBeHidden()

    if (!mobile) {
      await trigger.click()
      await page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()
    }
  })

  test('notification bell', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const bell = page.getByRole('button', { name: /^Notifikasi/ })
    await expect(bell).toBeVisible()
    await bell.click()
    const panel = page.getByRole('dialog', { name: /Notifikasi/ })
    await expect(panel).toBeVisible()
    await page.waitForTimeout(600)
    await shot(page, project, 'bell-open')
    expect(await axe(page, project, 'bell-open', '[role="dialog"]')).toEqual([])
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(bell).toBeFocused()
  })

  test('notification bell with items (mocked API)', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const now = Date.now()
    const items = [
      { id: 'n1', type: 'approval_pending', title: 'Persetujuan menunggu', message: 'Faktur Pembelian PI-2026-0042 menunggu persetujuan Anda.', isRead: false, createdAt: new Date(now - 4 * 60_000).toISOString() },
      { id: 'n2', type: 'invoice_overdue', title: 'Faktur jatuh tempo', message: 'INV-2026-0107 (PT Sinar Jaya) lewat jatuh tempo 3 hari.', isRead: false, createdAt: new Date(now - 2 * 3_600_000).toISOString() },
      { id: 'n3', type: 'low_stock', title: 'Stok menipis', message: 'Beras Premium 5 kg tersisa 12 karung di Gudang Utama.', isRead: true, createdAt: new Date(now - 26 * 3_600_000).toISOString() },
      { id: 'n4', type: 'payment_received', title: 'Pembayaran diterima', message: 'Rp 12.500.000 dari CV Maju untuk INV-2026-0099.', isRead: true, createdAt: new Date(now - 4 * 86_400_000).toISOString() },
    ]
    await page.route('**/api/notifications/unread-count', (r) => r.fulfill({ json: { count: 2 } }))
    await page.route('**/api/notifications', (r) => r.fulfill({ json: { data: items } }))
    await page.reload()
    await settle(page)
    const bell = page.getByRole('button', { name: 'Notifikasi, 2 belum dibaca' })
    await expect(bell).toBeVisible()
    await shot(page, project, 'bell-badge')
    await bell.click()
    const first = page.getByRole('button', { name: /Persetujuan menunggu/ })
    await expect(first).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('button', { name: /Faktur jatuh tempo/ })).toBeFocused()
    await shot(page, project, 'bell-items')
    expect(await axe(page, project, 'bell-items', '[role="dialog"]')).toEqual([])
  })

  test('shortcut help', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    test.skip(project === 'mobile', 'keyboard-only dialog')
    await page.locator('body').click({ position: { x: 700, y: 400 } })
    await page.keyboard.press('Shift+?')
    const dialog = page.getByRole('dialog', { name: 'Pintasan Keyboard' })
    await expect(dialog).toBeVisible()
    await shot(page, project, 'shortcut-help')
    expect(await axe(page, project, 'shortcut-help', '[role="dialog"]')).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // g d goes to the dashboard
    await page.keyboard.press('g')
    await page.keyboard.press('d')
    await expect(page).toHaveURL(/\/$/)
  })
})

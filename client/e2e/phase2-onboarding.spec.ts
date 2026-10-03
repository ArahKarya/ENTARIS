import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { settle } from './helpers'

/**
 * Visual + a11y capture of the first-run onboarding wizard and the dashboard
 * "Lengkapi penyiapan" card. Nothing is written to the database: the company
 * record's `onboardedAt` is overridden in flight and every write is stubbed.
 *
 *   SHOT_DIR=... npx playwright test -c e2e/playwright.config.ts phase2-onboarding.spec.ts
 */
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'shots')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const shot = (testInfo: TestInfo, name: string) => path.join(SHOT_DIR, `${testInfo.project.name}__onboarding-${name}.png`)

/** Theme pinned to the project; the legacy suppression flag is removed so the wizard can open. */
async function prepare(page: Page, testInfo: TestInfo, onboardedAt: string | null) {
  const theme = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.addInitScript((t: string) => {
    try {
      localStorage.setItem('theme', t)
      localStorage.removeItem('onboardingDone')
      localStorage.removeItem('setupChecklist.dismissed')
    } catch {
      /* storage unavailable */
    }
  }, theme)
  await page.route('**/api/settings/company', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ json: {} })
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: { ...body, onboardedAt } })
  })
  await page.route('**/api/settings/company/onboarding', (route) =>
    route.fulfill({ json: { id: 'stub', onboardedAt: new Date().toISOString() } }),
  )
}

async function axe(page: Page, testInfo: TestInfo, name: string, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(TAGS)
  if (include) builder = builder.include(include)
  const results = await builder.analyze()
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  const out = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  fs.writeFileSync(path.join(SHOT_DIR, `${testInfo.project.name}__onboarding-${name}.axe.json`), JSON.stringify(out, null, 2))
  return out
}

test.describe('onboarding', () => {
  test('wizard steps', async ({ page }, testInfo) => {
    await prepare(page, testInfo, null)
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Selamat datang di Entaris' })
    await expect(dialog).toBeVisible()
    await settle(page)
    await page.screenshot({ path: shot(testInfo, '1-welcome'), animations: 'disabled' })
    expect(await axe(page, testInfo, 'welcome', '[role="dialog"]')).toEqual([])

    await page.getByRole('button', { name: 'Mulai penyiapan' }).click()
    await expect(page.getByRole('dialog', { name: 'Profil perusahaan' })).toBeVisible()
    await page.getByRole('button', { name: 'Simpan & lanjut' }).click()
    await expect(page.getByText('Nama perusahaan wajib diisi.')).toBeVisible()
    await page.screenshot({ path: shot(testInfo, '2-company-error'), animations: 'disabled' })
    expect(await axe(page, testInfo, 'company', '[role="dialog"]')).toEqual([])

    await page.getByRole('textbox', { name: /Nama perusahaan/ }).fill('PT Contoh Sejahtera')
    await page.getByRole('textbox', { name: 'Alamat' }).fill('Jl. Merdeka No. 10, Bandung')
    await page.getByRole('button', { name: 'Simpan & lanjut' }).click()
    await expect(page.getByRole('dialog', { name: 'Tahun buku' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: shot(testInfo, '3-fiscal'), animations: 'disabled' })

    await page.getByRole('button', { name: 'Lanjut', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Keamanan akun' })).toBeVisible()
    await page.getByLabel('Kata sandi saat ini').fill('x')
    await page.getByLabel('Kata sandi baru', { exact: true }).fill('lemah')
    await page.getByRole('button', { name: 'Ganti kata sandi' }).click()
    await expect(page.getByText(/minimal 8 karakter/)).toBeVisible()
    await page.screenshot({ path: shot(testInfo, '4-security-error'), animations: 'disabled' })
    expect(await axe(page, testInfo, 'security', '[role="dialog"]')).toEqual([])

    for (const label of ['Kata sandi saat ini', 'Kata sandi baru', 'Ulangi kata sandi baru']) {
      await page.getByLabel(label, { exact: true }).fill('')
    }
    await page.getByRole('button', { name: 'Lanjut tanpa mengganti' }).click()
    await expect(page.getByRole('dialog', { name: 'Penyiapan selesai' })).toBeVisible()
    await page.screenshot({ path: shot(testInfo, '5-done'), animations: 'disabled' })

    const persisted = page.waitForRequest((r) => r.url().endsWith('/api/settings/company/onboarding') && r.method() === 'POST')
    await page.getByRole('button', { name: 'Mulai gunakan Entaris' }).click()
    await persisted
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('escape skips and never blocks', async ({ page }, testInfo) => {
    await prepare(page, testInfo, null)
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Selamat datang di Entaris' })).toBeVisible()
    const persisted = page.waitForRequest((r) => r.url().endsWith('/api/settings/company/onboarding') && r.method() === 'POST')
    await page.keyboard.press('Escape')
    await persisted
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('non-admin never sees the wizard', async ({ page }, testInfo) => {
    await prepare(page, testInfo, null)
    // Downgrade the refreshed session user to a viewer without settings edit.
    await page.route('**/api/auth/me', async (route) => {
      const res = await route.fetch()
      const body = await res.json()
      const user = { ...body.user, role: 'Viewer', isSuperAdmin: false, permissions: { settings: { view: true, edit: false } } }
      await route.fulfill({ response: res, json: { ...body, user } })
    })
    await page.goto('/')
    await settle(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Lengkapi penyiapan' })).toHaveCount(0)
  })

  test('dashboard checklist card', async ({ page }, testInfo) => {
    await prepare(page, testInfo, new Date().toISOString())
    await page.goto('/')
    const card = page.getByRole('region', { name: 'Lengkapi penyiapan' })
    await expect(card).toBeVisible()
    await settle(page)
    await page.screenshot({ path: shot(testInfo, '6-dashboard-checklist'), animations: 'disabled' })
    await card.screenshot({ path: shot(testInfo, '6-checklist-card'), animations: 'disabled' })
    expect(await axe(page, testInfo, 'checklist', '[aria-labelledby="setup-checklist-title"]')).toEqual([])
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await card.getByRole('button', { name: 'Sembunyikan daftar penyiapan' }).click()
    await expect(card).toHaveCount(0)
  })
})

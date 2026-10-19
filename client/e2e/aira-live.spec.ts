import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { LOGGED_OUT, prepareTheme, settle } from './helpers'

/**
 * LIVE end-to-end of the AIRA panel against a real Entaris server + the reusable mock agent
 * (server/scripts/mock-agent.ts). Not part of the default run: set E2E_AIRA_LIVE=1.
 *
 *   E2E_AIRA_LIVE=1 E2E_BASE_URL=http://localhost:5174 SHOT_DIR=... \
 *     npx playwright test -c e2e/playwright.config.ts aira-live.spec.ts --project=desktop-light
 *   E2E_AIRA_LIVE=1 E2E_PHASE=offline ... (after stopping the mock agent)
 *
 * Users: staff@entaris.demo (Accountant) and produksi@entaris.demo (StaffProduksi), both with Akses AIRA.
 */
const LIVE = process.env.E2E_AIRA_LIVE === '1'
const PHASE = process.env.E2E_PHASE ?? 'main'
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'shots')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test.skip(!LIVE, 'set E2E_AIRA_LIVE=1 with the live stack (server + mock agent)')
test.describe.configure({ mode: 'serial' })
test.use({ storageState: LOGGED_OUT })

async function login(page: Page, testInfo: TestInfo, user: string): Promise<void> {
  await prepareTheme(page, testInfo)
  await page.goto('/login')
  await page.locator('#login-username').fill(user)
  await page.locator('#login-password').fill('Admin123!')
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
    page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit()),
  ])
  await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 })
}

const shot = (testInfo: TestInfo, name: string): string => path.join(SHOT_DIR, `${testInfo.project.name}__live-${name}.png`)

async function axe(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  fs.writeFileSync(path.join(SHOT_DIR, `${testInfo.project.name}__live-${name}.axe.json`), JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target.join(' ')) })), null, 2))
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `axe ${name}`).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow on ${name}`).toBeLessThanOrEqual(0)
}

const isMobile = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 768
const box = (page: Page) => page.getByLabel('Pesan untuk AIRA')

/** Wait until the composer is idle (send button, not stop), then send. */
async function send(page: Page, text: string): Promise<void> {
  await expect(page.getByRole('button', { name: 'Kirim pesan' })).toBeVisible({ timeout: 20_000 })
  await box(page).fill(text)
  await box(page).press('Enter')
}

async function openList(page: Page): Promise<void> {
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'Riwayat percakapan' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(350)
  }
}
async function closeList(page: Page): Promise<void> {
  if (isMobile(page)) await page.keyboard.press('Escape')
}

test.describe('AIRA live loop', () => {
  test.skip(PHASE !== 'main', 'main phase only')
  const tag = Date.now().toString(36) // unik per run: DB uji menyimpan sesi dari run sebelumnya
  const draftTitle = `Buat draft buku kas dari foto nota ${tag}`
  const renamed = `Nota Oktober ${tag}`

  test('new session → streamed answer → tool chip + card → persists after reload → rename/search/archive/delete', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'functional flow runs once; other projects only capture states')
    await login(page, testInfo, 'staff@entaris.demo')
    await page.goto('/aira')
    await settle(page)
    await page.getByRole('button', { name: 'Sesi baru' }).first().click() // panel reopens the last session; start fresh
    await expect(page.getByRole('list', { name: 'Contoh permintaan' }).getByRole('button')).toHaveCount(3)
    await page.screenshot({ path: shot(testInfo, 'empty'), animations: 'disabled' })
    await axe(page, testInfo, 'empty')

    // Attachment + draft request (mock agent calls kas_daftar_akun + kas_buat_draft_dari_baris through /mcp).
    await page.locator('input[type=file]').setInputFiles({ name: 'nota-oktober.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByText('nota-oktober.png')).toBeVisible()
    await box(page).fill(draftTitle)
    await box(page).press('Enter')
    await expect(page.getByRole('button', { name: 'Hentikan jawaban' })).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'streaming'), animations: 'disabled' })
    await expect(page.getByText(/Mengambil|Menyiapkan/).first()).toBeVisible({ timeout: 15_000 })
    const link = page.getByRole('link', { name: /Tinjau draft/ })
    await expect(link).toBeVisible({ timeout: 20_000 })
    await expect(link).toHaveAttribute('href', /\/cash-book-drafts\/.+/)
    await expect(page.getByText(/Draft Buku Kas DKB-/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kirim pesan' })).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shot(testInfo, 'cards'), animations: 'disabled' })
    await axe(page, testInfo, 'cards')
    const href = await link.getAttribute('href')

    // The session title appears in the list; refresh keeps session + history + card.
    await expect(page.getByRole('navigation', { name: 'Daftar sesi' }).getByRole('button', { name: draftTitle, exact: true })).toBeVisible()
    await page.reload()
    await settle(page)
    await expect(page.getByText(/Draft Buku Kas DKB-/).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Tinjau draft/ })).toHaveAttribute('href', href ?? '')
    await expect(page.getByAltText(/nota-oktober/)).toBeVisible()

    // Clicking the card opens the review page of the draft.
    await page.getByRole('link', { name: /Tinjau draft/ }).click()
    await expect(page).toHaveURL(/\/cash-book-drafts\/.+/)
    await expect(page.getByText(/DKB-\d{6}-\d{4}/).first()).toBeVisible({ timeout: 15_000 })
    await page.goBack()
    await settle(page)

    // Rename inline → search by new title; content search; no-match search.
    await page.getByRole('button', { name: `Ubah nama: ${draftTitle}` }).click({ force: true })
    await page.getByLabel('Nama sesi').fill(renamed)
    await page.getByLabel('Nama sesi').press('Enter')
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible()
    await page.getByLabel('Cari percakapan').fill(tag)
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible()
    await page.getByLabel('Cari percakapan').fill('ATK')
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible() // cocok lewat isi pesan
    await page.getByLabel('Cari percakapan').fill('tidak-ada-kata-ini')
    await expect(page.getByText('Tidak ada percakapan yang cocok.')).toBeVisible()
    await page.getByLabel('Cari percakapan').fill('')

    // Archive → disappears from Aktif, appears in Arsip, restore.
    await page.getByRole('button', { name: `Arsipkan sesi: ${renamed}` }).click({ force: true })
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Arsip', exact: true }).click()
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible()
    await page.getByRole('button', { name: `Pulihkan sesi: ${renamed}` }).click({ force: true })
    await page.getByRole('button', { name: 'Aktif', exact: true }).click()
    await expect(page.getByRole('button', { name: renamed, exact: true })).toBeVisible()

    // Delete asks for confirmation, then removes the session (and the panel falls back to the empty state).
    await page.getByRole('button', { name: `Hapus sesi: ${renamed}` }).click({ force: true })
    await expect(page.getByRole('alertdialog').or(page.getByRole('dialog'))).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'delete-confirm'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Hapus', exact: true }).click()
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0)
    await page.reload()
    await settle(page)
    await expect(page.getByRole('button', { name: renamed, exact: true })).toHaveCount(0)
  })

  test('stop mid-stream keeps the partial text; Esc also stops; retry-free resend works', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'functional flow runs once')
    await login(page, testInfo, 'staff@entaris.demo')
    await page.goto('/aira')
    await settle(page)
    await page.getByRole('button', { name: 'Sesi baru' }).first().click()
    await box(page).fill('tolong jawab lambat sekali')
    await box(page).press('Enter')
    await expect(page.getByText(/Kalimat panjang nomor 2 /)).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByText('Dihentikan. Teks yang sudah diterima tetap tersimpan.')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Kalimat panjang nomor 2 /)).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'aborted'), animations: 'disabled' })
    // After reload the partial text and its "aborted" status persist.
    await page.reload()
    await settle(page)
    await expect(page.getByText(/Kalimat panjang nomor 2 /)).toBeVisible()
    await expect(page.getByText('Dihentikan. Teks yang sudah diterima tetap tersimpan.')).toBeVisible()
    // Retry (resend the last user message): "Coba lagi" then a normal answer is not available for lambat, so use a new session.
    await page.getByRole('button', { name: /Coba lagi/ }).click()
    await expect(page.getByText(/Kalimat panjang nomor 2 /).last()).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
  })

  test('two users get their own role in the identity block; memory search sees only own history; IDOR blocked', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'functional flow runs once')
    const mk = async (b: Browser, user: string): Promise<Page> => {
      const ctx = await b.newContext({ storageState: LOGGED_OUT, viewport: { width: 1440, height: 900 } })
      const p = await ctx.newPage()
      await login(p, testInfo, user)
      await p.goto('/aira')
      await settle(p)
      return p
    }
    const staff = await mk(browser, 'staff@entaris.demo')
    const prod = await mk(browser, 'produksi@entaris.demo')

    await send(staff, 'Halo, saya siapa?')
    await expect(staff.getByText(/Halo Staff Keuangan \(Akuntan/).last()).toBeVisible({ timeout: 15_000 })
    await send(prod, 'Halo, saya siapa?')
    await expect(prod.getByText(/Halo .* \(.*Produksi.*\)\. Aku agen tiruan/).last()).toBeVisible({ timeout: 15_000 })
    await expect(prod.getByText(/\(Akuntan/)).toHaveCount(0)

    // The agent searches the actor's own history (tool chip appears); produksi has no "nota" history.
    await send(staff, 'cari riwayat nota')
    await expect(staff.getByText('Mencari di riwayat percakapan…').last()).toBeVisible({ timeout: 15_000 })
    await send(prod, 'cari riwayat nota')
    await expect(prod.getByText(/Aku cari di riwayat/).last()).toBeVisible({ timeout: 15_000 })

    // Second user cannot read/modify/delete the first user's sessions.
    const sid = await staff.evaluate(async () => {
      const r = await fetch('/api/ai/chat/sessions?limit=1', { credentials: 'include' })
      return ((await r.json()) as { data: Array<{ id: string }> }).data[0].id
    })
    const probe = await prod.evaluate(async (id) => {
      const csrf = document.cookie.split('; ').find((c) => c.startsWith('csrf-token='))?.split('=')[1] ?? ''
      const h = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
      const get = await fetch(`/api/ai/chat/sessions/${id}/messages`, { credentials: 'include' })
      const patch = await fetch(`/api/ai/chat/sessions/${id}`, { method: 'PATCH', credentials: 'include', headers: h, body: JSON.stringify({ title: 'dibajak' }) })
      const del = await fetch(`/api/ai/chat/sessions/${id}`, { method: 'DELETE', credentials: 'include', headers: h })
      const stream = await fetch('/api/ai/chat/stream', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ input: 'masuk', session_id: id }) })
      const list = (await (await fetch('/api/ai/chat/sessions', { credentials: 'include' })).json()) as { data: Array<{ id: string }> }
      return { get: get.status, patch: patch.status, del: del.status, stream: stream.status, listed: list.data.some((s) => s.id === id) }
    }, sid)
    expect(probe).toEqual({ get: 404, patch: 404, del: 404, stream: 404, listed: false })
    await staff.context().close()
    await prod.context().close()
  })

  test('resume on a second browser context opens the last session with full history; concurrent turn → 409', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'functional flow runs once')
    const ctx1 = await browser.newContext({ storageState: LOGGED_OUT, viewport: { width: 1440, height: 900 } })
    const p1 = await ctx1.newPage()
    await login(p1, testInfo, 'staff@entaris.demo')
    await p1.goto('/aira')
    await settle(p1)
    await p1.getByRole('button', { name: 'Sesi baru' }).first().click()
    await send(p1, 'Catat kode proyek KEMBANG-77')
    await expect(p1.getByText(/pesanmu: "Catat kode proyek KEMBANG-77"/)).toBeVisible({ timeout: 15_000 })

    const ctx2 = await browser.newContext({ storageState: LOGGED_OUT, viewport: { width: 1440, height: 900 } })
    const p2 = await ctx2.newPage()
    await login(p2, testInfo, 'staff@entaris.demo')
    await p2.goto('/aira')
    await settle(p2)
    await expect(p2.getByText('Catat kode proyek KEMBANG-77').first()).toBeVisible({ timeout: 15_000 })
    await expect(p2.getByText(/pesanmu: "Catat kode proyek KEMBANG-77"/)).toBeVisible()

    // Two tabs, same session: start a slow turn in tab 1, then send in tab 2 → clear 409 message.
    await send(p1, 'jawab lambat dulu')
    await expect(p1.getByText(/Kalimat panjang nomor 1 /)).toBeVisible({ timeout: 15_000 })
    await send(p2, 'pesan dari tab kedua')
    await expect(p2.getByText(/masih memproses pesan sebelumnya/)).toBeVisible({ timeout: 10_000 })
    await expect(box(p2)).toHaveValue('pesan dari tab kedua') // teks tidak hilang
    await p1.keyboard.press('Escape')
    await ctx1.close()
    await ctx2.close()
  })
})

test.describe('AIRA live offline', () => {
  test.skip(PHASE !== 'offline', 'offline phase (stop the mock agent first)')

  test('engine offline: banner, typed message is not lost, retry after recovery', async ({ page }, testInfo) => {
    await login(page, testInfo, 'staff@entaris.demo')
    await page.goto('/aira')
    await settle(page)
    if (testInfo.project.name === 'desktop-light') {
      await page.getByRole('button', { name: 'Sesi baru' }).first().click()
      await box(page).fill('pesan saat engine mati')
      await box(page).press('Enter')
      await expect(page.getByText('Engine AIRA tidak dapat dihubungi.').first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText('pesan saat engine mati')).toBeVisible()
      await expect(page.getByRole('button', { name: /Coba lagi/ }).first()).toBeVisible()
    }
    await expect(page.getByRole('alert').filter({ hasText: 'Engine AIRA sedang offline' })).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shot(testInfo, 'offline'), animations: 'disabled' })
    await axe(page, testInfo, 'offline')
  })
})

test.describe('AIRA live states (all projects)', () => {
  test.skip(PHASE !== 'main', 'main phase only')

  test('streaming and result cards in this theme/viewport', async ({ page }, testInfo) => {
    await login(page, testInfo, 'staff@entaris.demo')
    await page.goto('/aira')
    await settle(page)
    if (isMobile(page)) await page.getByRole('button', { name: 'Sesi baru' }).click()
    else await page.getByRole('button', { name: 'Sesi baru' }).first().click()
    await page.locator('input[type=file]').setInputFiles({ name: 'nota.png', mimeType: 'image/png', buffer: PNG })
    await box(page).fill(`Buat draft buku kas dari foto nota ${testInfo.project.name}`)
    await box(page).press('Enter')
    await expect(page.getByRole('button', { name: 'Hentikan jawaban' })).toBeVisible()
    await expect(page.getByText(/Mengambil|Menyiapkan/).first()).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: shot(testInfo, 'streaming-tools'), animations: 'disabled' })
    await expect(page.getByRole('link', { name: /Tinjau draft/ })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Kirim pesan' })).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: shot(testInfo, 'cards'), animations: 'disabled' })
    await axe(page, testInfo, 'cards')
  })

  test('conversation, cards and session list in this theme/viewport', async ({ page }, testInfo) => {
    await login(page, testInfo, 'staff@entaris.demo')
    await page.goto('/aira')
    await settle(page)
    await expect(page.getByLabel('Pesan untuk AIRA')).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'conversation'), animations: 'disabled' })
    await axe(page, testInfo, 'conversation')
    await openList(page)
    await expect(page.getByLabel('Cari percakapan')).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'sessions'), animations: 'disabled' })
    await axe(page, testInfo, 'sessions')
    await closeList(page)
  })
})

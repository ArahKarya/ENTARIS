import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { prepareTheme, settle } from './helpers'

/**
 * Visual + a11y capture of the AIRA chat (/aira) in its main states. The server
 * contract (/api/ai/chat/*) is stubbed, so no engine is needed:
 *
 *   SHOT_DIR=... npx playwright test -c e2e/playwright.config.ts phase2-aira.spec.ts
 *
 * For the full loop against a real server + mock agent see aira-live.spec.ts.
 */
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'shots')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const session = (id: string, title: string | null, ms: number, over: object = {}) => ({
  id, title, titleSource: 'auto', status: 'active', messageCount: 4, lastMessageAt: ago(ms), lastOpenedAt: null, createdAt: ago(ms), busy: false, ...over,
})
const SESSIONS = [
  session('s-1', 'Ringkas piutang jatuh tempo minggu ini', 5 * 60_000),
  session('s-2', 'Draft buku kas dari foto nota', 3 * 3600_000),
  session('s-3', 'Apa saja yang menunggu persetujuan saya?', 30 * 3600_000),
  session('s-4', 'Rekap penjualan bulan lalu', 20 * 86400_000),
]

const msg = (seq: number, role: string, content: string, over: object = {}) => ({
  id: `m${seq}`, seq, turnId: `t${Math.ceil(seq / 2)}`, role, content, status: 'ok', error: null, durationMs: 1800, createdAt: ago(60_000), attachments: [], parts: null, ...over,
})

const CONVERSATION = [
  msg(1, 'user', 'Ringkas piutang jatuh tempo minggu ini'),
  msg(2, 'assistant', 'Piutang jatuh tempo minggu ini **Rp 182.450.000** dari 5 faktur:\n\n| Pelanggan | Jumlah |\n|---|---|\n| PT Sinar Jaya | Rp 90.000.000 |\n| CV Maju Bersama | Rp 92.450.000 |\n\n- Faktur tertua jatuh tempo 7 hari lalu\n- Disarankan menagih lebih dulu PT Sinar Jaya', {
    parts: { tools: [{ name: 'dash_receivables_aging', label: 'Mengambil piutang jatuh tempo…', state: 'done' }], cards: [] },
  }),
  msg(3, 'user', 'Buat draft buku kas dari foto nota ini', { attachments: [{ id: 'a1', fileName: 'nota-oktober.png', mimeType: 'image/png', size: 120000 }] }),
  msg(4, 'assistant', 'Sudah kubuat draft buku kas dari 3 baris nota. Belum ada jurnal; silakan tinjau dan posting.', {
    parts: {
      tools: [{ name: 'kas_buat_draft_dari_baris', label: 'Menyiapkan membuat draft buku kas…', state: 'done' }],
      cards: [
        { kind: 'cash_book_draft', title: 'Draft Buku Kas DKB-202610-0007', summary: 'Buku kas Oktober · 3 baris · 1 perlu ditinjau', href: '/cash-book-drafts/d7', status: 'Draft' },
        { kind: 'approval', title: 'Menunggu persetujuan', summary: 'Posting draft DKB-202610-0007 ke jurnal?', href: '/approvals', status: 'Pending' },
      ],
    },
  }),
  msg(5, 'user', 'Tolong ringkas laporan laba rugi'),
  msg(6, 'assistant', 'Engine AIRA tidak dapat dihubungi.', { status: 'error', error: 'Engine AIRA tidak dapat dihubungi.' }),
]

async function stubAira(page: Page, opts: { online?: boolean; messages?: object[]; sessions?: object[] } = {}): Promise<void> {
  const sessions = opts.sessions ?? SESSIONS
  const messages = opts.messages ?? []
  await page.route('**/api/ai/chat/health', (route) =>
    route.fulfill({ json: { configured: true, online: opts.online ?? true, latencyMs: 42, acceptsPdf: false, checkedAt: ago(0), reason: opts.online === false ? 'unreachable' : undefined } }),
  )
  await page.route('**/api/ai/chat/sessions/last', (route) =>
    route.fulfill({ json: { data: messages.length ? sessions[0] : null } }),
  )
  await page.route(/\/api\/ai\/chat\/sessions\/[^/?]+\/messages/, (route) =>
    route.fulfill({ json: { data: messages, hasMore: false, session: sessions[0] } }),
  )
  await page.route(/\/api\/ai\/chat\/sessions(\?.*)?$/, (route) =>
    route.fulfill({ json: { data: sessions, total: sessions.length, page: 1, limit: 30 } }),
  )
  await page.route('**/api/ai/chat/attachments/*', (route) => route.fulfill({ status: 404, json: {} }))
}

function shot(testInfo: TestInfo, name: string): string {
  return path.join(SHOT_DIR, `${testInfo.project.name}__aira-${name}.png`)
}

async function axe(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const out = results.violations.map((v) => ({
    id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(' ')),
  }))
  fs.writeFileSync(path.join(SHOT_DIR, `${testInfo.project.name}__aira-${name}.axe.json`), JSON.stringify(out, null, 2))
  const blocking = out.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking, `axe serious/critical on ${name}`).toEqual([])
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
})

test.describe('AIRA chat', () => {
  test('aira empty', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page)
    await page.goto('/aira')
    await settle(page)
    expect(new URL(page.url()).pathname).toBe('/aira')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Asisten AIRA')
    await expect(page.getByRole('list', { name: 'Contoh permintaan' }).getByRole('button')).toHaveCount(3)
    await page.screenshot({ path: shot(testInfo, 'empty'), animations: 'disabled' })
    await axe(page, testInfo, 'empty')
    await noHorizontalOverflow(page)
  })

  test('aira conversation with cards', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page, { messages: CONVERSATION })
    await page.goto('/aira')
    await settle(page)
    await expect(page.getByText('Draft Buku Kas DKB-202610-0007')).toBeVisible()
    await expect(page.getByRole('link', { name: /Tinjau draft/ })).toHaveAttribute('href', '/cash-book-drafts/d7')
    await expect(page.getByRole('link', { name: /Buka Persetujuan/ })).toHaveAttribute('href', '/approvals')
    await expect(page.getByRole('button', { name: /Coba lagi/ }).first()).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'conversation'), animations: 'disabled' })
    await axe(page, testInfo, 'conversation')
    await noHorizontalOverflow(page)
  })

  test('aira engine offline banner', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page, { online: false, messages: CONVERSATION.slice(0, 2) })
    await page.goto('/aira')
    await settle(page)
    await expect(page.getByRole('alert').filter({ hasText: 'Engine AIRA sedang offline' })).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'offline'), animations: 'disabled' })
    await axe(page, testInfo, 'offline')
  })

  test('aira session drawer (mobile) / list (desktop)', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page, { messages: CONVERSATION.slice(0, 2) })
    await page.goto('/aira')
    await settle(page)
    const isMobile = (page.viewportSize()?.width ?? 1440) < 768
    if (isMobile) {
      await expect(page.getByRole('button', { name: 'Sesi baru' })).toBeVisible()
      await page.getByRole('button', { name: 'Riwayat percakapan' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(350)
    }
    await expect(page.getByLabel('Cari percakapan')).toBeVisible()
    await page.screenshot({ path: shot(testInfo, 'sessions'), animations: 'disabled' })
    await axe(page, testInfo, 'sessions')
    await noHorizontalOverflow(page)
  })

  test('aira composer focus', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page)
    await page.goto('/aira')
    await settle(page)
    const box = page.getByLabel('Pesan untuk AIRA')
    await box.focus()
    await box.fill('Buat draft buku kas dari foto nota')
    await page.screenshot({ path: shot(testInfo, 'composer-focus'), animations: 'disabled' })
  })
})

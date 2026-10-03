import { test, expect, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { prepareTheme, settle } from './helpers'

/**
 * Visual + a11y capture of the AIRA chat (/aira) in its main states. The AIRA
 * backend is not needed: sessions and approve/cancel endpoints are stubbed and
 * the conversation is seeded through the page's own sessionStorage cache.
 *
 *   SHOT_DIR=... npx playwright test -c e2e/playwright.config.ts phase2-aira.spec.ts
 */
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'shots')
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const SESSIONS = [
  { session_id: 's-1', title: 'Jurnal koreksi telekomunikasi', status: 'active', last_active_at: new Date(Date.now() - 5 * 60_000).toISOString(), run_count: 2 },
  { session_id: 's-2', title: 'Buku kas Juli', status: 'active', last_active_at: new Date(Date.now() - 3 * 3600_000).toISOString(), run_count: 1 },
  { session_id: 's-3', title: null, status: 'active', last_active_at: new Date(Date.now() - 3 * 86400_000).toISOString(), run_count: 0 },
]

const CONVERSATION = [
  { id: 'u1', role: 'user', text: 'Berapa saldo kas dan bank hari ini?' },
  {
    id: 'a1', role: 'assistant', status: 'executed', auto: true, streaming: false,
    stages: ['Menyusun rencana', 'Memeriksa kebijakan'],
    text: 'Saldo kas & bank per hari ini Rp 182.450.000: Petty Cash Rp 2.450.000, Bank BCA Rp 120.000.000, Bank Mandiri Rp 60.000.000.',
  },
  { id: 'u2', role: 'user', text: 'Buat jurnal koreksi: debit Beban Telekomunikasi 50.000, kredit Petty Cash 50.000' },
  {
    id: 'a2', role: 'assistant', status: 'paused', runId: 'run-draft', streaming: false,
    text: 'Aku siapkan jurnal koreksi beban telekomunikasi. Mohon cek lalu setujui.',
    draft: {
      tool: 'je_create', risk: 'write', tier: 'approval',
      summary: 'Jurnal koreksi: Beban Telekomunikasi Rp 50.000 dari Petty Cash.',
      reason: 'Pengeluaran pulsa kantor belum tercatat di buku besar.',
      args: {
        memo: 'Koreksi pulsa kantor Juli',
        lines: [
          { account: '6.1.4', accountLabel: 'Beban Telekomunikasi', debit: 50000, credit: 0 },
          { account: '1.1.1', accountLabel: 'Petty Cash', debit: 0, credit: 50000 },
        ],
      },
    },
  },
  { id: 'u3', role: 'user', text: 'Tolong posting buku kas ini  📎' },
  {
    id: 'a3', role: 'assistant', status: 'cashbook_paused', runId: 'run-cash', streaming: false,
    text: 'Aku baca buku kas: 3 transaksi. Cek akun yang kutandai kuning lalu posting.',
    coa: [
      { accountNumber: '6.1.4', name: 'Beban Telekomunikasi' },
      { accountNumber: '6.1.7', name: 'Beban Transportasi' },
      { accountNumber: '4.2', name: 'Pendapatan Jasa' },
      { accountNumber: '6.9', name: 'Beban Lain-lain' },
    ],
    cashbook: {
      title: 'Buku Kas Kecil', date: '2026-07-31', openingBalance: 2000000, closingBalance: 2450000,
      totals: { masuk: 750000, keluar: 300000, count: 3, needReview: 1 },
      entries: [
        { idx: 0, date: '2026-07-02', keterangan: 'Bayar pulsa kantor', amount: 100000, txnType: 'pengeluaran', account: '6.1.4', accountLabel: 'Beban Telekomunikasi', lines: [], confidence: 0.94, needsReview: false, reason: '' },
        { idx: 1, date: '2026-07-10', keterangan: 'Ongkos kirim dokumen ke klien Surabaya', amount: 200000, txnType: 'pengeluaran', account: '6.9', accountLabel: 'Beban Lain-lain', lines: [], confidence: 0.52, needsReview: true, reason: 'Ragu: bisa Beban Transportasi atau Beban Lain-lain.' },
        { idx: 2, date: '2026-07-21', keterangan: 'Terima jasa konsultasi', amount: 750000, txnType: 'pemasukan', account: '4.2', accountLabel: 'Pendapatan Jasa', lines: [], confidence: 0.9, needsReview: false, reason: '' },
      ],
    },
  },
  { id: 'a4', role: 'assistant', streaming: false, text: '⚠️ Layanan AIRA tidak merespons. Coba lagi beberapa saat.' },
]

async function stubAira(page: Page): Promise<void> {
  await page.route('**/api/ai/chat/sessions', (route) =>
    route.fulfill({ json: { items: SESSIONS, total: SESSIONS.length } }),
  )
  await page.route('**/api/ai/chat/approve', (route) => route.fulfill({ json: { ok: true } }))
  await page.route('**/api/ai/chat/cashbook-cancel', (route) => route.fulfill({ json: { ok: true } }))
}

async function seedConversation(page: Page, withSession: boolean): Promise<void> {
  await page.addInitScript(
    ([msgs, sid]) => {
      try {
        window.sessionStorage.setItem('aira_chat_messages', msgs)
        if (sid) window.sessionStorage.setItem('aira_chat_session_id', sid)
      } catch {
        /* storage unavailable */
      }
    },
    [JSON.stringify(CONVERSATION), withSession ? 's-1' : ''] as const,
  )
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
    await page.screenshot({ path: shot(testInfo, 'empty'), animations: 'disabled' })
    await axe(page, testInfo, 'empty')
  })

  test('aira conversation', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page)
    await seedConversation(page, true)
    await page.goto('/aira')
    await settle(page)
    await page.screenshot({ path: shot(testInfo, 'conversation-bottom'), animations: 'disabled' })
    await axe(page, testInfo, 'conversation')

    const draft = page.getByTestId('aira-draft-card').first()
    if (await draft.count()) {
      await draft.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await page.screenshot({ path: shot(testInfo, 'conversation-draft'), animations: 'disabled' })
      await draft.screenshot({ path: shot(testInfo, 'card-draft'), animations: 'disabled' })
    }
    const cash = page.getByTestId('aira-cashbook-card').first()
    if (await cash.count()) {
      await cash.screenshot({ path: shot(testInfo, 'card-cashbook'), animations: 'disabled' })
    }
  })

  test('aira reject confirm', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page)
    await seedConversation(page, true)
    await page.goto('/aira')
    await settle(page)
    const draft = page.getByTestId('aira-draft-card').first()
    test.skip((await draft.count()) === 0, 'draft card has no test id yet')
    await draft.scrollIntoViewIfNeeded()
    await draft.getByRole('button', { name: 'Tolak' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: shot(testInfo, 'reject-confirm'), animations: 'disabled' })
    await axe(page, testInfo, 'reject-confirm')
    await dialog.getByRole('button', { name: 'Tolak draft' }).click()
    await expect(draft.getByText('Ditolak', { exact: true })).toBeVisible()
    await draft.screenshot({ path: shot(testInfo, 'card-draft-rejected'), animations: 'disabled' })

    // Cash book reject goes through the same confirm step.
    const cash = page.getByTestId('aira-cashbook-card').first()
    await cash.scrollIntoViewIfNeeded()
    await cash.getByRole('button', { name: 'Tolak' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: shot(testInfo, 'cashbook-reject-confirm'), animations: 'disabled' })
  })

  test('aira composer focus', async ({ page }, testInfo) => {
    await prepareTheme(page, testInfo)
    await stubAira(page)
    await page.goto('/aira')
    await settle(page)
    const box = page.getByLabel('Pesan untuk AIRA')
    test.skip((await box.count()) === 0, 'composer has no label yet')
    await box.focus()
    await box.fill('Buat jurnal koreksi untuk pulsa kantor')
    await page.screenshot({ path: shot(testInfo, 'composer-focus'), animations: 'disabled' })
  })
})

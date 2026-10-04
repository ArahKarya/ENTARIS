import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { STORAGE_STATE } from './playwright.config'

/**
 * Logs in ONCE through the real login form and saves the session (HttpOnly auth
 * cookie + CSRF cookie + localStorage 'user'). The login endpoint is rate limited
 * (10 / 15 min), so every spec reuses this storageState instead of logging in.
 * Set E2E_REUSE_AUTH=true to skip logging in when a fresh state already exists.
 */
const MAX_STATE_AGE_MS = 60 * 60 * 1000

export default async function globalSetup(config: FullConfig): Promise<void> {
  const { baseURL, launchOptions } = config.projects[0].use
  const username = process.env.E2E_USER ?? 'admin@entaris.demo'
  const password = process.env.E2E_PASSWORD ?? 'Adminentaris123!dsw'

  if (isFresh(STORAGE_STATE)) return

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true })
  const browser = await chromium.launch(launchOptions)
  try {
    const page = await browser.newPage({ baseURL })
    await page.goto('/login')
    await page.locator('#login-username').fill(username)
    await page.locator('#login-password').fill(password)
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'),
      page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit()),
    ]).then(async ([res]) => {
      if (!res.ok()) {
        throw new Error(`E2E login failed: HTTP ${res.status()} ${await res.text()}`)
      }
    })
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 })
    // Dismiss the first-run onboarding wizard so screenshots show real pages.
    await page.evaluate(() => localStorage.setItem('onboardingDone', 'true'))
    await page.context().storageState({ path: STORAGE_STATE })
  } finally {
    await browser.close()
  }
}

function isFresh(file: string): boolean {
  if (process.env.E2E_REUSE_AUTH !== 'true') return false
  try {
    return Date.now() - fs.statSync(file).mtimeMs < MAX_STATE_AGE_MS
  } catch {
    return false
  }
}

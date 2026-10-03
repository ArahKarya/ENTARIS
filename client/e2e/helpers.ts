import type { Page, TestInfo } from '@playwright/test'

/**
 * Pin the app theme to the project's colour scheme (light/dark) before any
 * app script runs, and keep the onboarding wizard dismissed.
 */
export async function prepareTheme(page: Page, testInfo: TestInfo): Promise<void> {
  const scheme = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.addInitScript((theme: string) => {
    try {
      window.localStorage.setItem('theme', theme)
      window.localStorage.setItem('onboardingDone', 'true')
    } catch {
      /* storage unavailable: page still renders with defaults */
    }
  }, scheme)
}

/** Wait until the page has settled enough for a stable capture. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 })
  } catch {
    /* long-polling pages never go idle; fall through */
  }
  // Skeleton loaders (Tailwind animate-pulse) mean data is still rendering.
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-pulse').length === 0, undefined, { timeout: 8_000 })
    .catch(() => undefined)
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined)
  await page.waitForTimeout(400)
}

export const LOGGED_OUT = { cookies: [], origins: [] }

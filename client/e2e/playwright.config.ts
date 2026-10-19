import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
export const STORAGE_STATE = path.join(here, '.auth', 'admin.json')

// Use a locally cached Chromium when the bundled browser is unavailable
// (e.g. offline machines). Leave unset to use Playwright's own download.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

const desktop = { width: 1440, height: 900 }

export default defineConfig({
  testDir: here,
  outputDir: path.join(here, '..', 'test-results'),
  globalSetup: path.join(here, 'global-setup.ts'),
  fullyParallel: false,
  // One worker keeps API traffic well under the server's 300 req/min limiter.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    launchOptions: { executablePath },
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], viewport: desktop, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], viewport: desktop, colorScheme: 'dark' },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
      },
    },
  ],
})

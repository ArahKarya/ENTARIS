import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { ALL_ROUTES, MOBILE_ROUTES, type AppRoute } from './routes'
import { LOGGED_OUT, prepareTheme, settle } from './helpers'

/**
 * Full-page screenshot of every route per project into $SHOT_DIR as
 * <project>__<route-slug>.png. Public routes are captured logged out.
 */
const SHOT_DIR = process.env.SHOT_DIR ?? path.resolve('test-results', 'shots')

function routesFor(project: string): AppRoute[] {
  return project === 'mobile' ? ALL_ROUTES.filter((r) => MOBILE_ROUTES.has(r.path)) : ALL_ROUTES
}

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
})

for (const group of ['public', 'app'] as const) {
  test.describe(`${group} routes`, () => {
    if (group === 'public') test.use({ storageState: LOGGED_OUT })

    for (const route of ALL_ROUTES.filter((r) => r.isPublic === (group === 'public'))) {
      test(`shot ${route.path}`, async ({ page }, testInfo) => {
        test.skip(!routesFor(testInfo.project.name).includes(route), 'not in mobile subset')
        await prepareTheme(page, testInfo)
        await page.goto(route.path)
        await settle(page)
        if (!route.isPublic) {
          // A logged-in route must not bounce to /login (stale storageState).
          expect(new URL(page.url()).pathname, 'session expired?').not.toBe('/login')
        }
        await page.screenshot({
          path: path.join(SHOT_DIR, `${testInfo.project.name}__${route.slug}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      })
    }
  })
}

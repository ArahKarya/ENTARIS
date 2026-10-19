import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { ResourceKey } from 'i18next'
import i18n from '@/i18n'

// Load every namespace up front so components render synchronously (no Suspense) in tests.
const allLocales = import.meta.glob<{ default: ResourceKey }>('../locales/*/*.json', { eager: true })
for (const [path, mod] of Object.entries(allLocales)) {
  const [, lng, ns] = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? []
  if (lng && ns) i18n.addResourceBundle(lng, ns, mod.default, true, true)
}
i18n.options.react = { ...i18n.options.react, useSuspense: false }

afterEach(() => {
  cleanup()
})

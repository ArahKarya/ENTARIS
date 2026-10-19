import { defineConfig } from 'vitest/config';

// Default config = unit tests only. Integration tests live in
// src/__tests__/integration/*.integration.test.ts and need DATABASE_URL +
// a live Postgres. Run them via:
//   npm run test:integration
// Default `npm test` excludes them so CI / pre-commit stays fast.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.integration.test.ts',
    ],
  },
});

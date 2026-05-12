import { defineConfig } from 'vitest/config';

// Integration tests: hit a real Postgres via DATABASE_URL. Each test wraps
// its work in an outer $transaction that throws a RollbackSentinel at the
// end, so dev/test DB stays clean.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.integration.test.ts'],
    // Integration tests share global setup (default warehouse, admin user);
    // running them serially avoids surprises from concurrent fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});

/**
 * Applies the loose SQL migrations in prisma/migrations/*.sql (the ones `prisma migrate deploy`
 * does not run), in file-name order, and records each in `_loose_sql_migrations` so it runs once.
 *
 * - A recorded file is skipped unless its contents changed (checksum), then it runs again.
 * - "Already exists" errors mean the file was applied before this ledger existed: it is recorded.
 * - Any other error is printed in full and counted; the remaining files still run.
 *
 * Usage (from server/): node prisma/apply-loose-sql.mjs   — needs DATABASE_URL.
 * Exit code: 0 when every file is applied or recorded, 2 when some failed (the entrypoints log a
 * warning and keep starting, so one broken file does not take the app down).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Postgres codes for "the object/row this file creates is already there". */
const ALREADY_APPLIED_CODES = new Set([
  '42P07', // duplicate_table (also indexes)
  '42701', // duplicate_column
  '42710', // duplicate_object (constraints, types, triggers)
  '42P06', // duplicate_schema
  '42723', // duplicate_function
  '23505', // unique_violation (seed rows already inserted)
]);

const log = (msg) => console.log(`[SQL] ${msg}`);

async function main() {
  if (!process.env.DATABASE_URL) {
    log('DATABASE_URL belum diatur; migrasi SQL dilewati.');
    process.exit(2);
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _loose_sql_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT filename, checksum FROM _loose_sql_migrations');
    const recorded = new Map(rows.map((r) => [r.filename, r.checksum]));

    let applied = 0;
    let adopted = 0;
    const failed = [];
    for (const file of files) {
      const sql = readFileSync(join(DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (recorded.get(file) === checksum) continue;

      const record = () =>
        client.query(
          `INSERT INTO _loose_sql_migrations (filename, checksum) VALUES ($1, $2)
           ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`,
          [file, checksum],
        );
      try {
        await client.query(sql);
        await record();
        applied += 1;
        log(`${recorded.has(file) ? 'dijalankan ulang (isi berubah)' : 'dijalankan'}: ${file}`);
      } catch (error) {
        // A file with its own BEGIN leaves the session in an aborted transaction; clear it.
        await client.query('ROLLBACK').catch(() => {});
        if (ALREADY_APPLIED_CODES.has(error.code)) {
          await record();
          adopted += 1;
          log(`sudah ada sebelumnya, dicatat: ${file}`);
        } else {
          failed.push(file);
          log(`GAGAL: ${file} [${error.code ?? '-'}] ${error.message}`);
        }
      }
    }
    log(`${files.length} file: ${applied} dijalankan, ${adopted} dicatat, ${failed.length} gagal, sisanya sudah tercatat.`);
    if (failed.length > 0) {
      log(`PERIKSA: ${failed.join(', ')}`);
      process.exitCode = 2;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  log(`GAGAL total: ${error.message}`);
  process.exit(2);
});

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_TABLES, DEMO_MASTER_TABLES, KEEP_TABLES } from '../tables';

const PRISMA_DIR = join(__dirname, '../../../../prisma');

/**
 * Every table the app creates: Prisma models (@@map, or the model name when unmapped) plus tables
 * created only by loose SQL migrations and accessed with raw SQL.
 */
function schemaTables(): string[] {
  const schema = readFileSync(join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  const tables = new Set<string>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    tables.add(/@@map\("([^"]+)"\)/.exec(m[2])?.[1] ?? m[1]);
  }
  const migrations = join(PRISMA_DIR, 'migrations');
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql'))) {
    for (const m of readFileSync(join(migrations, file), 'utf8').matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/gi)) tables.add(m[1]);
  }
  return [...tables];
}

describe('demo data table classification', () => {
  const keep = new Set<string>(KEEP_TABLES);
  const data = new Set<string>(DATA_TABLES);

  it('classifies every table exactly once', () => {
    const unclassified = schemaTables().filter((t) => !keep.has(t) && !data.has(t));
    expect(unclassified, 'add new tables to KEEP_TABLES or DATA_TABLES in services/demoData/tables.ts').toEqual([]);
    expect([...keep].filter((t) => data.has(t))).toEqual([]);
  });

  it('only lists real tables', () => {
    const real = new Set([...schemaTables(), '_loose_sql_migrations', '_prisma_migrations']);
    expect([...keep, ...data].filter((t) => !real.has(t))).toEqual([]);
  });

  it('deletes demo masters only from kept tables', () => {
    expect(DEMO_MASTER_TABLES.filter((t) => !keep.has(t))).toEqual([]);
  });
});

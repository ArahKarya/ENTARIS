import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guard kerahasiaan: engine agen di balik AIRA adalah rahasia dagang ENTARIS/AIRA, jadi namanya
 * (dan komponen internal engine) tidak boleh muncul di berkas apa pun yang dilacak git. Gunakan
 * istilah netral: "engine AIRA", "klien MCP", "agen AIRA".
 *
 * Kata terlarang sengaja dirakit dari potongan agar berkas ini sendiri tidak memuatnya.
 */
const join = (...parts: string[]): string => parts.join('');
const FORBIDDEN = new RegExp(
  [join('her', 'mes'), join('hon', 'cho'), join('9', 'router'), join('nous', '\\s+', 'research')].join('|'),
  'i',
);
// Nama paket npm pihak ketiga yang ditarik plugin eslint (bukan teks kita): hanya di lockfile klien dan situs.
const PKG = join('her', 'mes', '-(?:estree|parser)');
const LOCKFILES = ['client/package-lock.json', 'website/package-lock.json'];
const LOCKFILE_ALLOWED = [
  new RegExp(`^\\s*"${PKG}": "[^"]+",?$`), // entri dependencies
  new RegExp(`^\\s*"node_modules/${PKG}": \\{$`), // kunci paket
  new RegExp(`"resolved": "https://registry\\.npmjs\\.org/${PKG}/-/${PKG}-[\\d.]+\\.tgz",?$`), // URL tarball
];
// Migrasi Prisma yang sudah ter-apply tidak boleh diubah (checksum). Nilai DEFAULT kolom provider
// di migrasi awal tool-layer adalah satu-satunya jejak; hanya baris DEFAULT itu yang diizinkan.
const MIGRATION = 'server/prisma/migrations/20260624113825_add_aira_tool_layer/migration.sql';
const MIGRATION_ALLOWED = [/^\s*"provider" TEXT NOT NULL DEFAULT '[^']*',?$/];

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.gz', '.mp4', '.mp3',
]);

const repoRoot = (): string => {
  const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' });
  return out.trim();
};

const trackedFiles = (root: string): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);

function isAllowed(file: string, line: string): boolean {
  if (LOCKFILES.includes(file)) return LOCKFILE_ALLOWED.some((re) => re.test(line));
  if (file === MIGRATION) return MIGRATION_ALLOWED.some((re) => re.test(line));
  return false;
}

describe('guard: nama engine AIRA tidak boleh ada di repo', () => {
  it('berkas terlacak tidak memuat nama engine / komponen internalnya (selain allowlist)', () => {
    const root = repoRoot();
    const violations: string[] = [];
    for (const file of trackedFiles(root)) {
      if (BINARY_EXT.has(path.extname(file).toLowerCase())) continue;
      let buf: Buffer;
      try {
        buf = readFileSync(path.join(root, file));
      } catch {
        continue; // berkas terlacak yang dihapus di working tree
      }
      if (buf.includes(0)) continue; // biner
      if (FORBIDDEN.test(file)) violations.push(`${file}: (nama berkas)`);
      buf
        .toString('utf8')
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (FORBIDDEN.test(line) && !isAllowed(file, line)) violations.push(`${file}:${i + 1}`);
        });
    }
    expect(violations, `Nama engine terlarang ditemukan:\n${violations.join('\n')}`).toEqual([]);
  });

  it('allowlist lockfile hanya mengizinkan nama paket pihak ketiga', () => {
    expect(LOCKFILE_ALLOWED.some((re) => re.test(`        "${join('her', 'mes')}-parser": "^0.25.1",`))).toBe(true);
    expect(LOCKFILE_ALLOWED.some((re) => re.test(`// ${join('Her', 'mes')} Agent`))).toBe(false);
  });
});

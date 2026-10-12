#!/usr/bin/env node
/**
 * Single-source version tool. SOURCE OF TRUTH = APP_VERSION in client/src/lib/version.ts.
 *
 * Usage:
 *   node scripts/bump-version.js patch|minor|major   # bump from current version
 *   node scripts/bump-version.js 4.1.0               # set an explicit version
 *   node scripts/bump-version.js --check             # verify everything is in sync (CI), exit 1 if not
 *   node scripts/bump-version.js --check --tag v4.0.0  # additionally require the tag to equal APP_VERSION
 *   node scripts/bump-version.js --notes 4.0.0       # print the CHANGELOG.md section for a version (release notes)
 *
 * Bump updates: version.ts (APP_VERSION + APP_BUILD_DATE), server/client package.json AND package-lock.json.
 * It does NOT write changelog text: add the CHANGELOG.md section, the CHANGELOG entry in version.ts and
 * its English twin in changelog.en.ts by hand (changelog.test.ts enforces the EN twin).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'client/src/lib/version.ts');
const CHANGELOG_MD = path.join(ROOT, 'CHANGELOG.md');
const PKGS = ['server', 'client'].map((d) => ({
  pkg: path.join(ROOT, d, 'package.json'),
  lock: path.join(ROOT, d, 'package-lock.json'),
}));

const SEMVER = /^\d+\.\d+\.\d+$/;
const read = (p) => fs.readFileSync(p, 'utf-8');
const readJson = (p) => JSON.parse(read(p));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf-8');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function currentVersion() {
  const m = read(VERSION_FILE).match(/APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (!m) fail('Could not parse APP_VERSION from client/src/lib/version.ts');
  return m[1];
}

/** Local calendar date (the project works in WIB), not UTC. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function changelogSection(version) {
  const lines = read(CHANGELOG_MD).split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## ['));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

function check(tag) {
  const v = currentVersion();
  const problems = [];
  const rel = (p) => path.relative(ROOT, p);

  for (const { pkg, lock } of PKGS) {
    const pj = readJson(pkg);
    if (pj.version !== v) problems.push(`${rel(pkg)} = ${pj.version} (expected ${v})`);
    const lj = readJson(lock);
    if (lj.version !== v) problems.push(`${rel(lock)} version = ${lj.version} (expected ${v})`);
    const rootPkg = lj.packages && lj.packages[''];
    if (rootPkg && rootPkg.version !== v) problems.push(`${rel(lock)} packages[""] = ${rootPkg.version} (expected ${v})`);
  }

  const first = read(VERSION_FILE).match(/export const CHANGELOG[^=]*=\s*\[\s*\{\s*version:\s*['"]([^'"]+)['"]/);
  if (!first) problems.push('version.ts: cannot find first CHANGELOG entry');
  else if (first[1] !== v) problems.push(`version.ts: first CHANGELOG entry = ${first[1]} (expected ${v})`);

  const md = read(CHANGELOG_MD).match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!md) problems.push('CHANGELOG.md: no released section found');
  else if (md[1] !== v) problems.push(`CHANGELOG.md: newest released section = ${md[1]} (expected ${v})`);

  if (tag && tag.replace(/^v/, '') !== v) problems.push(`tag ${tag} does not match APP_VERSION ${v}`);

  if (problems.length) {
    console.error(`Version out of sync (APP_VERSION = ${v}):`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log(`Version in sync: v${v}`);
}

function bump(arg) {
  const cur = currentVersion();
  const [major, minor, patch] = cur.split('.').map(Number);
  let next;
  if (arg && SEMVER.test(arg)) next = arg;
  else if (arg === 'major') next = `${major + 1}.0.0`;
  else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
  else if (arg === 'patch' || !arg) next = `${major}.${minor}.${patch + 1}`;
  else fail(`Unknown argument: ${arg}. Use major|minor|patch|X.Y.Z|--check|--notes X.Y.Z`);

  const date = today();
  const updated = read(VERSION_FILE)
    .replace(/APP_VERSION\s*=\s*['"][^'"]+['"]/, `APP_VERSION = '${next}'`)
    .replace(/APP_BUILD_DATE\s*=\s*['"][^'"]+['"]/, `APP_BUILD_DATE = '${date}'`);
  fs.writeFileSync(VERSION_FILE, updated, 'utf-8');
  console.log(`version.ts: ${cur} -> ${next} (build date ${date})`);

  for (const { pkg, lock } of PKGS) {
    const pj = readJson(pkg);
    pj.version = next;
    writeJson(pkg, pj);
    const lj = readJson(lock);
    lj.version = next;
    if (lj.packages && lj.packages['']) lj.packages[''].version = next;
    writeJson(lock, lj);
    console.log(`${path.relative(ROOT, pkg)} + lockfile -> ${next}`);
  }
  console.log(`\nVersion set to v${next}. Next: add the ${next} sections in CHANGELOG.md, version.ts CHANGELOG and changelog.en.ts, then run --check.`);
}

const args = process.argv.slice(2);
if (args[0] === '--check') {
  const i = args.indexOf('--tag');
  check(i !== -1 ? args[i + 1] : undefined);
} else if (args[0] === '--notes') {
  const v = (args[1] || '').replace(/^v/, '');
  const s = SEMVER.test(v) ? changelogSection(v) : null;
  if (!s) fail(`No CHANGELOG.md section for "${args[1]}"`);
  process.stdout.write(s + '\n');
} else {
  bump(args[0]);
}

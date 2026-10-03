/*
 * Rewrites `color-mix(in oklch, …)` to `color-mix(in oklab, …)` in the ported design system CSS.
 *
 * Why: site.css registers its palette tokens as `<color>`, so Chrome computes them to lab().
 * Converting a near-neutral lab colour to oklch yields a powerless hue (`none`) while keeping a
 * small chroma; mixed with `transparent`/white the result renders at hue 0 — a pink tint on every
 * Entaris cool-neutral surface and border. oklab has no hue channel, so neutrals stay neutral and
 * chromatic mixes render the same.
 *
 * Usage: node scripts/fix-color-mix.mjs [files…] (defaults to every CSS file under src/app)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERN = /(color-mix\(\s*)in oklch(\s*,)/g;

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

const files = process.argv.length > 2 ? process.argv.slice(2) : cssFiles("src/app");
let total = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  let count = 0;
  const next = source.replace(PATTERN, (_, open, comma) => {
    count++;
    return `${open}in oklab${comma}`;
  });
  if (count) {
    writeFileSync(file, next);
    console.log(`${file}: ${count}`);
    total += count;
  }
}
console.log(`rewrote ${total} color-mix(in oklch) → in oklab`);

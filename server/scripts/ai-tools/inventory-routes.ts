// CLI: enumerasi SEMUA route API (statis, tanpa server/DB) -> scripts/ai-tools/out/route-inventory.json.
// Jalankan: npm run ai-tools:inventory
import fs from 'node:fs';
import path from 'node:path';
import { buildRouteInventory } from '../../src/ai/catalog/inventoryRoutes';

const routes = buildRouteInventory();
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'route-inventory.json');
fs.writeFileSync(outFile, `${JSON.stringify(routes, null, 2)}\n`);

const byTop = new Map<string, number>();
for (const r of routes) {
  const seg = r.path.split('/').slice(0, 3).join('/');
  byTop.set(seg, (byTop.get(seg) ?? 0) + 1);
}
const publicCount = routes.filter((r) => r.auth === 'public').length;
console.log(`Route terinventaris: ${routes.length} (publik/tanpa auth: ${publicCount})`);
for (const [k, v] of [...byTop].sort()) console.log(`  ${k.padEnd(36)} ${v}`);
console.log(`Output: ${path.relative(process.cwd(), outFile)}`);

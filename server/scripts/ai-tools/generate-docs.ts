// CLI: bangkitkan docs/ai-tools/ dari registry (+ inventori, panduan, denylist). Idempoten.
//   npm run ai-tools:docs            tulis file
//   npm run ai-tools:docs -- --check keluar 1 bila docs basi (dipakai ai-tools:check)
import { diffDocs, generateDocs, loadGeneratorInput, writeDocs } from '../../src/ai/catalog/docsGenerator';

const files = generateDocs(loadGeneratorInput());
if (process.argv.includes('--check')) {
  const stale = diffDocs(files);
  if (stale.length) {
    console.error(`docs/ai-tools basi (${stale.length} file): ${stale.join(', ')}\nJalankan: npm run ai-tools:docs`);
    process.exit(1);
  }
  console.log(`docs/ai-tools mutakhir (${Object.keys(files).length} file).`);
} else {
  const changed = writeDocs(files);
  console.log(`Dibangkitkan ${Object.keys(files).length} file; berubah: ${changed.length}${changed.length ? ` (${changed.join(', ')})` : ''}`);
}

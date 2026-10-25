import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Bundel SSR templat PDF untuk server (CommonJS, satu berkas). @react-pdf/renderer & react TIDAK dibundel.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    ssr: 'src/pdf-server/entry.tsx',
    outDir: 'pdf-dist',
    emptyOutDir: true,
    copyPublicDir: false,
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'pdf.cjs' } },
  },
  ssr: { noExternal: [/^(?!@react-pdf|react$|react\/|react-dom).*/], external: ['@react-pdf/renderer', 'react', 'react-dom'] },
});

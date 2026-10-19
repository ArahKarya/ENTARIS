import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico', 'favicon.png', 'favicon-16.png', 'favicon-32.png',
        'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png',
        'pwa-maskable-512x512.png', 'app-icon-master.svg', 'mask-icon.svg',
      ],
      manifest: {
        name: 'Entaris',
        short_name: 'Entaris',
        description: 'Entaris — Agentic Reasoning System: penjualan, pembelian, inventori & keuangan dengan agen AI',
        theme_color: '#1B2B48',
        background_color: '#fafafb',
        display: 'standalone',
        orientation: 'any',
        start_url: '/dashboard',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Page chunks are code-split; the largest vendor chunk (PDF engine) is ~2 MiB, so 3 MiB leaves margin
        // and a regression back to a monolithic bundle fails the build instead of silently skipping precache.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            // Never cache auth or AI config responses (may carry credentials).
            urlPattern: /^https?:\/\/[^/]+\/api\/(?!ai\/|auth\/).*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: heavy libraries load only with the pages that import them.
        manualChunks(id: string) {
          if (id.includes('commonjsHelpers') || id.includes('commonjs-dynamic')) return 'vendor-react';
          if (!id.includes('node_modules')) return undefined;
          const pkg = id.split('node_modules/').pop()!.split('/');
          const name = pkg[0].startsWith('@') ? `${pkg[0]}/${pkg[1]}` : pkg[0];
          if (/^(@react-pdf|pdf-lib|@pdf-lib|fontkit|@swc|pako|unicode-|linebreak|yoga|restructure|brotli|png-js|jay-peg|crypto-js|hsl-to-hex|media-engine|queue|vite-compat|bidi-js|hyphen|svg-arc|color-string|abs-svg-path|parse-svg-path|normalize-svg-path|base64-js|dfa|tiny-inflate|cross-fetch|@babel)/.test(name)) return 'vendor-pdf';
          if (/^(recharts|victory-vendor|d3-.*|internmap|decimal\.js-light)$/.test(name)) return 'vendor-charts';
          if (/^(react|react-dom|scheduler|react-router|react-router-dom|react-is|cookie|set-cookie-parser|turbo-stream)$/.test(name)) return 'vendor-react';
          if (name === 'use-sync-external-store' || name === 'clsx' || name === 'tailwind-merge' || name === 'class-variance-authority') return 'vendor-react';
          if (name.startsWith('@tanstack/')) return 'vendor-tanstack';
          if (name.startsWith('@radix-ui/') || name === '@base-ui/react' || name === 'cmdk' || name.startsWith('@floating-ui/') || name === 'aria-hidden' || name === 'react-remove-scroll' || name === 'react-remove-scroll-bar' || name === 'react-style-singleton' || name === 'use-callback-ref' || name === 'use-sidecar' || name === 'get-nonce' || name === 'sonner') return 'vendor-ui';
          if (name === 'date-fns' || name === 'react-day-picker' || name === '@date-fns/tz') return 'vendor-date';
          if (name === 'lucide-react') return 'vendor-icons';
          if (name === 'react-hook-form' || name === '@hookform/resolvers') return 'vendor-forms';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Dev mode: proxy /api dan file unggahan (/uploads) ke backend lokal
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

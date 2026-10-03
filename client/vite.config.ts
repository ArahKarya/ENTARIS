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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
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

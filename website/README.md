# Website Entaris

Website pemasaran Entaris — *Agentic Reasoning System* (PT Arah Karya Sinergi). Aplikasi Next.js 16
mandiri, terpisah dari aplikasi ERP (`client/`, `server/`).

| Rute | Isi |
|---|---|
| `/` | Beranda — hero, katalog modul, kenapa Entaris |
| `/aira` | AIRA — agen AI, alur draf → approval, keamanan |
| `/self-hosted` | Self-hosted — arsitektur Docker Compose, kontrol, opsi deploy |

## Menjalankan

```bash
cd website
npm install
npm run dev      # http://localhost:3100
npm run check    # lint + typecheck + build
```

Build produksi memakai `output: "standalone"` (`npm run build && node .next/standalone/server.js`).

## Desain

Sistem desain diporting dari situs ERP•AI (erpai.studio):

- `src/app/site.css` — CSS hasil kompilasi, di-scope ke `.erp-root`. **Jangan diedit manual.**
- `src/app/entaris-theme.css` — memetakan token dasar (beige/ink/oranye) ke palet Entaris
  (navy `#1B2B48`, biru `#3D8BE0`; lihat `docs/brand/entaris/README.md`). Layer `entaris` dideklarasikan
  terakhir sehingga menang atas semua layer `site.css`.
- `src/app/site-chrome.css` + `src/components/site/` — nav, footer, logo, tombol milik Entaris.
- `src/components/erp/` — section yang diporting lalu ditulis ulang dengan konten Entaris.
  Markup mempertahankan nama class asli agar gaya dari `site.css` tetap berlaku.
- Aset (font, gambar) di `public/assets/`, logo Entaris di `public/brand/`.

CSS tambahan per halaman ditulis di dalam `@layer entaris { … }` dengan selector diawali `.erp-root`.

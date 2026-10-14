# Website Entaris

Website pemasaran Entaris: *Agentic Reasoning System* (PT Arah Karya Sinergi). Ditujukan untuk calon customer:
jangan menampilkan istilah teknis (Docker, database, port, stack, nama protokol keamanan) di halaman. Aplikasi Next.js 16
mandiri, terpisah dari aplikasi ERP (`client/`, `server/`).

| Rute | Menu | Isi |
|---|---|---|
| `/` | (logo) | Hero, modul pilihan, Cocok untuk, ajakan menghubungi CP |
| `/modul` | Modul | Katalog 29 modul dengan pencarian dan filter |
| `/aira` | AIRA | Agen AI: tanya data, analitik, draf & persetujuan, keamanan |
| `/migrasi`, `/integrasi`, `/docs` | (footer) | Pindah ke Entaris, integrasi yang tersedia, dokumentasi teknis |
| `/impact` | (tidak di menu) | Contoh industri, perusahaan pengguna, kutipan: **masih data dummy**, lihat bawah |
| `/keamanan`, `/self-hosted` | (tidak di menu) | Dialihkan ke bagian Keamanan di halaman AIRA (`/aira#keamanan`) |
| `/minta-demo` | (tidak di menu) | Dialihkan ke Beranda. Tombol *Hubungi CP* membuka WhatsApp langsung |

## Menjalankan

```bash
cd website
npm install
npm run dev      # http://localhost:3100
npm run test     # unit test (vitest)
npm run check    # lint + typecheck + test + build
```

Build produksi memakai `output: "standalone"` (`npm run build && node .next/standalone/server.js`).

## Desain

Sistem desain diporting dari situs ERP•AI (erpai.studio):

- `src/app/site.css`: CSS hasil kompilasi, di-scope ke `.erp-root`. **Jangan diedit manual.**
- `src/app/entaris-theme.css`: memetakan token dasar (beige/ink/oranye) ke palet Entaris
  (navy `#1B2B48`, biru `#3D8BE0`; lihat `docs/brand/entaris/README.md`). Layer `entaris` dideklarasikan
  terakhir sehingga menang atas semua layer `site.css`.
- `src/app/site-chrome.css` + `src/components/site/`: nav, footer, logo, tombol milik Entaris.
- `src/components/erp/`: section yang diporting lalu ditulis ulang dengan konten Entaris.
  Markup mempertahankan nama class asli agar gaya dari `site.css` tetap berlaku.
- Aset (font, gambar) di `public/assets/`, logo Entaris di `public/brand/`.

Campuran warna ditulis `color-mix(in oklab, …)`, bukan `in oklch`: token `site.css` dihitung Chrome sebagai `lab()`, dan
warna netral yang dikonversi ke oklch mendapat hue `none` yang dirender sebagai pink. Kalau `site.css` diregenerasi,
periksa dan ganti `in oklch` di sana dengan tangan.

CSS tambahan per halaman ditulis di dalam `@layer entaris { … }` dengan selector diawali `.erp-root`.

## Hal yang perlu diisi / dikonfirmasi

- **Impact (`/impact`)**: semua nama perusahaan, logo, angka, dan kutipan di `src/components/pages/impact/impactContent.ts`
  adalah data dummy. Selama `IMPACT_IS_PLACEHOLDER = true`, halaman menampilkan strip "Contoh tampilan". Ganti dengan
  data asli yang sudah diizinkan pengguna, lalu set ke `false`.
- **Minta demo**: situs ini statis tanpa server, jadi isian formulir tidak disimpan; data baru terkirim saat pengunjung
  menekan tombol WhatsApp/Email dengan ringkasan yang sudah terisi. Kontak ada di `src/components/site/siteConfig.ts`.
- **Integrasi**: hanya fitur yang ada di README produk yang ditulis "tersedia"; sisanya "sesuai kebutuhan".

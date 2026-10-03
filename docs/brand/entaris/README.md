# Entaris — Panduan Merek

**Entaris** — *Enterprise Agentic Reasoning Integrated System*. Dibaca **en-TA-ris**.
Tagline: **Agentic Reasoning System**.

ERP dengan pembukuan double-entry sebagai fondasi dan agen AI (**AIRA**) yang bernalar di atas data transaksi. Produk **PT Arah Karya Sinergi** (Arah).

| Peran | Nama |
|---|---|
| Produk | Entaris |
| Agen AI di dalam produk | AIRA |
| Pembuat | Arah · PT Arah Karya Sinergi |

## Penulisan nama

- Di kalimat: **Entaris** (huruf besar di awal saja).
- Di wordmark: **ENTARIS** huruf kapital, dengan **TA** berwarna biru dan sisanya navy.
- Tagline: **Agentic Reasoning System**. Alternatif pendek: *Agentic ERP*.
- Pengenal teknis lama (`simple-erp` di kontrak AIRA, nama proses pm2, nama repo) tidak ikut diganti agar integrasi dan deploy yang berjalan tidak putus.

## Logo — "Cincin E"

Cincin tebal yang membentuk huruf **E** bulat, dengan inti di tengah:

- **Busur biru** di kiri = punggung E, sistem yang menopang.
- **Tiga segmen navy** di kanan: atas, kanan, dan busur bawah yang memeluk inti. Segmen kanan memuat **huruf E** yang dicap, lengannya terbuka ke tepi luar.
- **Inti biru** di tengah = pusat penalaran (AIRA).

Logo hanya dua warna rata — tanpa gradien, bayangan, atau ilustrasi — agar bisa dicetak satu warna dan tetap jelas di ukuran kecil.

| File | Pakai untuk |
|---|---|
| `entaris-mark.svg` | Simbol berwarna di latar terang |
| `entaris-mark-negative.svg` | Simbol di latar gelap (navy) |
| `entaris-mark-mono.svg` | Satu warna: Safari pinned tab, stempel, cetak 1 warna |
| `entaris-icon.svg` | Ikon aplikasi & favicon (tile putih sudut membulat) |
| `entaris-icon-dark.svg` | Ikon aplikasi versi gelap (tile navy) |
| `entaris-icon-maskable.svg` | PWA maskable & apple-touch-icon (persegi penuh; OS memberi masker sendiri) |

Turunan PNG/ICO ada di `client/public/` (favicon, apple-touch, pwa-192/512, pwa-maskable-512).

### Geometri (kanvas 512)

- Cincin: jari-jari luar 230, dalam 148, berpusat di (256, 256).
- Busur biru 112°–278° (searah jarum jam, 0° = arah kanan). Celah antar-segmen ±8°.
- Segmen navy: atas 288°–329°; kanan 336°–382° (dalam 118); bawah 30°–106° (dalam 126).
- Huruf E di segmen kanan: punggung x 408–430, tinggi y 204–308, tebal lengan 21.
- Inti: lingkaran r = 88.
- Ruang bebas minimal = setengah tebal cincin (≈ 40) di semua sisi.
- Ukuran minimum simbol: 24 px; di 16 px yang terbaca hanya siluet cincin + inti, dan itu cukup untuk favicon.

## Warna

| Token | Hex | Peran |
|---|---|---|
| Navy | `#1B2B48` | Segmen kanan, teks wordmark, `theme-color` |
| Biru | `#3D8BE0` | Busur kiri, inti, "TA" di wordmark |
| Biru gelap | `#2F6FC4` | Tombol & tautan (teks putih di atasnya) |
| Biru terang | `#5AA2EA` | Simbol di latar gelap |
| Putih | `#FFFFFF` | Latar & segmen versi negatif |

Kontras (WCAG): Navy di atas putih 14,1 : 1 · teks putih di atas Biru gelap 5,0 : 1 · Biru `#3D8BE0` di atas putih 3,5 : 1 — cukup untuk bentuk & teks besar (wordmark), **tidak** untuk teks kecil.

## Tipografi

- Wordmark & judul: **Plus Jakarta Sans** (Google Fonts, buatan Indonesia) — Bold 700 untuk ENTARIS, Medium 500 untuk tagline.
- Teks aplikasi tetap memakai font UI yang sudah ada.

## Jangan

- Menambah gradien, kilau, bayangan, atau ilustrasi (otak, sirkuit) ke dalam simbol.
- Memutar, meregangkan, atau mengubah susunan segmen.
- Memakai simbol berwarna di latar gelap — gunakan `entaris-mark-negative.svg`.
- Menulis "Simple ERP" atau "ERP PMD" untuk produk ini.

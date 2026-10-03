# Entaris — Panduan Merek

**Entaris** — *Enterprise Agentic Reasoning Integrated System*. Dibaca **en-TA-ris**.

ERP dengan pembukuan double-entry sebagai fondasi dan agen AI (**AIRA**) yang bernalar di atas data transaksi. Produk **PT Arah Karya Sinergi** (Arah).

| Peran | Nama |
|---|---|
| Produk | Entaris |
| Agen AI di dalam produk | AIRA |
| Pembuat | Arah · PT Arah Karya Sinergi |

## Penulisan nama

- Di kalimat: **Entaris** (huruf besar di awal saja). Bukan "ENTARIS", "EntarIS", atau "Entaris ERP".
- Tagline utama: **Entaris — Agentic ERP**. Alternatif: *The Reasoning ERP*.
- Kepanjangan cukup di halaman Tentang/dokumentasi, tidak di logo atau judul aplikasi.
- Pengenal teknis lama (`simple-erp` di kontrak AIRA, nama proses pm2, nama repo) tidak ikut diganti agar integrasi dan deploy yang berjalan tidak putus.

## Logo

Huruf **E** dari tiga bilah — baris buku besar dan modul ERP yang terintegrasi — dengan **titik Gabah** di ujung bilah tengah: agen yang bernalar dan bertindak di atas data. Titik emas meneruskan aksen ikon versi sebelumnya.

| File | Pakai untuk |
|---|---|
| `entaris-icon.svg` | Ikon aplikasi utama (tile sudut membulat) |
| `entaris-icon-maskable.svg` | PWA maskable & apple-touch-icon (persegi penuh; OS memberi masker sendiri) |
| `entaris-favicon-16.svg` | Favicon 16/32 px — digambar pas grid piksel |
| `entaris-glyph.svg` | Glyph tanpa tile, di latar terang |
| `entaris-glyph-negative.svg` | Glyph tanpa tile, di latar gelap |
| `entaris-glyph-mono.svg` | Satu warna: Safari pinned tab, cetak 1 warna, stempel |

Turunan PNG/ICO ada di `client/public/` (favicon, apple-touch, pwa-192/512, pwa-maskable-512).

### Geometri (kanvas 512)

- Tile 512 × 512, radius sudut 112 (≈ 22%).
- E: 232 × 264, tebal bilah 56, jarak antar-bilah 48, terpusat optis di (256, 256).
- Bilah tengah 144 (lebih pendek); titik r = 36 di (336, 256), tepi kanannya sejajar ujung bilah atas/bawah.
- Ruang bebas minimal = tebal bilah (56) di semua sisi tile.
- Ukuran minimum: 16 px (pakai `entaris-favicon-16.svg`), 24 px untuk varian lain.

## Warna

Turunan sistem warna Arah "Ladang Pastel": Entaris memakai keluarga **Langit** (unit software) dengan aksen **Gabah** (aksen merek Arah).

| Token | Hex | Peran |
|---|---|---|
| Langit 800 | `#1F5F74` | Warna utama: tile, `theme-color`, teks tegas |
| Langit 400 | `#7DC4DA` | Bentuk & ilustrasi |
| Langit 100 | `#CFE8F1` | Latar lembut |
| Gabah 400 | `#EDBE45` | Titik agen / aksen — jangan untuk teks di latar terang |
| Krem | `#FBF3D8` | Glyph di atas Langit 800; latar hangat |
| Kertas | `#FFFCF4` | Latar halaman |
| Tanah | `#1F2A1C` | Teks utama |
| Sekam | `#6B6656` | Teks sekunder |

Kontras (WCAG): Krem di atas Langit 800 ≈ 6,4 : 1 · Langit 800 di atas Kertas ≈ 7,0 : 1 · Gabah di atas Langit 800 ≈ 4,1 : 1 (cukup untuk bentuk/ikon, bukan teks kecil).

## Jangan

- Memutar, meregangkan, atau memberi bayangan/gradien pada logo.
- Mengganti warna titik selain Gabah (kecuali versi mono).
- Memakai glyph berwarna Langit di atas latar gelap — gunakan `entaris-glyph-negative.svg`.
- Menulis "Simple ERP" atau "ERP PMD" untuk produk ini.

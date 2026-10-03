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
- Di wordmark: **ENTARIS** huruf kapital lebar, dengan **TA** berwarna biru dan sisanya navy.
- Tagline: **Agentic Reasoning System**. Alternatif pendek: *Agentic ERP*.
- Pengenal teknis lama (`simple-erp` di kontrak AIRA, nama proses pm2, nama repo) tidak ikut diganti agar integrasi dan deploy yang berjalan tidak putus.

## Logo — "Anyaman ∇"

Tiga bilah yang saling menindih membentuk **segitiga terbalik (∇)**:

- **Tiga bilah** = tiga pilar operasi (penjualan, pembelian, keuangan) yang dianyam menjadi satu sistem terintegrasi; tiap bilah lewat di atas bilah berikutnya, tidak ada yang lepas.
- **∇ (nabla)** = simbol gradien dalam matematika — dasar cara model AI belajar dan menalar. Mewakili *Agentic Reasoning*.
- **Tiga nada biru** memberi kesan anyaman berlapis tanpa gradien atau bayangan.

Logo rata (tanpa gradien, kilau, atau ilustrasi) agar bisa dicetak satu warna dan tetap jelas di 16 px.

| File | Pakai untuk |
|---|---|
| `entaris-mark.svg` | Simbol berwarna di latar terang |
| `entaris-mark-negative.svg` | Simbol di latar gelap (navy/hitam) |
| `entaris-mark-mono.svg` | Satu warna: Safari pinned tab, stempel, cetak 1 warna |
| `entaris-icon.svg` | **Ikon aplikasi & favicon utama** (tile navy sudut membulat) |
| `entaris-icon-light.svg` | Ikon aplikasi versi terang (tile putih) |
| `entaris-icon-maskable.svg` | PWA maskable & apple-touch-icon (persegi penuh navy; OS memberi masker sendiri) |

Turunan PNG/ICO ada di `client/public/` (favicon, apple-touch, pwa-192/512, pwa-maskable-512).

### Geometri (kanvas 512)

- Segitiga sama sisi menunjuk ke bawah, sisi 440, berpusat di (256, 256).
- Tebal bilah 88; celah antar-bilah 14.
- Tiap bilah dimulai di satu sudut dan menyusup di bawah bilah berikutnya (urutan searah jarum jam) — simetri putar 120°.
- Ruang bebas minimal = setengah tebal bilah (44) di semua sisi.
- Ukuran minimum: 16 px (favicon) — bentuk tetap terbaca.

## Warna

| Token | Hex | Peran |
|---|---|---|
| Navy | `#1B2B48` | Bilah gelap, tile ikon, teks wordmark, `theme-color` |
| Biru | `#3D8BE0` | Bilah terang, "TA" di wordmark |
| Biru tengah | `#2E5CA8` | Bilah ketiga di latar terang |
| Biru muda | `#9CC9F5` | Bilah ketiga di latar gelap |
| Biru gelap | `#2F6FC4` | Tombol & tautan (teks putih di atasnya) |
| Putih | `#FFFFFF` | Latar; bilah di versi negatif |

Kontras (WCAG): Navy di atas putih 14,1 : 1 · teks putih di atas Biru gelap 5,0 : 1 · Biru `#3D8BE0` di atas putih 3,5 : 1 — cukup untuk bentuk & teks besar, **tidak** untuk teks kecil.

## Tipografi

- Wordmark: **ENTARIS** — **Archivo** (Google Fonts) ExtraBold 800, lebar 125% (*Extended*), jarak huruf +4%; "TA" biru, sisanya navy (putih di latar gelap).
- Tagline: **AGENTIC REASONING SYSTEM** — Archivo Medium 500, lebar 110%, jarak huruf +18%.
- Archivo juga font merek induk Arah, jadi Entaris tetap satu keluarga dengan Arah.
- Teks aplikasi tetap memakai font UI yang sudah ada.

## Jangan

- Menambah gradien, kilau, bayangan, atau ilustrasi (otak, sirkuit) ke dalam simbol.
- Mengganti tiga nada biru dengan warna di luar palet.
- Memutar (mis. menjadi segitiga tegak), meregangkan, atau mengubah urutan tindihan bilah.
- Memakai simbol berwarna di latar gelap — gunakan `entaris-mark-negative.svg`.
- Memakai nama produk lama (sebelum Entaris) untuk produk ini.

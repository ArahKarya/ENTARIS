# DESIGN.md: ENTARIS

Arah desain aplikasi ENTARIS (ERP). Disusun dari jawaban pemilik produk pada 10 Oktober 2026. Bagian yang ditandai *(usulan)* ditulis oleh agen atas permintaan pemilik dan bisa diubah kapan saja.

Dial: ENERGY 2 / RHYTHM 1 / MOTION diatur pengguna (bawaan 2)

## Identitas

- **Produk:** ERP untuk penjualan, pembelian, persediaan, produksi, dan keuangan dalam satu buku besar.
- **Pengguna:** staf akuntansi, admin gudang, dan admin penjualan yang memakainya setiap hari.
- **Kepribadian:** modern dan percaya diri. Terasa seperti produk SaaS baru, bukan software kantor lama.

## Kepadatan

**Padat.** Tabel dan form harus memuat banyak baris dalam satu layar, karena pekerjaannya adalah entri dan pemeriksaan data harian. Ruang kosong dipakai untuk memisahkan kelompok, bukan untuk mengisi layar.

## Warna

Pertahankan palet navy dan biru yang sudah ada. Sumber nilai: `client/src/index.css`.

| Peran | Terang | Gelap |
|---|---|---|
| Navy merek (sidebar, permukaan merek) | `#1B2B48` | `#0F1A2E` |
| Primer (tombol utama, tautan, fokus) | `#2F6FC4` | `#5B9BE8` |
| Aksen merek / AIRA | `#3D8BE0` | `#6FA8EC` |

Aturan pemakaian:

- Biru hanya untuk hal yang bisa diklik atau sedang dipilih. Jangan dipakai sebagai hiasan.
- Warna status (sukses, peringatan, bahaya) hanya untuk status. Teks memakai token `*-text`, ikon dan isian memakai token dasarnya.
- Tidak ada gradien di dalam aplikasi.

## Huruf

- **Isi:** Inter Variable.
- **Judul:** Plus Jakarta Sans Variable.
- **Angka di tabel:** `tabular-nums` agar kolom rata.
- Penekanan memakai ketebalan atau warna, bukan HURUF KAPITAL. Kapital hanya untuk singkatan (PPN, STT, HPP).

## Bentuk

- **Sudut tajam: 2–4px.** Tombol, input, dan kartu memakai 4px. Elemen kecil seperti checkbox dan badge memakai 2px.
- **Tidak ada bentuk pil (oval)** untuk tombol, tab, chip, atau filter. Bulat penuh hanya untuk avatar dan titik status.

## Ikon *(usulan)*

Pola yang lazim di ERP SaaS:

- Ikon wajib di navigasi sidebar dan di tombol aksi yang sering dipakai (tambah, ekspor, cetak, filter).
- Ikon boleh menemani status dan empty state, asalkan isinya sesuai (truk untuk pengiriman, bukan ikon generik).
- Tidak ada ikon hiasan di judul seksi atau kartu. Tidak ada ikon di dalam kotak berwarna.
- Satu set ikon (lucide), satu ketebalan garis. AIRA memakai ikon AIRA sendiri.

## Gerak

Diatur pengguna di Pengaturan, dengan empat tingkat:

| Tingkat | Isi |
|---|---|
| Tidak ada | Tanpa transisi. |
| Minimalis | Hanya buka/tutup dialog, drawer, dan menu. |
| Halus *(bawaan, usulan)* | Ditambah transisi hover, pergantian tab, dan munculnya baris baru. |
| Terasa hidup | Ditambah angka KPI yang menghitung naik dan grafik yang beranimasi saat dimuat. |

Jika sistem operasi meminta gerak dikurangi (`prefers-reduced-motion`), bawaan menjadi **Tidak ada** sampai pengguna memilih sendiri.

## Dashboard

Pertahankan deretan kartu KPI di bagian atas. Label kartu ditulis biasa (bukan kapital), dan angka adalah elemen paling menonjol di kartu.

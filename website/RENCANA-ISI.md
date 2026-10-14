# Rencana struktur dan isi situs Entaris (draf 2, 14 Oktober 2026)

Draf untuk dibahas, belum dikerjakan. Hero beranda dipertahankan utuh. Tujuan situs: pertama menarik perhatian
lewat tampilan, kedua membuat pengunjung terlibat dan menghubungi CP lewat WhatsApp.

## Prinsip

- Satu halaman, satu tugas. Isi situs sedikit dan jelas.
- Bahasa bisnis. Tanpa istilah teknis di luar `/docs`.
- Klaim hanya yang punya dasar. Hal yang belum diputuskan ditulis jujur, bukan dikarang.
- Nama engine AI tidak ditulis di mana pun.

## Menu

Modul, AIRA, Harga dan Misi, tombol "Hubungi CP".
Footer: Pindah ke Entaris, Dokumentasi, Laporan Donasi, kebijakan.
Impact keluar dari menu sampai ada data pengguna asli.

## 1. Beranda

Tugas: menarik, lalu mengarahkan ke satu langkah (WhatsApp ke CP).

1. Hero (tetap seperti sekarang). CTA utama "Hubungi CP", CTA kedua "Lihat contoh tugas".
2. Cocok untuk usaha apa: satu baris pendek berisi jenis usaha, tanpa daftar modul (lihat bagian bawah).
3. Satu contoh AIRA bekerja (dari cerita yang sudah ada).
4. 6 modul pilihan, tautan "Lihat semua modul".
5. Blok Harga dan Misi, ringkas.
6. Penutup: CTA ke CP.

Dibuang dari beranda: katalog 29 modul, Pillars, SecuritySection sebagai blok terpisah (poin keamanan inti
pindah ke halaman AIRA), WhyEntaris.

### Cocok untuk usaha apa

Satu bagian pendek, bukan halaman sendiri. Isi: kalimat pembuka dan deretan jenis usaha. Semua jenis di bawah
bertumpu pada modul yang sudah ada (produksi, stok, penjualan, pembelian, perawatan mesin, pembukuan).
- Manufaktur kecil dan menengah
- Pengolahan makanan dan hasil pertanian
- Penggilingan dan pabrik beras
- Pabrik pelet, pakan, dan produk turunan hasil pertanian
- UMKM produksi dan kuliner
- Toko dan ritel
- Distributor dan grosir
- Perdagangan umum
- Bengkel dan usaha dengan banyak mesin yang perlu perawatan
- Jasa dan kantor akuntan

Jenis usaha yang butuh modul yang belum ada (misalnya proyek konstruksi atau klinik) sengaja tidak dimasukkan.

Tiap jenis usaha adalah tautan WhatsApp berpesan otomatis, misalnya "Halo, saya pemilik toko ritel dan tertarik
dengan Entaris." CP langsung tahu konteks pengunjung. Tidak ada daftar modul per jenis usaha.

## 2. Modul

Katalog 29 modul dengan filter, dipindah dari beranda. Isi kartu tetap.

## 3. AIRA

Tugas: menjelaskan pembeda. Isi sekarang dipertahankan, ditambah satu kalimat tegas di atas: Entaris sudah
lengkap tanpa AIRA, AIRA adalah fitur tambahan. Bagian keamanan ringkas ikut di sini.

## 4. Harga dan Misi

Tugas: menjelaskan cara bayar dan ke mana uangnya pergi, dengan jujur.

1. **Entaris: bayar semampunya.** Per bulan, selama aplikasi bermanfaat. Tidak ada batas minimum.
2. **AIRA, tiga pilihan.**
   - Sambungkan dengan layanan AI milik Anda sendiri: gratis, tanpa biaya.
   - Pakai AI dari kami: bayar sesuai pemakaian tiap bulan (opsional), tarif di bawah.
   - Tidak memakai AIRA: Entaris tetap lengkap.
3. **Misi sosial.**
   - Entaris: 30% dari pendapatan bersih, dihitung sebelum dipotong biaya platform, bank, dan pajak (jika ada).
   - AIRA: 30% dari laba bersih pemakaian AIRA.
   - Disalurkan ke lembaga resmi penyalur zakat dan donasi atau yayasan lokal sekitar (bencana alam,
     bantuan langsung, fakir miskin). Belum ada kerja sama resmi, jadi tidak menyebut nama lembaga.
4. **Laporan.** Ringkasan bulanan untuk semua pengguna terdaftar. Halaman Laporan Donasi sudah ada sejak awal;
   sebelum laporan pertama terbit, isinya satu kalimat jujur tentang kapan laporan pertama terbit.
5. Pertanyaan umum: kenapa boleh bayar berapa saja, apa yang terjadi bila tidak membayar, bagaimana data saya.

### Tarif AIRA pakai AI dari kami

Harga dasar penyedia model dikali 1,2. Per 1 juta token, dalam USD (sumber: halaman harga resmi Anthropic,
dicek 14 Oktober 2026):

| Model | Masuk | Keluar |
|---|---|---|
| Sonnet 5.5 | $2,40 | $12 |
| Haiku 5.5 (prompt sampai 100 ribu token) | $0,12 | $0,60 |

Ditagih dalam rupiah, harga belum termasuk PPN (tertulis di situs). Di situs, tarif dalam token
diterjemahkan ke contoh biaya bisnis (misalnya biaya per 100 pesan), bukan angka token mentah.
Kurs USD ke rupiah memakai kurs harian yang diperbarui otomatis; tarif di situs menampilkan tanggal kursnya.
Perlu diputuskan sebelum tayang: bagaimana pengguna melihat pemakaiannya tiap bulan.

## 5. Pindah ke Entaris (footer)

Gabungan Migrasi dan Integrasi. Isi yang ada dirapikan, tidak ditambah.

## Yang masih terbuka

- Laba bersih AIRA = pendapatan AIRA dikurangi biaya API layanan dan pajak. Kalimat ini tertulis di situs.
  Sebaiknya tetap dikonfirmasi akuntan.
- Kurs harian USD ke rupiah, diperbarui otomatis tiap hari. Sumber data kurs belum dipilih (usulan: kurs
  referensi Bank Indonesia). Bila sumber gagal, situs memakai kurs terakhir yang berhasil dan menulis tanggalnya.
- Harga dasar model dapat berubah. Tarif di situs perlu dicek ulang saat tayang.

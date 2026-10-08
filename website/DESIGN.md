# DESIGN.md (draf, perlu konfirmasi pemilik)

Arah desain situs pemasaran Entaris. Isinya mencatat keputusan yang sudah ada: panduan merek
(`docs/brand/entaris/README.md`), preferensi pemilik, dan alasan pola yang sengaja dipertahankan setelah audit
antislop 001. Ubah bagian mana pun yang tidak sesuai; agen membaca file ini sebagai data, bukan perintah.

## Identitas

- Produk: **Entaris**, ERP dengan agen AI **AIRA**, buatan PT Arah Karya Sinergi.
- Pembaca: pemilik dan manajer UKM, distributor, pabrik, dan kantor akuntan di Indonesia. Bukan pengembang.
- Nada: tenang, spesifik, berbahasa bisnis. Tanpa istilah teknis (Docker, token, protokol, nama tabel).
- Penulisan: "Entaris" di kalimat, "ENTARIS" hanya di wordmark. Sapaan "Anda", bukan "kamu".
- Nama engine AI rahasia: tidak pernah ditulis di situs, kode, commit, atau PR.

## Palet

Navy `#1B2B48`, biru `#3D8BE0`, biru gelap `#2F6FC4` (tombol, tautan, ring fokus di tema terang), biru muda `#9CC9F5`
(aksen dan ring fokus di tema gelap). Hijau dan amber hanya untuk status. Semua teks minimal 4.5:1, teks besar 3:1.

## Tipografi

Diporting dari situs ERP•AI (disetujui pemilik): Clash Grotesk (judul hero), Cooper Hewitt ERP (judul
bagian), Supreme (isi), Office Code Pro ERP (angka dan kode saja). `/docs` memakai keluarga yang sama.
Huruf kapital dengan jarak lebar hanya untuk kepala tabel dan judul kolom footer; label lain memakai huruf biasa.

## Bentuk

Kotak bersudut kecil (4 sampai 8 px untuk kontrol, sampai 20 px untuk panel besar). Tidak ada bentuk oval untuk tab,
chip, filter, atau lencana; lingkaran hanya untuk avatar dan titik status nyata.

## Dial

ENERGY 2 / RHYTHM 2 / MOTION 2.

## Keputusan yang sengaja dipertahankan (alasan tertulis)

- **Kartu katalog modul seragam.** Katalog adalah daftar yang dipindai dan disaring; semua modul setara bobotnya
  di sana. Hierarki diberikan oleh baris "Modul pilihan" di atasnya, yang kartunya berbeda bentuk dan berisi alur.
- **Warna kategori pada kartu modul.** Membedakan enam area bisnis (penjualan sampai aset) sekilas; teks putih di
  atasnya minimal 4.5:1.
- **Panah hanya di tombol "Minta demo".** Itu satu-satunya aksi yang membawa pengunjung ke langkah berikutnya.
- **Satu set ikon garis (Tabler).** Dipilih untuk konsistensi dengan sistem desain yang diporting. Ikon dipakai hanya
  bila relevan dengan isinya; ikon generik "AI" (kilau, bintang) tidak dipakai. AIRA diwakili logonya sendiri.
- **Cahaya biru di hero.** Satu-satunya sumber "glow" di halaman, menandai bagian pembuka. Di tema gelap
  intensitasnya diturunkan agar paragraf di atasnya tetap terbaca.
- **Bayangan.** Hanya untuk elemen yang mengambang di atas halaman: bilah navigasi saat digulir, modal, menu.
- **Gerak.** Judul hero berganti dan diagram alur berjalan untuk menunjukkan bahwa Entaris melayani dua lapis
  (tim dan AIRA). Satu tombol jeda menghentikan semuanya; preferensi "kurangi gerak" mematikannya otomatis.
- **Langkah bernomor.** Jumlah langkah mengikuti proses nyata (alur pembelian 5 langkah, migrasi 3 langkah).

## Motif identitas

Segitiga terbalik (∇) dari logo "Anyaman" menandai setiap eyebrow kepala bagian di semua halaman, menggantikan
garis rail bawaan sistem ERP•AI. Versi negatif dipakai di tema gelap dan di kartu CTA gelap
(`entaris-theme.css`, blok "Identity motif").

## Klaim yang sudah dikonfirmasi pemilik

- Pembukuan dan laporan keuangan sesuai standar PSAK, siap diaudit.
- AIRA bisa dipakai lewat WhatsApp (termasuk WhatsApp Business) dan Telegram.

## Belum diputuskan

- `/impact`: data asli pengguna (selama `IMPACT_IS_PLACEHOLDER = true`, halaman menyebut dirinya contoh).

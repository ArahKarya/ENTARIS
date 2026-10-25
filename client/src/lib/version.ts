/**
 * Single source of truth untuk versi aplikasi.
 * Update file ini setiap kali release baru, termasuk terjemahan Inggris di changelog.en.ts.
 */
import { CHANGELOG_EN } from './changelog.en';

export const APP_VERSION = '4.2.0';
export const APP_BUILD_DATE = '2026-10-25';
export const APP_NAME = 'Entaris';

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

/** CHANGELOG in the UI language; English falls back to Indonesian for any entry not yet translated. */
export function localizedChangelog(language: string): ChangelogEntry[] {
  if (!language.startsWith('en')) return CHANGELOG;
  return CHANGELOG.map((entry) => {
    const en = CHANGELOG_EN[entry.version];
    return en && en.changes.length === entry.changes.length ? { ...entry, title: en.title, changes: en.changes } : entry;
  });
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.2.0',
    date: '2026-10-25',
    title: 'Proforma Invoice, PDF dan Lampiran untuk AIRA',
    changes: [
      'Proforma Invoice (menu Penjualan): tagihan awal ke customer, dibuat dari Quotation atau Sales Order, dapat dikonversi ke Invoice Penjualan draf; tanpa efek stok, GL, maupun piutang, dan uang muka dicatat lewat Deposit Customer yang ditautkan',
      'AIRA kini bisa mengambil PDF resmi 11 jenis dokumen dan 6 laporan (Laba Rugi, Neraca, Neraca Saldo, Arus Kas, Umur Piutang/Utang, Laporan Harian) lewat tool doc_pdf_get, dengan templat yang sama dengan tombol PDF; tautan unduh berlaku 5 menit dan sekali pakai',
      'AIRA bisa mengunduh dan mengunggah lampiran transaksi untuk 16 jenis dokumen (att_download_link, att_upload); izin dicek ulang saat berkas diunduh',
      'Perbaikan PDF: baris Termin dan No. Ref Pelanggan di Invoice kini tercetak, dan kolom Kode di PDF Produksi tidak lagi menempel ke Nama',
      'Istilah "Rendemen" diganti "Yield" di antarmuka, laporan, dan panduan AIRA',
      'Lisensi menjadi GNU AGPL-3.0-only',
    ],
  },
  {
    version: '4.1.3',
    date: '2026-10-14',
    title: 'Lampiran Pengajuan Pembayaran via AIRA',
    changes: [
      'AIRA kini bisa melampirkan berkas (JPG, PNG, WebP, PDF) ke Pengajuan Pembayaran lewat tool baru payreq_attachment_add, sehingga draf jenis yang wajib lampiran bisa di-submit; berkas diambil dari lampiran panel chat atau dikirim langsung sebagai base64 untuk berkas kecil',
      'Aturan lampiran di antarmuka web tidak berubah (maks. 10 lampiran, 5 MB, jenis diperiksa dari isi berkas)',
    ],
  },
  {
    version: '4.1.2',
    date: '2026-10-13',
    title: 'Perbaikan Tautan STT ke PO',
    changes: [
      'STT yang memilih PO kini otomatis menautkan barisnya ke baris PO dengan item yang sama, sehingga qty diterima PO ikut bertambah; item ganda di PO ditolak dengan pesan jelas',
      'Build image Docker dari awal tidak lagi gagal di tahap build klien',
    ],
  },
  {
    version: '4.1.1',
    date: '2026-10-13',
    title: 'Perbaikan Reset Data',
    changes: [
      'Setelah Reset Data, posting tidak lagi gagal dengan "Referensi data tidak valid" sampai server di-restart',
      'Akun 5.12 Biaya Konversi Dibebankan ke Persediaan dan 6.41 Beban Pajak & Perizinan Kendaraan dibuat ulang setelah Reset Data, sehingga posting pajak kendaraan EAM dan biaya konversi produksi kembali berjalan',
    ],
  },
  {
    version: '4.1.0',
    date: '2026-10-12',
    title: 'Data Uji Coba Lintas Modul dan Alat Rilis',
    changes: [
      'Data Uji Coba di Pengaturan > Cadangan & Pemulihan menggantikan Data Dummy: dokumen dibuat lewat alur aplikasi asli (persetujuan, jurnal, stok, audit trail) di penjualan, pembelian, produksi, persediaan, aset, keuangan, EAM, dan contoh percakapan AIRA',
      'Mode eksklusif: data uji coba hanya bisa dibuat saat belum ada transaksi, dan dihapus seluruhnya dengan mengetik HAPUS tanpa menyentuh pengguna, COA, dan Akun Sistem',
      'Diperbaiki: kartu KPI invoice dan uang muka tidak lagi menampilkan nilai dua kali; retur yang menunggu persetujuan menampilkan perkiraan nilainya, bukan Rp 0',
      'Panel AIRA menjelaskan saat layanan dinonaktifkan administrator dan tidak lagi menampilkan "Belum ada percakapan"',
      'Alat rilis: versi disinkronkan dan dicek otomatis di CI, tag versi menerbitkan GitHub Release dari changelog',
    ],
  },
  {
    version: '4.0.0',
    date: '2026-10-12',
    title: 'AIRA MCP, Panel Chat Baru, dan Antarmuka Dwibahasa',
    changes: [
      'Integrasi AIRA dirombak: Entaris menjadi MCP server (`POST /mcp`, 474 tool, 14 toolset) dengan identitas per-pengguna, tier akses, dan persetujuan manusia untuk aksi berisiko',
      'Panel chat AIRA baru: sesi dan pesan disimpan Entaris (riwayat, pencarian, arsip, ekspor, lampiran), agen dipanggil lewat API kompatibel-OpenAI, kartu hasil dan chip progres tool',
      'Draft Buku Kas dari nota: arah debit/kredit ditentukan deterministik di server, koreksi akun manusia dipelajari, baris mencurigakan ditandai untuk ditinjau',
      'Antarmuka dwibahasa Indonesia/Inggris di seluruh modul, PDF, pesan galat API, dan changelog dalam aplikasi',
      'Migrasi SQL lepas dijalankan otomatis dengan ledger setiap container boot',
      'Diperbaiki: STT dari PO kini mengisi qty dan menambah qty diterima PO; Surat Jalan membawa No. PO pelanggan dan No. SO',
      'BREAKING: env AIRA_CORE_BASE_URL/AIRA_API_TOKEN dan jaringan aira-net dihapus; tabel ai_whitelist dan ai_executed_runs di-drop; wajib set AIRA_ENGINE_URL, AIRA_ENGINE_KEY, AIRA_ENGINE_TURN_SECRET. Backup pg_dump sebelum upgrade',
    ],
  },
  {
    version: '3.19.0',
    date: '2026-10-02',
    title: 'Surat Jalan Sementara, Pembenahan HPP, dan EAM Terintegrasi Keuangan',
    changes: [
      'Surat Jalan Sementara (SJS): tab baru di Penjualan > Surat Jalan untuk barang dikirim sebelum produksi diinput; tanpa stok dan jurnal, ditautkan ke DO resmi',
      'Satu faktur pembelian dapat menagih lebih dari satu STT/BPB; guard WAC menolak STT harga 0 untuk barang milik sendiri',
      'Akun 5.12 Biaya Konversi Dibebankan ke Persediaan dan modal bahan baku murni (WAC2) pada detail produksi',
      'Reversal otomatis penyelesaian HPP saat produksi, faktur pembelian, atau mutasi manual dibatalkan/diedit',
      'Tagihan GA (pajak/STNK/KIR, servis, material request) terintegrasi ke keuangan: jurnal langsung atau faktur pembelian',
      'Logo perusahaan tampil di semua PDF laporan keuangan; halaman Bank & Kas membuka detail jurnal manual',
    ],
  },
  {
    version: '3.18.1',
    date: '2026-07-31',
    title: 'Export PDF Hasil Inspeksi Berkala Kendaraan',
    changes: [
      'Tombol "PDF" di tiap baris riwayat inspeksi kendaraan: unduh hasil satu inspeksi sebagai dokumen PDF siap cetak/arsip',
      'Isi PDF: identitas kendaraan, tanggal & odometer, inspektor, level BBM, hasil keseluruhan, jadwal inspeksi berikutnya, checklist per kategori dengan status berwarna (OK/Perlu Perhatian/Rusak), catatan, dan foto bukti per kategori',
      'Checklist inspeksi format lama tetap ikut tercetak di grup "Checklist (format lama)"',
      'Foto inspeksi kini dimuat dengan pengecekan hak akses. Sebelumnya foto tidak tampil karena tautan langsung ke berkas tidak bisa dibuka',
    ],
  },
  {
    version: '3.18.0',
    date: '2026-07-31',
    title: 'Inspeksi Berkala Kendaraan: Komprehensif',
    changes: [
      'Checklist inspeksi diperluas dari 12 item datar jadi 33 sub-item terkelompok dalam 6 kategori (Mesin & Cairan, Kelistrikan, Rem & Kemudi, Ban & Roda, Keselamatan, Lain-lain) dengan tampilan accordion per kategori',
      'Foto bukti visual per kategori inspeksi (opsional, maks 5 MB/foto), tersimpan & tampil di riwayat inspeksi',
      'Nama inspektor tercatat: pilih dari daftar user atau ketik manual untuk inspektor di luar sistem',
      'Level BBM saat inspeksi (Kosong / Seperempat / Setengah / Tiga Perempat / Penuh)',
      'Jadwal inspeksi berikutnya dihitung otomatis (default 30 hari, interval bisa diubah) + reminder status Terlambat/segera jatuh tempo, pola sama dengan pajak & asuransi',
      'KPI armada baru: Inspeksi Jatuh Tempo (lewat / <30 hari / belum pernah diinspeksi)',
      'Riwayat inspeksi bisa dibuka per baris untuk melihat detail checklist per kategori + foto; data inspeksi format lama tetap terbaca di grup "Checklist (format lama)"',
    ],
  },
  {
    version: '3.17.0',
    date: '2026-07-28',
    title: 'EAM (Enterprise Asset Management): Aplikasi Sendiri, Data Tetap Satu',
    changes: [
      'Modul EAM kini punya aplikasi web sendiri di subdomain EAM, tetap memakai server dan database yang sama dengan ERP',
      'Login SSO: satu akun ERP dipakai untuk EAM lewat shared-cookie cross-subdomain, tidak perlu login ulang',
      'Tampilan login EAM dibedakan dari ERP (palet hijau tosca/emerald, ikon & copy khusus aset/maintenance) supaya tidak tertukar oleh pengguna',
      'Dashboard ringkas EAM: total aset, nilai buku (NBV), work order aktif/overdue, breakdown per kategori aset, quick links ke semua modul',
      'Filter otomatis per modul (mis. klik Kendaraan hanya tampilkan kategori Kendaraan), bisa beberapa kategori sekaligus',
      'Modul GA (General Affairs) di ERP utama tetap aktif dan terhubung real-time ke EAM: data & aksi tersinkron dua arah',
    ],
  },
  {
    version: '3.16.9',
    date: '2026-06-21',
    title: 'Fix: Surat Jalan lama tak muncul + filter "Sudah Diinvoice" kosong',
    changes: [
      'Daftar Surat Jalan dulu hanya memuat 200 terbaru lalu disaring di browser. Surat jalan lama (>200) tidak muncul sama sekali. Kini filter, pencarian, dan halaman diproses di server sehingga semua data terjangkau',
      'Tab "Sudah Diinvoice" sebelumnya selalu kosong (status dibandingkan dengan cara yang salah). Sekarang menampilkan surat jalan yang sudah ditagih dengan benar',
    ],
  },
  {
    version: '3.16.8',
    date: '2026-06-16',
    title: 'Fix: dropdown akun kas/bank kosong saat Terima Uang Muka di SO',
    changes: [
      'Form "Terima Uang Muka" di detail SO: dropdown Kas/Bank tidak muncul karena salah ambil data. Diperbaiki memakai daftar akun yang sama dengan modul lain. Akun 1.1.x kini tampil',
    ],
  },
  {
    version: '3.16.7',
    date: '2026-06-15',
    title: 'Surat Jalan boleh melebihi qty SO (over-delivery)',
    changes: [
      'Generate Surat Jalan dari SO tidak lagi memblokir qty yang melebihi sisa pesanan. Staff bisa kirim lebih dari qty SO (tercatat sebagai "+X lebih" di SO)',
      'Form "Tarik dari SO" kini menampilkan semua baris (termasuk yang sudah terkirim penuh, prefill 0) sehingga bisa dipakai untuk kirim tambahan',
    ],
  },
  {
    version: '3.16.6',
    date: '2026-06-15',
    title: 'SO: qty terkirim selalu ikut angka real Surat Jalan',
    changes: [
      'Qty terkirim SO kini dihitung ulang dari total Surat Jalan aktif yang terkait, bukan ditambah sedikit demi sedikit yang bisa meleset. Kelebihan kirim (+X lebih) tampil benar',
      'Edit Surat Jalan tidak lagi memutus kaitan ke SO: baris otomatis dikaitkan ulang & SO dihitung ulang. Pembatalan SJ juga menghitung ulang dengan cara yang sama',
    ],
  },
  {
    version: '3.16.5',
    date: '2026-06-15',
    title: 'SO: Download PDF gabung lampiran (PNG/PDF)',
    changes: [
      'Tombol Download PDF di detail SO kini menggabungkan file lampiran SO (foto/PDF) ke dalam satu file PDF. Nama file "<SO>_with_lampiran.pdf". Tanpa lampiran tetap unduh PDF SO biasa',
    ],
  },
  {
    version: '3.16.4',
    date: '2026-06-14',
    title: 'SO: Download PDF (lengkap dengan pengiriman & invoice)',
    changes: [
      'Tombol "Download PDF" di detail SO: cetak pesanan penjualan berisi item, ringkasan uang muka, daftar Surat Jalan terkait, dan Invoice terkait dalam satu dokumen',
    ],
  },
  {
    version: '3.16.3',
    date: '2026-06-14',
    title: 'SO: rincian uang muka (Diterima · Terpakai · Sisa)',
    changes: [
      'Panel uang muka di detail SO kini menampilkan DP Terpakai (sudah di-apply ke invoice) & Sisa Uang Muka. Sebelumnya hanya total diterima sehingga seolah tak berkurang',
      'Plus baris Grand Total & Sisa Tagihan dipisah agar jelas',
    ],
  },
  {
    version: '3.16.2',
    date: '2026-06-12',
    title: 'SO: tampilkan kelebihan kirim (lebih dari pesanan)',
    changes: [
      'Detail SO: kolom Sisa kini menampilkan "+X lebih" (biru) bila terkirim melebihi qty pesanan. Sebelumnya hanya centang hijau (kelebihan tersembunyi)',
    ],
  },
  {
    version: '3.16.1',
    date: '2026-06-12',
    title: 'Surat Jalan: Tarik dari SO (kurangi SO otomatis)',
    changes: [
      'Form Surat Jalan kini punya dropdown "Tarik dari Pesanan Penjualan (opsional)": pilih SO → baris terisi dari sisa belum-terkirim',
      'Surat Jalan yang ditarik dari SO otomatis menambah qty terkirim & memperbarui status SO (Sebagian Terkirim/Selesai), lewat alur generate-do yang sudah ada',
      'Tanpa pilih SO: tetap surat jalan bebas seperti biasa (tidak terkait SO)',
    ],
  },
  {
    version: '3.16.0',
    date: '2026-06-12',
    title: 'Surat Jalan Stok Minus via Approval (bukan Admin-only)',
    changes: [
      'Staff bisa tetap membuat Surat Jalan saat stok minus (barang dikirim sambil produksi berjalan), masuk antrian approval, bukan diblok',
      'Manajer menyetujui di tab Approval (detail SJ + alasan stok minus tampil); Surat Jalan baru dibuat setelah disetujui',
      'Pemegang hak "Bypass stok minus" tetap bisa langsung tanpa approval',
    ],
  },
  {
    version: '3.15.7',
    date: '2026-06-12',
    title: 'Surat Jalan: stok yang ditampilkan per gudang terpilih',
    changes: [
      'Picker stok di Surat Jalan kini menampilkan & memvalidasi stok gudang yang dipilih per baris (bukan total semua gudang)',
      'Tiap baris menampilkan "Stok di gudang ini: X"; peringatan kekurangan menyebut nama gudang',
    ],
  },
  {
    version: '3.15.6',
    date: '2026-06-12',
    title: 'Halaman /welcome Didesain Ulang',
    changes: [
      'Desain ulang /welcome: warna navy, tipografi lebih tebal, animasi dikurangi',
      'Visual hero diganti mockup dashboard ERP (UI tiruan: sidebar, KPI, grafik arus kas, status dokumen)',
      'Grid fitur monokrom, section Cara Kerja berlatar gelap, kontras heading diperbaiki',
    ],
  },
  {
    version: '3.15.5',
    date: '2026-06-10',
    title: 'EAM: penyelarasan prefix kode kategori aset',
    changes: [
      'Penomoran kode aset memakai prefix yang konsisten per kategori (KND, MSN, BLD, TNH, ALT, IT, FRN, GDG, EQP); kategori warisan Aset Tetap ikut diselaraskan',
    ],
  },
  {
    version: '3.15.4',
    date: '2026-06-10',
    title: 'Data Produksi: filter pencarian',
    changes: [
      'Kotak pencarian di tab Data Produksi: cari cepat berdasarkan no. produksi, referensi, nama item (input/output), atau catatan',
    ],
  },
  {
    version: '3.15.3',
    date: '2026-06-09',
    title: 'EAM: posisi grup di menu utama dirapikan',
    changes: [
      'Grup EAM · Manajemen Aset dipindah ke antara Akuntansi dan Laporan (tidak lagi nyangkut di bawah Sistem); konsisten di menu & matriks Hak Akses',
    ],
  },
  {
    version: '3.15.2',
    date: '2026-06-09',
    title: 'EAM: urutan menu dirapikan',
    changes: [
      'Urutan modul EAM: Aset → Kendaraan → Gedung → Equipment → Maintenance/WO → Inventaris → Dokumen → Master Data (alur logis: master aset, spesialisasi, operasional, pendukung, konfigurasi)',
    ],
  },
  {
    version: '3.15.1',
    date: '2026-06-09',
    title: 'EAM · Manajemen Aset (rename GA + satukan Aset Tetap)',
    changes: [
      'Grup menu General Affairs diganti menjadi EAM · Manajemen Aset',
      'Aset Tetap (akuntansi) kini menyatu dengan aset EAM: setiap aset tetap punya master aset EAM yang sama (ditandai badge "Aset Tetap")',
      'Penyusutan & jurnal aset tetap tetap berjalan apa adanya, hanya ditautkan, tidak diubah',
    ],
  },
  {
    version: '3.15.0',
    date: '2026-06-09',
    title: 'Modul General Affairs (GA): Merge GA Monitor jadi 1 Aplikasi',
    changes: [
      'Grup menu baru General Affairs: Aset Fisik, Dokumen & Sertifikat, Inventaris GA, Maintenance/Work Order, Kendaraan, Gedung & Sewa, Equipment & Kalibrasi, Master Data GA',
      'GA Monitor di-merge ke dalam ERP: satu aplikasi, satu login, satu database',
      'Hak akses GA diatur via Pengaturan → Hak Akses (8 modul ga_*); QR aset publik tetap bisa diakses tanpa login',
    ],
  },
  {
    version: '3.14.2',
    date: '2026-06-09',
    title: 'Landing Page /welcome: Animasi dan Section Baru',
    changes: [
      'Hero animatif: gradient bergerak, partikel & ikon mengambang, kartu hero dengan efek sonar, statistik counter',
      'Tambah trust strip, section Cara Kerja, dan badge sektor; konsisten brand navy AKS',
    ],
  },
  {
    version: '3.14.1',
    date: '2026-06-09',
    title: 'Fix: Warna Status Invoice (Dibatalkan jadi Merah)',
    changes: [
      'Status "Dibatalkan" di daftar Invoice Penjualan & Pembelian kini berwarna merah (sebelumnya biru, sama dengan "Diajukan")',
      'Label status diseragamkan ke Bahasa Indonesia (Diajukan, Sebagian, Dibatalkan)',
    ],
  },
  {
    version: '3.14.0',
    date: '2026-06-09',
    title: 'Landing Page Publik Produk (/welcome)',
    changes: [
      'Halaman landing publik di /welcome untuk memperkenalkan produk Entaris oleh PT Arah Karya Sinergi (fitur, prinsip, CTA masuk/konsultasi)',
      'User yang sudah login otomatis diarahkan ke aplikasi; routing aplikasi yang ada tidak berubah',
    ],
  },
  {
    version: '3.13.4',
    date: '2026-06-08',
    title: 'Fix: Grand Total Pengajuan Pembelian Rp 0 di Notif & Daftar Approval',
    changes: [
      'Nilai pengajuan Invoice Pembelian kini terhitung benar saat dibuat. Sebelumnya Rp 0 di notifikasi Telegram & daftar approval (hanya muncul di detail) karena data pengajuan tidak menyimpan nilai per baris',
    ],
  },
  {
    version: '3.13.3',
    date: '2026-06-08',
    title: 'Branding: Ganti Sisa Tulisan "Keuangan" Jadi ERP',
    changes: [
      'Judul tab browser, subtitle halaman login, layar onboarding, dan sidebar kini memakai nama produk, bukan "Keuangan" (sisa branding lama)',
      'Istilah akuntansi tetap apa adanya (Laporan Keuangan, Rasio Keuangan, dll)',
    ],
  },
  {
    version: '3.13.2',
    date: '2026-06-08',
    title: 'Fix: Batch yang Sudah Dipilih Tidak Muncul Lagi di Baris Lain',
    changes: [
      'Pemilih batch (Transfer Stok, Proses Produksi, Invoice Penjualan): batch yang sudah dipilih di baris lain otomatis disembunyikan dari dropdown baris berikutnya. Cegah alokasi dobel',
      'Pengingat: untuk transfer/produksi jumlah besar yang tersebar di banyak batch, pakai tombol "Bagi Batch" agar terpecah otomatis (FIFO) tanpa input baris satu per satu',
    ],
  },
  {
    version: '3.13.1',
    date: '2026-06-08',
    title: 'Fix: Total per Baris di Detail Approval Pembelian Tampil Rp 0',
    changes: [
      'Detail pengajuan Invoice Pembelian: total harga akhir per baris item kini terhitung benar (qty × harga − diskon + PPN − PPh). Sebelumnya selalu Rp 0 karena data pengajuan tidak menyimpan nilai per baris',
    ],
  },
  {
    version: '3.13.0',
    date: '2026-06-07',
    title: 'Bagi Batch Otomatis (FIFO): Produksi & Transfer Stok',
    changes: [
      'Tombol "Bagi Batch" di baris input Proses Produksi & Transfer Stok: isi total qty, sistem memecah otomatis jadi beberapa baris sesuai batch tersedia (FIFO, tertua dulu)',
      'Tidak perlu lagi input manual satu baris per batch (mis. transfer 9.950 kg yang tersebar di belasan batch)',
      'Batch yang sudah dipakai baris lain tidak dialokasi ulang; sisa qty melebihi batch otomatis jadi baris biaya rata-rata (WAC) dengan peringatan',
    ],
  },
  {
    version: '3.12.3',
    date: '2026-06-07',
    title: 'Fix: Dropdown Standar Biaya Produksi Tidak Terlihat',
    changes: [
      'Dropdown pemilih standar biaya di form Proses Produksi terjepit sampai lebar 0 oleh dropdown basis (regresi sweep dropdown custom). Kini tampil normal',
      'Baris "Tambah Biaya" kembali bisa memilih master standar biaya per gudang',
    ],
  },
  {
    version: '3.12.2',
    date: '2026-06-07',
    title: 'Fix: Pihak "Pelanggan & Vendor" Muncul di Dropdown Kedua Sisi',
    changes: [
      'Pihak bertipe "Both" (Pelanggan & Vendor) kini ikut tampil saat memilih Supplier (STT, PO, Invoice Pembelian, Uang Muka Vendor) maupun Pelanggan (SO, Invoice Penjualan, dll)',
      'Sebelumnya pihak Both tidak muncul di dropdown mana pun, mis. konsumen repros yang juga supplier di STT titipan',
    ],
  },
  {
    version: '3.12.1',
    date: '2026-06-07',
    title: 'STT Barang Titipan Pelanggan (Jasa Repros/Maklon)',
    changes: [
      'Ceklis "Barang Titipan Pelanggan" di form STT: terima barang milik pelanggan untuk diproses ulang (rice-to-rice)',
      'Guardrail otomatis: hanya kuantitas yang dicatat, tanpa nilai persediaan/hutang, rata-rata harga item tidak terganggu',
      'STT titipan tidak muncul di pilihan Invoice Pembelian dan diblok bila dipaksa di-invoice. Tagih jasanya lewat Invoice Penjualan (baris jasa)',
      'Badge "Titipan" di daftar & detail STT',
    ],
  },
  {
    version: '3.12.0',
    date: '2026-06-07',
    title: 'Uang Jaminan Proyek: Setor, Kembalikan/Hangus, Reminder Jatuh Tempo',
    changes: [
      'Modul baru Bank & Kas → Uang Jaminan Proyek: catat setoran jaminan tender/pelaksanaan/pemeliharaan ke pemberi proyek',
      'Jurnal otomatis: setor (DR Uang Jaminan 1.8 / CR Kas-Bank), settlement kembali dan/atau hangus jadi beban. Bisa parsial & berulang',
      'Status otomatis Disetor → Selesai; pembatalan setoran/settlement me-reverse jurnal (hak khusus Batalkan Dokumen)',
      'Reminder otomatis H-7 & saat lewat jatuh tempo pengembalian via notifikasi in-app + Telegram',
      'Akun aset 1.8 Uang Jaminan Proyek dibuat otomatis; bisa diganti di Pengaturan → Akun Sistem',
    ],
  },
  {
    version: '3.11.0',
    date: '2026-06-05',
    title: 'Role & Hak Akses Dinamis (RBAC): Buat Role Custom + Matriks Izin',
    changes: [
      'Admin dapat membuat/menghapus role sendiri (mis. Kasir, Auditor, Staf Pembelian) lewat Pengaturan → Hak Akses',
      'Matriks izin per modul (Lihat/Edit) yang bisa diatur tiap role tanpa ubah kode; menu & akses mengikuti izin otomatis',
      'Hak khusus terpisah: setujui pengajuan, lewati approval, batalkan/finalisasi dokumen, bypass stok minus, kelola hak akses',
      'Role bawaan (Admin/Akuntan/Staff Produksi/Viewer) tetap dengan akses yang sama persis, tanpa perubahan bagi pengguna lama',
      'Pemilihan role saat buat/edit user kini mengikuti daftar role yang ada (dinamis)',
    ],
  },
  {
    version: '3.10.0',
    date: '2026-06-05',
    title: 'Approval Langsung dari Telegram (Setuju / Tolak / Minta Revisi)',
    changes: [
      'Manajer dapat menyetujui, menolak, atau meminta revisi pengajuan langsung dari tombol di japri Telegram, tanpa buka aplikasi',
      'Minta Revisi: bot meminta admin membalas dengan alasan, lalu pengaju otomatis diberi tahu',
      'Pesan pengajuan kini lebih informatif: jenis dokumen, nilai, dan nama pengaju',
      'Setiap notifikasi pengajuan menyertakan link "Buka & proses" yang langsung membuka detail pengajuan tsb di aplikasi (deep-link)',
      'Keamanan: hanya admin aktif yang Telegram-nya tertaut yang dapat mengeksekusi keputusan; tombol hanya muncul di japri admin (bukan grup)',
    ],
  },
  {
    version: '3.9.0',
    date: '2026-06-04',
    title: 'Notifikasi Telegram Japri per Staf (Auto-link /start)',
    changes: [
      'Notifikasi personal (mis. hasil approval ke pengaju) kini dikirim ke Telegram pribadi staf yang sudah ditautkan',
      'Manajemen User: tombol Hubungkan Telegram -> staf buka link bot & tekan Start, status Tertaut otomatis',
      'Toggle master "Notifikasi personal" di Pengaturan -> Notifikasi; broadcast role tetap ke grup',
    ],
  },
  {
    version: '3.8.5',
    date: '2026-06-04',
    title: 'Dropdown Seragam (Batch 2): Hampir Semua Select',
    changes: [
      'Hampir semua dropdown di app (modal transaksi: pembayaran, invoice pembelian, produksi, transfer, uang muka; halaman: SO/PO/penawaran/surat jalan/penerimaan/buku besar/COA/audit/laporan) kini dropdown custom seragam + cari otomatis bila opsi banyak',
      'Dikecualikan: form aset tetap & aturan approval (pakai form native), serta pemilih satuan inline di baris item',
    ],
  },
  {
    version: '3.8.4',
    date: '2026-06-04',
    title: 'Dropdown Seragam (Batch 1): Gudang, Termin, Filter List',
    changes: [
      'Semua pemilih Gudang kini dropdown custom yang rapi + bisa dicari (berlaku di semua form)',
      'Termin pembayaran & filter status (Invoice Penjualan/Pembelian) + filter Item/Tipe gerakan stok kini dropdown seragam',
      'Komponen Select baru (pengganti drop-in <select>) untuk konsistensi; sweep dropdown berlanjut bertahap',
    ],
  },
  {
    version: '3.8.3',
    date: '2026-06-04',
    title: 'Tombol Buat Invoice Langsung dari Surat Jalan',
    changes: [
      'Di detail Surat Jalan, tombol "Buat Invoice" kini langsung membuka form Invoice Penjualan yang sudah terisi dari Surat Jalan itu (pelanggan, item, harga, No. PO/SO). Tinggal cek & simpan',
      'Sebelumnya hanya menampilkan petunjuk untuk buka menu manual',
    ],
  },
  {
    version: '3.8.2',
    date: '2026-06-04',
    title: 'Fix Buat Invoice dari Surat Jalan + Auto-isi No. PO/SO',
    changes: [
      'Nomor Surat Jalan kini tampil benar di pemilih (sebelumnya kosong karena salah ambil data)',
      'Harga & diskon baris invoice dari Surat Jalan terisi otomatis dari SO (tidak lagi 0)',
      'No. Referensi invoice terisi otomatis: No. PO pelanggan dari SO, atau No. SO bila PO kosong',
    ],
  },
  {
    version: '3.8.1',
    date: '2026-06-04',
    title: 'Pencarian Pelanggan di Buat Invoice Penjualan',
    changes: [
      'Pemilih pelanggan saat buat invoice penjualan kini bisa diketik/dicari (SearchableSelect) + tampil nomor telepon untuk membedakan nama mirip',
    ],
  },
  {
    version: '3.8.0',
    date: '2026-06-04',
    title: 'Notifikasi Telegram + Menu Konfigurasi',
    changes: [
      'Notifikasi sistem (approval, invoice jatuh tempo, stok rendah) bisa dikirim ke grup Telegram',
      'Menu Pengaturan -> Notifikasi: isi Bot Token & Chat ID, toggle per jenis, tombol Tes Koneksi',
      'Bot token disimpan aman (write-only, tak pernah ditampilkan kembali); Admin-only',
    ],
  },
  {
    version: '3.7.7',
    date: '2026-06-03',
    title: 'Lampiran (Attachment) di Pesanan (SO)',
    changes: [
      'Pesanan (SO) kini bisa dilampiri file (PO pelanggan, kontrak, bukti) di drawer detail, sama seperti Surat Jalan & invoice',
      'Surat Jalan sudah mendukung lampiran sebelumnya (tetap)',
    ],
  },
  {
    version: '3.7.6',
    date: '2026-06-03',
    title: 'Optimasi Tampilan Mobile / PWA',
    changes: [
      'Angka di kartu (mis. nilai Rupiah) tidak lagi terpotong di HP. Kini turun baris utuh, bukan dipotong "..."',
      'Form/modal (uang muka, penerimaan, pelanggan, surat jalan, pembayaran, dll) menumpuk rapi 1 kolom di HP (sebelumnya 2-3 kolom sempit)',
      'Tabel retur penjualan & detail buku besar bisa di-scroll horizontal di HP (tidak terpotong)',
      'Tampilan desktop tidak berubah',
    ],
  },
  {
    version: '3.7.5',
    date: '2026-06-03',
    title: 'Fix: Batch Hasil Transfer Bisa Dipakai Input Produksi',
    changes: [
      'Submit/approve & edit produksi kini menerima batch sumber bertipe TransferIn (stok hasil transfer antar-gudang), konsisten dengan batch picker',
      'Sebelumnya approve produksi yang memakai batch hasil transfer antar-gudang gagal: "Batch sumber bukan stok masuk"',
    ],
  },
  {
    version: '3.7.4',
    date: '2026-06-03',
    title: 'Dashboard Per Gudang Dikelompokkan per Kategori',
    changes: [
      'Stok per gudang kini dikelompokkan: Bahan Baku, Barang Setengah Jadi, Produk Jadi, Produk Samping, Perlengkapan/Lainnya, dengan subtotal nilai per kelompok',
      'Export PDF stok per gudang ikut dikelompokkan per kategori + subtotal',
    ],
  },
  {
    version: '3.7.3',
    date: '2026-06-02',
    title: 'Catat Gerakan: Stok Item Ikut Gudang Terpilih',
    changes: [
      'Di form catat gerakan stok, info stok item kini mengikuti gudang yang dipilih (stok per gudang), bukan stok total',
    ],
  },
  {
    version: '3.7.2',
    date: '2026-06-02',
    title: 'Pilih Gudang saat Catat Gerakan Stok',
    changes: [
      'Form catat gerakan stok kini punya pilihan gudang (default ke gudang utama, bisa diganti)',
      'Saat edit, gudang asal ditampilkan read-only',
    ],
  },
  {
    version: '3.7.1',
    date: '2026-06-02',
    title: 'Filter Gudang di Riwayat Gerakan Stok',
    changes: [
      'Riwayat gerakan stok kini bisa difilter per gudang + kolom Gudang ditambahkan',
      'Tipe gerakan Transfer Masuk/Keluar kini muncul di filter & label',
    ],
  },
  {
    version: '3.7.0',
    date: '2026-06-02',
    title: 'Fitur Retur Penjualan (Sales Return / Credit Note)',
    changes: [
      'Retur penjualan dari invoice: pilih item & qty yang diretur (partial), per baris bisa pilih masuk stok kembali (layak jual) atau tidak (rusak)',
      'Otomatis posting jurnal kontra-revenue (4.3 Retur Penjualan) + balik PPN + balik HPP untuk barang yang masuk stok',
      'Nilai retur mengurangi piutang invoice; sisanya jadi kredit/uang muka pelanggan untuk invoice berikutnya',
      'Mendukung approval gate (staff mengajukan, admin menyetujui) dan pembatalan retur (membalik stok & jurnal)',
    ],
  },
  {
    version: '3.6.4',
    date: '2026-06-02',
    title: 'Laba Rugi & Neraca Saldo Default Satu Bulan Penuh',
    changes: [
      'Default rentang tanggal Laba Rugi & Neraca Saldo kini sampai akhir bulan, bukan hanya sampai hari ini',
      'Entri akhir-bulan seperti beban penyusutan & jurnal penyesuaian (diposting tgl 30/31) kini langsung terlihat tanpa perlu set tanggal manual',
    ],
  },
  {
    version: '3.6.3',
    date: '2026-06-02',
    title: 'Batch Picker Kenali Stok Hasil Transfer Antar-Gudang',
    changes: [
      'Batch picker (produksi & penjualan) kini menampilkan stok yang masuk via transfer antar-gudang (TransferIn), lengkap dengan cost-nya',
      'Sebelumnya: bahan setengah jadi yang diproduksi di satu gudang lalu ditransfer ke gudang lain tidak memunculkan batch/WAC saat dipakai produksi di gudang tujuan',
    ],
  },
  {
    version: '3.6.2',
    date: '2026-06-02',
    title: 'Notifikasi Aktif: Approval & Cek Terjadwal',
    changes: [
      'Notifikasi approval otomatis: staff ajukan → Admin diberitahu; disetujui/ditolak/minta-edit → staff pengaju diberitahu',
      'Cek terjadwal harian (07:00) otomatis kirim notifikasi invoice jatuh tempo + stok rendah (sebelumnya tidak pernah jalan)',
      'Klik notifikasi langsung diarahkan ke halaman terkait (sesuai role), + menu Notifikasi di sidebar',
    ],
  },
  {
    version: '3.6.1',
    date: '2026-06-02',
    title: 'Detail Pengajuan Approval Lebih Lengkap',
    changes: [
      'Detail pengajuan kini menampilkan info lengkap: PI (supplier, jatuh tempo, syarat, qualitas/timbangan/refaksi/diskon/PPN/PPh/potongan per item) + estimasi Grand Total',
      'Produksi: gudang, jendela shift, mesin, downtime, proses, biaya per akun, batch terkunci + estimasi HPP/kg',
      'Tombol "Lihat Dokumen" pada pengajuan yang sudah Disetujui → buka dokumen final (total/HPP/jurnal resmi)',
    ],
  },
  {
    version: '3.6.0',
    date: '2026-06-02',
    title: 'Tab Approval & Pengajuan + Alur Minta Edit (Revisi)',
    changes: [
      'Tab "Approval & Pengajuan" dgn sub-tab status (Menunggu/Disetujui/Ditolak/Perlu Revisi) di halaman Invoice Pembelian, sub-tab Proses Produksi, & halaman Sistem→Approval',
      'Admin punya 3 aksi: Setuju, Tolak (+alasan), dan Minta Edit (+alasan) yang mengembalikan pengajuan ke staff utk diperbaiki',
      'Staff melihat riwayat pengajuan miliknya; untuk yg Perlu Revisi bisa "Edit & Ajukan Ulang" (form terisi lengkap) → kembali ke antrian Menunggu',
      'Detail pengajuan lengkap (input/output/biaya, nama item) sebelum diputuskan',
    ],
  },
  {
    version: '3.5.2',
    date: '2026-06-02',
    title: 'Detail Pengajuan Data Produksi (Approval)',
    changes: [
      'Tombol "Detail" di tiap antrian approval produksi. Buka modal berisi rincian lengkap: info shift, bahan baku (input), hasil produksi (output + by-product), dan komponen biaya',
      'Nama item ditampilkan (bukan ID), sehingga manajer bisa double-check sebelum menyetujui',
      'Admin bisa Setuju/Tolak langsung dari modal detail',
    ],
  },
  {
    version: '3.5.1',
    date: '2026-06-02',
    title: 'Antrian Approval Produksi Tampil di Tab Proses Produksi',
    changes: [
      'Data produksi yang menunggu persetujuan kini tampil sebagai panel kuning di Stok & Gudang → Proses Produksi → Data Produksi',
      'Admin & staff sama-sama bisa melihat proses mana yang sedang menunggu approval (lengkap dgn input/output)',
      'Admin bisa Setuju/Tolak langsung dari panel ini tanpa harus ke menu Sistem → Approval',
    ],
  },
  {
    version: '3.5.0',
    date: '2026-06-02',
    title: 'Approval Manajer untuk Invoice Pembelian & Data Produksi',
    changes: [
      'Invoice Pembelian & Data Produksi yang diinput oleh non-Admin (StaffProduksi/Accountant) kini menunggu persetujuan Admin sebelum diproses',
      'Dokumen baru dibuat hanya setelah disetujui. Sebelum disetujui, jurnal, stok, dan HPP belum berubah sehingga laporan tidak tercampur input yang belum dicek',
      'Halaman Sistem → Approval: lihat antrian, buka detail input (item/qty/harga), Setujui atau Tolak. Reject = dibuang tanpa jejak GL',
      'Admin input langsung jadi tanpa approval; staff bisa lihat status pengajuan mereka sendiri',
    ],
  },
  {
    version: '3.4.7',
    date: '2026-06-01',
    title: 'Fitur Revisi Harga Invoice Pembelian',
    changes: [
      'Tombol "Revisi Harga" di detail Invoice Pembelian (Admin/Accountant), untuk kasus supplier koreksi harga setelah PI submit, bahkan setelah barang diproduksi/dijual',
      'Selisih dipecah otomatis: porsi barang masih di stok → sesuaikan Persediaan + harga rata-rata (WAC); porsi sudah keluar → akun 5.11 Selisih Harga Pembelian',
      'Hutang ke supplier ikut disesuaikan; jurnal selisih diposting otomatis & tercatat di audit. Bisa untuk PI Submitted maupun Paid',
    ],
  },
  {
    version: '3.4.6',
    date: '2026-06-01',
    title: 'Perbaikan Hasil Audit Sistem (7 bug laten)',
    changes: [
      'Cancel STT: guard stok minus (tidak bisa cancel jika barang sudah keluar; Admin bisa override dengan alasan) + harga rata-rata (WAC) dihitung ulang + blokir jika batch sudah dipakai produksi/penjualan',
      'Produksi: HPP loaded tidak bisa di bawah 0 (cegah HPP negatif saat NRV by-product > biaya)',
      'Edit gerakan stok: harga rata-rata (WAC) kini dihitung ulang setelah qty/harga diubah',
      'Pembatalan Surat Jalan: qty terkirim SO hanya dikurangi untuk baris yang stoknya benar-benar dikembalikan',
      'Landed cost: WAC tidak diubah jika stok ≤ 0 (cegah WAC absurd untuk barang yg sudah keluar)',
      'Posting GL gerakan stok pakai Decimal (hilangkan ekor floating-point)',
      'Lampiran: listing/count diberi role guard eksplisit',
    ],
  },
  {
    version: '3.4.5',
    date: '2026-06-01',
    title: 'Stok Per Tanggal + Kondisi Stok di Laporan Harian',
    changes: [
      'Dashboard Stok per Gudang: tambah filter tanggal: unduh PDF posisi stok terakhir per tanggal tertentu (bukan hanya stok hari ini)',
      'Posisi stok direkonstruksi tepat dari riwayat pergerakan stok (kuantitas eksak; nilai pakai avg cost terkini sebagai estimasi)',
      'Laporan Harian: tambah section "Kondisi Stok": posisi stok per gudang pada akhir tanggal laporan (qty, avg cost, nilai), tampil di layar & PDF',
      'Section Produksi di Laporan Harian tetap (input/output/yield per run)',
    ],
  },
  {
    version: '3.4.4',
    date: '2026-05-31',
    title: 'Halaman Login Didesain Ulang',
    changes: [
      'Halaman login dirombak: panel kiri dengan gradient bergerak (emerald-teal-amber), floating icon ERP, particle drift, dan animasi sonar pada logo',
      'Statistik beranimasi (Akun COA, Modul, Role) dan label fitur (Audit RBAC, Multi-gudang, Loaded HPP)',
      'Form kanan: kartu bersudut membulat dengan bayangan, tombol "Masuk" bergradasi dengan efek kilau saat disorot dan panah beranimasi',
      'Tetap responsif (mobile tampil panel form saja), dark mode dukung, branding (logo + nama perusahaan) tetap dinamis',
    ],
  },
  {
    version: '3.4.3',
    date: '2026-05-31',
    title: 'Buat Surat Jalan dari SO Lebih Lengkap',
    changes: [
      'Panel Buat Surat Jalan dari Pesanan (SO) kini selengkap modul Surat Jalan: tambah field Penerima & Catatan',
      'Admin override "izinkan stok minus" + alasan kini tersedia juga saat Buat Surat Jalan dari SO (bukan cuma di modul Surat Jalan)',
      'Catatan otomatis "Auto dari SO" tetap dipakai kalau field Catatan dikosongkan',
    ],
  },
  {
    version: '3.4.2',
    date: '2026-05-31',
    title: 'Fix UX Buat Surat Jalan dari SO: Qty Tidak Auto-Penuh',
    changes: [
      'Saat Buat Surat Jalan dari Pesanan (SO), kolom Qty Kirim sekarang kosong secara default. User tinggal ketik berapa yang mau dikirim (mis. 10 ton). Sebelumnya auto-terisi penuh (mis. 209 ton) jadi sulit kirim sebagian',
      'Placeholder menampilkan sisa maksimal yg boleh dikirim per item ("maks X")',
    ],
  },
  {
    version: '3.4.1',
    date: '2026-05-26',
    title: 'StaffProduksi Akses Penuh Pesanan (SO)',
    changes: [
      'Role StaffProduksi sekarang punya akses penuh modul Pesanan (Sales Order): lihat, buat, edit, submit, generate Surat Jalan, cancel (sama seperti Admin/Accountant)',
      'Sebelumnya hanya bisa lihat sidebar Surat Jalan; sekarang Pesanan (SO) juga muncul di sidebar mereka',
      'Mendukung alur fisik: staff pabrik bisa langsung input pesanan customer + siapkan/kirim barang tanpa nunggu staff keuangan',
      'Plus: rekonsiliasi uang muka pelanggan (GL-neutral, fix tampilan saldo phantom)',
    ],
  },
  {
    version: '3.4.0',
    date: '2026-05-26',
    title: 'OEE Tracking Produksi: Mesin, Shift, Downtime',
    changes: [
      'Master Mesin: tab baru di Stok untuk daftar mesin produksi + kapasitas ideal (tambah, ubah, hapus)',
      'Data Produksi & OEE di modal Proses Produksi: jendela shift (start/stop), pilih mesin (multi-mesin), catat downtime per mesin dengan alasan',
      'Hitung OEE otomatis: Availability (runtime vs planned) × Performance (output vs ideal × runtime) × Quality (good vs total dari baris item) = OEE%',
      'Panel OEE + tabel per-mesin di detail Proses Produksi: lihat availability/performance/quality breakdown + total downtime',
      'Entrypoint Docker auto-apply migrasi .sql loose setelah migrate deploy (untuk fresh install)',
      'Buku manual pengguna lengkap (12 bab + versi PDF)',
    ],
  },
  {
    version: '3.3.0',
    date: '2026-05-26',
    title: 'Uang Muka (DP) Ter-link ke Pesanan (SO)',
    changes: [
      'Pembayaran uang muka (CustomerDeposit) sekarang bisa ditag ke Sales Order tertentu. Dulu pool per-customer, tidak tahu DP untuk pesanan mana',
      'Panel "Uang Muka (DP)" di detail Pesanan: DP diterima / Grand Total / Sisa / % dari total + daftar pembayaran DP',
      'Tombol "Terima Uang Muka" langsung dari layar Pesanan: pilih tanggal, jumlah, akun kas/bank. JE otomatis: DR Kas/Bank / CR 2.1.2 Uang Muka Penjualan',
      'Alur lengkap: PO customer → SO → terima DP (ter-link SO) → kirim (DO) → invoice → apply DP → lunas',
      'Plus: link manual Surat Jalan ke Sales Order terkait (data fix); fix Admin bypass stok minus tembus cek per-gudang (v3.2.8)',
    ],
  },
  {
    version: '3.2.8',
    date: '2026-05-25',
    title: 'Fix: Admin Bypass Stok Minus di Surat Jalan Tembus Sampai Tuntas',
    changes: [
      'Bug fix: Admin centang "Izinkan stok minus" di Surat Jalan tapi tetap ditolak. Penyebab: ada 2 lapis cek stok: cek agregat (respect bypass) + cek per-gudang (hard block, lupa di-update saat fitur bypass ditambah v3.2.1)',
      'Sekarang cek per-gudang juga mengikuti izin stok minus. Izin Admin kini berlaku sampai stok benar-benar dikurangi',
      'Edit Surat Jalan & Produksi tidak terdampak (hanya satu lapis cek, sudah benar)',
    ],
  },
  {
    version: '3.2.7',
    date: '2026-05-24',
    title: 'Invoice Pembelian Tampilkan STT/BPB Asal',
    changes: [
      'Bug fix: detail Invoice Pembelian sekarang tampilkan STT/BPB asal barang. Sebelumnya link cuma satu arah (dari STT tahu PI nomor berapa, tapi dari PI tidak tahu STT)',
      'Badge STT hijau per baris item (mirip badge Surat Jalan di sales)',
      'Banner ringkasan "Barang diterima dari STT/BPB" di atas daftar barang: list semua STT yang dipakai PI ini',
      'Detail Invoice Pembelian kini memuat nomor dan tanggal STT asal',
    ],
  },
  {
    version: '3.2.6',
    date: '2026-05-24',
    title: 'Lampiran di Surat Jalan & STT/BPB: Bukti Jembatan Timbang',
    changes: [
      'Tambah section "Lampiran" di drawer Surat Jalan dan STT/BPB: upload foto/PDF bukti jembatan timbang, foto kendaraan, dll',
      'Format didukung: JPG, PNG, WebP, PDF (max 5 MB/file, max 10 file per dokumen)',
      'StaffProduksi bisa upload (mereka yang fisik handle dokumen di gudang); semua role bisa view & download',
      'Lampiran kini bisa dikaitkan ke Surat Jalan dan STT, dengan pengecekan bahwa dokumennya ada',
      'Plus link invoice penjualan lama ke Surat Jalan terkait sebagai data fix retroaktif. Cancel SM duplikat dari direct-sale lama',
    ],
  },
  {
    version: '3.2.5',
    date: '2026-05-24',
    title: 'Widget Dashboard "Surat Jalan Belum di-Invoice"',
    changes: [
      'Widget baru di Dashboard section Sales: list semua DO status Submitted yang belum di-invoice, sort umur lama → baru',
      'Badge umur: ≥10 hari merah (kritis), ≥5 hari amber (warning), <5 hari netral. Banner amber muncul kalau ada DO ≥ 5 hari',
      'Auto-refresh 60 detik. Klik baris navigate ke halaman Surat Jalan',
      'Mencegah kasus Surat Jalan yang nyangkut berhari-hari tanpa diinvoice. Sekarang langsung kelihatan di Dashboard',
      'Widget menampilkan maksimal 50 Surat Jalan, dimulai dari yang paling lama',
    ],
  },
  {
    version: '3.2.4',
    date: '2026-05-24',
    title: 'Buku Besar: Default Filter Bulan Berjalan',
    changes: [
      'Bug fix lanjutan: Buku Besar tanpa filter tanggal tampilkan semua periode → JV bulan ini bisa tenggelam di halaman dalam (real case JV 4 Mei ada di baris ke-1.335, halaman ke-27 dari 30 kalau pakai 50/halaman). User wajar menganggap "tidak ada"',
      'Sekarang default Buku Besar otomatis filter ke bulan berjalan saat dibuka. User langsung lihat data bulan ini, baris paling baru di atas',
      'Tetap bisa ubah ke periode lain via preset (Hari ini / Minggu / Bulan lalu / Tahun) atau pilih tanggal manual',
    ],
  },
  {
    version: '3.2.3',
    date: '2026-05-24',
    title: 'Fix Search Buku Besar: Cari Lewat Nama Akun + Line Description',
    changes: [
      'Bug fix: search di Buku Besar dulu hanya match nomor jurnal & narration header. Tidak match nama akun atau description per-baris. Akibat: cari "Piutang Karyawan" tidak ketemu JV "Terima Pembayaran Kasbon Karyawan" yang punya baris ke akun 1.2.2 Piutang Karyawan',
      'Sekarang search Buku Besar match juga ke: nama akun di baris JE, nomor akun (mis. "1.2.2"), dan description per-baris (mis. "Kasbon Karyawan")',
      'Hasil: search "piutang karyawan" di Buku Besar tampilkan JV-202605-0225 (4 Mei) seperti yang muncul di Laporan Buku Besar',
    ],
  },
  {
    version: '3.2.2',
    date: '2026-05-22',
    title: 'Icon Aplikasi Baru',
    changes: [
      'Icon aplikasi (browser tab + mobile/PWA) di-redesign: monogram huruf putih bold di rounded square steel blue dengan aksen golden dot',
      'Vector-based dari SVG master tunggal → generate semua ukuran (16, 32, 64, 180, 192, 512). Konsisten di favicon, Apple Touch, Android PWA',
      'Logo perusahaan (untuk invoice, dokumen, surat jalan) tidak berubah. Tetap pakai logo perusahaan yang lama. Icon aplikasi ini terpisah, khusus identitas digital app',
      'Theme color updated: #1e40af → #2c4d78 (selaras dengan icon background)',
    ],
  },
  {
    version: '3.2.1',
    date: '2026-05-22',
    title: 'Admin Override "Izinkan Stok Minus" + Audit Trail',
    changes: [
      'Admin role bisa bypass validasi stok minus di Surat Jalan & Produksi. Wajib isi alasan minimal 10 karakter, audit log otomatis dicatat ke logger + server',
      'Checkbox "Izinkan stok minus" + textarea alasan hanya tampil untuk role Admin. StaffProduksi / Accountant / Viewer tetap kena strict block',
      'Use case: produksi 50 ton sedang berjalan, barang fisik mau dikirim duluan; Admin bypass dengan alasan, lalu input produksi belakangan',
      'Rumus WAC sudah aman sejak 3.1.2 (memakai harga masuk saat stok ≤ 0), jadi izin stok minus tidak lagi merusak harga rata-rata',
      'Widget Dashboard baru "Stok Minus Aktif" di section Stok: list item dengan stok < 0 (item-level atau per-gudang), age terakhir movement, indikator untuk monitor bypass',
      'Server menolak izin stok minus dari selain Admin dengan pesan "Hanya Admin yang dapat bypass validasi stok"',
    ],
  },
  {
    version: '3.2.0',
    date: '2026-05-22',
    title: 'Modul Pesanan Penjualan (Sales Order)',
    changes: [
      'Modul baru "Pesanan (SO)" untuk komitmen jual sebelum Surat Jalan + Invoice. Cocok untuk skema "invoice dulu, kirim barang nanti". Customer punya komitmen tertulis sebelum barang siap kirim',
      'Flow: Penawaran (opsional) → Sales Order → Surat Jalan → Invoice. Submit SO tidak menggerakkan stok dan tidak membuat jurnal (murni komitmen)',
      'Status SO: Draft, Disubmit, Sebagian Terkirim, Selesai Dikirim, Dibatalkan. Auto-update status sesuai partial delivery',
      'Generate Surat Jalan dari SO: pilih item + qty + gudang, sistem mencatat qty terkirim per baris',
      'Multiple Surat Jalan bisa dari 1 SO (partial delivery). Cancel Surat Jalan otomatis mengembalikan qty terkirim dan menghitung ulang status SO',
      'Penomoran: PSN-YYYYMM-NNNN (Pesanan)',
      'Menu sidebar baru "Pesanan (SO)" di bawah Penawaran',
    ],
  },
  {
    version: '3.1.3',
    date: '2026-05-22',
    title: 'Strict Mode: Stok Tidak Boleh Minus (Hapus Bypass)',
    changes: [
      'Stok minus dilarang di semua jalan transaksi: Surat Jalan, Produksi (submit/edit/cancel), Stock Transfer, Inventory Movement. Submit ditolak dengan pesan "Stok tidak cukup, buat penerimaan/transfer dulu"',
      'Flag bypass "Izinkan stok minus" di Surat Jalan dan Produksi dihapus dari UI. Tidak ada lagi cara override. Kalau stok kurang, harus produksi/transfer/penerimaan dulu',
      'Mencegah corruption WAC (weighted average cost) yang dulu terjadi saat stok negatif × harga inbound = avg cost absurd (jutaan/Kg)',
      'Stock Transfer sudah punya validasi per-warehouse (tidak diubah)',
      'Cancel/edit production yang reverse In (output) juga divalidasi: kalau output sudah dipakai produksi/sales lain, cancel ditolak. Batalkan transaksi hilir dulu',
    ],
  },
  {
    version: '3.1.2',
    date: '2026-05-22',
    title: 'Fix WAC Korup Saat Stok Negatif + Block Oversold di Surat Jalan',
    changes: [
      'Bug fix kritis: rumus WAC (weighted average cost) sekarang aman saat stok negatif. Sebelumnya menghasilkan harga modal absurd (jutaan/Kg) yang ter-lock ke Surat Jalan berikutnya dan menyebabkan COGS booking lebih besar dari penjualan',
      'Block oversold di Surat Jalan: tidak bisa lagi kirim qty > stok gudang. Sistem akan tolak dengan pesan "Stok kurang, tersedia X Kg, diminta Y Kg" dan minta produksi/transfer/penerimaan dulu',
      'Dashboard "Nilai Persediaan" kini menampilkan saldo persediaan negatif apa adanya supaya pemilik tahu ada anomali (sebelumnya disembunyikan jadi 0)',
      'Reset stok + modal per gudang hasil rekonsiliasi fisik: item di-update via dokumen penyesuaian stok, selisih dibukukan ke akun Pembulatan & Selisih sehingga saldo persediaan kembali wajar',
    ],
  },
  {
    version: '3.1.1',
    date: '2026-05-20',
    title: 'Landed Cost Pembelian (Material + Refaksi → Persediaan)',
    changes: [
      'Selisih harga PI ↔ STT tidak lagi posting ke akun "Selisih Harga Pembelian" (5.11). Sekarang masuk langsung ke Persediaan sebagai landed cost adjustment (sesuai prinsip akuntansi: biaya tambahan yg attributable ke barang dibebankan ke nilai stok)',
      'Rumus harga akhir per Kg saat ada refaksi: total invoice PI ÷ qty STT (qty fisik). Contoh: 10.000 Kg fisik, PI total Rp 80.000.000 → harga modal Rp 8.000/Kg (bukan harga provisional)',
      'Gerakan stok dari STT otomatis diperbarui harga satuan dan nilai totalnya setelah PI submit, sehingga batch picker produksi & sales menunjukkan harga modal aktual (bukan provisional)',
      'Harga rata-rata item dihitung ulang proporsional dengan stok yang masih ada saat PI submit',
      'Komponen line PI seperti potongan refaksi ikut diserap ke nilai persediaan, bukan jadi expense terpisah',
    ],
  },
  {
    version: '3.1.0',
    date: '2026-05-20',
    title: 'Modul Produksi Loaded HPP, Aset Tetap Lengkap, Stok Wajib via SJ/STT',
    changes: [
      'Modul Produksi (6 phase): batch picker bahan baku, komponen biaya produksi (listrik/buruh/dll) sebagai standar, auto-calc HPP loaded (material + cost components − NRV by-product), traceability proses (Drying/Huller/Polishing), PDF surat produksi, dan laporan Profitability per SKU (Material vs Loaded margin)',
      'Master Standar Biaya Produksi per gudang: cost rate bisa di-scope per gudang (mis. listrik mesin tertentu hanya muncul di gudang yang memakainya)',
      'Batch picker universal: production input, sales (default WAC, opsional pick batch), transfer antar gudang, stock adjustment Out. Bukan cuma WAC, bisa specific identification per batch',
      'Sisa stok per batch di pemilih kini sudah dikurangi pemakaian lama (FIFO), jadi tidak melebihi stok gudang sebenarnya',
      'Dashboard enrichment: section baru "Aset" (KPI nilai aset, distribusi per kategori, jadwal penyusutan, top 10 aset), widget Profitability per SKU di Sales, dan Production Deep Dive (KPI run, yield trend, top input/output, best/worst yield, loaded HPP breakdown) di Produksi',
      'Aset Tetap lengkap: import aset via script, opening balance JE (harga perolehan + akumulasi penyusutan + ekuitas saldo awal), bulk depreciation posting per bulan (1 klik untuk semua aset, bukan klik per aset), confirm dialog single posting, edit metadata aset, export/import CSV',
      'Dashboard menampilkan total aset, akumulasi penyusutan, dan nilai buku per kategori (Tanah/Bangunan/Peralatan/Mesin)',
      'Buku Besar: pagination footer dengan tombol First/Prev/Next/Last + selector per-halaman (25/50/100/200) + indikator "X–Y dari Z jurnal", filter pencarian dan sembunyikan jurnal batal diproses di server supaya konsisten antar halaman',
      'Master Proses Produksi: daftar proses (Drying, Huller, Polishing, dll) yang dipilih saat input produksi sebagai traceability, tidak posting GL, hanya catatan',
      'Stok keluar wajib via Surat Jalan: invoice penjualan dengan item inventory harus terkait ke DO yang sudah submit. Direct-sale ditutup supaya tidak ada dobel-pengurangan stok antara DO dan invoice',
      'Stok masuk wajib via STT/BPB: invoice pembelian dengan item inventory harus terkait ke STT yang sudah submit. Direct-purchase ditutup. Service items tetap bisa langsung',
      'Fix bug "data duplikat terdeteksi" saat reuse DO/STT setelah invoice di-cancel. Kaitan baris invoice ke DO/STT kini dilepas saat invoice dibatalkan',
      'Fix bug DO pending tidak refresh setelah cancel invoice. Daftar Surat Jalan, gerakan stok, jurnal, pembayaran, dan dashboard kini langsung diperbarui',
      'Fix UI list pelanggan/vendor: nama panjang dan label "Pelanggan/Vendor" tabrakan/bertumpuk',
      'Pemberitahuan versi baru: setiap rilis baru otomatis kasih toast "Versi terbaru tersedia → Muat Ulang" ke user yang sedang login, tidak perlu Ctrl-Shift-R manual',
      'Aplikasi selalu memuat versi terbaru setelah rilis, berkas tampilan disimpan di cache browser agar cepat dibuka',
      'Produksi: NRV by-product, validasi kecocokan batch dengan item, gerakan stok mencatat batch asalnya, dan HPP loaded disimpan di baris invoice penjualan untuk menghitung loaded margin',
      'Production cost standards: cegah double-entry: standar yang sudah dipakai di baris lain disembunyikan di dropdown baris berikutnya',
      'HPP main output produksi optional: auto-fill dari computed HPP loaded kalau staff biarkan kosong',
      'PDF Production Run: layout A4 dengan header company, input/output/byproduct dengan batch ref, table komponen biaya, HPP loaded breakdown, signature 3 kolom',
    ],
  },
  {
    version: '3.0.0',
    date: '2026-05-10',
    title: 'Rebrand Produk, Pipeline Inquiry → Penawaran → Invoice, Public Form',
    changes: [
      'Rebrand: nama dan domain aplikasi diperbarui',
      'Modul Inquiry: catat pertanyaan calon customer (prospect) sebelum penawaran resmi. Workflow Baru → Diproses → Dikonversi/Hilang/Ditutup, multi-channel tracking (WA/Telp/Email/Walk-in/Referral)',
      'Public Inquiry Form: halaman /tanya untuk customer isi sendiri, terintegrasi auto ke pipeline. Anti-spam: honeypot + rate limit',
      'QR Code Generator: generate QR di header Inquiry untuk dibagikan via WA/IG bio/cetak brosur, dengan tracking sumber',
      'Modul Penawaran (Quotations): full lifecycle Draft → Sent → Accepted/Rejected/Expired, conversion ke Sales Invoice, PDF export, Excel export',
      'Auto-expire Penawaran: tiap jam sistem menandai penawaran Sent yang lewat masa berlaku menjadi Expired + notifikasi 3 hari sebelum expiry',
      'Sidebar Modular: 9 modul (Penjualan, Pembelian, Stok & Produksi, Bank & Kas, Akuntansi, Laporan, Master Data, Sistem) dengan submenu collapse/expand, persist state',
      'Theme Toggle: dipindahkan dari sidebar ke header (samping Search), Light/Dark/System cycle',
      'Excel Export per-item Invoice Penjualan & Pembelian (sebelumnya per-invoice saja)',
      'No. Referensi PO/Penawaran di Sales Invoice, tampil di drawer & PDF',
      'Total Qty di Invoice Modal & Drawer: agregat per unit (Kg / Sak / Pcs)',
      'Refund uang muka vendor: potong hutang (FIFO) lalu sisanya dikembalikan ke kas',
      'Tema warna baru: biru baja, font Inter dan Plus Jakarta Sans, perbaikan mode gelap',
      'Pencarian jurnal dan gerakan stok lebih cepat',
      'Upload berkas kini dicek dari isi berkasnya, bukan hanya ekstensinya (keamanan)',
      'Token login yang sudah dicabut dibersihkan otomatis',
      'Pengisian ulang HPP kini dibatasi per role (keamanan)',
      'Judul kolom tabel tetap terlihat saat digulir; dialog konfirmasi di Persetujuan, Aset Tetap, dan Invoice Pembelian',
      'Health Check: referensi jurnal pada penyesuaian stok manual diperbaiki',
      'Dashboard Inventory: formula nilai stok pakai saldo buku besar (bukan akumulasi gerakan stok)',
      'Sales invoice boleh grand total 0 (untuk sample/replacement/100% diskon)',
      'Bisa dipakai lintas industri: label vendor/pelanggan bisa diatur',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-04-13',
    title: 'Fitur Baru, Perbaikan Bug & Icon Aplikasi',
    changes: [
      'Icon aplikasi baru dengan background transparan untuk favicon, PWA, sidebar & login',
      'Pisahkan icon aplikasi (statis) dari logo perusahaan (untuk invoice & dokumen)',
      'Fix Health Check: halaman tidak muncul karena alamat data salah',
      'Fix Aset Tetap, Persetujuan, HPP, Jadwal Piutang/Hutang: alamat data yang salah diperbaiki',
      'Detail Kas & Bank: drawer baru untuk melihat detail pembayaran, jurnal, dan lampiran',
      'Upload & hapus lampiran langsung dari drawer detail pembayaran (drag & drop)',
      'Detail pembayaran memuat data lengkap: mitra, akun, rincian, alokasi, dan jurnal',
      'Grafik Profit Bulanan: fix label bulan yang tidak tampil',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-04-02',
    title: 'Perbaikan Import Saldo Awal & Dashboard',
    changes: [
      'Fix import COA: saldo awal tidak lagi terhitung 2x (double balance)',
      'Fix import party: kolom outstandingAmount/piutang/hutang sekarang dikenali sebagai alias openingBalance',
      'Fix import party: kolom depositBalance otomatis dicatat sebagai uang muka pelanggan untuk tipe Customer',
      'Fix import inventory: stok saat ini sekarang terupdate setelah import stok awal',
      'Fix Excel formula: cell dengan formula (=A1*B1) sekarang terbaca nilainya, bukan [object Object]',
      'Auto-detect openingPrice: sistem otomatis mendeteksi apakah kolom berisi harga satuan atau total value',
      'Tambah kolom openingQty & openingPrice di template download Master Item',
      'Tambah kolom openingQty & openingPrice di preview import inventory',
      'Dashboard: tambah KPI card Deposit Supplier di dashboard utama',
      'Dashboard: tambah KPI Nilai Persediaan (format Rupiah) di dashboard gudang',
      'Dashboard: status bar stok hanya muncul jika item punya minimum stok > 0',
      'Kapasitas angka gerakan stok diperbesar agar nilai besar tidak gagal disimpan',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-04-01',
    title: 'Akun Sistem Komprehensif (IFRS/GAAP) & Perbaikan UI',
    changes: [
      '26 system account roles berdasarkan standar akuntansi global IFRS/GAAP (dari 12 menjadi 26)',
      'Grup baru: Pajak (PPN Masukan/Keluaran, PPh Badan), Diskon & Retur, Aset Tetap & Depresiasi',
      'Grup baru: Biaya Bank & Bunga, Selisih Kurs, Piutang Tak Tertagih, Akrual & Dibayar Dimuka',
      'Grup baru: Pendapatan & Beban Lain-lain, Pembulatan & Selisih, Prive',
      '4 akun COA baru: Cadangan Kerugian Piutang (1.2.5), Prive (3.5), Beban Piutang Tak Tertagih (6.27), Pembulatan & Selisih (8.8)',
      'Fix Pengaturan Akun Sistem: dropdown sekarang menampilkan semua akun COA dengan benar',
      'Upload file backup dari luar: support upload .sql.gz via Pengaturan > Backup',
      'Dashboard stok: tampilkan semua item diurutkan berdasarkan jumlah stok',
      '11 grup UI untuk konfigurasi akun sistem (dari 6 menjadi 11)',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-04-01',
    title: 'Konfigurasi Akun Sistem & Perbaikan COA',
    changes: [
      'Fitur Akun Sistem: konfigurasi mapping akun COA untuk auto GL posting via Pengaturan > Akun Sistem',
      'Akun sistem (AR, AP, Kas, Penjualan, dll) sekarang bisa diganti tanpa ubah kode, mendukung berbagai jenis industri',
      'Multi-akun untuk Kas & Bank: tambah/hapus akun bank fleksibel',
      'Validasi startup: warning otomatis jika mapping akun belum lengkap',
      'Perbaikan COA: akun 7 dipisah menjadi 7 (Pendapatan Diluar Usaha) dan 8 (Beban Diluar Usaha)',
      'Akun 5 (HPP) sekarang berupa akun grup untuk mendukung sub-akun',
      'Fix saldo awal: gunakan Ekuitas Saldo Awal (3.1) bukan Laba Ditahan (3.2)',
      'Fix import Excel: kolom "balance" sekarang terbaca saat import COA',
      'Fix stok: GL posting otomatis saat tambah riwayat stok meskipun item belum punya akun',
      'Fix laporan Laba Rugi: support multiple root group pendapatan dan beban',
      'Nomor akun tidak lagi ditulis mati di kode, semua mengikuti pengaturan Akun Sistem',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-03-29',
    title: 'Dashboard Stok & Bulk Import/Export Excel',
    changes: [
      'Dashboard Stok Gudang: KPI cards, tabel status stok, chart perbandingan vs minimum 20.000 Kg, tren 6 bulan, statistik produksi',
      'Reactive dark/light mode untuk semua chart',
      'Download & Import Excel untuk Bagan Akun, Pelanggan/Vendor, dan Master Item',
      'Template Excel berisi data existing untuk diedit dan di-upload kembali',
      'Import massal Master Item dari Excel',
      'Unduh template Excel per jenis data',
      'Perbaikan error di form Rekonsiliasi',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-28',
    title: 'Standarisasi COA & Data Awal',
    changes: [
      'Restrukturisasi COA 111 akun sesuai standar akuntansi (dari spreadsheet perusahaan)',
      'Penomoran baru tanpa leading zero: 1.1.x Kas/Bank, 1.2.x Piutang, 1.4.x Persediaan, 1.6.x Aset Tetap, 1.7.x Akum. Depresiasi',
      '32 sub-akun persediaan detail (bahan baku, barang setengah jadi, produk jadi & produk sampingan)',
      '26 akun beban operasional (6.01-6.26)',
      'Pendapatan & Beban Diluar Usaha (7.1.xx, 7.2.xx)',
      'Seed 18 vendor + 31 customer untuk development',
      'Fix status akun grup pada akun sistem (4.1 Penjualan, 5 COGS) agar GL posting berfungsi',
      'Fix cash flow report: investing → 1.6/1.7, financing → 2.3',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-28',
    title: 'Uang Muka Vendor & Item Jasa',
    changes: [
      'Fitur Uang Muka Vendor: deposit ke supplier, apply ke invoice pembelian, cancel & reverse GL otomatis',
      'Halaman khusus /vendor-deposits dengan summary cards dan tabel',
      'Tombol "Gunakan Uang Muka" di detail invoice pembelian',
      'Badge "Uang Muka" di halaman Bank & Kas',
      'Tampilkan saldo uang muka di kartu mitra (Pelanggan & Vendor)',
      'COA baru: 1.2 Aset Lancar Lainnya, 1.2.1 Uang Muka Vendor',
      'Support item jasa di invoice penjualan (tanpa stok)',
      'Perbaikan halaman inventory',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-27',
    title: 'Role StaffProduksi & Stok Otomatis',
    changes: [
      'Tambah role StaffProduksi untuk akses gudang & pembelian',
      'Link item invoice ke inventory: stok & COA otomatis sinkron',
      'Rekonsiliasi & transaksi berulang dibatasi dari Viewer',
      'Perbaikan aksesibilitas toggle dashboard',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-20',
    title: 'Cetak Laporan, Favicon Dinamis & Update Check',
    changes: [
      'Fix cetak laporan: hasil cetak bersih tanpa sidebar/navbar',
      'Tambah print header otomatis: nama perusahaan, judul laporan, periode',
      'Favicon tab browser otomatis menggunakan logo perusahaan dari pengaturan',
      'Title tab browser dinamis sesuai nama perusahaan',
      'Fitur cek pembaruan sekarang berfungsi: bandingkan versi dari GitHub',
      'Tampilkan changelog perubahan baru saat pembaruan tersedia',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-20',
    title: 'Redesign Invoice & Set Saldo Awal',
    changes: [
      'Redesign halaman Invoice Penjualan & Pembelian: summary cards, filter, pagination',
      'Tambah detail drawer invoice: klik row untuk lihat detail, riwayat pembayaran, progress',
      'Tambah fitur Set Saldo Awal di Bagan Akun (COA)',
      'Fix pesan saat hapus mitra (dinonaktifkan vs dihapus permanen)',
      'Detail invoice penjualan dan pembelian bisa dibuka per dokumen',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-19',
    title: 'Fix Party & Error Handling',
    changes: [
      'Fix edit & delete mitra (party): hardening error handling semua route',
      'Pesan error diseragamkan di seluruh server',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-17',
    title: 'Pengeluaran & Pinbuk',
    changes: [
      'Pengeluaran kini mendukung semua jenis, bukan hanya ke supplier',
      'Fix payment error handling + tambah fitur pinbuk antar bank',
      'Semua template laporan keuangan diperbarui + perbaikan bug',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-17',
    title: 'Auto Backup & Production Fix',
    changes: [
      'Backup database otomatis harian ke GitHub',
      'Perbaikan rute halaman yang gagal dibuka setelah pembaruan server',
      'Akses dari komputer lokal (localhost) diizinkan otomatis',
      'Perbaikan error 502 saat aplikasi berjalan di server produksi',
      'Perbaikan konfigurasi server produksi',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-16',
    title: 'Initial Release',
    changes: [
      'Dashboard KPI: kas, piutang, hutang, laba bersih MTD',
      'Bagan Akun (COA) hierarki dengan parent-child',
      'Buku Besar (General Ledger) double-entry',
      'Invoice Penjualan & Pembelian dengan auto-posting GL',
      'Bank & Kas: penerimaan, pengeluaran, pinbuk',
      'Pelanggan & Vendor management',
      'Laporan: Trial Balance, P&L, Neraca, Arus Kas, Aging AR/AP',
      'Tahun Buku & tutup buku',
      'Pengaturan profil perusahaan + logo',
      'Role-based auth (Admin, Accountant, Viewer)',
    ],
  },
];

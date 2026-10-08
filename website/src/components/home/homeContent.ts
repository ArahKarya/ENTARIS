/**
 * Copy for the Entaris home page. Every statement here comes from the product README
 * (README.md) or the brand guide (docs/brand/entaris/README.md); keep it that way.
 */
import type { GlitchPanel } from "./heroGlitch";

/* -- Hero ------------------------------------------------------------------------------------- */

export const HUMAN_PANEL: GlitchPanel = {
  words: ["Semua modul", "Hak akses", "Modul custom", "Standar PSAK", "Kendali penuh"],
  subs: [
    "Penjualan, pembelian, inventori, produksi, keuangan, dan aset bermuara ke satu buku besar.",
    "Peran, alur persetujuan bertingkat, dan batas wewenang diatur sesuai hierarki operasional perusahaan Anda.",
    "Bisa bangun modul dan alur kerja unik Anda sendiri secara fleksibel tanpa merombak arsitektur inti.",
    "Jurnal debit dan kredit otomatis, laporan keuangan sesuai PSAK yang siap diaudit, PPN per item, dan jejak perubahan di setiap entri.",
    "Dari UKM hingga puluhan pengguna: sistem berjalan di server milik Anda sendiri dengan kedaulatan data penuh.",
  ],
};

export const AGENT_PANEL: GlitchPanel = {
  words: ["Ikut bekerja", "Hak setara", "Ikut tumbuh", "Draf instan", "Anda setujui"],
  subs: [
    "AIRA menjawab pertanyaan dan menjalankan tugas bertahap di atas data transaksi yang sama.",
    "AIRA tunduk pada hak akses peran yang sama dengan staf Anda. Ia tidak bisa membuka buku besar di luar hak itu.",
    "Modul custom baru otomatis masuk ke katalog tugas AIRA, tanpa melatih AI dari nol.",
    "Minta AIRA siapkan faktur, pengajuan pembayaran, atau draf buku kas. Setiap aksi finansial berhenti sebagai draf untuk Anda periksa.",
    "Secara bawaan posting buku besar dan pencairan dana wajib otorisasi manusia, dengan level wewenang yang fleksibel.",
  ],
};

export type HeroStep = { readonly label: string; readonly detail: string };

export const HUMAN_STEPS: readonly HeroStep[] = [
  { label: "Pasang", detail: "Di server Anda" },
  { label: "Siap pakai", detail: "Bagan akun otomatis" },
  { label: "Atur tim", detail: "4 peran bawaan" },
];

export const AGENT_STEPS: readonly HeroStep[] = [
  { label: "Beri tugas", detail: "Bahasa sehari-hari" },
  { label: "AIRA mengerjakan", detail: "Data, analisis, draf" },
  { label: "Anda setujui", detail: "Sebelum diposting" },
];

/* -- Module catalog --------------------------------------------------------------------------- */

export type CategoryIcon = "sales" | "purchase" | "inventory" | "production" | "finance" | "asset";

export type ModuleCategory = {
  readonly slug: string;
  readonly label: string;
  readonly summary: string;
  readonly icon: CategoryIcon;
  /** Card base color (white text sits on it). */
  readonly color: string;
  readonly modules: readonly { readonly name: string; readonly desc: string }[];
};

export const CATEGORIES: readonly ModuleCategory[] = [
  {
    slug: "penjualan",
    label: "Penjualan",
    summary: "Penawaran, pesanan, surat jalan, faktur, dan pelunasan saling terhubung.",
    icon: "sales",
    color: "#2f6fc4",
    modules: [
      { name: "Quotation", desc: "Penawaran dari draf, terkirim, sampai disetujui, kedaluwarsa otomatis, PDF siap kirim, dan jadi invoice dengan satu klik." },
      { name: "Sales Order", desc: "Pesanan penjualan yang menerbitkan Surat Jalan resmi dan mengalokasikan stok." },
      { name: "Delivery Order", desc: "Surat Jalan resmi memotong stok dan mengunci HPP saat terbit." },
      { name: "Sales Invoice", desc: "PPN per baris, diskon per item maupun global, dan jurnal piutang serta penjualan tercatat otomatis." },
      { name: "Retur Penjualan", desc: "Retur ke invoice lunas menjadi kredit pelanggan; posting jurnal pembukuan otomatis terbalik." },
      { name: "Uang Muka Pelanggan", desc: "Deposit pelanggan yang otomatis dikonversi ke invoice saat realisasi pengiriman." },
    ],
  },
  {
    slug: "pembelian",
    label: "Pembelian",
    summary: "Penerimaan barang, tagihan vendor, dan hutang dalam satu alur terverifikasi.",
    icon: "purchase",
    color: "#2e5ca8",
    modules: [
      { name: "Purchase Order", desc: "Perencanaan dan persetujuan PO ke vendor, penutupan PO, serta laporan outstanding dan kinerja vendor." },
      { name: "STT / BPB", desc: "Penerimaan barang fisik yang langsung menambah stok dan mencatat utang; revisi dan pembatalan membalik jurnalnya." },
      { name: "Purchase Invoice", desc: "PPN masukan per baris, dicocokkan dengan PO dan penerimaan barang; satu faktur bisa menagih beberapa penerimaan." },
      { name: "Uang Muka Vendor", desc: "Deposit pembelian ke pemasok yang dipotong otomatis saat tagihan datang." },
    ],
  },
  {
    slug: "inventori",
    label: "Inventori",
    summary: "Stok multi-gudang dengan harga rata-rata bergerak untuk HPP yang akurat.",
    icon: "inventory",
    color: "#25638f",
    modules: [
      { name: "Stok & Multi-Gudang", desc: "Inventori multi-item dan mutasi stok dengan posting GL otomatis ke persediaan dan HPP." },
      { name: "Stock Opname Fisik", desc: "Penghitungan fisik berkala; selisih otomatis diposting sebagai penyesuaian persediaan." },
      { name: "Transfer Antar-Gudang", desc: "Pemindahan stok antar-gudang dan antar-cabang yang tercatat sebagai mutasi resmi." },
    ],
  },
  {
    slug: "produksi",
    label: "Produksi",
    summary: "Konversi bahan baku menjadi produk jadi, by-product, dan HPP real-time.",
    icon: "production",
    color: "#34497a",
    modules: [
      { name: "BOM & Konversi Produksi", desc: "Formula bahan baku menjadi produk jadi dan produk samping, termasuk perhitungan rendemen dan standar biaya." },
      { name: "HPP Real-time & Modal", desc: "HPP otomatis dari harga rata-rata bergerak; laporan Modal Produksi per Periode untuk evaluasi efisiensi." },
      { name: "Draf Produksi & OEE", desc: "Input produksi selalu berupa draf dahulu, diposting terpisah melalui alur persetujuan berjenjang." },
    ],
  },
  {
    slug: "keuangan",
    label: "Keuangan",
    summary: "Setiap transaksi otomatis menjadi jurnal debit dan kredit yang seimbang.",
    icon: "finance",
    color: "#1b2b48",
    modules: [
      { name: "Pengajuan Pembayaran", desc: "Gantikan Excel & email: reimbursement, kas bon, vendor, perjalanan dinas, dengan timeline approval dan pertanggungjawaban." },
      { name: "Draft Buku Kas (Foto Nota)", desc: "Foto nota atau kuitansi dari WhatsApp atau ponsel dibaca AIRA menjadi baris draf. Entaris menentukan sisi debit dan kredit dengan aturan tetap, lalu manusia meninjau." },
      { name: "Bagan Akun (COA)", desc: "Bagan akun bertingkat tanpa batas level, dengan impor/ekspor Excel dan saldo awal." },
      { name: "Buku Besar & Jurnal", desc: "Setiap transaksi menghasilkan pasangan jurnal yang seimbang; buku besar jadi sumber tunggal kebenaran." },
      { name: "Pembayaran & Kas Bank", desc: "Penerimaan dan pembayaran dengan auto-alokasi FIFO, split payment, dan partial payment." },
      { name: "Rekonsiliasi Bank", desc: "Upload mutasi bank (CSV/Excel) lalu cocokkan otomatis dengan transaksi di buku kas/bank." },
      { name: "Laporan Keuangan PSAK", desc: "Neraca dan laba rugi sesuai PSAK, dengan drill-down hingga dokumen transaksi asal, ekspor PDF/Excel." },
      { name: "Antrean Persetujuan & Audit", desc: "Persetujuan terpusat dengan perbandingan nilai sebelum/sesudah, aturan plafon nominal, dan jejak audit lengkap." },
    ],
  },
  {
    slug: "aset",
    label: "Aset & Sistem",
    summary: "Aset tetap di buku besar, EAM di lapangan, dan diagnostik kesehatan sistem.",
    icon: "asset",
    color: "#3a5480",
    modules: [
      { name: "Aset Tetap & Depresiasi", desc: "Register aset tetap, depresiasi bulanan otomatis, dan disposisi dengan untung/rugi pelepasan." },
      { name: "EAM & Work Order", desc: "Pengelolaan aset fisik, jadwal pemeliharaan preventif, kartu servis, dan perintah kerja (work order)." },
      { name: "Manajemen Kendaraan", desc: "Pajak & STNK/KIR, log BBM armada, inspeksi berkala, dan riwayat servis kendaraan operasional." },
      { name: "Manajemen Dokumen Terintegrasi", desc: "Penyimpanan dokumen perusahaan bertingkat dengan riwayat versi dan pengingat masa berlaku." },
      { name: "Pemeriksaan Kesehatan Sistem", desc: "Deteksi otomatis integritas data pembukuan vs stok dengan pratinjau sebelum perbaikan dijalankan." },
    ],
  },
];

/* -- Why Entaris (README "Kenapa Entaris") ----------------------------------------------------- */

export const WHY_ROWS: readonly { readonly problem: string; readonly solution: string }[] = [
  {
    problem: "Pekerjaan rutin menyita waktu tim",
    solution:
      "ERP biasa menunggu diisi; Entaris ikut bekerja. AIRA mengerjakan analisis laporan, menyusun draf invoice, draf produksi, atau draf buku kas dari foto nota. Tim Anda tinggal meninjau dan menyetujui.",
  },
  {
    problem: "Pasang lama & ribet",
    solution:
      "Entaris dipasang di server Anda dan langsung siap pakai: bagan akun, tahun fiskal, dan akun sistem disiapkan otomatis sejak pertama dijalankan.",
  },
  {
    problem: "Angka tidak konsisten",
    solution:
      "Pembukuan double-entry penuh. Invoice, pembayaran, jurnal, produksi, dan stok otomatis tercatat di buku besar dan selalu seimbang sesuai standar PSAK.",
  },
  {
    problem: "Sistem kaku, susah berkembang",
    solution:
      "Dari UKM beberapa pengguna hingga pabrik dengan puluhan pengguna, BOM, konversi produksi, rendemen, HPP real-time, dan multi-gudang. Fitur tinggal diaktifkan, modul custom mudah ditambahkan, dan AIRA otomatis mengenali alur baru tanpa perlu melatih AI dari nol.",
  },
  {
    problem: "Data dipegang vendor SaaS pihak ketiga",
    solution:
      "Entaris berjalan di server perusahaan Anda sendiri, di kantor atau di cloud pilihan Anda. Aplikasi, data, dan cadangannya milik Anda, jadi Anda tidak terikat pada satu vendor.",
  },
  {
    problem: "Software akuntansi tidak cocok regulasi Indonesia",
    solution:
      "Antarmuka Bahasa Indonesia, PPN per-item, format nomor dokumen resmi Indonesia, neraca dan laba rugi sesuai PSAK yang siap diaudit dan bisa ditelusuri sampai dokumen asal, serta ekspor PDF/Excel siap cetak.",
  },
  {
    problem: "Data banyak, keputusan lambat",
    solution:
      "AIRA menjawab pertanyaan dan menganalisis data riil (laba rugi, arus kas, rasio, umur piutang, stok lambat bergerak, HPP) dalam bahasa sehari-hari. Angka diambil langsung dari buku besar, bukan dikarang model.",
  },
  {
    problem: "Proses bisnis unik butuh alur khusus",
    solution:
      "Entaris didesain modular dan fleksibel. Anda atau tim developer internal dapat membuat modul custom sendiri, dan modul itu otomatis masuk ke katalog tugas AIRA sehingga AIRA bisa langsung membantu alur barunya.",
  },
  {
    problem: "Harus selalu di depan laptop atau meja kantor",
    solution:
      "Entaris bisa dipasang seperti aplikasi di desktop dan ponsel, dengan dukungan offline terbatas. Lewat WhatsApp atau Telegram, Anda bisa mengirim foto nota untuk dijadikan draf buku kas, menanyakan stok atau piutang, dan menyetujui transaksi dari ponsel.",
  },
];

export const FIT_ITEMS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "Perusahaan yang ingin dibantu AI", body: "Yang ingin sistemnya ikut mengerjakan analisis dan draf dokumen, dan ingin pindah data lewat chat dengan AIRA." },
  { title: "UKM & Toko Retail", body: "Yang ingin lepas dari kerumitan file Excel pribadi atau buku tulis manual." },
  { title: "Distribusi & Trading", body: "Banyak pemasok, ribuan pembeli, puluhan faktur belum lunas, dan pencocokan PO, penerimaan, serta faktur." },
  { title: "Manufaktur & Pabrik", body: "Pangan, penggilingan padi, pupuk, dan industri olahan yang membutuhkan BOM, kalkulasi rendemen, dan HPP real-time." },
  { title: "Kantor Akuntan & Konsultan", body: "Pembukuan multi-klien di server mandiri dengan kedaulatan data penuh." },
];

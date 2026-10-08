/**
 * Copy for the Entaris home page. Every statement here comes from the product README
 * (README.md) or the brand guide (docs/brand/entaris/README.md) — keep it that way.
 */
import type { GlitchPanel } from "./heroGlitch";

/* -- Hero ------------------------------------------------------------------------------------- */

export const HUMAN_PANEL: GlitchPanel = {
  words: ["Semua modul", "Hak akses", "Modul custom", "Standar PSAK", "Kendali penuh"],
  subs: [
    "Penjualan, pembelian, inventori, produksi, keuangan & aset — semua bermuara ke satu buku besar.",
    "Peran, alur persetujuan bertingkat, dan batas wewenang diatur sesuai hierarki operasional perusahaan Anda.",
    "Bisa bangun modul dan alur kerja unik Anda sendiri secara fleksibel tanpa merombak arsitektur inti.",
    "Double-entry otomatis, laporan keuangan audit-ready, PPN per item, dan jejak mutasi lengkap di setiap entri.",
    "Dari UKM hingga puluhan pengguna: sistem berjalan di server milik Anda sendiri dengan kedaulatan data penuh.",
  ],
};

export const AGENT_PANEL: GlitchPanel = {
  words: ["Ikut bekerja", "Hak setara", "Ikut tumbuh", "Draf instan", "Anda setujui"],
  subs: [
    "AIRA tidak hanya menjawab pertanyaan — ia menjalankan tugas berlapis di atas data transaksi yang sama.",
    "AIRA tunduk pada hak akses peran yang sama dengan staf Anda — tidak ada akses diam-diam ke buku besar.",
    "Kemampuan AIRA otomatis mempelajari modul custom baru lewat ratusan tool MCP modular tanpa dilatih dari nol.",
    "Minta AIRA siapkan faktur, pengajuan pembayaran, atau draf buku kas — setiap aksi finansial berhenti sebagai draf untuk Anda periksa.",
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
  readonly pattern: "pat-lines" | "pat-dots" | "pat-mesh" | "pat-diag";
  readonly modules: readonly { readonly name: string; readonly desc: string }[];
};

export const CATEGORIES: readonly ModuleCategory[] = [
  {
    slug: "penjualan",
    label: "Penjualan",
    summary: "Dari penawaran sampai pelunasan — setiap tahap saling terhubung.",
    icon: "sales",
    color: "#2f6fc4",
    pattern: "pat-lines",
    modules: [
      { name: "Quotation", desc: "Penawaran Draft → Sent → Accepted, auto-expire, PDF siap kirim, konversi satu klik ke invoice." },
      { name: "Sales Order", desc: "Pesanan penjualan yang menerbitkan Surat Jalan resmi dan mengalokasikan stok." },
      { name: "Delivery Order", desc: "Surat Jalan resmi memotong stok dan mengunci HPP saat terbit." },
      { name: "Sales Invoice", desc: "PPN per baris, diskon per item maupun global, posting otomatis DR Piutang / CR Penjualan." },
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
    pattern: "pat-diag",
    modules: [
      { name: "Purchase Order", desc: "Perencanaan dan persetujuan PO ke vendor, penutupan PO, serta laporan outstanding dan kinerja vendor." },
      { name: "STT / BPB", desc: "Penerimaan barang fisik dengan guard WAC; revisi dan pembatalan selalu membalik jurnal akrual GRNI." },
      { name: "Purchase Invoice", desc: "PPN masukan per baris; pencocokan 3 arah (3-Way Match), satu faktur bisa menagih multi-STT." },
      { name: "Uang Muka Vendor", desc: "Deposit pembelian ke pemasok yang dipotong otomatis saat tagihan datang." },
    ],
  },
  {
    slug: "inventori",
    label: "Inventori",
    summary: "Stok multi-gudang dengan moving average cost (WAC) untuk HPP akurat.",
    icon: "inventory",
    color: "#25638f",
    pattern: "pat-dots",
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
    pattern: "pat-mesh",
    modules: [
      { name: "BOM & Konversi Produksi", desc: "Formula bahan baku → produk jadi + by-product, termasuk perhitungan rendemen dan standar biaya." },
      { name: "HPP Real-time & Modal", desc: "HPP otomatis dari moving average cost; laporan Modal Produksi per Periode untuk evaluasi efisiensi." },
      { name: "Draf Produksi & OEE", desc: "Input produksi selalu berupa draf dahulu, diposting terpisah melalui alur persetujuan berjenjang." },
    ],
  },
  {
    slug: "keuangan",
    label: "Keuangan",
    summary: "Double-entry penuh — setiap transaksi otomatis tercatat dan selalu seimbang.",
    icon: "finance",
    color: "#1b2b48",
    pattern: "pat-lines",
    modules: [
      { name: "Pengajuan Pembayaran", desc: "Gantikan Excel & email: reimbursement, kas bon, vendor, perjalanan dinas, dengan timeline approval dan pertanggungjawaban." },
      { name: "Draft Buku Kas (Foto Nota)", desc: "Foto nota/kuitansi via WhatsApp/PWA → AIRA ekstrak → ENTARIS petakan debit/kredit deterministik → ditinjau manusia." },
      { name: "Bagan Akun (COA)", desc: "Bagan akun bertingkat tanpa batas level, dengan impor/ekspor Excel dan saldo awal." },
      { name: "Buku Besar & Jurnal", desc: "Setiap transaksi menghasilkan pasangan jurnal yang seimbang; buku besar jadi sumber tunggal kebenaran." },
      { name: "Pembayaran & Kas Bank", desc: "Penerimaan dan pembayaran dengan auto-alokasi FIFO, split payment, dan partial payment." },
      { name: "Rekonsiliasi Bank", desc: "Upload mutasi bank (CSV/Excel) lalu cocokkan otomatis dengan transaksi di buku kas/bank." },
      { name: "Laporan Keuangan PSAK", desc: "Neraca dan laba-rugi sesuai PSAK, drill-down hingga dokumen transaksi asal, ekspor PDF/Excel." },
      { name: "Antrean Persetujuan & Audit", desc: "Persetujuan terpusat dengan perbandingan nilai sebelum/sesudah, aturan plafon nominal, dan jejak audit lengkap." },
    ],
  },
  {
    slug: "aset",
    label: "Aset & Sistem",
    summary: "Aset tetap di buku besar, EAM di lapangan, dan diagnostik kesehatan sistem.",
    icon: "asset",
    color: "#3a5480",
    pattern: "pat-diag",
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
      "ERP biasa menunggu diisi; Entaris ikut bekerja. AIRA mengerjakan analisis laporan, menyusun draf invoice, draf produksi, atau draf buku kas dari foto nota — tim Anda cukup meninjau dan menyetujui.",
  },
  {
    problem: "Pasang lama & ribet",
    solution:
      "Entaris dipasang di server Anda dan langsung siap pakai — bagan akun, tahun fiskal, dan akun sistem disiapkan otomatis sejak pertama dijalankan.",
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
      "Entaris berjalan di server perusahaan Anda sendiri — di kantor atau di private cloud pilihan Anda. Aplikasi, basis data, dan cadangannya 100% milik Anda tanpa risiko vendor lock-in.",
  },
  {
    problem: "Software akuntansi tidak cocok regulasi Indonesia",
    solution:
      "Antarmuka Bahasa Indonesia, PPN per-item, format nomor dokumen resmi Indonesia, laporan neraca/laba-rugi audit-ready sesuai PSAK, dan ekspor PDF/Excel siap cetak.",
  },
  {
    problem: "Data banyak, keputusan lambat",
    solution:
      "AIRA menjawab pertanyaan dan menganalisis data riil — laba rugi, arus kas, rasio, umur piutang, tren stok lambat bergerak, HPP — dalam bahasa sehari-hari. Angka diambil langsung dari buku besar, bukan dikarang model.",
  },
  {
    problem: "Proses bisnis unik butuh alur khusus",
    solution:
      "Entaris didesain modular dan fleksibel. Anda atau tim developer internal dapat membuat modul custom sendiri — dan katalog tool MCP otomatis mendaftarkannya agar AIRA langsung bisa membantu alur baru tersebut.",
  },
  {
    problem: "Harus selalu di depan laptop atau meja kantor",
    solution:
      "Kendali penuh di mana saja, bahkan dalam genggaman HP Anda. Entaris berbentuk PWA yang bisa dipasang di desktop dan ponsel (mendukung offline terbatas). Terintegrasi dengan WhatsApp & Telegram untuk kirim foto nota jadi draf buku kas, tanya stok/piutang, serta menyetujui transaksi dari ponsel.",
  },
];

export const FIT_ITEMS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "Perusahaan & UMKM Berorientasi Agentic", body: "Yang ingin sistem modern yang ikut bekerja, bukan sekadar database pasif, dengan migrasi data mulus." },
  { title: "UKM & Toko Retail", body: "Yang ingin lepas dari kerumitan file Excel pribadi atau buku tulis manual." },
  { title: "Distribusi & Trading", body: "Banyak vendor, ribuan pelanggan, puluhan invoice outstanding, dan alur 3-Way Match." },
  { title: "Manufaktur & Pabrik", body: "Pangan, rice mill, pupuk, industri olahan — membutuhkan BOM, kalkulasi rendemen, dan HPP real-time." },
  { title: "Kantor Akuntan & Konsultan", body: "Pembukuan multi-klien di server mandiri dengan kedaulatan data penuh." },
];

/**
 * Copy for the Entaris home page. Every statement here comes from the product README
 * (README.md) or the brand guide (docs/brand/entaris/README.md) — keep it that way.
 */
import type { GlitchPanel } from "./heroGlitch";

/* -- Hero ------------------------------------------------------------------------------------- */

export const HUMAN_PANEL: GlitchPanel = {
  words: ["Semua modul", "Fleksibel", "Standar industri", "Siap tumbuh"],
  subs: [
    "Penjualan, pembelian, inventori, produksi, keuangan & aset — satu buku besar.",
    "Peran, aturan persetujuan, dan akun sistem diatur sesuai cara kerja perusahaan Anda.",
    "Double-entry, laporan sesuai PSAK, PPN per item, dan jejak audit di setiap perubahan.",
    "Dari UKM dengan 1–3 pengguna hingga pabrik dengan puluhan pengguna — tanpa pindah sistem.",
  ],
};

export const AGENT_PANEL: GlitchPanel = {
  words: ["AI bernalar", "Tanya data", "Analisis data", "Draf dulu", "Anda setujui"],
  subs: [
    "AIRA, agen AI bawaan, bernalar di atas data transaksi yang sama — bukan salinan.",
    "“Berapa piutang yang lewat 60 hari?” — AIRA mencari datanya lalu merangkum jawabannya.",
    "Laba rugi, arus kas, rasio, tren stok, HPP\u00a0— AIRA membandingkan periode dan merangkum pos yang paling berubah.",
    "AIRA menyiapkan draf invoice, jurnal, atau pengajuan — bukan memposting sendiri.",
    "Setiap aksi tulis menunggu persetujuan manusia dan tunduk pada RBAC yang sama.",
  ],
};

export type HeroStep = { readonly label: string; readonly detail: string };

export const HUMAN_STEPS: readonly HeroStep[] = [
  { label: "Pasang", detail: "Di server Anda" },
  { label: "Siap pakai", detail: "Bagan akun otomatis" },
  { label: "Atur tim", detail: "4 peran bawaan" },
];

export const AGENT_STEPS: readonly HeroStep[] = [
  { label: "Tanya AIRA", detail: "Bahasa sehari-hari" },
  { label: "Dapat analisis", detail: "Tren, rasio, laba" },
  { label: "Setujui draf", detail: "Sebelum diposting" },
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
      { name: "Sales Order", desc: "Pesanan penjualan yang menerbitkan Surat Jalan resmi." },
      { name: "Delivery Order", desc: "Surat Jalan memotong stok dan mengunci HPP saat terbit." },
      { name: "Sales Invoice", desc: "PPN per baris, diskon per item maupun global, posting otomatis DR Piutang / CR Penjualan." },
      { name: "Retur Penjualan", desc: "Retur ke invoice lunas menjadi kredit pelanggan; posting GL ikut terbalik." },
      { name: "Uang Muka Pelanggan", desc: "Deposit pelanggan yang otomatis dikonversi ke invoice saat realisasi." },
    ],
  },
  {
    slug: "pembelian",
    label: "Pembelian",
    summary: "Penerimaan barang, tagihan vendor, dan hutang dalam satu alur.",
    icon: "purchase",
    color: "#2e5ca8",
    pattern: "pat-diag",
    modules: [
      { name: "Purchase Order", desc: "Perencanaan pembelian ke vendor — tanpa efek GL/stok, opsional ditautkan ke STT/BPB." },
      { name: "STT / BPB", desc: "Penerimaan barang dengan guard WAC; batal dan revisi selalu ikut membalik jurnal GRNI." },
      { name: "Purchase Invoice", desc: "PPN masukan per baris; satu invoice dapat menagih beberapa STT/BPB sekaligus." },
      { name: "Uang Muka Vendor", desc: "Deposit ke vendor untuk pembelian yang dibayar di muka." },
    ],
  },
  {
    slug: "inventori",
    label: "Inventori",
    summary: "Stok multi-item dengan moving average cost untuk HPP akurat.",
    icon: "inventory",
    color: "#25638f",
    pattern: "pat-dots",
    modules: [
      { name: "Stok & Gudang", desc: "Inventori multi-item dan mutasi stok dengan posting GL otomatis ke persediaan dan HPP." },
      { name: "Stock Opname", desc: "Penghitungan fisik; selisih otomatis diposting sebagai penyesuaian persediaan." },
      { name: "Transfer Stok", desc: "Pemindahan stok antar-gudang yang tercatat sebagai mutasi." },
    ],
  },
  {
    slug: "produksi",
    label: "Produksi",
    summary: "Konversi bahan baku menjadi produk jadi dan by-product.",
    icon: "production",
    color: "#34497a",
    pattern: "pat-mesh",
    modules: [
      { name: "BOM & Konversi Produksi", desc: "Bahan baku → produk jadi + by-product, termasuk perhitungan rendemen." },
      { name: "HPP Real-time", desc: "HPP otomatis dari moving average cost; koreksi HPP diselesaikan saat produksi masuk." },
      { name: "Modal Produksi", desc: "Modal bahan baku murni per produksi dan laporan Modal Produksi per Periode." },
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
      { name: "Bagan Akun (COA)", desc: "Bagan akun bertingkat tanpa batas level, dengan impor/ekspor Excel dan saldo awal." },
      { name: "Buku Besar", desc: "Setiap transaksi menghasilkan pasangan jurnal yang seimbang; buku besar jadi acuan semua laporan." },
      { name: "Jurnal Umum", desc: "Jurnal manual multi-baris; total debit = total kredit divalidasi sebelum posting." },
      { name: "Pembayaran", desc: "Penerimaan dan pembayaran dengan auto-alokasi FIFO, split, dan partial payment." },
      { name: "Rekonsiliasi Bank", desc: "Upload mutasi bank (CSV/Excel) lalu cocokkan dengan transaksi di buku." },
      { name: "Laporan Keuangan", desc: "Neraca dan laba-rugi sesuai PSAK, drill-down ke transaksi, export PDF/Excel." },
      { name: "Transaksi Berulang", desc: "Template jurnal untuk beban rutin yang dibuat otomatis per jadwal." },
      { name: "Approval & Audit Trail", desc: "Efek GL/stok baru terjadi setelah disetujui; setiap perubahan tercatat before/after." },
    ],
  },
  {
    slug: "aset",
    label: "Aset",
    summary: "Aset tetap di buku besar, operasional aset di aplikasi EAM.",
    icon: "asset",
    color: "#3a5480",
    pattern: "pat-diag",
    modules: [
      { name: "Aset Tetap", desc: "Register aset, depresiasi bulanan otomatis, dan disposisi dengan untung/rugi pelepasan." },
      { name: "EAM", desc: "Pengelolaan aset & pemeliharaan dalam aplikasi pendamping — satu login dan satu data dengan ERP." },
      { name: "Manajemen Kendaraan", desc: "Pajak & STNK/KIR, log BBM, inspeksi berkala, dan riwayat servis armada." },
    ],
  },
];

/* -- Why Entaris (README "Kenapa Entaris") ----------------------------------------------------- */

export const WHY_ROWS: readonly { readonly problem: string; readonly solution: string }[] = [
  {
    problem: "Pasang lama & ribet",
    solution:
      "Entaris dipasang di server Anda dan langsung siap pakai — bagan akun, tahun fiskal, dan akun sistem disiapkan otomatis sejak pertama dijalankan.",
  },
  {
    problem: "Angka tidak konsisten",
    solution:
      "Pembukuan double-entry penuh. Invoice, pembayaran, jurnal, produksi, dan stok otomatis tercatat di buku besar dan selalu seimbang.",
  },
  {
    problem: "Sistem kaku, susah berkembang",
    solution:
      "Dari UKM dengan beberapa user tanpa modul produksi hingga pabrik dengan BOM, konversi produksi, HPP, dan multi-gudang. Fitur tinggal diaktifkan, tanpa pindah sistem.",
  },
  {
    problem: "Data dipegang vendor",
    solution:
      "Entaris berjalan di server perusahaan Anda — di kantor atau di cloud pilihan Anda. Aplikasi, data, dan cadangannya tetap milik Anda.",
  },
  {
    problem: "Software akuntansi tidak cocok Indonesia",
    solution:
      "Tampilan Bahasa Indonesia, PPN per-item, format nomor dokumen Indonesia, laporan neraca/laba-rugi sesuai PSAK, ekspor PDF/Excel siap cetak.",
  },
  {
    problem: "Data banyak, keputusan lambat",
    solution:
      "AIRA menjawab pertanyaan dan menganalisis laporan — laba rugi, arus kas, rasio, umur piutang, tren stok, HPP — dalam bahasa sehari-hari, lalu menyiapkan draf transaksi. Perubahan pembukuan tetap menunggu persetujuan manusia.",
  },
  {
    problem: "Susah disesuaikan dengan proses bisnis",
    solution:
      "Entaris bisa dikembangkan mengikuti proses bisnis Anda — modul baru ditambahkan tanpa mengganggu yang sudah berjalan.",
  },
];

export const FIT_ITEMS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "UKM & toko retail", body: "Yang ingin lepas dari Excel atau buku tulis." },
  { title: "Distribusi & trading", body: "Banyak vendor, pelanggan, dan invoice outstanding." },
  { title: "Manufaktur", body: "Rice mill, pangan, pupuk, produk industri — BOM, konversi produksi, dan HPP real-time." },
  { title: "Kantor akuntan & konsultan", body: "Pembukuan multi-klien di server sendiri." },
];

/**
 * Copy for the Entaris home page. Every statement here comes from the product README
 * (README.md) or the brand guide (docs/brand/entaris/README.md) — keep it that way.
 */
import type { GlitchPanel } from "./heroGlitch";

/* -- Hero ------------------------------------------------------------------------------------- */

export const HUMAN_PANEL: GlitchPanel = {
  words: ["Semua modul", "Buku besar", "Selalu seimbang", "Data Anda"],
  subs: [
    "Penjualan, pembelian, inventori, produksi, keuangan & aset — satu buku besar.",
    "Setiap transaksi otomatis posting ke buku besar dengan double-entry.",
    "Invoice, pembayaran, jurnal, produksi, dan stok — debit selalu sama dengan kredit.",
    "Self-hosted via Docker Compose: aplikasi, database, dan backup di server Anda.",
  ],
};

export const AGENT_PANEL: GlitchPanel = {
  words: ["AI bernalar", "Tanya data", "Draf dulu", "Anda setujui"],
  subs: [
    "AIRA, agen AI bawaan, bernalar di atas data transaksi yang sama — bukan salinan.",
    "“Berapa piutang yang lewat 60 hari?” — AIRA memanggil tool ERP lalu merangkum jawabannya.",
    "AIRA menyiapkan draf invoice, jurnal, atau pengajuan — bukan memposting sendiri.",
    "Setiap aksi tulis menunggu persetujuan manusia dan tunduk pada RBAC yang sama.",
  ],
};

export type HeroStep = { readonly label: string; readonly detail: string };

export const HUMAN_STEPS: readonly HeroStep[] = [
  { label: "Pasang", detail: "docker compose" },
  { label: "Seed otomatis", detail: "COA & admin" },
  { label: "Login & atur role", detail: "4 role bawaan" },
];

export const AGENT_STEPS: readonly HeroStep[] = [
  { label: "Tanya AIRA", detail: "Bahasa biasa" },
  { label: "Tinjau draf", detail: "Draf invoice" },
  { label: "Setujui", detail: "Lalu berefek" },
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
    summary: "Double-entry murni — setiap transaksi otomatis posting dan selalu balanced.",
    icon: "finance",
    color: "#1b2b48",
    pattern: "pat-lines",
    modules: [
      { name: "COA", desc: "Bagan akun hierarkis tak terbatas level, dengan import/export Excel dan saldo awal." },
      { name: "Buku Besar", desc: "Setiap transaksi menghasilkan pasangan jurnal yang balanced; ledger jadi sumber kebenaran." },
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
      { name: "EAM", desc: "Enterprise Asset Management: aplikasi terpisah dengan SSO, satu backend dan database dengan ERP." },
      { name: "Manajemen Kendaraan", desc: "Pajak & STNK/KIR, log BBM, inspeksi berkala, dan riwayat servis armada." },
    ],
  },
];

/* -- Why Entaris (README "Kenapa Entaris") ----------------------------------------------------- */

export const WHY_ROWS: readonly { readonly problem: string; readonly solution: string }[] = [
  {
    problem: "Pasang lama & ribet",
    solution:
      "Satu perintah docker compose up -d --build. Seed otomatis (chart of account, tahun fiskal, akun sistem) dan 79 migrasi berjalan sendiri saat pertama jalan.",
  },
  {
    problem: "Angka tidak konsisten",
    solution:
      "Double-entry bookkeeping murni. Invoice, pembayaran, jurnal, produksi, dan stok otomatis posting ke buku besar dan selalu balanced.",
  },
  {
    problem: "Sistem kaku, susah berkembang",
    solution:
      "Dari UKM dengan beberapa user tanpa modul produksi hingga pabrik dengan BOM, konversi produksi, HPP, dan multi-gudang. Fitur tinggal diaktifkan, schema sama.",
  },
  {
    problem: "Data dipegang vendor SaaS",
    solution:
      "Self-hosted di Raspberry Pi 5, VPS, atau on-premise. Aplikasi, database, dan backup berjalan di server Anda — data 100% milik Anda.",
  },
  {
    problem: "Software akuntansi tidak cocok Indonesia",
    solution:
      "UI Bahasa Indonesia, PPN per-item, format nomor dokumen Indonesia, laporan neraca/laba-rugi sesuai PSAK, export PDF/Excel siap cetak.",
  },
  {
    problem: "Data banyak, keputusan lambat",
    solution:
      "AIRA menjawab pertanyaan dari buku besar & stok dalam bahasa sehari-hari dan menyiapkan draf transaksi — perubahan pembukuan tetap menunggu persetujuan manusia.",
  },
  {
    problem: "Susah disesuaikan tim internal",
    solution:
      "TypeScript end-to-end (React 19, Express 5, Prisma 7, PostgreSQL 16) dengan Prisma schema terbuka — modul baru bisa ditambah tanpa membongkar core.",
  },
];

export const FIT_ITEMS: readonly { readonly title: string; readonly body: string }[] = [
  { title: "UKM & toko retail", body: "Yang ingin lepas dari Excel atau buku tulis." },
  { title: "Distribusi & trading", body: "Banyak vendor, pelanggan, dan invoice outstanding." },
  { title: "Manufaktur", body: "Rice mill, pangan, pupuk, produk industri — BOM, konversi produksi, dan HPP real-time." },
  { title: "Kantor akuntan & konsultan", body: "Self-host pembukuan multi-klien di infrastruktur sendiri." },
];

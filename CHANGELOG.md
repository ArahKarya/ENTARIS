# Changelog

## [3.0.0] - 2026-05-10

### Rebrand
- **Nama aplikasi**: `Simple ERP` → **`ERP PMD`** (PWA manifest, browser title, login screen, semua surface internal)
- **Domain**: `keuangan.panganmasadepan.com` → **`erp.panganmasadepan.com`** (hard cutover, nginx 301 redirect siap kalau DNS lama dibuka kembali)
- **Repo**: split menjadi `simple-erp-pmd` (PMD-specific origin) + `simple-erp` (generic upstream, cherry-pick untuk fitur non-PMD)

### Pipeline Penjualan Lengkap (Inquiry → Penawaran → Invoice)
- **Modul Inquiry**: catat pertanyaan calon customer / prospect sebelum penawaran resmi
  - Workflow: Baru → Diproses → Dikonversi / Hilang / Ditutup
  - Channel tracking: WhatsApp, Telepon, Email, Walk-in, Referral, Lainnya
  - Hybrid items: free-text textarea atau structured rows (qty/unit/est. harga)
  - Auto-create Party saat conversion (prospect → customer)
- **Public Inquiry Form** (`/tanya`): customer/prospect isi sendiri, langsung masuk pipeline
  - Mobile-first branded form dengan logo perusahaan
  - Anti-spam: honeypot field + rate limit 5/IP/jam
  - Channel auto-detect dari `?src=` URL parameter
- **QR Code Generator**: header Inquiry punya tombol "QR Form"
  - Generate QR (warna abu-abu) + tracking sumber (qr-cetak/qr-toko/qr-kartu-nama/wa/ig/ref)
  - Aksi: copy link, download PNG, share via WA, native Web Share API
- **Modul Penawaran (Quotations)**: full lifecycle dengan conversion ke Sales Invoice
  - Status: Draft → Sent → Accepted/Rejected/Expired/Cancelled
  - Auto-expire sweeper tiap 1 jam + notifikasi 3 hari sebelum expiry
  - PDF "PENAWARAN HARGA" branded dengan validity box, status badge, signatures
  - Excel export per-item

### UI/UX
- **Sidebar Modular** (9 modul): Penjualan, Pembelian, Stok & Produksi, Bank & Kas, Akuntansi, Laporan, Master Data, Sistem — dengan submenu collapse/expand, persist state di localStorage, auto-expand modul aktif
- **Theme Toggle** dipindah dari sidebar ke header (samping Search): cycle Light → Dark → System
- **Sticky table thead** + body scroll-lock pada modal
- **ConfirmDialog adoption**: replace 3 native `confirm()` (PurchaseInvoice edit, Approval delete, FixedAsset dispose) dengan modal yang konsisten, dark-mode-safe, focus-trap
- **Browser tab title** auto-update per route ("Penawaran — ERP PMD")
- **Industrial Professional theme**: OKLCH steel blue, Inter + Plus Jakarta Sans
- Copyright "© Arah Karya by Yayang Setya Nugroho" di footer sidebar

### Invoice Enhancements
- **Excel Export per-item** (Sales & Purchase): 1 invoice dengan N item → N baris di Excel, plus kolom kualitas/timbangan untuk Purchase
- **No. Referensi PO/Penawaran** (`customerRefNo`) di Sales Invoice — tampil di modal create/edit, drawer detail, dan PDF
- **Total Qty** di Sales/Purchase Modal & Drawer — agregat per unit (mis. "5,000 Kg · 50 Sak"); Purchase prefer `timbanganDiterima`
- **grandTotal >= 0**: invoice gratis (sample/replacement/100% diskon) sekarang bisa di-submit
- **Vendor Deposit Refund**: endpoint baru `/vendor-deposits/:id/refund` untuk offset hutang FIFO + refund kas (mirror Customer pattern)

### Security & Reliability
- Magic-byte MIME validation pada upload attachment (cegah file disamarkan via Content-Type spoof)
- Token blacklist purge cron (1 jam interval)
- `apiRateLimit` dipindah sebelum auth routes (rate-limit `/api/auth/me`, `/logout`)
- `Content-Disposition` filename di-encode RFC 5987 (cegah header injection)
- `cogsBackfill` ditambah role guard (Admin/Accountant)
- PATCH method ditambah ke audit trail
- ALE.referenceType bug fix: stock movement adjustment sekarang correctly tagged 'JournalEntry' (sebelumnya 'StockMovement' menyebabkan false-positive di health check)

### Performance
- Composite indexes: `accounting_ledger_entries (account_id, date) WHERE NOT is_cancelled`, `stock_movements (item_id, date)`, `(reference_type, reference_id)`
- Recalculate accounts.balance dari JI source-of-truth (eliminate drift)

### Generalize (Multi-vertical)
- Terminology hook: vendor/customer label configurable per industri
- Repo dual-track: `simple-erp` generic untuk semua industri, `simple-erp-pmd` PMD-specific overrides

### Bug Fixes
- Cancel reversal pattern: journals/customerDeposits/vendorDeposits sekarang soft-cancel originals (`is_cancelled=true`) bukan create `[BATAL]` reversal entries
- Vendor Deposit list: `remaining = amount - applied - refunded` (sebelumnya tidak kurangi refunded)
- Inventory Dashboard: `inventoryValue` pakai SUM(accounts.balance) WHERE 1.4.* (bukan stock_movements cumulative)
- Health Check: ALE↔JI sync, account drift, orphan ALE, stock mismatch — semua 0 issues
- Data fixes: Supari/Suparih typo merge, Bulog opening balance reconcile, Dion vendor deposit tracking sync, Gunawan→Panut deposit transfer

## [2.4.0] - 2026-04-05

### Fitur Baru
- **Dashboard Pelanggan & Vendor** — KPI (piutang, hutang, deposit), aging analysis piutang/hutang, top 10 pelanggan/vendor, invoice jatuh tempo, pembayaran terakhir
- **Dashboard Proses Produksi** — KPI produksi, volume input/output/samping, tren rendemen, top bahan input/output, rendemen tertinggi/terendah, dengan filter periode dan produk
- **Edit Proses Produksi** — Edit data produksi yang sudah dibuat (reverse stok & jurnal lama, buat baru)
- **Detail Proses Produksi** — Drawer detail dengan ringkasan biaya, jurnal GL, dan tombol pembatalan

### Perbaikan
- Fix GL posting invoice jasa: item bertipe service tanpa serviceItemId sekarang otomatis masuk ke akun 4.2 (Pendapatan Jasa) bukan 4.1 (Penjualan)
- Fix data 10 invoice item jasa yang salah masuk akun 4.1, dipindahkan ke 4.2 beserta jurnal dan ledger
- Fix rendemen produksi multi-input: kalkulasi total output / total input, produk samping tidak dihitung
- Fix duplikasi journal entry number saat edit produksi berulang (suffix -R, -R2, -R3, dst)
- Fix mobile overflow text/nilai keluar dari card container

## [2.3.0] - 2026-04-04

### Fitur Baru
- **PWA (Progressive Web App)** — Aplikasi bisa diinstall seperti native app di HP/desktop melalui browser
- **Buku Besar (General Ledger)** — Laporan mutasi per akun dengan filter tanggal dan export Excel
- **Pengaturan Akun Sistem** — Halaman pengaturan yang lebih lengkap dengan grouping, search, dan status konfigurasi
- **Stock Opname** — Fitur penyesuaian stok fisik dengan GL posting otomatis
- **Weighted Average Costing** — Metode HPP rata-rata tertimbang untuk perhitungan COGS
- **PPh Per-Item** — Pajak penghasilan per item di invoice penjualan, tampil di detail dan PDF
- **Upload Bukti Transfer** — Lampiran bukti transfer untuk semua transaksi kas/bank
- **Per-Item Inventory GL** — Posting GL persediaan per item (bukan bulk)
- **Opening Balance Deposits** — Saldo awal deposit pelanggan/supplier
- **Edit Stock Movement** — Edit pergerakan stok yang sudah diinput

### Perbaikan
- HPP penjualan & produksi posting ke akun 5.1 (HPP Beras), bukan parent 5
- Payment modal menampilkan saldo awal (non-invoice) outstanding
- GL reversal menggunakan metode swap pada semua flow pembatalan
- Produksi GL journal balanced (DR output = CR input)
- Dashboard dark mode chart dan nullish coalescing fix
- Tax report, security audit, dan database indexes
- COA menampilkan indikator D/K (Debit/Kredit)
- Report number overflow fix
- Docker build compatibility untuk PWA + Vite

## [2.2.0] - 2026-04-02

### Fitur Baru
- Sistem keuangan double-entry bookkeeping
- Modul penjualan, pembelian, pembayaran
- Chart of Accounts (COA) dengan tree structure
- Jurnal umum manual
- Laporan keuangan: Neraca, Laba Rugi, Arus Kas
- Manajemen inventori dengan produksi (gabah → beras)
- Multi-user dengan role: Admin, Accountant, Viewer
- Export PDF dan Excel
- Dark mode
- Docker Compose deployment

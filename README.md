<div align="center">

<img src="docs/brand/entaris/entaris-icon.svg" width="96" height="96" alt="Entaris" />

# Entaris — Agentic ERP

**Enterprise Agentic Reasoning Integrated System — penjualan, pembelian, inventori & keuangan dalam satu sistem, dengan pembukuan double-entry otomatis di setiap transaksi dan agen AI (AIRA) yang bernalar di atas data Anda. Multi-role, self-hosted via Docker.**

[![Demo](https://img.shields.io/badge/Demo-Live-16C79A?style=flat-square)](https://erp.panganmasadepan.com)
[![Stack](https://img.shields.io/badge/Stack-React%2019%20%C2%B7%20Express%205%20%C2%B7%20Prisma%207-0F3460?style=flat-square)](#-stack)

[![Database](https://img.shields.io/badge/Database-PostgreSQL%2016-FF6F61?style=flat-square&logo=postgresql&logoColor=white)](#-stack)
[![Deploy](https://img.shields.io/badge/Deploy-Docker%20Compose-0F3460?style=flat-square&logo=docker&logoColor=white)](#-quickstart-docker)
[![License](https://img.shields.io/badge/License-MIT-0F3460?style=flat-square)](./LICENSE)

</div>

> Produk **PT Arah Karya Sinergi** (Arah). Sebelumnya bernama *Simple ERP* / *ERP PMD*. Panduan merek: [`docs/brand/entaris`](docs/brand/entaris/README.md).

**Entaris** adalah aplikasi keuangan & operasional yang **mudah dipasang, cepat dipakai, dan cukup kuat untuk bertumbuh** — dari toko/UKM dengan beberapa user hingga manufaktur (rice mill, trading, pangan) yang butuh **pembukuan double-entry penuh**, multi-role, dan audit trail lengkap.

Dibangun **fullstack TypeScript** (**React 19.2** + **Express 5.2** + **Prisma 7.5** + **PostgreSQL 16**), self-hosted via **Docker Compose**. Satu perintah deploy, langsung pakai — **tanpa biaya lisensi bulanan**, data **100% milik Anda**. Tercakup **43 route backend**, **79 halaman** (ERP utama), **145 komponen**, **13 PDF template**, dan **79 migrasi** database, plus aplikasi **EAM** terpisah dalam satu monorepo.

## ✨ Kenapa Entaris

| Masalah | Solusi |
|---|---|
| **Pasang lama & ribet** | `docker compose up -d --build` — dalam 5 menit aplikasi sudah bisa login. Seed otomatis (chart of account, fiscal year, system accounts) saat pertama jalan. |
| **Angka tidak konsisten / "melayang"** | **Double-entry bookkeeping** murni. Setiap transaksi (invoice, pembayaran, JV, produksi, stok) otomatis posting ke GL dan **selalu balanced**. |
| **Sistem kaku, susah berkembang** | Skalabilitas bertahap — dari warung/UKM (1–3 user, tanpa modul produksi) hingga pabrik (puluhan user, BOM, konversi produksi, HPP, pajak per item, multi-gudang). Fitur tinggal diaktifkan, schema sama. |
| **Biaya SaaS bulanan & vendor lock-in** | **MIT license**, **gratis & self-hosted**. Data & backup di server sendiri (Raspberry Pi 5, VPS murah, on-premise). Tidak ada biaya per-user. |
| **Software akuntansi tidak cocok Indonesia** | UI **Bahasa Indonesia**, PPN per-item, format nomor dokumen Indonesia, laporan neraca/laba-rugi sesuai PSAK, export PDF/Excel siap cetak. |
| **Susah disesuaikan tim internal** | TypeScript end-to-end, kode rapi, **Prisma schema terbuka** — tim internal atau developer eksternal bisa tambah modul baru tanpa membongkar core. |

### Cocok untuk

- **UKM & toko retail** yang ingin lepas dari Excel/buku tulis tanpa biaya SaaS bulanan
- **Perusahaan distribusi / trading** dengan banyak vendor, pelanggan, dan invoice outstanding
- **Perusahaan manufaktur** (rice mill, pangan, pupuk, produk industri) dengan kebutuhan BOM, konversi produksi, dan HPP real-time
- **Kantor akuntan / konsultan** yang ingin self-host pembukuan multi-klien di infra sendiri

## 📸 Tampilan

| | |
|---|---|
| **Halaman Login** — animasi background jaringan, role bawaan & custom | **Dashboard** — ringkasan keuangan real-time multi-tab |
| ![Login](docs/screenshots/01-login.png) | ![Dashboard](docs/screenshots/02-dashboard.png) |
| **Buku Besar** — jurnal double-entry, filter periode & preset cepat | **Bagan Akun (COA)** — hierarki parent-child, import/export Excel |
| ![Buku Besar](docs/screenshots/04-buku-besar.png) | ![COA](docs/screenshots/03-coa.png) |
| **Invoice Penjualan** — per-item, PPN, auto-posting GL | **Invoice Pembelian** — PPN masukan, biaya lain, auto-posting |
| ![Sales Invoice](docs/screenshots/05-sales-invoices.png) | ![Purchase Invoice](docs/screenshots/06-purchase-invoices.png) |
| **Pembayaran & Alokasi** — auto-alokasi FIFO, split & partial payment | **Pelanggan & Vendor** — saldo terutang + deposit |
| ![Payments](docs/screenshots/07-payments.png) | ![Parties](docs/screenshots/08-parties.png) |
| **Inventori & Produksi** — moving average cost, rendemen produksi | **Daftar Laporan** — 10 laporan keuangan siap pakai |
| ![Inventory](docs/screenshots/09-inventory.png) | ![Reports](docs/screenshots/10-reports-index.png) |
| **Laba Rugi** — periode bebas, comparative, break-down kategori | **Neraca** — posisi keuangan per tanggal cut-off |
| ![Profit Loss](docs/screenshots/12-profit-loss.png) | ![Balance Sheet](docs/screenshots/13-balance-sheet.png) |
| **Trial Balance** — ringkasan seluruh saldo akun | **Aging Piutang** — bucket umur 0-30 / 31-60 / 61-90 / >90 |
| ![Trial Balance](docs/screenshots/11-trial-balance.png) | ![Aging AR](docs/screenshots/14-aging-ar.png) |
| **Aset Tetap** — register & depresiasi otomatis per bulan | **Jejak Audit** — log before/after setiap mutasi data |
| ![Fixed Assets](docs/screenshots/15-fixed-assets.png) | ![Audit Trail](docs/screenshots/16-audit-trail.png) |
| **Pengaturan** — profil, 26 role akun sistem, backup/restore, fiscal year | |
| ![Settings](docs/screenshots/17-settings.png) | |

## 🏛️ Arsitektur

```
docker compose up -d
         │
         ├── db  (postgres:16-alpine)
         │    ├── Port: 5432 (internal)
         │    ├── Volume: pgdata → /var/lib/postgresql/data
         │    └── Healthcheck: pg_isready
         │
         └── app (custom build dari Dockerfile)
              ├── Port: 3001 → host
              ├── Auto-migrate Prisma saat startup
              ├── Auto-seed jika database kosong
              └── Serve: Express API + React SPA
```

**Yang terjadi saat `docker compose up --build`:**

1. Container `db` start, PostgreSQL siap
2. Container `app` start, menunggu db healthy
3. Migrasi database dijalankan otomatis — **79 migrasi** (Prisma + file SQL idempoten)
4. Cek jumlah user — jika 0, jalankan seed (COA, user admin, fiscal year)
5. Express server start di port 3001
6. Serve React SPA + API dari satu port

## 🧩 Fitur Utama

Fitur dikelompokkan per area bisnis. Semua modul terintegrasi pada satu basis data dengan posting otomatis ke Buku Besar, sehingga angka di dashboard dan laporan selalu konsisten dengan transaksi sumber.

### 1. Akuntansi Inti

- **Bagan Akun (Chart of Accounts)** hierarkis parent-child tak terbatas level, dengan klasifikasi *rootType* (Asset, Liability, Equity, Revenue, Expense) yang menentukan perilaku debit/kredit otomatis. Dilengkapi import/export Excel beserta saldo awal.
- **Buku Besar (General Ledger)** double-entry murni — setiap transaksi otomatis menghasilkan pasangan jurnal yang balanced. Filter periode, preset cepat (Hari Ini / Minggu / Bulan / YTD), toggle sembunyikan transaksi yang dibatalkan.
- **Jurnal Umum (Journal Voucher)** untuk adjusment manual multi-line; validasi otomatis total debit = total kredit sebelum posting; support *cancel & reverse* dengan jejak lengkap.
- **26 Akun Sistem konfigurabel** — mapping satu kali untuk piutang, hutang, persediaan, kas/bank, PPN, HPP, deposit, depresiasi, laba berjalan, laba ditahan, dll. Ganti nomor akun sesuai kebijakan internal tanpa ubah kode.
- **Saldo akun dihitung dari ledger** (`accounting_ledger_entries` sebagai sumber kebenaran) — cache saldo dapat dihitung ulang kapan saja dan tidak pernah menjadi acuan audit.
- **Tahun Fiskal** multi-period dengan proses tutup buku otomatis (*year-end closing*) yang memindahkan laba tahun berjalan ke laba ditahan dan menutup akun nominal.

### 2. Penjualan & Piutang

Pipeline penuh dari pertanyaan calon customer hingga pelunasan invoice — semua tahap saling terhubung satu klik.

- **Inquiry** — catat pertanyaan calon customer/prospect sebelum penawaran resmi. Workflow Baru → Diproses → Dikonversi/Hilang/Ditutup; channel tracking (WhatsApp / Telepon / Email / Walk-in / Referral); items hybrid (free-text atau structured); auto-create Party saat conversion ke Penawaran.
- **Public Inquiry Form** — halaman publik `/tanya` untuk customer isi sendiri, langsung masuk ke pipeline. Mobile-first, branded dengan logo perusahaan, anti-spam (honeypot + rate limit). Dilengkapi **QR Code Generator** untuk dibagikan via WA / IG bio / brosur / kartu nama dengan tracking sumber.
- **Penawaran (Quotations)** — full lifecycle Draft → Sent → Accepted/Rejected/Expired. Auto-expire sweeper tiap jam + notifikasi 3 hari sebelum expiry. PDF "PENAWARAN HARGA" dengan validity box, status badge, signatures, disclaimer "Bukan Faktur Resmi". Conversion satu-klik ke Sales Invoice.
- **Pesanan Penjualan (SO) & Surat Jalan (DO)** — SO menghasilkan DO resmi yang memotong stok dan mengunci HPP saat terbit. PDF DO memuat kolom tanda tangan **Verifikasi Fisik (Security)**.
- **Surat Jalan Sementara (SJS)** — untuk barang yang dikirim **sebelum produksi diinput**. Tab tersendiri di Penjualan > Surat Jalan: **tidak memotong stok, tidak ada jurnal, tidak bisa diinvoice**. Setelah produksi selesai, SJS **ditautkan ke DO resmi** (saat membuat DO, dari SO, atau ke DO yang sudah ada); qty DO boleh berbeda dari SJS. DO dibatalkan → SJS kembali Terbuka. Pengingat otomatis untuk SJS yang belum ditautkan lebih dari 7 hari, serta cetak PDF "Surat Jalan Sementara".
- **Invoice Penjualan** per-item dengan PPN individual per baris, diskon per-item maupun global, biaya tambahan (ongkir, packing), No. Referensi PO/Penawaran customer, dan auto-posting `DR Piutang / CR Penjualan`. Invoice **bernilai Rp 0** (sumbangan/sampel/100% diskon) otomatis berstatus **Paid** saat disubmit tanpa jurnal piutang, dan tetap bisa dibatalkan dari UI.
- **Retur Penjualan** — retur ke invoice yang sudah lunas menjadi **kredit pelanggan** (uang muka), cache saldo deposit tersinkron saat submit dan cancel; mendukung retur qty-saja (tarif 0, mis. barang titipan).
- **Penerimaan Pembayaran** dengan auto-alokasi ke invoice outstanding berbasis FIFO; mendukung *split payment* (satu transfer untuk beberapa invoice), *partial payment*, dan refund uang muka.
- **Deposit Pelanggan** (uang muka) dengan konversi otomatis ke invoice saat realisasi.
- **Aging Piutang** real-time dalam bucket 0-30 / 31-60 / 61-90 / >90 hari, lengkap dengan jadwal piutang jatuh tempo untuk kebutuhan collection.
- **Cancel & Return** yang membatalkan invoice sekaligus membalik posting GL secara otomatis — tidak perlu jurnal koreksi manual.
- **Excel Export per-item** — daftar invoice di-export sebagai 1 baris per item (bukan per invoice), termasuk kolom kualitas/timbangan untuk pembelian.

### 3. Pembelian & Hutang

- **Invoice Pembelian** per-item dengan PPN masukan per baris, biaya lain, dan auto-posting `DR Persediaan (atau Beban) / CR Hutang`. **Satu invoice dapat menagih beberapa STT/BPB sekaligus** (pilih ganda); mode "dari STT" menghitung harga/kg otomatis dari total invoice dibagi qty STT.
- **STT / BPB (Penerimaan Barang)** dengan guard WAC: harga satuan 0 ditolak untuk barang milik sendiri (barang titipan pelanggan dikecualikan). Edit atau batal STT **per baris movement diblokir** — pembatalan dan revisi dilakukan dari halaman STT agar jurnal GRNI selalu ikut terbalik.
- **Pengajuan invoice pembelian** oleh staf non-admin menampilkan konteks lengkap bagi penyetuju: STT terkait, lampiran, hutang dan deposit pemasok, harga pembelian sebelumnya, serta pengecekan qty terhadap STT (memperhitungkan refaksi).
- **Pembayaran ke Vendor** dengan auto-alokasi, split, dan dukungan deposit ke vendor untuk pembelian yang dibayar di muka.
- **Aging Hutang** dan jadwal hutang jatuh tempo untuk perencanaan arus kas keluar.
- **Cancel Invoice** otomatis membalik posting ke persediaan, hutang, dan PPN masukan.

### 4. Bank, Kas & Rekonsiliasi

- **Kas & Bank multi-akun** (kas kecil, kas besar, BRI, Mandiri, BCA, dll.) masing-masing dengan saldo real-time.
- **Rekonsiliasi Bank** — upload mutasi bank (CSV/Excel) lalu cocokkan dengan transaksi di buku; tandai *matched* / *outstanding* / *bank-only*; hitung *reconciled balance* otomatis.
- **Transfer antar Kas/Bank** dengan posting double-entry otomatis.
- **Transaksi Bank/Kas** menggabungkan pembayaran dan jurnal manual (biaya adm bank, bunga, pindah-buku); setiap baris dapat dibuka ke **detail jurnal**.
- **Tagihan GA** — antrian tagihan dari modul EAM (pajak/STNK/KIR, riwayat servis, permintaan barang) yang diposting akuntan sebagai **jurnal langsung** (DR beban / CR kas) atau **faktur pembelian** (hutang). Satu tagihan satu jurnal, pembatalan dapat dibalik. Akun default pajak kendaraan: **6.41 Beban Pajak & Perizinan Kendaraan**.

### 5. Stok & Produksi

- **Inventori multi-item** dengan pencatatan *moving average cost* untuk HPP akurat.
- **Mutasi Stok** masuk/keluar manual, dengan posting GL otomatis ke persediaan dan HPP.
- **Stock Opname** (penghitungan fisik) dengan pencatatan selisih yang otomatis posting sebagai penyesuaian persediaan; nilai/satuan dapat diinput manual, dan submit tidak terblokir oleh item minus historis yang tidak disentuh.
- **Produksi** dengan pola *konversi bahan baku → produk jadi + by-product* (cocok untuk rice mill: gabah → beras + sekam + dedak), termasuk perhitungan rendemen dan HPP otomatis. Detail produksi menampilkan **modal bahan baku murni (WAC2)** dan tersedia laporan **Modal Produksi per Periode**; jurnal terbaru (revisi `-R1`/`-R2`) ditampilkan di detail.
- **Pemisahan beban konversi** — kredit biaya konversi produksi dibukukan ke akun **5.12 Biaya Konversi Dibebankan ke Persediaan**, terpisah dari **5.1 HPP**, sehingga HPP laporan hanya mencerminkan barang yang benar-benar terjual.
- **Antrian koreksi HPP (COGS backfill)** — saat barang keluar lebih dulu dari produksinya (stok sementara minus), selisih HPP diselesaikan otomatis begitu produksi/pembelian masuk. Pembatalan atau edit dokumen pemicu (**produksi, invoice pembelian, mutasi manual**) kini **membalik penyelesaian itu secara otomatis** (jurnal dan antrian kembali ke kondisi semula).
- **Barang titipan pelanggan** (mis. beras maklon) dicatat hanya sebagai stok tanpa jurnal; nilai HPP produk jadi tidak ikut memuat bahan titipan.
- **Import Saldo Awal** via Excel untuk migrasi dari sistem lama.

### 6. Aset Tetap & Depresiasi

- **Register Aset Tetap** dengan kategori, tanggal perolehan, metode penyusutan (garis lurus), masa manfaat, dan nilai residu.
- **Depresiasi Otomatis** per periode (bulanan) dengan jurnal yang terposting otomatis ke akun beban penyusutan dan akumulasi penyusutan.
- **Disposisi Aset** (penjualan/penghapusan) dengan perhitungan untung/rugi pelepasan otomatis.

### 6.1 EAM — Enterprise Asset Management (`client-eam/`)

Aplikasi frontend **standalone** di `eam.panganmasadepan.com`, tapi **tetap satu monorepo** — satu backend/API, satu database, satu akun login dengan ERP utama. Cocok untuk staf lapangan (mekanik, GA) yang hanya butuh modul aset tanpa harus buka menu keuangan.

- **Login SSO** cross-subdomain — 1 akun ERP otomatis berlaku di EAM (shared cookie `.panganmasadepan.com`), tanpa login ulang.
- **Dashboard ringkas**: total aset, nilai buku (NBV), work order aktif & overdue, breakdown nilai per kategori, quick links ke tiap modul.
- **Modul aset per kategori**: Kendaraan, Gedung & Sewa, Equipment & Kalibrasi, Inventaris GA, Dokumen & Sertifikat, Maintenance/Work Order, Permintaan Barang, Master Data — tiap halaman otomatis terfilter ke kategorinya sendiri (`?categoryId=` multi-value di API, backward-compatible dengan ERP utama).
- **QR aset publik** tetap bisa diakses tanpa login (scan barcode aset fisik).
- **Pengajuan terpusat** — ajukan servis dan pajak/STNK/KIR lewat pilihan kendaraan, dengan monitor status; pengajuan servis yang disetujui **otomatis membuat Work Order**, dan menutup WO otomatis mencatat **riwayat servis kendaraan**.
- **Maintenance / Work Order** dengan foto, checklist, dan suku cadang; **Permintaan Barang (MR)** menaut WO → MR → persetujuan → penerimaan (stok GA bertambah otomatis) → pembayaran. **Export Excel** rekap WO.
- **Inventaris GA** dengan foto per item, tab dashboard stok dan tab Tools (opname cepat, export CSV), serta peringatan lokasi gudang kosong.
- Modul GA di ERP utama **tetap aktif** dan tersinkron real-time dua arah dengan EAM (data & aksi lewat API + DB yang sama, bukan salinan/replika).

#### 6.1.1 Manajemen Kendaraan (Fleet)

Tersedia identik di ERP utama (menu EAM) maupun aplikasi EAM — data & API sama.

- **Data kendaraan** (plat, merek, tipe, mesin/rangka, BBM, kapasitas tangki, odometer) + penugasan driver/PIC.
- **Pajak & STNK/KIR, Asuransi** dengan lampiran dokumen dan reminder jatuh tempo.
- **Log BBM**, **monitoring ban per posisi** (nomor seri), **log ganti oli** dengan target odometer berikutnya.
- **Inspeksi berkala komprehensif** — checklist 33 sub-item dalam 6 kategori (Mesin & Cairan, Kelistrikan, Rem & Kemudi, Ban & Roda, Keselamatan, Lain-lain) dengan 3 status per sub-item (OK / Perlu Perhatian / Rusak), **foto bukti per kategori**, **nama inspektor**, **level BBM saat inspeksi**, dan **jadwal inspeksi berikutnya otomatis** (default 30 hari) lengkap dengan reminder jatuh tempo serta KPI armada "Inspeksi Jatuh Tempo". Riwayat inspeksi format lama tetap terbaca.
- **Insiden/kecelakaan**, **riwayat service**, **pengajuan service** dengan flow approval, dan **Report Kendaraan** (analisis biaya & kepatuhan per armada).

### 7. Laporan & Analisa

Laporan utama tersedia dengan *drill-down*: klik angka di laporan → langsung ke detail transaksi sumber. **10 laporan keuangan** siap pakai:

- **Trial Balance** — ringkasan seluruh saldo akun per tanggal tertentu
- **Laba/Rugi (Profit & Loss)** — periode bebas, comparative vs periode sebelumnya, break-down per kategori pendapatan/beban
- **Neraca (Balance Sheet)** — posisi keuangan per tanggal cut-off, termasuk ekuitas dan laba tahun berjalan
- **Arus Kas (Cash Flow)** — metode langsung, pemasukan/pengeluaran per akun kas & bank
- **Aging Piutang & Hutang** — bucket umur lengkap per pelanggan/vendor
- **Jadwal Piutang & Hutang** — daftar invoice jatuh tempo
- **Buku Besar per Akun (Ledger Book)** — mutasi detail per akun dengan saldo berjalan
- **Laporan Pajak** — rekap PPN keluaran/masukan bulanan untuk kebutuhan SPT Masa
- **Laporan HPP** — rincian harga pokok penjualan per periode
- **Laporan Harian** — ringkasan aktivitas operasional per hari
- **Export** setiap laporan ke **PDF** (siap cetak, **kop dan logo perusahaan** pada semua laporan) dan **Excel** (untuk analisa lanjutan)

### 8. Operasional & Otomasi

- **Dashboard real-time** multi-tab (Overview / Keuangan / Sales / Stok / Produksi) dengan widget yang bisa di-toggle sesuai kebutuhan user.
- **Transaksi Berulang (Recurring)** — template jurnal untuk beban rutin (sewa, gaji, langganan) yang auto-generate per jadwal harian/mingguan/bulanan.
- **Approval Workflow** berbasis aturan (per tipe dokumen + threshold nominal). Pengajuan oleh staf ditahan sampai disetujui — efek GL/stok baru terjadi setelah *approve* (gate "approve-before-effect"). Manajer dapat **menyetujui / menolak / minta revisi langsung dari tombol di Telegram** (tanpa buka aplikasi), atau lewat halaman Approval; pesan memuat detail + link langsung ke pengajuan.
- **Notifikasi** terintegrasi (invoice jatuh tempo, stok di bawah minimum, approval pending, hasil keputusan) — in-app **dan** ke **Telegram**: japri pribadi per-staf yang sudah menautkan akun (via `/start`) + mirror ke grup opsional.
- **AIRA Asisten** — asisten AI di dalam ERP untuk menjawab pertanyaan data dan menyiapkan draf transaksi. Semua aksi yang mengubah pembukuan melewati **persetujuan manusia** (tidak ada posting otomatis tanpa approve).
- **Global Search (Ctrl + K)** — command palette untuk cari invoice, pelanggan, akun, transaksi dari mana saja di aplikasi.
- **Health Check Page** — diagnosa otomatis kesehatan data (saldo tidak balance, invoice orphan, mapping akun hilang, dsb.) untuk memastikan integritas data.

### 9. Governance, Keamanan & Data

- **Role & Hak Akses Dinamis (RBAC)** — selain 4 role bawaan (Admin / Accountant / StaffProduksi / Viewer), Admin dapat **membuat/menghapus role custom sendiri** (mis. Kasir, Auditor, Staf Pembelian) dan mengatur **matriks izin per modul (Lihat / Edit) + hak khusus** (setujui pengajuan, lewati approval, batalkan/finalisasi dokumen, bypass stok minus, kelola hak akses) langsung dari **Pengaturan → Hak Akses** — tanpa ubah kode. Menu, route, dan tombol aksi otomatis mengikuti izin; enforcement di sisi server. Role `Admin` = super-admin (akses penuh, tak bisa dikunci).
- **Audit Trail** lengkap — setiap insert/update/delete tercatat dengan user, timestamp, dan *before/after* value. Dapat difilter per user, tabel, atau periode.
- **Manajemen User** dengan reset password, deaktivasi, dan penguncian akun otomatis setelah percobaan login gagal berlebihan (rate limiting).
- **JWT Authentication** dengan *short-lived token* + refresh strategy; password di-hash bcrypt 12 rounds.
- **Backup & Restore** via UI — download snapshot SQL, upload restore file, atau jadwalkan backup otomatis via cron di sisi server.
- **Attachments** — lampirkan dokumen pendukung (PDF bukti, foto nota) ke invoice atau jurnal; tersimpan di volume terpisah dengan link dari record.

### 10. Pengalaman Pengguna (UX)

- **Progressive Web App (PWA)** — bisa di-install di desktop atau ponsel seperti aplikasi native, dengan *offline-ready* shell.
- **Dark Mode** (light / dark / mengikuti sistem) untuk kenyamanan jangka panjang.
- **Keyboard-first** — hotkey untuk navigasi utama, form submit, dan aksi umum; mengurangi ketergantungan pada mouse untuk user power.
- **Responsive** — UI beradaptasi untuk desktop, tablet, dan mobile.
- **Bahasa Indonesia sepenuhnya** pada UI; kode & komentar dalam Bahasa Inggris sesuai praktik internasional.

## 🚀 Quickstart (Docker)

### Prasyarat

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) atau Docker Engine + Compose
- Git

### 1. Clone repository

```bash
git clone https://github.com/ArahKarya/simple-erp.git
cd simple-erp
```

### 2. Buat file `.env`

```bash
cp .env.docker.example .env
```

Edit `.env` — **WAJIB ganti `JWT_SECRET`**:

```env
POSTGRES_USER=keuangan
POSTGRES_PASSWORD=keuangan_secret_2026
POSTGRES_DB=keuangan_db
PORT=3001

# WAJIB diganti! Generate: openssl rand -hex 48
JWT_SECRET=paste-hasil-generate-disini

ALLOWED_ORIGINS=http://localhost:3001
```

Generate JWT secret:

```bash
openssl rand -hex 48
```

### 3. Build & jalankan

```bash
docker compose up -d --build
```

Tunggu ~30 detik, lalu cek log:

```bash
docker compose logs -f app
```

Output yang diharapkan:

```
[APP] Database connected.
[APP] Migrations complete.
[APP] Database kosong, menjalankan seed data awal...
[APP] Seed selesai — login: admin@arahkarya.com / Adminarahkarya123!dsw
[APP] Starting Keuangan ERP on port 3001...
Server running at http://localhost:3001
```

### 4. Buka aplikasi

```
http://localhost:3001
```

## 🔑 Login Default (Demo)

Setelah seed pertama, aplikasi punya 4 akun default siap pakai:

| Username / Email            | Password                   | Role          | Akses |
|-----------------------------|----------------------------|---------------|-------|
| `admin@arahkarya.com`       | `Adminarahkarya123!dsw`    | Admin         | Full access — semua modul, user management, settings |
| `staff@keuangan.local`      | `Admin123!`                | Accountant    | Transaksi keuangan, invoice, jurnal, laporan |
| `produksi@keuangan.local`   | `Admin123!`                | StaffProduksi | Pembelian, stok & produksi, vendor (read-only untuk uang muka) |
| `viewer@keuangan.local`     | `Admin123!`                | Viewer        | Read-only semua data |

> **Field login menerima email atau username** (misal `admin` saja tanpa domain juga jalan).

> ⚠️ **Ganti password default segera setelah login pertama di production.** Bisa via menu user di header → "Ganti Password", atau via Onboarding Wizard. Password bisa di-override saat seed pakai env `SEED_ADMIN_PASSWORD`.

## 🐳 Perintah Docker Harian

```bash
# Start / stop / restart
docker compose up -d
docker compose down
docker compose restart

# Lihat log
docker compose logs -f app
docker compose logs -f db

# Status container
docker compose ps
```

### Update aplikasi

**Untuk production**, pin ke tag release stabil (bukan `main`):

```bash
bash scripts/backup.sh           # WAJIB sebelum update
git fetch --tags
git checkout vX.Y.Z              # cek GitHub Releases
docker compose up -d --build
```

Data aman — tersimpan di Docker volume `pgdata`, tidak terhapus saat rebuild. Prosedur update lengkap + kebijakan semver + breaking change handling di [MIGRATION.md](./MIGRATION.md).

### Backup database

```bash
# Via command line
docker compose exec db pg_dump -U keuangan keuangan_db > backup-$(date +%Y%m%d).sql

# Atau via UI: Pengaturan → tab Backup → "Buat Backup Sekarang"
```

### Restore database

```bash
# Via command line
docker compose exec -T db psql -U keuangan keuangan_db < backup-20260323.sql

# Atau via UI: Pengaturan → tab Backup → pilih file → Restore
```

### Reset total (HAPUS SEMUA DATA)

```bash
docker compose down -v    # -v menghapus volume = hapus database
docker compose up -d --build   # fresh start + auto-seed
```

## 🌐 Deploy ke Server / Raspberry Pi

### Opsi 1: Docker Compose (Recommended)

```bash
git clone https://github.com/ArahKarya/simple-erp.git
cd simple-erp

cp .env.docker.example .env
nano .env   # Set JWT_SECRET dan ALLOWED_ORIGINS

docker compose up -d --build
```

### Opsi 2: Cloudflare Tunnel

```bash
# .env
ALLOWED_ORIGINS=http://localhost:3001,https://erp.panganmasadepan.com

docker compose up -d --build

# Terminal terpisah
cloudflared tunnel --url http://localhost:3001
```

### Opsi 3: Reverse proxy (Nginx)

```nginx
server {
    listen 80;
    server_name erp.panganmasadepan.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🧾 Akun Sistem (System Account Roles)

Akun-akun ini digunakan oleh sistem untuk auto GL posting. Semua bisa dikonfigurasi via **Pengaturan > Akun Sistem** tanpa mengubah kode — jadi bisa dipakai untuk berbagai jenis industri.

| Grup | Role | Default COA | Fungsi |
|---|---|---|---|
| **Kas & Bank** | CASH (multi) | 1.1.1–1.1.5 | Akun kas/bank untuk pembayaran |
| **Piutang & Hutang** | AR, AP | 1.2.1, 2.1.1 | Auto-posting invoice |
| | ALLOWANCE_DOUBTFUL | 1.2.5 | Cadangan kerugian piutang |
| | BAD_DEBT_EXPENSE | 6.27 | Beban piutang tak tertagih |
| **Persediaan & HPP** | INVENTORY, COGS | 1.4.0, 5 | Persediaan & HPP |
| **Pendapatan** | SALES, SERVICE_REVENUE | 4.1, 4.2 | Pendapatan penjualan & jasa |
| | SALES_DISCOUNT, SALES_RETURN | 4.4, 4.3 | Contra revenue |
| **Pajak** | TAX_INPUT, TAX_OUTPUT | 1.5.3, 2.2.1 | PPN Masukan & Keluaran |
| | INCOME_TAX_EXPENSE | 6.17 | Beban PPh Badan |
| **Deposit** | VENDOR_DEPOSIT, CUSTOMER_DEPOSIT | 1.3, 2.1.2 | Uang muka vendor/pelanggan |
| **Aset Tetap** | FIXED_ASSET (multi) | 1.6.1–1.6.5 | Aset tetap per kategori |
| | ACCUM_DEPRECIATION (multi) | 1.7.1–1.7.4 | Akumulasi penyusutan |
| | DEPRECIATION_EXPENSE (multi) | 6.21–6.24 | Beban penyusutan |
| **Bank & Bunga** | BANK_CHARGE, INTEREST_EXPENSE | 8.2, 8.1 | Biaya bank & bunga pinjaman |
| | INTEREST_INCOME | 7.1 | Pendapatan bunga |
| **Selisih Kurs** | FX_GAIN_LOSS, FX_UNREALIZED | 8.4, 8.5 | Laba/rugi kurs |
| **Akrual** | PREPAID_EXPENSE (multi) | 1.5.1–1.5.2 | Biaya dibayar dimuka |
| | ACCRUED_EXPENSE | 2.2.6 | Hutang beban akrual |
| **Lain-lain** | OTHER_INCOME, OTHER_EXPENSE | 7.4, 8.7 | Non-operating income/expense |
| | SHIPPING_EXPENSE | 6.14 | Beban pengiriman |
| | ROUNDING_ACCOUNT | 8.8 | Pembulatan & selisih |
| **Ekuitas** | OPENING_EQUITY, RETAINED_EARNINGS | 3.1, 3.2 | Saldo awal & laba ditahan |
| | CURRENT_PROFIT, OWNER_DRAWING | 3.4, 3.5 | Laba berjalan & prive |

## 🩺 Troubleshooting

### App tidak start / crash loop

```bash
docker compose logs app    # lihat error
```

Penyebab umum:
- `JWT_SECRET is still set to the placeholder value` → Edit `.env`, ganti JWT_SECRET
- `Database connection refused` → Pastikan container db running: `docker compose ps`
- Port 3001 sudah dipakai → Ubah `PORT=3002` di `.env`

### Lupa password admin

```bash
docker compose exec app node -e "
  const bcrypt = require('bcrypt');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  bcrypt.hash('NewPassword123!', 12).then(hash =>
    prisma.user.update({ where: { email: 'admin@arahkarya.com' }, data: { passwordHash: hash } })
  ).then(() => { console.log('Password reset!'); process.exit(0); });
"
```

### Database penuh / lambat

```bash
# Cek ukuran database
docker compose exec db psql -U keuangan -c "SELECT pg_size_pretty(pg_database_size('keuangan_db'));"

# Vacuum (optimasi)
docker compose exec db psql -U keuangan -c "VACUUM ANALYZE;"
```

### Upgrade dari versi lama

```bash
git pull
docker compose up -d --build   # Prisma migrate deploy otomatis
```

Migrasi database dijalankan otomatis saat container start. Data aman.

## 🛠️ Development (tanpa Docker)

```bash
# 1. Jalankan PostgreSQL via Docker (database saja)
docker compose up -d db

# 2. Setup server
cd server
cp .env.example .env    # edit DATABASE_URL
npm install
npm run prisma:migrate
npx prisma db seed
npm run dev             # http://localhost:3001

# 3. Setup client (terminal terpisah)
cd client
npm install
npm run dev             # http://localhost:5173
```

### Script lain

```bash
# Server
npm run build            # Compile TypeScript
npm run test             # Vitest unit tests
npm run prisma:generate  # Regenerate Prisma client

# Client
npm run build            # Vite production build
npm run lint             # ESLint
```

## ✅ Status

- [x] Akuntansi inti — COA, Buku Besar double-entry, Jurnal Umum, 26 akun sistem, tahun fiskal
- [x] Penjualan & piutang — Inquiry, Penawaran, Invoice, pembayaran FIFO, aging, deposit
- [x] Pembelian & hutang — Invoice, pembayaran vendor, aging, cancel auto-reverse
- [x] Bank, kas & rekonsiliasi — multi-akun, rekonsiliasi, transfer
- [x] Stok & produksi — moving average cost, stock opname, konversi rendemen
- [x] Aset tetap & depresiasi otomatis
- [x] 10 laporan keuangan dengan drill-down + export PDF/Excel
- [x] Approval workflow + notifikasi Telegram (approve/reject dari chat)
- [x] RBAC dinamis (role custom + matriks izin per modul)
- [x] Surat Jalan Sementara, tautan ke DO resmi, invoice Rp 0 otomatis Paid
- [x] Reversal otomatis penyelesaian HPP saat dokumen pemicu dibatalkan/diedit
- [x] EAM standalone (kendaraan, WO, MR, inventaris GA) + Tagihan GA ke keuangan
- [x] Audit trail, backup/restore via UI, PWA, dark mode
- [x] Self-hosted Docker Compose, auto-migrate & auto-seed
- [ ] Multi-currency penuh (FX gain/loss tersedia, UI multi-currency menyusul)
- [ ] Modul HRD/payroll (di luar cakupan — ditangani aplikasi HRIS terpisah)

## 🧱 Stack

- **Frontend** — React **19.2**, TypeScript **5.9**, Vite 7, TailwindCSS 4, TanStack Query 5, Recharts, @react-pdf/renderer, Sonner, Lucide
- **Backend** — Node.js 20, Express **5.2**, TypeScript **5.9**, Prisma **7.5**, Zod, Pino, JWT, bcrypt, helmet, express-rate-limit
- **Database** — PostgreSQL **16**
- **Auth** — JWT + bcrypt, RBAC dinamis (role custom + matriks izin per modul, dapat diatur dari UI)
- **Testing** — Vitest (unit), Playwright (E2E)
- **Deploy** — Docker Compose (2 container: `app` + `db`)
- **Skala kode** — **43 route** backend · **79 halaman** · **145 komponen** · **13 PDF template** · **79 migrasi** · 20 berkas uji

## 📄 Lisensi

[MIT](./LICENSE) © 2026 PT Arah Karya Sinergi (AKS)

---

<div align="center"><sub>© 2026 PT Arah Karya Sinergi (AKS)</sub></div>

# 📘 Buku Manual ERP PMD

Panduan lengkap penggunaan aplikasi **ERP PMD** — sistem keuangan & operasional PT Pangan Masa Depan (penggilingan padi). Dari setup awal sampai operasional harian semua modul, lengkap dengan contoh kasus nyata.

> **Versi aplikasi:** 3.3.0 · **Update manual:** Mei 2026
> **Pengguna:** Owner, Manajer, Accountant, Staff Produksi
> **Bahasa antarmuka:** Bahasa Indonesia

---

## Daftar Isi

### Bagian I — Dasar
1. [Pendahuluan & Konsep Dasar](01-pendahuluan.md)
   - Apa itu ERP PMD, peran pengguna, prinsip double-entry, alur dokumen
2. [Setup Awal](02-setup-awal.md)
   - Login pertama, profil perusahaan, tahun buku, user & role, gudang, bagan akun, akun sistem, saldo awal

### Bagian II — Master Data
3. [Master Data](03-master-data.md)
   - Bagan Akun (COA), Pelanggan & Vendor, Master Item/Barang, Gudang

### Bagian III — Modul Operasional
4. [Modul Penjualan](04-modul-penjualan.md)
   - Inquiry → Penawaran → Pesanan (SO) → Surat Jalan → Invoice → Uang Muka Pelanggan
5. [Modul Pembelian](05-modul-pembelian.md)
   - Purchase Order → BPB/STT (Penerimaan) → Invoice Pembelian → Uang Muka Vendor → Landed Cost
6. [Modul Stok & Produksi](06-modul-stok-produksi.md)
   - Stok & Gudang, Transfer, Opname, Produksi (loaded HPP), batch tracking
7. [Modul Bank & Kas](07-modul-bank-kas.md)
   - Penerimaan/Pembayaran, Pindah Buku, Rekonsiliasi Bank, Transaksi Berulang

### Bagian IV — Akuntansi & Laporan
8. [Akuntansi](08-akuntansi.md)
   - Buku Besar, Jurnal Manual, Aset Tetap & Depresiasi, Approval
9. [Laporan Keuangan](09-laporan.md)
   - Neraca, Laba Rugi, Arus Kas, Trial Balance, Aging, Profitabilitas per SKU

### Bagian V — Sistem & Lanjutan
10. [Sistem & Administrasi](10-sistem.md)
    - Manajemen User, Jejak Audit, Health Check, Backup, Pengaturan
11. [Contoh Kasus End-to-End](11-contoh-kasus.md)
    - Skenario nyata penggilingan padi: beli gabah → produksi → jual beras, partial delivery, uang muka, koreksi, dll

---

## Cara Pakai Manual Ini

- **Baru pertama pakai?** Mulai dari Bab 1 → 2 (Setup Awal) berurutan.
- **Sudah jalan, mau pelajari 1 modul?** Langsung ke bab modul terkait.
- **Mau tahu alur lengkap transaksi nyata?** Lihat Bab 11 (Contoh Kasus).
- Setiap bab punya bagian **"Contoh Kasus"** dengan langkah-langkah konkret.

## Peran Pengguna (Role) — Ringkasan

| Role | Akses |
|---|---|
| **Admin** | Semua modul + Pengaturan, User, Audit, Health Check, override khusus |
| **Accountant** | Semua transaksi keuangan & operasional, laporan. Tanpa Pengaturan sistem |
| **StaffProduksi** | Pembelian (PO/STT/PI), Surat Jalan, Stok, Transfer, Produksi. Tanpa keuangan murni |
| **Viewer** | Hanya lihat (read-only) — laporan & data, tidak bisa input |

## Konvensi Penomoran Dokumen

| Prefix | Dokumen |
|---|---|
| `INQ-` | Inquiry |
| `QO-` | Penawaran (Quotation) |
| `PSN-` | Pesanan Penjualan (Sales Order) |
| `DO-` | Surat Jalan (Delivery Order) |
| `SI-` | Invoice Penjualan |
| `PO-` | Purchase Order |
| `STT-` | BPB/STT Penerimaan Barang (Goods Receipt) |
| `PI-` | Invoice Pembelian |
| `PAY-` | Pembayaran (Bank/Kas) |
| `JV-` | Jurnal (Journal Voucher) |
| `SM-` | Pergerakan Stok (Stock Movement) |
| `PR-` | Proses Produksi (Production Run) |
| `SO-` | Stok Opname |
| `ST-` | Transfer Stok |

Format: `<PREFIX>-<TAHUNBULAN>-<NOMOR>` — contoh `SI-202605-0042` = Invoice Penjualan ke-42 di bulan Mei 2026.

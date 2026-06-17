# Bab 1 — Pendahuluan & Konsep Dasar

[← Daftar Isi](README.md) · [Lanjut: Setup Awal →](02-setup-awal.md)

---

## 1.1 Apa itu Simple ERP?

Simple ERP adalah aplikasi terpadu untuk mengelola **keuangan + operasional** Perusahaan, sebuah penggilingan padi. Semua transaksi — beli gabah, produksi beras, jual, terima/bayar uang — tercatat dalam satu sistem dengan **pembukuan double-entry** otomatis.

Artinya: setiap kali staff input transaksi operasional (mis. terima gabah, kirim beras), sistem **otomatis membuat jurnal akuntansi** yang benar. Tidak perlu input jurnal manual dua kali.

**Akses:** aplikasi web di `https://erp.panganmasadepan.com` — bisa dibuka dari komputer, tablet, atau HP (browser). Bisa juga "install" ke layar HP (PWA).

## 1.2 Prinsip Inti yang Wajib Dipahami

### a) Double-Entry (Debit = Kredit)
Setiap transaksi punya 2 sisi yang selalu seimbang. Contoh: jual beras Rp 10jt tunai →
- **Debit** Kas Rp 10jt (kas bertambah)
- **Kredit** Penjualan Rp 10jt (pendapatan bertambah)

Sistem yang hitung otomatis. Anda cukup input transaksi bisnisnya.

### b) Stok Bergerak Lewat Dokumen, Bukan Invoice
Aturan penting di Simple ERP:
- **Barang KELUAR** hanya lewat **Surat Jalan (DO)** — bukan lewat Invoice.
- **Barang MASUK** hanya lewat **BPB/STT (Penerimaan)** — bukan lewat Invoice Pembelian.
- Invoice = **dokumen tagihan** saja (siapa hutang/piutang berapa), tidak menggerakkan stok.

Kenapa? Supaya tidak ada dobel-pengurangan stok, dan arus fisik barang gampang diaudit.

### c) Stok Tidak Boleh Minus (default)
Sistem menolak kirim/pakai barang melebihi stok fisik gudang. Hanya **Admin** yang boleh override (dengan alasan tercatat) untuk kasus khusus seperti produksi yang belum sempat diinput. Lihat [Bab 6](06-modul-stok-produksi.md).

### d) Harga Pokok (HPP) Otomatis
Sistem hitung harga modal rata-rata (WAC — Weighted Average Cost) tiap barang otomatis dari transaksi pembelian + produksi. Saat barang dijual, HPP-nya terkunci dari harga modal saat itu.

## 1.3 Alur Dokumen Lengkap

### Alur Penjualan (Order-to-Cash)
```
Inquiry          → calon customer tanya (opsional)
  ↓
Penawaran (QO)   → kirim penawaran harga (opsional)
  ↓
Pesanan (SO)     → customer setuju, komitmen jual + uang muka (opsional)
  ↓
Surat Jalan (DO) → barang FISIK keluar gudang
  ↓
Invoice (SI)     → tagihan ke customer
  ↓
Pembayaran       → customer bayar → lunas
```

### Alur Pembelian (Procure-to-Pay)
```
Purchase Order   → rencana beli (opsional)
  ↓
BPB / STT        → barang FISIK masuk gudang + akrual hutang
  ↓
Invoice Beli(PI) → harga final + hutang resmi (+ landed cost)
  ↓
Pembayaran       → bayar vendor → lunas
```

### Alur Produksi (penggilingan)
```
Gabah (stok)  → Proses Produksi → Beras + by-product (bekatul/menir/broken)
                                   + hitung HPP loaded otomatis
```

> **Catatan:** langkah ber-label "opsional" boleh dilewati. Misal bisa langsung buat Surat Jalan tanpa Pesanan, atau langsung PI tanpa PO. Tapi untuk barang inventory, **DO dan STT wajib** (lihat prinsip 1.2.b).

## 1.4 Peran Pengguna (Role)

| Role | Untuk siapa | Bisa apa |
|---|---|---|
| **Admin** | Owner / IT | Semua. Termasuk Pengaturan, User, Audit, override stok minus, hapus/batal dokumen |
| **Accountant** | Staff keuangan | Semua transaksi + laporan. Tidak bisa ubah Pengaturan sistem |
| **StaffProduksi** | Staff gudang/pabrik | Pembelian, penerimaan barang, surat jalan, stok, transfer, produksi. Tidak akses keuangan murni |
| **Viewer** | Pengawas/auditor | Lihat saja, tidak bisa input apa-apa |

## 1.5 Navigasi Aplikasi

- **Sidebar kiri**: menu utama dikelompokkan per modul (Penjualan, Pembelian, Stok & Produksi, Bank & Kas, Akuntansi, Master Data, Sistem). Klik grup untuk expand/collapse.
- **Dashboard**: halaman depan — ringkasan KPI keuangan, stok, produksi, aset, dan peringatan (DO belum di-invoice, stok minus, dll).
- **Header**: pencarian global, toggle tema terang/gelap, profil.
- **Tiap halaman daftar**: filter (tanggal, status, cari), klik baris untuk buka detail (drawer samping).

## 1.6 Tips Sebelum Mulai

1. **Backup otomatis** sudah jalan harian — tapi sebelum aksi besar (import, tutup buku), pastikan ada backup.
2. **Update aplikasi**: kalau ada versi baru, muncul notifikasi "Versi terbaru tersedia → Muat Ulang". Klik untuk refresh.
3. **Jangan hapus akun sistem** (lihat [Bab 2](02-setup-awal.md)) — dipakai untuk posting otomatis.
4. Kalau ragu, **Viewer dulu** untuk eksplorasi tanpa risiko ubah data.

---

[← Daftar Isi](README.md) · [Lanjut: Setup Awal →](02-setup-awal.md)

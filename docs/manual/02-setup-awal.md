# Bab 2 — Setup Awal

[← Pendahuluan](01-pendahuluan.md) · [Daftar Isi](README.md) · [Lanjut: Master Data →](03-master-data.md)

---

Bab ini panduan **urutan setup** untuk perusahaan baru yang pertama kali pakai ERP PMD. Ikuti berurutan — tiap langkah jadi fondasi langkah berikutnya.

> ⏱️ **Estimasi waktu setup awal lengkap:** 2-4 jam (tergantung jumlah akun, item, dan saldo awal).

## Urutan Setup (Checklist)

```
[1] Login pertama + ganti password
[2] Profil Perusahaan (nama, logo, alamat)
[3] Tahun Buku (fiscal year)
[4] User & Role (tambah staff)
[5] Daftar Gudang
[6] Bagan Akun (COA) — review/import
[7] Akun Sistem (mapping auto-posting)
[8] Master Item/Barang
[9] Master Pelanggan & Vendor
[10] Saldo Awal (opening balance)
```

---

## 2.1 Login Pertama & Ganti Password

1. Buka `https://erp.panganmasadepan.com`
2. Login dengan kredensial Admin yang diberikan.
3. **Segera ganti password**: menu **Sistem → Manajemen User** → klik user Anda → ubah password.

## 2.2 Profil Perusahaan

Menu **Sistem → Pengaturan → Profil Perusahaan**:
- Nama perusahaan (muncul di invoice, surat jalan, laporan)
- Logo (untuk dokumen PDF) — **catatan**: logo perusahaan ini beda dengan ikon aplikasi (ikon "P" di tab browser)
- Alamat, telepon, NPWP, email
- Format mata uang (default Rupiah)

> Logo & nama otomatis muncul di header semua dokumen cetak (invoice, surat jalan, kwitansi).

## 2.3 Tahun Buku (Fiscal Year)

Menu **Akuntansi → (Pengaturan Tahun Buku)** atau via Pengaturan:
- Buat tahun buku, misal **2026** (1 Jan 2026 – 31 Des 2026).
- Tahun buku harus **aktif (belum ditutup)** supaya transaksi bisa diinput.
- Transaksi hanya bisa di tanggal dalam rentang tahun buku aktif.

> Tutup buku (closing) dilakukan akhir tahun — memindahkan laba ke Laba Ditahan. Jangan tutup buku sebelum semua transaksi tahun itu beres.

## 2.4 User & Role

Menu **Sistem → Manajemen User**:
1. Klik **Tambah User**.
2. Isi nama, email, password awal.
3. Pilih **Role** (Admin / Accountant / StaffProduksi / Viewer — lihat [Bab 1.4](01-pendahuluan.md)).
4. Simpan. Staff login dengan email + password tsb, lalu ganti password sendiri.

**Prinsip pemberian role:**
- Owner → Admin
- Bagian keuangan/pembukuan → Accountant
- Mandor gudang/pabrik → StaffProduksi
- Komisaris/auditor → Viewer

## 2.5 Daftar Gudang

Menu **Stok & Produksi → Daftar Gudang**:
- Buat gudang sesuai lokasi fisik. Contoh PMD: **GILING** (gudang giling) & **POLES** (gudang poles).
- Set **satu gudang sebagai default** (dipakai kalau transaksi tidak pilih gudang spesifik).

> Stok dilacak **per gudang**. Transfer antar gudang pakai modul Transfer Stok (lihat [Bab 6](06-modul-stok-produksi.md)).

## 2.6 Bagan Akun (Chart of Accounts / COA)

Menu **Akuntansi → Bagan Akun**. Ini struktur akun akuntansi (aset, kewajiban, ekuitas, pendapatan, beban).

**Opsi setup:**
- **Pakai COA bawaan** — aplikasi sudah punya COA standar penggilingan (111 akun: kas/bank, piutang, 30+ sub-persediaan gabah/beras, hutang, beban operasional, dll).
- **Import dari Excel** — kalau punya COA sendiri: download template di halaman COA → isi → upload.

**Struktur penomoran** (tanpa leading zero):
| Grup | Range | Contoh |
|---|---|---|
| Aset | 1.x | 1.1.1 Petty Cash, 1.4.x Persediaan, 1.6.x Aset Tetap |
| Kewajiban | 2.x | 2.1.1 Hutang Usaha, 2.1.5 Hutang Belum Tagih |
| Ekuitas | 3.x | 3.1 Ekuitas Saldo Awal, 3.2 Laba Ditahan |
| Pendapatan | 4.x | 4.1 Penjualan, 4.2 Pendapatan Jasa |
| Beban Pokok | 5.x | 5 HPP, 5.11 Selisih Harga Pembelian |
| Beban Operasional | 6.x | 6.6 Transport Karyawan, 6.9 Asuransi |
| Pendapatan/Beban Lain | 7.x / 8.x | 8.8 Pembulatan & Selisih |

> Akun bisa **bertingkat (parent-child)**. Akun "grup" (isGroup) tidak bisa dipakai transaksi langsung — hanya penampung sub-akun.

## 2.7 Akun Sistem (Mapping Auto-Posting) — PENTING

Menu **Sistem → Pengaturan → Akun Sistem**. Ini "jembatan" yang memberitahu sistem akun mana dipakai untuk posting otomatis.

| Peran Sistem | Akun Default | Dipakai saat |
|---|---|---|
| Kas/Bank | 1.1.1–1.1.5 | Terima/bayar uang |
| Piutang Usaha (AR) | 1.2.1 | Invoice penjualan dibuat |
| Persediaan (Inventory) | 1.4.0 | Stok masuk/keluar |
| Hutang Usaha (AP) | 2.1.1 | Invoice pembelian dibuat |
| Hutang Belum Tagih | 2.1.5 | STT submit (akrual sebelum PI) |
| Uang Muka Penjualan | 2.1.2 | Terima DP customer |
| Uang Muka Pembelian | 1.3 | Bayar DP vendor |
| Penjualan | 4.1 | Pendapatan penjualan |
| HPP (COGS) | 5 | Barang terjual |
| Selisih Harga Pembelian | 5.11 | Variance harga (jarang dipakai sejak landed cost) |
| Ekuitas Saldo Awal | 3.1 | Input saldo awal |
| Selisih Persediaan | 8.8 | Penyesuaian opname/koreksi |

> ⚠️ **Wajib lengkap sebelum transaksi.** Saat aplikasi start, ada validasi — kalau ada mapping kosong muncul peringatan. Jangan hapus/ubah akun yang sudah ter-mapping kecuali paham dampaknya.

## 2.8 Master Item / Barang

Menu **Stok & Produksi → Stok & Gudang → (Tambah Item)**. Detail lengkap di [Bab 3](03-master-data.md). Minimal isi:
- Kode item (mis. `GKP-IR` = Gabah Kering Panen IR)
- Nama, satuan (Kg/Sak/dll)
- **Akun persediaan** (link ke COA 1.4.x) — supaya nilai stok masuk akun yang benar
- Stok minimum (untuk alert reorder) — opsional

## 2.9 Master Pelanggan & Vendor

Menu **Master Data → Pelanggan & Vendor**:
- Tambah customer & supplier.
- Tipe: **Customer**, **Supplier**, atau **Both**.
- Isi nama, kontak, NPWP. Saldo awal piutang/hutang bisa diisi di sini (atau via langkah 2.10).

## 2.10 Saldo Awal (Opening Balance)

Kalau pindah dari sistem lama, input saldo awal supaya neraca benar. Beberapa cara:

**a) Saldo awal akun (kas, bank, modal, dll):**
Menu **Bagan Akun → Set Saldo Awal** per akun. Lawan otomatis ke **3.1 Ekuitas Saldo Awal**.

**b) Saldo awal stok:**
Saat buat Master Item, isi `openingQty` + `openingPrice`. Atau import via Excel. Sistem buat stok awal + nilai persediaan.

**c) Saldo awal piutang/hutang:**
Isi `openingBalance` di master Pelanggan/Vendor, atau buat invoice saldo-awal.

**d) Saldo awal aset tetap:**
Menu **Akuntansi → Aset Tetap** → import CSV / input manual + posting opening balance JE (lihat [Bab 8](08-akuntansi.md)).

> ✅ **Verifikasi:** setelah semua saldo awal masuk, buka **Laporan → Neraca**. Total Aset harus = Kewajiban + Ekuitas. Kalau tidak balance, cek lagi saldo awal yang terlewat.

---

## Contoh Kasus: Setup PMD dari Nol

1. Login Admin → ganti password.
2. Profil: "PT Pangan Masa Depan", upload logo, alamat Indramayu.
3. Tahun buku 2026 (aktif).
4. Tambah user: Bambang (Admin), Nurya (Admin), staff keuangan (Accountant), Adi (StaffProduksi).
5. Gudang: GILING (default), POLES.
6. COA: pakai bawaan 111 akun penggilingan.
7. Akun sistem: pastikan semua ter-mapping (cek peringatan startup).
8. Master item: GKP-IR, GKP-KEBO, beras (Cruise/Walemu/Pagi Jaya), by-product (bekatul, menir, broken) — isi akun persediaan masing-masing.
9. Master party: vendor (Basri, dll), customer (Bulog, BGN Viva, dll).
10. Saldo awal: stok gabah/beras per gudang, saldo kas/bank, piutang/hutang berjalan.
11. Cek Neraca balance → siap operasional.

---

[← Pendahuluan](01-pendahuluan.md) · [Daftar Isi](README.md) · [Lanjut: Master Data →](03-master-data.md)

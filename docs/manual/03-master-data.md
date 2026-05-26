# Bab 3 — Master Data

[← Setup Awal](02-setup-awal.md) · [Daftar Isi](README.md) · [Lanjut: Penjualan →](04-modul-penjualan.md)

---

Master data = data dasar yang dipakai berulang di transaksi. Setup sekali, pakai terus.

## 3.1 Bagan Akun (COA)

Menu **Akuntansi → Bagan Akun**.

**Fungsi:** kerangka akuntansi. Semua transaksi posting ke akun-akun ini.

**Aksi:**
- **Tambah akun**: nomor, nama, tipe (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE), parent (opsional), centang "Grup" kalau jadi penampung sub-akun.
- **Edit / nonaktif**: akun yang sudah dipakai transaksi tidak bisa dihapus (hanya dinonaktifkan) — jaga integritas histori.
- **Set Saldo Awal**: untuk migrasi dari sistem lama.
- **Import/Export Excel**: bulk edit.

> **Tips:** buat sub-akun persediaan sedetail produk (mis. 1.4.5 Gabah IR Basah, 1.4.20 Cruise 25KG) supaya nilai stok per jenis kelihatan di Neraca.

## 3.2 Pelanggan & Vendor (Parties)

Menu **Master Data → Pelanggan & Vendor**.

**Field penting:**
- Nama, kode, tipe (**Customer** / **Supplier** / **Both**)
- Kontak: telepon, email, alamat, NPWP
- Saldo piutang/hutang berjalan (otomatis terhitung dari transaksi)
- Saldo uang muka (DP) — otomatis dari modul deposit

**Yang ditampilkan di kartu party:**
- Outstanding (piutang kalau customer, hutang kalau supplier)
- Saldo uang muka

> Satu party bisa jadi Customer **dan** Supplier sekaligus (tipe "Both") — berguna kalau vendor gabah juga beli beras.

## 3.3 Master Item / Barang

Menu **Stok & Produksi → Stok & Gudang**.

**Field penting:**
| Field | Keterangan |
|---|---|
| Kode | Unik, mis. `GKP-IR`, `BRS-PGC-25KG` |
| Nama | Nama barang |
| Satuan | Kg, Sak, Pcs, Liter, dll |
| Kategori | Pengelompokan (gabah, beras, by-product) |
| **Akun Persediaan** | Link COA 1.4.x — wajib supaya nilai stok benar |
| Stok minimum | Alert kalau stok ≤ ini |
| Harga jual default | Opsional, auto-fill di invoice |
| Stok awal (qty + harga) | Saat setup migrasi |

**Average Cost (WAC):** harga modal rata-rata, dihitung **otomatis** sistem dari pembelian + produksi. Jangan diisi manual — biarkan sistem yang kelola. (Bisa dikoreksi via Stok Opname kalau perlu.)

**Jenis item:**
- **Inventory** (punya akun persediaan) → stok dilacak, wajib lewat DO/STT
- **Jasa** (tanpa akun persediaan) → tidak ada stok, boleh langsung di invoice (mis. "Ongkos kirim", "Komisi")

## 3.4 Gudang

Menu **Stok & Produksi → Daftar Gudang**.
- Tambah/edit gudang, set default.
- Stok dilacak per gudang. Lihat per-gudang di **Dashboard Per Gudang**.

---

## Contoh Kasus: Tambah Produk Beras Baru

PMD mulai produksi "Beras Pandan Wangi 25Kg":
1. **Master Item** → Tambah:
   - Kode `BRS-PW-25KG`, nama "Beras Pandan Wangi 25Kg", satuan Kg
   - Kategori: Beras
   - Akun persediaan: pilih/buat 1.4.x "Persediaan Beras Pandan Wangi"
   - Stok minimum: 500 Kg
   - Harga jual default: Rp 16.000/Kg
2. Simpan. Item siap dipakai di produksi (sebagai output) & penjualan.
3. Average cost akan terisi otomatis saat produksi pertama menghasilkan produk ini.

---

[← Setup Awal](02-setup-awal.md) · [Daftar Isi](README.md) · [Lanjut: Penjualan →](04-modul-penjualan.md)

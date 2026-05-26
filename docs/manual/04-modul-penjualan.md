# Bab 4 — Modul Penjualan

[← Master Data](03-master-data.md) · [Daftar Isi](README.md) · [Lanjut: Pembelian →](05-modul-pembelian.md)

---

Modul penjualan mengikuti alur **Order-to-Cash**. Setiap langkah punya menu sendiri di grup **Penjualan**.

```
Inquiry → Penawaran (QO) → Pesanan (SO) → Surat Jalan (DO) → Invoice (SI) → Bayar
(opsional)  (opsional)     (opsional)      WAJIB utk stok     tagihan
```

> **Inti yang wajib diingat:** untuk barang inventory, **Surat Jalan (DO) wajib dibuat dulu**, baru bisa Invoice. Invoice tidak bisa langsung mengurangi stok.

---

## 4.1 Inquiry (Pertanyaan Calon Pelanggan)

Menu **Penjualan → Inquiry**. Catat prospek/lead sebelum penawaran resmi.

- **Fungsi:** tracking calon customer yang tanya-tanya (via WA/telp/email/walk-in).
- **Status:** Baru → Diproses → Dikonversi / Hilang / Ditutup.
- **Public form:** ada halaman `/tanya` yang bisa diisi customer sendiri (link bisa di-share via WA/QR), otomatis masuk pipeline.
- **Konversi:** Inquiry yang serius → konversi jadi Penawaran.

> Inquiry murni catatan sales — **tidak ada dampak akuntansi/stok**.

## 4.2 Penawaran (Quotation / QO)

Menu **Penjualan → Penawaran**. Dokumen penawaran harga resmi ke customer.

- **Buat:** pilih customer, tambah item + qty + harga + diskon, set berlaku-sampai (validUntil).
- **Status:** Draft → Terkirim → Diterima / Ditolak / Kadaluarsa.
- **Auto-expire:** penawaran "Terkirim" yang lewat validUntil otomatis jadi Kadaluarsa (+ notifikasi 3 hari sebelumnya).
- **Cetak PDF** & **Export Excel** tersedia.
- **Konversi:** penawaran "Diterima" → bisa konversi jadi Invoice / Pesanan.

> Tidak ada dampak akuntansi/stok sampai dikonversi.

## 4.3 Pesanan Penjualan (Sales Order / SO / PSN)

Menu **Penjualan → Pesanan (SO)**. **Komitmen jual** — customer sudah deal.

- **Buat:** pilih customer, item + qty + harga, target pengiriman, no. PO customer.
- **Status:** Draft → Disubmit → Sebagian Terkirim → Selesai Dikirim / Dibatalkan.
- **Submit:** mengunci pesanan (tidak ada dampak stok/akuntansi — murni komitmen).
- **Uang Muka (DP):** dari layar SO bisa **Terima Uang Muka** — lihat 4.7.
- **Generate Surat Jalan:** dari SO, klik "Buat Surat Jalan" → pilih item + qty (bisa sebagian/partial) + gudang → DO otomatis terbuat & ter-link SO.

### Partial Delivery (kirim bertahap)
PO 100 ton bisa dikirim 10 ton-an:
- Tiap "Buat Surat Jalan", isi qty 10 → DO baru, SO status "Sebagian Terkirim".
- Sistem track `terkirim X / total Y`, tolak kalau qty > sisa.
- Ulangi sampai genap → status "Selesai Dikirim".
- Satu SO bisa punya banyak DO.

## 4.4 Surat Jalan (Delivery Order / DO)

Menu **Penjualan → Surat Jalan**. **Dokumen barang fisik keluar gudang.**

- **Buat:** pilih customer, item + qty + **gudang sumber**, info sopir/no. mobil. (Atau generate dari SO — lebih disarankan.)
- **Saat submit:** stok **berkurang** dari gudang. Stok movement (SM Out) terbuat, harga modal (HPP) terkunci dari average cost saat itu. **Belum ada jurnal** (jurnal nanti di Invoice).
- **Lampiran:** bisa upload foto bukti kirim / jembatan timbang (JPG/PNG/PDF, maks 5MB).
- **Cetak PDF** surat jalan tersedia.
- **Stok kurang?** Submit ditolak (kecuali Admin override — lihat [Bab 6](06-modul-stok-produksi.md)).

> ⚠️ DO yang sudah jadi Invoice tidak bisa dibatalkan langsung — batalkan invoice-nya dulu.

## 4.5 Invoice Penjualan (Sales Invoice / SI)

Menu **Penjualan → Invoice Penjualan**. **Tagihan resmi ke customer.**

- **Buat:** pilih customer → **pilih dari DO pending** (item inventory wajib dari DO). Bisa gabung beberapa DO jadi 1 invoice.
- **Item jasa** (non-inventory, mis. ongkos kirim) boleh ditambah langsung.
- **Saat submit, jurnal otomatis:**
  - DR Piutang Usaha (1.2.1) / CR Penjualan (4.1) — sebesar nilai tagihan
  - DR HPP (5) / CR Persediaan (1.4.x) — sebesar harga modal barang (dari DO)
- **Pajak & potongan:** PPN, diskon, biaya lain bisa diatur per invoice/baris.
- **Gunakan Uang Muka:** kalau customer sudah DP, klik "Gunakan Uang Muka" → kurangi tagihan.
- **Pembayaran:** dari invoice atau modul Bank & Kas → catat penerimaan → lunas.
- **Cetak PDF** + **Export Excel** (per-invoice & per-item).

## 4.6 Pembayaran dari Customer

Lihat [Bab 7 — Bank & Kas](07-modul-bank-kas.md). Singkatnya:
- Menu **Bank & Kas → Transaksi** → Penerimaan → pilih customer + invoice yang dibayar.
- Jurnal: DR Kas/Bank / CR Piutang.
- Bisa bayar sebagian (PartiallyPaid) atau lunas (Paid).

## 4.7 Uang Muka Pelanggan (Customer Deposit / DP)

Menu **Penjualan → Uang Muka Pelanggan** (atau tombol "Terima Uang Muka" dari layar SO).

- **Terima DP:** pilih customer (atau dari SO), jumlah, akun kas/bank penerima.
  - Jurnal: DR Kas/Bank / CR Uang Muka Penjualan (2.1.2)
- **Ter-link SO:** kalau DP dibuat dari layar SO, langsung ter-tag — panel SO tampilkan **DP diterima / total / sisa / %**.
- **Apply ke invoice:** saat invoice, "Gunakan Uang Muka" → DR Uang Muka Penjualan / CR Piutang.
- **Refund:** kalau pesanan batal, DP bisa dikembalikan.

---

## Contoh Kasus 1: Jual Beras Tunai Sederhana
Customer datang beli 100 Kg Beras Cruise @ Rp 14.700, bayar tunai:
1. **Surat Jalan** → customer, item Cruise 100 Kg, gudang POLES → submit (stok −100 Kg).
2. **Invoice Penjualan** → pilih DO tadi → grand total Rp 1.470.000 → submit.
   - Jurnal otomatis: DR Piutang 1,47jt / CR Penjualan 1,47jt + DR HPP / CR Persediaan (modal).
3. **Bank & Kas** → Penerimaan → customer bayar Rp 1,47jt tunai ke Petty Cash → invoice Lunas.

## Contoh Kasus 2: PO Besar dengan Uang Muka + Kirim Bertahap
Bulog pesan 100 ton beras, DP 20%, kirim 25 ton/minggu:
1. **Pesanan (SO)** → Bulog, 100 ton @ harga sepakat → submit.
2. Dari SO → **Terima Uang Muka** Rp (20% × total) ke Bank → panel SO: "DP 20%".
3. Minggu 1: dari SO → **Buat Surat Jalan** 25 ton → DO-1 (stok −25 ton), SO "Sebagian Terkirim".
4. **Invoice** dari DO-1 → "Gunakan Uang Muka" (porsi DP) → sisa ditagih.
5. Ulangi minggu 2-4 sampai 100 ton terkirim → SO "Selesai Dikirim", DP habis terpakai.

---

[← Master Data](03-master-data.md) · [Daftar Isi](README.md) · [Lanjut: Pembelian →](05-modul-pembelian.md)

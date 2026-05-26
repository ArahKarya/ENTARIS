# Bab 5 — Modul Pembelian

[← Penjualan](04-modul-penjualan.md) · [Daftar Isi](README.md) · [Lanjut: Stok & Produksi →](06-modul-stok-produksi.md)

---

Modul pembelian mengikuti alur **Procure-to-Pay**. Grup menu **Pembelian**.

```
Purchase Order → BPB/STT (Penerimaan) → Invoice Pembelian (PI) → Bayar
(opsional)       barang FISIK masuk      harga final + hutang
```

> **Inti:** untuk barang inventory, **BPB/STT wajib dibuat dulu** (barang masuk), baru Invoice Pembelian. Stok masuk lewat STT, bukan lewat invoice.

---

## 5.1 Purchase Order (PO)

Menu **Pembelian → Purchase Order**. Rencana/pesanan beli ke vendor.

- **Buat:** pilih vendor, item + qty + estimasi harga.
- **Status:** Draft → Submitted → (dipenuhi STT) → selesai.
- **Tidak ada dampak stok/akuntansi** — hanya rencana.
- **Konversi:** PO → bisa jadi acuan saat buat STT.

> PO opsional. Boleh langsung STT tanpa PO.

## 5.2 BPB / STT — Penerimaan Barang (Goods Receipt)

Menu **Pembelian → BPB / STT (Penerimaan)**. **Dokumen barang fisik masuk gudang.**

- **Buat:** pilih vendor, item + qty + **gudang tujuan** + harga terima (locked unit cost), info sopir/mobil/kualitas.
- **Field khusus gabah:** kualitas, kadar air, timbangan truk, refaksi (susut), nomor mobil.
- **Saat submit:**
  - Stok **bertambah** di gudang. Average cost ter-update (WAC).
  - Jurnal akrual: **DR Persediaan (1.4.x) / CR Hutang Belum Tagih (2.1.5)** — hutang sementara sebelum invoice resmi.
- **Lampiran:** upload **bukti jembatan timbang** / foto (JPG/PNG/PDF, maks 5MB).
- **Cetak PDF** STT tersedia.

> STT yang sudah jadi Invoice (PI) tidak bisa dibatalkan langsung — batalkan PI dulu.

## 5.3 Invoice Pembelian (Purchase Invoice / PI)

Menu **Pembelian → Invoice Pembelian**. **Tagihan resmi dari vendor + harga final.**

- **Buat:** pilih vendor → **pilih dari STT** (item inventory wajib dari STT). Tampil badge STT asal per baris + ringkasan "Barang diterima dari STT/BPB".
- **Saat submit, jurnal otomatis:**
  - **DR Hutang Belum Tagih (2.1.5)** — reverse akrual STT
  - **DR/CR Persediaan** — selisih harga (landed cost, lihat 5.5)
  - **CR Hutang Usaha (2.1.1)** — hutang resmi ke vendor
- **Item tambahan (komisi, refaksi):** baris seperti "Komisi", "Resiko" diserap ke nilai persediaan (landed cost), bukan jadi beban terpisah.
- **Bayar:** dari modul Bank & Kas → Pembayaran ke vendor.

## 5.4 Uang Muka Vendor (Vendor Deposit)

Menu **Pembelian → Uang Muka Vendor**.

- **Bayar DP ke vendor:** DR Uang Muka Pembelian (1.3) / CR Kas/Bank.
- **Apply ke PI:** saat invoice pembelian, gunakan DP → kurangi hutang.
- **Refund:** kalau batal, DP bisa ditarik kembali (offset hutang FIFO + refund kas).

## 5.5 Landed Cost (Harga Pokok Termasuk Biaya Tambahan)

**Konsep penting untuk penggilingan.** Saat beli gabah, sering ada biaya selain harga material: komisi, resiko/refaksi, ongkos. Semua ini **diserap ke harga pokok persediaan**, bukan jadi beban terpisah.

**Rumus:** `Harga modal per Kg = Total invoice (material + komisi + biaya) ÷ Qty fisik (STT)`

**Contoh:** Beli Broken 10.000 Kg @ Rp 12.000 + komisi Rp 1jt:
- Total = Rp 120jt + Rp 1jt = Rp 121jt
- Harga modal = Rp 121jt ÷ 10.000 = **Rp 12.100/Kg** (bukan Rp 12.000)
- Komisi Rp 1jt masuk nilai Persediaan, average cost item naik proporsional.

Sistem hitung otomatis saat PI submit. Selisih vs harga STT provisional disesuaikan ke akun Persediaan.

## 5.6 Pembayaran ke Vendor

Lihat [Bab 7](07-modul-bank-kas.md). Menu **Bank & Kas → Transaksi** → Pembayaran → pilih vendor + PI yang dibayar. Jurnal: DR Hutang / CR Kas/Bank.

---

## Contoh Kasus 1: Beli Gabah dari Petani
Beli Gabah IR 10.426 Kg dari Basri, harga Rp 8.100/Kg + refaksi Rp 220/Kg:
1. **BPB/STT** → vendor Basri, item GKP-IR, qty 10.426 Kg, gudang GILING, harga 8.100, upload foto timbangan.
   - Jurnal: DR Persediaan / CR Hutang Belum Tagih (provisional).
2. **Invoice Pembelian** → pilih STT tadi → tambah baris "Refaksi" → total termasuk refaksi.
   - Landed cost: harga modal per Kg = total ÷ 10.426 = ±Rp 8.288/Kg.
   - Jurnal: reverse akrual + selisih ke Persediaan + CR Hutang Usaha.
3. **Bayar:** Bank & Kas → Pembayaran ke Basri → hutang lunas.

## Contoh Kasus 2: Revisi Harga Setelah Invoice
Nota Basri direvisi: rate naik 7.800 → 7.900 (selisih harus dibayar):
1. Edit harga (kalau PI belum Paid) atau buat jurnal penyesuaian.
2. Selisih × qty → nambah nilai Persediaan + nambah Hutang vendor.
3. PI status jadi PartiallyPaid (ada sisa hutang) → bayar sisa nanti.

> Untuk PI yang sudah Paid, koreksi dilakukan via penyesuaian terkontrol (hubungi Admin).

---

[← Penjualan](04-modul-penjualan.md) · [Daftar Isi](README.md) · [Lanjut: Stok & Produksi →](06-modul-stok-produksi.md)

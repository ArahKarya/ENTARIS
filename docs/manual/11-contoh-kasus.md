# Bab 11 — Contoh Kasus End-to-End

[← Sistem](10-sistem.md) · [Daftar Isi](README.md)

---

Bab ini menggabungkan semua modul dalam skenario nyata penggilingan padi, dari beli gabah sampai jual beras + uang masuk. Ikuti untuk paham alur lengkap.

---

## Kasus 1: Siklus Lengkap Beli Gabah → Produksi → Jual Beras

**Skenario:** Beli 10 ton gabah dari Basri, giling jadi beras, jual ke Bulog.

### Tahap 1 — Beli Gabah (Pembelian)
1. **BPB/STT** → vendor Basri, item GKP-IR 10.000 Kg @ Rp 8.000, gudang GILING.
   - Upload foto jembatan timbang.
   - Jurnal: DR Persediaan Gabah Rp 80jt / CR Hutang Belum Tagih Rp 80jt.
2. **Invoice Pembelian** → pilih STT Basri → (tambah refaksi/komisi kalau ada).
   - Jurnal: reverse akrual + CR Hutang Usaha (harga final).
3. **Bank & Kas → Pembayaran** → bayar Basri → hutang lunas.

### Tahap 2 — Produksi (Giling)
4. **Proses Produksi** → gudang GILING:
   - Input: GKP-IR 10.000 Kg.
   - Output: Beras IR 6.500 Kg (utama) + Bekatul 1.500 + Menir 800 + Broken 1.000 (by-product).
   - Komponen biaya: Listrik + Buruh.
   - Submit → stok gabah −, stok beras + by-product +. HPP loaded beras terhitung. Rendemen 65%.

### Tahap 3 — Transfer ke Gudang Poles (opsional)
5. **Transfer Stok** → Beras IR dari GILING → POLES (kalau poles di gudang beda).

### Tahap 4 — Jual Beras (Penjualan)
6. **Pesanan (SO)** → Bulog pesan 6.000 Kg Beras IR @ Rp 14.000 (opsional, kalau ada PO).
7. **Surat Jalan** → dari SO / langsung → Beras IR 6.000 Kg, gudang POLES → submit (stok −6.000).
8. **Invoice Penjualan** → pilih DO → Rp 84jt.
   - Jurnal: DR Piutang 84jt / CR Penjualan 84jt + DR HPP / CR Persediaan (modal loaded).
9. **Bank & Kas → Penerimaan** → Bulog bayar → piutang lunas.

### Hasil
- **Laba Rugi:** Penjualan 84jt − HPP beras (modal loaded) = laba kotor.
- **Neraca:** kas naik, persediaan turun (beras keluar), hutang/piutang nol.
- **Profitabilitas per SKU:** margin Beras IR kelihatan (loaded vs material).

---

## Kasus 2: PO Besar + Uang Muka + Kirim Bertahap

**Skenario:** BGN Viva pesan 100 ton beras, DP 20%, kirim 25 ton/minggu.

1. **Pesanan (SO)** → BGN Viva, 100 ton @ Rp 14.500 → submit. Total Rp 1,45M.
2. Dari SO → **Terima Uang Muka** Rp 290jt (20%) ke Bank.
   - Jurnal: DR Bank 290jt / CR Uang Muka Penjualan 290jt.
   - Panel SO: "DP 20% diterima, sisa Rp 1,16M".
3. **Minggu 1:** dari SO → **Buat Surat Jalan** 25 ton → DO-1 (stok −25 ton). SO "Sebagian Terkirim (25/100)".
4. **Invoice** dari DO-1 → Rp 362,5jt → **Gunakan Uang Muka** porsi DP → sisa ditagih.
5. **Minggu 2-4:** ulangi → total 100 ton terkirim. SO "Selesai Dikirim". DP habis terpakai across invoice.
6. Customer bayar sisa tiap invoice → semua lunas.

---

## Kasus 3: Stok Opname Bulanan + Koreksi Selisih

**Skenario:** Akhir bulan, opname gudang POLES, fisik beda dari sistem.

1. **Stok Opname** → gudang POLES → input stok fisik per item.
   - Beras Cruise: sistem 5.000 Kg, fisik 4.950 Kg (selisih −50, susut).
   - Bekatul: sistem 1.000, fisik 1.020 (selisih +20).
2. Submit → sistem hitung:
   - Defisit Cruise: DR Selisih Persediaan (8.8) / CR Persediaan (nilai 50 Kg).
   - Surplus Bekatul: DR Persediaan / CR Selisih Persediaan.
   - Stok sistem disesuaikan ke fisik.
3. **Buku Besar:** muncul JV opname. **Laba Rugi:** selisih masuk akun 8.8.

---

## Kasus 4: Produksi Belum Diinput, Barang Harus Dikirim (Admin Override)

**Skenario:** Produksi 50 ton sedang jalan, baru 30 ton fisik siap, customer harus dikirim 40 ton hari ini, input produksi nanti sore.

1. Staff coba **Surat Jalan** 40 ton → ditolak "stok kurang" (sistem baru tahu 30 ton).
2. **Admin** buka Surat Jalan → centang **"Izinkan stok minus"** → isi alasan: "Produksi 50 ton jalan, fisik 40 ton sudah siap kirim, input produksi sore ini".
3. Submit → DO jadi, stok jadi minus sementara.
4. **Dashboard widget "Stok Minus Aktif"** tampilkan item minus.
5. Sore: **Proses Produksi** diinput (output 50 ton) → stok kembali positif. Widget bersih.

---

## Kasus 5: Penjualan Manual Lupa Link SO/DO

**Skenario:** Staff buat Surat Jalan manual padahal ada Pesanan (SO), atau buat invoice tapi DO belum di-link.

- **Pencegahan:** Invoice inventory **wajib** dari DO — sistem tolak kalau tidak.
- **Kalau terlanjur manual:** hubungi Admin untuk link retroaktif (DO ↔ SO, atau SI ↔ DO) supaya tracking & laporan konsisten.
- **Monitor:** Dashboard widget **"Surat Jalan Belum di-Invoice"** + status SO bantu deteksi yang terlewat.

---

## Ringkasan Alur Cepat (Cheat Sheet)

| Mau... | Menu | Hasil |
|---|---|---|
| Beli gabah | BPB/STT → Invoice Pembelian → Bayar | Stok masuk, hutang, lunas |
| Giling gabah | Proses Produksi | Gabah → beras + by-product, HPP loaded |
| Jual beras | (SO) → Surat Jalan → Invoice → Terima | Stok keluar, piutang, lunas |
| Terima DP | SO → Terima Uang Muka | Uang muka tercatat, ter-link SO |
| Pindah gudang | Transfer Stok | Stok pindah lokasi |
| Cek fisik | Stok Opname | Sesuaikan sistem ke fisik |
| Bayar listrik dll | Bank & Kas → Pembayaran (split) | Beban tercatat |
| Lihat untung | Laporan → Laba Rugi / Profitabilitas SKU | Margin per produk |
| Cek nunggak | Laporan → Aging Piutang | Daftar tunggakan |

---

[← Sistem](10-sistem.md) · [Daftar Isi](README.md)

---

*Manual ini akan terus diperbarui seiring fitur baru. Cek changelog aplikasi untuk perubahan terbaru.*

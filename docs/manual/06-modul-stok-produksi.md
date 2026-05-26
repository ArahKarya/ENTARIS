# Bab 6 — Modul Stok & Produksi

[← Pembelian](05-modul-pembelian.md) · [Daftar Isi](README.md) · [Lanjut: Bank & Kas →](07-modul-bank-kas.md)

---

Grup menu **Stok & Produksi**. Jantung operasional penggilingan.

## 6.1 Stok & Gudang

Menu **Stok & Produksi → Stok & Gudang**.

- Daftar semua item + stok saat ini + average cost + nilai persediaan.
- Tambah/edit master item (lihat [Bab 3](03-master-data.md)).
- **Riwayat Stok**: tiap item punya log pergerakan (masuk/keluar/transfer/adjustment) dengan sumber dokumen.
- **Input manual** (Adjustment In/Out): untuk koreksi langsung — tapi **lebih baik lewat dokumen resmi** (STT untuk masuk, DO untuk keluar, Produksi untuk hasil) supaya traceability terjaga.

## 6.2 Dashboard Per Gudang

Menu **Stok & Produksi → Dashboard Per Gudang**.
- KPI per gudang: nilai stok, jumlah item, pergerakan bulan ini.
- Chart tren stok, status vs minimum.

## 6.3 Transfer Stok

Menu **Stok & Produksi → Transfer Stok**. Pindahkan barang antar gudang (mis. GILING → POLES).

- **Buat:** gudang asal, gudang tujuan, item + qty.
- **Saat submit:** stok asal −, stok tujuan +. Harga modal ikut pindah (tidak berubah nilai).
- **Validasi:** qty ≤ stok gudang asal (tidak boleh transfer lebih dari ada).
- Tidak ada dampak laba/rugi (cuma pindah lokasi).

## 6.4 Stok Opname

Menu **Stok & Produksi → Stok Opname**. Rekonsiliasi stok fisik vs sistem.

- **Buat sesi opname:** pilih gudang, input **stok fisik aktual** per item.
- **Sistem hitung selisih** (fisik − sistem):
  - Surplus (fisik > sistem): DR Persediaan / CR Selisih Persediaan (8.8)
  - Defisit (fisik < sistem): DR Selisih Persediaan / CR Persediaan
- Stok sistem disesuaikan ke fisik. Stock movement (AdjustmentIn/Out) + jurnal otomatis.

> Lakukan opname berkala (bulanan) untuk jaga akurasi. Selisih besar = sinyal masalah (susut, pencatatan, dll).

## 6.5 Proses Produksi (Production Run)

Menu **Stok & Produksi** (modal Proses Produksi). Inti penggilingan: gabah → beras + by-product.

### Cara kerja
1. **Input (bahan baku):** gabah yang dipakai — pilih item + qty + gudang. Bisa pilih **batch tertentu** (specific identification) atau pakai WAC.
2. **Output (hasil):** beras utama + by-product (bekatul, menir, broken, reject). Isi qty masing-masing.
3. **Komponen biaya** (opsional): listrik, buruh, kirim, dll — sebagai standar biaya per Kg. Snapshot saat submit.
4. **Proses (traceability):** pilih proses yang dilewati (Drying, Huller, Polishing, dll) — multiselect, opsional.
5. **HPP Loaded otomatis:** sistem hitung harga pokok produk utama =
   `(nilai material + komponen biaya − nilai by-product NRV) ÷ qty output utama`

### Saat submit
- Stok bahan baku **berkurang**, stok hasil (beras + by-product) **bertambah**.
- Average cost produk hasil ter-update dari HPP loaded.
- Jurnal: pindah nilai dari Persediaan bahan baku ke Persediaan barang jadi + by-product.

### Edit / Batal Produksi
- **Edit:** sistem batalkan movement lama + buat baru dengan data revisi.
- **Batal:** reverse semua movement. Ditolak kalau output sudah dipakai produksi/jual berikutnya (batalkan transaksi hilir dulu).

### Stok minus saat produksi?
- Default: ditolak kalau bahan baku kurang.
- **Admin override:** centang "Izinkan stok minus" + isi alasan (min 10 karakter) → audit tercatat. Untuk kasus produksi backdate / barang fisik sudah keluar tapi belum diinput.

## 6.6 Stok Minus & Admin Override

**Aturan default:** stok tidak boleh minus di semua jalur (DO, Produksi, Transfer, Adjustment).

**Kenapa ketat?** Stok minus dulu pernah bikin harga modal (WAC) jadi kacau (jutaan/Kg) → COGS salah. Sekarang formula WAC aman + ada blokir.

**Admin override** (hanya role Admin):
- Di Surat Jalan & Produksi, kalau stok kurang muncul checkbox **"Izinkan stok minus"**.
- Wajib isi **alasan** (min 10 karakter) → tercatat di audit log.
- Contoh sah: "Produksi 50 ton sedang berjalan, barang fisik sudah dikirim, input produksi menyusul sore ini".

**Monitor:** Dashboard punya widget **"Stok Minus Aktif"** — daftar item yang sedang minus + umur + lokasi. Pastikan segera dibereskan (input produksi/penerimaan).

## 6.7 Batch Tracking & Loaded HPP

- Tiap barang masuk (STT/produksi) jadi satu **batch** dengan harga modalnya.
- Saat keluar (jual/produksi/transfer), bisa pilih batch spesifik atau pakai WAC.
- **Loaded HPP** = harga pokok lengkap termasuk biaya produksi (listrik/buruh) — beda dengan harga material saja. Dipakai di laporan **Profitabilitas per SKU** (margin loaded vs material).

---

## Contoh Kasus: Produksi Beras dari Gabah
Giling 10.000 Kg Gabah IR jadi beras + by-product:
1. **Proses Produksi** → tanggal, gudang GILING.
2. **Input:** GKP-IR 10.000 Kg (pilih batch atau WAC).
3. **Output:**
   - Beras IR (utama) 6.500 Kg
   - Bekatul 1.500 Kg (by-product, NRV Rp 3.500/Kg)
   - Menir 800 Kg (by-product, NRV Rp 6.000/Kg)
   - Broken 1.000 Kg (by-product)
4. **Komponen biaya:** Listrik Rp 50/Kg input, Buruh Rp 80/Kg input.
5. Submit → sistem:
   - Stok GKP-IR −10.000, Beras IR +6.500, by-product +.
   - HPP loaded beras = (nilai gabah + listrik + buruh − nilai by-product) ÷ 6.500.
   - Rendemen beras = 6.500/10.000 = 65%.

---

[← Pembelian](05-modul-pembelian.md) · [Daftar Isi](README.md) · [Lanjut: Bank & Kas →](07-modul-bank-kas.md)

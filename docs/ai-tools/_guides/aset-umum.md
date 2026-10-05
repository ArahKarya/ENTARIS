Toolset **aset-umum** mengelola modul EAM (Enterprise Asset Management) / General Affairs (GA): master data EAM (cabang, cost center, kategori aset, tipe dokumen legal, kategori inventaris, lokasi), register aset fisik (kendaraan, gedung, peralatan, dan aset lain), dokumen legal & sertifikat beserta masa berlaku, inventaris sparepart/ATK milik GA, dan Permintaan Barang (MR) sparepart yang lahir dari work order atau berdiri sendiri. Seluruh data EAM terpisah dari modul akuntansi (Persediaan, Aset Tetap, Buku Besar): stok GA tidak menghasilkan jurnal dan tidak memengaruhi HPP/WAC. Bagian kendaraan, gedung & sewa, peralatan & kalibrasi, serta maintenance & work order dijelaskan pada bagian kedua panduan ini.

Semua tool bergrup `EAM` dan memakai modul RBAC `ga_master`, `ga_assets`, `ga_documents`, `ga_inventory`, dan `ga_material_request` (GET = izin `view`, selain GET = izin `edit`). Modul `ga_*` tidak ada di matriks izin bawaan (`DEFAULT_MATRIX`), sehingga secara bawaan hanya Admin (super-admin) yang lolos sampai Admin memberi izin lewat Pengaturan > Role.

### Alur bisnis

**1. Siapkan master data lebih dulu** (`gam_*`). Urutan ketergantungan:

```
Cabang (gam_branches)
  ├─ Cost center (butuh branchId)
  └─ Lokasi/gudang (butuh branchId)  ← dipakai stok inventaris & penerimaan MR
Kategori aset      → kode kategori = awalan kode aset otomatis
Tipe dokumen legal → kode tipe = awalan kode dokumen otomatis
Kategori inventaris (SPAREPART | CONSUMABLE) → dipakai item inventaris GA
```

Menghapus master gagal selama masih dirujuk (aset, dokumen, item, stok) karena batasan relasi; gunakan update `isActive=false` bila hanya ingin menyembunyikan.

**2. Register aset** (`ga_asset_*`). Buat aset dengan kategori + cabang (cost center, PIC, nilai perolehan opsional). Kode kosong = otomatis: awalan dari kategori+cabang lalu urutan 4 digit (diberi advisory lock agar tidak bentrok); `ga_asset_next_code` hanya memberi saran. Setiap aset otomatis memperoleh satu QR (`GA-<uuid>`) yang dipakai halaman publik QR (di luar katalog). Status aset: `ACTIVE`, `IN_REPAIR`, `RETIRED`, `LOST`. Kondisi fisik: `GOOD`, `FAIR`, `POOR`, `BROKEN` (bisa diubah cepat lewat `ga_asset_set_condition`). Ubah/hapus massal dibatasi 200 aset per panggilan; bulk update hanya boleh mengubah `status`, `condition`, `branchId`, `costCenterId`, `picUserId`, `location`.

**3. Dokumen legal & sertifikat** (`gd_*`). Dokumen punya tipe, opsional terkait aset, tanggal berlaku/kedaluwarsa, dan status `ACTIVE | EXPIRED | REVOKED | ARCHIVED`. Berkas PDF diunggah sebagai versi bernomor (v1, v2, ...) lewat multipart: operasi unggah/unduh berkas TIDAK ada di katalog (lihat DENYLIST); tool hanya membaca metadata versi. Status kedaluwarsa dihitung terhadap hari kalender zona waktu bisnis: `expired` (status EXPIRED atau ACTIVE yang tanggalnya sudah lewat), `expiring` (ACTIVE, kedaluwarsa hari ini sampai 30 hari ke depan), `valid`; REVOKED/ARCHIVED tidak dilacak. Pemantauan proaktif = `gd_summary` + `gd_list` dengan `expiry=expiring` (mode berhalaman) atau `expiringSoon=true` (mode lama).

**4. Inventaris GA** (`gi_*`): katalog item (SKU, kategori, satuan, `minStock`) + stok per lokasi (`GaStockByLocation`) + log mutasi. Total stok = jumlah stok seluruh lokasi; item "rendah" bila total di bawah `minStock`, "habis" bila 0. Mutasi:

| Tipe | Efek | Wajib |
|---|---|---|
| `IN` | + stok lokasi tujuan | `toLocationId` |
| `OUT` | - stok lokasi asal (tidak boleh minus) | `fromLocationId` |
| `TRANSFER` | asal - qty, tujuan + qty | keduanya |
| `ADJUSTMENT` | + qty (nilai positif saja) di lokasi tujuan | `toLocationId` |

Untuk koreksi hasil hitung fisik gunakan `gi_stock_set` (opname cepat): menetapkan stok absolut per lokasi dan mencatat satu mutasi `ADJUSTMENT` (referensi `OPNAME`) sebesar selisih, boleh negatif.

**5. Permintaan Barang / MR** (`gmr_*`), kode `MR-TAHUN-NNNN`:

```
DRAFT --submit--> SUBMITTED --approve--> APPROVED --(receive semua item)--> FULFILLED
                      └--reject--> REJECTED (final)
DRAFT/SUBMITTED/APPROVED --cancel--> CANCELLED (final)
APPROVED/FULFILLED --(dibayar lewat Tagihan EAM, di luar toolset ini)--> PAID
```

- `gmr_create` / `gmr_create_from_wo` membuat DRAFT; hanya DRAFT yang boleh diedit (`gmr_update` mengganti seluruh daftar item).
- Setelah APPROVED, pengadaan dicatat per item (`gmr_procurement_update`): vendor, harga satuan, nomor PO (catatan bebas, bukan PO ERP), status `REQUESTED -> QUOTED -> ORDERED` (atau `CANCELLED`).
- `gmr_receive_item` menerima barang: stok GA bertambah di lokasi tujuan (mutasi `IN` referensi `MR_<kode>`), item menjadi `RECEIVED`, dan bila semua item `RECEIVED/CANCELLED` MR otomatis `FULFILLED`. Item MR yang belum tertaut ke item inventaris wajib diberi `inventoryItemId` atau `newItem {sku, categoryId}` (nama & satuan diambil dari MR).

### Aturan posting / efek

- **Tidak ada jurnal GL** pada seluruh tool bagian ini. Stok GA hidup di tabel sendiri; Persediaan ERP (akun 1.4.0), HPP, dan WAC tidak tersentuh.
- Satu-satunya jembatan ke keuangan: MR berstatus APPROVED atau FULFILLED yang belum dijurnal muncul di antrian **Tagihan EAM** (jenis `MATERIAL_REQUEST`; nilai = jumlah harga satuan x qty item) pada modul Pengajuan Pembayaran (`/payment-requests/eam`); setelah dibayar/dibukukan status MR menjadi `PAID`. Karena itu isi harga satuan (`gmr_procurement_update`) sebelum MR ditagihkan. Pembukuannya (JOURNAL: DR akun beban / CR Kas-Bank; atau PURCHASE_INVOICE: DR akun beban / CR Hutang Usaha 2.1.1) dikerjakan di sana lewat `services/gaFinance.ts`, bukan di tool-tool ini. Lihat toolset **pengajuan-pembayaran**.
- Profil keuangan/penyusutan aset (relasi `fixedAsset` pada aset) dikelola di modul Aset Tetap (toolset **akuntansi**); mendaftarkan aset EAM tidak membuat aset tetap maupun jurnal. `acquisitionCost` pada aset EAM hanya informasi.
- Mutasi stok GA (`gi_movement_create`, `gi_stock_set`, `gmr_receive_item`) dinaikkan ke risiko `critical` karena memindahkan/menimpa stok fisik dan tidak punya pembatalan (koreksi = mutasi lain).

### Persetujuan

- Tidak memakai `ApprovalRequest`/`needsApproval`. Persetujuan MR (`gmr_approve`, `gmr_reject`) hanyalah transisi status oleh siapa pun yang punya izin `edit` pada modul `ga_material_request`; tidak ada capability khusus dan tidak ada larangan pemohon menyetujui MR miliknya sendiri. Perlakukan sebagai langkah `critical` yang wajib konfirmasi manusia.
- Tidak ada capability `doc.cancel` pada tool bagian ini; `gmr_cancel` dan penghapusan cukup izin `edit` modulnya.
- Pada tahap katalog, tier tool `critical` = wajib-approve; tier `write` = draft/approve.

### Jebakan umum

- **Update parsial yang menimpa**: `ga_asset_update` dan `gd_update` meng-NULL-kan field opsional yang tidak dikirim (cost center, PIC, nomor seri, tanggal & nilai perolehan, lokasi, catatan; pada dokumen: aset, penerbit, nomor, tanggal berlaku/kedaluwarsa). Selalu baca detail lebih dulu dan kirim ulang nilai yang dipertahankan. Update master (`gam_*_update`) aman karena benar-benar parsial, tetapi `customFieldsSchema` yang tidak dikirim tidak diubah.
- **Dua mode daftar**: `gd_list`, `gi_items`, `gi_movements`, `gmr_list` mengembalikan array biasa bila tidak ada `page`/`paginated=1`, dan `{data,total,page,limit}` bila ada. Filter lanjutan (`search`, `expiry`, `stockStatus`, `locationId`, tanggal, `sort`) hanya berlaku di mode berhalaman; mode lama punya filter lebih sedikit (mis. `q`, `expiringSoon`).
- **`ADJUSTMENT` pada `gi_movement_create` hanya menambah** (qty harus > 0). Untuk menurunkan stok pakai `OUT` atau `gi_stock_set`.
- **Stok tidak boleh minus** pada IN/OUT/TRANSFER ("Stok tidak mencukupi."), tetapi `gi_stock_set` boleh menghasilkan selisih negatif.
- **Receive MR hanya saat APPROVED**; Pembatalan MR tidak mengembalikan stok yang telah diterima, dan MR yang sudah FULFILLED/PAID tidak bisa dibatalkan.
- **Status RECEIVED tidak bisa diset manual** lewat `gmr_procurement_update`.
- **Hapus aset massal** membatalkan seluruh batch bila satu aset masih dirujuk (work order, dokumen, MR, data kendaraan, dst.), tetapi file foto sudah terhapus sebelum baris DB; hati-hati.
- **Hapus master/dokumen bersifat permanen**; dokumen ikut menghapus semua versinya (file fisik dibiarkan di disk).
- Tool `gi_export` mengembalikan teks CSV (bukan JSON); maksimal 5.000 mutasi.
- `gd_expiring` pada katalog lama hanyalah duplikat `gd_list`; gunakan `gd_list` dengan `expiringSoon=true`.

### Peta istilah

| Istilah bisnis | Padanan kode / field |
|---|---|
| EAM, GA (General Affairs) | prefiks tabel/route `ga_*`, `/api/ga/*` |
| Cabang | `GaBranch` (`gam_branches`) |
| Cost center / pusat biaya | `GaCostCenter` (butuh cabang) |
| Lokasi / gudang EAM | `GaLocation`; stok per lokasi `GaStockByLocation` |
| Kategori aset | `GaAssetCategory` (kode = awalan kode aset) |
| Aset | `GaAsset` (`code`, `status`, `condition`, `picUserId`) |
| PIC (penanggung jawab) | `picUserId` |
| Kondisi baik / cukup / kurang / rusak | `GOOD / FAIR / POOR / BROKEN` |
| Aktif / dalam perbaikan / dipensiunkan / hilang | `ACTIVE / IN_REPAIR / RETIRED / LOST` |
| Dokumen legal, sertifikat | `GaDocument`; tipe `GaDocumentType`; versi berkas `GaDocumentVersion` |
| Berlaku / segera kedaluwarsa / kedaluwarsa | `valid / expiring (<= 30 hari) / expired` |
| Dicabut / diarsipkan | `REVOKED / ARCHIVED` |
| Sparepart / barang habis pakai (ATK) | kategori inventaris `SPAREPART / CONSUMABLE` |
| Item inventaris, SKU, stok minimum | `GaInventoryItem` (`sku`, `minStock`) |
| Stok rendah / habis / aman | `low / out / ok` (`stockStatus`) |
| Mutasi masuk / keluar / transfer / penyesuaian | `IN / OUT / TRANSFER / ADJUSTMENT` |
| Opname cepat | `gi_stock_set`, referensi mutasi `OPNAME` |
| Permintaan Barang (MR) | `GaMaterialRequest` (`MR-YYYY-NNNN`) |
| Draft / diajukan / disetujui / ditolak / dibatalkan / terpenuhi / dibayar | `DRAFT / SUBMITTED / APPROVED / REJECTED / CANCELLED / FULFILLED / PAID` |
| Status pengadaan item | `REQUESTED / QUOTED / ORDERED / RECEIVED / CANCELLED` |
| Tagihan EAM | antrian `/payment-requests/eam`, jenis `MATERIAL_REQUEST` (dari MR yang diterima) |
| Work Order (WO) | `GaWorkOrder` (dibahas di bagian kedua) |

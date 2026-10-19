# Toolset: Aset & Umum (EAM) (`aset-umum`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/aset-umum` · 141 tool (read 49, write 68, critical 24)

## Tujuan

Toolset **aset-umum** mengelola modul EAM (Enterprise Asset Management) / General Affairs (GA): master data EAM (cabang, cost center, kategori aset, tipe dokumen legal, kategori inventaris, lokasi), register aset fisik (kendaraan, gedung, peralatan, dan aset lain), dokumen legal & sertifikat beserta masa berlaku, inventaris sparepart/ATK milik GA, dan Permintaan Barang (MR) sparepart yang lahir dari work order atau berdiri sendiri. Seluruh data EAM terpisah dari modul akuntansi (Persediaan, Aset Tetap, Buku Besar): stok GA tidak menghasilkan jurnal dan tidak memengaruhi HPP/WAC. Bagian kendaraan, gedung & sewa, peralatan & kalibrasi, serta maintenance & work order dijelaskan pada bagian kedua panduan ini.

Semua tool bergrup `EAM` dan memakai modul RBAC `ga_master`, `ga_assets`, `ga_documents`, `ga_inventory`, dan `ga_material_request` (GET = izin `view`, selain GET = izin `edit`). Modul `ga_*` tidak ada di matriks izin bawaan (`DEFAULT_MATRIX`), sehingga secara bawaan hanya Admin (super-admin) yang lolos sampai Admin memberi izin lewat Pengaturan > Role.

## ALUR BISNIS

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

### Maintenance & Work Order

Modul `ga_maintenance` mengelola **jadwal preventif** dan **Work Order (WO)** perbaikan/perawatan aset EAM. Kode WO otomatis `WO-YYYY-NNNN`.

**Siklus status WO** (satu arah, tidak ada "buka kembali"):

```
OPEN ──assign──▶ ASSIGNED ──start──▶ IN_PROGRESS ──complete──▶ DONE ──close──▶ CLOSED
  └────────────────── cancel (alasan wajib) ──────────────▶ CANCELLED   (hanya sebelum DONE)
```

| Langkah | Tool | Syarat & efek |
|---|---|---|
| Buat | `gm_wo_create` | Status OPEN; pelapor = pemanggil. Tidak ada GL/stok. |
| Tugaskan | `gm_wo_assign` | Dari OPEN/ASSIGNED; mengisi teknisi, prioritas boleh diubah. |
| Mulai | `gm_wo_start` | Dari ASSIGNED. **Hanya teknisi yang ditugaskan** (Admin pun ditolak 403). |
| Pakai sparepart | `gm_wo_add_parts` | Selama WO belum CLOSED/CANCELLED. Stok **inventaris GA** berkurang (movement OUT) bila `fromLocationId` diisi. |
| Selesai | `gm_wo_complete` | Dari ASSIGNED/IN_PROGRESS, **hanya teknisi yang ditugaskan**. Checklist item `required` harus `done`. Jadwal preventif sumber dimajukan (`lastDoneAt`, `nextDueAt`). |
| Tutup | `gm_wo_close` | Hanya dari DONE. Otomatis membuat log servis kendaraan `source=WORK_ORDER`. |
| Batal | `gm_wo_cancel` | Hanya sebelum DONE. Part yang sudah dipakai **tidak** dikembalikan ke stok. |

**Efek keuangan/stok**
- WO tidak pernah membuat jurnal GL. Biaya WO = biaya tenaga kerja + vendor luar + (qty × harga satuan part).
- `gm_wo_add_parts` adalah satu-satunya langkah yang menggerakkan stok (stok GA, bukan stok ERP/Persediaan). Stok boleh menjadi **negatif** — hanya muncul `warning` pada hasil. Modul maintenance tidak punya endpoint untuk mengembalikan part; koreksi stok dilakukan di modul Inventaris GA.
- Log servis hasil `gm_wo_close` bersumber `WORK_ORDER`: **tidak** masuk antrian Tagihan EAM dan **tidak** bisa dijurnal (mencegah dobel-beban).
- Pengajuan servis kendaraan yang disetujui (`ga_veh_approve_service`) membuat WO OPEN otomatis (PREVENTIVE untuk oli/tune up/servis berkala, selain itu CORRECTIVE).

**Jadwal preventif** (`gm_schedules`, `gm_schedule_create`, `gm_schedule_update`): interval hari / jam / km + `nextDueAt`. Jadwal tidak membuat WO sendiri di endpoint ini; WO dibuat manual lewat `gm_wo_create` (isi `scheduleId` agar jadwal dimajukan saat WO selesai).

**Daftar WO** (`gm_wo_list`) punya dua mode: tanpa `page` = array polos semua WO (mode lama, dipakai dashboard); dengan `page` = `{data,total,page,limit}` + filter `due`, tanggal lapor, `search`, `sort`. `gm_wo_summary` memberi KPI untuk filter yang sama.

**Jebakan umum**
- `start` dan `complete` terikat ke user yang ditugaskan; agen yang bertindak atas nama user lain akan kena 403.
- Foto WO (`POST .../photos`) adalah unggahan multipart → masuk denylist; tool hanya menampilkan jumlah foto.
- `cancel` bukan rollback: biaya part tetap tercatat.

### Kendaraan

Modul `ga_vehicle` menyimpan **data teknis (1-1 per aset)** dan banyak **log per kendaraan**: servis, BBM, oli, ban, inspeksi, insiden, pajak/STNK/KIR, asuransi. Semua endpoint per kendaraan memakai `:id` = ID aset kendaraan (`GaAsset.id`), bukan nomor plat.

**Data & driver**
- `ga_veh_get` / `ga_veh_update` (upsert; field yang tidak dikirim dikosongkan — kirim data lengkap).
- `ga_veh_assign_driver` mengisi `GaAsset.picUserId` (null = lepas driver).
- Odometer terakhir dimajukan otomatis oleh servis, BBM, dan oli bila nilainya lebih besar.

**Alur servis**

```
Pengajuan servis (SUBMITTED) ──approve──▶ WO OPEN (lihat bagian Maintenance)
        │                    └─reject (alasan wajib)─▶ REJECTED
        └─cancel (hanya pengaju)─▶ CANCELLED
Catat servis (ga_veh_add_service, source=EAM) ──▶ antrian Tagihan EAM ──▶ dibayar Keuangan
```

- `ga_veh_add_service` membuat log servis `source=EAM`. **Tanpa** `postJournal` tidak ada jurnal; log berbiaya > 0 muncul di *Pengajuan Pembayaran → Tagihan EAM* (jenis `SERVICE_LOG`) dan hanya Keuangan yang memposting/membayar lewat modul `payment_request`.
- `postJournal=true` (atau `ga_veh_post_service_journal` belakangan) memposting langsung: **DR 6.7 Beban Pemeliharaan Kendaraan / CR 1.1.1 Petty Cash** (akun bisa dipilih). Satu log = maksimal satu jurnal. Pembatalan: `ga_veh_cancel_service_journal` (void jurnal).
- Log `source=IMPORT` (data historis, sudah di GL) dan `WORK_ORDER` **tidak** masuk antrian dan tidak bisa dijurnal.
- Log yang sudah berjurnal tidak boleh diubah (tanggal/biaya/deskripsi) atau dihapus — batalkan jurnalnya dulu.

**Alur pajak/STNK/KIR**

```
Pengajuan pajak (SUBMITTED) ──approve──▶ GaVehicleTax IN_PROCESS ──▶ antrian Tagihan EAM (VEHICLE_TAX)
                                          └─ dibayar Keuangan: DR 6.41 Beban Pajak & Perizinan Kendaraan / CR Kas-Bank (atau Hutang Usaha 2.1.1)
```

- `ga_veh_create_tax_request` → `ga_veh_approve_tax_request` / `ga_veh_reject_tax_request` / `ga_veh_cancel_tax_request` (cancel hanya oleh pengaju).
- `ga_veh_add_tax` mencatat langsung record pajak; status `IN_PROCESS` akan masuk antrian Tagihan. Status `PAID` = sudah dibayar & dicatat manual di luar antrian (tidak diposting lagi).
- Record yang sudah `IN_PROCESS`/terjurnal/berfaktur tidak boleh diturunkan statusnya (409). Hapus (`ga_veh_delete_tax`) tidak dicek di kode terhadap jurnal/faktur — hindari menghapus record yang sudah diposting.

**Log operasional lain** (tanpa efek GL): BBM (`ga_veh_*_fuel_log`), oli (`ga_veh_*_oil_log`), ban per posisi (`ga_veh_*_tire`; satu ban ACTIVE per posisi), insiden (`ga_veh_*_incident`), asuransi (`ga_veh_*_insurance`), inspeksi berkala (`ga_veh_add_inspection`; `nextDueDate` otomatis = tanggal + `intervalDays`, default 30 hari). Foto inspeksi diunggah/diunduh lewat endpoint biner (denylist); hanya hapus foto (`ga_veh_delete_inspection_photo`) yang tersedia sebagai tool.

**Armada & laporan** (read-only): `ga_veh_fleet` (daftar berhalaman dengan status jatuh tempo per dokumen: `tax`, `stnk`, `kir`, `insurance`, `inspection`), `ga_veh_fleet_summary` (KPI), `ga_veh_fleet_report` & `ga_veh_report` (laporan biaya periode; default 12 bulan terakhir).

**Jebakan umum**
- Biaya BBM **tidak** dijurnal dari modul ini; hanya servis dan pajak yang punya jalur ke GL (via antrian Tagihan EAM).
- Persetujuan pengajuan servis/pajak hanya butuh izin `ga_vehicle` edit — tidak ada capability atau cek atasan di kode; pembayaran tetap dikendalikan izin `payment_request`.
- `ga_veh_fleet_summary`: hitungan pajak, asuransi, biaya servis & BBM tidak ikut disaring `categoryKind/categoryId` (hanya total aset yang disaring).

### Gedung & Sewa

Modul `ga_building`: data bangunan (1-1 per aset: jenis KANTOR/GUDANG/PABRIK/RUMAH/MESS/RUKO/LAINNYA, kepemilikan, luas, alamat, sertifikat HM/HGB/HGU/…, NJOP) dan **kontrak sewa** (1-banyak).

- `ga_bld_get` / `ga_bld_update` (upsert).
- Kontrak sewa: `ga_bld_add_rental` (`arah` = SEWA_MASUK perusahaan menyewa, SEWA_KELUAR perusahaan menyewakan; `periode` BULANAN/TAHUNAN), `ga_bld_update_rental`, `ga_bld_end_rental` (status → BERAKHIR, riwayat tetap), `ga_bld_delete_rental` (hapus permanen, critical).
- **Tidak ada efek keuangan**: sewa hanya data kontrak. Tidak membuat tagihan, jurnal, atau pengingat pembayaran. Pembayaran sewa dilakukan lewat Pengajuan Pembayaran / modul Pembayaran biasa.
- Dokumen kontrak ditautkan lewat `documentId` (modul Dokumen Legal, fork `ga_documents`).

**Jebakan umum**: pakai `ga_bld_end_rental` (bukan hapus) untuk mengakhiri kontrak agar riwayat tidak hilang; `rid` = ID kontrak sewa, `id` = ID aset gedung.

### Equipment & Kalibrasi

Modul `ga_equipment`: alat ukur/timbangan (kapasitas, satuan KG/GRAM/TON/LBS, akurasi, kelas, interval kalibrasi) dan **log kalibrasi**.

- `ga_eqp_get` / `ga_eqp_update` (upsert).
- `ga_eqp_add_calibration` mencatat sertifikat (lembaga, nomor, hasil PASS/FAIL/CONDITIONAL, mode ON_SITE/SHIPPED, `validUntil`) **dan** memperbarui `lastCalibratedAt` serta `nextCalibrationDue` (= `validUntil`) pada data equipment dalam satu transaksi.
- `ga_eqp_delete_calibration` menghapus log tetapi **tidak** menghitung ulang `nextCalibrationDue` — jadwal berikutnya bisa tidak sinkron setelah penghapusan.
- Tidak ada efek GL/stok. `workOrderId` dapat menautkan kalibrasi ke WO pemeliharaan.

### Istilah

| Istilah Indonesia | Arti di sistem |
|---|---|
| WO (Work Order) | Perintah kerja perawatan/perbaikan aset (`GaWorkOrder`) |
| Preventif / Korektif | `PREVENTIVE` (berkala terjadwal) / `CORRECTIVE` (perbaikan kerusakan) |
| Pengajuan servis / pajak | Permintaan yang harus disetujui GA sebelum jadi WO / tagihan |
| Tagihan EAM | Antrian pembayaran di Pengajuan Pembayaran (pajak kendaraan, log servis EAM, MR sparepart) |
| STNK / KIR | Surat tanda nomor kendaraan / uji berkala kendaraan niaga |
| SPBU | Stasiun pengisian BBM |
| Teknisi / PIC | User yang ditugaskan pada WO / driver-penanggung jawab aset |
| Kalibrasi | Peneraan alat ukur oleh lembaga bersertifikat |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`ga_asset_bulk_delete`](#ga_asset_bulk_delete) | critical | tidak | `POST /api/ga/assets/bulk/delete` |
| [`ga_asset_bulk_update`](#ga_asset_bulk_update) | write | tidak | `PATCH /api/ga/assets/bulk/update` |
| [`ga_asset_create`](#ga_asset_create) | write | tidak | `POST /api/ga/assets` |
| [`ga_asset_delete_photo`](#ga_asset_delete_photo) | write | tidak | `DELETE /api/ga/assets/:id/photos/:photoId` |
| [`ga_asset_get`](#ga_asset_get) | read | - | `GET /api/ga/assets/:id` |
| [`ga_asset_list`](#ga_asset_list) | read | - | `GET /api/ga/assets` |
| [`ga_asset_next_code`](#ga_asset_next_code) | read | - | `GET /api/ga/assets/_next-code` |
| [`ga_asset_set_condition`](#ga_asset_set_condition) | write | tidak | `PATCH /api/ga/assets/:id/condition` |
| [`ga_asset_update`](#ga_asset_update) | write | tidak | `PUT /api/ga/assets/:id` |
| [`ga_bld_add_rental`](#ga_bld_add_rental) | write | tidak | `POST /api/ga/building/assets/:id/rentals` |
| [`ga_bld_delete_rental`](#ga_bld_delete_rental) | critical | tidak | `DELETE /api/ga/building/assets/:id/rentals/:rid` |
| [`ga_bld_end_rental`](#ga_bld_end_rental) | write | tidak | `PATCH /api/ga/building/assets/:id/rentals/:rid/end` |
| [`ga_bld_get`](#ga_bld_get) | read | - | `GET /api/ga/building/assets/:id` |
| [`ga_bld_rentals`](#ga_bld_rentals) | read | - | `GET /api/ga/building/assets/:id/rentals` |
| [`ga_bld_update`](#ga_bld_update) | write | tidak | `PUT /api/ga/building/assets/:id` |
| [`ga_bld_update_rental`](#ga_bld_update_rental) | write | tidak | `PATCH /api/ga/building/assets/:id/rentals/:rid` |
| [`ga_eqp_add_calibration`](#ga_eqp_add_calibration) | write | tidak | `POST /api/ga/equipment/assets/:id/calibration-logs` |
| [`ga_eqp_calibration_logs`](#ga_eqp_calibration_logs) | read | - | `GET /api/ga/equipment/assets/:id/calibration-logs` |
| [`ga_eqp_delete_calibration`](#ga_eqp_delete_calibration) | critical | tidak | `DELETE /api/ga/equipment/assets/:id/calibration-logs/:lid` |
| [`ga_eqp_get`](#ga_eqp_get) | read | - | `GET /api/ga/equipment/assets/:id` |
| [`ga_eqp_update`](#ga_eqp_update) | write | tidak | `PUT /api/ga/equipment/assets/:id` |
| [`ga_veh_add_fuel_log`](#ga_veh_add_fuel_log) | write | tidak | `POST /api/ga/vehicle/assets/:id/fuel-logs` |
| [`ga_veh_add_incident`](#ga_veh_add_incident) | write | tidak | `POST /api/ga/vehicle/assets/:id/incidents` |
| [`ga_veh_add_inspection`](#ga_veh_add_inspection) | write | tidak | `POST /api/ga/vehicle/assets/:id/inspections` |
| [`ga_veh_add_insurance`](#ga_veh_add_insurance) | write | tidak | `POST /api/ga/vehicle/assets/:id/insurances` |
| [`ga_veh_add_oil_log`](#ga_veh_add_oil_log) | write | tidak | `POST /api/ga/vehicle/assets/:id/oil-logs` |
| [`ga_veh_add_service`](#ga_veh_add_service) | critical | ya | `POST /api/ga/vehicle/assets/:id/services` |
| [`ga_veh_add_tax`](#ga_veh_add_tax) | write | tidak | `POST /api/ga/vehicle/assets/:id/taxes` |
| [`ga_veh_add_tire`](#ga_veh_add_tire) | write | tidak | `POST /api/ga/vehicle/assets/:id/tires` |
| [`ga_veh_approve_service`](#ga_veh_approve_service) | critical | tidak | `PATCH /api/ga/vehicle/service-requests/:id/approve` |
| [`ga_veh_approve_tax_request`](#ga_veh_approve_tax_request) | critical | tidak | `PATCH /api/ga/vehicle/tax-requests/:id/approve` |
| [`ga_veh_assign_driver`](#ga_veh_assign_driver) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/driver` |
| [`ga_veh_cancel_service_journal`](#ga_veh_cancel_service_journal) | critical | tidak | `DELETE /api/ga/vehicle/assets/:id/services/:sid/journal` |
| [`ga_veh_cancel_service_req`](#ga_veh_cancel_service_req) | critical | tidak | `PATCH /api/ga/vehicle/service-requests/:id/cancel` |
| [`ga_veh_cancel_tax_request`](#ga_veh_cancel_tax_request) | critical | tidak | `PATCH /api/ga/vehicle/tax-requests/:id/cancel` |
| [`ga_veh_create_service_request`](#ga_veh_create_service_request) | write | ya | `POST /api/ga/vehicle/assets/:id/service-requests` |
| [`ga_veh_create_tax_request`](#ga_veh_create_tax_request) | write | ya | `POST /api/ga/vehicle/assets/:id/tax-requests` |
| [`ga_veh_delete_fuel_log`](#ga_veh_delete_fuel_log) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/fuel-logs/:fid` |
| [`ga_veh_delete_incident`](#ga_veh_delete_incident) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/incidents/:iid` |
| [`ga_veh_delete_inspection`](#ga_veh_delete_inspection) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/inspections/:iid` |
| [`ga_veh_delete_inspection_photo`](#ga_veh_delete_inspection_photo) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid` |
| [`ga_veh_delete_insurance`](#ga_veh_delete_insurance) | critical | tidak | `DELETE /api/ga/vehicle/assets/:id/insurances/:iid` |
| [`ga_veh_delete_oil_log`](#ga_veh_delete_oil_log) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/oil-logs/:oid` |
| [`ga_veh_delete_service`](#ga_veh_delete_service) | critical | tidak | `DELETE /api/ga/vehicle/assets/:id/services/:sid` |
| [`ga_veh_delete_tax`](#ga_veh_delete_tax) | critical | tidak | `DELETE /api/ga/vehicle/assets/:id/taxes/:tid` |
| [`ga_veh_delete_tire`](#ga_veh_delete_tire) | write | tidak | `DELETE /api/ga/vehicle/assets/:id/tires/:tid` |
| [`ga_veh_fleet`](#ga_veh_fleet) | read | - | `GET /api/ga/vehicle/fleet` |
| [`ga_veh_fleet_report`](#ga_veh_fleet_report) | read | - | `GET /api/ga/vehicle/fleet-report` |
| [`ga_veh_fleet_summary`](#ga_veh_fleet_summary) | read | - | `GET /api/ga/vehicle/fleet-summary` |
| [`ga_veh_fuel_logs`](#ga_veh_fuel_logs) | read | - | `GET /api/ga/vehicle/assets/:id/fuel-logs` |
| [`ga_veh_get`](#ga_veh_get) | read | - | `GET /api/ga/vehicle/assets/:id` |
| [`ga_veh_incidents`](#ga_veh_incidents) | read | - | `GET /api/ga/vehicle/assets/:id/incidents` |
| [`ga_veh_inspection_categories`](#ga_veh_inspection_categories) | read | - | `GET /api/ga/vehicle/inspection-categories` |
| [`ga_veh_inspection_checkpoints`](#ga_veh_inspection_checkpoints) | read | - | `GET /api/ga/vehicle/inspection-checkpoints` |
| [`ga_veh_inspections`](#ga_veh_inspections) | read | - | `GET /api/ga/vehicle/assets/:id/inspections` |
| [`ga_veh_insurances`](#ga_veh_insurances) | read | - | `GET /api/ga/vehicle/assets/:id/insurances` |
| [`ga_veh_oil_logs`](#ga_veh_oil_logs) | read | - | `GET /api/ga/vehicle/assets/:id/oil-logs` |
| [`ga_veh_post_service_journal`](#ga_veh_post_service_journal) | critical | tidak | `POST /api/ga/vehicle/assets/:id/services/:sid/journal` |
| [`ga_veh_reject_service`](#ga_veh_reject_service) | critical | tidak | `PATCH /api/ga/vehicle/service-requests/:id/reject` |
| [`ga_veh_reject_tax_request`](#ga_veh_reject_tax_request) | critical | tidak | `PATCH /api/ga/vehicle/tax-requests/:id/reject` |
| [`ga_veh_report`](#ga_veh_report) | read | - | `GET /api/ga/vehicle/assets/:id/report` |
| [`ga_veh_service_request_get`](#ga_veh_service_request_get) | read | - | `GET /api/ga/vehicle/service-requests/:id` |
| [`ga_veh_service_requests`](#ga_veh_service_requests) | read | - | `GET /api/ga/vehicle/service-requests` |
| [`ga_veh_services`](#ga_veh_services) | read | - | `GET /api/ga/vehicle/assets/:id/services` |
| [`ga_veh_tax_request_get`](#ga_veh_tax_request_get) | read | - | `GET /api/ga/vehicle/tax-requests/:id` |
| [`ga_veh_tax_requests`](#ga_veh_tax_requests) | read | - | `GET /api/ga/vehicle/tax-requests` |
| [`ga_veh_taxes`](#ga_veh_taxes) | read | - | `GET /api/ga/vehicle/assets/:id/taxes` |
| [`ga_veh_tires`](#ga_veh_tires) | read | - | `GET /api/ga/vehicle/assets/:id/tires` |
| [`ga_veh_update`](#ga_veh_update) | write | tidak | `PUT /api/ga/vehicle/assets/:id` |
| [`ga_veh_update_incident`](#ga_veh_update_incident) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/incidents/:iid` |
| [`ga_veh_update_insurance`](#ga_veh_update_insurance) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/insurances/:iid` |
| [`ga_veh_update_service`](#ga_veh_update_service) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/services/:sid` |
| [`ga_veh_update_tax`](#ga_veh_update_tax) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/taxes/:tid` |
| [`ga_veh_update_tire`](#ga_veh_update_tire) | write | tidak | `PATCH /api/ga/vehicle/assets/:id/tires/:tid` |
| [`gam_asset_cat_create`](#gam_asset_cat_create) | write | tidak | `POST /api/ga/master/asset-categories` |
| [`gam_asset_cat_delete`](#gam_asset_cat_delete) | write | tidak | `DELETE /api/ga/master/asset-categories/:id` |
| [`gam_asset_cat_update`](#gam_asset_cat_update) | write | tidak | `PUT /api/ga/master/asset-categories/:id` |
| [`gam_asset_categories`](#gam_asset_categories) | read | - | `GET /api/ga/master/asset-categories` |
| [`gam_branch_create`](#gam_branch_create) | write | tidak | `POST /api/ga/master/branches` |
| [`gam_branch_delete`](#gam_branch_delete) | write | tidak | `DELETE /api/ga/master/branches/:id` |
| [`gam_branch_update`](#gam_branch_update) | write | tidak | `PUT /api/ga/master/branches/:id` |
| [`gam_branches`](#gam_branches) | read | - | `GET /api/ga/master/branches` |
| [`gam_cc_delete`](#gam_cc_delete) | write | tidak | `DELETE /api/ga/master/cost-centers/:id` |
| [`gam_cc_update`](#gam_cc_update) | write | tidak | `PUT /api/ga/master/cost-centers/:id` |
| [`gam_cost_center_create`](#gam_cost_center_create) | write | tidak | `POST /api/ga/master/cost-centers` |
| [`gam_cost_centers`](#gam_cost_centers) | read | - | `GET /api/ga/master/cost-centers` |
| [`gam_doctype_create`](#gam_doctype_create) | write | tidak | `POST /api/ga/master/document-types` |
| [`gam_doctype_delete`](#gam_doctype_delete) | write | tidak | `DELETE /api/ga/master/document-types/:id` |
| [`gam_doctype_update`](#gam_doctype_update) | write | tidak | `PUT /api/ga/master/document-types/:id` |
| [`gam_document_types`](#gam_document_types) | read | - | `GET /api/ga/master/document-types` |
| [`gam_invcat_create`](#gam_invcat_create) | write | tidak | `POST /api/ga/master/inventory-categories` |
| [`gam_invcat_delete`](#gam_invcat_delete) | write | tidak | `DELETE /api/ga/master/inventory-categories/:id` |
| [`gam_invcat_update`](#gam_invcat_update) | write | tidak | `PUT /api/ga/master/inventory-categories/:id` |
| [`gam_inventory_categories`](#gam_inventory_categories) | read | - | `GET /api/ga/master/inventory-categories` |
| [`gam_location_create`](#gam_location_create) | write | tidak | `POST /api/ga/master/locations` |
| [`gam_location_delete`](#gam_location_delete) | write | tidak | `DELETE /api/ga/master/locations/:id` |
| [`gam_location_update`](#gam_location_update) | write | tidak | `PUT /api/ga/master/locations/:id` |
| [`gam_locations`](#gam_locations) | read | - | `GET /api/ga/master/locations` |
| [`gd_create`](#gd_create) | write | tidak | `POST /api/ga/documents` |
| [`gd_delete`](#gd_delete) | critical | tidak | `DELETE /api/ga/documents/:id` |
| [`gd_get`](#gd_get) | read | - | `GET /api/ga/documents/:id` |
| [`gd_list`](#gd_list) | read | - | `GET /api/ga/documents` |
| [`gd_summary`](#gd_summary) | read | - | `GET /api/ga/documents/summary` |
| [`gd_update`](#gd_update) | write | tidak | `PUT /api/ga/documents/:id` |
| [`gi_dashboard`](#gi_dashboard) | read | - | `GET /api/ga/inventory/dashboard` |
| [`gi_export`](#gi_export) | read | - | `GET /api/ga/inventory/export` |
| [`gi_item_create`](#gi_item_create) | write | tidak | `POST /api/ga/inventory/items` |
| [`gi_item_get`](#gi_item_get) | read | - | `GET /api/ga/inventory/items/:id` |
| [`gi_item_image_delete`](#gi_item_image_delete) | write | tidak | `DELETE /api/ga/inventory/items/:id/image` |
| [`gi_item_update`](#gi_item_update) | write | tidak | `PUT /api/ga/inventory/items/:id` |
| [`gi_items`](#gi_items) | read | - | `GET /api/ga/inventory/items` |
| [`gi_items_summary`](#gi_items_summary) | read | - | `GET /api/ga/inventory/items/summary` |
| [`gi_low_stock`](#gi_low_stock) | read | - | `GET /api/ga/inventory/low-stock` |
| [`gi_movement_create`](#gi_movement_create) | critical | tidak | `POST /api/ga/inventory/movements` |
| [`gi_movements`](#gi_movements) | read | - | `GET /api/ga/inventory/movements` |
| [`gi_stock_set`](#gi_stock_set) | critical | tidak | `POST /api/ga/inventory/stock-set` |
| [`gm_schedule_create`](#gm_schedule_create) | write | tidak | `POST /api/ga/maintenance/schedules` |
| [`gm_schedule_update`](#gm_schedule_update) | write | tidak | `PUT /api/ga/maintenance/schedules/:id` |
| [`gm_schedules`](#gm_schedules) | read | - | `GET /api/ga/maintenance/schedules` |
| [`gm_wo_add_parts`](#gm_wo_add_parts) | critical | tidak | `POST /api/ga/maintenance/work-orders/:id/parts` |
| [`gm_wo_assign`](#gm_wo_assign) | write | tidak | `PATCH /api/ga/maintenance/work-orders/:id/assign` |
| [`gm_wo_cancel`](#gm_wo_cancel) | critical | tidak | `PATCH /api/ga/maintenance/work-orders/:id/cancel` |
| [`gm_wo_close`](#gm_wo_close) | write | tidak | `PATCH /api/ga/maintenance/work-orders/:id/close` |
| [`gm_wo_complete`](#gm_wo_complete) | write | tidak | `PATCH /api/ga/maintenance/work-orders/:id/complete` |
| [`gm_wo_create`](#gm_wo_create) | write | ya | `POST /api/ga/maintenance/work-orders` |
| [`gm_wo_get`](#gm_wo_get) | read | - | `GET /api/ga/maintenance/work-orders/:id` |
| [`gm_wo_list`](#gm_wo_list) | read | - | `GET /api/ga/maintenance/work-orders` |
| [`gm_wo_start`](#gm_wo_start) | write | tidak | `PATCH /api/ga/maintenance/work-orders/:id/start` |
| [`gm_wo_summary`](#gm_wo_summary) | read | - | `GET /api/ga/maintenance/work-orders/summary` |
| [`gmr_approve`](#gmr_approve) | critical | tidak | `PATCH /api/ga/material-requests/:id/approve` |
| [`gmr_cancel`](#gmr_cancel) | critical | tidak | `PATCH /api/ga/material-requests/:id/cancel` |
| [`gmr_create`](#gmr_create) | write | ya | `POST /api/ga/material-requests` |
| [`gmr_create_from_wo`](#gmr_create_from_wo) | write | ya | `POST /api/ga/material-requests/from-work-order/:workOrderId` |
| [`gmr_get`](#gmr_get) | read | - | `GET /api/ga/material-requests/:id` |
| [`gmr_list`](#gmr_list) | read | - | `GET /api/ga/material-requests` |
| [`gmr_procurement_update`](#gmr_procurement_update) | write | tidak | `PATCH /api/ga/material-requests/:id/items/:itemId/procurement` |
| [`gmr_receive_item`](#gmr_receive_item) | critical | tidak | `PATCH /api/ga/material-requests/:id/items/:itemId/receive` |
| [`gmr_reject`](#gmr_reject) | critical | tidak | `PATCH /api/ga/material-requests/:id/reject` |
| [`gmr_submit`](#gmr_submit) | write | ya | `PATCH /api/ga/material-requests/:id/submit` |
| [`gmr_summary`](#gmr_summary) | read | - | `GET /api/ga/material-requests/summary` |
| [`gmr_update`](#gmr_update) | write | ya | `PUT /api/ga/material-requests/:id` |

## Rincian tool

### ga_asset_bulk_delete

**Ringkasan:** Menghapus permanen maksimal 200 aset beserta foto (file di disk) dan QR-nya. Gagal bila ada aset yang masih dirujuk (work order, dokumen, MR, kendaraan, dsb). Tidak bisa dibatalkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `POST /api/ga/assets/bulk/delete` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `ids` | body | `array<string>` | ya | Daftar ID aset yang dihapus (1-200). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_bulk_delete",
  "args": {
    "ids": []
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN [...] aset. Setujui?"
}
```

**Isi hasil:** Objek {deleted} jumlah id yang diminta dihapus.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; aset, foto (file fisik), dan QR dihapus permanen. File foto dihapus sebelum baris DB sehingga kegagalan relasi bisa meninggalkan foto hilang.

**Teks konfirmasi:** HAPUS PERMANEN {ids} aset. Setujui?

**Error umum**

- 400: ids kosong / >200.
- 500: aset masih dirujuk data lain (batasan relasi).

### ga_asset_bulk_update

**Ringkasan:** Mengubah massal maksimal 200 aset sekaligus pada field yang diizinkan saja: status, condition, branchId, costCenterId, picUserId, location. Nilai null/kosong akan mengosongkan field.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `PATCH /api/ga/assets/bulk/update` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `ids` | body | `array<string>` | ya | Daftar ID aset (1-200). |
| `data` | body | `object` | ya | Field yang diubah; hanya status, condition, branchId, costCenterId, picUserId, location. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_bulk_update",
  "args": {
    "ids": [],
    "data": {}
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah massal [...] aset dengan data [...]. Setujui?"
}
```

**Isi hasil:** Objek {updated} jumlah aset yang diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah massal {ids} aset dengan data {data}. Setujui?

**Error umum**

- 400: ids kosong / >200 / field tidak diizinkan.

**Tool terkait:** [`ga_asset_list`](#ga_asset_list)

### ga_asset_create

**Ringkasan:** Mendaftarkan aset EAM baru. Bila kode kosong, kode dibuat otomatis dan sebuah QR publik aset ikut dibuat. Tidak membuat aset tetap/penyusutan di GL.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `POST /api/ga/assets` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | tidak | Kode aset; kosongkan agar dibuat otomatis (awalan dari kategori+cabang, urut 4 digit). |
| `name` | body | `string` | ya | Nama aset. |
| `categoryId` | body | `string` | ya | ID kategori aset (gam_asset_categories). |
| `branchId` | body | `string` | ya | ID cabang pemilik aset (gam_branches). |
| `costCenterId` | body | `string` | tidak | ID cost center (opsional). |
| `picUserId` | body | `string` | tidak | ID user penanggung jawab (PIC) aset. |
| `serialNumber` | body | `string` | tidak | Nomor seri/rangka. |
| `acquisitionDate` | body | `date` | tidak | Tanggal perolehan (YYYY-MM-DD). |
| `acquisitionCost` | body | `number` | tidak | Nilai perolehan (Rp). Informasi EAM saja; penyusutan ada di modul Aset Tetap. |
| `status` | body | enum: `ACTIVE`, `IN_REPAIR`, `RETIRED`, `LOST` | tidak | Status aset: ACTIVE (aktif), IN_REPAIR (sedang diperbaiki), RETIRED (dipensiunkan), LOST (hilang). |
| `condition` | body | enum: `GOOD`, `FAIR`, `POOR`, `BROKEN` | tidak | Kondisi fisik: GOOD (baik), FAIR (cukup), POOR (kurang), BROKEN (rusak). |
| `location` | body | `string` | tidak | Keterangan lokasi bebas (teks). |
| `notes` | body | `string` | tidak | Catatan. |
| `customFields` | body | `object` | tidak | Isian khusus sesuai customFieldsSchema kategori (JSON). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_create",
  "args": {
    "name": "<name>",
    "categoryId": "<id>",
    "branchId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Daftarkan aset <name> (kategori <id>, cabang <id>). Setujui?"
}
```

**Isi hasil:** Objek {id, code} aset yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM. Membuat juga satu baris QR aset.

**Teks konfirmasi:** Daftarkan aset {name} (kategori {categoryId}, cabang {branchId}). Setujui?

**Prasyarat**

- Kategori aset dan cabang sudah ada (master).

**Error umum**

- 400: nama/kategori/cabang kosong.
- 500: kode aset sudah dipakai.

**Tool terkait:** [`ga_asset_next_code`](#ga_asset_next_code), [`ga_asset_update`](#ga_asset_update)

### ga_asset_delete_photo

**Ringkasan:** Menghapus satu foto aset (baris DB dan file di disk). Idempotent: tidak error bila foto sudah tidak ada.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `DELETE /api/ga/assets/:id/photos/:photoId` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset. |
| `photoId` | path | `string` | ya | ID foto aset. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_delete_photo",
  "args": {
    "id": "<id>",
    "photoId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus foto <id> dari aset <id>. Setujui?"
}
```

**Isi hasil:** Tanpa isi (204).

**Efek pembukuan/stok:** Tidak ada efek GL/stok; file foto dihapus permanen.

**Teks konfirmasi:** Hapus foto {photoId} dari aset {id}. Setujui?

### ga_asset_get

**Ringkasan:** Detail satu aset EAM: kategori, cabang, cost center, QR, daftar foto, PIC, dan profil aset tetap (keuangan/penyusutan) bila ada.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_assets` / `view`)
- **Handler:** `GET /api/ga/assets/:id` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek aset lengkap dengan relasi dan nama PIC.>"
}
```

**Isi hasil:** Objek aset lengkap dengan relasi dan nama PIC.

**Error umum**

- 404: aset tidak ditemukan.

**Tool terkait:** [`ga_asset_list`](#ga_asset_list), [`ga_asset_update`](#ga_asset_update)

### ga_asset_list

**Ringkasan:** Daftar aset EAM dengan filter kategori (boleh beberapa id dipisah koma), cabang, cost center, PIC, status, kondisi, rentang tanggal perolehan, dan pencarian teks (kode/nama/serial/lokasi). Gunakan paginated=1 untuk hasil berhalaman beserta total.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_assets` / `view`)
- **Handler:** `GET /api/ga/assets` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `categoryKind` | query | enum: `vehicle`, `building`, `equipment` | tidak | Pintasan kelompok kategori yang di-resolve server. |
| `limit` | query | `number` | tidak | Ukuran halaman (default 100, maks 500). |
| `page` | query | `number` | tidak | Nomor halaman (default 1). |
| `sort` | query | `string` | tidak | Urutan: code\|name\|status\|condition\|acquisitionDate\|createdAt; awalan "-" = turun. |
| `thumb` | query | `string` | tidak | Isi 1 untuk menyertakan foto pertama per aset. |
| `paginated` | query | `string` | tidak | Isi 1 agar hasil berbentuk {data,total,page,limit}. |
| `categoryId` | query | `string` | tidak | Satu atau beberapa ID kategori dipisah koma. |
| `branchId` | query | `string` | tidak | Filter cabang. |
| `costCenterId` | query | `string` | tidak | Filter cost center. |
| `picUserId` | query | `string` | tidak | Filter penanggung jawab. |
| `status` | query | enum: `ACTIVE`, `IN_REPAIR`, `RETIRED`, `LOST` | tidak | Filter status aset. |
| `condition` | query | enum: `GOOD`, `FAIR`, `POOR`, `BROKEN` | tidak | Filter kondisi aset. |
| `acquisitionFrom` | query | `date` | tidak | Perolehan mulai tanggal (YYYY-MM-DD). |
| `acquisitionTo` | query | `date` | tidak | Perolehan sampai tanggal (YYYY-MM-DD). |
| `q` | query | `string` | tidak | Cari di kode, nama, nomor seri, lokasi. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_list",
  "args": {
    "categoryKind": "vehicle",
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array aset (atau {data,total,page,limit} bila paginated=1) beserta kategori, cabang, cost >"
}
```

**Isi hasil:** Array aset (atau {data,total,page,limit} bila paginated=1) beserta kategori, cabang, cost center, QR, PIC, dan ringkasan profil aset tetap.

**Error umum**

- 400: categoryKind tidak valid.

**Tool terkait:** [`ga_asset_get`](#ga_asset_get), [`ga_asset_next_code`](#ga_asset_next_code)

### ga_asset_next_code

**Ringkasan:** Mengusulkan kode aset berikutnya untuk kombinasi kategori + cabang (awalan dari kode kategori/cabang + urutan 4 digit). Hanya saran: kode sebenarnya dibuat atomik saat aset dibuat.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_assets` / `view`)
- **Handler:** `GET /api/ga/assets/_next-code` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `categoryId` | query | `string` | ya | ID kategori aset. |
| `branchId` | query | `string` | ya | ID cabang. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_next_code",
  "args": {
    "categoryId": "<id>",
    "branchId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {code} berisi kode aset yang disarankan.>"
}
```

**Isi hasil:** Objek {code} berisi kode aset yang disarankan.

**Error umum**

- 400: categoryId & branchId wajib.
- 404: kategori atau cabang tidak ditemukan.

**Tool terkait:** [`ga_asset_create`](#ga_asset_create)

### ga_asset_set_condition

**Ringkasan:** Memperbarui kondisi fisik aset (GOOD/FAIR/POOR/BROKEN) dan opsional catatan (maks 2000 karakter; catatan lama ditimpa bila dikirim).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `PATCH /api/ga/assets/:id/condition` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset. |
| `condition` | body | enum: `GOOD`, `FAIR`, `POOR`, `BROKEN` | ya | Kondisi baru. |
| `notes` | body | `string` | tidak | Catatan kondisi (maks 2000 karakter). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_set_condition",
  "args": {
    "id": "<id>",
    "condition": "GOOD"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Set kondisi aset <id> menjadi GOOD. Setujui?"
}
```

**Isi hasil:** Objek {id, condition}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Set kondisi aset {id} menjadi {condition}. Setujui?

**Error umum**

- 400: kondisi tidak valid.
- 404: aset tidak ditemukan.

### ga_asset_update

**Ringkasan:** Mengubah data aset. PERHATIAN: field opsional yang tidak dikirim (cost center, PIC, nomor seri, tanggal & nilai perolehan, lokasi, catatan) akan di-NULL-kan oleh server; kirim ulang nilai yang ingin dipertahankan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_assets` / `edit`)
- **Handler:** `PUT /api/ga/assets/:id` (src/routes/ga/assets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset yang diubah. |
| `code` | body | `string` | tidak | Kode aset; kosongkan agar dibuat otomatis (awalan dari kategori+cabang, urut 4 digit). |
| `name` | body | `string` | tidak | Nama aset. |
| `categoryId` | body | `string` | tidak | ID kategori aset (gam_asset_categories). |
| `branchId` | body | `string` | tidak | ID cabang pemilik aset (gam_branches). |
| `costCenterId` | body | `string` | tidak | ID cost center (opsional). |
| `picUserId` | body | `string` | tidak | ID user penanggung jawab (PIC) aset. |
| `serialNumber` | body | `string` | tidak | Nomor seri/rangka. |
| `acquisitionDate` | body | `date` | tidak | Tanggal perolehan (YYYY-MM-DD). |
| `acquisitionCost` | body | `number` | tidak | Nilai perolehan (Rp). Informasi EAM saja; penyusutan ada di modul Aset Tetap. |
| `status` | body | enum: `ACTIVE`, `IN_REPAIR`, `RETIRED`, `LOST` | tidak | Status aset: ACTIVE (aktif), IN_REPAIR (sedang diperbaiki), RETIRED (dipensiunkan), LOST (hilang). |
| `condition` | body | enum: `GOOD`, `FAIR`, `POOR`, `BROKEN` | tidak | Kondisi fisik: GOOD (baik), FAIR (cukup), POOR (kurang), BROKEN (rusak). |
| `location` | body | `string` | tidak | Keterangan lokasi bebas (teks). |
| `notes` | body | `string` | tidak | Catatan. |
| `customFields` | body | `object` | tidak | Isian khusus sesuai customFieldsSchema kategori (JSON). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_asset_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah data aset <id>. Setujui?"
}
```

**Isi hasil:** Objek {id} aset yang diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah data aset {id}. Setujui?

**Error umum**

- 404/500: aset tidak ditemukan.

**Tool terkait:** [`ga_asset_get`](#ga_asset_get)

### ga_bld_add_rental

**Ringkasan:** Mencatat kontrak sewa gedung (SEWA_MASUK = perusahaan menyewa; SEWA_KELUAR = menyewakan). Hanya data kontrak, tidak membuat tagihan/jurnal.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_building` / `edit`)
- **Handler:** `POST /api/ga/building/assets/:id/rentals` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |
| `arah` | body | `enum` | ya | SEWA_MASUK atau SEWA_KELUAR. |
| `pihak` | body | `string` | ya | Nama pihak lawan. |
| `kontak` | body | `string` | tidak |  |
| `nilaiSewa` | body | `number` | ya | Nilai sewa (Rp) per periode. |
| `periode` | body | `enum` | ya | BULANAN atau TAHUNAN. |
| `tanggalMulai` | body | `string` | ya | Awal kontrak. |
| `tanggalAkhir` | body | `string` | ya | Akhir kontrak. |
| `documentId` | body | `string` | tidak | ID dokumen kontrak (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_add_rental",
  "args": {
    "id": "<id>",
    "arah": "<arah>",
    "pihak": "<pihak>",
    "nilaiSewa": 1,
    "periode": "<periode>",
    "tanggalMulai": "<tanggalMulai>",
    "tanggalAkhir": "<tanggalAkhir>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat sewa <arah> gedung <id> dengan <pihak>, Rp 1/<periode>, <tanggalMulai> s/d <tanggalAkhir>. Setujui?"
}
```

**Isi hasil:** Sewa yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (pencatatan kontrak saja).

**Teks konfirmasi:** Catat sewa {arah} gedung {id} dengan {pihak}, Rp {nilaiSewa}/{periode}, {tanggalMulai} s/d {tanggalAkhir}. Setujui?

### ga_bld_delete_rental

**Ringkasan:** Menghapus permanen catatan kontrak sewa gedung (data kontraktual).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_building` / `edit`)
- **Handler:** `DELETE /api/ga/building/assets/:id/rentals/:rid` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |
| `rid` | path | `string` | ya | ID sewa. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_delete_rental",
  "args": {
    "id": "<id>",
    "rid": "<rid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS kontrak sewa <rid> gedung <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** HAPUS kontrak sewa {rid} gedung {id}. Setujui?

**Tool terkait:** [`ga_bld_end_rental`](#ga_bld_end_rental)

### ga_bld_end_rental

**Ringkasan:** Mengakhiri kontrak sewa (status BERAKHIR) tanpa menghapus riwayat.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_building` / `edit`)
- **Handler:** `PATCH /api/ga/building/assets/:id/rentals/:rid/end` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |
| `rid` | path | `string` | ya | ID sewa. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_end_rental",
  "args": {
    "id": "<id>",
    "rid": "<rid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Akhiri kontrak sewa <rid> gedung <id>. Setujui?"
}
```

**Isi hasil:** Sewa dengan status BERAKHIR.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Akhiri kontrak sewa {rid} gedung {id}. Setujui?

### ga_bld_get

**Ringkasan:** Data bangunan (1-1 dengan aset): jenis, kepemilikan, luas, lantai, alamat, sertifikat, NJOP. Null bila belum diisi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_building` / `view`)
- **Handler:** `GET /api/ga/building/assets/:id` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek GaBuildingData atau null.>"
}
```

**Isi hasil:** Objek GaBuildingData atau null.

### ga_bld_rentals

**Ringkasan:** Daftar kontrak sewa gedung (masuk/keluar) dengan nilai, periode, pihak, status, dan dokumen kontrak.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_building` / `view`)
- **Handler:** `GET /api/ga/building/assets/:id/rentals` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_rentals",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array sewa.>"
}
```

**Isi hasil:** Array sewa.

### ga_bld_update

**Ringkasan:** Menyimpan (upsert) data bangunan; field yang tidak dikirim dikosongkan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_building` / `edit`)
- **Handler:** `PUT /api/ga/building/assets/:id` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |
| `jenis` | body | `enum` | ya | KANTOR, GUDANG, PABRIK, RUMAH, MESS, RUKO, LAINNYA. |
| `ownership` | body | `enum` | tidak | MILIK_SENDIRI, SEWA_MASUK, SEWA_KELUAR, PINJAM_PAKAI (default MILIK_SENDIRI). |
| `luasTanah` | body | `number` | tidak |  |
| `luasBangunan` | body | `number` | tidak |  |
| `jumlahLantai` | body | `number` | tidak |  |
| `tahunBangun` | body | `number` | tidak |  |
| `tahunRenovasi` | body | `number` | tidak |  |
| `alamatLengkap` | body | `string` | tidak |  |
| `kelurahan` | body | `string` | tidak |  |
| `kecamatan` | body | `string` | tidak |  |
| `kota` | body | `string` | tidak |  |
| `provinsi` | body | `string` | tidak |  |
| `kodePos` | body | `string` | tidak |  |
| `certificateType` | body | `enum` | tidak | HM, HGB, HGU, HP_AKTA, GIRIK, BELUM_SERTIFIKAT. |
| `certificateNumber` | body | `string` | tidak |  |
| `njopTanah` | body | `number` | tidak |  |
| `njopBangunan` | body | `number` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_update",
  "args": {
    "id": "<id>",
    "jenis": "<jenis>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Simpan data bangunan aset <id> (jenis <jenis>). Setujui?"
}
```

**Isi hasil:** Data bangunan tersimpan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Simpan data bangunan aset {id} (jenis {jenis}). Setujui?

### ga_bld_update_rental

**Ringkasan:** Mengubah data kontrak sewa gedung.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_building` / `edit`)
- **Handler:** `PATCH /api/ga/building/assets/:id/rentals/:rid` (src/routes/ga/building.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset gedung (GaAsset.id). |
| `rid` | path | `string` | ya | ID sewa. |
| `arah` | body | enum: `SEWA_MASUK`, `SEWA_KELUAR` | tidak |  |
| `pihak` | body | `string` | tidak |  |
| `kontak` | body | `string` | tidak |  |
| `nilaiSewa` | body | `number` | tidak |  |
| `periode` | body | enum: `BULANAN`, `TAHUNAN` | tidak |  |
| `tanggalMulai` | body | `date` | tidak |  |
| `tanggalAkhir` | body | `date` | tidak |  |
| `documentId` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_bld_update_rental",
  "args": {
    "id": "<id>",
    "rid": "<rid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah kontrak sewa <rid> gedung <id>. Setujui?"
}
```

**Isi hasil:** Sewa setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah kontrak sewa {rid} gedung {id}. Setujui?

### ga_eqp_add_calibration

**Ringkasan:** Mencatat hasil kalibrasi dan menyinkronkan lastCalibratedAt serta jadwal kalibrasi berikutnya (= validUntil) pada data equipment.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_equipment` / `edit`)
- **Handler:** `POST /api/ga/equipment/assets/:id/calibration-logs` (src/routes/ga/equipment.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset equipment (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal kalibrasi. |
| `lembaga` | body | `string` | ya | Lembaga kalibrasi. |
| `noSertifikat` | body | `string` | ya | Nomor sertifikat. |
| `mode` | body | `enum` | tidak | ON_SITE atau SHIPPED (default ON_SITE). |
| `biaya` | body | `number` | tidak | Biaya (Rp). |
| `hasil` | body | `enum` | ya | PASS, FAIL, CONDITIONAL. |
| `deviasi` | body | `string` | tidak |  |
| `rangeTested` | body | `string` | tidak |  |
| `validUntil` | body | `string` | ya | Masa berlaku sertifikat. |
| `documentId` | body | `string` | tidak | ID dokumen sertifikat (opsional). |
| `workOrderId` | body | `string` | tidak | ID WO terkait (opsional). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_eqp_add_calibration",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "lembaga": "<lembaga>",
    "noSertifikat": "<noSertifikat>",
    "hasil": "<hasil>",
    "validUntil": "<validUntil>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat kalibrasi 2026-01-31 oleh <lembaga> (sertifikat <noSertifikat>, hasil <hasil>) untuk equipment <id>. Setujui?"
}
```

**Isi hasil:** Log kalibrasi yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Memperbarui GaEquipmentData.lastCalibratedAt dan nextCalibrationDue.

**Teks konfirmasi:** Catat kalibrasi {tanggal} oleh {lembaga} (sertifikat {noSertifikat}, hasil {hasil}) untuk equipment {id}. Setujui?

### ga_eqp_calibration_logs

**Ringkasan:** Riwayat kalibrasi equipment: lembaga, no. sertifikat, hasil, deviasi, berlaku sampai.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_equipment` / `view`)
- **Handler:** `GET /api/ga/equipment/assets/:id/calibration-logs` (src/routes/ga/equipment.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset equipment (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_eqp_calibration_logs",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array log kalibrasi.>"
}
```

**Isi hasil:** Array log kalibrasi.

### ga_eqp_delete_calibration

**Ringkasan:** Menghapus permanen log kalibrasi (catatan kepatuhan). Jadwal kalibrasi pada data equipment TIDAK dihitung ulang.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_equipment` / `edit`)
- **Handler:** `DELETE /api/ga/equipment/assets/:id/calibration-logs/:lid` (src/routes/ga/equipment.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset equipment (GaAsset.id). |
| `lid` | path | `string` | ya | ID log kalibrasi. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_eqp_delete_calibration",
  "args": {
    "id": "<id>",
    "lid": "<lid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS log kalibrasi <lid> equipment <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** HAPUS log kalibrasi {lid} equipment {id}. Setujui?

### ga_eqp_get

**Ringkasan:** Data equipment/alat ukur (timbangan): kapasitas, satuan, akurasi, kelas, interval & tanggal kalibrasi terakhir/berikutnya. Null bila belum diisi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_equipment` / `view`)
- **Handler:** `GET /api/ga/equipment/assets/:id` (src/routes/ga/equipment.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset equipment (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_eqp_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek GaEquipmentData atau null.>"
}
```

**Isi hasil:** Objek GaEquipmentData atau null.

### ga_eqp_update

**Ringkasan:** Menyimpan (upsert) data equipment; field yang tidak dikirim dikosongkan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_equipment` / `edit`)
- **Handler:** `PUT /api/ga/equipment/assets/:id` (src/routes/ga/equipment.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset equipment (GaAsset.id). |
| `maxCapacity` | body | `number` | tidak |  |
| `unit` | body | `enum` | tidak | KG, GRAM, TON, LBS. |
| `accuracy` | body | `number` | tidak |  |
| `classLabel` | body | `string` | tidak |  |
| `defaultCalibrator` | body | `string` | tidak |  |
| `intervalMonths` | body | `number` | tidak | Interval kalibrasi (bulan). |
| `lastCalibratedAt` | body | `string` | tidak | Tanggal kalibrasi terakhir. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_eqp_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Simpan data equipment aset <id>. Setujui?"
}
```

**Isi hasil:** Data equipment tersimpan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Simpan data equipment aset {id}. Setujui?

### ga_veh_add_fuel_log

**Ringkasan:** Mencatat satu pengisian BBM dan memajukan odometer terakhir bila lebih besar. Hanya data operasional; tidak membuat jurnal.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/fuel-logs` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal isi (YYYY-MM-DD). |
| `odometer` | body | `number` | tidak | Odometer saat isi (km). |
| `liters` | body | `number` | ya | Liter (> 0). |
| `pricePerLiter` | body | `number` | tidak | Harga per liter. |
| `totalCost` | body | `number` | ya | Total biaya (Rp). |
| `spbu` | body | `string` | tidak | Nama/lokasi SPBU. |
| `driverName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_fuel_log",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "liters": 1,
    "totalCost": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat BBM 1 liter, total Rp 1, kendaraan <id>, tgl 2026-01-31. Setujui?"
}
```

**Isi hasil:** Log BBM yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (biaya BBM tidak otomatis dijurnal dari endpoint ini).

**Teks konfirmasi:** Catat BBM {liters} liter, total Rp {totalCost}, kendaraan {id}, tgl {tanggal}. Setujui?

### ga_veh_add_incident

**Ringkasan:** Melaporkan insiden/kecelakaan kendaraan (default status DILAPORKAN).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/incidents` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal kejadian (YYYY-MM-DD). |
| `location` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `description` | body | `string` | ya | Kronologi singkat. |
| `severity` | body | `enum` | ya | RINGAN, SEDANG, BERAT. |
| `status` | body | `enum` | tidak | DILAPORKAN, DALAM_PROSES, SELESAI, KLAIM_ASURANSI. |
| `estimatedCost` | body | `number` | tidak | Estimasi biaya (Rp). |
| `actualCost` | body | `number` | tidak | Biaya aktual (Rp). |
| `insuranceClaimNo` | body | `string` | tidak | Nomor klaim asuransi. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_incident",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "description": "<description>",
    "severity": "<severity>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Laporkan insiden <severity> kendaraan <id>: <description>. Setujui?"
}
```

**Isi hasil:** Insiden yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (biaya hanya dicatat).

**Teks konfirmasi:** Laporkan insiden {severity} kendaraan {id}: {description}. Setujui?

### ga_veh_add_inspection

**Ringkasan:** Mencatat hasil inspeksi berkala kendaraan. nextDueDate dihitung otomatis dari intervalDays (default 30 hari) bila tidak diisi. Foto bukti diunggah terpisah lewat UI.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/inspections` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal inspeksi. |
| `odometer` | body | `number` | tidak |  |
| `checklist` | body | `object` | ya | Peta {kunci butir: OK\|PERLU_PERHATIAN\|RUSAK}. |
| `overallResult` | body | `enum` | ya | BAIK, PERLU_PERHATIAN, TIDAK_LAYAK. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `inspectorName` | body | `string` | tidak |  |
| `inspectorUserId` | body | `string` | tidak |  |
| `fuelLevel` | body | `enum` | tidak | KOSONG, SEPEREMPAT, SETENGAH, TIGA_PEREMPAT, PENUH. |
| `nextDueDate` | body | `date` | tidak | Tanggal inspeksi berikutnya (menimpa perhitungan otomatis). |
| `intervalDays` | body | `number` | tidak | Interval hari ke inspeksi berikutnya. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_inspection",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "checklist": {},
    "overallResult": "<overallResult>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat inspeksi kendaraan <id> tgl 2026-01-31, hasil <overallResult>. Setujui?"
}
```

**Isi hasil:** Inspeksi yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Catat inspeksi kendaraan {id} tgl {tanggal}, hasil {overallResult}. Setujui?

**Tool terkait:** [`ga_veh_inspection_categories`](#ga_veh_inspection_categories)

### ga_veh_add_insurance

**Ringkasan:** Mencatat polis asuransi kendaraan (jenis, perusahaan, premi, nilai pertanggungan, periode).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/insurances` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `type` | body | `enum` | ya | ALL_RISK, TLO, KECELAKAAN_DIRI, LAINNYA. |
| `provider` | body | `string` | ya | Nama perusahaan asuransi. |
| `policyNumber` | body | `string` | tidak |  |
| `premium` | body | `number` | tidak | Premi (Rp). |
| `coverageValue` | body | `number` | tidak | Nilai pertanggungan (Rp). |
| `startDate` | body | `date` | ya | Tanggal awal (YYYY-MM-DD). |
| `endDate` | body | `date` | ya | Tanggal akhir (YYYY-MM-DD). |
| `status` | body | `enum` | tidak | ACTIVE, EXPIRED, CANCELLED. |
| `documentId` | body | `string` | tidak | ID dokumen polis (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_insurance",
  "args": {
    "id": "<id>",
    "type": "<type>",
    "provider": "<provider>",
    "startDate": "2026-01-31",
    "endDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat polis <type> dari <provider> untuk kendaraan <id>, 2026-01-31 s/d 2026-01-31. Setujui?"
}
```

**Isi hasil:** Polis yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (premi hanya dicatat sebagai data, bukan jurnal).

**Teks konfirmasi:** Catat polis {type} dari {provider} untuk kendaraan {id}, {startDate} s/d {endDate}. Setujui?

### ga_veh_add_oil_log

**Ringkasan:** Mencatat penggantian oli (odometer, merek, volume, odometer ganti berikutnya) dan memajukan odometer terakhir kendaraan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/oil-logs` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal ganti. |
| `odometer` | body | `number` | ya | Odometer saat ganti (km). |
| `nextOdometerDue` | body | `number` | ya | Odometer ganti berikutnya (km). |
| `brand` | body | `string` | ya | Merek oli. |
| `volume` | body | `number` | ya | Volume (liter). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_oil_log",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "odometer": 1,
    "nextOdometerDue": 1,
    "brand": "<brand>",
    "volume": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat ganti oli <brand> 1 L pada odometer 1 km, kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Log oli yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Catat ganti oli {brand} {volume} L pada odometer {odometer} km, kendaraan {id}. Setujui?

### ga_veh_add_service

**Ringkasan:** Mencatat servis kendaraan (source=EAM) dan memajukan odometer terakhir. Default TIDAK membuat jurnal: log berbiaya > 0 masuk antrian Tagihan EAM (Pengajuan Pembayaran) untuk dibayar/diposting Keuangan. Dengan postJournal=true jurnal langsung diposting (tidak disarankan untuk agen).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/services` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tanggal` | body | `date` | ya | Tanggal servis (YYYY-MM-DD). |
| `odometer` | body | `number` | tidak |  |
| `jenisService` | body | `enum` | ya | Jenis servis: OLI, TUNE_UP, SERVIS_BERKALA, PERBAIKAN, GANTI_BAN, ELEKTRIKAL, AC, LAINNYA. |
| `deskripsi` | body | `string` | ya | Uraian pekerjaan. |
| `bengkel` | body | `string` | tidak | Nama bengkel. |
| `biaya` | body | `number` | tidak | Biaya (Rp); wajib > 0 bila postJournal. |
| `postJournal` | body | `boolean` | tidak | true = langsung posting jurnal beban. Biarkan false/kosong agar biaya masuk antrian Tagihan EAM. |
| `accountId` | body | `uuid` | tidak | Akun beban (debit) — hanya bila postJournal. |
| `creditAccountId` | body | `uuid` | tidak | Akun kas/bank/hutang (kredit) — hanya bila postJournal. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_service",
  "args": {
    "id": "<id>",
    "tanggal": "2026-01-31",
    "jenisService": "<jenisService>",
    "deskripsi": "<deskripsi>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat servis <jenisService> kendaraan <id> tgl 2026-01-31, biaya Rp {biaya}, posting jurnal: {postJournal}. Setujui?"
}
```

**Isi hasil:** Log servis yang dibuat (termasuk journalEntry bila postJournal).

**Efek pembukuan/stok:** Default: tidak ada GL (menunggu antrian Tagihan EAM). Bila postJournal=true: DR akun beban (default 6.7 Beban Pemeliharaan Kendaraan atau accountId) / CR Kas-Bank (default 1.1.1 Petty Cash atau creditAccountId).

**Teks konfirmasi:** Catat servis {jenisService} kendaraan {id} tgl {tanggal}, biaya Rp {biaya}, posting jurnal: {postJournal}. Setujui?

**Error umum**

- 400: Biaya harus > 0 untuk diposting ke jurnal
- 400: Akun 6.7/1.1.1 tidak ditemukan di COA

**Tool terkait:** [`ga_veh_post_service_journal`](#ga_veh_post_service_journal)

### ga_veh_add_tax

**Ringkasan:** Mencatat data pajak/STNK/KIR kendaraan. Status IN_PROCESS (atau tagihan yang disetujui) membuat record masuk antrian Tagihan EAM untuk dibayar Keuangan; tidak ada jurnal di sini.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/taxes` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `type` | body | `enum` | ya | STNK_TAHUNAN, STNK_5_TAHUNAN, KIR, PAJAK_KENDARAAN. |
| `periodYear` | body | `number` | ya | Tahun pajak. |
| `amount` | body | `number` | tidak | Nominal (Rp). |
| `paidAt` | body | `string` | tidak | Tanggal bayar bila dicatat manual. |
| `dueDate` | body | `date` | ya | Jatuh tempo (YYYY-MM-DD). |
| `status` | body | `enum` | tidak | ACTIVE, EXPIRED, IN_PROCESS (default ACTIVE). |
| `documentId` | body | `string` | tidak | ID dokumen legal terkait (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_tax",
  "args": {
    "id": "<id>",
    "type": "<type>",
    "periodYear": 1,
    "dueDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat <type> tahun 1 kendaraan <id>, jatuh tempo 2026-01-31, nominal Rp {amount}. Setujui?"
}
```

**Isi hasil:** Record pajak yang dibuat.

**Efek pembukuan/stok:** Tidak ada jurnal GL. Record berstatus IN_PROCESS akan muncul di antrian Tagihan EAM (VEHICLE_TAX).

**Teks konfirmasi:** Catat {type} tahun {periodYear} kendaraan {id}, jatuh tempo {dueDate}, nominal Rp {amount}. Setujui?

**Tool terkait:** [`ga_veh_create_tax_request`](#ga_veh_create_tax_request)

### ga_veh_add_tire

**Ringkasan:** Mencatat pemasangan ban pada posisi tertentu. Hanya satu ban ACTIVE per posisi.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/tires` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `serialNumber` | body | `string` | ya | Nomor seri ban. |
| `brand` | body | `string` | ya | Merek. |
| `model` | body | `string` | tidak |  |
| `size` | body | `string` | tidak |  |
| `position` | body | `enum` | ya | Posisi: DEPAN_KIRI, DEPAN_KANAN, BELAKANG_KIRI, BELAKANG_KANAN, BELAKANG_KIRI_DALAM, BELAKANG_KIRI_LUAR, BELAKANG_KANAN_DALAM, BELAKANG_KANAN_LUAR, CADANGAN. |
| `installedAt` | body | `string` | ya | Tanggal pasang. |
| `installedOdometer` | body | `number` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `status` | body | `enum` | tidak | ACTIVE, ARCHIVED, SPARE (default ACTIVE). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_add_tire",
  "args": {
    "id": "<id>",
    "serialNumber": "<serialNumber>",
    "brand": "<brand>",
    "position": "<position>",
    "installedAt": "<installedAt>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat ban <serialNumber> posisi <position> pada kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Ban yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Catat ban {serialNumber} posisi {position} pada kendaraan {id}. Setujui?

**Error umum**

- 400: Posisi sudah diisi ban aktif lain

### ga_veh_approve_service

**Ringkasan:** Menyetujui pengajuan servis SUBMITTED dan otomatis membuat Work Order OPEN (PREVENTIVE untuk oli/tune up/servis berkala, selain itu CORRECTIVE). Idempoten: memakai WO lama bila sudah ada.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Catatan akses:** Siapa pun dengan izin edit modul ga_vehicle (tidak ada capability approval khusus, tidak ada cek atasan).
- **Handler:** `PATCH /api/ga/vehicle/service-requests/:id/approve` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan servis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_approve_service",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "SETUJUI pengajuan servis <id> dan buat Work Order. Setujui?"
}
```

**Isi hasil:** {id, status:"APPROVED", workOrderId, workOrderCode}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Membuat WO OPEN. Keputusan persetujuan tidak bisa ditarik.

**Teks konfirmasi:** SETUJUI pengajuan servis {id} dan buat Work Order. Setujui?

**Error umum**

- 400: Tidak bisa approve dari status <status>

**Tool terkait:** [`gm_wo_assign`](#gm_wo_assign)

### ga_veh_approve_tax_request

**Ringkasan:** Menyetujui pengajuan pajak dan otomatis membuat record pajak berstatus IN_PROCESS, yang langsung masuk antrian Tagihan EAM di Pengajuan Pembayaran untuk dibayar.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Catatan akses:** Siapa pun dengan izin edit modul ga_vehicle; pembayaran/posting tetap butuh izin payment_request edit (fork D).
- **Handler:** `PATCH /api/ga/vehicle/tax-requests/:id/approve` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan pajak. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_approve_tax_request",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "SETUJUI pengajuan pajak <id> (masuk antrian Tagihan EAM). Setujui?"
}
```

**Isi hasil:** {id, status:"APPROVED", taxId}.

**Efek pembukuan/stok:** Tidak ada jurnal langsung. Membuat GaVehicleTax IN_PROCESS → tagihan VEHICLE_TAX; posting nanti: DR 6.41 Beban Pajak & Perizinan Kendaraan / CR Kas-Bank (atau Hutang Usaha 2.1.1).

**Teks konfirmasi:** SETUJUI pengajuan pajak {id} (masuk antrian Tagihan EAM). Setujui?

**Error umum**

- 400: Tidak bisa approve dari status <status>

### ga_veh_assign_driver

**Ringkasan:** Menugaskan atau melepas driver/PIC kendaraan (GaAsset.picUserId). picUserId null = lepas driver.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/driver` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `picUserId` | body | `string` | tidak | ID user driver; null untuk melepas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_assign_driver",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tetapkan driver kendaraan <id> ke user {picUserId}. Setujui?"
}
```

**Isi hasil:** {id, picUserId, picName}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Tetapkan driver kendaraan {id} ke user {picUserId}. Setujui?

### ga_veh_cancel_service_journal

**Ringkasan:** Membatalkan (soft-cancel) jurnal log servis dan melepas tautannya sehingga log bisa diubah/diposting ulang.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/services/:sid/journal` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `sid` | path | `string` | ya | ID log servis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_cancel_service_journal",
  "args": {
    "id": "<id>",
    "sid": "<sid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "BATALKAN jurnal log servis <sid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** {message} nomor jurnal yang dibatalkan.

**Efek pembukuan/stok:** Void jurnal DR beban / CR kas-bank yang pernah diposting (reversal).

**Teks konfirmasi:** BATALKAN jurnal log servis {sid} kendaraan {id}. Setujui?

**Tool terkait:** [`ga_veh_post_service_journal`](#ga_veh_post_service_journal)

### ga_veh_cancel_service_req

**Ringkasan:** Membatalkan pengajuan servis yang masih SUBMITTED. Hanya pengaju asli yang boleh membatalkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Catatan akses:** Hanya pengaju pengajuan tersebut (403 untuk user lain).
- **Handler:** `PATCH /api/ga/vehicle/service-requests/:id/cancel` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan servis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_cancel_service_req",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Batalkan pengajuan servis <id>. Setujui?"
}
```

**Isi hasil:** {id, status:"CANCELLED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Batalkan pengajuan servis {id}. Setujui?

**Error umum**

- 403: Hanya pengaju yang bisa membatalkan
- 400: Tidak bisa cancel dari status <status>

### ga_veh_cancel_tax_request

**Ringkasan:** Membatalkan pengajuan pajak yang masih SUBMITTED; hanya pengaju asli yang boleh.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Catatan akses:** Hanya pengaju pengajuan tersebut (403 untuk user lain).
- **Handler:** `PATCH /api/ga/vehicle/tax-requests/:id/cancel` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan pajak. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_cancel_tax_request",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Batalkan pengajuan pajak <id>. Setujui?"
}
```

**Isi hasil:** {id, status:"CANCELLED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Batalkan pengajuan pajak {id}. Setujui?

**Error umum**

- 403: Hanya pengaju yang bisa membatalkan
- 400: Tidak bisa cancel dari status <status>

### ga_veh_create_service_request

**Ringkasan:** Mengajukan permintaan servis kendaraan (status SUBMITTED) untuk disetujui GA; belum membuat WO.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/service-requests` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `jenisService` | body | `enum` | ya | Jenis servis: OLI, TUNE_UP, SERVIS_BERKALA, PERBAIKAN, GANTI_BAN, ELEKTRIKAL, AC, LAINNYA. |
| `odometer` | body | `number` | tidak | Odometer saat ini. |
| `deskripsi` | body | `string` | ya | Keluhan/pekerjaan yang diminta. |
| `urgensi` | body | `enum` | tidak | LOW/MEDIUM/HIGH/URGENT (default MEDIUM). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_create_service_request",
  "args": {
    "id": "<id>",
    "jenisService": "<jenisService>",
    "deskripsi": "<deskripsi>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ajukan servis <jenisService> untuk kendaraan <id>: <deskripsi>. Setujui?"
}
```

**Isi hasil:** {id, status:"SUBMITTED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya pengajuan menunggu persetujuan.

**Teks konfirmasi:** Ajukan servis {jenisService} untuk kendaraan {id}: {deskripsi}. Setujui?

**Tool terkait:** [`ga_veh_approve_service`](#ga_veh_approve_service)

### ga_veh_create_tax_request

**Ringkasan:** Mengajukan pembayaran pajak/STNK/KIR kendaraan (status SUBMITTED) untuk disetujui; belum masuk antrian Tagihan EAM sampai disetujui.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/tax-requests` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `type` | body | `enum` | ya | STNK_TAHUNAN, STNK_5_TAHUNAN, KIR, PAJAK_KENDARAAN. |
| `periodYear` | body | `number` | ya | Tahun pajak. |
| `estimatedAmount` | body | `number` | tidak | Perkiraan nominal (Rp). |
| `dueDate` | body | `date` | ya | Jatuh tempo. |
| `deskripsi` | body | `string` | tidak |  |
| `urgensi` | body | `enum` | tidak | LOW/MEDIUM/HIGH/URGENT. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_create_tax_request",
  "args": {
    "id": "<id>",
    "type": "<type>",
    "periodYear": 1,
    "dueDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ajukan <type> tahun 1 kendaraan <id>, jatuh tempo 2026-01-31, estimasi Rp {estimatedAmount}. Setujui?"
}
```

**Isi hasil:** {id, status:"SUBMITTED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya pengajuan.

**Teks konfirmasi:** Ajukan {type} tahun {periodYear} kendaraan {id}, jatuh tempo {dueDate}, estimasi Rp {estimatedAmount}. Setujui?

**Tool terkait:** [`ga_veh_approve_tax_request`](#ga_veh_approve_tax_request)

### ga_veh_delete_fuel_log

**Ringkasan:** Menghapus satu log pengisian BBM kendaraan (data operasional, tanpa dampak GL).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/fuel-logs/:fid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `fid` | path | `string` | ya | ID log BBM. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_fuel_log",
  "args": {
    "id": "<id>",
    "fid": "<fid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus log BBM <fid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Hapus log BBM {fid} kendaraan {id}. Setujui?

### ga_veh_delete_incident

**Ringkasan:** Menghapus catatan insiden kendaraan (data operasional, tanpa dampak GL).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/incidents/:iid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID insiden. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_incident",
  "args": {
    "id": "<id>",
    "iid": "<iid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus insiden <iid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Hapus insiden {iid} kendaraan {id}. Setujui?

### ga_veh_delete_inspection

**Ringkasan:** Menghapus satu inspeksi beserta seluruh foto fisiknya (file ikut terhapus).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/inspections/:iid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID inspeksi. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_inspection",
  "args": {
    "id": "<id>",
    "iid": "<iid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus inspeksi <iid> kendaraan <id> beserta fotonya. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Menghapus berkas foto dari disk.

**Teks konfirmasi:** Hapus inspeksi {iid} kendaraan {id} beserta fotonya. Setujui?

### ga_veh_delete_inspection_photo

**Ringkasan:** Menghapus satu foto bukti inspeksi (metadata dan berkas).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID inspeksi. |
| `pid` | path | `string` | ya | ID foto. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_inspection_photo",
  "args": {
    "id": "<id>",
    "iid": "<iid>",
    "pid": "<pid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus foto <pid> dari inspeksi <iid>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Menghapus berkas dari disk.

**Teks konfirmasi:** Hapus foto {pid} dari inspeksi {iid}. Setujui?

### ga_veh_delete_insurance

**Ringkasan:** Menghapus permanen catatan polis asuransi kendaraan (data kontraktual).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/insurances/:iid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID polis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_insurance",
  "args": {
    "id": "<id>",
    "iid": "<iid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS polis <iid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** HAPUS polis {iid} kendaraan {id}. Setujui?

### ga_veh_delete_oil_log

**Ringkasan:** Menghapus satu log penggantian oli kendaraan (data operasional, tanpa dampak GL).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/oil-logs/:oid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `oid` | path | `string` | ya | ID log oli. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_oil_log",
  "args": {
    "id": "<id>",
    "oid": "<oid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus log oli <oid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Hapus log oli {oid} kendaraan {id}. Setujui?

### ga_veh_delete_service

**Ringkasan:** Menghapus permanen satu log servis (ditolak bila sudah dijurnal). Bila log berasal dari EAM dan belum dibayar, tagihannya hilang dari antrian Tagihan EAM.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/services/:sid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `sid` | path | `string` | ya | ID log servis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_service",
  "args": {
    "id": "<id>",
    "sid": "<sid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS log servis <sid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada jurnal. Menghapus data servis dan tagihan EAM terkait yang belum diposting.

**Teks konfirmasi:** HAPUS log servis {sid} kendaraan {id}. Setujui?

**Error umum**

- 400: Service log sudah diposting ke jurnal

### ga_veh_delete_tax

**Ringkasan:** Menghapus permanen record pajak kendaraan. PERHATIAN: kode tidak memeriksa apakah record sudah terjurnal/berfaktur sebelum menghapus.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/taxes/:tid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tid` | path | `string` | ya | ID record pajak. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_tax",
  "args": {
    "id": "<id>",
    "tid": "<tid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS data pajak <tid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Menghapus record pajak (dan tagihannya dari antrian EAM); jurnal/faktur yang sudah terbit TIDAK dibatalkan otomatis.

**Teks konfirmasi:** HAPUS data pajak {tid} kendaraan {id}. Setujui?

**Prasyarat**

- Pastikan record belum diposting di Pengajuan Pembayaran > Tagihan EAM.

### ga_veh_delete_tire

**Ringkasan:** Menghapus catatan ban kendaraan (data operasional, tanpa dampak GL/stok).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `DELETE /api/ga/vehicle/assets/:id/tires/:tid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tid` | path | `string` | ya | ID ban. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_delete_tire",
  "args": {
    "id": "<id>",
    "tid": "<tid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus catatan ban <tid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** HTTP 204 tanpa isi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Hapus catatan ban {tid} kendaraan {id}. Setujui?

### ga_veh_fleet

**Ringkasan:** Daftar armada berhalaman: identitas kendaraan, driver, odometer, status jatuh tempo pajak/STNK/KIR/asuransi/inspeksi, dan jumlah insiden terbuka.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/fleet` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `categoryKind` | query | `string` | tidak | Jenis kategori aset (default vehicle). |
| `sort` | query | `string` | tidak | code\|noPlat\|name\|odometer\|nextDue\|status; awalan "-" = menurun. |
| `categoryKind` | body | `string` | tidak | Jenis kategori aset (default vehicle). |
| `id` | body | `string` | tidak | Saring satu aset. |
| `search` | body | `string` | tidak | Cari kode/nama/plat/merek/driver (alias q). |
| `status` | body | enum: `ACTIVE`, `IN_REPAIR`, `RETIRED`, `LOST` | tidak | Status aset: ACTIVE, IN_REPAIR, RETIRED, LOST. |
| `due` | body | enum: `overdue`, `dueSoon`, `attention` | tidak | overdue, dueSoon, atau attention (gabungan). |
| `doc` | body | enum: `tax`, `stnk`, `kir`, `insurance`, `inspection` | tidak | Batasi jenis dokumen: tax, stnk, kir, insurance, inspection. |
| `page` | body | `number` | tidak | Halaman. |
| `limit` | body | `number` | tidak | Ukuran halaman (maks 200, default 25). |
| `sort` | body | `string` | tidak | code\|noPlat\|name\|odometer\|nextDue\|status; awalan "-" = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_fleet",
  "args": {
    "categoryKind": "<categoryKind>",
    "sort": "<sort>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data,total,page,limit,...} baris armada dengan status jatuh tempo per dokumen.>"
}
```

**Isi hasil:** {data,total,page,limit,...} baris armada dengan status jatuh tempo per dokumen.

**Error umum**

- 400: categoryKind/status/due/doc tidak valid

**Tool terkait:** [`ga_veh_fleet_summary`](#ga_veh_fleet_summary)

### ga_veh_fleet_report

**Ringkasan:** Laporan biaya & kinerja armada lintas-kendaraan untuk satu periode: tren biaya per kategori, kendaraan terboros.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/fleet-report` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `from` | query | `string` | tidak | Tanggal awal (default 12 bulan sampai akhir bulan ini). |
| `to` | query | `string` | tidak | Tanggal akhir (default akhir bulan ini). |
| `categoryId` | query | `string` | tidak | Saring satu kategori aset. |
| `from` | body | `date` | tidak | Tanggal awal (default 12 bulan sampai akhir bulan ini). |
| `to` | body | `date` | tidak | Tanggal akhir (default akhir bulan ini). |
| `categoryId` | body | `string` | tidak | Saring satu kategori aset. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_fleet_report",
  "args": {
    "from": "<from>",
    "to": "<to>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek laporan armada (periode, total, tren bulanan, topSpenders).>"
}
```

**Isi hasil:** Objek laporan armada (periode, total, tren bulanan, topSpenders).

### ga_veh_fleet_summary

**Ringkasan:** Ringkasan armada: jumlah kendaraan, pajak/asuransi yang jatuh tempo atau segera jatuh tempo (30 hari), insiden terbuka, inspeksi belum pernah dilakukan, serta biaya servis dan BBM bulan berjalan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/fleet-summary` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `categoryKind` | query | `string` | tidak | Jenis kategori aset (kosong = tanpa filter jenis). |
| `categoryId` | query | `string` | tidak | Saring satu kategori aset. |
| `categoryKind` | body | `string` | tidak | Jenis kategori aset (kosong = tanpa filter jenis). |
| `categoryId` | body | `string` | tidak | Saring satu kategori aset. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_fleet_summary",
  "args": {
    "categoryKind": "<categoryKind>",
    "categoryId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek ringkasan KPI armada.>"
}
```

**Isi hasil:** Objek ringkasan KPI armada.

**Error umum**

- 400: categoryKind tidak valid

### ga_veh_fuel_logs

**Ringkasan:** Riwayat pengisian BBM kendaraan (terbaru dulu): liter, harga, total biaya, SPBU, driver, odometer.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/fuel-logs` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_fuel_logs",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array log BBM.>"
}
```

**Isi hasil:** Array log BBM.

### ga_veh_get

**Ringkasan:** Data teknis kendaraan (1-1 dengan aset): plat, merek, tipe, tahun, no. mesin/rangka, BBM, tangki, odometer. Mengembalikan null bila belum diisi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek GaVehicleData atau null.>"
}
```

**Isi hasil:** Objek GaVehicleData atau null.

### ga_veh_incidents

**Ringkasan:** Riwayat insiden/kecelakaan kendaraan (tingkat keparahan, status, estimasi & biaya aktual, no. klaim asuransi).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/incidents` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_incidents",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array insiden.>"
}
```

**Isi hasil:** Array insiden.

### ga_veh_inspection_categories

**Ringkasan:** Struktur kategori & butir checklist inspeksi kendaraan (referensi statis, dipakai untuk menyusun checklist).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/inspection-categories` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_inspection_categories",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array kategori beserta butir.>"
}
```

**Isi hasil:** Array kategori beserta butir.

### ga_veh_inspection_checkpoints

**Ringkasan:** Daftar titik pemeriksaan standar inspeksi kendaraan (referensi statis).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/inspection-checkpoints` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_inspection_checkpoints",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array titik pemeriksaan.>"
}
```

**Isi hasil:** Array titik pemeriksaan.

### ga_veh_inspections

**Ringkasan:** Riwayat inspeksi berkala kendaraan: checklist, hasil keseluruhan, jadwal inspeksi berikutnya, dan metadata foto.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/inspections` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_inspections",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array inspeksi dengan photos (metadata).>"
}
```

**Isi hasil:** Array inspeksi dengan photos (metadata).

### ga_veh_insurances

**Ringkasan:** Riwayat polis asuransi kendaraan (akhir polis terbaru dulu) dengan dokumen polis terkait.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/insurances` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_insurances",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array polis {id, type, provider, policyNumber, premium, coverageValue, startDate, endDate,>"
}
```

**Isi hasil:** Array polis {id, type, provider, policyNumber, premium, coverageValue, startDate, endDate, status}.

### ga_veh_oil_logs

**Ringkasan:** Riwayat penggantian oli kendaraan beserta odometer jatuh tempo berikutnya.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/oil-logs` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_oil_logs",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array log oli.>"
}
```

**Isi hasil:** Array log oli.

### ga_veh_post_service_journal

**Ringkasan:** Memposting jurnal biaya untuk log servis EAM yang belum berjurnal (1 log = maksimal 1 jurnal). Log historis (source IMPORT/WORK_ORDER) tidak boleh diposting.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `POST /api/ga/vehicle/assets/:id/services/:sid/journal` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `sid` | path | `string` | ya | ID log servis. |
| `accountId` | body | `string` | tidak | Akun beban (debit); default 6.7. |
| `creditAccountId` | body | `string` | tidak | Akun kas/bank/hutang (kredit); default 1.1.1. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_post_service_journal",
  "args": {
    "id": "<id>",
    "sid": "<sid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Posting jurnal biaya servis <sid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** {message, journalEntry} — nomor jurnal yang dibuat.

**Efek pembukuan/stok:** DR akun beban (default 6.7 Beban Pemeliharaan Kendaraan) / CR Kas-Bank (default 1.1.1 Petty Cash) senilai biaya log. Jalur resmi pembayaran tetap lewat Pengajuan Pembayaran > Tagihan EAM.

**Teks konfirmasi:** Posting jurnal biaya servis {sid} kendaraan {id}. Setujui?

**Error umum**

- 400: Service log sudah memiliki jurnal
- 400: Service log bersumber IMPORT/WORK_ORDER tidak dapat diposting
- 400: Biaya harus > 0

**Tool terkait:** [`ga_veh_cancel_service_journal`](#ga_veh_cancel_service_journal)

### ga_veh_reject_service

**Ringkasan:** Menolak pengajuan servis SUBMITTED dengan alasan wajib.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/service-requests/:id/reject` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan servis. |
| `reason` | body | `string` | ya | Alasan penolakan (wajib). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_reject_service",
  "args": {
    "id": "<id>",
    "reason": "<reason>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "TOLAK pengajuan servis <id>. Alasan: <reason>. Setujui?"
}
```

**Isi hasil:** {id, status:"REJECTED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** TOLAK pengajuan servis {id}. Alasan: {reason}. Setujui?

**Error umum**

- 400: Tidak bisa reject dari status <status>

### ga_veh_reject_tax_request

**Ringkasan:** Menolak pengajuan pajak SUBMITTED dengan alasan wajib.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/tax-requests/:id/reject` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan pajak. |
| `reason` | body | `string` | ya | Alasan penolakan (wajib). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_reject_tax_request",
  "args": {
    "id": "<id>",
    "reason": "<reason>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "TOLAK pengajuan pajak <id>. Alasan: <reason>. Setujui?"
}
```

**Isi hasil:** {id, status:"REJECTED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** TOLAK pengajuan pajak {id}. Alasan: {reason}. Setujui?

**Error umum**

- 400: Tidak bisa reject dari status <status>

### ga_veh_report

**Ringkasan:** Laporan satu kendaraan untuk satu periode: biaya per kategori (servis, BBM, pajak, asuransi, insiden), tren, odometer, dan status dokumen.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/report` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `from` | query | `string` | tidak | Tanggal awal (default 12 bulan terakhir). |
| `to` | query | `string` | tidak | Tanggal akhir. |
| `from` | body | `date` | tidak | Tanggal awal (default 12 bulan terakhir). |
| `to` | body | `date` | tidak | Tanggal akhir. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_report",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek laporan kendaraan.>"
}
```

**Isi hasil:** Objek laporan kendaraan.

**Error umum**

- 404: Aset tidak ditemukan

### ga_veh_service_request_get

**Ringkasan:** Detail satu pengajuan servis: kendaraan, WO hasil approve, dan log servis terkait.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/service-requests/:id` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan servis. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_service_request_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Pengajuan lengkap dengan asset.vehicleData, workOrder, serviceLog.>"
}
```

**Isi hasil:** Pengajuan lengkap dengan asset.vehicleData, workOrder, serviceLog.

**Error umum**

- 404: Pengajuan tidak ditemukan

### ga_veh_service_requests

**Ringkasan:** Daftar pengajuan servis kendaraan (urut status, urgensi, terbaru) lengkap dengan WO hasil persetujuan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/service-requests` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | SUBMITTED, APPROVED, REJECTED, CANCELLED. |
| `assetId` | query | `string` | tidak | Saring per kendaraan. |
| `mine` | query | `string` | tidak | true = hanya pengajuan milik pemanggil. |
| `status` | body | enum: `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED` | tidak | SUBMITTED, APPROVED, REJECTED, CANCELLED. |
| `assetId` | body | `string` | tidak | Saring per kendaraan. |
| `mine` | body | enum: `true`, `false` | tidak | true = hanya pengajuan milik pemanggil. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_service_requests",
  "args": {
    "status": "<status>",
    "assetId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array pengajuan {id, assetId, jenisService, urgensi, status, asset, workOrder}.>"
}
```

**Isi hasil:** Array pengajuan {id, assetId, jenisService, urgensi, status, asset, workOrder}.

### ga_veh_services

**Ringkasan:** Riwayat servis kendaraan (terbaru dulu) beserta WO asal, status jurnal, dan akun beban/kredit bila sudah dijurnal.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/services` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_services",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array log servis {id, tanggal, jenisService, deskripsi, bengkel, biaya, source, workOrder,>"
}
```

**Isi hasil:** Array log servis {id, tanggal, jenisService, deskripsi, bengkel, biaya, source, workOrder, journalEntry, account}.

**Tool terkait:** [`ga_veh_add_service`](#ga_veh_add_service)

### ga_veh_tax_request_get

**Ringkasan:** Detail satu pengajuan pajak kendaraan beserta record pajaknya.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/tax-requests/:id` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan pajak. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_tax_request_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Pengajuan lengkap dengan asset.vehicleData dan tax.>"
}
```

**Isi hasil:** Pengajuan lengkap dengan asset.vehicleData dan tax.

**Error umum**

- 404: Pengajuan tidak ditemukan

### ga_veh_tax_requests

**Ringkasan:** Daftar pengajuan pajak kendaraan (urut status, urgensi, terbaru) dengan tautan record pajak hasil approve.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/tax-requests` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | SUBMITTED, APPROVED, REJECTED, CANCELLED. |
| `assetId` | query | `string` | tidak | Saring per kendaraan. |
| `mine` | query | `string` | tidak | true = hanya milik pemanggil. |
| `status` | body | enum: `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED` | tidak | SUBMITTED, APPROVED, REJECTED, CANCELLED. |
| `assetId` | body | `string` | tidak | Saring per kendaraan. |
| `mine` | body | enum: `true`, `false` | tidak | true = hanya milik pemanggil. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_tax_requests",
  "args": {
    "status": "<status>",
    "assetId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array pengajuan pajak {id, type, periodYear, status, asset, tax}.>"
}
```

**Isi hasil:** Array pengajuan pajak {id, type, periodYear, status, asset, tax}.

### ga_veh_taxes

**Ringkasan:** Riwayat pajak/STNK/KIR kendaraan per tahun (jatuh tempo terbaru dulu) dengan dokumen terkait.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/taxes` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_taxes",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {id, type, periodYear, amount, dueDate, paidAt, status, journalEntryId, purchaseInvo>"
}
```

**Isi hasil:** Array {id, type, periodYear, amount, dueDate, paidAt, status, journalEntryId, purchaseInvoiceId, document}.

### ga_veh_tires

**Ringkasan:** Daftar ban kendaraan per posisi (nomor seri, merek, ukuran, pemasangan, status).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_vehicle` / `view`)
- **Handler:** `GET /api/ga/vehicle/assets/:id/tires` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_tires",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array ban diurut posisi.>"
}
```

**Isi hasil:** Array ban diurut posisi.

### ga_veh_update

**Ringkasan:** Menyimpan (upsert) data teknis kendaraan; semua field dikirim penuh (field yang tidak dikirim dikosongkan).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PUT /api/ga/vehicle/assets/:id` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `noPlat` | body | `string` | tidak |  |
| `brand` | body | `string` | tidak | Merek. |
| `tipe` | body | `string` | tidak |  |
| `tahunProduksi` | body | `number` | tidak |  |
| `noMesin` | body | `string` | tidak |  |
| `noRangka` | body | `string` | tidak |  |
| `jenisBBM` | body | `enum` | tidak | BENSIN, SOLAR, PERTAMAX, PERTALITE, DEX, LPG, LISTRIK, HYBRID, LAINNYA. |
| `kapasitasTangki` | body | `number` | tidak |  |
| `warna` | body | `string` | tidak |  |
| `odometerSaatBeli` | body | `number` | tidak |  |
| `odometerTerakhir` | body | `number` | tidak | Odometer terakhir (km) — juga dimajukan otomatis oleh servis/BBM/oli. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Simpan data kendaraan aset <id> (plat {noPlat}). Setujui?"
}
```

**Isi hasil:** Data kendaraan tersimpan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Simpan data kendaraan aset {id} (plat {noPlat}). Setujui?

**Error umum**

- 400: validasi skema

**Tool terkait:** [`ga_veh_get`](#ga_veh_get)

### ga_veh_update_incident

**Ringkasan:** Mengubah data insiden (status penanganan, biaya, nomor klaim).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/incidents/:iid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID insiden. |
| `tanggal` | body | `date` | tidak | Tanggal kejadian (YYYY-MM-DD). |
| `location` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `description` | body | `string` | tidak | Keterangan. |
| `severity` | body | enum: `RINGAN`, `SEDANG`, `BERAT` | tidak |  |
| `status` | body | enum: `DILAPORKAN`, `DALAM_PROSES`, `SELESAI`, `KLAIM_ASURANSI` | tidak | Filter status dokumen. |
| `estimatedCost` | body | `number` | tidak |  |
| `actualCost` | body | `number` | tidak |  |
| `insuranceClaimNo` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update_incident",
  "args": {
    "id": "<id>",
    "iid": "<iid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah insiden <iid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Insiden setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah insiden {iid} kendaraan {id}. Setujui?

### ga_veh_update_insurance

**Ringkasan:** Mengubah data polis asuransi kendaraan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/insurances/:iid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `iid` | path | `string` | ya | ID polis. |
| `type` | body | enum: `ALL_RISK`, `TLO`, `KECELAKAAN_DIRI`, `LAINNYA` | tidak | Tipe/jenis (nilai valid mengikuti skema). |
| `provider` | body | `string` | tidak |  |
| `policyNumber` | body | `string` | tidak |  |
| `premium` | body | `number` | tidak |  |
| `coverageValue` | body | `number` | tidak |  |
| `startDate` | body | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | body | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `status` | body | enum: `ACTIVE`, `EXPIRED`, `CANCELLED` | tidak | Filter status dokumen. |
| `documentId` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update_insurance",
  "args": {
    "id": "<id>",
    "iid": "<iid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah polis <iid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Polis setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah polis {iid} kendaraan {id}. Setujui?

### ga_veh_update_service

**Ringkasan:** Mengubah log servis (tanggal, odometer, jenis, deskripsi, bengkel, biaya). Ditolak bila log sudah punya jurnal aktif untuk field tanggal/biaya/deskripsi.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/services/:sid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `sid` | path | `string` | ya | ID log servis. |
| `tanggal` | body | `date` | tidak | Tanggal kejadian (YYYY-MM-DD). |
| `odometer` | body | `number` | tidak |  |
| `jenisService` | body | enum: `OLI`, `TUNE_UP`, `SERVIS_BERKALA`, `PERBAIKAN`, `GANTI_BAN`, `ELEKTRIKAL`, `AC`, `LAINNYA` | tidak |  |
| `deskripsi` | body | `string` | tidak |  |
| `bengkel` | body | `string` | tidak |  |
| `biaya` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update_service",
  "args": {
    "id": "<id>",
    "sid": "<sid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah log servis <sid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Log servis setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL. Mengubah biaya mengubah nilai tagihan di antrian Tagihan EAM bila belum diposting.

**Teks konfirmasi:** Ubah log servis {sid} kendaraan {id}. Setujui?

**Error umum**

- 400: Service log sudah diposting ke jurnal — batalkan jurnal dulu

### ga_veh_update_tax

**Ringkasan:** Mengubah data pajak kendaraan. Status record yang sudah IN_PROCESS/terjurnal/berfaktur tidak boleh diturunkan (409).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/taxes/:tid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tid` | path | `string` | ya | ID record pajak. |
| `type` | body | enum: `STNK_TAHUNAN`, `STNK_5_TAHUNAN`, `KIR`, `PAJAK_KENDARAAN` | tidak | Tipe/jenis (nilai valid mengikuti skema). |
| `periodYear` | body | `number` | tidak |  |
| `amount` | body | `number` | tidak | Nominal (Rupiah). |
| `paidAt` | body | `date` | tidak |  |
| `dueDate` | body | `date` | tidak | Tanggal jatuh tempo (YYYY-MM-DD). |
| `status` | body | enum: `ACTIVE`, `EXPIRED`, `IN_PROCESS` | tidak | Filter status dokumen. |
| `documentId` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update_tax",
  "args": {
    "id": "<id>",
    "tid": "<tid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah data pajak <tid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Record pajak setelah diubah.

**Efek pembukuan/stok:** Tidak ada jurnal GL. Mengubah nominal memengaruhi tagihan di antrian EAM bila belum diposting.

**Teks konfirmasi:** Ubah data pajak {tid} kendaraan {id}. Setujui?

**Error umum**

- 409: Status tidak bisa diubah — sudah terjurnal / berfaktur / di antrian Tagihan

### ga_veh_update_tire

**Ringkasan:** Mengubah data/posisi/status ban (mis. pindah ke ARCHIVED). Menolak bila posisi ACTIVE bentrok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_vehicle` / `edit`)
- **Handler:** `PATCH /api/ga/vehicle/assets/:id/tires/:tid` (src/routes/ga/vehicle.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset kendaraan (GaAsset.id). |
| `tid` | path | `string` | ya | ID ban. |
| `serialNumber` | body | `string` | tidak |  |
| `brand` | body | `string` | tidak | Merek. |
| `model` | body | `string` | tidak |  |
| `size` | body | `string` | tidak |  |
| `position` | body | enum: `DEPAN_KIRI`, `DEPAN_KANAN`, `BELAKANG_KIRI`, `BELAKANG_KANAN`, `BELAKANG_KIRI_DALAM`, `BELAKANG_KIRI_LUAR`, `BELAKANG_KANAN_DALAM`, `BELAKANG_KANAN_LUAR`, `CADANGAN` | tidak |  |
| `installedAt` | body | `date` | tidak |  |
| `installedOdometer` | body | `number` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `status` | body | enum: `ACTIVE`, `ARCHIVED`, `SPARE` | tidak | Filter status dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "ga_veh_update_tire",
  "args": {
    "id": "<id>",
    "tid": "<tid>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah ban <tid> kendaraan <id>. Setujui?"
}
```

**Isi hasil:** Ban setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah ban {tid} kendaraan {id}. Setujui?

**Error umum**

- 400: Posisi sudah diisi ban aktif lain

### gam_asset_cat_create

**Ringkasan:** Membuat kategori aset baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/asset-categories` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `customFieldsSchema` | body | `object` | tidak |  |
| `maintenanceChecklistSchema` | body | `object` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gam_asset_cat_create",
  "args": {
    "code": "<code>",
    "name": "<name>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat kategori aset baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek kategori aset yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat kategori aset baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_asset_categories`](#gam_asset_categories), [`gam_asset_cat_update`](#gam_asset_cat_update)

### gam_asset_cat_delete

**Ringkasan:** Menghapus permanen kategori aset berdasarkan id. Gagal bila masih dipakai oleh aset (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/asset-categories/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID kategori aset yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_asset_cat_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN kategori aset <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN kategori aset {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh aset.

**Tool terkait:** [`gam_asset_cat_update`](#gam_asset_cat_update)

### gam_asset_cat_update

**Ringkasan:** Mengubah sebagian atau seluruh field kategori aset berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/asset-categories/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID kategori aset yang diubah. |
| `code` | body | `string` | tidak | Kode kategori unik; dipakai sebagai awalan kode aset otomatis. |
| `name` | body | `string` | tidak | Nama kategori aset. |
| `isActive` | body | `boolean` | tidak | Status aktif; default true. |
| `customFieldsSchema` | body | `object` | tidak | Definisi kolom isian khusus (JSON) untuk aset kategori ini. |
| `maintenanceChecklistSchema` | body | `object` | tidak | Template checklist maintenance (JSON) untuk kategori ini. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_asset_cat_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah kategori aset <id>. Setujui?"
}
```

**Isi hasil:** Objek kategori aset setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah kategori aset {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_asset_categories`](#gam_asset_categories)

### gam_asset_categories

**Ringkasan:** Daftar kategori aset (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/asset-categories` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_asset_categories",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array kategori aset lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array kategori aset lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_asset_cat_create`](#gam_asset_cat_create)

### gam_branch_create

**Ringkasan:** Membuat cabang baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/branches` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `address` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gam_branch_create",
  "args": {
    "code": "<code>",
    "name": "<name>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat cabang baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek cabang yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat cabang baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_branches`](#gam_branches), [`gam_branch_update`](#gam_branch_update)

### gam_branch_delete

**Ringkasan:** Menghapus permanen cabang berdasarkan id. Gagal bila masih dipakai oleh aset, cost center, dan lokasi (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/branches/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID cabang yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_branch_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN cabang <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN cabang {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh aset, cost center, dan lokasi.

**Tool terkait:** [`gam_branch_update`](#gam_branch_update)

### gam_branch_update

**Ringkasan:** Mengubah sebagian atau seluruh field cabang berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/branches/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID cabang yang diubah. |
| `code` | body | `string` | tidak | Kode cabang unik (maks 50 karakter). |
| `name` | body | `string` | tidak | Nama cabang (maks 200 karakter). |
| `isActive` | body | `boolean` | tidak | Status aktif; default true. |
| `address` | body | `string` | tidak | Alamat cabang. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_branch_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah cabang <id>. Setujui?"
}
```

**Isi hasil:** Objek cabang setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah cabang {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_branches`](#gam_branches)

### gam_branches

**Ringkasan:** Daftar cabang (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/branches` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_branches",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array cabang lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array cabang lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_branch_create`](#gam_branch_create)

### gam_cc_delete

**Ringkasan:** Menghapus permanen cost center berdasarkan id. Gagal bila masih dipakai oleh aset (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/cost-centers/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID cost center yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_cc_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN cost center <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN cost center {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh aset.

**Tool terkait:** [`gam_cc_update`](#gam_cc_update)

### gam_cc_update

**Ringkasan:** Mengubah sebagian atau seluruh field cost center berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/cost-centers/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID cost center yang diubah. |
| `code` | body | `string` | tidak | Kode cost center unik. |
| `name` | body | `string` | tidak | Nama cost center. |
| `isActive` | body | `boolean` | tidak | Status aktif; default true. |
| `branchId` | body | `string` | tidak | ID cabang induk (gam_branches). |

**Contoh pemanggilan**

```json
{
  "tool": "gam_cc_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah cost center <id>. Setujui?"
}
```

**Isi hasil:** Objek cost center setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah cost center {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_cost_centers`](#gam_cost_centers)

### gam_cost_center_create

**Ringkasan:** Membuat cost center baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/cost-centers` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `branchId` | body | `string` | ya | ID cabang. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_cost_center_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "branchId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat cost center baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek cost center yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat cost center baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_cost_centers`](#gam_cost_centers), [`gam_cc_update`](#gam_cc_update)

### gam_cost_centers

**Ringkasan:** Daftar cost center (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/cost-centers` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_cost_centers",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array cost center lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array cost center lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_cost_center_create`](#gam_cost_center_create)

### gam_doctype_create

**Ringkasan:** Membuat tipe dokumen legal baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/document-types` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `category` | body | `string` | tidak | Kategori aset tetap. |
| `customFieldsSchema` | body | `object` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gam_doctype_create",
  "args": {
    "code": "<code>",
    "name": "<name>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat tipe dokumen legal baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek tipe dokumen legal yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat tipe dokumen legal baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_document_types`](#gam_document_types), [`gam_doctype_update`](#gam_doctype_update)

### gam_doctype_delete

**Ringkasan:** Menghapus permanen tipe dokumen legal berdasarkan id. Gagal bila masih dipakai oleh dokumen legal (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/document-types/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID tipe dokumen legal yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_doctype_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN tipe dokumen legal <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN tipe dokumen legal {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh dokumen legal.

**Tool terkait:** [`gam_doctype_update`](#gam_doctype_update)

### gam_doctype_update

**Ringkasan:** Mengubah sebagian atau seluruh field tipe dokumen legal berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/document-types/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID tipe dokumen legal yang diubah. |
| `code` | body | `string` | tidak | Kode tipe dokumen unik; jadi awalan kode dokumen otomatis. |
| `name` | body | `string` | tidak | Nama tipe dokumen (mis. STNK, SIUP, Sertifikat Kalibrasi). |
| `isActive` | body | `boolean` | tidak | Status aktif; default true. |
| `category` | body | `string` | tidak | Pengelompokan bebas tipe dokumen. |
| `customFieldsSchema` | body | `object` | tidak | Definisi kolom isian khusus (JSON). |

**Contoh pemanggilan**

```json
{
  "tool": "gam_doctype_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah tipe dokumen legal <id>. Setujui?"
}
```

**Isi hasil:** Objek tipe dokumen legal setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah tipe dokumen legal {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_document_types`](#gam_document_types)

### gam_document_types

**Ringkasan:** Daftar tipe dokumen legal (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/document-types` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_document_types",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array tipe dokumen legal lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array tipe dokumen legal lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_doctype_create`](#gam_doctype_create)

### gam_invcat_create

**Ringkasan:** Membuat kategori inventaris GA baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/inventory-categories` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `type` | body | enum: `SPAREPART`, `CONSUMABLE` | ya | Tipe/jenis (nilai valid mengikuti skema). |

**Contoh pemanggilan**

```json
{
  "tool": "gam_invcat_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "type": "SPAREPART"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat kategori inventaris GA baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek kategori inventaris GA yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat kategori inventaris GA baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_inventory_categories`](#gam_inventory_categories), [`gam_invcat_update`](#gam_invcat_update)

### gam_invcat_delete

**Ringkasan:** Menghapus permanen kategori inventaris GA berdasarkan id. Gagal bila masih dipakai oleh item inventaris GA (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/inventory-categories/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID kategori inventaris GA yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_invcat_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN kategori inventaris GA <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN kategori inventaris GA {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh item inventaris GA.

**Tool terkait:** [`gam_invcat_update`](#gam_invcat_update)

### gam_invcat_update

**Ringkasan:** Mengubah sebagian atau seluruh field kategori inventaris GA berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/inventory-categories/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID kategori inventaris GA yang diubah. |
| `code` | body | `string` | tidak | Kode kategori unik. |
| `name` | body | `string` | tidak | Nama kategori. |
| `type` | body | enum: `SPAREPART`, `CONSUMABLE` | tidak | Jenis barang: SPAREPART (suku cadang) atau CONSUMABLE (habis pakai/ATK). |

**Contoh pemanggilan**

```json
{
  "tool": "gam_invcat_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah kategori inventaris GA <id>. Setujui?"
}
```

**Isi hasil:** Objek kategori inventaris GA setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah kategori inventaris GA {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_inventory_categories`](#gam_inventory_categories)

### gam_inventory_categories

**Ringkasan:** Daftar kategori inventaris GA (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/inventory-categories` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_inventory_categories",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array kategori inventaris GA lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array kategori inventaris GA lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_invcat_create`](#gam_invcat_create)

### gam_location_create

**Ringkasan:** Membuat lokasi gudang EAM baru di master EAM. Kode harus unik; tidak berdampak ke GL maupun stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `POST /api/ga/master/locations` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `branchId` | body | `string` | ya | ID cabang. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_location_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "branchId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat lokasi gudang EAM baru kode <code> - <name>. Setujui?"
}
```

**Isi hasil:** Objek lokasi gudang EAM yang dibuat (termasuk id).

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Buat lokasi gudang EAM baru kode {code} - {name}. Setujui?

**Error umum**

- 400: validasi gagal (kode/nama kosong).
- 409/500: kode sudah dipakai (unique).

**Tool terkait:** [`gam_locations`](#gam_locations), [`gam_location_update`](#gam_location_update)

### gam_location_delete

**Ringkasan:** Menghapus permanen lokasi gudang EAM berdasarkan id. Gagal bila masih dipakai oleh stok inventaris GA (batasan relasi); nonaktifkan lewat update bila ingin menyimpannya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `DELETE /api/ga/master/locations/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID lokasi gudang EAM yang dihapus. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_location_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN lokasi gudang EAM <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; baris master dihapus permanen (tidak bisa dibatalkan).

**Teks konfirmasi:** HAPUS PERMANEN lokasi gudang EAM {id}. Setujui?

**Error umum**

- 500/409: masih direferensikan oleh stok inventaris GA.

**Tool terkait:** [`gam_location_update`](#gam_location_update)

### gam_location_update

**Ringkasan:** Mengubah sebagian atau seluruh field lokasi gudang EAM berdasarkan id (partial update). Field yang tidak dikirim tidak diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_master` / `edit`)
- **Handler:** `PUT /api/ga/master/locations/:id` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID lokasi gudang EAM yang diubah. |
| `code` | body | `string` | tidak | Kode lokasi unik. |
| `name` | body | `string` | tidak | Nama lokasi/gudang. |
| `branchId` | body | `string` | tidak | ID cabang pemilik lokasi. |

**Contoh pemanggilan**

```json
{
  "tool": "gam_location_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah lokasi gudang EAM <id>. Setujui?"
}
```

**Isi hasil:** Objek lokasi gudang EAM setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah lokasi gudang EAM {id}. Setujui?

**Error umum**

- 404/500: id tidak ditemukan.

**Tool terkait:** [`gam_locations`](#gam_locations)

### gam_locations

**Ringkasan:** Daftar lokasi (master EAM) berurut kode. Tidak ada filter; dipakai sebagai referensi untuk form aset, dokumen, dan inventaris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_master` / `view`)
- **Handler:** `GET /api/ga/master/locations` (src/routes/ga/master.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gam_locations",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array lokasi lengkap dengan id, kode, nama, dan status.>"
}
```

**Isi hasil:** Array lokasi lengkap dengan id, kode, nama, dan status.

**Tool terkait:** [`gam_location_create`](#gam_location_create)

### gd_create

**Ringkasan:** Mencatat dokumen legal/sertifikat baru (metadata). Bila kode kosong dibuat otomatis dari kode tipe + tahun. Berkas PDF diunggah terpisah sebagai versi (di luar katalog tool).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_documents` / `edit`)
- **Handler:** `POST /api/ga/documents` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | tidak | Kode dokumen; kosongkan agar dibuat otomatis (TIPE-TAHUN-0001). |
| `title` | body | `string` | ya | Judul/nama dokumen. |
| `typeId` | body | `string` | ya | ID tipe dokumen (gam_document_types). |
| `assetId` | body | `string` | tidak | ID aset terkait (opsional). |
| `issuedBy` | body | `string` | tidak | Penerbit dokumen. |
| `issuedNumber` | body | `string` | tidak | Nomor dokumen dari penerbit. |
| `effectiveDate` | body | `date` | tidak | Tanggal berlaku (YYYY-MM-DD). |
| `expiryDate` | body | `date` | tidak | Tanggal kedaluwarsa (YYYY-MM-DD). |
| `status` | body | enum: `ACTIVE`, `EXPIRED`, `REVOKED`, `ARCHIVED` | tidak | Status: ACTIVE, EXPIRED, REVOKED (dicabut), ARCHIVED (diarsipkan). |
| `customFields` | body | `object` | tidak | Isian khusus sesuai tipe dokumen (JSON). |

**Contoh pemanggilan**

```json
{
  "tool": "gd_create",
  "args": {
    "title": "<title>",
    "typeId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat dokumen <title> (tipe <id>), kedaluwarsa {expiryDate}. Setujui?"
}
```

**Isi hasil:** Objek {id, code} dokumen yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Catat dokumen {title} (tipe {typeId}), kedaluwarsa {expiryDate}. Setujui?

**Prasyarat**

- Tipe dokumen sudah ada (gam_doctype_create).

**Error umum**

- 400: judul/tipe kosong.
- 500: tipe tidak ditemukan / kode ganda.

**Tool terkait:** [`gd_update`](#gd_update)

### gd_delete

**Ringkasan:** Menghapus permanen dokumen legal beserta semua versinya (baris DB; file fisik dibiarkan di disk). Tidak bisa dibatalkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_documents` / `edit`)
- **Handler:** `DELETE /api/ga/documents/:id` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "gd_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "HAPUS PERMANEN dokumen <id>. Setujui?"
}
```

**Isi hasil:** Pesan konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; dokumen dan seluruh riwayat versi dihapus permanen.

**Teks konfirmasi:** HAPUS PERMANEN dokumen {id}. Setujui?

**Error umum**

- 500: id tidak ditemukan.

### gd_get

**Ringkasan:** Detail satu dokumen legal beserta tipe, aset terkait, dan seluruh versi berkas (nomor versi, ukuran, pengunggah; isi berkas tidak dikirim).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_documents` / `view`)
- **Handler:** `GET /api/ga/documents/:id` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "gd_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek dokumen dengan daftar versions (terbaru dahulu).>"
}
```

**Isi hasil:** Objek dokumen dengan daftar versions (terbaru dahulu).

**Error umum**

- 404: dokumen tidak ditemukan.

**Tool terkait:** [`gd_list`](#gd_list)

### gd_list

**Ringkasan:** Daftar dokumen legal/sertifikat dengan filter tipe, aset, status, dan pencarian teks (kode/judul). Tanpa page: array lama dengan filter expiringSoon/expiringDays untuk dokumen akan kedaluwarsa. Dengan page: {data,total,page,limit} dengan expiryState (expired/expiring/valid) dan filter expiry.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_documents` / `view`)
- **Handler:** `GET /api/ga/documents` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Aktifkan mode berhalaman; nomor halaman. |
| `typeId` | query | `string` | tidak | Filter tipe dokumen. |
| `assetId` | query | `string` | tidak | Filter aset. |
| `status` | query | enum: `ACTIVE`, `EXPIRED`, `REVOKED`, `ARCHIVED` | tidak | Filter status dokumen. |
| `q` | query | `string` | tidak | Cari kode/judul (mode lama). |
| `expiringDays` | query | `number` | tidak | Jendela hari ke depan untuk expiringSoon (mode lama). |
| `expiringSoon` | query | `string` | tidak | Isi true: hanya dokumen yang segera kedaluwarsa (mode lama). |
| `limit` | query | `number` | tidak | Ukuran halaman (default 25, maks 200). |
| `expiry` | query | enum: `expired`, `expiring`, `valid` | tidak | Filter keadaan kedaluwarsa (mode berhalaman). |
| `search` | query | `string` | tidak | Pencarian teks (mode berhalaman). |
| `sort` | query | `string` | tidak | Urutan: expiryDate\|code\|title\|effectiveDate; awalan "-" = turun. |

**Contoh pemanggilan**

```json
{
  "tool": "gd_list",
  "args": {
    "page": 1,
    "typeId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array dokumen (mode lama) atau {data,total,page,limit} (mode berhalaman) dengan tipe dan a>"
}
```

**Isi hasil:** Array dokumen (mode lama) atau {data,total,page,limit} (mode berhalaman) dengan tipe dan aset terkait.

**Error umum**

- 400: filter tidak valid (mode berhalaman).

**Tool terkait:** [`gd_summary`](#gd_summary), [`gd_get`](#gd_get)

### gd_summary

**Ringkasan:** Ringkasan jumlah dokumen: total, kedaluwarsa, segera kedaluwarsa (30 hari), dan masih berlaku, dengan filter yang sama seperti daftar berhalaman.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_documents` / `view`)
- **Handler:** `GET /api/ga/documents/summary` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `typeId` | query | `string` | tidak | Filter tipe dokumen. |
| `assetId` | query | `string` | tidak | Filter aset. |
| `status` | query | enum: `ACTIVE`, `EXPIRED`, `REVOKED`, `ARCHIVED` | tidak | Filter status. |
| `search` | query | `string` | tidak | Pencarian teks. |

**Contoh pemanggilan**

```json
{
  "tool": "gd_summary",
  "args": {
    "typeId": "<id>",
    "assetId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {count, expiredCount, expiringCount, validCount}.>"
}
```

**Isi hasil:** Objek {count, expiredCount, expiringCount, validCount}.

**Tool terkait:** [`gd_list`](#gd_list)

### gd_update

**Ringkasan:** Mengubah metadata dokumen. PERHATIAN: field opsional yang tidak dikirim (aset, penerbit, nomor, tanggal berlaku, tanggal kedaluwarsa) akan di-NULL-kan; kirim ulang nilai yang dipertahankan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_documents` / `edit`)
- **Handler:** `PUT /api/ga/documents/:id` (src/routes/ga/documents.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen. |
| `code` | body | `string` | tidak | Kode dokumen; kosongkan agar dibuat otomatis (TIPE-TAHUN-0001). |
| `title` | body | `string` | tidak | Judul/nama dokumen. |
| `typeId` | body | `string` | tidak | ID tipe dokumen (gam_document_types). |
| `assetId` | body | `string` | tidak | ID aset terkait (opsional). |
| `issuedBy` | body | `string` | tidak | Penerbit dokumen. |
| `issuedNumber` | body | `string` | tidak | Nomor dokumen dari penerbit. |
| `effectiveDate` | body | `date` | tidak | Tanggal berlaku (YYYY-MM-DD). |
| `expiryDate` | body | `date` | tidak | Tanggal kedaluwarsa (YYYY-MM-DD). |
| `status` | body | enum: `ACTIVE`, `EXPIRED`, `REVOKED`, `ARCHIVED` | tidak | Status: ACTIVE, EXPIRED, REVOKED (dicabut), ARCHIVED (diarsipkan). |
| `customFields` | body | `object` | tidak | Isian khusus sesuai tipe dokumen (JSON). |

**Contoh pemanggilan**

```json
{
  "tool": "gd_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah dokumen <id>. Setujui?"
}
```

**Isi hasil:** Objek {id} dokumen yang diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok akuntansi; hanya mengubah data master EAM.

**Teks konfirmasi:** Ubah dokumen {id}. Setujui?

**Error umum**

- 500: id tidak ditemukan.

**Tool terkait:** [`gd_get`](#gd_get)

### gi_dashboard

**Ringkasan:** Ringkasan dashboard inventaris GA: jumlah item, stok rendah/habis, stok per lokasi/kategori, dan mutasi 30 hari terakhir. Dihitung langsung dari stok dan mutasi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/dashboard` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gi_dashboard",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {summary{totalItems,totalQty,lowStockCount,...}, stok per kategori/lokasi, daftar st>"
}
```

**Isi hasil:** Objek {summary{totalItems,totalQty,lowStockCount,...}, stok per kategori/lokasi, daftar stok rendah, total mutasi 30 hari, mutasi terbaru}.

**Tool terkait:** [`gi_low_stock`](#gi_low_stock), [`gi_movements`](#gi_movements)

### gi_export

**Ringkasan:** Ekspor CSV (titik koma, BOM UTF-8) daftar item (type=items, default) atau 5000 mutasi terakhir (type=movements). Dikembalikan sebagai teks CSV.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/export` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `type` | query | enum: `items`, `movements` | tidak | Jenis ekspor; default items. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_export",
  "args": {
    "type": "items"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Teks CSV (bukan JSON) dengan header Indonesia.>"
}
```

**Isi hasil:** Teks CSV (bukan JSON) dengan header Indonesia.

**Tool terkait:** [`gi_items`](#gi_items), [`gi_movements`](#gi_movements)

### gi_item_create

**Ringkasan:** Membuat item katalog inventaris GA (SKU, nama, kategori, satuan, stok minimum). Stok awal 0; isi stok lewat penerimaan/movement atau stock-set.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_inventory` / `edit`)
- **Handler:** `POST /api/ga/inventory/items` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `sku` | body | `string` | ya | Kode barang unik (maks 100). |
| `name` | body | `string` | ya | Nama barang. |
| `categoryId` | body | `string` | ya | ID kategori inventaris GA. |
| `uom` | body | `string` | ya | Satuan (pcs, liter, dll). |
| `minStock` | body | `number` | tidak | Batas stok minimum untuk peringatan stok rendah (default 0). |
| `isActive` | body | `boolean` | tidak | Status aktif (default true). |

**Contoh pemanggilan**

```json
{
  "tool": "gi_item_create",
  "args": {
    "sku": "<sku>",
    "name": "<name>",
    "categoryId": "<id>",
    "uom": "<uom>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat item inventaris <sku> - <name> (<uom>). Setujui?"
}
```

**Isi hasil:** Objek {id}.

**Efek pembukuan/stok:** Tidak ada jurnal GL (stok GA terpisah dari Persediaan akuntansi); tidak mengubah stok (stok awal 0).

**Teks konfirmasi:** Buat item inventaris {sku} - {name} ({uom}). Setujui?

**Error umum**

- 500: SKU sudah dipakai.

**Tool terkait:** [`gi_movement_create`](#gi_movement_create), [`gi_stock_set`](#gi_stock_set)

### gi_item_get

**Ringkasan:** Detail satu item inventaris GA beserta kategori dan stok per lokasi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/items/:id` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID item inventaris. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_item_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek item dengan stocks per lokasi.>"
}
```

**Isi hasil:** Objek item dengan stocks per lokasi.

**Error umum**

- 404: item tidak ditemukan.

**Tool terkait:** [`gi_items`](#gi_items), [`gi_movements`](#gi_movements)

### gi_item_image_delete

**Ringkasan:** Menghapus gambar item inventaris GA (file di disk dan referensinya). Aman bila item belum punya gambar.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_inventory` / `edit`)
- **Handler:** `DELETE /api/ga/inventory/items/:id/image` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID item. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_item_image_delete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Hapus gambar item <id>. Setujui?"
}
```

**Isi hasil:** Tanpa isi (204).

**Efek pembukuan/stok:** Tidak ada efek GL/stok; file gambar dihapus.

**Teks konfirmasi:** Hapus gambar item {id}. Setujui?

**Error umum**

- 404: item tidak ditemukan.

### gi_item_update

**Ringkasan:** Mengubah data katalog item inventaris GA (partial). Tidak mengubah stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_inventory` / `edit`)
- **Handler:** `PUT /api/ga/inventory/items/:id` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID item. |
| `sku` | body | `string` | tidak | Kode barang unik. |
| `name` | body | `string` | tidak | Nama barang. |
| `categoryId` | body | `string` | tidak | ID kategori. |
| `uom` | body | `string` | tidak | Satuan. |
| `minStock` | body | `number` | tidak | Stok minimum. |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_item_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah item inventaris <id>. Setujui?"
}
```

**Isi hasil:** Objek {id}.

**Efek pembukuan/stok:** Tidak ada jurnal GL (stok GA terpisah dari Persediaan akuntansi); tidak mengubah stok.

**Teks konfirmasi:** Ubah item inventaris {id}. Setujui?

**Error umum**

- 500: id tidak ditemukan / SKU ganda.

### gi_items

**Ringkasan:** Daftar item inventaris GA (sparepart/ATK) dengan total stok dan penanda stok rendah. Mode lama: array, filter categoryId/q/limit. Dengan paginated=1: {data,total,page,limit} dengan filter search, locationId, isActive, stockStatus (out/low/ok), sort.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/items` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `paginated` | query | `string` | tidak | Isi 1 untuk mode berhalaman. |
| `categoryId` | query | `string` | tidak | Filter kategori inventaris. |
| `q` | query | `string` | tidak | Cari SKU/nama. |
| `limit` | query | `number` | tidak | Ukuran halaman (default 200, maks 500). |
| `page` | query | `number` | tidak | Halaman (default 1). |
| `search` | query | `string` | tidak | Cari SKU/nama (mode berhalaman; sama dengan q). |
| `locationId` | query | `string` | tidak | Hanya item yang punya stok di lokasi ini (mode berhalaman). |
| `isActive` | query | enum: `true`, `false` | tidak | Filter status aktif (mode berhalaman). |
| `stockStatus` | query | enum: `out`, `low`, `ok` | tidak | Status stok total (mode berhalaman). |
| `sort` | query | `string` | tidak | Urutan: sku\|name\|category\|totalStock\|minStock; awalan "-" = turun (mode berhalaman). |

**Contoh pemanggilan**

```json
{
  "tool": "gi_items",
  "args": {
    "paginated": "<paginated>",
    "categoryId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array item (atau {data,total,page,limit}) berisi sku, nama, kategori, satuan, minStock, to>"
}
```

**Isi hasil:** Array item (atau {data,total,page,limit}) berisi sku, nama, kategori, satuan, minStock, totalStock, status stok.

**Error umum**

- 400: filter tidak dikenal (isActive/stockStatus).

**Tool terkait:** [`gi_item_get`](#gi_item_get), [`gi_low_stock`](#gi_low_stock), [`gi_items_summary`](#gi_items_summary)

### gi_items_summary

**Ringkasan:** Hitungan KPI item inventaris GA (total, aktif, aman, rendah, habis) untuk filter yang sama dengan daftar berhalaman.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/items/summary` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `categoryId` | query | `string` | tidak | Filter kategori. |
| `search` | query | `string` | tidak | Cari SKU/nama. |
| `locationId` | query | `string` | tidak | Filter lokasi. |
| `isActive` | query | enum: `true`, `false` | tidak | Filter aktif. |
| `stockStatus` | query | enum: `out`, `low`, `ok` | tidak | Filter status stok. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_items_summary",
  "args": {
    "categoryId": "<id>",
    "search": "<search>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {count, activeCount, okCount, lowCount, outCount}.>"
}
```

**Isi hasil:** Objek {count, activeCount, okCount, lowCount, outCount}.

**Tool terkait:** [`gi_items`](#gi_items)

### gi_low_stock

**Ringkasan:** Daftar item aktif yang total stoknya di bawah stok minimum, diurutkan dari kekurangan terbesar. Dasar untuk permintaan barang/pengadaan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/low-stock` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "gi_low_stock",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {id, sku, name, uom, category, type, totalStock, minStock, shortfall}.>"
}
```

**Isi hasil:** Array {id, sku, name, uom, category, type, totalStock, minStock, shortfall}.

**Tool terkait:** [`gi_items`](#gi_items), [`gmr_create`](#gmr_create)

### gi_movement_create

**Ringkasan:** Mencatat mutasi stok inventaris GA dan memperbarui stok per lokasi secara atomik. IN menambah lokasi tujuan; OUT mengurangi lokasi asal; TRANSFER memindahkan asal ke tujuan; ADJUSTMENT menambah qty (positif) pada lokasi tujuan. Stok tidak boleh minus.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_inventory` / `edit`)
- **Handler:** `POST /api/ga/inventory/movements` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | body | `string` | ya | ID item inventaris GA. |
| `type` | body | enum: `IN`, `OUT`, `TRANSFER`, `ADJUSTMENT` | ya | IN (masuk; wajib toLocationId), OUT (keluar; wajib fromLocationId), TRANSFER (wajib keduanya), ADJUSTMENT (tambah; wajib toLocationId). |
| `quantity` | body | `number` | ya | Jumlah, harus > 0. Untuk koreksi turun gunakan OUT atau gi_stock_set. |
| `fromLocationId` | body | `string` | tidak | Lokasi asal. |
| `toLocationId` | body | `string` | tidak | Lokasi tujuan. |
| `referenceNo` | body | `string` | tidak | Nomor referensi bebas (mis. nomor dokumen). |
| `notes` | body | `string` | tidak | Catatan. |

**Contoh pemanggilan**

```json
{
  "tool": "gi_movement_create",
  "args": {
    "itemId": "<id>",
    "type": "IN",
    "quantity": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Catat mutasi IN 1 untuk item <id> (asal {fromLocationId}, tujuan {toLocationId}). Setujui?"
}
```

**Isi hasil:** Objek {id} mutasi yang dicatat.

**Efek pembukuan/stok:** Tidak ada jurnal GL (stok GA terpisah dari Persediaan akuntansi); mengubah stok GA per lokasi (GaStockByLocation) dan menulis log mutasi; tidak menyentuh stok/HPP/WAC Persediaan ERP.

**Teks konfirmasi:** Catat mutasi {type} {quantity} untuk item {itemId} (asal {fromLocationId}, tujuan {toLocationId}). Setujui?

**Prasyarat**

- Item inventaris dan lokasi sudah ada.

**Error umum**

- 400: lokasi wajib sesuai tipe.
- 500: "Stok tidak mencukupi." bila stok akan minus.

**Tool terkait:** [`gi_stock_set`](#gi_stock_set), [`gi_movements`](#gi_movements)

### gi_movements

**Ringkasan:** Riwayat mutasi stok inventaris GA (IN/OUT/TRANSFER/ADJUSTMENT). Tanpa page: 100 terbaru (filter itemId, type). Dengan page: {data,total,page,limit} dengan filter lokasi, rentang tanggal, pencarian, dan sort.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_inventory` / `view`)
- **Handler:** `GET /api/ga/inventory/movements` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Aktifkan mode berhalaman; nomor halaman. |
| `itemId` | query | `string` | tidak | Filter item. |
| `type` | query | enum: `IN`, `OUT`, `TRANSFER`, `ADJUSTMENT` | tidak | Jenis mutasi. |
| `limit` | query | `number` | tidak | Ukuran halaman (default 25, maks 200). |
| `locationId` | query | `string` | tidak | Lokasi di sisi asal atau tujuan (mode berhalaman). |
| `startDate` | query | `date` | tidak | Mulai tanggal (YYYY-MM-DD, mode berhalaman). |
| `endDate` | query | `date` | tidak | Sampai tanggal (YYYY-MM-DD, mode berhalaman). |
| `search` | query | `string` | tidak | Cari SKU/nama item, referensi, catatan (mode berhalaman). |
| `sort` | query | `string` | tidak | createdAt atau quantity; awalan "-" = turun (mode berhalaman). |

**Contoh pemanggilan**

```json
{
  "tool": "gi_movements",
  "args": {
    "page": 1,
    "itemId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array mutasi (atau {data,total,page,limit}) dengan item, lokasi asal/tujuan, referensi, ca>"
}
```

**Isi hasil:** Array mutasi (atau {data,total,page,limit}) dengan item, lokasi asal/tujuan, referensi, catatan.

**Error umum**

- 400: filter tidak valid (mode berhalaman).

**Tool terkait:** [`gi_movement_create`](#gi_movement_create)

### gi_stock_set

**Ringkasan:** Opname cepat: menetapkan stok ABSOLUT item pada satu lokasi. Selisih terhadap stok sistem dicatat sebagai mutasi ADJUSTMENT (referensi OPNAME), boleh bernilai minus. Tidak ada mutasi bila selisih 0.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_inventory` / `edit`)
- **Handler:** `POST /api/ga/inventory/stock-set` (src/routes/ga/inventory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | body | `string` | ya | ID item inventaris GA. |
| `locationId` | body | `string` | ya | ID lokasi. |
| `quantity` | body | `number` | ya | Stok hasil hitung fisik (>= 0). |
| `notes` | body | `string` | tidak | Catatan opname; default "Opname: sebelum -> sesudah". |

**Contoh pemanggilan**

```json
{
  "tool": "gi_stock_set",
  "args": {
    "itemId": "<id>",
    "locationId": "<id>",
    "quantity": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Set stok item <id> di lokasi <id> menjadi 1. Setujui?"
}
```

**Isi hasil:** Objek {changed, delta, before, after}.

**Efek pembukuan/stok:** Tidak ada jurnal GL (stok GA terpisah dari Persediaan akuntansi); menimpa stok GA item di lokasi tersebut dan mencatat satu mutasi ADJUSTMENT sebesar selisih.

**Teks konfirmasi:** Set stok item {itemId} di lokasi {locationId} menjadi {quantity}. Setujui?

**Tool terkait:** [`gi_movement_create`](#gi_movement_create), [`gi_item_get`](#gi_item_get)

### gm_schedule_create

**Ringkasan:** Membuat jadwal maintenance preventif untuk satu aset (minimal satu interval hari/jam/km) dengan tanggal jatuh tempo pertama.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `POST /api/ga/maintenance/schedules` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `assetId` | body | `string` | ya | ID aset yang dijadwalkan. |
| `intervalDays` | body | `number` | tidak | Interval dalam hari. |
| `intervalHours` | body | `number` | tidak | Interval jam pakai. |
| `intervalKm` | body | `number` | tidak | Interval kilometer. |
| `nextDueAt` | body | `string` | ya | Tanggal jatuh tempo pertama (YYYY-MM-DD). |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_schedule_create",
  "args": {
    "assetId": "<id>",
    "nextDueAt": "<nextDueAt>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat jadwal maintenance aset <id>, jatuh tempo pertama <nextDueAt>. Setujui?"
}
```

**Isi hasil:** Jadwal baru (id, assetId, interval, nextDueAt).

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya membuat jadwal; WO preventif dibuat manual lewat gm_wo_create.

**Teks konfirmasi:** Buat jadwal maintenance aset {assetId}, jatuh tempo pertama {nextDueAt}. Setujui?

**Error umum**

- 400: validasi (assetId/nextDueAt wajib; minimal satu interval)

**Tool terkait:** [`gm_schedules`](#gm_schedules)

### gm_schedule_update

**Ringkasan:** Mengubah interval, jatuh tempo, catatan, atau mengaktifkan/menonaktifkan jadwal maintenance.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `PUT /api/ga/maintenance/schedules/:id` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID jadwal maintenance. |
| `intervalDays` | body | `number` | tidak |  |
| `intervalHours` | body | `number` | tidak |  |
| `intervalKm` | body | `number` | tidak |  |
| `nextDueAt` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `isActive` | body | `boolean` | tidak | false = jadwal dinonaktifkan. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_schedule_update",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah jadwal maintenance <id>. Setujui?"
}
```

**Isi hasil:** Jadwal setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah jadwal maintenance {id}. Setujui?

**Tool terkait:** [`gm_schedules`](#gm_schedules)

### gm_schedules

**Ringkasan:** Daftar jadwal maintenance preventif (interval hari/jam/km, jatuh tempo berikutnya), urut jatuh tempo terdekat. Filter per aset dan status aktif.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_maintenance` / `view`)
- **Handler:** `GET /api/ga/maintenance/schedules` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `assetId` | query | `string` | tidak | Saring jadwal satu aset. |
| `active` | query | `string` | tidak | true/false: hanya jadwal aktif / nonaktif; kosong = semua. |
| `assetId` | body | `string` | tidak | Saring jadwal satu aset. |
| `active` | body | enum: `true`, `false` | tidak | true/false: hanya jadwal aktif / nonaktif; kosong = semua. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_schedules",
  "args": {
    "assetId": "<id>",
    "active": "<active>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array jadwal {id, assetId, intervalDays/Hours/Km, nextDueAt, lastDoneAt, isActive, asset{i>"
}
```

**Isi hasil:** Array jadwal {id, assetId, intervalDays/Hours/Km, nextDueAt, lastDoneAt, isActive, asset{id,code,name}}.

**Tool terkait:** [`gm_schedule_create`](#gm_schedule_create), [`gm_wo_create`](#gm_wo_create)

### gm_wo_add_parts

**Ringkasan:** Mencatat pemakaian sparepart pada WO. Bila fromLocationId diisi, stok GA di lokasi itu langsung berkurang (movement OUT, referensi MAINTENANCE_<kode WO>); stok boleh menjadi negatif dengan peringatan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `POST /api/ga/maintenance/work-orders/:id/parts` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID WO. |
| `inventoryItemId` | body | `string` | ya | ID item inventaris GA. |
| `fromLocationId` | body | `string` | tidak | Lokasi stok asal; bila kosong, stok tidak dipotong (hanya catat biaya). |
| `quantity` | body | `number` | ya | Jumlah (> 0). |
| `unitCost` | body | `number` | ya | Harga satuan (Rp) untuk perhitungan biaya WO. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_add_parts",
  "args": {
    "id": "<id>",
    "inventoryItemId": "<id>",
    "quantity": 1,
    "unitCost": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Pakai 1 unit item <id> (Rp 1/unit) pada Work Order <id>. Stok GA berkurang. Setujui?"
}
```

**Isi hasil:** {id, warning|null} — warning berisi pesan stok tidak cukup.

**Efek pembukuan/stok:** Stok inventaris GA (bukan stok ERP/GL): GaStockByLocation berkurang dan GaInventoryMovement OUT dibuat. Tidak ada jurnal GL. Tidak ada endpoint pengembalian part.

**Teks konfirmasi:** Pakai {quantity} unit item {inventoryItemId} (Rp {unitCost}/unit) pada Work Order {id}. Stok GA berkurang. Setujui?

**Error umum**

- 400: Tidak bisa menambah part pada WO berstatus CLOSED/CANCELLED
- 400: Item inventory tidak ditemukan

**Tool terkait:** [`gm_wo_get`](#gm_wo_get)

### gm_wo_assign

**Ringkasan:** Menugaskan WO (status OPEN atau ASSIGNED) ke seorang teknisi; status menjadi ASSIGNED, prioritas boleh diubah sekaligus.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `PATCH /api/ga/maintenance/work-orders/:id/assign` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID WO. |
| `assignedToId` | body | `string` | ya | ID user teknisi. |
| `priority` | body | `enum` | tidak | Opsional: ubah prioritas. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_assign",
  "args": {
    "id": "<id>",
    "assignedToId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tugaskan Work Order <id> ke teknisi <id>. Setujui?"
}
```

**Isi hasil:** {id, status:"ASSIGNED"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Tugaskan Work Order {id} ke teknisi {assignedToId}. Setujui?

**Error umum**

- 400: Tidak bisa assign dari status <status>

**Tool terkait:** [`gm_wo_start`](#gm_wo_start)

### gm_wo_cancel

**Ringkasan:** Membatalkan WO yang belum DONE/CLOSED/CANCELLED dengan alasan wajib. Tidak dapat dibuka kembali; sparepart yang sudah dipakai TIDAK dikembalikan ke stok.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `PATCH /api/ga/maintenance/work-orders/:id/cancel` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID WO. |
| `reason` | body | `string` | ya | Alasan pembatalan (wajib, maks 500). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_cancel",
  "args": {
    "id": "<id>",
    "reason": "<reason>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "BATALKAN Work Order <id>. Alasan: <reason>. Setujui?"
}
```

**Isi hasil:** {id, status:"CANCELLED"}.

**Efek pembukuan/stok:** Tidak ada efek GL. Pemakaian sparepart sebelumnya (gm_wo_add_parts) tidak direverse — stok GA tetap berkurang.

**Teks konfirmasi:** BATALKAN Work Order {id}. Alasan: {reason}. Setujui?

**Error umum**

- 400: Tidak bisa cancel dari status DONE/CLOSED/CANCELLED

### gm_wo_close

**Ringkasan:** Menutup WO yang sudah DONE (DONE → CLOSED). Otomatis mencatat log servis kendaraan (source WORK_ORDER, biaya = tenaga kerja + vendor luar) bila belum ada.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `PATCH /api/ga/maintenance/work-orders/:id/close` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Work Order (GaWorkOrder.id). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_close",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tutup Work Order <id>. Setujui?"
}
```

**Isi hasil:** {id, status:"CLOSED"}.

**Efek pembukuan/stok:** Tidak ada efek GL. Membuat GaVehicleServiceLog source=WORK_ORDER (tidak masuk antrian Tagihan EAM dan tidak bisa dijurnal).

**Teks konfirmasi:** Tutup Work Order {id}. Setujui?

**Error umum**

- 400: Tidak bisa close dari status <status> (harus DONE)

**Tool terkait:** [`gm_wo_complete`](#gm_wo_complete), [`ga_veh_services`](#ga_veh_services)

### gm_wo_complete

**Ringkasan:** Menandai WO selesai (DONE) dengan resolusi, checklist, jam & biaya tenaga kerja, vendor luar. Checklist wajib harus lengkap; jadwal preventif sumber di-roll-forward (lastDoneAt, nextDueAt).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Catatan akses:** Hanya teknisi yang ditugaskan pada WO tersebut.
- **Handler:** `PATCH /api/ga/maintenance/work-orders/:id/complete` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID WO. |
| `resolution` | body | `string` | tidak | Ringkasan penyelesaian. |
| `checklist` | body | `array<object>` | tidak | Daftar {id,label,required,done,notes}; item required harus done. |
| `checklist[].id` | body | `string` | ya |  |
| `checklist[].label` | body | `string` | ya |  |
| `checklist[].required` | body | `boolean` | tidak |  |
| `checklist[].done` | body | `boolean` | tidak |  |
| `checklist[].notes` | body | `string` | tidak |  |
| `laborHours` | body | `number` | tidak | Jam kerja. |
| `laborCost` | body | `number` | tidak | Biaya tenaga kerja (Rp). |
| `externalVendor` | body | `string` | tidak | Nama vendor luar. |
| `externalCost` | body | `number` | tidak | Biaya vendor luar (Rp). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_complete",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tandai Work Order <id> selesai (biaya tenaga kerja {laborCost}, vendor luar {externalCost}). Setujui?"
}
```

**Isi hasil:** {id, status:"DONE"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Memajukan jadwal preventif terkait. Biaya baru tercermin ke log servis saat WO ditutup (gm_wo_close).

**Teks konfirmasi:** Tandai Work Order {id} selesai (biaya tenaga kerja {laborCost}, vendor luar {externalCost}). Setujui?

**Error umum**

- 403: Hanya teknisi yang ditugaskan yang bisa tandai selesai
- 400: Checklist wajib belum lengkap
- 400: Tidak bisa complete dari status <status>

**Tool terkait:** [`gm_wo_close`](#gm_wo_close)

### gm_wo_create

**Ringkasan:** Membuat Work Order baru berstatus OPEN (korektif atau preventif) untuk satu aset; kode WO-YYYY-NNNN dibuat otomatis, pelapor = pemanggil.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Handler:** `POST /api/ga/maintenance/work-orders` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `assetId` | body | `string` | ya | ID aset (wajib; harus ada). |
| `type` | body | enum: `PREVENTIVE`, `CORRECTIVE` | tidak | PREVENTIVE atau CORRECTIVE (default CORRECTIVE). |
| `title` | body | `string` | ya | Judul singkat (maks 200 karakter). |
| `description` | body | `string` | tidak | Keterangan. |
| `component` | body | `string` | tidak |  |
| `priority` | body | `enum` | tidak | LOW/MEDIUM/HIGH/URGENT (default MEDIUM). |
| `scheduleId` | body | `string` | tidak | Opsional: jadwal preventif yang menjadi sumber WO (akan di-roll-forward saat WO selesai). |
| `dueAt` | body | `string` | tidak | Batas selesai (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_create",
  "args": {
    "assetId": "<id>",
    "title": "<title>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat Work Order \"<title>\" untuk aset <id> (prioritas {priority}). Setujui?"
}
```

**Isi hasil:** {id, code} WO baru.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya membuat WO OPEN.

**Teks konfirmasi:** Buat Work Order "{title}" untuk aset {assetId} (prioritas {priority}). Setujui?

**Error umum**

- 400: Aset tidak ditemukan / Jadwal maintenance tidak ditemukan

**Tool terkait:** [`gm_wo_assign`](#gm_wo_assign)

### gm_wo_get

**Ringkasan:** Detail satu Work Order: aset, jadwal asal, daftar sparepart terpakai, foto, checklist, biaya, dan seluruh jejak status.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_maintenance` / `view`)
- **Handler:** `GET /api/ga/maintenance/work-orders/:id` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Work Order (GaWorkOrder.id). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek WO lengkap dengan parts, photos, schedule, totalCost.>"
}
```

**Isi hasil:** Objek WO lengkap dengan parts, photos, schedule, totalCost.

**Error umum**

- 404: Work order tidak ditemukan

### gm_wo_list

**Ringkasan:** Daftar Work Order maintenance dengan total biaya (tenaga kerja + vendor luar + sparepart) per WO. Tanpa page → array polos; dengan page → {data,total,page,limit} plus filter lanjutan (due, tanggal lapor, search, sort).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_maintenance` / `view`)
- **Handler:** `GET /api/ga/maintenance/work-orders` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `string` | tidak | Bila diisi → mode berhalaman {data,total,page,limit}; bila kosong → array polos semua WO (mode legacy). |
| `status` | query | `string` | tidak | Status WO: OPEN, ASSIGNED, IN_PROGRESS, DONE, CLOSED, CANCELLED; mode berhalaman juga menerima ACTIVE (semua yang belum selesai). |
| `priority` | query | `string` | tidak | Prioritas WO. |
| `type` | query | `string` | tidak | Jenis WO: PREVENTIVE (berkala) atau CORRECTIVE (perbaikan). |
| `assetId` | query | `string` | tidak | Saring per aset. |
| `assignedToId` | query | `string` | tidak | Saring per teknisi (user id). |
| `mine` | query | `string` | tidak | true = hanya WO yang ditugaskan ke pemanggil. |
| `page` | body | `number` | tidak | Bila diisi → mode berhalaman {data,total,page,limit}; bila kosong → array polos semua WO (mode legacy). |
| `limit` | body | `number` | tidak | Ukuran halaman (maks 200) — hanya berlaku bila page diisi. |
| `status` | body | `string` | tidak | Status WO: OPEN, ASSIGNED, IN_PROGRESS, DONE, CLOSED, CANCELLED; mode berhalaman juga menerima ACTIVE (semua yang belum selesai). |
| `priority` | body | enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT` | tidak | Prioritas WO. |
| `type` | body | enum: `PREVENTIVE`, `CORRECTIVE` | tidak | Jenis WO: PREVENTIVE (berkala) atau CORRECTIVE (perbaikan). |
| `assetId` | body | `string` | tidak | Saring per aset. |
| `assignedToId` | body | `string` | tidak | Saring per teknisi (user id). |
| `mine` | body | enum: `true`, `false` | tidak | true = hanya WO yang ditugaskan ke pemanggil. |
| `due` | body | enum: `overdue`, `dueSoon` | tidak | overdue = lewat jatuh tempo, dueSoon = segera jatuh tempo (mode berhalaman). |
| `startDate` | body | `date` | tidak | Tanggal lapor mulai (YYYY-MM-DD), mode berhalaman. |
| `endDate` | body | `date` | tidak | Tanggal lapor akhir (YYYY-MM-DD), mode berhalaman. |
| `search` | body | `string` | tidak | Cari kode/judul/aset (mode berhalaman). |
| `sort` | body | `string` | tidak | Kolom urut: code\|reportedAt\|dueAt\|priority\|status; awalan "-" = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_list",
  "args": {
    "page": "<page>",
    "status": "<status>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array WO atau {data,total,page,limit}; tiap WO membawa aset, jumlah part/foto, totalCost (>"
}
```

**Isi hasil:** Array WO atau {data,total,page,limit}; tiap WO membawa aset, jumlah part/foto, totalCost (dan assignee pada mode berhalaman).

**Tool terkait:** [`gm_wo_get`](#gm_wo_get), [`gm_wo_summary`](#gm_wo_summary)

### gm_wo_start

**Ringkasan:** Memulai pengerjaan WO: ASSIGNED → IN_PROGRESS dan mencatat waktu mulai.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_maintenance` / `edit`)
- **Catatan akses:** Hanya teknisi yang ditugaskan pada WO tersebut (403 untuk user lain, termasuk Admin).
- **Handler:** `PATCH /api/ga/maintenance/work-orders/:id/start` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Work Order (GaWorkOrder.id). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_start",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Mulai pengerjaan Work Order <id>. Setujui?"
}
```

**Isi hasil:** {id, status:"IN_PROGRESS"}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Mulai pengerjaan Work Order {id}. Setujui?

**Error umum**

- 403: Hanya teknisi yang ditugaskan yang bisa mulai
- 400: Tidak bisa start dari status <status>

**Tool terkait:** [`gm_wo_add_parts`](#gm_wo_add_parts), [`gm_wo_complete`](#gm_wo_complete)

### gm_wo_summary

**Ringkasan:** KPI Work Order untuk filter yang sama dengan daftar berhalaman: jumlah, aktif, terlambat, selesai bulan ini, dan total biaya.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_maintenance` / `view`)
- **Handler:** `GET /api/ga/maintenance/work-orders/summary` (src/routes/ga/maintenance.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | body | `string` | tidak | Status WO: OPEN, ASSIGNED, IN_PROGRESS, DONE, CLOSED, CANCELLED; mode berhalaman juga menerima ACTIVE (semua yang belum selesai). |
| `priority` | body | `string` | tidak | Prioritas WO. |
| `type` | body | `string` | tidak | Jenis WO: PREVENTIVE (berkala) atau CORRECTIVE (perbaikan). |
| `assetId` | body | `string` | tidak | Saring per aset. |
| `mine` | body | enum: `true`, `false` | tidak | true = hanya WO yang ditugaskan ke pemanggil. |
| `due` | body | enum: `overdue`, `dueSoon` | tidak | overdue = lewat jatuh tempo, dueSoon = segera jatuh tempo (mode berhalaman). |
| `startDate` | body | `date` | tidak | Tanggal lapor mulai (YYYY-MM-DD), mode berhalaman. |
| `endDate` | body | `date` | tidak | Tanggal lapor akhir (YYYY-MM-DD), mode berhalaman. |
| `search` | body | `string` | tidak | Cari kode/judul/aset (mode berhalaman). |

**Contoh pemanggilan**

```json
{
  "tool": "gm_wo_summary",
  "args": {
    "status": "<status>",
    "priority": "<priority>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{count, active, overdue, doneThisMonth, totalCost}.>"
}
```

**Isi hasil:** {count, active, overdue, doneThisMonth, totalCost}.

**Error umum**

- 400: nilai filter tidak valid

**Tool terkait:** [`gm_wo_list`](#gm_wo_list)

### gmr_approve

**Ringkasan:** Menyetujui MR: SUBMITTED menjadi APPROVED, mencatat penyetuju dan waktu. Setelah APPROVED barulah pengadaan per item dan penerimaan barang dapat dilakukan. Memakai izin edit modul ga_material_request (tidak ada capability/antrian approval terpisah).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Catatan akses:** Siapa pun dengan izin edit modul ga_material_request dapat menyetujui, termasuk pemohon sendiri (tidak ada pemisahan tugas di kode).
- **Handler:** `PATCH /api/ga/material-requests/:id/approve` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_approve",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "SETUJUI MR <id>. Setujui?"
}
```

**Isi hasil:** Objek {id, status}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung; membuka jalur pengadaan dan penerimaan stok.

**Teks konfirmasi:** SETUJUI MR {id}. Setujui?

**Error umum**

- Tidak bisa approve MR berstatus selain SUBMITTED.

**Tool terkait:** [`gmr_procurement_update`](#gmr_procurement_update), [`gmr_receive_item`](#gmr_receive_item)

### gmr_cancel

**Ringkasan:** Membatalkan MR berstatus DRAFT, SUBMITTED, atau APPROVED menjadi CANCELLED. MR REJECTED/CANCELLED/FULFILLED/PAID tidak bisa dibatalkan. Stok yang sudah diterima per item TIDAK dikembalikan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PATCH /api/ga/material-requests/:id/cancel` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_cancel",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "BATALKAN MR <id>. Setujui?"
}
```

**Isi hasil:** Objek {id, status}.

**Efek pembukuan/stok:** Tidak ada efek GL; stok yang sudah diterima via receive tetap ada (tidak di-reverse).

**Teks konfirmasi:** BATALKAN MR {id}. Setujui?

**Error umum**

- Tidak bisa membatalkan MR berstatus REJECTED/CANCELLED/FULFILLED/PAID.

### gmr_create

**Ringkasan:** Membuat MR sparepart baru berstatus DRAFT (kode otomatis MR-TAHUN-NNNN), standalone atau terhubung work order/aset. Belum ada efek stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `POST /api/ga/material-requests` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `workOrderId` | body | `string` | tidak | ID work order asal (opsional). |
| `assetId` | body | `string` | tidak | ID aset tujuan (opsional). |
| `machineTarget` | body | `string` | tidak | Mesin/target pemakaian (teks bebas, maks 200). |
| `notes` | body | `string` | tidak | Catatan (maks 1000). |
| `items` | body | `array<object>` | ya | Daftar barang (min 1): inventoryItemId?, itemName, sku?, uom, quantity>0, notes?. |
| `items[].inventoryItemId` | body | `string` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].sku` | body | `string` | tidak |  |
| `items[].uom` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].notes` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_create",
  "args": {
    "items": [
      {
        "itemName": "<itemName>",
        "uom": "<uom>",
        "quantity": 1
      }
    ]
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat permintaan barang untuk {machineTarget} dengan [...] item. Setujui?"
}
```

**Isi hasil:** Objek {id, code} MR yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya membuat dokumen MR berstatus DRAFT.

**Teks konfirmasi:** Buat permintaan barang untuk {machineTarget} dengan {items} item. Setujui?

**Error umum**

- 400: minimal satu item.
- 404/500: aset atau item inventaris tidak ditemukan.

**Tool terkait:** [`gmr_submit`](#gmr_submit), [`gmr_update`](#gmr_update), [`gmr_create_from_wo`](#gmr_create_from_wo)

### gmr_create_from_wo

**Ringkasan:** Membuat MR DRAFT langsung dari sebuah work order: workOrderId dan aset diisi otomatis dari WO; body cukup items (+ machineTarget/notes).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `POST /api/ga/material-requests/from-work-order/:workOrderId` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `workOrderId` | path | `string` | ya | ID work order sumber. |
| `machineTarget` | body | `string` | tidak | Mesin/target (opsional). |
| `notes` | body | `string` | tidak | Catatan. |
| `items` | body | `array<object>` | ya | Daftar barang (min 1) seperti gmr_create. |
| `items[].inventoryItemId` | body | `string` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].sku` | body | `string` | tidak |  |
| `items[].uom` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].notes` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_create_from_wo",
  "args": {
    "workOrderId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "uom": "<uom>",
        "quantity": 1
      }
    ]
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Buat MR dari work order <id> dengan [...] item. Setujui?"
}
```

**Isi hasil:** Objek {id, code} MR yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya membuat dokumen MR berstatus DRAFT.

**Teks konfirmasi:** Buat MR dari work order {workOrderId} dengan {items} item. Setujui?

**Error umum**

- 404: work order tidak ditemukan.

**Tool terkait:** [`gmr_create`](#gmr_create), [`gmr_submit`](#gmr_submit)

### gmr_get

**Ringkasan:** Detail satu MR: header, aset, referensi work order, dan semua item beserta status pengadaan per item (vendor, harga, nomor PO, qty diterima, lokasi tujuan).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_material_request` / `view`)
- **Handler:** `GET /api/ga/material-requests/:id` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek MR lengkap dengan items.>"
}
```

**Isi hasil:** Objek MR lengkap dengan items.

**Error umum**

- 404: MR tidak ditemukan.

**Tool terkait:** [`gmr_list`](#gmr_list)

### gmr_list

**Ringkasan:** Daftar Permintaan Barang (MR) sparepart EAM. Tanpa page: array terbaru dahulu dengan filter status/workOrderId/mine. Dengan page: {data,total,page,limit} dengan filter assetId, tanggal, pencarian, sort, dan data pemohon.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_material_request` / `view`)
- **Handler:** `GET /api/ga/material-requests` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Aktifkan mode berhalaman; nomor halaman. |
| `status` | query | enum: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `FULFILLED`, `PAID`, `CANCELLED` | tidak | Status MR. |
| `workOrderId` | query | `string` | tidak | Filter work order asal. |
| `mine` | query | enum: `true` | tidak | true = hanya MR yang diajukan user pemanggil. |
| `assetId` | query | `string` | tidak | Filter aset (mode berhalaman). |
| `startDate` | query | `date` | tidak | Tanggal permintaan mulai (mode berhalaman). |
| `endDate` | query | `date` | tidak | Tanggal permintaan sampai (mode berhalaman). |
| `search` | query | `string` | tidak | Cari kode, mesin/target, aset, kode WO, nama barang (mode berhalaman). |
| `sort` | query | `string` | tidak | code\|requestedAt\|status; awalan "-" = turun (mode berhalaman). |
| `limit` | query | `number` | tidak | Ukuran halaman (default 25, maks 200). |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_list",
  "args": {
    "page": 1,
    "status": "DRAFT"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array MR (atau {data,total,page,limit}) dengan kode MR-YYYY-NNNN, status, item ringkas.>"
}
```

**Isi hasil:** Array MR (atau {data,total,page,limit}) dengan kode MR-YYYY-NNNN, status, item ringkas.

**Error umum**

- 400: status tidak dikenal (mode berhalaman).

**Tool terkait:** [`gmr_get`](#gmr_get), [`gmr_summary`](#gmr_summary)

### gmr_procurement_update

**Ringkasan:** Mencatat proses pengadaan satu item MR: vendor, harga satuan, nomor PO, dan status pengadaan (REQUESTED, QUOTED, ORDERED, CANCELLED). Status RECEIVED tidak boleh diset di sini (gunakan gmr_receive_item). Tidak mengubah stok. Harga satuan (x qty) menjadi nilai tagihan EAM jenis MATERIAL_REQUEST di Pengajuan Pembayaran.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PATCH /api/ga/material-requests/:id/items/:itemId/procurement` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |
| `itemId` | path | `string` | ya | ID item MR. |
| `vendorName` | body | `string` | tidak | Nama vendor. |
| `unitPrice` | body | `number` | tidak | Harga satuan (Rp, >= 0). |
| `poNumber` | body | `string` | tidak | Nomor PO (catatan bebas; bukan PO ERP). |
| `procurementStatus` | body | `enum` | tidak | REQUESTED, QUOTED, ORDERED, RECEIVED (tidak boleh diset manual), CANCELLED. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_procurement_update",
  "args": {
    "id": "<id>",
    "itemId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Update pengadaan item <id> MR <id>: vendor {vendorName}, harga {unitPrice}. Setujui?"
}
```

**Isi hasil:** Objek {id, procurementStatus} item.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya data pengadaan. Nilai tagihan EAM MR (jumlah harga satuan x qty) dihitung dari sini saat MR APPROVED/FULFILLED dibayar via Tagihan EAM.

**Teks konfirmasi:** Update pengadaan item {itemId} MR {id}: vendor {vendorName}, harga {unitPrice}. Setujui?

**Error umum**

- Tidak bisa mengubah procurement pada MR REJECTED/CANCELLED.
- RECEIVED hanya lewat receive.

**Tool terkait:** [`gmr_receive_item`](#gmr_receive_item)

### gmr_receive_item

**Ringkasan:** Menerima barang satu item MR ke stok inventaris GA secara atomik: (bila perlu membuat item inventaris baru) menambah stok lokasi tujuan, mencatat mutasi IN referensi MR_<kode>, menandai item RECEIVED; bila semua item RECEIVED/CANCELLED maka MR menjadi FULFILLED. Hanya untuk MR APPROVED.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PATCH /api/ga/material-requests/:id/items/:itemId/receive` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |
| `itemId` | path | `string` | ya | ID item MR. |
| `receivedQty` | body | `number` | ya | Jumlah diterima (> 0). |
| `locationId` | body | `string` | ya | Lokasi gudang tujuan stok. |
| `inventoryItemId` | body | `string` | tidak | ID item inventaris GA bila item MR belum tertaut. |
| `newItem` | body | `object` | tidak | Bila belum ada item inventaris: {sku, categoryId} untuk membuat item baru (nama/satuan dari MR). |
| `newItem.sku` | body | `string` | ya |  |
| `newItem.categoryId` | body | `string` | ya |  |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_receive_item",
  "args": {
    "id": "<id>",
    "itemId": "<id>",
    "receivedQty": 1,
    "locationId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Terima 1 barang item <id> MR <id> ke lokasi <id>. Setujui?"
}
```

**Isi hasil:** Objek {itemId, inventoryItemId, fulfilled}.

**Efek pembukuan/stok:** Tidak ada jurnal GL langsung; menambah stok GA (GaStockByLocation) + mutasi IN. MR berstatus APPROVED/FULFILLED yang belum dijurnal tampil di antrian Tagihan EAM (MATERIAL_REQUEST) di Pengajuan Pembayaran; pembukuan (DR beban / CR Kas atau Hutang 2.1.1) terjadi di sana, bukan di tool ini.

**Teks konfirmasi:** Terima {receivedQty} barang item {itemId} MR {id} ke lokasi {locationId}. Setujui?

**Prasyarat**

- MR berstatus APPROVED.
- Lokasi gudang sudah ada.

**Error umum**

- MR harus berstatus APPROVED.
- Item sudah diterima/dibatalkan.
- Item belum tertaut: wajib inventoryItemId atau newItem.
- SKU baru sudah dipakai.

**Tool terkait:** [`gmr_procurement_update`](#gmr_procurement_update), [`gi_item_get`](#gi_item_get)

### gmr_reject

**Ringkasan:** Menolak MR: SUBMITTED menjadi REJECTED dengan alasan wajib; mencatat penolak dan waktu.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PATCH /api/ga/material-requests/:id/reject` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |
| `reason` | body | `string` | ya | Alasan penolakan (wajib, maks 500). |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_reject",
  "args": {
    "id": "<id>",
    "reason": "<reason>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "TOLAK MR <id> dengan alasan: <reason>. Setujui?"
}
```

**Isi hasil:** Objek {id, status}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; status menjadi REJECTED (final).

**Teks konfirmasi:** TOLAK MR {id} dengan alasan: {reason}. Setujui?

**Error umum**

- Tidak bisa reject MR berstatus selain SUBMITTED.

**Tool terkait:** [`gmr_approve`](#gmr_approve)

### gmr_submit

**Ringkasan:** Mengajukan MR: status DRAFT menjadi SUBMITTED (menunggu persetujuan). Tanpa efek stok/GL.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PATCH /api/ga/material-requests/:id/submit` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_submit",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ajukan MR <id> untuk persetujuan. Setujui?"
}
```

**Isi hasil:** Objek {id, status}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; status DRAFT -> SUBMITTED.

**Teks konfirmasi:** Ajukan MR {id} untuk persetujuan. Setujui?

**Error umum**

- Tidak bisa submit MR berstatus selain DRAFT.

**Tool terkait:** [`gmr_approve`](#gmr_approve), [`gmr_reject`](#gmr_reject)

### gmr_summary

**Ringkasan:** Jumlah MR per status (DRAFT..PAID, CANCELLED) untuk filter yang sama dengan daftar berhalaman (filter status diabaikan agar semua status tetap terhitung).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_material_request` / `view`)
- **Handler:** `GET /api/ga/material-requests/summary` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `mine` | query | enum: `true` | tidak | true = hanya milik pemanggil. |
| `assetId` | query | `string` | tidak | Filter aset. |
| `workOrderId` | query | `string` | tidak | Filter work order. |
| `startDate` | query | `date` | tidak | Tanggal permintaan mulai. |
| `endDate` | query | `date` | tidak | Tanggal permintaan sampai. |
| `search` | query | `string` | tidak | Pencarian teks. |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_summary",
  "args": {
    "mine": "true",
    "assetId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {total, byStatus:{DRAFT,SUBMITTED,APPROVED,REJECTED,FULFILLED,PAID,CANCELLED}}.>"
}
```

**Isi hasil:** Objek {total, byStatus:{DRAFT,SUBMITTED,APPROVED,REJECTED,FULFILLED,PAID,CANCELLED}}.

**Tool terkait:** [`gmr_list`](#gmr_list)

### gmr_update

**Ringkasan:** Mengubah header dan MENGGANTI seluruh daftar item MR. Hanya untuk MR berstatus DRAFT.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin (modul `ga_material_request` / `edit`)
- **Handler:** `PUT /api/ga/material-requests/:id` (src/routes/ga/materialRequest.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID MR. |
| `assetId` | body | `string` | tidak | ID aset (opsional). |
| `machineTarget` | body | `string` | tidak | Mesin/target. |
| `notes` | body | `string` | tidak | Catatan. |
| `items` | body | `array<object>` | ya | Daftar barang pengganti (min 1). |
| `items[].inventoryItemId` | body | `string` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].sku` | body | `string` | tidak |  |
| `items[].uom` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].notes` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gmr_update",
  "args": {
    "id": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "uom": "<uom>",
        "quantity": 1
      }
    ]
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah MR <id> (ganti seluruh item). Setujui?"
}
```

**Isi hasil:** Objek {id}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; mengubah dokumen MR DRAFT.

**Teks konfirmasi:** Ubah MR {id} (ganti seluruh item). Setujui?

**Error umum**

- Hanya MR berstatus DRAFT yang bisa diubah.
- Aset/item inventaris tidak ditemukan.

**Tool terkait:** [`gmr_submit`](#gmr_submit)


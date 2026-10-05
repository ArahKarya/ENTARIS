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

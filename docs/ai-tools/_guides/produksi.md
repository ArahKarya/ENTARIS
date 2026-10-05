Toolset **produksi** memberi AIRA akses ke proses produksi pabrik: input produksi (selalu berupa DRAFT dahulu), posting menjadi Data Produksi (production run) yang menggerakkan stok/WAC/jurnal, edit dan pembatalan run, master mesin, proses, dan standar biaya konversi, serta dashboard produksi (yield, OEE). Tool baca otomatis; membuat/ubah/buang draft berstatus Draft (tidak berefek ke stok/GL); memposting, mengedit, atau membatalkan run adalah `critical`.

### Alur bisnis

```
Input produksi (formulir)
   | POST /production-runs               -> prod_draft_create
   v
DRAFT  DPR-YYYYMM-NNNN  status Draft     (tanpa efek stok/GL/WAC/COGS/laporan/OEE)
   | PUT /drafts/:id  (ubah)             -> prod_draft_update
   | DELETE /drafts/:id (buang)          -> prod_draft_delete  (status Discarded)
   | POST /drafts/:id/post               -> prod_draft_post
   |
   |-- role dengan capability approval.bypass (Admin) -> 201: run dibuat langsung, draft Posted (+ postedRunId, postedRunNumber)
   '-- role lain -> 202: ApprovalRequest "ProductionRun", draft PendingApproval, manajer/Admin dinotifikasi
          | disetujui -> run dibuat + draft Posted
          | ditolak / minta revisi -> draft kembali Draft + lastError
   v
DATA PRODUKSI (ProductionRun, nomor run) -> prod_run_list / prod_run_get
   | PUT /production-runs/:id  (edit run yang sudah diposting) -> prod_run_update (non-bypass: ApprovalRequest "ProductionRunEdit")
   | PUT /production-runs/:id/cancel (butuh doc.cancel)       -> prod_run_cancel
```

Status draft: `Draft`, `PendingApproval`, `Posted`, `Discarded` (yang terakhir tidak tampil di daftar). Hanya draft berstatus `Draft` yang bisa diubah/dibuang/diposting. Status run: aktif atau `isCancelled`.

Siapa yang boleh mengubah/membuang/memposting draft: **pembuat draft** atau pemegang capability `approval.bypass`. Siapa pun yang punya izin `production` dapat MELIHAT semua draft.

Pada saat simpan draft sistem hanya menghitung `warnings` (mis. stok input kurang); cek stok keras baru terjadi saat posting. Bila posting gagal (mis. stok tidak cukup), draft tetap `Draft` dan alasannya disimpan di `lastError`. Klaim draft atomik (`updateMany where status Draft`), jadi dua posting bersamaan tidak akan menghasilkan dua run.

Master pendukung: `Machine` (kapasitas ideal per jam untuk OEE), `ProductionProcess` (proses yang dilalui, untuk penelusuran), `ProductionCostStandard` (komponen biaya konversi). GET master terbuka untuk semua user login; tulis butuh izin `edit` modul `production`.

### Aturan posting

Saat sebuah run diposting (langsung oleh Admin, atau setelah disetujui):

1. **Input**: stok bahan keluar (SM `Out` per baris input) di gudang run. Batch sumber boleh dipilih (`sourceMovementId`, biaya batch dikunci); tanpa batch dipakai WAC item.
2. **Output**: stok produk masuk (SM `In`) dan WAC item output dihitung ulang (rata-rata tertimbang). Output **utama** dan **produk samping** (`isByProduct=true`) sama-sama masuk stok.
3. **HPP terbebani per kg output utama**:
   `(nilai bahan input + biaya sisi input + biaya sisi output - nilai produk samping) / qty output utama`.
   - Nilai produk samping = qty x NRV (`unitPrice` produk samping **wajib** diisi, >= 0).
   - Bila pembilang negatif (NRV samping > biaya) HPP dikunci 0 dan dicatat peringatan.
   - `hppOverride` (>= 0) mengunci HPP per kg secara manual.
   - `unitPrice` output utama opsional: bila kosong diisi HPP terhitung.
4. **Jurnal** `JV-<nomor run>` (seimbang):
   - DR Persediaan setiap item output (akun item atau 1.4.0) sebesar nilai output;
   - CR Persediaan setiap item input sebesar nilai input;
   - selisih nilai (output - input) > 0: CR **5.12 Biaya Konversi Dibebankan ke Persediaan** sebesar min(selisih, total biaya konversi), sisanya CR **5.1 HPP Beras** (atau akun COGS); selisih < 0 (rugi produksi): DR 5.1 HPP Beras.
   - Komponen `costs` hanya memengaruhi HPP; **tidak** membuat jurnal biaya sendiri (biaya riil tetap masuk lewat jurnal/invoice).
5. **COGS backfill**: penjualan yang sebelumnya keluar saat stok minus diselesaikan terhadap output baru.
6. **Yield** = qty output utama / qty total input x 100 (%); disimpan di run. Bila data mesin/waktu diisi, metrik OEE dihitung per mesin.

Edit run (`prod_run_update`): efek lama dibalik (stok, WAC output dihitung ulang, semua jurnal berawalan `JV-<nomor>` dibatalkan), lalu efek baru diterapkan dengan **nomor run yang sama** dan jurnal revisi `JV-<nomor>-R<n>`. Pembatalan (`prod_run_cancel`): stok dibalik, WAC output dihitung ulang dari pergerakan masuk yang tersisa, jurnal (termasuk revisi) dibatalkan.

### Persetujuan

- `needsApproval(role)` bernilai benar untuk role tanpa capability `approval.bypass` (bawaan hanya Admin yang bypass).
- Dibuat-baru: posting draft oleh non-bypass menghasilkan `ApprovalRequest` tipe **ProductionRun** (HTTP 202 `pendingApproval:true`); payload draft dieksekusi saat disetujui dengan aktor = pengaju.
- Mutasi run yang sudah ada juga di-gate: `PUT /production-runs/:id` oleh non-bypass menjadi `ApprovalRequest` tipe **ProductionRunEdit** (`documentId/documentNumber` terisi, payload = body asli + snapshot `_before` untuk perbandingan). **Satu pengajuan Pending per target**; pengajuan kedua ditolak 409. `GET /approvals/pending` menunjukkan target yang sedang pending.
- Antrian `ProductionRun` lama tanpa draft tetap bisa disetujui.
- Pembatalan run **tidak** melewati antrian, tetapi butuh capability `doc.cancel`.
- Bypass stok minus: `allowNegativeStock=true` butuh capability `inventory.negative_stock` **dan** `negativeStockReason` minimal 10 karakter (juga pada pembatalan run).
- Pada AIRA: `prod_draft_create/update/delete` = write (Draft/Approve), `prod_draft_post`, `prod_run_update`, `prod_run_cancel` = critical (Wajib-Approve). Tool `prod_draft_*` berstatus `draftCapable`: untuk non-Admin hasilnya hanya draft/pengajuan, bukan posting.

### Jebakan umum

1. **`POST /production-runs` membuat DRAFT, bukan run.** Nama tool `prod_draft_create` (dulu `prod_run_create`) sengaja diganti agar tidak menyesatkan. Run baru muncul di `prod_run_list` hanya setelah `prod_draft_post` sukses (atau disetujui).
2. **Posting oleh non-Admin berarti menunggu persetujuan** (202). Jangan menganggap stok sudah berubah; cek status draft `PendingApproval` / `Posted`.
3. **Draft gagal posting tidak hilang**: status tetap `Draft`, lihat `lastError` di `prod_draft_get`, perbaiki dengan `prod_draft_update`, posting ulang.
4. **Produk samping wajib NRV** (`unitPrice`), kalau tidak payload ditolak. Jangan memberi NRV lebih besar dari biaya total: HPP output utama menjadi 0.
5. **`prod_run_update` menggantikan seluruh baris** input/output; kirim daftar lengkap, bukan delta. Pada non-Admin edit hanya diantrekan (202) dan satu pengajuan Pending per run.
6. **Pembatalan bisa ditolak** bila stok output sudah terpakai (stok tidak cukup untuk dibalik) kecuali bypass minus dengan alasan.
7. **OEE hanya terisi bila run memuat mesin/waktu** (`runMachines`, `plannedStart/End`, `downtimes`). Field lama `machineId`, `startAt`, `endAt`, `goodQty`, `rejectQty` diabaikan.
8. **Guard dashboard**: semua `/inventory/dashboard/*` (termasuk dashboard produksi & OEE) dijaga modul `inventory`, bukan `production`.
9. **Hapus master**: mesin yang pernah dipakai tidak bisa dihapus (409, nonaktifkan); proses/standar biaya yang sudah dipakai hanya dinonaktifkan; hapus keduanya butuh `doc.cancel`.
10. **Gudang run**: input dan output memakai gudang yang sama (`warehouseId`, default gudang default aktif).
11. **Tahun fiskal**: tanggal produksi harus di tahun fiskal terbuka saat posting (bukan saat simpan draft).

### Peta istilah

| Istilah bisnis | Padanan sistem |
|----------------|----------------|
| Input produksi / catat produksi | `ProductionRunDraft` (`DPR-YYYYMM-NNNN`) |
| Data Produksi / proses produksi / run | `ProductionRun` (nomor run; jurnal `JV-<nomor>`) |
| Posting / ACC produksi | `prod_draft_post` (201 langsung / 202 menunggu persetujuan) |
| Bahan baku / input | `ProductionRunItem` lineType `Input` (mis. GKP/GKG, PK, Glosor) |
| Hasil utama / output utama | lineType `Output`, `isByProduct=false` (mis. PK, Beras) |
| Produk samping | `isByProduct=true` (bekatul, broken, menir, sekam, reject) - wajib punya NRV |
| NRV (nilai realisasi bersih) | `unitPrice` produk samping |
| Rendemen / yield | `yieldPct` = output utama / input x 100 |
| HPP terbebani / loaded HPP | `computedHpp` per kg output utama (+ `hppOverride`) |
| Biaya konversi | `ProductionRunCost` dari `ProductionCostStandard` (InputSide/OutputSide; basis InputQty/OutputQty/Fixed) |
| Akun 5.12 | Biaya Konversi Dibebankan ke Persediaan |
| Akun 5.1 | HPP Beras / COGS |
| Mesin | `Machine` (kapasitas ideal `idealRatePerHour`) |
| Proses (giling, sortir, ...) | `ProductionProcess` (via `processIds`) |
| OEE | Availability x Performance x Quality; `prod_dash_oee` |
| Downtime | `ProductionDowntime` (kategori, alasan, `durationMin`) |
| Shift / kepala shift | `shift`, `shiftLead` pada run |
| Pengajuan edit produksi | `ApprovalRequest` tipe `ProductionRunEdit` |
| Stok minus bypass | `allowNegativeStock` + `negativeStockReason` + capability `inventory.negative_stock` |

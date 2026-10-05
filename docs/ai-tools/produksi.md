# Toolset: Produksi (`produksi`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/produksi` · 28 tool (read 13, write 9, critical 6)

## Tujuan

Toolset **produksi** memberi AIRA akses ke proses produksi pabrik: input produksi (selalu berupa DRAFT dahulu), posting menjadi Data Produksi (production run) yang menggerakkan stok/WAC/jurnal, edit dan pembatalan run, master mesin, proses, dan standar biaya konversi, serta dashboard produksi (yield, OEE). Tool baca otomatis; membuat/ubah/buang draft berstatus Draft (tidak berefek ke stok/GL); memposting, mengedit, atau membatalkan run adalah `critical`.

## ALUR BISNIS

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

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`mach_create`](#mach_create) | write | tidak | `POST /api/inventory/machines` |
| [`mach_delete`](#mach_delete) | critical | tidak | `DELETE /api/inventory/machines/:id` |
| [`mach_get`](#mach_get) | read | - | `GET /api/inventory/machines/:id` |
| [`mach_list`](#mach_list) | read | - | `GET /api/inventory/machines` |
| [`mach_update`](#mach_update) | write | tidak | `PUT /api/inventory/machines/:id` |
| [`prod_cost_create`](#prod_cost_create) | write | tidak | `POST /api/inventory/production-cost-standards` |
| [`prod_cost_delete`](#prod_cost_delete) | critical | tidak | `DELETE /api/inventory/production-cost-standards/:id` |
| [`prod_cost_list`](#prod_cost_list) | read | - | `GET /api/inventory/production-cost-standards` |
| [`prod_cost_update`](#prod_cost_update) | write | tidak | `PUT /api/inventory/production-cost-standards/:id` |
| [`prod_dash_oee`](#prod_dash_oee) | read | - | `GET /api/inventory/dashboard/oee` |
| [`prod_dash_production`](#prod_dash_production) | read | - | `GET /api/inventory/dashboard/production` |
| [`prod_dash_stats`](#prod_dash_stats) | read | - | `GET /api/inventory/dashboard/production-stats` |
| [`prod_dash_yield_trend`](#prod_dash_yield_trend) | read | - | `GET /api/inventory/dashboard/yield-trend` |
| [`prod_draft_create`](#prod_draft_create) | write | ya | `POST /api/inventory/production-runs` |
| [`prod_draft_delete`](#prod_draft_delete) | write | ya | `DELETE /api/inventory/production-runs/drafts/:id` |
| [`prod_draft_get`](#prod_draft_get) | read | - | `GET /api/inventory/production-runs/drafts/:id` |
| [`prod_draft_list`](#prod_draft_list) | read | - | `GET /api/inventory/production-runs/drafts` |
| [`prod_draft_post`](#prod_draft_post) | critical | ya | `POST /api/inventory/production-runs/drafts/:id/post` |
| [`prod_draft_update`](#prod_draft_update) | write | ya | `PUT /api/inventory/production-runs/drafts/:id` |
| [`prod_proc_create`](#prod_proc_create) | write | tidak | `POST /api/inventory/production-processes` |
| [`prod_proc_delete`](#prod_proc_delete) | critical | tidak | `DELETE /api/inventory/production-processes/:id` |
| [`prod_proc_list`](#prod_proc_list) | read | - | `GET /api/inventory/production-processes` |
| [`prod_proc_update`](#prod_proc_update) | write | tidak | `PUT /api/inventory/production-processes/:id` |
| [`prod_run_cancel`](#prod_run_cancel) | critical | tidak | `PUT /api/inventory/production-runs/:id/cancel` |
| [`prod_run_get`](#prod_run_get) | read | - | `GET /api/inventory/production-runs/:id` |
| [`prod_run_list`](#prod_run_list) | read | - | `GET /api/inventory/production-runs` |
| [`prod_run_summary`](#prod_run_summary) | read | - | `GET /api/inventory/production-runs/summary` |
| [`prod_run_update`](#prod_run_update) | critical | ya | `PUT /api/inventory/production-runs/:id` |

## Rincian tool

### mach_create

**Ringkasan:** Membuat master mesin produksi (kode, nama, kapasitas ideal per jam untuk perhitungan OEE, satuan).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `POST /api/inventory/machines` (src/routes/inventory/machines.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode mesin unik. |
| `name` | body | `string` | ya | Nama. |
| `idealRatePerHour` | body | `number` | tidak | Kapasitas ideal per jam (dasar komponen performance OEE). |
| `unit` | body | `string` | tidak | Satuan kapasitas (mis. kg). |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "mach_create",
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
  "confirm": "Buat mesin <code> - <name>?"
}
```

**Isi hasil:** Mesin yang dibuat (201).

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya master).

**Teks konfirmasi:** Buat mesin {code} - {name}?

**Error umum**

- 409: kode mesin sudah ada

**Tool terkait:** [`mach_update`](#mach_update), [`mach_list`](#mach_list)

### mach_delete

**Ringkasan:** Menghapus permanen master mesin. Ditolak (409) bila mesin sudah dipakai di proses produksi atau catatan downtime; gunakan mach_update isActive=false untuk menonaktifkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `DELETE /api/inventory/machines/:id` (src/routes/inventory/machines.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID mesin. |

**Contoh pemanggilan**

```json
{
  "tool": "mach_delete",
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
  "confirm": "HAPUS permanen mesin <id>?"
}
```

**Isi hasil:** {message: 'Mesin dihapus.', deleted: true}

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hard delete master mesin.

**Teks konfirmasi:** HAPUS permanen mesin {id}?

**Error umum**

- 409: mesin sudah dipakai di produksi/downtime
- 404: mesin tidak ditemukan

### mach_get

**Ringkasan:** Detail satu mesin produksi: kode, nama, kapasitas ideal per jam, satuan, status aktif, catatan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `production` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/machines/:id` (src/routes/inventory/machines.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID mesin. |

**Contoh pemanggilan**

```json
{
  "tool": "mach_get",
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
  "data": "<Objek mesin {id, code, name, idealRatePerHour, unit, isActive, notes}.>"
}
```

**Isi hasil:** Objek mesin {id, code, name, idealRatePerHour, unit, isActive, notes}.

**Error umum**

- 404: mesin tidak ditemukan

### mach_list

**Ringkasan:** Daftar mesin produksi (master): kode, nama, kapasitas ideal per jam (untuk OEE), satuan, status aktif.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `production` / `view`)
- **Catatan akses:** GET data referensi terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/machines` (src/routes/inventory/machines.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `active` | query | `string` | tidak | 'true' / 'false' untuk menyaring mesin aktif/nonaktif; kosong = semua. |

**Contoh pemanggilan**

```json
{
  "tool": "mach_list",
  "args": {
    "active": "<active>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data:[mesin]}.>"
}
```

**Isi hasil:** {data:[mesin]}.

**Tool terkait:** [`mach_get`](#mach_get), [`prod_dash_oee`](#prod_dash_oee)

### mach_update

**Ringkasan:** Mengubah master mesin (nama, kode, kapasitas ideal, satuan, aktif, catatan). Run lama tidak dihitung ulang.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `PUT /api/inventory/machines/:id` (src/routes/inventory/machines.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID mesin. |
| `code` | body | `string` | tidak | Kode. |
| `name` | body | `string` | tidak | Nama. |
| `idealRatePerHour` | body | `number` | tidak |  |
| `unit` | body | `string` | tidak | Satuan. |
| `isActive` | body | `boolean` | tidak | false = nonaktifkan mesin (histori OEE tetap). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "mach_update",
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
  "confirm": "Ubah mesin <id>?"
}
```

**Isi hasil:** Mesin setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah mesin {id}?

**Error umum**

- 404: mesin tidak ditemukan

### prod_cost_create

**Ringkasan:** Membuat standar biaya produksi (nama, sisi InputSide/OutputSide, basis InputQty/OutputQty/Fixed, tarif default, akun biaya, cakupan item/gudang). Dipakai menghitung HPP loaded pada produksi; tidak menjurnal sendiri.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `POST /api/inventory/production-cost-standards` (src/routes/inventory/productionCostStandards.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama. |
| `description` | body | `string` | tidak | Keterangan. |
| `costSide` | body | enum: `InputSide`, `OutputSide` | ya | InputSide / OutputSide - sisi biaya. |
| `basis` | body | enum: `InputQty`, `OutputQty`, `Fixed` | ya | InputQty = tarif x total qty input; OutputQty = tarif x total qty output; Fixed = nominal tetap. |
| `defaultRate` | body | `number` | ya | Tarif default (>= 0). |
| `costAccountId` | body | `uuid` | tidak | Opsional UUID akun beban/biaya. |
| `itemId` | body | `uuid` | tidak |  |
| `warehouseId` | body | `uuid` | tidak | gudang produksi yg dipilih, atau yang berlaku semua gudang (null). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_cost_create",
  "args": {
    "name": "<name>",
    "costSide": "InputSide",
    "basis": "InputQty",
    "defaultRate": 1
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
  "confirm": "Buat standar biaya produksi <name> (tarif 1)?"
}
```

**Isi hasil:** Standar biaya yang dibuat (201).

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung (memengaruhi HPP produksi mendatang).

**Teks konfirmasi:** Buat standar biaya produksi {name} (tarif {defaultRate})?

**Tool terkait:** [`prod_cost_update`](#prod_cost_update), [`prod_draft_create`](#prod_draft_create)

### prod_cost_delete

**Ringkasan:** Menghapus standar biaya produksi: bila sudah dipakai di run, hanya DINONAKTIFKAN (soft); bila belum pernah dipakai, dihapus permanen. Butuh capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `production` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/inventory/production-cost-standards/:id` (src/routes/inventory/productionCostStandards.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID standar biaya. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_cost_delete",
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
  "confirm": "Hapus/nonaktifkan standar biaya produksi <id>?"
}
```

**Isi hasil:** {message, deleted:true} atau {message, deactivated:true}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; deactivate atau hard delete master.

**Teks konfirmasi:** Hapus/nonaktifkan standar biaya produksi {id}?

**Prasyarat**

- User memiliki capability doc.cancel.

**Error umum**

- 404: standar tidak ditemukan
- 403: tanpa capability doc.cancel

### prod_cost_list

**Ringkasan:** Daftar standar biaya produksi (komponen biaya konversi: sisi input/output, basis perhitungan, tarif default, akun biaya). Filter aktif, sisi biaya, serta item/gudang (menyertakan standar umum tanpa item/gudang).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `production` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/production-cost-standards` (src/routes/inventory/productionCostStandards.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `active` | query | `string` | tidak | 'true'/'false'. |
| `costSide` | query | `string` | tidak | InputSide (biaya terkait bahan masuk) atau OutputSide (terkait hasil). |
| `itemId` | query | `string` | tidak | UUID item - mengembalikan standar item itu + standar umum. |
| `warehouseId` | query | `string` | tidak | UUID gudang - mengembalikan standar gudang itu + standar umum. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_cost_list",
  "args": {
    "active": "<active>",
    "costSide": "<costSide>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data:[standar biaya]}.>"
}
```

**Isi hasil:** {data:[standar biaya]}.

**Tool terkait:** [`prod_cost_create`](#prod_cost_create)

### prod_cost_update

**Ringkasan:** Mengubah standar biaya produksi. Run lama menyimpan snapshot sehingga tidak terpengaruh; hanya produksi berikutnya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `PUT /api/inventory/production-cost-standards/:id` (src/routes/inventory/productionCostStandards.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID standar biaya. |
| `name` | body | `string` | tidak | Nama. |
| `description` | body | `string` | tidak | Keterangan. |
| `costSide` | body | enum: `InputSide`, `OutputSide` | tidak |  |
| `basis` | body | enum: `InputQty`, `OutputQty`, `Fixed` | tidak |  |
| `defaultRate` | body | `number` | tidak |  |
| `costAccountId` | body | `uuid` | tidak |  |
| `itemId` | body | `uuid` | tidak |  |
| `warehouseId` | body | `uuid` | tidak | gudang produksi yg dipilih, atau yang berlaku semua gudang (null). |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_cost_update",
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
  "confirm": "Ubah standar biaya produksi <id>?"
}
```

**Isi hasil:** Standar biaya setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung.

**Teks konfirmasi:** Ubah standar biaya produksi {id}?

**Error umum**

- 404: standar tidak ditemukan

### prod_dash_oee

**Ringkasan:** Laporan OEE (Overall Equipment Effectiveness) periode tertentu: ringkasan availability/performance/quality, tren, per shift, per mesin, dan Pareto downtime per kategori. Hanya memuat run yang dilengkapi data mesin/waktu.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** Guard sebenarnya modul 'inventory' (bukan 'production').
- **Handler:** `GET /api/inventory/dashboard/oee` (src/routes/inventory/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Awal periode (YYYY-MM-DD). Default awal bulan berjalan. |
| `endDate` | query | `date` | tidak | Akhir periode (YYYY-MM-DD). Default akhir bulan berjalan. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_dash_oee",
  "args": {
    "startDate": "2026-01-31",
    "endDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {summary, trend, perShift, perMachine, downtimeByCategory}.>"
}
```

**Isi hasil:** Objek {summary, trend, perShift, perMachine, downtimeByCategory}.

**Tool terkait:** [`mach_list`](#mach_list), [`prod_run_get`](#prod_run_get)

### prod_dash_production

**Ringkasan:** Dashboard produksi komprehensif untuk satu periode (default bulan berjalan) dibanding periode sebelumnya dengan durasi sama: volume input/output, yield, biaya, tren harian. Dapat difilter per item output.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** Guard sebenarnya modul 'inventory' (bukan 'production').
- **Handler:** `GET /api/inventory/dashboard/production` (src/routes/inventory/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | query | `string` | tidak | Opsional: batasi ke satu item (UUID InventoryItem). |
| `startDate` | query | `date` | tidak | Awal periode (YYYY-MM-DD). Default awal bulan berjalan. |
| `endDate` | query | `date` | tidak | Akhir periode (YYYY-MM-DD, inklusif sampai 23:59:59). Default akhir bulan berjalan. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_dash_production",
  "args": {
    "itemId": "<id>",
    "startDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek dashboard produksi (ringkasan periode, pembanding periode lalu, tren, rincian per it>"
}
```

**Isi hasil:** Objek dashboard produksi (ringkasan periode, pembanding periode lalu, tren, rincian per item).

**Tool terkait:** [`prod_dash_stats`](#prod_dash_stats), [`prod_dash_oee`](#prod_dash_oee)

### prod_dash_stats

**Ringkasan:** Statistik produksi ringkas: total proses produksi aktif (tidak dibatalkan), jumlah bulan ini, dan rata-rata yield (%) dari 50 proses terakhir.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** Guard sebenarnya modul 'inventory' (bukan 'production'): role dengan izin lihat stok dapat membacanya.
- **Handler:** `GET /api/inventory/dashboard/production-stats` (src/routes/inventory/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "prod_dash_stats",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {totalRuns, thisMonthRuns, avgYield}.>"
}
```

**Isi hasil:** Objek {totalRuns, thisMonthRuns, avgYield}.

**Tool terkait:** [`prod_dash_production`](#prod_dash_production), [`prod_dash_yield_trend`](#prod_dash_yield_trend)

### prod_dash_yield_trend

**Ringkasan:** Rata-rata yield produksi (%) per bulan selama 6 bulan terakhir, beserta rata-rata keseluruhan, nilai terbaru, dan selisih persen terhadap bulan sebelumnya.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** Guard sebenarnya modul 'inventory' (bukan 'production').
- **Handler:** `GET /api/inventory/dashboard/yield-trend` (src/routes/inventory/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "prod_dash_yield_trend",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {months:[{month, avgYield,...}], overallAvg, latest, deltaPct}.>"
}
```

**Isi hasil:** Objek {months:[{month, avgYield,...}], overallAvg, latest, deltaPct}.

### prod_draft_create

**Ringkasan:** Menyimpan input produksi sebagai DRAFT (nomor DPR-YYYYMM-NNNN, status Draft). Tidak ada efek stok, GL, WAC, COGS, laporan maupun OEE; hanya memvalidasi payload dan mengembalikan warnings (mis. stok input kurang). Posting dilakukan terpisah via prod_draft_post.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `POST /api/inventory/production-runs` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal produksi (YYYY-MM-DD). |
| `warehouseId` | body | `uuid` | tidak | UUID gudang tempat input dikonsumsi dan output disimpan. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `referenceType` | body | `string` | tidak |  |
| `referenceId` | body | `string` | tidak |  |
| `referenceNumber` | body | `string` | tidak |  |
| `inputs` | body | `array<object>` | ya | Baris bahan input: [{itemId, quantity, sourceMovementId?(batch), batchUnitCost?}]. |
| `inputs[].itemId` | body | `string` | ya |  |
| `inputs[].quantity` | body | `number` | ya |  |
| `inputs[].sourceMovementId` | body | `uuid` | tidak | fall back to WAC-based costing (legacy behavior). |
| `inputs[].batchUnitCost` | body | `number` | tidak |  |
| `outputs` | body | `array<object>` | ya | Baris output: [{itemId, quantity, unitPrice?, isByProduct}]. Output utama tanpa unitPrice diisi HPP terhitung; produk samping WAJIB unitPrice (NRV). |
| `outputs[].itemId` | body | `string` | ya |  |
| `outputs[].quantity` | body | `number` | ya |  |
| `outputs[].unitPrice` | body | `number` | tidak |  |
| `outputs[].isByProduct` | body | `boolean` | tidak |  |
| `costs` | body | `array<object>` | tidak | Komponen biaya konversi (standar biaya) untuk menghitung HPP; tidak menjurnal sendiri. |
| `costs[].standardId` | body | `uuid` | tidak |  |
| `costs[].description` | body | `string` | ya |  |
| `costs[].costSide` | body | enum: `InputSide`, `OutputSide` | ya |  |
| `costs[].basis` | body | enum: `InputQty`, `OutputQty`, `Fixed` | ya |  |
| `costs[].rate` | body | `number` | ya |  |
| `costs[].costAccountId` | body | `uuid` | tidak |  |
| `hppOverride` | body | `number` | tidak | Opsional: kunci HPP per kg output utama (>= 0). |
| `processIds` | body | `array<uuid>` | tidak | Daftar UUID proses produksi yang dilalui. |
| `plannedStart` | body | `date` | tidak | B2 multi-mesin: jendela shift standar (planned production time) & istirahat. |
| `plannedEnd` | body | `date` | tidak |  |
| `breakStart` | body | `date` | tidak |  |
| `breakEnd` | body | `date` | tidak |  |
| `runMachines` | body | `array<object>` | tidak | Mesin paralel [{machineId, startAt, endAt}] untuk OEE. |
| `runMachines[].machineId` | body | `uuid` | ya |  |
| `runMachines[].startAt` | body | `date` | tidak |  |
| `runMachines[].endAt` | body | `date` | tidak |  |
| `shift` | body | `string` | tidak | "1" \| "2" \| "3" |
| `shiftLead` | body | `string` | tidak | kepala shift (teks bebas) |
| `manpowerCount` | body | `number` | tidak |  |
| `goodQty` | body | `number` | tidak | LEGACY — diabaikan |
| `rejectQty` | body | `number` | tidak | LEGACY — diabaikan |
| `downtimes` | body | `array<object>` | tidak | Catatan downtime [{machineId, category, reason, durationMin}]. |
| `downtimes[].machineId` | body | `uuid` | tidak |  |
| `downtimes[].category` | body | `string` | ya |  |
| `downtimes[].reason` | body | `string` | tidak |  |
| `downtimes[].durationMin` | body | `number` | ya |  |
| `machineId` | body | `uuid` | tidak | tidak lagi dipakai untuk compute OEE. |
| `startAt` | body | `date` | tidak |  |
| `endAt` | body | `date` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | Izinkan stok minus - butuh capability inventory.negative_stock dan negativeStockReason minimal 10 karakter. |
| `negativeStockReason` | body | `string` | tidak | Alasan bypass stok minus (min 10 karakter). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_create",
  "args": {
    "date": "2026-01-31",
    "inputs": [
      {
        "itemId": "<id>",
        "quantity": 1
      }
    ],
    "outputs": [
      {
        "itemId": "<id>",
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
  "confirm": "Simpan draft produksi tanggal 2026-01-31 ({notes})? Belum ada efek stok/GL sampai diposting."
}
```

**Isi hasil:** 201 {draft:{id, draftNumber, status:'Draft', ...}, warnings:[string]}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC (hanya baris production_run_drafts status Draft).

**Teks konfirmasi:** Simpan draft produksi tanggal {date} ({notes})? Belum ada efek stok/GL sampai diposting.

**Prasyarat**

- Item input/output aktif.
- Bila allowNegativeStock=true: user punya capability inventory.negative_stock.

**Error umum**

- 400: validasi payload (mis. alasan bypass < 10 karakter, produk samping tanpa NRV)
- 403: tidak berwenang bypass validasi stok

**Tool terkait:** [`prod_draft_update`](#prod_draft_update), [`prod_draft_post`](#prod_draft_post), [`prod_draft_list`](#prod_draft_list), [`inv_item_batches`](persediaan.md#inv_item_batches)

### prod_draft_delete

**Ringkasan:** Membuang draft produksi (soft delete: status menjadi Discarded dan hilang dari daftar). Hanya selagi status Draft dan oleh pembuat draft atau pemegang approval.bypass. Tidak berefek ke stok/GL.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Catatan akses:** Pembuat draft atau pemegang approval.bypass.
- **Handler:** `DELETE /api/inventory/production-runs/drafts/:id` (src/routes/inventory/productionRunDrafts.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID draft produksi. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_delete",
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
  "confirm": "Buang draft produksi <id>?"
}
```

**Isi hasil:** {message: 'Draft produksi dihapus.'}

**Efek pembukuan/stok:** Tidak ada efek GL/stok (draft ditandai Discarded).

**Teks konfirmasi:** Buang draft produksi {id}?

**Error umum**

- 403: hanya pembuat draft yang boleh menghapusnya
- 404: draft tidak ditemukan
- 400: draft bukan berstatus Draft

**Tool terkait:** [`prod_draft_list`](#prod_draft_list)

### prod_draft_get

**Ringkasan:** Detail satu draft produksi lengkap dengan payload (isian formulir), ringkasan, status, lastError (alasan gagal posting terakhir), dan nomor run bila sudah diposting.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `view`)
- **Handler:** `GET /api/inventory/production-runs/drafts/:id` (src/routes/inventory/productionRunDrafts.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID draft produksi. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_get",
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
  "data": "<Objek draft {id, draftNumber, status, date, payload, summary, lastError, postedRunId, post>"
}
```

**Isi hasil:** Objek draft {id, draftNumber, status, date, payload, summary, lastError, postedRunId, postedRunNumber, createdBy}.

**Error umum**

- 404: draft produksi tidak ditemukan

**Tool terkait:** [`prod_draft_update`](#prod_draft_update), [`prod_draft_post`](#prod_draft_post)

### prod_draft_list

**Ringkasan:** Daftar draft produksi (DPR-...) tanpa payload penuh, dengan hitungan per status. Draft yang dibuang (Discarded) tidak ditampilkan. Status: Draft, PendingApproval (menunggu persetujuan), Posted (sudah jadi Data Produksi).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `view`)
- **Handler:** `GET /api/inventory/production-runs/drafts` (src/routes/inventory/productionRunDrafts.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `PendingApproval`, `Posted` | tidak | Draft \| PendingApproval \| Posted. |
| `search` | query | `string` | tidak | Cari nomor draft, catatan, atau nomor run hasil posting. |
| `startDate` | query | `date` | tidak | Awal tanggal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Akhir tanggal (YYYY-MM-DD). |
| `page` | query | `number` | tidak | Halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (default 50, maks 200). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_list",
  "args": {
    "status": "Draft",
    "search": "<search>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {data:[draft + createdBy + summary], total, page, limit, counts:{status:jumlah}}.>"
}
```

**Isi hasil:** Objek {data:[draft + createdBy + summary], total, page, limit, counts:{status:jumlah}}.

**Error umum**

- 400: status draft tidak dikenal / format tanggal salah

**Tool terkait:** [`prod_draft_get`](#prod_draft_get), [`prod_draft_create`](#prod_draft_create)

### prod_draft_post

**Ringkasan:** Memposting draft produksi menjadi Data Produksi. Role dengan approval.bypass: langsung diposting (201), draft menjadi Posted + postedRunId. Role lain: diantrekan sebagai ApprovalRequest 'ProductionRun' (202), draft menjadi PendingApproval dan manajer/Admin diberi notifikasi; efek baru terjadi saat disetujui. Pengecekan stok terjadi saat posting; bila gagal draft tetap Draft dengan lastError.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Catatan akses:** Pembuat draft atau pemegang approval.bypass. Klaim draft atomik sehingga tidak bisa dobel-posting.
- **Handler:** `POST /api/inventory/production-runs/drafts/:id/post` (src/routes/inventory/productionRunDrafts.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID draft produksi. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_post",
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
  "confirm": "Posting draft produksi <id> menjadi Data Produksi? Stok, WAC, dan jurnal akan terbentuk (non-Admin: masuk antrian persetujuan)."
}
```

**Isi hasil:** Bypass: 201 production run yang dibuat. Non-bypass: 202 {pendingApproval:true, request, message}.

**Efek pembukuan/stok:** Cabang bypass: stok input keluar (SM Out) & output masuk (SM In), WAC output dihitung ulang, COGS backfill diselesaikan, jurnal JV-<runNo>: DR Persediaan output / CR Persediaan input, selisih nilai CR 5.12 Biaya Konversi Dibebankan (s.d. total biaya konversi) dan sisanya CR 5.1 HPP Beras; rugi produksi = DR 5.1. Cabang non-bypass: hanya membuat ApprovalRequest (tanpa efek stok/GL sampai disetujui).

**Teks konfirmasi:** Posting draft produksi {id} menjadi Data Produksi? Stok, WAC, dan jurnal akan terbentuk (non-Admin: masuk antrian persetujuan).

**Prasyarat**

- Draft berstatus Draft.
- Stok input cukup (kecuali payload allowNegativeStock + capability inventory.negative_stock).
- Tahun fiskal aktif untuk tanggal produksi.

**Error umum**

- 403: hanya pembuat draft yang boleh memostingnya
- 400: stok input tidak cukup (draft tetap Draft, lastError terisi)
- 404: draft tidak ditemukan

**Tool terkait:** [`prod_draft_get`](#prod_draft_get), [`prod_run_get`](#prod_run_get), [`prod_run_update`](#prod_run_update)

### prod_draft_update

**Ringkasan:** Mengubah isi draft produksi (payload sama dengan prod_draft_create). Hanya selagi status Draft dan hanya oleh pembuat draft atau pemegang capability approval.bypass. Tetap tanpa efek stok/GL.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Catatan akses:** Pembuat draft atau pemegang approval.bypass.
- **Handler:** `PUT /api/inventory/production-runs/drafts/:id` (src/routes/inventory/productionRunDrafts.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID draft produksi. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `warehouseId` | body | `uuid` | tidak | the legacy default-warehouse fallback so user is explicit per run. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `referenceType` | body | `string` | tidak |  |
| `referenceId` | body | `string` | tidak |  |
| `referenceNumber` | body | `string` | tidak |  |
| `inputs` | body | `array<object>` | ya | Daftar bahan baku/input produksi (array objek). |
| `inputs[].itemId` | body | `string` | ya |  |
| `inputs[].quantity` | body | `number` | ya |  |
| `inputs[].sourceMovementId` | body | `uuid` | tidak | fall back to WAC-based costing (legacy behavior). |
| `inputs[].batchUnitCost` | body | `number` | tidak |  |
| `outputs` | body | `array<object>` | ya | Daftar hasil/output produksi (array objek). |
| `outputs[].itemId` | body | `string` | ya |  |
| `outputs[].quantity` | body | `number` | ya |  |
| `outputs[].unitPrice` | body | `number` | tidak |  |
| `outputs[].isByProduct` | body | `boolean` | tidak |  |
| `costs` | body | `array<object>` | tidak | GL is NOT posted from these — real expenses still flow via JV/invoice. |
| `costs[].standardId` | body | `uuid` | tidak |  |
| `costs[].description` | body | `string` | ya |  |
| `costs[].costSide` | body | enum: `InputSide`, `OutputSide` | ya |  |
| `costs[].basis` | body | enum: `InputQty`, `OutputQty`, `Fixed` | ya |  |
| `costs[].rate` | body | `number` | ya |  |
| `costs[].costAccountId` | body | `uuid` | tidak |  |
| `hppOverride` | body | `number` | tidak | material + costs - byproduct value. |
| `processIds` | body | `array<uuid>` | tidak | Optional + order-insensitive (multiselect). Empty array = unspecified. |
| `plannedStart` | body | `date` | tidak | B2 multi-mesin: jendela shift standar (planned production time) & istirahat. |
| `plannedEnd` | body | `date` | tidak |  |
| `breakStart` | body | `date` | tidak |  |
| `breakEnd` | body | `date` | tidak |  |
| `runMachines` | body | `array<object>` | tidak | Mesin paralel dalam run; OEE dihitung per mesin + agregat line. |
| `runMachines[].machineId` | body | `uuid` | ya |  |
| `runMachines[].startAt` | body | `date` | tidak |  |
| `runMachines[].endAt` | body | `date` | tidak |  |
| `shift` | body | `string` | tidak | "1" \| "2" \| "3" |
| `shiftLead` | body | `string` | tidak | kepala shift (teks bebas) |
| `manpowerCount` | body | `number` | tidak |  |
| `goodQty` | body | `number` | tidak | LEGACY — diabaikan |
| `rejectQty` | body | `number` | tidak | LEGACY — diabaikan |
| `downtimes` | body | `array<object>` | tidak |  |
| `downtimes[].machineId` | body | `uuid` | tidak |  |
| `downtimes[].category` | body | `string` | ya |  |
| `downtimes[].reason` | body | `string` | tidak |  |
| `downtimes[].durationMin` | body | `number` | ya |  |
| `machineId` | body | `uuid` | tidak | tidak lagi dipakai untuk compute OEE. |
| `startAt` | body | `date` | tidak |  |
| `endAt` | body | `date` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | Use case: backdated production input where sales already reduced stock. |
| `negativeStockReason` | body | `string` | tidak | Disimpan ke audit log + ditampilkan di Dashboard "Stok Minus Aktif". |

**Contoh pemanggilan**

```json
{
  "tool": "prod_draft_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "inputs": [
      {
        "itemId": "<id>",
        "quantity": 1
      }
    ],
    "outputs": [
      {
        "itemId": "<id>",
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
  "confirm": "Simpan perubahan draft produksi <id>?"
}
```

**Isi hasil:** {draft, warnings}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC (hanya memperbarui draft).

**Teks konfirmasi:** Simpan perubahan draft produksi {id}?

**Prasyarat**

- Draft berstatus Draft (bukan PendingApproval/Posted).

**Error umum**

- 403: hanya pembuat draft yang boleh mengubahnya
- 404: draft tidak ditemukan
- 400: draft bukan berstatus Draft

**Tool terkait:** [`prod_draft_get`](#prod_draft_get), [`prod_draft_post`](#prod_draft_post)

### prod_proc_create

**Ringkasan:** Membuat master proses produksi (nama, deskripsi, urutan tampil).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `POST /api/inventory/production-processes` (src/routes/inventory/productionProcesses.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama. |
| `description` | body | `string` | tidak | Keterangan. |
| `sortOrder` | body | `number` | tidak | Urutan tampil (angka kecil lebih dulu). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_proc_create",
  "args": {
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
  "confirm": "Buat proses produksi <name>?"
}
```

**Isi hasil:** Proses yang dibuat (201).

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya master).

**Teks konfirmasi:** Buat proses produksi {name}?

### prod_proc_delete

**Ringkasan:** Menghapus master proses produksi: bila sudah dipakai di run produksi, hanya dinonaktifkan; bila belum, dihapus permanen. Butuh capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `production` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/inventory/production-processes/:id` (src/routes/inventory/productionProcesses.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID proses. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_proc_delete",
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
  "confirm": "Hapus/nonaktifkan proses produksi <id>?"
}
```

**Isi hasil:** {message, deleted:true} atau {message, deactivated:true}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; deactivate atau hard delete master.

**Teks konfirmasi:** Hapus/nonaktifkan proses produksi {id}?

**Error umum**

- 404: proses tidak ditemukan
- 403: tanpa capability doc.cancel

### prod_proc_list

**Ringkasan:** Daftar master proses produksi (mis. giling, sortir) beserta urutan, untuk ditautkan ke run produksi (traceability).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `production` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/production-processes` (src/routes/inventory/productionProcesses.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `active` | query | `string` | tidak | 'true'/'false'; kosong = semua. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_proc_list",
  "args": {
    "active": "<active>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data:[proses]}.>"
}
```

**Isi hasil:** {data:[proses]}.

### prod_proc_update

**Ringkasan:** Mengubah master proses produksi (nama, deskripsi, urutan, aktif).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Handler:** `PUT /api/inventory/production-processes/:id` (src/routes/inventory/productionProcesses.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID proses. |
| `name` | body | `string` | tidak | Nama. |
| `description` | body | `string` | tidak | Keterangan. |
| `sortOrder` | body | `number` | tidak |  |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_proc_update",
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
  "confirm": "Ubah proses produksi <id>?"
}
```

**Isi hasil:** Proses setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah proses produksi {id}?

**Error umum**

- 404: proses tidak ditemukan

### prod_run_cancel

**Ringkasan:** Membatalkan Data Produksi yang sudah diposting: semua pergerakan stok dibalik, WAC item output dihitung ulang dari pergerakan masuk tersisa, semua jurnal berawalan JV-<runNo> (termasuk revisi) dibatalkan, run ditandai batal. Bypass stok minus butuh alasan minimal 10 karakter.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `production` / `edit`, capability `doc.cancel`)
- **Handler:** `PUT /api/inventory/production-runs/:id/cancel` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID production run. |
| `allowNegativeStock` | query | `string` | tidak | true = lewati cek stok output cukup (admin); wajib negativeStockReason. |
| `allowNegativeStock` | body | `boolean` | tidak | true = lewati cek stok output cukup (admin); wajib negativeStockReason. |
| `negativeStockReason` | body | `string` | tidak | Alasan bypass stok minus (min 10 karakter). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_run_cancel",
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
  "confirm": "Batalkan Data Produksi <id>? Stok dan jurnal produksi akan dibalik."
}
```

**Isi hasil:** {message: 'Proses produksi berhasil dibatalkan.'}

**Efek pembukuan/stok:** Stok input dikembalikan, stok output dikurangi (ditolak bila stok output tidak cukup kecuali allowNegativeStock); WAC output recompute; jurnal produksi Cancelled + saldo akun dihitung ulang.

**Teks konfirmasi:** Batalkan Data Produksi {id}? Stok dan jurnal produksi akan dibalik.

**Prasyarat**

- User memiliki capability doc.cancel.
- Run belum dibatalkan.

**Error umum**

- 400: proses produksi sudah dibatalkan
- 400: stok output tidak cukup untuk dibalik
- 400: alasan bypass < 10 karakter
- 403: tanpa capability doc.cancel

**Tool terkait:** [`prod_run_get`](#prod_run_get)

### prod_run_get

**Ringkasan:** Detail satu Data Produksi: baris input/output (dengan batch sumber dan gudang), komponen biaya, mesin/downtime, jurnal GL aktif (JV-<runNumber>, revisi terbaru), dan glSummary (nilai nyata bahan keluar vs produk masuk, selisih konversi, HPP per kg, yield).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `view`)
- **Handler:** `GET /api/inventory/production-runs/:id` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID production run. |

**Contoh pemanggilan**

```json
{
  "tool": "prod_run_get",
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
  "data": "<Objek run lengkap + journal (atau null) + glSummary.>"
}
```

**Isi hasil:** Objek run lengkap + journal (atau null) + glSummary.

**Error umum**

- 404: data proses produksi tidak ditemukan

**Tool terkait:** [`prod_run_list`](#prod_run_list), [`prod_run_update`](#prod_run_update), [`prod_run_cancel`](#prod_run_cancel)

### prod_run_list

**Ringkasan:** Daftar Data Produksi yang sudah DIPOSTING (production run) dengan item input/output, mesin, dan pembuat. Filter status aktif/batal, mesin, rentang tanggal, pencarian. Draft produksi yang belum diposting TIDAK muncul di sini (lihat prod_draft_list).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `view`)
- **Handler:** `GET /api/inventory/production-runs` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `active`, `cancelled` | tidak | active = tidak dibatalkan, cancelled = dibatalkan. |
| `machineId` | query | `uuid` | tidak | UUID mesin. |
| `startDate` | query | `date` | tidak | Awal rentang (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Akhir rentang (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor run/referensi, catatan, nama/kode item. |
| `sort` | query | `string` | tidak | date\|runNumber\|yieldPct; awali '-' untuk menurun. |
| `page` | query | `number` | tidak | Halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (default 50, maks 200). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_run_list",
  "args": {
    "status": "active",
    "machineId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {data:[run dengan items, machine, createdBy], total, page, limit}.>"
}
```

**Isi hasil:** Objek {data:[run dengan items, machine, createdBy], total, page, limit}.

**Tool terkait:** [`prod_run_summary`](#prod_run_summary), [`prod_run_get`](#prod_run_get), [`prod_draft_list`](#prod_draft_list)

### prod_run_summary

**Ringkasan:** Total KPI Data Produksi untuk filter yang sama dengan prod_run_list: jumlah run, total qty input, output utama, produk samping, dan yield keseluruhan run yang tidak dibatalkan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `view`)
- **Handler:** `GET /api/inventory/production-runs/summary` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `active`, `cancelled` | tidak | Filter status dokumen. |
| `machineId` | query | `uuid` | tidak |  |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Kata kunci pencarian (nomor dokumen / nama). |

**Contoh pemanggilan**

```json
{
  "tool": "prod_run_summary",
  "args": {
    "status": "active",
    "machineId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek ringkasan {jumlah run aktif/batal, qty input, qty output utama, qty produk samping, >"
}
```

**Isi hasil:** Objek ringkasan {jumlah run aktif/batal, qty input, qty output utama, qty produk samping, yield, satuan}.

**Tool terkait:** [`prod_run_list`](#prod_run_list)

### prod_run_update

**Ringkasan:** Mengedit Data Produksi yang SUDAH diposting (bukan draft): membatalkan efek lama lalu menerapkan ulang dengan nomor run yang sama dan jurnal revisi JV-<runNo>-R<n>. Untuk role tanpa approval.bypass, tidak langsung dieksekusi melainkan diantrekan sebagai ApprovalRequest 'ProductionRunEdit' (202).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `production` / `edit`)
- **Catatan akses:** Role tanpa capability approval.bypass hanya mengantrekan permintaan edit; satu pengajuan Pending per run (409 bila sudah ada).
- **Handler:** `PUT /api/inventory/production-runs/:id` (src/routes/inventory/productionRuns.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID production run yang diedit. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `warehouseId` | body | `uuid` | tidak | the legacy default-warehouse fallback so user is explicit per run. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `referenceType` | body | `string` | tidak |  |
| `referenceId` | body | `string` | tidak |  |
| `referenceNumber` | body | `string` | tidak |  |
| `inputs` | body | `array<object>` | ya | Baris input baru (menggantikan semua baris lama). |
| `inputs[].itemId` | body | `string` | ya |  |
| `inputs[].quantity` | body | `number` | ya |  |
| `inputs[].sourceMovementId` | body | `uuid` | tidak | fall back to WAC-based costing (legacy behavior). |
| `inputs[].batchUnitCost` | body | `number` | tidak |  |
| `outputs` | body | `array<object>` | ya | Baris output baru (menggantikan semua baris lama). |
| `outputs[].itemId` | body | `string` | ya |  |
| `outputs[].quantity` | body | `number` | ya |  |
| `outputs[].unitPrice` | body | `number` | tidak |  |
| `outputs[].isByProduct` | body | `boolean` | tidak |  |
| `costs` | body | `array<object>` | tidak | GL is NOT posted from these — real expenses still flow via JV/invoice. |
| `costs[].standardId` | body | `uuid` | tidak |  |
| `costs[].description` | body | `string` | ya |  |
| `costs[].costSide` | body | enum: `InputSide`, `OutputSide` | ya |  |
| `costs[].basis` | body | enum: `InputQty`, `OutputQty`, `Fixed` | ya |  |
| `costs[].rate` | body | `number` | ya |  |
| `costs[].costAccountId` | body | `uuid` | tidak |  |
| `hppOverride` | body | `number` | tidak | material + costs - byproduct value. |
| `processIds` | body | `array<uuid>` | tidak | Optional + order-insensitive (multiselect). Empty array = unspecified. |
| `plannedStart` | body | `date` | tidak | B2 multi-mesin: jendela shift standar (planned production time) & istirahat. |
| `plannedEnd` | body | `date` | tidak |  |
| `breakStart` | body | `date` | tidak |  |
| `breakEnd` | body | `date` | tidak |  |
| `runMachines` | body | `array<object>` | tidak | Mesin paralel dalam run; OEE dihitung per mesin + agregat line. |
| `runMachines[].machineId` | body | `uuid` | ya |  |
| `runMachines[].startAt` | body | `date` | tidak |  |
| `runMachines[].endAt` | body | `date` | tidak |  |
| `shift` | body | `string` | tidak | "1" \| "2" \| "3" |
| `shiftLead` | body | `string` | tidak | kepala shift (teks bebas) |
| `manpowerCount` | body | `number` | tidak |  |
| `goodQty` | body | `number` | tidak | LEGACY — diabaikan |
| `rejectQty` | body | `number` | tidak | LEGACY — diabaikan |
| `downtimes` | body | `array<object>` | tidak |  |
| `downtimes[].machineId` | body | `uuid` | tidak |  |
| `downtimes[].category` | body | `string` | ya |  |
| `downtimes[].reason` | body | `string` | tidak |  |
| `downtimes[].durationMin` | body | `number` | ya |  |
| `machineId` | body | `uuid` | tidak | tidak lagi dipakai untuk compute OEE. |
| `startAt` | body | `date` | tidak |  |
| `endAt` | body | `date` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | Use case: backdated production input where sales already reduced stock. |
| `negativeStockReason` | body | `string` | tidak | Disimpan ke audit log + ditampilkan di Dashboard "Stok Minus Aktif". |

**Contoh pemanggilan**

```json
{
  "tool": "prod_run_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "inputs": [
      {
        "itemId": "<id>",
        "quantity": 1
      }
    ],
    "outputs": [
      {
        "itemId": "<id>",
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
  "confirm": "Edit Data Produksi <id>? Stok, WAC, dan jurnal akan direvisi (non-Admin: masuk antrian persetujuan)."
}
```

**Isi hasil:** Bypass: run hasil edit (200). Non-bypass: 202 {pendingApproval, request}.

**Efek pembukuan/stok:** Cabang bypass (Admin): stok input/output lama dibalik, WAC output dihitung ulang, jurnal lama dibatalkan, stok & jurnal baru diposting (JV-<runNo>-R<n>: DR persediaan output / CR persediaan input; selisih ke CR 5.12 Biaya Konversi Dibebankan atau CR/DR 5.1 HPP). Cabang non-bypass: hanya membuat ApprovalRequest ProductionRunEdit (belum ada efek) - efek terjadi saat disetujui.

**Teks konfirmasi:** Edit Data Produksi {id}? Stok, WAC, dan jurnal akan direvisi (non-Admin: masuk antrian persetujuan).

**Prasyarat**

- Run belum dibatalkan.
- Bila allowNegativeStock=true: capability inventory.negative_stock.

**Error umum**

- 409: sudah ada pengajuan edit Pending untuk run ini
- 400: stok tidak cukup / run sudah dibatalkan
- 403: tidak berwenang bypass validasi stok

**Tool terkait:** [`prod_run_get`](#prod_run_get), [`prod_run_cancel`](#prod_run_cancel)


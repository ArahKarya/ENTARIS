# Toolset: Pengajuan Pembayaran (`pengajuan-pembayaran`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/pengajuan-pembayaran` · 32 tool (read 9, write 11, critical 12)

## Tujuan

Toolset Pengajuan Pembayaran memungkinkan AIRA membantu seluruh siklus permintaan pembayaran internal: karyawan mengajukan reimburse, pembayaran vendor, uang muka, atau perjalanan dinas; atasan, Keuangan, dan direktur menyetujui; Keuangan membayar dari kas/bank; lalu uang muka dipertanggungjawabkan. Toolset ini juga memuat antrean Tagihan EAM (pajak kendaraan, servis, sparepart MR) yang diposting ke akuntansi oleh Keuangan, serta master Jenis Pengajuan. Tool yang membuat draf atau mengajukan bersifat draft-capable; tool keputusan, pembayaran, dan pembatalan bersifat critical karena menggerakkan uang dan jurnal.

## ALUR BISNIS

### Alur bisnis

**Siklus pengajuan** (`PaymentRequest`, nomor `PP-…`):

```
DRAFT --submit--> SUBMITTED (atasan) --> PENDING_FINANCE --> [PENDING_DIRECTOR] --> APPROVED (Siap Dibayar) --pay--> PAID
          (pengaju tanpa atasan aktif: langsung PENDING_FINANCE)
Tiap tahap persetujuan bisa REJECT (REJECTED, final) atau RETURN (REVISION: pengaju edit lalu submit ulang)
Pengaju bisa CANCEL sebelum PAID (CANCELLED). Keuangan bisa cancel-payment (PAID -> APPROVED).
```

Siapa yang memutuskan per tahap:
- `SUBMITTED`: atasan langsung pengaju (snapshot `supervisorId`).
- `PENDING_FINANCE`: user dengan izin `payment_request` edit (Keuangan). Pada tahap ini Keuangan menetapkan akun biaya per baris (`payreq_set_accounts` atau `lineAccounts` saat approve). Saat Keuangan menyetujui, sistem mencari aturan approval aktif documentType `PaymentRequest` dengan `minAmount` tertinggi yang ≤ total; ada → `PENDING_DIRECTOR` (`directorRole` dari aturan), tidak ada → `APPROVED`.
- `PENDING_DIRECTOR`: role dari aturan (atau super-admin).
- Tidak seorang pun, termasuk super-admin, boleh memproses pengajuannya sendiri.

**Langkah AIRA yang umum:** `payreqtype_list` (pilih jenis) → `payreq_create` (draf) → `payreq_update` bila perlu → `payreq_submit` → pemantauan `payreq_get`/`payreq_list scope=approvals` → penyetuju `payreq_approve` / `payreq_reject` / `payreq_return` → Keuangan `payreq_pay`.

**Jenis pengajuan** (`kind`): `REIMBURSEMENT`, `VENDOR_PAYMENT` (butuh `partyId` vendor), `CASH_ADVANCE`, `TRAVEL` (butuh tujuan dan tanggal; baris dirinci per kategori tarif × jumlah), `OTHER`. Jenis dapat mewajibkan lampiran (`requiresAttachment`) dan pertanggungjawaban (`requiresSettlement`).

**Tab / scope daftar:** `mine`, `approvals` (menunggu keputusan saya, termasuk pertanggungjawaban), `payable` (hanya Keuangan), `advances` (uang muka belum dipertanggungjawabkan), `all` (butuh izin `payment_request` view).

**Pertanggungjawaban uang muka** (`settlementStatus` pada pengajuan PAID jenis uang muka/perjalanan yang `requiresSettlement`):

```
OPEN --submit--> SUBMITTED (atasan) --approve--> PENDING_FINANCE --post--> SETTLED
 (tanpa atasan aktif: langsung PENDING_FINANCE)
Atasan atau Keuangan bisa RETURN (REVISION). Keuangan bisa cancel-posting (SETTLED -> PENDING_FINANCE).
```

Langkah: `payreq_settlement_save` (draf realisasi) → `payreq_settlement_submit` → atasan `payreq_settlement_approve` → Keuangan `payreq_settlement_preview` lalu `payreq_settlement_post`. Uang muka yang lebih dari 14 hari sejak dibayar dianggap terlambat (`payreq_advances_summary`).

**Tagihan EAM** (`/payment-requests/eam`, hanya Keuangan): antrean biaya dari modul EAM (jenis `VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST`). `eambill_list`/`eambill_summary` untuk melihat, `eambill_pay` untuk memposting, `eambill_cancel` untuk membatalkan posting. Servis berasal dari impor (`source='IMPORT'`) tidak masuk antrean karena sudah ada di GL. Satu-satunya jalur posting adalah `services/gaFinance.ts` via `gaBillQueue`; alias lama `/api/ga/finance` dan modul `ga_finance` sudah dihapus.

### Aturan posting

| Peristiwa | Debit | Kredit |
|-----------|-------|--------|
| `payreq_pay` jenis biasa (REIMBURSEMENT, VENDOR_PAYMENT, OTHER) | Akun biaya per baris (dikelompokkan per akun) | Kas/Bank 1.1.x yang dipilih |
| `payreq_pay` CASH_ADVANCE / TRAVEL | Uang Muka Karyawan 1.5.6 | Kas/Bank 1.1.x |
| `payreq_cancel_payment` | (void jurnal pembayaran) | (void jurnal pembayaran) |
| `payreq_settlement_post`, realisasi R vs uang muka A | Akun biaya per baris (R) | Uang Muka Karyawan 1.5.6 sebesar min(R, A) |
| R < A (sisa) | Kas/Bank (A−R) | Uang Muka Karyawan 1.5.6 (A−R); karyawan mengembalikan sisa |
| R > A (kurang bayar) | (tidak ada tambahan debit) | Kas/Bank (R−A); perusahaan membayar kekurangan |
| R = A | tanpa baris kas | — |
| `payreq_settlement_cancel_posting` | (void jurnal pertanggungjawaban) | (void jurnal pertanggungjawaban) |
| `eambill_pay` method JOURNAL | Akun beban | Kas/Bank (lunas) |
| `eambill_pay` method PURCHASE_INVOICE | Akun beban | Hutang Usaha 2.1.1 (dilunasi lewat modul Pembayaran) |
| `eambill_cancel` | void jurnal / batalkan faktur | — |

Aturan penting: seluruh jurnal satu transaksi seimbang dan diposting satu jurnal; akun kas/bank tidak boleh sama dengan akun biaya; tahun buku harus terbuka. Posting uang muka mengikuti `kind` jenis (akun 1.5.6), tetapi wajib-tidaknya pertanggungjawaban hanya mengikuti `type.requiresSettlement`; jenis uang muka yang tidak mewajibkan pertanggungjawaban tidak dilacak (bersihkan 1.5.6 lewat jurnal manual). Persetujuan, pengajuan, dan pengembalian TIDAK membuat jurnal; hanya `pay`, `settlement/post`, dan `eambill_pay` yang membuat jurnal.

### Persetujuan

- Mount `/api/payment-requests` tidak punya gate modul: semua user login boleh membuat, melihat pengajuan sendiri, dan (bila berwenang) memutuskan. Izin `payment_request` (edit) menentukan "Keuangan": verifikasi akun, approve tahap Keuangan, bayar, batalkan bayar, posting pertanggungjawaban, seluruh `/eam`. Izin `payment_request` (view) membuka tab "Semua". Default: Admin dan Accountant.
- Tahap atasan memakai relasi supervisor user; tahap direktur memakai aturan approval documentType `PaymentRequest` (dikelola di toolset Persetujuan).
- Pengajuan yang sudah PAID tidak bisa dibatalkan pengaju; Keuangan harus membatalkan pembayaran dulu, dan itu ditolak bila pertanggungjawaban sudah SETTLED atau sedang berjalan.
- Pada AIRA: aksi pengaju (create/update/submit/save settlement) tier draft; keputusan, bayar, batal, dan posting tier critical.

### Jebakan umum

- **Lampiran** (nota/kuitansi) hanya bisa diunggah lewat antarmuka web; jenis yang mewajibkan lampiran gagal di `payreq_submit` bila belum ada.
- **Akun biaya wajib** pada semua baris sebelum `payreq_pay` (kecuali jenis uang muka); "Akun biaya baris N belum diisi" berarti Keuangan harus memanggil `payreq_set_accounts` atau menyertakan `lineAccounts` saat approve. Akun harus akun detail aktif.
- **Status stale**: perubahan status bersamaan menghasilkan "Status pengajuan sudah berubah, muat ulang"; ambil ulang `payreq_get` sebelum mencoba lagi.
- **Self-approval**: pengaju yang juga atasan/Keuangan tetap tidak boleh memutuskan atau membayar pengajuannya sendiri.
- **Alasan wajib** (min 3 karakter) untuk reject, return, cancel-payment, settlement return dan cancel-posting.
- **`payreq_settlement_approve`** hanya untuk tahap atasan; tahap Keuangan diselesaikan dengan `payreq_settlement_post`. Tanggal posting tidak boleh sebelum tanggal bayar uang muka.
- **`payreq_settlement_preview`** adalah POST yang murni baca (tanpa simpan); aman dipanggil otomatis.
- **Akun sistem Uang Muka Karyawan (1.5.6)** harus terpetakan, jika tidak pembayaran/pertanggungjawaban jenis uang muka gagal ("belum dipetakan").
- **Hak `permAction` tool**: tool aksi pengaju sebenarnya terbuka bagi semua user login; field modul `payment_request` pada katalog hanya acuan batas AIRA. Lihat `accessNote` tiap tool.
- **Jenis pengajuan yang sudah dipakai** tidak bisa dihapus; nonaktifkan lewat `payreqtype_update`.

### Peta istilah

| Istilah bisnis | Kode / field |
|----------------|--------------|
| Pengajuan Pembayaran (PP) | `PaymentRequest`, nomor `PP-…` |
| Draf / Menunggu atasan / Menunggu Keuangan / Menunggu direktur | `DRAFT` / `SUBMITTED` / `PENDING_FINANCE` / `PENDING_DIRECTOR` |
| Siap Dibayar / Dibayar | `APPROVED` / `PAID` |
| Ditolak / Perlu Revisi / Dibatalkan | `REJECTED` / `REVISION` / `CANCELLED` |
| Jenis pengajuan | `PaymentRequestType` (`kind`, `requiresAttachment`, `requiresSettlement`) |
| Reimburse / Pembayaran vendor / Uang muka / Perjalanan dinas | `REIMBURSEMENT` / `VENDOR_PAYMENT` / `CASH_ADVANCE` / `TRAVEL` |
| Penerima | `payeeKind` `EMPLOYEE` / `VENDOR`, `payeeName`, `partyId` |
| Rincian biaya | `PaymentRequestLine` (`expenseAccountId`, `category`) |
| Verifikasi Keuangan | `payreq_set_accounts`, izin `payment_request` edit |
| Uang Muka Karyawan | akun sistem 1.5.6 (`EMPLOYEE_ADVANCE`) |
| Pertanggungjawaban uang muka | `settlementStatus` `OPEN` / `SUBMITTED` / `PENDING_FINANCE` / `REVISION` / `SETTLED` |
| Sisa / kurang bayar | mode `RETURN` / `REIMBURSE` (R < A / R > A); `EXACT` bila sama |
| Tagihan EAM | antrean `GaBill` (`VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST`) |
| Pajak kendaraan / STNK / KIR | `VEHICLE_TAX` |
| MR (Permintaan Barang) sparepart | `MATERIAL_REQUEST` |
| Hutang Usaha | akun 2.1.1 |
| Aturan direktur | `ApprovalRule` documentType `PaymentRequest` |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`eambill_cancel`](#eambill_cancel) | critical | tidak | `POST /api/payment-requests/eam/:kind/:id/cancel` |
| [`eambill_list`](#eambill_list) | read | - | `GET /api/payment-requests/eam` |
| [`eambill_pay`](#eambill_pay) | critical | tidak | `POST /api/payment-requests/eam/:kind/:id/pay` |
| [`eambill_summary`](#eambill_summary) | read | - | `GET /api/payment-requests/eam/summary` |
| [`payreq_advances_summary`](#payreq_advances_summary) | read | - | `GET /api/payment-requests/advances/summary` |
| [`payreq_approve`](#payreq_approve) | critical | tidak | `POST /api/payment-requests/:id/approve` |
| [`payreq_attachment_add`](#payreq_attachment_add) | write | ya | `POST /api/payment-requests/:id/attachments/json` |
| [`payreq_attachment_delete`](#payreq_attachment_delete) | write | tidak | `DELETE /api/payment-requests/:id/attachments/:attId` |
| [`payreq_cancel`](#payreq_cancel) | critical | tidak | `POST /api/payment-requests/:id/cancel` |
| [`payreq_cancel_payment`](#payreq_cancel_payment) | critical | tidak | `POST /api/payment-requests/:id/cancel-payment` |
| [`payreq_create`](#payreq_create) | write | ya | `POST /api/payment-requests` |
| [`payreq_get`](#payreq_get) | read | - | `GET /api/payment-requests/:id` |
| [`payreq_list`](#payreq_list) | read | - | `GET /api/payment-requests` |
| [`payreq_meta`](#payreq_meta) | read | - | `GET /api/payment-requests/meta` |
| [`payreq_pay`](#payreq_pay) | critical | tidak | `POST /api/payment-requests/:id/pay` |
| [`payreq_reject`](#payreq_reject) | critical | tidak | `POST /api/payment-requests/:id/reject` |
| [`payreq_return`](#payreq_return) | critical | tidak | `POST /api/payment-requests/:id/return` |
| [`payreq_set_accounts`](#payreq_set_accounts) | write | tidak | `PUT /api/payment-requests/:id/accounts` |
| [`payreq_settlement_approve`](#payreq_settlement_approve) | critical | tidak | `POST /api/payment-requests/:id/settlement/approve` |
| [`payreq_settlement_cancel_posting`](#payreq_settlement_cancel_posting) | critical | tidak | `POST /api/payment-requests/:id/settlement/cancel-posting` |
| [`payreq_settlement_post`](#payreq_settlement_post) | critical | tidak | `POST /api/payment-requests/:id/settlement/post` |
| [`payreq_settlement_preview`](#payreq_settlement_preview) | read | - | `POST /api/payment-requests/:id/settlement/preview` |
| [`payreq_settlement_return`](#payreq_settlement_return) | critical | tidak | `POST /api/payment-requests/:id/settlement/return` |
| [`payreq_settlement_save`](#payreq_settlement_save) | write | ya | `PUT /api/payment-requests/:id/settlement` |
| [`payreq_settlement_submit`](#payreq_settlement_submit) | write | ya | `POST /api/payment-requests/:id/settlement/submit` |
| [`payreq_submit`](#payreq_submit) | write | ya | `POST /api/payment-requests/:id/submit` |
| [`payreq_summary`](#payreq_summary) | read | - | `GET /api/payment-requests/summary` |
| [`payreq_update`](#payreq_update) | write | ya | `PUT /api/payment-requests/:id` |
| [`payreqtype_create`](#payreqtype_create) | write | tidak | `POST /api/payment-request-types` |
| [`payreqtype_delete`](#payreqtype_delete) | write | tidak | `DELETE /api/payment-request-types/:id` |
| [`payreqtype_list`](#payreqtype_list) | read | - | `GET /api/payment-request-types` |
| [`payreqtype_update`](#payreqtype_update) | write | tidak | `PUT /api/payment-request-types/:id` |

## Rincian tool

### eambill_cancel

**Ringkasan:** Membatalkan posting Tagihan EAM: jurnal di-void (JOURNAL) atau faktur pembelian dibatalkan (PURCHASE_INVOICE) sehingga tagihan kembali ke antrean.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya Keuangan: izin payment_request edit pada seluruh endpoint /payment-requests/eam.
- **Handler:** `POST /api/payment-requests/eam/:kind/:id/cancel` (src/routes/paymentRequestEam.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `kind` | path | `string` | ya | Jenis rekaman (nilai valid mengikuti skema/endpoint). |
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "eambill_cancel",
  "args": {
    "kind": "<kind>",
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
  "confirm": "BATALKAN posting Tagihan EAM <kind> <id>?"
}
```

**Isi hasil:** { success, data }.

**Efek pembukuan/stok:** Void jurnal / pembatalan faktur pembelian yang dibuat saat posting; saldo akun kembali. Faktur yang sudah dibayar tidak dapat dibatalkan sebelum pembayaran dibatalkan.

**Teks konfirmasi:** BATALKAN posting Tagihan EAM {kind} {id}?

**Error umum**

- 400: tagihan belum diposting
- 400: faktur sudah dibayar

**Tool terkait:** [`eambill_pay`](#eambill_pay)

### eambill_list

**Ringkasan:** Antrean Tagihan EAM yang menunggu diposting ke akuntansi (pajak kendaraan, servis kendaraan, MR sparepart) beserta yang sudah diposting bila posting=posted/all. Servis berasal dari impor (source=IMPORT) tidak masuk antrean karena sudah ada di GL.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya Keuangan: izin payment_request edit pada seluruh endpoint /payment-requests/eam.
- **Handler:** `GET /api/payment-requests/eam` (src/routes/paymentRequestEam.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `kind` | query | enum: `ALL`, `VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST` | tidak | Jenis tagihan: pajak/STNK/KIR kendaraan, service kendaraan, atau permintaan sparepart (MR). Default ALL. |
| `posting` | query | enum: `pending`, `posted`, `all` | tidak | Status posting; default pending (belum diposting). |
| `search` | query | `string` | tidak | Cari teks pada tagihan. |
| `startDate` | query | `date` | tidak | Tanggal tagihan mulai (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal tagihan sampai (YYYY-MM-DD). |
| `sort` | query | `string` | tidak | Kolom urut. |
| `page` | query | `number` | tidak | Halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 500). |

**Contoh pemanggilan**

```json
{
  "tool": "eambill_list",
  "args": {
    "kind": "ALL",
    "posting": "pending"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: tagihan[] (jenis, id, tanggal, nominal, status posting), total, page, limit }.>"
}
```

**Isi hasil:** { data: tagihan[] (jenis, id, tanggal, nominal, status posting), total, page, limit }.

**Tool terkait:** [`eambill_summary`](#eambill_summary), [`eambill_pay`](#eambill_pay)

### eambill_pay

**Ringkasan:** Memposting satu Tagihan EAM ke akuntansi lewat services/gaFinance: method JOURNAL = jurnal langsung lunas dari kas/bank; method PURCHASE_INVOICE = faktur pembelian ke vendor (dilunasi lewat modul Pembayaran).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya Keuangan: izin payment_request edit pada seluruh endpoint /payment-requests/eam.
- **Handler:** `POST /api/payment-requests/eam/:kind/:id/pay` (src/routes/paymentRequestEam.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `kind` | path | `string` | ya | VEHICLE_TAX \| SERVICE_LOG \| MATERIAL_REQUEST. |
| `id` | path | `string` | ya | ID dokumen EAM sumber. |
| `method` | body | enum: `JOURNAL`, `PURCHASE_INVOICE` | ya | JOURNAL atau PURCHASE_INVOICE. |
| `accountId` | body | `string` | tidak | Akun beban (default per jenis bila kosong). |
| `creditAccountId` | body | `string` | tidak | Akun kas/bank (hanya JOURNAL). |
| `partyId` | body | `string` | tidak | Vendor (wajib untuk PURCHASE_INVOICE). |
| `amount` | body | `number` | tidak | Override nominal (default dari dokumen EAM). |
| `date` | body | `date` | tidak | Tanggal transaksi (default tanggal dokumen). |
| `dueDate` | body | `date` | tidak | Jatuh tempo faktur. |
| `notes` | body | `string` | tidak | Catatan. |

**Contoh pemanggilan**

```json
{
  "tool": "eambill_pay",
  "args": {
    "kind": "<kind>",
    "id": "<id>",
    "method": "JOURNAL"
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
  "confirm": "POSTING Tagihan EAM <kind> <id> dengan metode JOURNAL senilai {amount}?"
}
```

**Isi hasil:** { success, data: hasil posting (jurnal/faktur) }.

**Efek pembukuan/stok:** JOURNAL: DR akun beban (accountId atau default per jenis) / CR Kas/Bank (creditAccountId atau pemetaan default) — lunas. PURCHASE_INVOICE: DR akun beban / CR Hutang Usaha 2.1.1 (butuh partyId vendor), hutang dilunasi kemudian via Pembayaran. Dokumen EAM ditandai sudah diposting.

**Teks konfirmasi:** POSTING Tagihan EAM {kind} {id} dengan metode {method} senilai {amount}?

**Prasyarat**

- Tagihan belum diposting.
- Tahun buku terbuka.
- Vendor ada bila PURCHASE_INVOICE.

**Error umum**

- 400: Jenis tagihan tidak dikenal
- 400: akun debit = akun kredit
- 400: vendor wajib untuk PURCHASE_INVOICE
- 400: sudah diposting

**Tool terkait:** [`eambill_list`](#eambill_list), [`eambill_cancel`](#eambill_cancel)

### eambill_summary

**Ringkasan:** Ringkasan antrean Tagihan EAM: jumlah dan nominal yang belum diposting serta yang cocok dengan filter (badge tab).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya Keuangan: izin payment_request edit pada seluruh endpoint /payment-requests/eam.
- **Handler:** `GET /api/payment-requests/eam/summary` (src/routes/paymentRequestEam.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `kind` | query | enum: `ALL`, `VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST` | tidak | Jenis tagihan: pajak/STNK/KIR kendaraan, service kendaraan, atau permintaan sparepart (MR). Default ALL. |
| `posting` | query | enum: `pending`, `posted`, `all` | tidak | Status posting; default pending (belum diposting). |
| `search` | query | `string` | tidak | Cari teks pada tagihan. |
| `startDate` | query | `date` | tidak | Tanggal tagihan mulai (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal tagihan sampai (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "eambill_summary",
  "args": {
    "kind": "ALL",
    "posting": "pending"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ pendingCount, pendingAmount, matchedCount, matchedAmount }.>"
}
```

**Isi hasil:** { pendingCount, pendingAmount, matchedCount, matchedAmount }.

**Tool terkait:** [`eambill_list`](#eambill_list)

### payreq_advances_summary

**Ringkasan:** Ringkasan uang muka/perjalanan dinas yang sudah dibayar tetapi belum dipertanggungjawabkan: jumlah, total nominal, yang lewat batas (14 hari sejak bayar), dan rincian per karyawan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `view`)
- **Catatan akses:** Keuangan/penampil semua melihat seluruh karyawan; user lain hanya uang muka sendiri.
- **Handler:** `GET /api/payment-requests/advances/summary` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "payreq_advances_summary",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ count, amount, overdueCount, overdueAmount, byEmployee[] }.>"
}
```

**Isi hasil:** { count, amount, overdueCount, overdueAmount, byEmployee[] }.

**Tool terkait:** [`payreq_settlement_save`](#payreq_settlement_save)

### payreq_approve

**Ringkasan:** Menyetujui pengajuan pada tahap sekarang: SUBMITTED → PENDING_FINANCE; PENDING_FINANCE → PENDING_DIRECTOR bila ada aturan PaymentRequest yang cocok ambang nominalnya, selain itu APPROVED (Siap Dibayar); PENDING_DIRECTOR → APPROVED. Pada tahap Keuangan boleh menyertakan lineAccounts (akun biaya per baris).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hak memutuskan bergantung tahap: SUBMITTED = atasan langsung pengaju; PENDING_FINANCE = user dengan izin payment_request edit (Keuangan); PENDING_DIRECTOR = role dari aturan approval PaymentRequest (atau super-admin). Tidak ada yang boleh memproses pengajuannya sendiri.
- **Handler:** `POST /api/payment-requests/:id/approve` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `note` | body | `string` | tidak | Catatan persetujuan (opsional). |
| `lineAccounts` | body | `array<object>` | tidak | Hanya tahap Keuangan: [{id (id baris rincian), expenseAccountId}] untuk menetapkan akun biaya. |
| `lineAccounts[].id` | body | `string` | ya |  |
| `lineAccounts[].expenseAccountId` | body | `string` | ya |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_approve",
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
  "confirm": "SETUJUI Pengajuan Pembayaran <id>? Catatan: {note}"
}
```

**Isi hasil:** Pengajuan dengan status tahap berikutnya.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (pembayaran terjadi di langkah pay). Menentukan direktur penyetuju dan membuat pengajuan siap dibayar.

**Teks konfirmasi:** SETUJUI Pengajuan Pembayaran {id}? Catatan: {note}

**Error umum**

- 400: tidak sedang menunggu persetujuan
- 400: tidak dapat memproses pengajuan sendiri
- 400: bukan atasan/Keuangan/direktur yang berwenang

**Tool terkait:** [`payreq_reject`](#payreq_reject), [`payreq_return`](#payreq_return), [`payreq_set_accounts`](#payreq_set_accounts), [`payreq_pay`](#payreq_pay)

### payreq_attachment_add

**Ringkasan:** Melampirkan SATU berkas (JPG/PNG/WebP/PDF, maks. 5 MB) ke pengajuan yang masih editable (DRAFT/REVISION; scope=settlement untuk pertanggungjawaban). Dua cara: (1) tanpa contentBase64 → salin lampiran dari panel chat Entaris pengguna ini (default: lampiran pada pesan chat saat ini, atau pilih dengan chatAttachmentId); (2) contentBase64+fileName → isi berkas dibawa langsung (batas body MCP 256 KB ≈ 180 KB berkas; berkas lebih besar wajib lewat cara 1). Jenis berkas ditentukan dari isi, bukan nama. Jenis pengajuan yang mewajibkan lampiran (requiresAttachment) baru bisa di-submit setelah ini.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Pengaju, hanya saat pengajuan (atau pertanggungjawaban bila scope=settlement) masih bisa diedit. Lampiran chat harus milik pengguna yang sama.
- **Handler:** `POST /api/payment-requests/:id/attachments/json` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pengajuan (UUID). |
| `fileName` | body | `string` | tidak | Nama berkas (wajib bila contentBase64 diisi; opsional untuk mengganti nama lampiran chat). |
| `contentBase64` | body | `string` | tidak | Isi berkas base64 (tanpa/dengan prefix data:). Maks. ±180 KB karena batas body MCP; kosongkan untuk memakai lampiran panel chat. |
| `mimeType` | body | `string` | tidak | Petunjuk jenis (image/jpeg, image/png, image/webp, application/pdf); ditolak bila tak cocok dengan isi berkas. |
| `chatAttachmentId` | body | `string` | tidak | ID lampiran panel chat milik pengguna ini. Kosong → lampiran pada pesan chat yang sedang berjalan. |
| `scope` | body | `string` | tidak | 'request' (default, bukti pengajuan) atau 'settlement' (bukti pertanggungjawaban). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_attachment_add",
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
  "confirm": "Lampirkan berkas {fileName} ke pengajuan <id>?"
}
```

**Isi hasil:** Metadata lampiran yang tersimpan (id, fileName, mimeType, fileSize, scope).

**Efek pembukuan/stok:** Tidak ada efek GL/stok; berkas tersimpan sebagai lampiran pengajuan.

**Teks konfirmasi:** Lampirkan berkas {fileName} ke pengajuan {id}?

**Error umum**

- 400: Tidak ada lampiran pada pesan chat ini
- 400: Maksimal 10 lampiran per pengajuan
- 400: File tidak dikenali sebagai JPG/PNG/WebP/PDF
- 400: Ukuran file maksimal 5 MB
- 400: pengajuan tidak bisa diedit
- 413: body MCP > 256 KB (pakai lampiran chat)

**Tool terkait:** [`payreq_get`](#payreq_get), [`payreq_submit`](#payreq_submit), [`payreq_attachment_delete`](#payreq_attachment_delete)

### payreq_attachment_delete

**Ringkasan:** Menghapus satu lampiran (nota/kuitansi) dari pengajuan yang masih editable. Hanya metadata/berkas lampiran. Untuk menambah lampiran gunakan payreq_attachment_add; unduh berkas tidak tersedia sebagai tool.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Pengaju, hanya saat pengajuan/pertanggungjawaban masih bisa diedit.
- **Handler:** `DELETE /api/payment-requests/:id/attachments/:attId` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `attId` | path | `string` | ya | ID lampiran. |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_attachment_delete",
  "args": {
    "id": "<id>",
    "attId": "<id>"
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
  "confirm": "Hapus lampiran <id> dari pengajuan <id>?"
}
```

**Isi hasil:** Konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; lampiran dihapus permanen.

**Teks konfirmasi:** Hapus lampiran {attId} dari pengajuan {id}?

**Tool terkait:** [`payreq_get`](#payreq_get)

### payreq_cancel

**Ringkasan:** Pengaju membatalkan pengajuannya selama belum PAID/ditolak/dibatalkan (DRAFT, REVISION, SUBMITTED, PENDING_FINANCE, PENDING_DIRECTOR, APPROVED). Status CANCELLED, final. Alasan opsional (reason).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya pengaju.
- **Handler:** `POST /api/payment-requests/:id/cancel` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | tidak | Alasan pembatalan (maks 1000 karakter). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_cancel",
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
  "confirm": "BATALKAN Pengajuan Pembayaran <id>?"
}
```

**Isi hasil:** Pengajuan berstatus CANCELLED.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (pengajuan belum dibayar). Pengajuan yang sudah PAID tidak bisa dibatalkan di sini: Keuangan harus membatalkan pembayaran dulu.

**Teks konfirmasi:** BATALKAN Pengajuan Pembayaran {id}?

**Error umum**

- 400: hanya pengaju
- 400: sudah dibayar/ditolak/dibatalkan

**Tool terkait:** [`payreq_cancel_payment`](#payreq_cancel_payment)

### payreq_cancel_payment

**Ringkasan:** Keuangan membatalkan pembayaran: jurnal pembayaran di-void dan pengajuan kembali ke APPROVED (Siap Dibayar). Ditolak bila pertanggungjawaban uang muka sudah berjalan/selesai atau tahun buku jurnal sudah ditutup. Alasan wajib.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Keuangan (payment_request edit).
- **Handler:** `POST /api/payment-requests/:id/cancel-payment` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | ya | Alasan (wajib untuk audit). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_cancel_payment",
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
  "confirm": "BATALKAN pembayaran Pengajuan <id>? Jurnal akan di-void. Alasan: <reason>"
}
```

**Isi hasil:** Pengajuan berstatus APPROVED.

**Efek pembukuan/stok:** Membalik jurnal pembayaran (void): akun biaya/Uang Muka Karyawan dan Kas/Bank kembali ke saldo sebelum bayar.

**Teks konfirmasi:** BATALKAN pembayaran Pengajuan {id}? Jurnal akan di-void. Alasan: {reason}

**Error umum**

- 400: belum dibayar
- 400: pertanggungjawaban uang muka sudah berjalan
- 400: tahun buku ditutup

**Tool terkait:** [`payreq_pay`](#payreq_pay)

### payreq_create

**Ringkasan:** Membuat Pengajuan Pembayaran berstatus DRAFT (nomor PP-… otomatis) oleh user login sebagai pengaju. Belum masuk antrean persetujuan sampai di-submit. Jenis TRAVEL memakai tujuan/tanggal/peserta dan rincian per kategori.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Semua user login boleh (tanpa gate modul di mount); hanya pengaju yang bisa mengubah/membatalkan, pengaju dan pihak terkait yang bisa melihat. Catatan: modul payment_request dipakai sebagai acuan dokumentasi/batas AIRA, bukan syarat endpoint.
- **Handler:** `POST /api/payment-requests` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `typeId` | body | `string` | ya | ID jenis pengajuan aktif (payreqtype_list). |
| `costCenterId` | body | `string` | tidak | ID cost center (opsional). |
| `department` | body | `string` | tidak | Departemen pengaju. |
| `payeeKind` | body | enum: `EMPLOYEE`, `VENDOR` | ya | EMPLOYEE = karyawan; VENDOR = pemasok (wajib partyId). |
| `partyId` | body | `string` | tidak | ID vendor bila payeeKind=VENDOR. |
| `payeeName` | body | `string` | ya | Nama penerima. |
| `bankName` | body | `string` | tidak | Nama bank penerima. |
| `bankAccountNo` | body | `string` | tidak | Nomor rekening penerima. |
| `bankAccountHolder` | body | `string` | tidak | Nama pemilik rekening. |
| `purpose` | body | `string` | ya | Keperluan/tujuan (min 3 karakter). |
| `neededBy` | body | `string` | tidak | Tanggal dibutuhkan (YYYY-MM-DD). |
| `travelDestination` | body | `string` | tidak | Tujuan (wajib saat submit jenis TRAVEL). |
| `travelStartDate` | body | `date` | tidak | Tanggal berangkat. |
| `travelEndDate` | body | `date` | tidak | Tanggal pulang. |
| `travelParticipants` | body | `string` | tidak | Peserta perjalanan. |
| `lines` | body | `array<object>` | ya | Rincian biaya: array {description*, amount*, expenseAccountId, costCenterId, expenseDate, category (TRANSPORT\|LODGING\|PER_DIEM\|MEALS\|OTHER hanya jenis TRAVEL), quantity, unitAmount}. Maks 100 baris. |
| `lines[].description` | body | `string` | ya |  |
| `lines[].amount` | body | `number` | ya |  |
| `lines[].expenseAccountId` | body | `string` | tidak |  |
| `lines[].costCenterId` | body | `string` | tidak |  |
| `lines[].expenseDate` | body | `string` | tidak |  |
| `lines[].category` | body | enum: `TRANSPORT`, `LODGING`, `PER_DIEM`, `MEALS`, `OTHER` | tidak | Perjalanan dinas: kategori + tarif × jumlah (amount = quantity × unitAmount). |
| `lines[].quantity` | body | `number` | tidak |  |
| `lines[].unitAmount` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_create",
  "args": {
    "typeId": "<id>",
    "payeeKind": "EMPLOYEE",
    "payeeName": "<payeeName>",
    "purpose": "<purpose>",
    "lines": [
      {
        "description": "<description>",
        "amount": 1
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
  "confirm": "Buat draft Pengajuan Pembayaran \"<purpose>\" untuk <payeeName>?"
}
```

**Isi hasil:** Pengajuan draft (id, number, status DRAFT, totalAmount).

**Efek pembukuan/stok:** Tidak ada efek GL/stok (draft).

**Teks konfirmasi:** Buat draft Pengajuan Pembayaran "{purpose}" untuk {payeeName}?

**Prasyarat**

- Jenis pengajuan aktif.
- Vendor ada bila payeeKind=VENDOR.
- Akun biaya (bila diisi) adalah akun detail aktif.

**Error umum**

- 400: jenis tidak aktif
- 400: pilih vendor
- 400: akun biaya tidak valid

**Tool terkait:** [`payreqtype_list`](#payreqtype_list), [`payreq_submit`](#payreq_submit), [`coa_flat`](akuntansi.md#coa_flat)

### payreq_get

**Ringkasan:** Detail satu pengajuan: header, rincian biaya, lampiran, riwayat tahap (history), jurnal pembayaran, data pertanggungjawaban uang muka, umur uang muka, dan daftar aksi yang boleh dilakukan user saat ini (edit, decide, verify, pay, cancel, cancelPayment, settlement.*).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `view`)
- **Catatan akses:** Semua user login boleh (tanpa gate modul di mount); hanya pengaju yang bisa mengubah/membatalkan, pengaju dan pihak terkait yang bisa melihat. Catatan: modul payment_request dipakai sebagai acuan dokumentasi/batas AIRA, bukan syarat endpoint.
- **Handler:** `GET /api/payment-requests/:id` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_get",
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
  "data": "<Pengajuan lengkap + advanceAge + actions.>"
}
```

**Isi hasil:** Pengajuan lengkap + advanceAge + actions.

**Error umum**

- 404: tidak ditemukan / tidak boleh dilihat

**Tool terkait:** [`payreq_approve`](#payreq_approve), [`payreq_pay`](#payreq_pay)

### payreq_list

**Ringkasan:** Daftar Pengajuan Pembayaran per tab (scope): mine (milik saya, default), approvals (menunggu keputusan saya), payable (siap dibayar, khusus Keuangan), advances (uang muka belum dipertanggungjawabkan), all (semua, perlu izin payment_request view). Filter: status, settlementStatus, typeId, startDate/endDate, search, sort, page, limit (maks 500).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `view`)
- **Catatan akses:** Semua user login boleh (tanpa gate modul di mount); hanya pengaju yang bisa mengubah/membatalkan, pengaju dan pihak terkait yang bisa melihat. Catatan: modul payment_request dipakai sebagai acuan dokumentasi/batas AIRA, bukan syarat endpoint.
- **Handler:** `GET /api/payment-requests` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `scope` | query | enum: `mine`, `approvals`, `payable`, `advances`, `all` | tidak | Tab daftar; default mine. |
| `status` | query | enum: `DRAFT`, `SUBMITTED`, `PENDING_FINANCE`, `PENDING_DIRECTOR`, `APPROVED`, `PAID`, `REJECTED`, `REVISION`, `CANCELLED` | tidak | Filter status pengajuan. |
| `settlementStatus` | query | enum: `OPEN`, `SUBMITTED`, `PENDING_FINANCE`, `REVISION`, `SETTLED` | tidak | Filter status pertanggungjawaban uang muka. |
| `typeId` | query | `string` | tidak | ID jenis pengajuan. |
| `startDate` | query | `date` | tidak | Tanggal pengajuan dibuat mulai (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal pengajuan dibuat sampai (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor, keperluan, penerima, atau nama pengaju. |
| `sort` | query | `string` | tidak | Kolom urut; awalan - = menurun. |
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Baris per halaman (default 25, maks 500). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_list",
  "args": {
    "scope": "mine",
    "status": "DRAFT"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: pengajuan[] (number, status, purpose, payeeName, totalAmount, tipe, pengaju), tota>"
}
```

**Isi hasil:** { data: pengajuan[] (number, status, purpose, payeeName, totalAmount, tipe, pengaju), total, page, limit }.

**Error umum**

- 403: scope all/payable tanpa izin payment_request

**Tool terkait:** [`payreq_get`](#payreq_get), [`payreq_summary`](#payreq_summary)

### payreq_meta

**Ringkasan:** Konteks pengguna untuk form & tab Pengajuan Pembayaran: atasan langsung, rekening/departemen terakhir yang dipakai, apakah user Keuangan/dapat melihat semua/super-admin, badge jumlah antrean persetujuan & siap-bayar, dan ringkasan uang muka milik sendiri yang belum dipertanggungjawabkan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `view`)
- **Catatan akses:** Semua user login boleh (tanpa gate modul di mount); hanya pengaju yang bisa mengubah/membatalkan, pengaju dan pihak terkait yang bisa melihat. Catatan: modul payment_request dipakai sebagai acuan dokumentasi/batas AIRA, bukan syarat endpoint.
- **Handler:** `GET /api/payment-requests/meta` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "payreq_meta",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ openAdvances, overdueDays, me, role, isFinance, canViewAll, isSuperAdmin, lastPayee, bad>"
}
```

**Isi hasil:** { openAdvances, overdueDays, me, role, isFinance, canViewAll, isSuperAdmin, lastPayee, badges }.

**Tool terkait:** [`payreq_list`](#payreq_list), [`payreq_create`](#payreq_create)

### payreq_pay

**Ringkasan:** Keuangan membayar pengajuan berstatus APPROVED (Siap Dibayar): memposting satu jurnal seimbang dari akun kas/bank yang dipilih pada paymentDate dan mengubah status menjadi PAID. Jenis uang muka/perjalanan dinas memunculkan kewajiban pertanggungjawaban bila type.requiresSettlement.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Keuangan (payment_request edit); bukan pengaju.
- **Handler:** `POST /api/payment-requests/:id/pay` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `cashAccountId` | body | `string` | ya | Akun kas/bank sumber dana (akun detail aktif; bukan akun biaya). |
| `paymentDate` | body | `date` | ya | Tanggal bayar (YYYY-MM-DD) di tahun buku terbuka. |
| `reference` | body | `string` | tidak | Referensi/bukti transfer (opsional). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_pay",
  "args": {
    "id": "<id>",
    "cashAccountId": "<id>",
    "paymentDate": "2026-01-31"
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
  "confirm": "BAYAR Pengajuan Pembayaran <id> dari akun <id> tanggal 2026-01-31? Jurnal kas/bank akan diposting."
}
```

**Isi hasil:** Pengajuan berstatus PAID + nomor jurnal pembayaran.

**Efek pembukuan/stok:** Jurnal JV-… (status Submitted): jenis biasa → DR akun biaya per baris (dikelompokkan per akun) / CR Kas/Bank (1.1.x); CASH_ADVANCE & TRAVEL → DR Uang Muka Karyawan (1.5.6) / CR Kas/Bank. Tahun buku harus terbuka. Tidak ada efek stok.

**Teks konfirmasi:** BAYAR Pengajuan Pembayaran {id} dari akun {cashAccountId} tanggal {paymentDate}? Jurnal kas/bank akan diposting.

**Prasyarat**

- Status APPROVED.
- Semua baris sudah punya akun biaya (kecuali jenis uang muka).
- Akun sistem Uang Muka Karyawan terpetakan untuk jenis uang muka.

**Error umum**

- 400: hanya Keuangan
- 400: sudah dibayar
- 400: akun biaya baris N belum diisi
- 400: akun kas sama dengan akun biaya
- 400: tahun buku ditutup

**Tool terkait:** [`payreq_set_accounts`](#payreq_set_accounts), [`payreq_cancel_payment`](#payreq_cancel_payment), [`coa_flat`](akuntansi.md#coa_flat)

### payreq_reject

**Ringkasan:** Menolak pengajuan pada tahap persetujuan (status REJECTED, final). Alasan wajib (min 3 karakter).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hak memutuskan bergantung tahap: SUBMITTED = atasan langsung pengaju; PENDING_FINANCE = user dengan izin payment_request edit (Keuangan); PENDING_DIRECTOR = role dari aturan approval PaymentRequest (atau super-admin). Tidak ada yang boleh memproses pengajuannya sendiri.
- **Handler:** `POST /api/payment-requests/:id/reject` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | ya | Alasan (wajib untuk audit). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_reject",
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
  "confirm": "TOLAK Pengajuan Pembayaran <id>? Alasan: <reason>"
}
```

**Isi hasil:** Pengajuan berstatus REJECTED.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** TOLAK Pengajuan Pembayaran {id}? Alasan: {reason}

**Error umum**

- 400: Alasan wajib diisi (minimal 3 karakter)
- 400: tidak berwenang / pengajuan sendiri

**Tool terkait:** [`payreq_approve`](#payreq_approve), [`payreq_return`](#payreq_return)

### payreq_return

**Ringkasan:** Mengembalikan pengajuan ke pengaju untuk direvisi (status REVISION; pengaju mengedit lalu submit ulang). Alasan wajib (min 3 karakter).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hak memutuskan bergantung tahap: SUBMITTED = atasan langsung pengaju; PENDING_FINANCE = user dengan izin payment_request edit (Keuangan); PENDING_DIRECTOR = role dari aturan approval PaymentRequest (atau super-admin). Tidak ada yang boleh memproses pengajuannya sendiri.
- **Handler:** `POST /api/payment-requests/:id/return` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | ya | Alasan (wajib untuk audit). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_return",
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
  "confirm": "KEMBALIKAN Pengajuan Pembayaran <id> untuk revisi? Alasan: <reason>"
}
```

**Isi hasil:** Pengajuan berstatus REVISION.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** KEMBALIKAN Pengajuan Pembayaran {id} untuk revisi? Alasan: {reason}

**Error umum**

- 400: Alasan wajib diisi
- 400: tidak berwenang / pengajuan sendiri

**Tool terkait:** [`payreq_update`](#payreq_update), [`payreq_submit`](#payreq_submit)

### payreq_set_accounts

**Ringkasan:** Keuangan menetapkan/mengubah akun biaya per baris rincian pada tahap PENDING_FINANCE, PENDING_DIRECTOR atau APPROVED (sebelum dibayar). Akun harus akun detail aktif.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Keuangan (payment_request edit), bukan pengaju.
- **Handler:** `PUT /api/payment-requests/:id/accounts` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `lineAccounts` | body | `array<object>` | ya | Array {id (id baris rincian), expenseAccountId (akun biaya atau null)}. |
| `lineAccounts[].id` | body | `string` | ya |  |
| `lineAccounts[].expenseAccountId` | body | `string` | ya |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_set_accounts",
  "args": {
    "id": "<id>",
    "lineAccounts": [
      {
        "id": "<id>",
        "expenseAccountId": "<id>"
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
  "confirm": "Atur akun biaya [...] baris pada pengajuan <id>?"
}
```

**Isi hasil:** Pengajuan dengan akun biaya terbaru.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; menentukan akun DR jurnal saat dibayar.

**Teks konfirmasi:** Atur akun biaya {lineAccounts} baris pada pengajuan {id}?

**Error umum**

- 400: hanya Keuangan
- 400: tahap tidak sesuai
- 400: akun bukan akun detail aktif

**Tool terkait:** [`coa_flat`](akuntansi.md#coa_flat), [`payreq_approve`](#payreq_approve), [`payreq_pay`](#payreq_pay)

### payreq_settlement_approve

**Ringkasan:** Atasan menyetujui pertanggungjawaban (SUBMITTED → PENDING_FINANCE). Tahap Keuangan TIDAK lewat endpoint ini, tetapi memposting pertanggungjawaban.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Tahap atasan: atasan langsung pengaju (snapshot settlementSupervisor). Tahap Keuangan memakai settlement/post.
- **Handler:** `POST /api/payment-requests/:id/settlement/approve` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `note` | body | `string` | tidak | Catatan persetujuan (opsional). |
| `lineAccounts` | body | `array<object>` | tidak | Finance step only: expense account per line (by line id). |
| `lineAccounts[].id` | body | `string` | ya |  |
| `lineAccounts[].expenseAccountId` | body | `string` | ya |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_approve",
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
  "confirm": "SETUJUI pertanggungjawaban uang muka <id>? Catatan: {note}"
}
```

**Isi hasil:** Pengajuan dengan settlementStatus PENDING_FINANCE.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** SETUJUI pertanggungjawaban uang muka {id}? Catatan: {note}

**Error umum**

- 400: Tahap Keuangan diselesaikan dengan memposting
- 400: bukan atasan yang berwenang / pertanggungjawaban sendiri

**Tool terkait:** [`payreq_settlement_return`](#payreq_settlement_return), [`payreq_settlement_post`](#payreq_settlement_post)

### payreq_settlement_cancel_posting

**Ringkasan:** Keuangan membatalkan posting pertanggungjawaban: jurnal di-void dan settlementStatus kembali PENDING_FINANCE. Ditolak bila tahun buku jurnal sudah ditutup. Alasan wajib.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Keuangan.
- **Handler:** `POST /api/payment-requests/:id/settlement/cancel-posting` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | ya | Alasan (wajib untuk audit). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_cancel_posting",
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
  "confirm": "BATALKAN posting pertanggungjawaban <id>? Alasan: <reason>"
}
```

**Isi hasil:** Pengajuan dengan settlementStatus PENDING_FINANCE.

**Efek pembukuan/stok:** Membalik (void) jurnal pertanggungjawaban: akun biaya, Uang Muka Karyawan 1.5.6 dan kas/bank kembali ke kondisi sebelum posting.

**Teks konfirmasi:** BATALKAN posting pertanggungjawaban {id}? Alasan: {reason}

**Error umum**

- 400: tahun buku jurnal sudah ditutup

**Tool terkait:** [`payreq_settlement_post`](#payreq_settlement_post)

### payreq_settlement_post

**Ringkasan:** Keuangan memverifikasi akun dan memposting pertanggungjawaban uang muka pada settlementDate (tidak boleh sebelum tanggal bayar uang muka). settlementStatus → SETTLED. Bila realisasi ≠ uang muka wajib cashAccountId.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `edit`)
- **Catatan akses:** Keuangan pada tahap PENDING_FINANCE; bukan pengaju.
- **Handler:** `POST /api/payment-requests/:id/settlement/post` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `settlementDate` | body | `date` | ya | Tanggal posting (YYYY-MM-DD); ≥ tanggal bayar dan di tahun buku terbuka. |
| `lineAccounts` | body | `array<object>` | tidak | Opsional [{id, expenseAccountId}]. |
| `lineAccounts[].id` | body | `string` | ya |  |
| `lineAccounts[].expenseAccountId` | body | `string` | ya |  |
| `cashAccountId` | body | `string` | tidak | Wajib bila realisasi ≠ uang muka. |
| `reference` | body | `string` | tidak | Referensi. |
| `note` | body | `string` | tidak | Catatan. |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_post",
  "args": {
    "id": "<id>",
    "settlementDate": "2026-01-31"
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
  "confirm": "POSTING pertanggungjawaban uang muka <id> tanggal 2026-01-31? Jurnal biaya vs Uang Muka Karyawan (1.5.6) akan dibuat."
}
```

**Isi hasil:** Pengajuan SETTLED + jurnal + pratinjau.

**Efek pembukuan/stok:** Satu jurnal seimbang: DR akun biaya per baris realisasi (R) / CR Uang Muka Karyawan 1.5.6 sebesar min(R, A). R < A: tambah DR Kas/Bank (A−R) / CR 1.5.6 (A−R) (karyawan mengembalikan sisa). R > A: tambah CR Kas/Bank (R−A) (perusahaan membayar kekurangan). R = A: tanpa baris kas.

**Teks konfirmasi:** POSTING pertanggungjawaban uang muka {id} tanggal {settlementDate}? Jurnal biaya vs Uang Muka Karyawan (1.5.6) akan dibuat.

**Prasyarat**

- settlementStatus PENDING_FINANCE (sudah disetujui atasan).
- Akun sistem Uang Muka Karyawan terpetakan.

**Error umum**

- 400: pertanggungjawaban belum disetujui atasan
- 400: tanggal sebelum tanggal bayar
- 400: tahun buku ditutup

**Tool terkait:** [`payreq_settlement_preview`](#payreq_settlement_preview), [`payreq_settlement_cancel_posting`](#payreq_settlement_cancel_posting)

### payreq_settlement_preview

**Ringkasan:** Pratinjau (tanpa menyimpan) jurnal pertanggungjawaban: membandingkan realisasi R dengan uang muka A (mode EXACT / RETURN sisa / REIMBURSE kurang bayar) dan baris jurnal DR/CR yang akan terbentuk, dengan akun biaya/kas yang diusulkan Keuangan.

- **Risk / tier:** `read` / Auto (POST murni baca)
- **Roles & izin:** Admin, Accountant (modul `payment_request` / `view`)
- **Catatan akses:** Keuangan pada tahap PENDING_FINANCE.
- **Handler:** `POST /api/payment-requests/:id/settlement/preview` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `lineAccounts` | body | `array<object>` | tidak | Opsional [{id, expenseAccountId}] akun biaya per baris realisasi. |
| `lineAccounts[].id` | body | `string` | ya |  |
| `lineAccounts[].expenseAccountId` | body | `string` | ya |  |
| `cashAccountId` | body | `string` | tidak | Akun kas/bank untuk sisa/kurang bayar bila R ≠ A. |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_preview",
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
  "data": "<Pratinjau: realized, advance, selisih, mode, baris jurnal.>"
}
```

**Isi hasil:** Pratinjau: realized, advance, selisih, mode, baris jurnal.

**Tool terkait:** [`payreq_settlement_post`](#payreq_settlement_post)

### payreq_settlement_return

**Ringkasan:** Atasan atau Keuangan mengembalikan pertanggungjawaban ke pengaju untuk diperbaiki (settlementStatus REVISION). Alasan wajib.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Atasan (tahap SUBMITTED) atau Keuangan (tahap PENDING_FINANCE).
- **Handler:** `POST /api/payment-requests/:id/settlement/return` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `reason` | body | `string` | ya | Alasan (wajib untuk audit). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_return",
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
  "confirm": "KEMBALIKAN pertanggungjawaban uang muka <id>? Alasan: <reason>"
}
```

**Isi hasil:** Pengajuan dengan settlementStatus REVISION.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** KEMBALIKAN pertanggungjawaban uang muka {id}? Alasan: {reason}

**Tool terkait:** [`payreq_settlement_save`](#payreq_settlement_save)

### payreq_settlement_save

**Ringkasan:** Pengaju menyimpan draf pertanggungjawaban uang muka/perjalanan dinas yang sudah dibayar: baris realisasi (uraian, nominal, tanggal, kategori, tautan baris rencana), catatan, dan tenggat. Mengganti semua baris realisasi.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya pengaju uang muka, saat settlementStatus OPEN atau REVISION.
- **Handler:** `PUT /api/payment-requests/:id/settlement` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `note` | body | `string` | tidak | Catatan pengaju. |
| `deadline` | body | `string` | tidak | Tenggat pertanggungjawaban (YYYY-MM-DD). |
| `lines` | body | `array<object>` | ya | Baris realisasi: {description*, amount*, expenseDate, category, plannedLineId, expenseAccountId}; maks 100. |
| `lines[].description` | body | `string` | ya |  |
| `lines[].amount` | body | `number` | ya |  |
| `lines[].expenseDate` | body | `string` | tidak |  |
| `lines[].category` | body | enum: `TRANSPORT`, `LODGING`, `PER_DIEM`, `MEALS`, `OTHER` | tidak |  |
| `lines[].plannedLineId` | body | `string` | tidak |  |
| `lines[].expenseAccountId` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_save",
  "args": {
    "id": "<id>",
    "lines": [
      {
        "description": "<description>",
        "amount": 1
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
  "confirm": "Simpan draf pertanggungjawaban uang muka <id> ([...] baris)?"
}
```

**Isi hasil:** Pengajuan dengan baris realisasi tersimpan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (draf).

**Teks konfirmasi:** Simpan draf pertanggungjawaban uang muka {id} ({lines} baris)?

**Prasyarat**

- Pengajuan berstatus PAID dengan settlementStatus OPEN/REVISION.

**Error umum**

- 400: hanya pengaju
- 400: hanya untuk uang muka yang sudah dibayar
- 400: hanya bisa diubah saat Belum Dipertanggungjawabkan/Perlu Revisi

**Tool terkait:** [`payreq_settlement_submit`](#payreq_settlement_submit), [`payreq_advances_summary`](#payreq_advances_summary)

### payreq_settlement_submit

**Ringkasan:** Pengaju mengajukan pertanggungjawaban: settlementStatus → SUBMITTED (menunggu atasan) atau langsung PENDING_FINANCE bila tidak ada atasan aktif. Butuh minimal satu baris realisasi dengan total > 0. Jenis yang mewajibkan lampiran (requiresAttachment) ditolak sebelum ada lampiran: lampirkan dulu dengan payreq_attachment_add.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya pengaju.
- **Handler:** `POST /api/payment-requests/:id/settlement/submit` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_settlement_submit",
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
  "confirm": "Ajukan pertanggungjawaban uang muka <id> ke persetujuan?"
}
```

**Isi hasil:** Pengajuan dengan settlementStatus SUBMITTED / PENDING_FINANCE.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya masuk antrean persetujuan pertanggungjawaban.

**Teks konfirmasi:** Ajukan pertanggungjawaban uang muka {id} ke persetujuan?

**Tool terkait:** [`payreq_attachment_add`](#payreq_attachment_add), [`payreq_settlement_approve`](#payreq_settlement_approve), [`payreq_settlement_save`](#payreq_settlement_save)

### payreq_submit

**Ringkasan:** Mengajukan draft/revisi ke persetujuan: status SUBMITTED (menunggu atasan langsung) atau langsung PENDING_FINANCE bila pengaju tidak punya atasan aktif. Memvalidasi minimal satu rincian, total > 0, lampiran bila jenis mewajibkan, dan data perjalanan dinas.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya pengaju.
- **Handler:** `POST /api/payment-requests/:id/submit` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_submit",
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
  "confirm": "Ajukan Pengajuan Pembayaran <id> ke persetujuan?"
}
```

**Isi hasil:** Pengajuan dengan status SUBMITTED / PENDING_FINANCE.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya masuk antrean persetujuan (notifikasi ke penyetuju).

**Teks konfirmasi:** Ajukan Pengajuan Pembayaran {id} ke persetujuan?

**Prasyarat**

- Status DRAFT atau REVISION.
- Lampiran terunggah bila jenis mewajibkan (unggah lewat antarmuka web).

**Error umum**

- 400: tambahkan minimal satu rincian
- 400: jenis wajib lampiran
- 409: status sudah berubah

**Tool terkait:** [`payreq_update`](#payreq_update), [`payreq_approve`](#payreq_approve)

### payreq_summary

**Ringkasan:** KPI jumlah dan total nominal per status untuk scope + filter yang sama dengan daftar, plus badge tab (antrean persetujuan, siap dibayar).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `view`)
- **Catatan akses:** Semua user login boleh (tanpa gate modul di mount); hanya pengaju yang bisa mengubah/membatalkan, pengaju dan pihak terkait yang bisa melihat. Catatan: modul payment_request dipakai sebagai acuan dokumentasi/batas AIRA, bukan syarat endpoint.
- **Handler:** `GET /api/payment-requests/summary` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `scope` | query | enum: `mine`, `approvals`, `payable`, `advances`, `all` | tidak | Tab; default mine. |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_summary",
  "args": {
    "scope": "mine"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Ringkasan per status + badges.>"
}
```

**Isi hasil:** Ringkasan per status + badges.

**Tool terkait:** [`payreq_list`](#payreq_list)

### payreq_update

**Ringkasan:** Mengubah isi pengajuan (header + seluruh rincian diganti) saat masih DRAFT atau Perlu Revisi. Body sama dengan pembuatan.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `payment_request` / `edit`)
- **Catatan akses:** Hanya pengaju, dan hanya saat status DRAFT atau REVISION.
- **Handler:** `PUT /api/payment-requests/:id` (src/routes/paymentRequests.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `typeId` | body | `string` | ya | ID jenis pengajuan pembayaran. |
| `costCenterId` | body | `string` | tidak |  |
| `department` | body | `string` | tidak |  |
| `payeeKind` | body | enum: `EMPLOYEE`, `VENDOR` | ya | Jenis penerima: karyawan atau vendor. |
| `partyId` | body | `string` | tidak | ID pelanggan/vendor (Party). |
| `payeeName` | body | `string` | ya | Nama penerima pembayaran. |
| `bankName` | body | `string` | tidak |  |
| `bankAccountNo` | body | `string` | tidak |  |
| `bankAccountHolder` | body | `string` | tidak |  |
| `purpose` | body | `string` | ya | Tujuan/keperluan pembayaran. |
| `neededBy` | body | `string` | tidak |  |
| `travelDestination` | body | `string` | tidak | Hanya dipakai untuk jenis TRAVEL (diabaikan untuk jenis lain). |
| `travelStartDate` | body | `date` | tidak |  |
| `travelEndDate` | body | `date` | tidak |  |
| `travelParticipants` | body | `string` | tidak |  |
| `lines` | body | `array<object>` | ya | Rincian biaya: array {description*, amount*, expenseAccountId, costCenterId, expenseDate, category (TRANSPORT\|LODGING\|PER_DIEM\|MEALS\|OTHER hanya jenis TRAVEL), quantity, unitAmount}. Maks 100 baris. |
| `lines[].description` | body | `string` | ya |  |
| `lines[].amount` | body | `number` | ya |  |
| `lines[].expenseAccountId` | body | `string` | tidak |  |
| `lines[].costCenterId` | body | `string` | tidak |  |
| `lines[].expenseDate` | body | `string` | tidak |  |
| `lines[].category` | body | enum: `TRANSPORT`, `LODGING`, `PER_DIEM`, `MEALS`, `OTHER` | tidak | Perjalanan dinas: kategori + tarif × jumlah (amount = quantity × unitAmount). |
| `lines[].quantity` | body | `number` | tidak |  |
| `lines[].unitAmount` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreq_update",
  "args": {
    "id": "<id>",
    "typeId": "<id>",
    "payeeKind": "EMPLOYEE",
    "payeeName": "<payeeName>",
    "purpose": "<purpose>",
    "lines": [
      {
        "description": "<description>",
        "amount": 1
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
  "confirm": "Simpan perubahan Pengajuan Pembayaran <id>?"
}
```

**Isi hasil:** Pengajuan setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Simpan perubahan Pengajuan Pembayaran {id}?

**Error umum**

- 400: hanya pengaju
- 400: hanya bisa diubah saat Draf/Perlu Revisi

**Tool terkait:** [`payreq_create`](#payreq_create), [`payreq_submit`](#payreq_submit)

### payreqtype_create

**Ringkasan:** Membuat jenis pengajuan baru. kind menentukan akun debit saat dibayar (CASH_ADVANCE/TRAVEL → Uang Muka Karyawan 1.5.6, lainnya → akun biaya); requiresSettlement menentukan wajib pertanggungjawaban.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `POST /api/payment-request-types` (src/routes/paymentRequestTypes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode unik huruf besar/angka/_/- (2-20). |
| `name` | body | `string` | ya | Nama. |
| `kind` | body | enum: `REIMBURSEMENT`, `VENDOR_PAYMENT`, `CASH_ADVANCE`, `TRAVEL`, `OTHER` | ya | REIMBURSEMENT \| VENDOR_PAYMENT \| CASH_ADVANCE \| TRAVEL \| OTHER. |
| `description` | body | `string` | tidak | Keterangan. |
| `defaultExpenseAccountId` | body | `string` | tidak | Akun biaya default (akun detail aktif). |
| `requiresAttachment` | body | `boolean` | tidak | Wajib lampiran saat submit. |
| `requiresSettlement` | body | `boolean` | tidak | Wajib pertanggungjawaban setelah dibayar. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `sortOrder` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreqtype_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "kind": "REIMBURSEMENT"
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
  "confirm": "Buat jenis pengajuan <code> - <name> (REIMBURSEMENT)?"
}
```

**Isi hasil:** Jenis yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; master jenis pengajuan.

**Teks konfirmasi:** Buat jenis pengajuan {code} - {name} ({kind})?

**Error umum**

- 400: Kode jenis pengajuan sudah dipakai
- 400: akun biaya default harus akun detail aktif

**Tool terkait:** [`payreqtype_list`](#payreqtype_list)

### payreqtype_delete

**Ringkasan:** Menghapus jenis pengajuan yang belum pernah dipakai; jenis yang sudah dipakai harus dinonaktifkan (lewat payreqtype_update isActive=false).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `DELETE /api/payment-request-types/:id` (src/routes/paymentRequestTypes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "payreqtype_delete",
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
  "confirm": "HAPUS jenis pengajuan <id>?"
}
```

**Isi hasil:** { ok: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** HAPUS jenis pengajuan {id}?

**Error umum**

- 400: Jenis ini sudah dipakai N pengajuan

**Tool terkait:** [`payreqtype_update`](#payreqtype_update)

### payreqtype_list

**Ringkasan:** Daftar jenis pengajuan (kode, nama, kind REIMBURSEMENT/VENDOR_PAYMENT/CASH_ADVANCE/TRAVEL/OTHER, akun biaya default, wajib lampiran, wajib pertanggungjawaban, aktif). all=1 menyertakan jenis nonaktif.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `settings` / `view`)
- **Catatan akses:** GET terbuka bagi semua user login (requireWrite settings); tulis butuh izin settings edit (Admin).
- **Handler:** `GET /api/payment-request-types` (src/routes/paymentRequestTypes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `all` | query | `boolean` | tidak | 1/true = termasuk jenis nonaktif. |

**Contoh pemanggilan**

```json
{
  "tool": "payreqtype_list",
  "args": {
    "all": true
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array jenis + jumlah pengajuan terkait.>"
}
```

**Isi hasil:** Array jenis + jumlah pengajuan terkait.

**Tool terkait:** [`payreq_create`](#payreq_create), [`payreqtype_create`](#payreqtype_create)

### payreqtype_update

**Ringkasan:** Mengubah jenis pengajuan (body lengkap seperti pembuatan). Pengajuan yang sudah ada tidak berubah jurnalnya; jenis nonaktif tidak bisa dipakai pengajuan baru.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `PUT /api/payment-request-types/:id` (src/routes/paymentRequestTypes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `kind` | body | enum: `REIMBURSEMENT`, `VENDOR_PAYMENT`, `CASH_ADVANCE`, `TRAVEL`, `OTHER` | ya | Jenis rekaman (nilai valid mengikuti skema/endpoint). |
| `description` | body | `string` | tidak | Keterangan. |
| `defaultExpenseAccountId` | body | `string` | tidak |  |
| `requiresAttachment` | body | `boolean` | tidak |  |
| `requiresSettlement` | body | `boolean` | tidak |  |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `sortOrder` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "payreqtype_update",
  "args": {
    "id": "<id>",
    "code": "<code>",
    "name": "<name>",
    "kind": "REIMBURSEMENT"
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
  "confirm": "Ubah jenis pengajuan <id> (<code>)?"
}
```

**Isi hasil:** Jenis setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah jenis pengajuan {id} ({code})?

**Error umum**

- 400: kode sudah dipakai

**Tool terkait:** [`payreqtype_list`](#payreqtype_list)


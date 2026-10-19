# Toolset: Persetujuan (`persetujuan`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/persetujuan` · 14 tool (read 6, write 2, critical 6)

## Tujuan

Toolset Persetujuan memberi AIRA akses ke antrian approval Entaris: melihat pengajuan yang menunggu keputusan, memeriksa perbandingan sebelum/sesudah, memutuskan (setujui, tolak, minta revisi), mengajukan ulang setelah revisi, dan mengelola aturan approval. Persetujuan di sini adalah gerbang "approve-before-effect": dokumen penting BELUM dibuat sampai disetujui, sehingga keputusan menyetujui langsung memicu posting stok dan jurnal. Karena itu tool keputusan bertier critical dan hanya untuk pemegang capability `approval.decide`. Persetujuan Pengajuan Pembayaran (atasan, Keuangan, direktur) punya alur sendiri di toolset Pengajuan Pembayaran.

## ALUR BISNIS

### Alur bisnis

**Siapa yang digerbang.** `needsApproval(role)` bernilai true bagi role TANPA capability `approval.bypass` (default hanya Admin yang punya). Jadi saat Accountant/StaffProduksi membuat dokumen berikut, dokumennya tidak dibuat; payload disimpan di `ApprovalRequest` berstatus `Pending`:

| documentType | Dokumen | Dieksekusi saat approve |
|--------------|---------|-------------------------|
| `PurchaseInvoice` | Invoice Pembelian | Faktur dibuat + posting GL (dan stok bila standalone) |
| `ProductionRun` | Data Produksi | Produksi diposting (stok bahan/hasil, WAC) |
| `SalesReturn` | Retur Penjualan | Retur diposting (stok masuk, pembalikan penjualan/HPP) |
| `DeliveryOrder` | Surat Jalan | DO dibuat (stok keluar + HPP) |
| `PurchaseOrder` | PO (tahap 2) | Status Draf menjadi Submitted, tanpa GL |
| `ProductionRunEdit` | Edit produksi yang sudah diposting | `editProductionRunInTx` |
| `PurchaseInvoiceRevisePrice` | Revisi harga invoice pembelian | `revisePurchaseInvoiceInTx` |

Dokumen dibuat dengan pengaju sebagai pembuatnya (audit menunjuk si penginput), bukan penyetuju.

**Status pengajuan (`ApprovalRequest.status`).**
`Pending` → `Approved` (dokumen dieksekusi), `Rejected` (final), atau `NeedsRevision` (bisa kembali ke `Pending` lewat `appr_resubmit`). Hanya pengajuan `Pending` yang bisa diputuskan; yang sudah diproses ditolak dengan "Pengajuan sudah diproses".

**Jalur keputusan (butuh capability `approval.decide`).**
1. `appr_requests_list` / `appr_request_get` untuk melihat antrian dan payload; `appr_request_context` untuk info pendukung (STT sumber, lampiran).
2. Untuk tipe edit, `appr_request_get` menyertakan `comparison` (sebelum/sesudah). Payload adalah body asli ditambah `_before` (snapshot untuk perbandingan, dibuang sebelum validasi).
3. `appr_approve` mengeksekusi dokumen; `appr_reject` menolak final; `appr_request_revision` meminta revisi (alasan WAJIB).
4. Pengaju memperbaiki lalu memanggil `appr_resubmit` (PUT; hanya `PurchaseInvoice` dan `ProductionRun`).

**Aturan approval (`ApprovalRule`).** `documentType` + `minAmount` + `requiredRole`. Dipakai oleh `appr_check` dan `appr_request_create` (jalur generik), serta tahap direktur Pengajuan Pembayaran (documentType `PaymentRequest`; aturan aktif dengan `minAmount` tertinggi yang ≤ total menang). Mengelola aturan butuh `approval.decide`.

**Penanda status dokumen.** `appr_pending` (documentType edit + documentId) menjawab apakah dokumen punya pengajuan edit Pending, dipakai untuk badge dan mengunci tombol edit. Hanya satu pengajuan Pending per target (409 bila ganda).

### Aturan posting

`appr_approve` sendiri tidak punya jurnal tetap; efeknya mengikuti dokumen yang dieksekusi:
- Invoice Pembelian dari STT: DR Hutang Belum Tagih 2.1.5 (+/- Selisih Harga Pembelian 5.11) / CR Hutang Usaha 2.1.1; stok tidak dibuat ulang. Standalone/legacy: DR Persediaan 1.4.0 / CR Hutang Usaha 2.1.1.
- Produksi: stok bahan keluar dan hasil masuk dengan WAC; tanpa jurnal penjualan.
- Retur penjualan dan Surat Jalan: pergerakan stok dengan HPP.
- PO, `appr_reject`, `appr_request_revision`, `appr_resubmit`, `appr_request_create`, dan semua tool aturan: tidak ada efek GL/stok.

Untuk produksi yang berasal dari draf (`production_run_drafts`): approve membuat run dan menandai draf Posted; reject atau minta-revisi mengembalikan draf ke Draft dengan catatan (`lastError`) dan pengajuan menjadi Rejected.

### Persetujuan

- Capability `approval.decide`: memutuskan dan mengelola aturan. `approval.view_all`: melihat seluruh antrian (tanpa itu hanya pengajuan milik sendiri; pengajuan orang lain terlihat 404). `approval.bypass`: lolos gerbang (dokumen dibuat langsung).
- Modul RBAC `approvals` (view/edit) menjadi syarat semua endpoint di mount ini. Akibatnya Viewer tidak bisa memanggil endpoint apa pun di sini.
- Menambah aksi finansial baru pada dokumen yang sudah ada harus melewati `needsApproval` dan tipe edit baru, bukan hanya `requireCap`.
- Tipe edit tidak bisa "Minta Edit"/resubmit; hanya `PurchaseInvoice` dan `ProductionRun` yang bisa diajukan ulang.
- Pengajuan dari agen (MCP) bertipe `ai_tool:<nama>`: payload `{tool,args,handler,confirm,actor,via:'mcp'}`. Saat disetujui, panggilan tersimpan dijalankan lewat handler aslinya sebagai **pengaju** (RBAC + gate normal + jejak audit `via=mcp`); bila handler menolak, pengajuan kembali Pending dengan `payload.lastError`. Ditolak = tidak ada efek.

### Jebakan umum

- **Approve = posting nyata.** Periksa `appr_request_get` (payload dan comparison) sebelum `appr_approve`; kegagalan eksekusi (stok kurang, periode tertutup) mengembalikan 400 dan pengajuan tetap Pending.
- **`appr_request_revision` pada produksi dari draf** menghasilkan status Rejected, bukan NeedsRevision, karena draf yang dikembalikan menjadi sumber perbaikan.
- **`appr_rule_update`** menyimpan semua field dari body; field yang tidak dikirim dapat menimpa nilai dengan kosong. Kirim lengkap.
- **`appr_request_create`** hanya membuat pengajuan jika ada aturan aktif yang cocok (jika tidak: `required:false`); ia tidak membawa payload dokumen. Jalur normal dibuat otomatis dari endpoint dokumen.
- **`GET /approvals/check`** hanya menjawab apakah aturan ada; gerbang sebenarnya untuk 4 tipe dokumen ditentukan role pengaju, bukan nominal.
- **Aturan approval adalah kontrol internal**; mengubahnya melonggarkan atau mengetatkan persetujuan semua dokumen/pengajuan berikutnya. Diklasifikasi critical.

### Peta istilah

| Istilah bisnis | Kode / field |
|----------------|--------------|
| Pengajuan approval | `ApprovalRequest` (`documentType`, `documentId`, `documentNumber`, `amount`, `payload`) |
| Menunggu persetujuan | status `Pending` |
| Disetujui / Ditolak | `Approved` / `Rejected` |
| Perlu revisi | `NeedsRevision` |
| Minta Edit | tipe `ProductionRunEdit`, `PurchaseInvoiceRevisePrice` |
| Perbandingan sebelum/sesudah | `comparison`, kunci `_before` pada payload |
| Aturan approval | `ApprovalRule` (`minAmount`, `requiredRole`, `isActive`) |
| Lewati antrian | capability `approval.bypass` |
| Lihat semua pengajuan | capability `approval.view_all` |
| Putuskan pengajuan | capability `approval.decide` |
| Draf produksi | `production_run_drafts`, `DPR-YYYYMM-NNNN` |
| STT / BPB | Surat Terima Timbang / Bukti Penerimaan Barang (`GoodsReceipt`) |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`appr_approve`](#appr_approve) | critical | tidak | `POST /api/approvals/requests/:id/approve` |
| [`appr_check`](#appr_check) | read | - | `GET /api/approvals/check` |
| [`appr_pending`](#appr_pending) | read | - | `GET /api/approvals/pending` |
| [`appr_reject`](#appr_reject) | critical | tidak | `POST /api/approvals/requests/:id/reject` |
| [`appr_request_context`](#appr_request_context) | read | - | `GET /api/approvals/requests/:id/context` |
| [`appr_request_create`](#appr_request_create) | write | ya | `POST /api/approvals/requests` |
| [`appr_request_get`](#appr_request_get) | read | - | `GET /api/approvals/requests/:id` |
| [`appr_request_revision`](#appr_request_revision) | critical | tidak | `POST /api/approvals/requests/:id/request-revision` |
| [`appr_requests_list`](#appr_requests_list) | read | - | `GET /api/approvals/requests` |
| [`appr_resubmit`](#appr_resubmit) | write | ya | `PUT /api/approvals/requests/:id/resubmit` |
| [`appr_rule_create`](#appr_rule_create) | critical | tidak | `POST /api/approvals/rules` |
| [`appr_rule_delete`](#appr_rule_delete) | critical | tidak | `DELETE /api/approvals/rules/:id` |
| [`appr_rule_update`](#appr_rule_update) | critical | tidak | `PUT /api/approvals/rules/:id` |
| [`appr_rules_list`](#appr_rules_list) | read | - | `GET /api/approvals/rules` |

## Rincian tool

### appr_approve

**Ringkasan:** Menyetujui pengajuan Pending dan MENJALANKAN dokumennya dari payload dengan pengaju sebagai pembuat: dokumen baru dibuat saat ini (approve-before-effect). Catatan opsional (notes).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `POST /api/approvals/requests/:id/approve` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `notes` | body | `string` | tidak | Catatan persetujuan. |

**Contoh pemanggilan**

```json
{
  "tool": "appr_approve",
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
  "confirm": "SETUJUI pengajuan <id> dan jalankan dokumennya? (efek posting sesuai tipe dokumen)"
}
```

**Isi hasil:** { ok, status: "Approved", docNumber, documentType }.

**Efek pembukuan/stok:** Tergantung documentType: PurchaseInvoice → faktur pembelian dibuat+posting (DR Hutang Belum Tagih 2.1.5 / selisih 5.11 / CR Hutang Usaha 2.1.1; atau DR Persediaan 1.4.0 / CR 2.1.1 bila standalone); ProductionRun → produksi diposting (stok bahan keluar, stok hasil masuk, WAC/HPP); SalesReturn → retur (stok masuk + pembalikan penjualan/HPP); DeliveryOrder → surat jalan (stok keluar + HPP); PurchaseOrder → status Draft→Submitted tanpa GL; ProductionRunEdit / PurchaseInvoiceRevisePrice → edit/revisi dieksekusi (koreksi stok/GL). Tipe ai_tool:<nama> (permintaan agen via MCP) → panggilan tersimpan dijalankan sebagai PENGAJU lewat handler aslinya (efek = efek tool tersebut; bila handler menolak, pengajuan kembali Pending).

**Teks konfirmasi:** SETUJUI pengajuan {id} dan jalankan dokumennya? (efek posting sesuai tipe dokumen)

**Prasyarat**

- Capability approval.decide.
- Pengajuan berstatus Pending.

**Error umum**

- 400: Pengajuan sudah diproses
- 400: gagal eksekusi dokumen (mis. stok tidak cukup, periode ditutup)

**Tool terkait:** [`appr_request_get`](#appr_request_get), [`appr_reject`](#appr_reject), [`appr_request_revision`](#appr_request_revision)

### appr_check

**Ringkasan:** Mengecek apakah dokumen bertipe documentType dengan nominal amount memerlukan approval, berdasarkan aturan aktif dengan ambang tertinggi yang terpenuhi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `view`)
- **Handler:** `GET /api/approvals/check` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `documentType` | query | `string` | ya | Tipe dokumen (mis. PurchaseInvoice, PaymentRequest). |
| `amount` | query | `number` | ya | Nominal dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "appr_check",
  "args": {
    "documentType": "<documentType>",
    "amount": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ required: boolean, rule }.>"
}
```

**Isi hasil:** { required: boolean, rule }.

**Tool terkait:** [`appr_rules_list`](#appr_rules_list)

### appr_pending

**Ringkasan:** Memeriksa apakah sebuah dokumen sedang punya pengajuan edit yang Pending (untuk badge "Menunggu persetujuan" dan mengunci tombol edit). Hanya untuk tipe edit ProductionRunEdit atau PurchaseInvoiceRevisePrice.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `view`)
- **Handler:** `GET /api/approvals/pending` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `documentType` | query | enum: `ProductionRunEdit`, `PurchaseInvoiceRevisePrice` | ya | ProductionRunEdit atau PurchaseInvoiceRevisePrice. |
| `documentId` | query | `string` | ya | ID dokumen target (production run / purchase invoice). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_pending",
  "args": {
    "documentType": "ProductionRunEdit",
    "documentId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ pending: { id, createdAt } | null }.>"
}
```

**Isi hasil:** { pending: { id, createdAt } | null }.

**Error umum**

- 400: documentType/documentId tidak valid

**Tool terkait:** [`appr_requests_list`](#appr_requests_list)

### appr_reject

**Ringkasan:** Menolak pengajuan Pending (status Rejected, final). Dokumen tidak dibuat. Untuk produksi dari draft, draft dikembalikan ke status Draft dengan catatan; PO kembali ke Draf. Pengaju diberi notifikasi.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `POST /api/approvals/requests/:id/reject` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `notes` | body | `string` | tidak | Alasan penolakan (sangat disarankan). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_reject",
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
  "confirm": "TOLAK pengajuan <id>? Alasan: {notes}"
}
```

**Isi hasil:** { ok, status: "Rejected" }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (dokumen tidak pernah dibuat).

**Teks konfirmasi:** TOLAK pengajuan {id}? Alasan: {notes}

**Prasyarat**

- Capability approval.decide.
- Pengajuan berstatus Pending.

**Tool terkait:** [`appr_approve`](#appr_approve), [`appr_request_revision`](#appr_request_revision)

### appr_request_context

**Ringkasan:** Info pendukung dialog approval: untuk Invoice Pembelian, STT sumber per baris (nomor, tanggal, mobil, supir, harga terkunci) serta lampiran pengajuan dan lampiran STT.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `view`)
- **Handler:** `GET /api/approvals/requests/:id/context` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_request_context",
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
  "data": "<Daftar STT sumber per baris + lampiran terkait.>"
}
```

**Isi hasil:** Daftar STT sumber per baris + lampiran terkait.

**Tool terkait:** [`appr_request_get`](#appr_request_get)

### appr_request_create

**Ringkasan:** Membuat pengajuan approval generik untuk dokumen yang sudah ada (documentType, documentId, documentNumber, amount). Hanya dibuat bila ada aturan aktif yang cocok (jika tidak: required=false). Tidak ada payload dokumen; tidak menjalankan dokumen apa pun saat dibuat. Jalur utama (invoice pembelian, produksi, retur, surat jalan) membuat pengajuan otomatis dari endpoint dokumennya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `edit`)
- **Handler:** `POST /api/approvals/requests` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `documentType` | body | `string` | ya | Tipe dokumen. |
| `documentId` | body | `string` | tidak | ID dokumen. |
| `documentNumber` | body | `string` | tidak | Nomor dokumen. |
| `amount` | body | `number` | ya | Nominal dokumen untuk mencocokkan ambang aturan. |

**Contoh pemanggilan**

```json
{
  "tool": "appr_request_create",
  "args": {
    "documentType": "<documentType>",
    "amount": 1
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
  "confirm": "Ajukan approval <documentType> {documentNumber} senilai 1?"
}
```

**Isi hasil:** { required: true, request } atau { required: false }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya antrian persetujuan berstatus Pending.

**Teks konfirmasi:** Ajukan approval {documentType} {documentNumber} senilai {amount}?

**Error umum**

- 400: sudah ada request approval yang pending

**Tool terkait:** [`appr_check`](#appr_check), [`appr_requests_list`](#appr_requests_list)

### appr_request_get

**Ringkasan:** Detail satu pengajuan approval beserta payload dan objek comparison (sebelum/sesudah untuk tipe edit ProductionRunEdit & PurchaseInvoiceRevisePrice).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `view`)
- **Catatan akses:** Pengajuan orang lain hanya terlihat bila punya capability approval.view_all (selain itu 404).
- **Handler:** `GET /api/approvals/requests/:id` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_request_get",
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
  "data": "<Pengajuan + comparison.>"
}
```

**Isi hasil:** Pengajuan + comparison.

**Error umum**

- 404: tidak ditemukan / bukan milik Anda

**Tool terkait:** [`appr_request_context`](#appr_request_context), [`appr_approve`](#appr_approve)

### appr_request_revision

**Ringkasan:** Meminta pengaju memperbaiki pengajuan: status NeedsRevision (dapat dibalik lewat resubmit); alasan (notes) WAJIB. Dokumen tidak dibuat. Untuk produksi dari draft, draft dikembalikan ke Draft dan pengajuan menjadi Rejected.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `POST /api/approvals/requests/:id/request-revision` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `notes` | body | `string` | ya | Alasan revisi (wajib). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_request_revision",
  "args": {
    "id": "<id>",
    "notes": "<notes>"
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
  "confirm": "Minta revisi pengajuan <id>: <notes>"
}
```

**Isi hasil:** { ok, status: "NeedsRevision" | "Rejected" (produksi dari draft) }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Minta revisi pengajuan {id}: {notes}

**Error umum**

- 400: Alasan revisi wajib diisi

**Tool terkait:** [`appr_resubmit`](#appr_resubmit), [`appr_approve`](#appr_approve)

### appr_requests_list

**Ringkasan:** Daftar pengajuan approval (maks 100, Pending lebih dulu). Filter status: Pending, Approved, Rejected, NeedsRevision. Pengajuan dokumen yang butuh persetujuan (Invoice Pembelian, Produksi, Retur, Surat Jalan, PO, edit produksi, revisi harga PI).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `view`)
- **Catatan akses:** Tanpa capability approval.view_all hanya pengajuan milik sendiri; dengan capability (Admin) semua antrian.
- **Handler:** `GET /api/approvals/requests` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | Filter status dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "appr_requests_list",
  "args": {
    "status": "<status>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array pengajuan (documentType, documentNumber, amount, status, requester, approver/rejecte>"
}
```

**Isi hasil:** Array pengajuan (documentType, documentNumber, amount, status, requester, approver/rejecter, payload).

**Tool terkait:** [`appr_request_get`](#appr_request_get), [`appr_pending`](#appr_pending)

### appr_resubmit

**Ringkasan:** Pengaju memperbaiki payload lalu mengajukan ulang pengajuan berstatus NeedsRevision: status kembali Pending (dokumen baru dibuat hanya saat disetujui). Hanya tipe PurchaseInvoice dan ProductionRun; payload divalidasi dengan skema dokumennya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `approvals` / `edit`)
- **Catatan akses:** Hanya pemilik pengajuan (atau pemegang approval.view_all).
- **Handler:** `PUT /api/approvals/requests/:id/resubmit` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `payload` | body | `object` | ya | Payload dokumen lengkap yang sudah dikoreksi (skema CreatePurchaseInvoice / CreateProductionRun). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_resubmit",
  "args": {
    "id": "<id>",
    "payload": {}
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
  "confirm": "Ajukan ulang pengajuan <id> dengan payload yang sudah diperbaiki?"
}
```

**Isi hasil:** Pengajuan berstatus Pending.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya mengembalikan antrian ke Pending.

**Teks konfirmasi:** Ajukan ulang pengajuan {id} dengan payload yang sudah diperbaiki?

**Error umum**

- 400: hanya status Perlu Revisi
- 400: tipe dokumen tidak didukung
- 403: bukan pengajuan Anda

**Tool terkait:** [`appr_request_get`](#appr_request_get), [`appr_request_revision`](#appr_request_revision)

### appr_rule_create

**Ringkasan:** Membuat aturan approval baru (documentType + ambang minAmount + role penyetuju). Mengubah kontrol persetujuan perusahaan; hanya pemegang capability approval.decide.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `POST /api/approvals/rules` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `documentType` | body | `string` | ya | Tipe dokumen yang diatur (mis. PaymentRequest, PurchaseInvoice). |
| `minAmount` | body | `number` | ya | Ambang nominal minimum aturan berlaku. |
| `requiredRole` | body | `string` | ya | Peran yang wajib menyetujui (mis. Admin). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_rule_create",
  "args": {
    "documentType": "<documentType>",
    "minAmount": 1,
    "requiredRole": "<requiredRole>"
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
  "confirm": "Buat aturan approval <documentType> mulai 1 oleh peran <requiredRole>?"
}
```

**Isi hasil:** Aturan yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; mengubah siapa yang harus menyetujui dokumen/pengajuan berikutnya (kontrol internal).

**Teks konfirmasi:** Buat aturan approval {documentType} mulai {minAmount} oleh peran {requiredRole}?

**Tool terkait:** [`appr_rules_list`](#appr_rules_list), [`appr_rule_update`](#appr_rule_update)

### appr_rule_delete

**Ringkasan:** Menghapus aturan approval. Dokumen/pengajuan di bawah ambang itu tidak lagi memerlukan persetujuan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `DELETE /api/approvals/rules/:id` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "appr_rule_delete",
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
  "confirm": "HAPUS aturan approval <id>?"
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; melonggarkan kontrol persetujuan (permanen).

**Teks konfirmasi:** HAPUS aturan approval {id}?

**Tool terkait:** [`appr_rules_list`](#appr_rules_list)

### appr_rule_update

**Ringkasan:** Mengubah aturan approval (documentType, minAmount, requiredRole, isActive). Catatan kode: body dikirim penuh; field yang tidak dikirim bisa menimpa nilai dengan kosong, kirim semua field.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `approvals` / `edit`, capability `approval.decide`)
- **Handler:** `PUT /api/approvals/rules/:id` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `documentType` | body | `string` | ya | Tipe dokumen. |
| `minAmount` | body | `number` | ya | Ambang nominal. |
| `requiredRole` | body | `string` | ya | Peran penyetuju. |
| `isActive` | body | `boolean` | tidak | Aktif/nonaktif aturan. |

**Contoh pemanggilan**

```json
{
  "tool": "appr_rule_update",
  "args": {
    "id": "<id>",
    "documentType": "<documentType>",
    "minAmount": 1,
    "requiredRole": "<requiredRole>"
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
  "confirm": "Ubah aturan approval <id> (ambang 1, peran <requiredRole>, aktif {isActive})?"
}
```

**Isi hasil:** Aturan setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; mengubah kontrol persetujuan berikutnya.

**Teks konfirmasi:** Ubah aturan approval {id} (ambang {minAmount}, peran {requiredRole}, aktif {isActive})?

**Tool terkait:** [`appr_rules_list`](#appr_rules_list)

### appr_rules_list

**Ringkasan:** Daftar aturan approval (documentType, minAmount, requiredRole, isActive) yang menentukan dokumen/nominal mana yang butuh persetujuan; dipakai juga untuk tahap direktur Pengajuan Pembayaran (documentType PaymentRequest).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `approvals` / `view`, capability `approval.decide`)
- **Handler:** `GET /api/approvals/rules` (src/routes/approvals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "appr_rules_list",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array aturan terurut documentType lalu minAmount.>"
}
```

**Isi hasil:** Array aturan terurut documentType lalu minAmount.

**Tool terkait:** [`appr_rule_create`](#appr_rule_create), [`appr_check`](#appr_check)


# Toolset: Penjualan (`penjualan`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/penjualan` · 74 tool (read 31, write 27, critical 16)

## Tujuan

Toolset **penjualan** memungkinkan AIRA membaca dan mengoperasikan siklus penjualan Entaris: Inquiry (permintaan prospek), Penawaran (Quotation), Pesanan Penjualan (Sales Order/SO), Surat Jalan (Delivery Order/DO) termasuk Surat Jalan Sementara (SJS), Invoice Penjualan, Retur Penjualan, dan Uang Muka Pelanggan. Hampir semua tool baca (daftar, detail, ringkasan) aman dipanggil otomatis; tool tulis dipisah menurut dampaknya: dokumen non-posting (draft/status) versus tool yang memposting stok atau jurnal (invoice, DO, retur, uang muka), yang selalu berisiko `critical` atau butuh konfirmasi. Master item jasa (`svc_*`) tercatat di toolset master-data tetapi dipakai pada baris invoice.

## ALUR BISNIS

### Alur bisnis

Rantai dokumen (setiap langkah boleh dilewati; Invoice bisa dibuat langsung tanpa SO/DO):

```
Inquiry (INQ) -> Penawaran (QO) -> [Sales Order (PSN)] -> Surat Jalan (DO) -> Invoice Penjualan (SI) -> Pembayaran (modul Bank & Kas)
                                        \-> SJS (Surat Jalan Sementara) -> ditautkan ke DO resmi
Invoice -> Retur Penjualan (RN)          Uang Muka Pelanggan -> dipakai/di-offset/di-refund ke Invoice
```

Status per dokumen:

- **Inquiry**: `Baru`, `Diproses`, `Dikonversi` (terkunci, hanya lewat `inq_link`), `Hilang` (wajib alasan >= 5 karakter), `Ditutup`. Hanya inquiry yang belum Dikonversi boleh dihapus.
- **Penawaran**: `Draft` -> `Sent` (`quot_send`, butuh minimal 1 item dan `validUntil` belum lewat) -> `Accepted` (`quot_accept`) atau `Rejected` (`quot_reject`, alasan wajib). Penawaran `Sent` yang melewati `validUntil` otomatis menjadi `Expired` (job harian). `Cancelled` lewat `quot_cancel` (capability `doc.cancel`; tidak bisa bila sudah dikonversi ke invoice). Hanya `Draft` yang bisa diedit/dihapus. Konversi: `quot_convert_payload` (hanya Accepted) -> `si_create` -> `quot_link`. Catatan: konversi penawaran menuju INVOICE, bukan SO (SO hanya menyimpan `quotationId` sebagai rujukan).
- **Sales Order**: `Draft` -> `Submitted` (`so_submit`) -> `PartiallyDelivered` -> `FullyDelivered` (dihitung otomatis dari baris DO yang tertaut) atau `Cancelled`. SO hanya boleh diedit saat Draft. Over-delivery (kirim melebihi sisa) diperbolehkan dan hanya dicatat log.
- **Surat Jalan (DO)**: dibuat `Submitted` dan langsung memotong stok. "Belum ditagih" = `Submitted` dengan `invoiceId` kosong; "Invoiced" = `Submitted` dengan `invoiceId` terisi; `Cancelled`. Filter status `Invoiced` pada `do_list` hanyalah turunan, bukan nilai kolom.
- **SJS**: `Open` (Terbuka) -> `Linked` (ditautkan ke DO resmi) atau `Cancelled`. Hanya dokumen kirim sementara; tidak menyentuh stok/GL/WAC dan tidak bisa di-invoice.
- **Invoice Penjualan**: tidak ada draft pada alur API — `si_create` langsung memposting; status awal `Submitted` (`Paid` bila total Rp 0), lalu `PartiallyPaid`/`Paid`/`Overdue` mengikuti pembayaran, atau `Cancelled`.
- **Retur**: `Submitted` atau `Cancelled` (Draft ada di enum tetapi tidak dipakai alur normal).
- **Uang muka pelanggan**: dicatat sebagai Payment bertipe `CustomerDeposit` (dibuat lewat modul Pembayaran, bukan toolset ini). Status turunan `Active`, `PartiallyUsed`, `FullyUsed` dihitung dari jumlah terpakai/refund; status dokumen `Submitted`/`Cancelled`.

### Aturan posting

Hanya langkah berikut yang menyentuh stok/GL; semuanya dikerjakan dalam satu transaksi database dan harus seimbang:

| Aksi | Stok | Jurnal GL |
|---|---|---|
| Inquiry, Penawaran, SO (semua status), SJS | Tidak ada | Tidak ada |
| `do_create`, `so_generate_do` | Keluar per item/gudang, unitCost = WAC saat kirim (dikunci) | Tidak ada (HPP menunggu invoice) |
| `do_update` | Balik pergerakan lama + keluar baru | Tidak ada |
| `do_cancel` | Stok dikembalikan | Tidak ada |
| `do_from_invoice` | Tidak ada (stok sudah dipotong invoice) | Tidak ada |
| `si_create` | Keluar untuk baris inventori (kecuali baris dari DO, yang memakai unitCost terkunci di DO) | DR 1.2.1 Piutang Usaha (grand total) [+ DR 1.5.4 PPh bila pphPct>0] / CR akun pendapatan per baris (4.1 Penjualan, 4.2 Pendapatan Jasa, atau akun item jasa/kustom) + CR PPN Keluaran; lalu JV-COGS: DR 5.1 HPP (fallback 5) / CR Persediaan |
| `si_cancel` | Stok dikembalikan | Semua jurnal invoice + HPP dibalik |
| `sret_create` | Masuk lagi untuk baris `restock=true` | JV-RN: DR 4.3 Retur Penjualan (+ PPN Keluaran) / CR 1.2.1 Piutang (sebesar yang mengurangi outstanding) dan CR 2.1.2 Uang Muka Pelanggan (kelebihan, jadi kredit pelanggan); JV-COGS-RN: DR Persediaan / CR HPP pada biaya asli |
| `cdep_apply` | Tidak ada | DR 2.1.2 Uang Muka Pelanggan / CR 1.2.1 Piutang Usaha |
| `cdep_refund` | Tidak ada | Offset: DR 2.1.2 / CR 1.2.1 (FIFO ke faktur terlama); refund kas: DR 2.1.2 / CR Kas/Bank (1.1.x) |
| `cdep_cancel`, `cdep_apply_cancel` | Tidak ada | Jurnal asal dibalik (soft-cancel ledger, bukan jurnal pembalik) |

Biaya (HPP) diambil dengan prioritas: unitCost pergerakan stok DO -> `unitCostLoaded` baris invoice -> `averageCost` item (WAC). Pembayaran invoice ada di toolset kas-bank (`pay_record`: DR Kas/Bank / CR Piutang).

### Persetujuan

- **Retur Penjualan** (`sret_create`): bila role pemanggil tidak punya capability `approval.bypass` (default hanya Admin), dokumen TIDAK dibuat; payload masuk antrian `ApprovalRequest` tipe `SalesReturn` (HTTP 202) dan dieksekusi saat disetujui (aktor = pengaju). Admin/role bypass langsung memposting (201).
- **Surat Jalan** (`do_create`): antrian approval tipe `DeliveryOrder` hanya muncul pada kasus stok minus: `allowNegativeStock=true` tanpa capability `inventory.negative_stock`. Perhatikan: `so_generate_do` dan `do_update` TIDAK mengantrikan approval — keduanya menolak dengan 403 bila bypass stok minus diminta tanpa capability.
- **Pembatalan** memakai capability `doc.cancel` (default hanya Admin): `quot_cancel`, `do_cancel`, `si_cancel`, `sret_cancel`, `cdep_apply_cancel`, `tdn_cancel`, `svc_delete`. Pengecualian yang tidak ber-capability: `so_cancel` dan `cdep_cancel` (hanya izin edit modul) — pertimbangkan ini saat mengatur tier tool.
- Keputusan approval dilakukan di toolset persetujuan; tool penjualan hanya mengantrikan.

### Jebakan umum

1. **`inq_convert_payload` bermutasi walau GET**: bila inquiry berupa prospek tanpa pelanggan, endpoint membuat master Pelanggan baru dan mengisi `partyId` inquiry. Diklasifikasikan `write`. Sebaliknya `quot_convert_payload` murni baca.
2. **Invoice tidak punya draft**: `si_create` = posting langsung (jurnal + stok + HPP). Jangan dipanggil untuk "simpan dulu". `si_update` hanya mengubah catatan/jatuh tempo/syarat; nilai tidak bisa diedit — koreksi = `si_cancel` lalu buat ulang.
3. **Urutan pembatalan**: Pembayaran/aplikasi uang muka -> Invoice -> DO -> SO. `si_cancel` ditolak bila ada pembayaran teralokasi atau aplikasi uang muka aktif; `do_cancel` ditolak bila DO sudah masuk invoice; `so_cancel` ditolak bila masih ada DO aktif; `tdn_cancel` ditolak bila SJS sudah Linked.
4. **Stok minus**: `allowNegativeStock` tidak otomatis diizinkan; butuh capability `inventory.negative_stock`. Pada `do_create` tanpa capability hasilnya 202 (antrian approval), pada `so_generate_do`/`do_update`/invoice hasilnya error.
5. **Retur melebihi sisa**: qty retur dibatasi sisa baris invoice (`remaining` dari `sret_eligible`). Retur ke invoice Draft/Cancelled ditolak. Retur dengan kelebihan nilai menjadi kredit pelanggan (deposit) — jika kredit itu sudah dipakai, `sret_cancel` ditolak.
6. **Baris invoice dari DO**: baris dengan `deliveryOrderItemId` tidak memotong stok lagi dan memakai unitCost terkunci DO; DO yang sudah Cancelled atau sudah di invoice lain ditolak.
7. **`do_list` status**: gunakan `Submitted` untuk "belum ditagih", `Invoiced` untuk "sudah ditagih". `do_pending` mewajibkan `partyId`.
8. **Paging opsional**: `cdep_list` dan `svc_list` berperilaku berbeda dengan/tanpa `page` (tanpa page = semua baris `{data}` tanpa total).
9. **Tahun fiskal**: pembuatan dokumen bernomor (QO, PSN, INQ, DO, SI, RN, JV) butuh tahun fiskal terbuka pada tanggal dokumen.
10. **Tarif pajak**: PPN (`taxPct`) bisa per baris dan per dokumen; PPh per baris (`pphPct`) didebit ke 1.5.4 bila akun itu ada di COA (jika tidak ada, baris PPh dilewati tanpa error).

### Peta istilah

| Istilah bisnis | Kode / field / status |
|---|---|
| Inquiry, permintaan harga, prospek | `Inquiry`, `inquiryNumber` (INQ), `prospectName`, status `Baru/Diproses/Dikonversi/Hilang/Ditutup` |
| Penawaran, Quotation (QO) | `Quotation`, `quotationNumber`, `validUntil`, `Draft/Sent/Accepted/Rejected/Expired/Cancelled` |
| Pesanan Penjualan, SO (PSN) | `SalesOrder`, `soNumber`, `deliveredQty`, `customerRefNo` (No. PO pelanggan) |
| Surat Jalan, SJ, DO | `DeliveryOrder`, `doNumber`, `invoiceId` (terisi = sudah ditagih), `nomorMobil`, `driverName` |
| Surat Jalan Sementara, SJS | `TemporaryDeliveryNote`, `Open/Linked/Cancelled` |
| Invoice Penjualan, faktur (SI) | `SalesInvoice`, `invoiceNumber`, `outstanding`, `grandTotal`, `Submitted/PartiallyPaid/Paid/Overdue/Cancelled` |
| Retur Penjualan, RN | `SalesReturn`, `returnNumber`, `restock`, jurnal `JV-RN-...` |
| Uang muka pelanggan, DP | Payment `paymentType=CustomerDeposit`, akun 2.1.2, `refundedAmount`, `CustomerDepositApplication` |
| Piutang usaha | akun 1.2.1 (`AR`) |
| Penjualan / Pendapatan jasa | akun 4.1 / 4.2 |
| HPP, COGS | akun 5.1 (fallback 5); biaya dari WAC/unitCost terkunci |
| Retur Penjualan (akun) | akun 4.3 |
| PPN Keluaran / PPh dibayar dimuka | `TAX_OUTPUT` / akun 1.5.4 |
| WAC | rata-rata tertimbang biaya item (`averageCost`) |
| Item jasa | `ServiceItem` (kode, tarif default, akun pendapatan) |
| Stok minus | capability `inventory.negative_stock`, flag `allowNegativeStock` |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`cdep_apply`](#cdep_apply) | critical | tidak | `POST /api/customer-deposits/apply` |
| [`cdep_apply_cancel`](#cdep_apply_cancel) | critical | tidak | `POST /api/customer-deposits/apply/:id/cancel` |
| [`cdep_balance`](#cdep_balance) | read | - | `GET /api/customer-deposits/balance/:partyId` |
| [`cdep_cancel`](#cdep_cancel) | critical | tidak | `PATCH /api/customer-deposits/:id/cancel` |
| [`cdep_list`](#cdep_list) | read | - | `GET /api/customer-deposits` |
| [`cdep_refund`](#cdep_refund) | critical | tidak | `POST /api/customer-deposits/:id/refund` |
| [`cdep_summary`](#cdep_summary) | read | - | `GET /api/customer-deposits/summary` |
| [`do_cancel`](#do_cancel) | critical | tidak | `POST /api/delivery-orders/:id/cancel` |
| [`do_create`](#do_create) | critical | tidak | `POST /api/delivery-orders` |
| [`do_from_invoice`](#do_from_invoice) | write | tidak | `POST /api/delivery-orders/from-invoice/:invoiceId` |
| [`do_get`](#do_get) | read | - | `GET /api/delivery-orders/:id` |
| [`do_list`](#do_list) | read | - | `GET /api/delivery-orders` |
| [`do_patch`](#do_patch) | write | tidak | `PATCH /api/delivery-orders/:id` |
| [`do_pending`](#do_pending) | read | - | `GET /api/delivery-orders/pending` |
| [`do_update`](#do_update) | critical | tidak | `PUT /api/delivery-orders/:id` |
| [`inq_convert_payload`](#inq_convert_payload) | write | tidak | `GET /api/inquiries/:id/convert-payload` |
| [`inq_create`](#inq_create) | write | ya | `POST /api/inquiries` |
| [`inq_delete`](#inq_delete) | write | tidak | `DELETE /api/inquiries/:id` |
| [`inq_get`](#inq_get) | read | - | `GET /api/inquiries/:id` |
| [`inq_link`](#inq_link) | write | tidak | `POST /api/inquiries/:id/link` |
| [`inq_list`](#inq_list) | read | - | `GET /api/inquiries` |
| [`inq_set_status`](#inq_set_status) | write | tidak | `PATCH /api/inquiries/:id/status` |
| [`inq_stats`](#inq_stats) | read | - | `GET /api/inquiries/stats` |
| [`inq_summary`](#inq_summary) | read | - | `GET /api/inquiries/summary` |
| [`inq_update`](#inq_update) | write | ya | `PUT /api/inquiries/:id` |
| [`proforma_cancel`](#proforma_cancel) | critical | tidak | `PATCH /api/proforma-invoices/:id/cancel` |
| [`proforma_convert_payload`](#proforma_convert_payload) | read | - | `GET /api/proforma-invoices/:id/convert-payload` |
| [`proforma_create`](#proforma_create) | write | ya | `POST /api/proforma-invoices` |
| [`proforma_delete`](#proforma_delete) | write | tidak | `DELETE /api/proforma-invoices/:id` |
| [`proforma_get`](#proforma_get) | read | - | `GET /api/proforma-invoices/:id` |
| [`proforma_link`](#proforma_link) | write | tidak | `POST /api/proforma-invoices/:id/link` |
| [`proforma_list`](#proforma_list) | read | - | `GET /api/proforma-invoices` |
| [`proforma_send`](#proforma_send) | write | tidak | `PATCH /api/proforma-invoices/:id/send` |
| [`proforma_update`](#proforma_update) | write | ya | `PUT /api/proforma-invoices/:id` |
| [`quot_accept`](#quot_accept) | write | tidak | `PATCH /api/quotations/:id/accept` |
| [`quot_cancel`](#quot_cancel) | critical | tidak | `PATCH /api/quotations/:id/cancel` |
| [`quot_convert_payload`](#quot_convert_payload) | read | - | `GET /api/quotations/:id/convert-payload` |
| [`quot_create`](#quot_create) | write | ya | `POST /api/quotations` |
| [`quot_delete`](#quot_delete) | write | tidak | `DELETE /api/quotations/:id` |
| [`quot_get`](#quot_get) | read | - | `GET /api/quotations/:id` |
| [`quot_link`](#quot_link) | write | tidak | `POST /api/quotations/:id/link` |
| [`quot_list`](#quot_list) | read | - | `GET /api/quotations` |
| [`quot_reject`](#quot_reject) | write | tidak | `PATCH /api/quotations/:id/reject` |
| [`quot_send`](#quot_send) | write | tidak | `PATCH /api/quotations/:id/send` |
| [`quot_stats`](#quot_stats) | read | - | `GET /api/quotations/stats` |
| [`quot_summary`](#quot_summary) | read | - | `GET /api/quotations/summary` |
| [`quot_update`](#quot_update) | write | ya | `PUT /api/quotations/:id` |
| [`si_cancel`](#si_cancel) | critical | tidak | `POST /api/sales/invoices/:id/cancel` |
| [`si_create`](#si_create) | critical | tidak | `POST /api/sales/invoices` |
| [`si_get`](#si_get) | read | - | `GET /api/sales/invoices/:id` |
| [`si_list`](#si_list) | read | - | `GET /api/sales/invoices` |
| [`si_summary`](#si_summary) | read | - | `GET /api/sales/invoices/summary` |
| [`si_update`](#si_update) | write | tidak | `PUT /api/sales/invoices/:id` |
| [`so_cancel`](#so_cancel) | critical | tidak | `POST /api/sales-orders/:id/cancel` |
| [`so_create`](#so_create) | write | ya | `POST /api/sales-orders` |
| [`so_generate_do`](#so_generate_do) | critical | tidak | `POST /api/sales-orders/:id/generate-do` |
| [`so_get`](#so_get) | read | - | `GET /api/sales-orders/:id` |
| [`so_list`](#so_list) | read | - | `GET /api/sales-orders` |
| [`so_submit`](#so_submit) | write | tidak | `POST /api/sales-orders/:id/submit` |
| [`so_summary`](#so_summary) | read | - | `GET /api/sales-orders/summary` |
| [`so_update`](#so_update) | write | ya | `PUT /api/sales-orders/:id` |
| [`sret_cancel`](#sret_cancel) | critical | tidak | `POST /api/sales-returns/:id/cancel` |
| [`sret_create`](#sret_create) | critical | ya | `POST /api/sales-returns` |
| [`sret_eligible`](#sret_eligible) | read | - | `GET /api/sales-returns/eligible/:invoiceId` |
| [`sret_get`](#sret_get) | read | - | `GET /api/sales-returns/:id` |
| [`sret_list`](#sret_list) | read | - | `GET /api/sales-returns` |
| [`tdn_cancel`](#tdn_cancel) | critical | tidak | `POST /api/temporary-delivery-notes/:id/cancel` |
| [`tdn_create`](#tdn_create) | write | ya | `POST /api/temporary-delivery-notes` |
| [`tdn_get`](#tdn_get) | read | - | `GET /api/temporary-delivery-notes/:id` |
| [`tdn_link`](#tdn_link) | write | tidak | `POST /api/temporary-delivery-notes/:id/link` |
| [`tdn_linkable`](#tdn_linkable) | read | - | `GET /api/temporary-delivery-notes/linkable` |
| [`tdn_list`](#tdn_list) | read | - | `GET /api/temporary-delivery-notes` |
| [`tdn_summary`](#tdn_summary) | read | - | `GET /api/temporary-delivery-notes/summary` |
| [`tdn_update`](#tdn_update) | write | ya | `PUT /api/temporary-delivery-notes/:id` |

## Rincian tool

### cdep_apply

**Ringkasan:** Memakai uang muka pelanggan untuk melunasi (sebagian) Invoice Penjualan. Memposting jurnal; outstanding & status invoice diperbarui.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `edit`)
- **Catatan akses:** Risiko direklasifikasi dari write: memposting jurnal.
- **Handler:** `POST /api/customer-deposits/apply` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `depositPaymentId` | body | `uuid` | ya | ID pembayaran uang muka pelanggan yang dipakai. |
| `salesInvoiceId` | body | `uuid` | ya | ID invoice penjualan tujuan. |
| `amount` | body | `number` | ya | Nominal (Rupiah). |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_apply",
  "args": {
    "depositPaymentId": "00000000-0000-0000-0000-000000000000",
    "salesInvoiceId": "00000000-0000-0000-0000-000000000000",
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
  "confirm": "Pakai uang muka 00000000-0000-0000-0000-000000000000 Rp 1 untuk invoice 00000000-0000-0000-0000-000000000000?"
}
```

**Isi hasil:** 201: CustomerDepositApplication yang dibuat (jurnal, jumlah).

**Efek pembukuan/stok:** GL: DR 2.1.2 Uang Muka Pelanggan / CR 1.2.1 Piutang Usaha sebesar amount. Invoice.outstanding berkurang (status PartiallyPaid/Paid) dan dibuat CustomerDepositApplication.

**Teks konfirmasi:** Pakai uang muka {depositPaymentId} Rp {amount} untuk invoice {salesInvoiceId}?

**Prasyarat**

- Deposit Submitted dan pelanggan sama dengan invoice.
- Invoice belum Cancelled/Paid.

**Error umum**

- 400: sisa deposit tidak cukup.
- 400: melebihi outstanding invoice.
- 400: deposit dan invoice harus dari pelanggan yang sama.
- 400: invoice sudah lunas/dibatalkan.

**Tool terkait:** [`cdep_balance`](#cdep_balance), [`cdep_apply_cancel`](#cdep_apply_cancel), [`si_get`](#si_get)

### cdep_apply_cancel

**Ringkasan:** Membatalkan pemakaian uang muka pada invoice: jurnal aplikasi dibalik, outstanding invoice dipulihkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `customer_deposit` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/customer-deposits/apply/:id/cancel` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID CustomerDepositApplication. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_apply_cancel",
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
  "confirm": "Batalkan pemakaian uang muka (aplikasi <id>)?"
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Membalik JV aplikasi (DR Uang Muka / CR Piutang dibalik), outstanding & status invoice dipulihkan, aplikasi ditandai batal.

**Teks konfirmasi:** Batalkan pemakaian uang muka (aplikasi {id})?

**Error umum**

- 400: aplikasi tidak ditemukan.
- 400: aplikasi sudah dibatalkan.

### cdep_balance

**Ringkasan:** Saldo uang muka satu pelanggan: daftar uang muka Submitted yang masih bersisa (>0) dengan jumlah terpakai/sisa, dan total saldo.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `view`)
- **Handler:** `GET /api/customer-deposits/balance/:partyId` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | path | `string` | ya | ID pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_balance",
  "args": {
    "partyId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: [{id,paymentNumber,date,amount,totalApplied,remaining,referenceNo,account}], total>"
}
```

**Isi hasil:** { data: [{id,paymentNumber,date,amount,totalApplied,remaining,referenceNo,account}], totalBalance }.

**Tool terkait:** [`cdep_apply`](#cdep_apply), [`cdep_refund`](#cdep_refund)

### cdep_cancel

**Ringkasan:** Membatalkan uang muka pelanggan: jurnal penerimaan dibalik, saldo uang muka pelanggan berkurang, status Cancelled. Ditolak bila sudah dipakai pada faktur. CATATAN: berbeda dengan pembatalan aplikasi, endpoint ini tidak mensyaratkan capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `edit`)
- **Handler:** `PATCH /api/customer-deposits/:id/cancel` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Payment uang muka. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_cancel",
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
  "confirm": "Batalkan uang muka pelanggan <id> (jurnal dibalik)?"
}
```

**Isi hasil:** { message: 'Uang muka pelanggan berhasil dibatalkan.' }.

**Efek pembukuan/stok:** Membalik jurnal penerimaan uang muka (DR Kas/Bank / CR 2.1.2 Uang Muka Pelanggan dibalik), ledger dibatalkan, party.customerDepositBalance dikurangi.

**Teks konfirmasi:** Batalkan uang muka pelanggan {id} (jurnal dibalik)?

**Error umum**

- 400: deposit sudah digunakan untuk faktur — batalkan penggunaan dulu.
- 400: bukan tipe uang muka pelanggan.
- 400: sudah dibatalkan.

### cdep_list

**Ringkasan:** Daftar uang muka pelanggan (Payment tipe CustomerDeposit) beserta angka terpakai/refund/sisa. Tanpa page: semua baris { data }; dengan page: paging + status turunan (Active/PartiallyUsed/FullyUsed).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `view`)
- **Handler:** `GET /api/customer-deposits` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `status` | query | enum: `Active`, `PartiallyUsed`, `FullyUsed`, `Draft`, `Submitted`, `Cancelled` | tidak | Status turunan atau status dokumen. |
| `page` | query | `number` | tidak | Aktifkan mode paging bila diisi. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200; mode paging). |
| `startDate` | query | `date` | tidak | Tanggal awal (mode paging). |
| `endDate` | query | `date` | tidak | Tanggal akhir (mode paging). |
| `search` | query | `string` | tidak | Cari nomor/pelanggan (mode paging). |
| `sort` | query | `string` | tidak | date \| paymentNumber \| customer \| amount \| totalApplied \| remaining; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_list",
  "args": {
    "partyId": "00000000-0000-0000-0000-000000000000",
    "status": "Active"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: Deposit[] (amount, refundedAmount, totalApplied, remaining, state), total?, page?,>"
}
```

**Isi hasil:** { data: Deposit[] (amount, refundedAmount, totalApplied, remaining, state), total?, page?, limit? }.

**Tool terkait:** [`cdep_balance`](#cdep_balance), [`cdep_summary`](#cdep_summary)

### cdep_refund

**Ringkasan:** Menyelesaikan sisa uang muka pelanggan: offset ke piutang faktur terlama (FIFO) dan/atau refund tunai ke kas/bank. Total offset+refund tidak boleh melebihi sisa uang muka.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `edit`)
- **Handler:** `POST /api/customer-deposits/:id/refund` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Payment uang muka. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `offsetAmount` | body | `number` | tidak | Jumlah yang dikompensasikan ke piutang pelanggan (FIFO). |
| `cashAmount` | body | `number` | tidak | Jumlah yang dikembalikan tunai. |
| `cashAccountId` | body | `uuid` | tidak | Akun kas/bank sumber refund; wajib bila cashAmount > 0. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_refund",
  "args": {
    "id": "<id>",
    "date": "2026-01-31"
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
  "confirm": "Selesaikan uang muka <id>: offset piutang Rp {offsetAmount}, refund kas Rp {cashAmount}?"
}
```

**Isi hasil:** { offsetApplied, cashRefunded, cashJournalId, ... }.

**Efek pembukuan/stok:** Offset: per faktur DR 2.1.2 Uang Muka Pelanggan / CR 1.2.1 Piutang Usaha (outstanding faktur turun, status faktur diperbarui). Refund kas: DR 2.1.2 Uang Muka Pelanggan / CR Kas/Bank (akun kas dipilih); refundedAmount & saldo uang muka pelanggan berkurang.

**Teks konfirmasi:** Selesaikan uang muka {id}: offset piutang Rp {offsetAmount}, refund kas Rp {cashAmount}?

**Prasyarat**

- Uang muka Submitted dan masih ada sisa.
- Piutang pelanggan cukup untuk offset.

**Error umum**

- 400: total melebihi sisa uang muka.
- 400: piutang pelanggan tidak cukup untuk offset.
- 400: akun yang dipilih bukan kas/bank.

**Tool terkait:** [`cdep_balance`](#cdep_balance)

### cdep_summary

**Ringkasan:** Ringkasan KPI uang muka pelanggan (total, terpakai, sisa, jumlah per status turunan) untuk filter yang sama dengan mode paging cdep_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `customer_deposit` / `view`)
- **Handler:** `GET /api/customer-deposits/summary` (src/routes/customerDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Active`, `PartiallyUsed`, `FullyUsed`, `Draft`, `Submitted`, `Cancelled` | tidak | Status turunan atau status dokumen. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor/pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "cdep_summary",
  "args": {
    "status": "Active",
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Total uang muka, terpakai, refund, sisa, dan hitungan per state.>"
}
```

**Isi hasil:** Total uang muka, terpakai, refund, sisa, dan hitungan per state.

**Tool terkait:** [`cdep_list`](#cdep_list)

### do_cancel

**Ringkasan:** Membatalkan Surat Jalan: stok dikembalikan (per gudang), pergerakan stok ditandai batal, status Cancelled. Ditolak bila DO sudah masuk invoice.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `delivery_order` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/delivery-orders/:id/cancel` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Surat Jalan. |

**Contoh pemanggilan**

```json
{
  "tool": "do_cancel",
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
  "confirm": "Batalkan Surat Jalan <id> (stok dikembalikan)?"
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Stok: mengembalikan stok & pergerakan keluar dibatalkan. Tidak ada jurnal GL.

**Teks konfirmasi:** Batalkan Surat Jalan {id} (stok dikembalikan)?

**Error umum**

- 400: batalkan invoice terkait dulu.
- 400: surat jalan sudah dibatalkan.

### do_create

**Ringkasan:** Membuat Surat Jalan standalone: stok barang langsung keluar. Bila allowNegativeStock=true tanpa capability inventory.negative_stock, SJ tidak dibuat tetapi masuk antrian approval (HTTP 202).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Catatan akses:** Risiko direklasifikasi dari write (menggerakkan stok).
- **Handler:** `POST /api/delivery-orders` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pelanggan/vendor (Party). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Baris SJ: inventoryItemId, warehouseId, itemName, quantity, unit, description. |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].description` | body | `string` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | Izinkan stok minus (diantrikan approval bila tanpa capability). |
| `negativeStockReason` | body | `string` | tidak | Alasan stok minus (ikut ke notifikasi approval). |
| `temporaryNoteIds` | body | `array<string>` | tidak | Surat Jalan Sementara (Open) pelanggan yang ditautkan. |

**Contoh pemanggilan**

```json
{
  "tool": "do_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "unit": "<unit>"
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
  "confirm": "Buat Surat Jalan untuk pelanggan 00000000-0000-0000-0000-000000000000 tanggal 2026-01-31 (stok akan keluar)?"
}
```

**Isi hasil:** 201: DeliveryOrder Submitted (items, stockMovement). 202: { pendingApproval, request } untuk cabang stok minus.

**Efek pembukuan/stok:** Stok: pergerakan Keluar per item (stok turun, per gudang) dengan unitCost WAC terkunci saat kirim. TIDAK ada jurnal GL (HPP diposting invoice). Cabang stok minus tanpa capability: hanya ApprovalRequest DeliveryOrder (belum ada efek stok sampai disetujui).

**Teks konfirmasi:** Buat Surat Jalan untuk pelanggan {partyId} tanggal {date} (stok akan keluar)?

**Prasyarat**

- Tahun fiskal terbuka.
- Pelanggan aktif bertipe Customer.
- Stok cukup di gudang sumber.

**Error umum**

- 400: stok tidak cukup.
- 400: item perlu gudang sumber.
- 400: pelanggan tidak aktif.

**Tool terkait:** [`do_pending`](#do_pending), [`si_create`](#si_create), [`tdn_linkable`](#tdn_linkable)

### do_from_invoice

**Ringkasan:** Membuat Surat Jalan retroaktif dari Invoice Penjualan yang sudah ada (jual langsung, SJ menyusul). Tidak menggerakkan stok lagi dan langsung tertaut ke invoice.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Handler:** `POST /api/delivery-orders/from-invoice/:invoiceId` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `invoiceId` | path | `string` | ya | ID Invoice Penjualan sumber. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "do_from_invoice",
  "args": {
    "invoiceId": "<id>",
    "date": "2026-01-31"
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
  "confirm": "Buat Surat Jalan retroaktif dari invoice <id> tanggal 2026-01-31?"
}
```

**Isi hasil:** DeliveryOrder yang dibuat (tertaut invoice).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC (stok & HPP sudah dipotong oleh invoice). Hanya membuat dokumen SJ Submitted tertaut invoice.

**Teks konfirmasi:** Buat Surat Jalan retroaktif dari invoice {invoiceId} tanggal {date}?

**Prasyarat**

- Invoice belum dibatalkan dan belum punya SJ.

**Error umum**

- 400: invoice sudah dibatalkan.
- 400: invoice sudah punya Surat Jalan.

**Tool terkait:** [`si_create`](#si_create)

### do_get

**Ringkasan:** Detail satu Surat Jalan: baris, gudang, pergerakan stok, pelanggan, dan invoice terkait.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/delivery-orders/:id` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Surat Jalan. |

**Contoh pemanggilan**

```json
{
  "tool": "do_get",
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
  "data": "<DeliveryOrder lengkap (items+inventoryItem+warehouse+stockMovement, customer, invoice).>"
}
```

**Isi hasil:** DeliveryOrder lengkap (items+inventoryItem+warehouse+stockMovement, customer, invoice).

**Error umum**

- 404: surat jalan tidak ditemukan.

### do_list

**Ringkasan:** Daftar Surat Jalan (Delivery Order/pengiriman) dengan paging. Filter: status (Submitted=belum di-invoice, Invoiced=sudah di-invoice, Cancelled, Draft), pelanggan, rentang tanggal, pencarian nomor DO / nama pelanggan / no. mobil.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/delivery-orders` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200). |
| `status` | query | enum: `Submitted`, `Invoiced`, `Cancelled`, `Draft` | tidak | Submitted = terbit & belum di-invoice; Invoiced = sudah masuk invoice. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor DO / nama pelanggan / no. mobil. |
| `sort` | query | `string` | tidak | date \| doNumber \| customer; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "do_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: DeliveryOrder[], total, page, limit } — doNumber, pelanggan, tanggal, invoice terk>"
}
```

**Isi hasil:** { data: DeliveryOrder[], total, page, limit } — doNumber, pelanggan, tanggal, invoice terkait, jumlah item.

**Tool terkait:** [`do_get`](#do_get), [`do_pending`](#do_pending)

### do_patch

**Ringkasan:** Mengubah field header Surat Jalan saja (catatan, no. mobil, driver, penerima). Tidak mengubah item/qty. Hanya SJ berstatus Submitted.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Handler:** `PATCH /api/delivery-orders/:id` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Surat Jalan. |
| `notes` | body | `string` | tidak | Catatan. |
| `nomorMobil` | body | `string` | tidak | Nomor kendaraan. |
| `driverName` | body | `string` | tidak | Nama supir. |
| `recipientName` | body | `string` | tidak | Nama penerima. |

**Contoh pemanggilan**

```json
{
  "tool": "do_patch",
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
  "confirm": "Ubah data header Surat Jalan <id>?"
}
```

**Isi hasil:** DeliveryOrder setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah data header Surat Jalan {id}?

**Error umum**

- 404: SJ tidak ditemukan.
- 400: hanya SJ Submitted yang bisa diedit.

**Tool terkait:** [`do_update`](#do_update)

### do_pending

**Ringkasan:** Daftar Surat Jalan Submitted milik satu pelanggan yang belum ditagihkan (invoiceId kosong), lengkap dengan harga dari SO — dasar untuk membuat invoice dari SJ.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/delivery-orders/pending` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `uuid` | ya | ID pelanggan (wajib). |

**Contoh pemanggilan**

```json
{
  "tool": "do_pending",
  "args": {
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array DeliveryOrder (items+inventoryItem+salesOrderItem{rate,discount}, customer, salesOrd>"
}
```

**Isi hasil:** Array DeliveryOrder (items+inventoryItem+salesOrderItem{rate,discount}, customer, salesOrder{soNumber,customerRefNo}).

**Error umum**

- 400: partyId wajib diisi.

**Tool terkait:** [`si_create`](#si_create)

### do_update

**Ringkasan:** Mengedit penuh Surat Jalan: pergerakan stok lama dibalik lalu baris baru diterapkan (nomor DO tetap). Hanya SJ Submitted yang belum masuk invoice.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Catatan akses:** Risiko direklasifikasi dari write (membalik dan menerapkan ulang pergerakan stok).
- **Handler:** `PUT /api/delivery-orders/:id` (src/routes/deliveryOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Surat Jalan. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pelanggan/vendor (Party). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Seluruh baris baru (menggantikan baris lama). |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].description` | body | `string` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | ADMIN ONLY bypass — wajib isi negativeStockReason. Enforced di route handler. |
| `negativeStockReason` | body | `string` | tidak |  |
| `temporaryNoteIds` | body | `array<string>` | tidak | Surat Jalan Sementara yang ditautkan ke DO resmi ini (opsional) |

**Contoh pemanggilan**

```json
{
  "tool": "do_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "unit": "<unit>"
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
  "confirm": "Edit penuh Surat Jalan <id> (stok akan dibalik dan diterapkan ulang)?"
}
```

**Isi hasil:** DeliveryOrder setelah diedit.

**Efek pembukuan/stok:** Stok: membalik pergerakan keluar lama dan membuat pergerakan keluar baru (stok & WAC per item berubah). TIDAK ada jurnal GL. Bypass stok minus butuh capability inventory.negative_stock (tanpa itu 403, tidak diantrikan).

**Teks konfirmasi:** Edit penuh Surat Jalan {id} (stok akan dibalik dan diterapkan ulang)?

**Error umum**

- 400: SJ sudah masuk invoice — batalkan invoice dulu.
- 400: SJ sudah dibatalkan.
- 403: bypass stok minus butuh capability.

**Tool terkait:** [`do_patch`](#do_patch), [`do_cancel`](#do_cancel)

### inq_convert_payload

**Ringkasan:** Menyiapkan data awal pembuatan penawaran dari inquiry. PERHATIAN: walau metode GET, endpoint ini MEMUTASI data — bila inquiry berupa prospek tanpa partyId, otomatis dibuat master Pelanggan baru (Party Customer) dan inquiry ditautkan ke pelanggan itu.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Catatan akses:** Risiko direklasifikasi dari read (GET yang bermutasi).
- **Handler:** `GET /api/inquiries/:id/convert-payload` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_convert_payload",
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
  "confirm": "Siapkan konversi inquiry <id> ke penawaran (dapat membuat pelanggan baru dari prospek)?"
}
```

**Isi hasil:** { inquiryId, inquiryNumber, partyId, partyName, items[] (mode structured), itemsText, notes } untuk diisi ke quot_create.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Efek samping: membuat master Pelanggan baru dan mengisi inquiry.partyId bila prospek belum terdaftar.

**Teks konfirmasi:** Siapkan konversi inquiry {id} ke penawaran (dapat membuat pelanggan baru dari prospek)?

**Error umum**

- 400: inquiry sudah dikonversi.
- 400: inquiry berstatus Hilang/Ditutup tidak bisa dikonversi.

**Tool terkait:** [`quot_create`](#quot_create), [`inq_link`](#inq_link)

### inq_create

**Ringkasan:** Mencatat inquiry baru dari calon/pelanggan (nomor INQ otomatis, status awal Baru). Barang minat boleh teks bebas (itemsMode=freetext) atau terstruktur (items[]).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `POST /api/inquiries` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `channel` | body | enum: `WhatsApp`, `Telepon`, `Email`, `WalkIn`, `Referral`, `Lainnya` | tidak |  |
| `partyId` | body | `string` | tidak | ID pelanggan terdaftar bila sudah ada; kosongkan untuk prospek baru. |
| `prospectName` | body | `string` | ya | Nama calon pelanggan / kontak (wajib walau partyId diisi). |
| `prospectPhone` | body | `string` | tidak |  |
| `prospectEmail` | body | `email` | tidak |  |
| `itemsMode` | body | enum: `freetext`, `structured` | tidak | freetext = isi itemsText; structured = isi items[]. |
| `itemsText` | body | `string` | tidak |  |
| `items` | body | `array<object>` | tidak | Baris dokumen (item). |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | tidak |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].estimatedPrice` | body | `number` | tidak |  |
| `items[].description` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `followUpDate` | body | `date` | tidak | Tanggal rencana tindak lanjut. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_create",
  "args": {
    "date": "2026-01-31",
    "prospectName": "<prospectName>"
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
  "confirm": "Catat inquiry baru dari <prospectName> (channel {channel}) tanggal 2026-01-31?"
}
```

**Isi hasil:** Objek Inquiry yang dibuat (id, inquiryNumber, status Baru, items).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Hanya membuat dokumen Inquiry (status Baru).

**Teks konfirmasi:** Catat inquiry baru dari {prospectName} (channel {channel}) tanggal {date}?

**Prasyarat**

- Tahun fiskal terbuka pada tanggal inquiry.

**Error umum**

- 400: validasi body (tanggal/prospectName wajib).

**Tool terkait:** [`inq_set_status`](#inq_set_status), [`inq_convert_payload`](#inq_convert_payload), [`quot_create`](#quot_create)

### inq_delete

**Ringkasan:** Menghapus permanen sebuah inquiry (hard delete) yang belum dikonversi menjadi penawaran. Inquiry berstatus Dikonversi tidak dapat dihapus.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `DELETE /api/inquiries/:id` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_delete",
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
  "confirm": "Hapus permanen inquiry <id>?"
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Data inquiry dihapus permanen (tidak ada undo).

**Teks konfirmasi:** Hapus permanen inquiry {id}?

**Error umum**

- 404: inquiry tidak ditemukan.
- 400: inquiry sudah dikonversi.

### inq_get

**Ringkasan:** Detail satu inquiry beserta baris barang, pelanggan, dan tautan penawaran bila sudah dikonversi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/inquiries/:id` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_get",
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
  "data": "<Objek Inquiry lengkap (items, party, quotation).>"
}
```

**Isi hasil:** Objek Inquiry lengkap (items, party, quotation).

**Error umum**

- 404: inquiry tidak ditemukan.

**Tool terkait:** [`inq_list`](#inq_list)

### inq_link

**Ringkasan:** Menautkan inquiry ke penawaran yang baru dibuat; status inquiry otomatis menjadi Dikonversi dan terkunci.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `POST /api/inquiries/:id/link` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |
| `quotationId` | body | `uuid` | ya | ID penawaran yang baru dibuat dari inquiry ini. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_link",
  "args": {
    "id": "<id>",
    "quotationId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Tautkan inquiry <id> ke penawaran 00000000-0000-0000-0000-000000000000 (status menjadi Dikonversi)?"
}
```

**Isi hasil:** Inquiry dengan quotation {id, quotationNumber}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Inquiry.status=Dikonversi, convertedAt terisi.

**Teks konfirmasi:** Tautkan inquiry {id} ke penawaran {quotationId} (status menjadi Dikonversi)?

**Prasyarat**

- Penawaran sudah dibuat (quot_create).

**Error umum**

- 400: quotationId wajib.
- Inquiry sudah ter-link ke penawaran lain.
- Penawaran tidak ditemukan.

**Tool terkait:** [`inq_convert_payload`](#inq_convert_payload), [`quot_create`](#quot_create)

### inq_list

**Ringkasan:** Daftar inquiry (permintaan harga/prospek masuk) dengan paging. Filter: status, channel, pelanggan, rentang tanggal, dan pencarian nomor/prospek/pelanggan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/inquiries` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman (mulai 1). |
| `limit` | query | `number` | tidak | Baris per halaman (maks 500). |
| `status` | query | enum: `Baru`, `Diproses`, `Dikonversi`, `Hilang`, `Ditutup` | tidak | Status inquiry. |
| `channel` | query | enum: `WhatsApp`, `Telepon`, `Email`, `WalkIn`, `Referral`, `Lainnya` | tidak | Saluran masuknya inquiry. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor inquiry / nama prospek / nama pelanggan. |
| `sort` | query | `string` | tidak | Kolom urut: date \| inquiryNumber \| prospectName; awalan '-' = menurun (default -date). |

**Contoh pemanggilan**

```json
{
  "tool": "inq_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: Inquiry[], total, page, limit } — tiap baris memuat nomor INQ, prospek/pelanggan, >"
}
```

**Isi hasil:** { data: Inquiry[], total, page, limit } — tiap baris memuat nomor INQ, prospek/pelanggan, channel, status, tanggal follow-up.

**Tool terkait:** [`inq_get`](#inq_get), [`inq_summary`](#inq_summary), [`inq_stats`](#inq_stats)

### inq_set_status

**Ringkasan:** Mengubah status inquiry (Baru, Diproses, Hilang, Ditutup). Status Dikonversi tidak bisa diset di sini (hanya lewat inq_link) dan Hilang wajib alasan minimal 5 karakter.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PATCH /api/inquiries/:id/status` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |
| `status` | body | enum: `Baru`, `Diproses`, `Dikonversi`, `Hilang`, `Ditutup` | ya | Filter status dokumen. |
| `lossReason` | body | `string` | tidak | Wajib (min 5 karakter) bila status=Hilang. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_set_status",
  "args": {
    "id": "<id>",
    "status": "Baru"
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
  "confirm": "Ubah status inquiry <id> menjadi Baru?"
}
```

**Isi hasil:** Inquiry dengan status baru.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah status inquiry {id} menjadi {status}?

**Error umum**

- 400: status Dikonversi harus lewat konversi.
- 400: inquiry sudah Dikonversi, status terkunci.
- 400: alasan hilang minimal 5 karakter.

### inq_stats

**Ringkasan:** Statistik inquiry per status dan tingkat konversi (%) pada rentang tanggal opsional.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/inquiries/stats` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `from` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `to` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "inq_stats",
  "args": {
    "from": "2026-01-31",
    "to": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ counts: {Baru,Diproses,Dikonversi,Hilang,Ditutup}, total, conversionRate }.>"
}
```

**Isi hasil:** { counts: {Baru,Diproses,Dikonversi,Hilang,Ditutup}, total, conversionRate }.

**Tool terkait:** [`inq_summary`](#inq_summary)

### inq_summary

**Ringkasan:** Ringkasan KPI inquiry (jumlah per status) dengan filter yang sama seperti inq_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/inquiries/summary` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Baru`, `Diproses`, `Dikonversi`, `Hilang`, `Ditutup` | tidak | Status inquiry. |
| `channel` | query | `string` | tidak | Saluran inquiry. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor/prospek/pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "inq_summary",
  "args": {
    "status": "Baru",
    "channel": "<channel>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Hitungan inquiry per status untuk filter yang diberikan.>"
}
```

**Isi hasil:** Hitungan inquiry per status untuk filter yang diberikan.

**Tool terkait:** [`inq_list`](#inq_list), [`inq_stats`](#inq_stats)

### inq_update

**Ringkasan:** Mengubah isi inquiry (penuh, bukan parsial): tanggal, kontak, channel, barang minat, catatan, follow-up. Baris items diganti seluruhnya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PUT /api/inquiries/:id` (src/routes/inquiries.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID inquiry. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `channel` | body | enum: `WhatsApp`, `Telepon`, `Email`, `WalkIn`, `Referral`, `Lainnya` | tidak |  |
| `partyId` | body | `string` | tidak | ID pelanggan/vendor (Party). |
| `prospectName` | body | `string` | ya | Nama calon pelanggan (prospek). |
| `prospectPhone` | body | `string` | tidak |  |
| `prospectEmail` | body | `email` | tidak |  |
| `itemsMode` | body | enum: `freetext`, `structured` | tidak |  |
| `itemsText` | body | `string` | tidak |  |
| `items` | body | `array<object>` | tidak | Baris dokumen (item). |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | tidak |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].estimatedPrice` | body | `number` | tidak |  |
| `items[].description` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `followUpDate` | body | `date` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "inq_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "prospectName": "<prospectName>"
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
  "confirm": "Ubah inquiry <id> (prospek <prospectName>)?"
}
```

**Isi hasil:** Objek Inquiry setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah inquiry {id} (prospek {prospectName})?

**Error umum**

- 404: inquiry tidak ditemukan.
- 400: validasi body.

**Tool terkait:** [`inq_get`](#inq_get), [`inq_set_status`](#inq_set_status)

### proforma_cancel

**Ringkasan:** Membatalkan proforma invoice. Ditolak bila sudah dikonversi ke Sales Invoice atau masih ada uang muka aktif tertaut (batalkan uang muka lewat menu Uang Muka Pelanggan dulu).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `proforma_invoice` / `edit`, capability `doc.cancel`)
- **Handler:** `PATCH /api/proforma-invoices/:id/cancel` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_cancel",
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
  "confirm": "Batalkan proforma <id>?"
}
```

**Isi hasil:** Quotation berstatus Cancelled.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status menjadi Cancelled (tidak bisa diaktifkan lagi).

**Teks konfirmasi:** Batalkan proforma {id}?

**Error umum**

- 400: sudah dikonversi ke Sales Invoice.
- 400: masih ada uang muka aktif tertaut.

### proforma_convert_payload

**Ringkasan:** Data prefill untuk membuat Sales Invoice dari proforma (hanya status Sent). Menyertakan DP yang sudah dibayar; DP TIDAK otomatis diterapkan, gunakan Terapkan Uang Muka setelah invoice terbit.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `proforma_invoice` / `view`)
- **Handler:** `GET /api/proforma-invoices/:id/convert-payload` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_convert_payload",
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
  "data": "<{ quotationId, quotationNumber, partyId, partyName, potongan, biayaLain, terms, notes, ite>"
}
```

**Isi hasil:** { quotationId, quotationNumber, partyId, partyName, potongan, biayaLain, terms, notes, items[] } siap dipakai untuk si_create.

**Error umum**

- 400: hanya proforma Sent yang bisa dikonversi.

**Tool terkait:** [`si_create`](#si_create), [`proforma_link`](#proforma_link)

### proforma_create

**Ringkasan:** Membuat Proforma Invoice (nomor PRO otomatis, status Draft): tagihan awal / permintaan DP kepada pelanggan, bisa tertaut penawaran (quotationId) atau Sales Order (salesOrderId). TIDAK ada efek stok/GL/piutang.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `proforma_invoice` / `edit`)
- **Handler:** `POST /api/proforma-invoices` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `validUntil` | body | `string` | ya | Tanggal berlaku-sampai (YYYY-MM-DD); proforma Sent yang lewat tanggal ini tampil sebagai Expired. |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `items` | body | `array<object>` | ya | Baris penawaran: itemType product\|service, inventoryItemId/serviceItemId, itemName, quantity, unit, rate, discount, taxPct, pphPct. |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak | Potongan nominal tingkat dokumen. |
| `biayaLain` | body | `number` | tidak | Biaya tambahan (boleh negatif). |
| `labelPotongan` | body | `string` | tidak |  |
| `labelBiaya` | body | `string` | tidak |  |
| `terms` | body | `string` | tidak |  |
| `customerRefNo` | body | `string` | tidak | No. PO / referensi pelanggan. |
| `quotationId` | body | `uuid` | tidak | Penawaran asal (opsional). Customer harus sama. |
| `salesOrderId` | body | `uuid` | tidak | Sales Order asal (opsional). Customer harus sama. |
| `requestedAmount` | body | `number` | tidak | Jumlah DP yang ditagih. Kosong = tagih penuh total proforma. Tidak boleh melebihi total. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_create",
  "args": {
    "date": "2026-01-31",
    "validUntil": "<validUntil>",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "rate": 1
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
  "confirm": "Buat proforma invoice untuk pelanggan <id>, berlaku sampai <validUntil>? Tidak ada efek GL/stok/piutang. Hanya dokumen berstatus Draft."
}
```

**Isi hasil:** Quotation yang dibuat (id, quotationNumber, status Draft, items, subtotal, grandTotal).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/piutang. Hanya dokumen Proforma Invoice berstatus Draft.

**Teks konfirmasi:** Buat proforma invoice untuk pelanggan {partyId}, berlaku sampai {validUntil}? Tidak ada efek GL/stok/piutang. Hanya dokumen berstatus Draft.

**Prasyarat**

- Tahun fiskal terbuka pada tanggal penawaran.
- Pelanggan terdaftar.

**Error umum**

- 400: format tanggal tidak valid.
- 400: validasi body (minimal satu item).

**Tool terkait:** [`proforma_send`](#proforma_send), [`proforma_update`](#proforma_update)

### proforma_delete

**Ringkasan:** Menghapus permanen proforma invoice berstatus Draft. Yang sudah diterbitkan harus memakai proforma_cancel.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `proforma_invoice` / `edit`)
- **Handler:** `DELETE /api/proforma-invoices/:id` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_delete",
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
  "confirm": "Hapus permanen draft proforma <id>?"
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Draft dihapus permanen.

**Teks konfirmasi:** Hapus permanen draft proforma {id}?

**Error umum**

- 404: tidak ditemukan.
- 400: hanya Draft yang bisa dihapus.

**Tool terkait:** [`proforma_cancel`](#proforma_cancel)

### proforma_get

**Ringkasan:** Detail proforma invoice: baris, pelanggan, penawaran/SO asal, DP tertaut, status tampilan (Paid/PartiallyPaid/Expired dihitung) dan ringkasan pembayaran.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `proforma_invoice` / `view`)
- **Handler:** `GET /api/proforma-invoices/:id` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_get",
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
  "data": "<Objek Quotation lengkap.>"
}
```

**Isi hasil:** Objek Quotation lengkap.

**Error umum**

- 404: proforma invoice tidak ditemukan.

### proforma_link

**Ringkasan:** Menautkan Sales Invoice yang baru dibuat ke proforma (proforma menjadi Converted). Dipanggil setelah si_create berhasil.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `proforma_invoice` / `edit`)
- **Handler:** `POST /api/proforma-invoices/:id/link` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |
| `salesInvoiceId` | body | `uuid` | ya | ID Invoice Penjualan hasil konversi. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_link",
  "args": {
    "id": "<id>",
    "salesInvoiceId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Tautkan invoice 00000000-0000-0000-0000-000000000000 ke proforma <id>?"
}
```

**Isi hasil:** Quotation dengan salesInvoice {id, invoiceNumber}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok baru (invoice sudah diposting oleh si_create). Hanya mengisi salesInvoiceId/convertedAt dan status Converted pada proforma.

**Teks konfirmasi:** Tautkan invoice {salesInvoiceId} ke proforma {id}?

**Prasyarat**

- Penawaran Accepted.
- Invoice sudah dibuat (si_create).

**Error umum**

- 400: hanya Accepted yang bisa di-link.
- 400: sudah ter-link ke invoice lain.
- 400: customer invoice tidak sama dengan penawaran.

### proforma_list

**Ringkasan:** Daftar proforma invoice dengan paging. Filter: status (Draft/Sent/Converted/Cancelled atau turunan Paid/PartiallyPaid/Expired), pelanggan, pencarian nomor/pelanggan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `proforma_invoice` / `view`)
- **Handler:** `GET /api/proforma-invoices` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 500). |
| `status` | query | enum: `Draft`, `Sent`, `Converted`, `Cancelled`, `PartiallyPaid`, `Paid`, `Expired` | tidak | Filter status. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `search` | query | `string` | tidak | Cari nomor penawaran / nama pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: Quotation[], total, page, limit } — nomor QO, pelanggan, status, validUntil, grand>"
}
```

**Isi hasil:** { data: Quotation[], total, page, limit } — nomor QO, pelanggan, status, validUntil, grandTotal.

**Tool terkait:** [`proforma_get`](#proforma_get)

### proforma_send

**Ringkasan:** Menandai proforma invoice terkirim ke pelanggan (Draft -> Sent). Setelah itu tidak bisa diedit.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `proforma_invoice` / `edit`)
- **Handler:** `PATCH /api/proforma-invoices/:id/send` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_send",
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
  "confirm": "Tandai proforma <id> sebagai terkirim ke pelanggan?"
}
```

**Isi hasil:** Quotation berstatus Sent.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/piutang. Status Draft -> Sent (sentAt terisi); setelah itu tidak bisa diedit.

**Teks konfirmasi:** Tandai proforma {id} sebagai terkirim ke pelanggan?

**Error umum**

- 400: hanya Draft yang bisa dikirim.
- 400: validUntil sudah lewat.
- 400: minimal satu item.

### proforma_update

**Ringkasan:** Mengubah proforma invoice berstatus Draft (ganti baris, total, jumlah tagihan, syarat). Total dihitung ulang server.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `proforma_invoice` / `edit`)
- **Handler:** `PUT /api/proforma-invoices/:id` (src/routes/proformaInvoices.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `validUntil` | body | `string` | ya | Berlaku sampai (YYYY-MM-DD). |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `items` | body | `array<object>` | ya | Baris dokumen (item). |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak |  |
| `biayaLain` | body | `number` | tidak |  |
| `labelPotongan` | body | `string` | tidak |  |
| `labelBiaya` | body | `string` | tidak |  |
| `terms` | body | `string` | tidak |  |
| `customerRefNo` | body | `string` | tidak | No. PO / referensi pelanggan. |
| `requestedAmount` | body | `number` | tidak | Jumlah DP yang ditagih. Kosong = tagih penuh. |

**Contoh pemanggilan**

```json
{
  "tool": "proforma_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "validUntil": "<validUntil>",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "rate": 1
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
  "confirm": "Ubah proforma <id> untuk pelanggan <id>?"
}
```

**Isi hasil:** Quotation setelah diubah (total dihitung ulang).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah proforma {id} untuk pelanggan {partyId}?

**Error umum**

- 400: hanya Draft yang dapat diedit.
- 404: tidak ditemukan.

**Tool terkait:** [`proforma_get`](#proforma_get)

### quot_accept

**Ringkasan:** Menandai penawaran Sent sebagai Accepted (disetujui pelanggan). Gagal bila sudah lewat validUntil.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PATCH /api/quotations/:id/accept` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_accept",
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
  "confirm": "Tandai penawaran <id> diterima pelanggan?"
}
```

**Isi hasil:** Quotation berstatus Accepted.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status Sent -> Accepted (acceptedAt terisi); syarat untuk konversi ke invoice.

**Teks konfirmasi:** Tandai penawaran {id} diterima pelanggan?

**Error umum**

- 400: hanya status Sent yang bisa di-Accept.
- 400: penawaran sudah kadaluarsa.

**Tool terkait:** [`quot_send`](#quot_send), [`quot_convert_payload`](#quot_convert_payload)

### quot_cancel

**Ringkasan:** Membatalkan penawaran dari status apa pun (kecuali sudah dikonversi ke invoice). Butuh capability doc.cancel (default hanya Admin).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `quotation` / `edit`, capability `doc.cancel`)
- **Handler:** `PATCH /api/quotations/:id/cancel` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_cancel",
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
  "confirm": "Batalkan penawaran <id>?"
}
```

**Isi hasil:** Quotation berstatus Cancelled.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status menjadi Cancelled (tidak bisa diaktifkan lagi).

**Teks konfirmasi:** Batalkan penawaran {id}?

**Error umum**

- 400: sudah dikonversi ke Sales Invoice — batalkan invoice dulu.
- 400: sudah dibatalkan.

### quot_convert_payload

**Ringkasan:** Mengambil data awal untuk membuat Invoice Penjualan dari penawaran (pelanggan, baris, potongan, syarat). Murni baca; hanya penawaran Accepted yang belum dikonversi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/quotations/:id/convert-payload` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_convert_payload",
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
  "data": "<{ quotationId, quotationNumber, partyId, partyName, potongan, biayaLain, terms, notes, ite>"
}
```

**Isi hasil:** { quotationId, quotationNumber, partyId, partyName, potongan, biayaLain, terms, notes, items[] } siap dipakai untuk si_create.

**Error umum**

- 400: hanya penawaran Accepted yang bisa dikonversi.
- 400: penawaran sudah dikonversi.

**Tool terkait:** [`si_create`](#si_create), [`quot_link`](#quot_link)

### quot_create

**Ringkasan:** Membuat penawaran harga (nomor QO otomatis, status Draft, non-binding). Memuat baris barang/jasa, potongan, biaya lain, syarat; total dihitung server.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `POST /api/quotations` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `validUntil` | body | `string` | ya | Tanggal berlaku-sampai (YYYY-MM-DD); penawaran Sent yang lewat tanggal ini otomatis Expired oleh job harian. |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `items` | body | `array<object>` | ya | Baris penawaran: itemType product\|service, inventoryItemId/serviceItemId, itemName, quantity, unit, rate, discount, taxPct, pphPct. |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak | Potongan nominal tingkat dokumen. |
| `biayaLain` | body | `number` | tidak | Biaya tambahan (boleh negatif). |
| `labelPotongan` | body | `string` | tidak |  |
| `labelBiaya` | body | `string` | tidak |  |
| `terms` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "quot_create",
  "args": {
    "date": "2026-01-31",
    "validUntil": "<validUntil>",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "rate": 1
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
  "confirm": "Buat penawaran untuk pelanggan <id>, berlaku sampai <validUntil>?"
}
```

**Isi hasil:** Quotation yang dibuat (id, quotationNumber, status Draft, items, subtotal, grandTotal).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Hanya dokumen Quotation berstatus Draft.

**Teks konfirmasi:** Buat penawaran untuk pelanggan {partyId}, berlaku sampai {validUntil}?

**Prasyarat**

- Tahun fiskal terbuka pada tanggal penawaran.
- Pelanggan terdaftar.

**Error umum**

- 400: format tanggal tidak valid.
- 400: validasi body (minimal satu item).

**Tool terkait:** [`quot_send`](#quot_send), [`quot_update`](#quot_update)

### quot_delete

**Ringkasan:** Menghapus permanen penawaran berstatus Draft (hard delete). Penawaran yang sudah diterbitkan harus memakai quot_cancel.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `DELETE /api/quotations/:id` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_delete",
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
  "confirm": "Hapus permanen draft penawaran <id>?"
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Draft dihapus permanen.

**Teks konfirmasi:** Hapus permanen draft penawaran {id}?

**Error umum**

- 404: tidak ditemukan.
- 400: hanya Draft yang bisa dihapus.

**Tool terkait:** [`quot_cancel`](#quot_cancel)

### quot_get

**Ringkasan:** Detail satu penawaran: baris barang/jasa, pelanggan, total, status siklus (Draft/Sent/Accepted/...), dan tautan invoice bila sudah dikonversi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/quotations/:id` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_get",
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
  "data": "<Objek Quotation lengkap.>"
}
```

**Isi hasil:** Objek Quotation lengkap.

**Error umum**

- 404: penawaran tidak ditemukan.

### quot_link

**Ringkasan:** Menautkan Invoice Penjualan yang baru dibuat ke penawaran Accepted (convertedAt terisi). Customer invoice harus sama dengan penawaran.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `POST /api/quotations/:id/link` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |
| `salesInvoiceId` | body | `uuid` | ya | ID Invoice Penjualan hasil konversi. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_link",
  "args": {
    "id": "<id>",
    "salesInvoiceId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Tautkan penawaran <id> ke invoice 00000000-0000-0000-0000-000000000000?"
}
```

**Isi hasil:** Quotation dengan salesInvoice {id, invoiceNumber}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok baru (invoice sudah diposting oleh si_create). Hanya mengisi salesInvoiceId/convertedAt pada penawaran.

**Teks konfirmasi:** Tautkan penawaran {id} ke invoice {salesInvoiceId}?

**Prasyarat**

- Penawaran Accepted.
- Invoice sudah dibuat (si_create).

**Error umum**

- 400: hanya Accepted yang bisa di-link.
- 400: sudah ter-link ke invoice lain.
- 400: customer invoice tidak sama dengan penawaran.

### quot_list

**Ringkasan:** Daftar penawaran (quotation) dengan paging. Filter: status, pelanggan, rentang tanggal, pencarian nomor/pelanggan, urutan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/quotations` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 500). |
| `status` | query | enum: `Draft`, `Sent`, `Accepted`, `Rejected`, `Expired`, `Cancelled` | tidak | Status penawaran. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor penawaran / nama pelanggan. |
| `sort` | query | `string` | tidak | date \| quotationNumber \| customer \| validUntil \| grandTotal; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: Quotation[], total, page, limit } — nomor QO, pelanggan, status, validUntil, grand>"
}
```

**Isi hasil:** { data: Quotation[], total, page, limit } — nomor QO, pelanggan, status, validUntil, grandTotal.

**Tool terkait:** [`quot_get`](#quot_get), [`quot_summary`](#quot_summary), [`quot_stats`](#quot_stats)

### quot_reject

**Ringkasan:** Menandai penawaran Sent sebagai Rejected (ditolak pelanggan) dengan alasan wajib.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PATCH /api/quotations/:id/reject` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |
| `reason` | body | `string` | ya | Alasan penolakan oleh pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_reject",
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
  "confirm": "Tandai penawaran <id> ditolak pelanggan dengan alasan: <reason>?"
}
```

**Isi hasil:** Quotation berstatus Rejected.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status Sent -> Rejected, rejectReason tersimpan.

**Teks konfirmasi:** Tandai penawaran {id} ditolak pelanggan dengan alasan: {reason}?

**Error umum**

- 400: hanya status Sent yang bisa di-Reject.

### quot_send

**Ringkasan:** Menandai penawaran Draft sebagai Sent (terkirim ke pelanggan). Harus memuat minimal satu item dan validUntil belum lewat.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PATCH /api/quotations/:id/send` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_send",
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
  "confirm": "Tandai penawaran <id> sebagai terkirim ke pelanggan?"
}
```

**Isi hasil:** Quotation berstatus Sent.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status Draft -> Sent (sentAt terisi); setelah itu tidak bisa diedit.

**Teks konfirmasi:** Tandai penawaran {id} sebagai terkirim ke pelanggan?

**Error umum**

- 400: hanya Draft yang bisa dikirim.
- 400: validUntil sudah lewat.
- 400: minimal satu item.

### quot_stats

**Ringkasan:** Statistik penawaran: jumlah dan nilai (grand total) per status pada rentang tanggal opsional.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/quotations/stats` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `from` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `to` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "quot_stats",
  "args": {
    "from": "2026-01-31",
    "to": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ counts: per status, values: per status, ... }.>"
}
```

**Isi hasil:** { counts: per status, values: per status, ... }.

**Tool terkait:** [`quot_summary`](#quot_summary)

### quot_summary

**Ringkasan:** Ringkasan KPI penawaran (jumlah/nilai per status, yang akan kedaluwarsa) untuk filter yang sama dengan quot_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `quotation` / `view`)
- **Handler:** `GET /api/quotations/summary` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Sent`, `Accepted`, `Rejected`, `Expired`, `Cancelled` | tidak | Status penawaran. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor/pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "quot_summary",
  "args": {
    "status": "Draft",
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Total jumlah dan nilai per status serta penawaran Sent yang segera berakhir.>"
}
```

**Isi hasil:** Total jumlah dan nilai per status serta penawaran Sent yang segera berakhir.

**Tool terkait:** [`quot_list`](#quot_list), [`quot_stats`](#quot_stats)

### quot_update

**Ringkasan:** Mengubah penawaran (penuh; baris items diganti seluruhnya). Hanya penawaran berstatus Draft yang boleh diedit.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `quotation` / `edit`)
- **Handler:** `PUT /api/quotations/:id` (src/routes/quotations.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID penawaran. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `validUntil` | body | `string` | ya | Berlaku sampai (YYYY-MM-DD). |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `items` | body | `array<object>` | ya | Baris dokumen (item). |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak |  |
| `biayaLain` | body | `number` | tidak |  |
| `labelPotongan` | body | `string` | tidak |  |
| `labelBiaya` | body | `string` | tidak |  |
| `terms` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "quot_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "validUntil": "<validUntil>",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "rate": 1
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
  "confirm": "Ubah penawaran <id> untuk pelanggan <id>?"
}
```

**Isi hasil:** Quotation setelah diubah (total dihitung ulang).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah penawaran {id} untuk pelanggan {partyId}?

**Error umum**

- 400: hanya Draft yang dapat diedit.
- 404: tidak ditemukan.

**Tool terkait:** [`quot_get`](#quot_get)

### si_cancel

**Ringkasan:** Membatalkan Invoice Penjualan: jurnal penjualan & HPP dibalik, stok dikembalikan, DO terkait dilepas. Ditolak bila sudah lunas (kecuali Rp 0), punya alokasi pembayaran, atau alokasi uang muka aktif.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `sales_invoice` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/sales/invoices/:id/cancel` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice. |

**Contoh pemanggilan**

```json
{
  "tool": "si_cancel",
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
  "confirm": "Batalkan Invoice Penjualan <id> (jurnal & stok dibalik)?"
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Membalik semua jurnal invoice (piutang/pendapatan/PPN/PPh dan HPP) dan stok keluar (stok & pergerakan dikembalikan); outstanding=0, status Cancelled. Antrian COGS backfill terkait dibalik.

**Teks konfirmasi:** Batalkan Invoice Penjualan {id} (jurnal & stok dibalik)?

**Error umum**

- 400: invoice sudah lunas.
- 400: ada pembayaran teralokasi — batalkan pembayaran dulu.
- 400: ada alokasi uang muka aktif — batalkan alokasi dulu.

### si_create

**Ringkasan:** Membuat dan LANGSUNG memposting Invoice Penjualan (nomor SI otomatis): jurnal piutang/pendapatan/PPN/PPh, stok keluar untuk baris inventori (kecuali baris dari Surat Jalan), dan jurnal HPP. Tidak ada status draft.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `sales_invoice` / `edit`)
- **Catatan akses:** Risiko direklasifikasi dari write: endpoint ini memposting GL, stok, dan HPP sekaligus.
- **Handler:** `POST /api/sales/invoices` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `items` | body | `array<object>` | ya | Baris invoice: itemType product\|service, inventoryItemId, serviceItemId, accountId (pendapatan kustom), warehouseId, quantity, unit, rate, discount %, taxPct (PPN %), pphPct, deliveryOrderItemId (baris dari SJ: tidak memotong stok lagi), sourceMovementId (batch). |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `dueDate` | body | `date` | tidak | Tanggal jatuh tempo (YYYY-MM-DD). |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `customerRefNo` | body | `string` | tidak | No. PO / Penawaran pelanggan |
| `taxPct` | body | `number` | tidak | PPN % tingkat dokumen. |
| `potongan` | body | `number` | tidak | Potongan nominal dokumen. |
| `biayaLain` | body | `number` | tidak | Biaya tambahan (boleh negatif = potongan). |
| `labelPotongan` | body | `string` | tidak |  |
| `labelBiaya` | body | `string` | tidak |  |
| `terms` | body | `string` | tidak |  |
| `allowNegativeStock` | body | `boolean` | tidak | Izinkan stok minus (butuh capability inventory.negative_stock). |

**Contoh pemanggilan**

```json
{
  "tool": "si_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "rate": 1
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
  "confirm": "Terbitkan Invoice Penjualan untuk pelanggan <id> tanggal 2026-01-31 (jurnal & stok langsung diposting)?"
}
```

**Isi hasil:** SalesInvoice yang dibuat (invoiceNumber, status, items, customer, grandTotal).

**Efek pembukuan/stok:** GL: DR 1.2.1 Piutang Usaha (grand total) [+ DR 1.5.4 PPh dibayar dimuka bila pphPct>0] / CR akun pendapatan per baris (4.1 Penjualan, 4.2 Pendapatan Jasa, atau akun item jasa/kustom) + CR PPN Keluaran. HPP: DR 5.1 HPP / CR Persediaan (WAC; baris dari DO memakai unitCost terkunci di SJ). Stok: pergerakan Keluar & stok turun; stok minus butuh allowNegativeStock+capability. Status Submitted (Paid bila grand total 0). DO terkait ditandai Invoiced.

**Teks konfirmasi:** Terbitkan Invoice Penjualan untuk pelanggan {partyId} tanggal {date} (jurnal & stok langsung diposting)?

**Prasyarat**

- Tahun fiskal terbuka.
- Pelanggan aktif.
- Stok cukup (kecuali bypass).

**Error umum**

- 400: pelanggan tidak ditemukan/tidak aktif.
- 400: stok tidak cukup.
- 400: baris SJ sudah dibatalkan atau sudah masuk invoice lain.

**Tool terkait:** [`do_pending`](#do_pending), [`quot_convert_payload`](#quot_convert_payload), [`pay_record`](kas-bank.md#pay_record)

### si_get

**Ringkasan:** Detail satu Invoice Penjualan: baris (item, WAC, batch sumber, DO asal), pelanggan, alokasi pembayaran (dengan split), dan aplikasi uang muka (termasuk yang dibatalkan).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `sales_invoice` / `view`)
- **Handler:** `GET /api/sales/invoices/:id` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice. |

**Contoh pemanggilan**

```json
{
  "tool": "si_get",
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
  "data": "<SalesInvoice lengkap + paymentAllocations + depositApplications.>"
}
```

**Isi hasil:** SalesInvoice lengkap + paymentAllocations + depositApplications.

**Error umum**

- 404: invoice tidak ditemukan.

### si_list

**Ringkasan:** Daftar Invoice Penjualan dengan paging. Filter: status, pelanggan, rentang tanggal, pencarian nomor/pelanggan, urutan (termasuk outstanding).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `sales_invoice` / `view`)
- **Handler:** `GET /api/sales/invoices` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 500). |
| `status` | query | enum: `Draft`, `Submitted`, `Paid`, `PartiallyPaid`, `Overdue`, `Cancelled` | tidak | Status invoice. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor invoice / nama pelanggan. |
| `sort` | query | `string` | tidak | date \| dueDate \| invoiceNumber \| customer \| grandTotal \| outstanding; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "si_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: SalesInvoice[], total, page, limit } — invoiceNumber, pelanggan, tanggal, dueDate,>"
}
```

**Isi hasil:** { data: SalesInvoice[], total, page, limit } — invoiceNumber, pelanggan, tanggal, dueDate, grandTotal, outstanding, status.

**Tool terkait:** [`si_get`](#si_get), [`si_summary`](#si_summary)

### si_summary

**Ringkasan:** Ringkasan KPI Invoice Penjualan: jumlah, grand total, dan outstanding per status plus total jatuh tempo, untuk filter yang sama dengan si_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `sales_invoice` / `view`)
- **Handler:** `GET /api/sales/invoices/summary` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Submitted`, `Paid`, `PartiallyPaid`, `Overdue`, `Cancelled` | tidak | Status invoice. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor/pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "si_summary",
  "args": {
    "status": "Draft",
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Total per status {count, grandTotal, outstanding} dan blok overdue.>"
}
```

**Isi hasil:** Total per status {count, grandTotal, outstanding} dan blok overdue.

**Tool terkait:** [`si_list`](#si_list)

### si_update

**Ringkasan:** Mengubah field non-finansial invoice: catatan, jatuh tempo, dan syarat. Nilai, baris, dan jurnal TIDAK berubah. Ditolak bila invoice Cancelled.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `sales_invoice` / `edit`)
- **Handler:** `PUT /api/sales/invoices/:id` (src/routes/sales.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice. |
| `notes` | body | `string` | tidak | Catatan. |
| `dueDate` | body | `date` | tidak | Tanggal jatuh tempo (YYYY-MM-DD) atau null. |
| `terms` | body | `string` | tidak | Syarat pembayaran; null atau string kosong = hapus. |

**Contoh pemanggilan**

```json
{
  "tool": "si_update",
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
  "confirm": "Ubah catatan/jatuh tempo/syarat invoice <id>?"
}
```

**Isi hasil:** SalesInvoice setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah catatan/jatuh tempo/syarat invoice {id}?

**Error umum**

- 404: invoice tidak ditemukan.
- 400: invoice sudah dibatalkan.

### so_cancel

**Ringkasan:** Membatalkan Sales Order. Ditolak bila masih ada Surat Jalan aktif; batalkan SJ terlebih dahulu. Tidak butuh capability doc.cancel (hanya izin edit modul).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_order` / `edit`)
- **Handler:** `POST /api/sales-orders/:id/cancel` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Sales Order. |

**Contoh pemanggilan**

```json
{
  "tool": "so_cancel",
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
  "confirm": "Batalkan Sales Order <id>?"
}
```

**Isi hasil:** SalesOrder berstatus Cancelled.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung. Status SO menjadi Cancelled.

**Teks konfirmasi:** Batalkan Sales Order {id}?

**Error umum**

- 400: SO punya Surat Jalan aktif — batalkan SJ dulu.
- 400: SO sudah dibatalkan.

**Tool terkait:** [`do_cancel`](#do_cancel)

### so_create

**Ringkasan:** Membuat Sales Order (komitmen jual; nomor PSN otomatis, status Draft). Tidak memotong stok dan tidak memposting jurnal. Dapat merujuk penawaran (quotationId).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_order` / `edit`)
- **Handler:** `POST /api/sales-orders` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `expectedDelivery` | body | `string` | tidak | Tanggal rencana kirim. |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `customerRefNo` | body | `string` | tidak | No. PO / referensi pelanggan. |
| `quotationId` | body | `string` | tidak | ID penawaran asal (opsional). |
| `items` | body | `array<object>` | ya | Baris SO: inventoryItemId, itemName, quantity, unit, rate, discount, amount. |
| `items[].inventoryItemId` | body | `string` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak |  |
| `items[].amount` | body | `number` | ya |  |
| `items[].description` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak |  |
| `biayaLain` | body | `number` | tidak |  |
| `taxPct` | body | `number` | tidak | PPN % tingkat dokumen. |

**Contoh pemanggilan**

```json
{
  "tool": "so_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "unit": "<unit>",
        "rate": 1,
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
  "confirm": "Buat Sales Order untuk pelanggan <id> tanggal 2026-01-31?"
}
```

**Isi hasil:** SalesOrder yang dibuat (id, soNumber, status Draft, items, subtotal, grandTotal).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Hanya dokumen SO Draft.

**Teks konfirmasi:** Buat Sales Order untuk pelanggan {partyId} tanggal {date}?

**Prasyarat**

- Tahun fiskal terbuka pada tanggal SO.

**Error umum**

- 400: validasi body.
- 400: tidak ada tahun fiskal aktif.

**Tool terkait:** [`so_submit`](#so_submit), [`so_update`](#so_update)

### so_generate_do

**Ringkasan:** Membuat Surat Jalan (DO) dari Sales Order: stok barang langsung keluar (WAC dikunci di pergerakan stok), DO ditautkan ke SO, qty terkirim & status SO (PartiallyDelivered/FullyDelivered) dihitung ulang. Over-delivery diperbolehkan. Hanya SO Submitted/PartiallyDelivered.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_order` / `edit`)
- **Catatan akses:** Risiko direklasifikasi dari write (menggerakkan stok).
- **Handler:** `POST /api/sales-orders/:id/generate-do` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Sales Order. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `allowNegativeStock` | body | `boolean` | tidak | Izinkan stok minus; hanya bila punya capability inventory.negative_stock (jika tidak: 403, TIDAK diantrikan approval di endpoint ini). |
| `negativeStockReason` | body | `string` | tidak |  |
| `temporaryNoteIds` | body | `array<string>` | tidak | ID Surat Jalan Sementara (Open) milik pelanggan yang ditautkan ke DO ini. |
| `items` | body | `array<object>` | ya | Baris kiriman: salesOrderItemId, quantity, warehouseId (gudang sumber), description. |
| `items[].salesOrderItemId` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].warehouseId` | body | `string` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "so_generate_do",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "items": [
      {
        "salesOrderItemId": "<id>",
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
  "confirm": "Buat Surat Jalan dari SO <id> tanggal 2026-01-31 (stok akan keluar)?"
}
```

**Isi hasil:** DeliveryOrder (items, customer, salesOrder) — status Submitted.

**Efek pembukuan/stok:** Stok: pergerakan Keluar per item inventori (stok turun, per gudang), unitCost = WAC saat kirim. TIDAK ada jurnal GL (HPP baru diposting saat invoice). SO.deliveredQty dan status diperbarui.

**Teks konfirmasi:** Buat Surat Jalan dari SO {id} tanggal {date} (stok akan keluar)?

**Prasyarat**

- SO berstatus Submitted atau PartiallyDelivered.
- Stok mencukupi (kecuali bypass).

**Error umum**

- 403: bypass stok minus butuh capability.
- 400: stok tidak cukup.
- 400: SO bukan Submitted/PartiallyDelivered.

**Tool terkait:** [`so_submit`](#so_submit), [`do_get`](#do_get), [`inv_items_list`](persediaan.md#inv_items_list)

### so_get

**Ringkasan:** Detail satu Sales Order: baris + qty terkirim, DO terkait (beserta invoice-nya), penawaran asal, dan ringkasan uang muka (diterima, terpakai, sisa, persen).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `sales_order` / `view`)
- **Handler:** `GET /api/sales-orders/:id` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Sales Order. |

**Contoh pemanggilan**

```json
{
  "tool": "so_get",
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
  "data": "<SalesOrder lengkap + depositSummary {received, applied, depositRemaining, grandTotal, rema>"
}
```

**Isi hasil:** SalesOrder lengkap + depositSummary {received, applied, depositRemaining, grandTotal, remaining, pct}.

**Error umum**

- 400: Sales Order tidak ditemukan.

### so_list

**Ringkasan:** Daftar Sales Order (SO/Pesanan Penjualan) dengan paging. Filter: status, pelanggan, rentang tanggal, pencarian nomor SO/pelanggan/No. PO pelanggan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `sales_order` / `view`)
- **Handler:** `GET /api/sales-orders` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200). |
| `status` | query | enum: `Draft`, `Submitted`, `PartiallyDelivered`, `FullyDelivered`, `Cancelled` | tidak | Status SO. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor SO / nama pelanggan / No. PO pelanggan. |
| `sort` | query | `string` | tidak | date \| soNumber \| customer \| expectedDelivery \| grandTotal; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "so_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: SalesOrder[], total, page, limit } — nomor PSN, pelanggan, status, expectedDeliver>"
}
```

**Isi hasil:** { data: SalesOrder[], total, page, limit } — nomor PSN, pelanggan, status, expectedDelivery, grandTotal, jumlah item & DO.

**Tool terkait:** [`so_get`](#so_get), [`so_summary`](#so_summary)

### so_submit

**Ringkasan:** Submit Sales Order Draft menjadi Submitted (dikunci, siap diproses menjadi Surat Jalan). Tidak ada jurnal atau mutasi stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_order` / `edit`)
- **Handler:** `POST /api/sales-orders/:id/submit` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Sales Order. |

**Contoh pemanggilan**

```json
{
  "tool": "so_submit",
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
  "confirm": "Submit Sales Order <id> (SO akan dikunci dan siap dibuat Surat Jalan)?"
}
```

**Isi hasil:** SalesOrder berstatus Submitted.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Status Draft -> Submitted (submittedAt terisi).

**Teks konfirmasi:** Submit Sales Order {id} (SO akan dikunci dan siap dibuat Surat Jalan)?

**Error umum**

- 400: hanya SO Draft yang bisa di-submit.

**Tool terkait:** [`so_generate_do`](#so_generate_do)

### so_summary

**Ringkasan:** Ringkasan KPI Sales Order (jumlah & nilai per status) untuk filter yang sama dengan so_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `sales_order` / `view`)
- **Handler:** `GET /api/sales-orders/summary` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Submitted`, `PartiallyDelivered`, `FullyDelivered`, `Cancelled` | tidak | Status SO. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor/pelanggan/No. PO. |

**Contoh pemanggilan**

```json
{
  "tool": "so_summary",
  "args": {
    "status": "Draft",
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Hitungan dan grandTotal per status SO.>"
}
```

**Isi hasil:** Hitungan dan grandTotal per status SO.

**Tool terkait:** [`so_list`](#so_list)

### so_update

**Ringkasan:** Mengubah Sales Order (penuh; baris diganti seluruhnya). Hanya SO berstatus Draft yang boleh diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_order` / `edit`)
- **Handler:** `PUT /api/sales-orders/:id` (src/routes/salesOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID Sales Order. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `expectedDelivery` | body | `string` | tidak |  |
| `partyId` | body | `string` | ya | ID pelanggan/vendor (Party). |
| `customerRefNo` | body | `string` | tidak | No. PO/penawaran pelanggan (referensi). |
| `quotationId` | body | `string` | tidak |  |
| `items` | body | `array<object>` | ya | Baris dokumen (item). |
| `items[].inventoryItemId` | body | `string` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak |  |
| `items[].amount` | body | `number` | ya |  |
| `items[].description` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `potongan` | body | `number` | tidak |  |
| `biayaLain` | body | `number` | tidak |  |
| `taxPct` | body | `number` | tidak | PPN dalam persen. |

**Contoh pemanggilan**

```json
{
  "tool": "so_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "partyId": "<id>",
    "items": [
      {
        "itemName": "<itemName>",
        "quantity": 1,
        "unit": "<unit>",
        "rate": 1,
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
  "confirm": "Ubah Sales Order <id>?"
}
```

**Isi hasil:** SalesOrder setelah diubah (total dihitung ulang).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah Sales Order {id}?

**Error umum**

- 400: SO yang sudah Submitted tidak bisa diedit — batalkan dulu bila perlu.

### sret_cancel

**Ringkasan:** Membatalkan Retur Penjualan: jurnal retur & jurnal HPP dibalik, stok masuk dibatalkan, kredit pelanggan hasil retur dibalik. Ditolak bila kredit sudah dipakai di faktur lain.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `sales_return` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/sales-returns/:id/cancel` (src/routes/salesReturns.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID retur. |

**Contoh pemanggilan**

```json
{
  "tool": "sret_cancel",
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
  "confirm": "Batalkan Retur Penjualan <id> (jurnal & stok dibalik)?"
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Membalik JV-RN dan JV-COGS-RN (saldo akun dikembalikan, ledger dibatalkan), membatalkan pergerakan stok masuk retur (stok turun), dan membatalkan deposit kredit pelanggan terkait.

**Teks konfirmasi:** Batalkan Retur Penjualan {id} (jurnal & stok dibalik)?

**Error umum**

- 400: kredit pelanggan dari retur sudah dipakai — batalkan penggunaannya dulu.
- 400: retur sudah dibatalkan.

### sret_create

**Ringkasan:** Membuat Retur Penjualan terhadap satu invoice (nomor RN otomatis). Role tanpa capability approval.bypass hanya mengajukan approval (HTTP 202) — dokumen dibuat saat disetujui; role bypass langsung memposting retur.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_return` / `edit`)
- **Catatan akses:** Role tanpa approval.bypass hanya mengantrikan approval; keputusan oleh Admin/pemegang approval.decide.
- **Handler:** `POST /api/sales-returns` (src/routes/salesReturns.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `salesInvoiceId` | body | `string` | ya | ID Invoice Penjualan yang diretur. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `items` | body | `array<object>` | ya | Baris retur: salesInvoiceItemId, quantity (<= sisa yang boleh diretur), restock (default true; true = stok masuk lagi), warehouseId. |
| `items[].salesInvoiceItemId` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].restock` | body | `boolean` | tidak |  |
| `items[].warehouseId` | body | `string` | tidak | Opsional override gudang tujuan masuk-stok; default = gudang baris invoice. |
| `reason` | body | `string` | tidak | Alasan retur. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "sret_create",
  "args": {
    "salesInvoiceId": "<id>",
    "date": "2026-01-31",
    "items": [
      {
        "salesInvoiceItemId": "<id>",
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
  "confirm": "Buat Retur Penjualan untuk invoice <id> tanggal 2026-01-31?"
}
```

**Isi hasil:** 201: SalesReturn terposting. 202: { pendingApproval, request } bila perlu persetujuan.

**Efek pembukuan/stok:** Cabang langsung (role bypass): JV-RN: DR 4.3 Retur Penjualan (+ DR PPN Keluaran) / CR 1.2.1 Piutang (porsi mengurangi outstanding) dan CR Uang Muka Pelanggan 2.1.2 untuk kelebihan (dibuat Payment CustomerDeposit sebagai kredit pelanggan); untuk baris restock: stok masuk di biaya asli + JV-COGS-RN: DR Persediaan / CR HPP. Cabang non-bypass: hanya ApprovalRequest SalesReturn (belum ada efek GL/stok).

**Teks konfirmasi:** Buat Retur Penjualan untuk invoice {salesInvoiceId} tanggal {date}?

**Prasyarat**

- Invoice tidak Cancelled/Draft.
- Qty retur <= sisa (cek sret_eligible).
- Akun 4.3 Retur Penjualan ada di COA.

**Error umum**

- 400: qty retur melebihi sisa yang bisa diretur.
- 400: invoice sudah dibatalkan.
- 400: akun 4.3 tidak ditemukan.

**Tool terkait:** [`sret_eligible`](#sret_eligible), [`appr_requests_list`](persetujuan.md#appr_requests_list)

### sret_eligible

**Ringkasan:** Baris invoice yang masih dapat diretur: qty asal, sudah diretur, sisa, apakah barang inventori, gudang, tarif/diskon/PPN. Dipakai sebelum membuat retur.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_return` / `view`)
- **Handler:** `GET /api/sales-returns/eligible/:invoiceId` (src/routes/salesReturns.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `invoiceId` | path | `string` | ya | ID Invoice Penjualan. |

**Contoh pemanggilan**

```json
{
  "tool": "sret_eligible",
  "args": {
    "invoiceId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ invoice{id,invoiceNumber,status,outstanding,grandTotal,customer}, lines[{salesInvoiceIte>"
}
```

**Isi hasil:** { invoice{id,invoiceNumber,status,outstanding,grandTotal,customer}, lines[{salesInvoiceItemId,itemName,quantity,alreadyReturned,remaining,...}] }.

**Error umum**

- 404: invoice tidak ditemukan.

**Tool terkait:** [`sret_create`](#sret_create)

### sret_get

**Ringkasan:** Detail satu Retur Penjualan beserta baris, invoice asal, dan jurnal JV-<nomor retur> (akun debit/kredit).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_return` / `view`)
- **Handler:** `GET /api/sales-returns/:id` (src/routes/salesReturns.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID retur. |

**Contoh pemanggilan**

```json
{
  "tool": "sret_get",
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
  "data": "<SalesReturn lengkap + journal (items per akun) bila ada.>"
}
```

**Isi hasil:** SalesReturn lengkap + journal (items per akun) bila ada.

**Error umum**

- 404: retur tidak ditemukan.

### sret_list

**Ringkasan:** Daftar Retur Penjualan dengan paging. Filter: status, pelanggan, invoice asal, rentang tanggal, pencarian nomor retur/pelanggan/invoice.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `sales_return` / `view`)
- **Handler:** `GET /api/sales-returns` (src/routes/salesReturns.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200). |
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled` | tidak | Status retur. |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `salesInvoiceId` | query | `uuid` | tidak | ID invoice asal retur. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor retur / pelanggan / nomor invoice. |
| `sort` | query | `string` | tidak | date \| returnNumber \| customer \| totalReturn; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "sret_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: SalesReturn[], total, page, limit } — returnNumber, invoice asal, total retur, sta>"
}
```

**Isi hasil:** { data: SalesReturn[], total, page, limit } — returnNumber, invoice asal, total retur, status.

**Tool terkait:** [`sret_get`](#sret_get), [`sret_eligible`](#sret_eligible)

### tdn_cancel

**Ringkasan:** Membatalkan Surat Jalan Sementara. Tidak bisa bila sudah Linked ke DO resmi (batalkan DO dulu). Butuh capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `delivery_order` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/temporary-delivery-notes/:id/cancel` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID SJS. |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_cancel",
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
  "confirm": "Batalkan Surat Jalan Sementara <id>?"
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Status SJS menjadi Cancelled.

**Teks konfirmasi:** Batalkan Surat Jalan Sementara {id}?

**Error umum**

- 400: sudah dibatalkan.
- 400: sudah ditautkan ke surat jalan resmi.

### tdn_create

**Ringkasan:** Membuat Surat Jalan Sementara (status Open) untuk pengiriman sebelum data produksi diinput. Barang wajib dari master item; tidak memotong stok dan tidak ada jurnal.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Handler:** `POST /api/temporary-delivery-notes` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pelanggan/vendor (Party). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `salesOrderId` | body | `string` | tidak | SO terkait (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Baris SJS: inventoryItemId (wajib), itemName, quantity (>0), unit. |
| `items[].inventoryItemId` | body | `string` | ya |  |
| `items[].itemName` | body | `string` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "inventoryItemId": "<id>",
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
  "confirm": "Buat Surat Jalan Sementara untuk pelanggan 00000000-0000-0000-0000-000000000000 tanggal 2026-01-31?"
}
```

**Isi hasil:** SJS yang dibuat (number, status Open, items).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC/COGS. Hanya dokumen SJS Open; tidak bisa di-invoice.

**Teks konfirmasi:** Buat Surat Jalan Sementara untuk pelanggan {partyId} tanggal {date}?

**Error umum**

- 400: minimal satu item / barang wajib dari master / qty > 0.
- 400: pelanggan tidak aktif atau bukan Customer.

**Tool terkait:** [`tdn_link`](#tdn_link), [`do_create`](#do_create)

### tdn_get

**Ringkasan:** Detail satu Surat Jalan Sementara beserta baris dan DO resmi yang ditautkan (bila ada).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/temporary-delivery-notes/:id` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID SJS. |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_get",
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
  "data": "<SJS lengkap (items, status, deliveryOrderId).>"
}
```

**Isi hasil:** SJS lengkap (items, status, deliveryOrderId).

**Error umum**

- 404: SJS tidak ditemukan.

### tdn_link

**Ringkasan:** Menautkan SJS Open ke Surat Jalan resmi (DO) yang sudah ada (mis. lupa dicentang saat membuat DO). Hanya mengubah status SJS menjadi Linked.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Handler:** `POST /api/temporary-delivery-notes/:id/link` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID SJS. |
| `deliveryOrderId` | body | `uuid` | ya | ID Surat Jalan resmi (Submitted, pelanggan sama). |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_link",
  "args": {
    "id": "<id>",
    "deliveryOrderId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Tautkan SJS <id> ke Surat Jalan resmi 00000000-0000-0000-0000-000000000000?"
}
```

**Isi hasil:** SJS dengan status Linked.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/DO. SJS.status=Linked, deliveryOrderId & linkedAt terisi.

**Teks konfirmasi:** Tautkan SJS {id} ke Surat Jalan resmi {deliveryOrderId}?

**Error umum**

- 400: SJS bukan Open.
- 400: DO bukan milik pelanggan yang sama / sudah dibatalkan.
- 400: DO tidak ditemukan.

**Tool terkait:** [`do_get`](#do_get)

### tdn_linkable

**Ringkasan:** Daftar SJS berstatus Open milik satu pelanggan yang siap ditautkan ke DO resmi (dipakai di form DO). Mengembalikan array kosong bila partyId kosong.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/temporary-delivery-notes/linkable` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `uuid` | ya | ID pelanggan. |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_linkable",
  "args": {
    "partyId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array { id, number, date, nomorMobil, items[{itemName,quantity,unit,inventoryItemId}] }.>"
}
```

**Isi hasil:** Array { id, number, date, nomorMobil, items[{itemName,quantity,unit,inventoryItemId}] }.

**Tool terkait:** [`do_create`](#do_create), [`tdn_link`](#tdn_link)

### tdn_list

**Ringkasan:** Daftar Surat Jalan Sementara (SJS) dengan paging. SJS adalah dokumen kirim sementara sebelum produksi diinput: tidak menyentuh stok/GL dan nanti ditautkan ke DO resmi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/temporary-delivery-notes` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Nomor halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200). |
| `status` | query | enum: `Open`, `Linked`, `Cancelled` | tidak | Open = Terbuka (belum ditautkan DO). |
| `partyId` | query | `uuid` | tidak | ID pelanggan. |
| `startDate` | query | `date` | tidak | Tanggal awal. |
| `endDate` | query | `date` | tidak | Tanggal akhir. |
| `search` | query | `string` | tidak | Cari nomor / pelanggan / no. mobil. |
| `sort` | query | `string` | tidak | date \| number \| customer; awalan '-' = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: SJS[], total, page, limit } — number, pelanggan, tanggal, status Open/Linked/Cance>"
}
```

**Isi hasil:** { data: SJS[], total, page, limit } — number, pelanggan, tanggal, status Open/Linked/Cancelled.

**Tool terkait:** [`tdn_summary`](#tdn_summary), [`tdn_linkable`](#tdn_linkable)

### tdn_summary

**Ringkasan:** Ringkasan pengingat SJS: jumlah SJS Open dan yang umurnya melewati batas hari (default 7).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `delivery_order` / `view`)
- **Handler:** `GET /api/temporary-delivery-notes/summary` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `days` | query | `number` | tidak | Batas umur (hari) untuk dianggap terlambat; default 7. |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_summary",
  "args": {
    "days": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ open, overdue, days }.>"
}
```

**Isi hasil:** { open, overdue, days }.

**Tool terkait:** [`tdn_list`](#tdn_list)

### tdn_update

**Ringkasan:** Mengubah Surat Jalan Sementara (penuh; baris diganti). Hanya SJS berstatus Open (Terbuka).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `delivery_order` / `edit`)
- **Handler:** `PUT /api/temporary-delivery-notes/:id` (src/routes/temporaryDeliveryNotes.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID SJS. |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pelanggan/vendor (Party). |
| `nomorMobil` | body | `string` | tidak |  |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `salesOrderId` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Baris dokumen (item). |
| `items[].inventoryItemId` | body | `string` | ya |  |
| `items[].itemName` | body | `string` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "tdn_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "inventoryItemId": "<id>",
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
  "confirm": "Ubah Surat Jalan Sementara <id>?"
}
```

**Isi hasil:** SJS setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC.

**Teks konfirmasi:** Ubah Surat Jalan Sementara {id}?

**Error umum**

- 400: hanya SJS berstatus Terbuka yang bisa diubah.


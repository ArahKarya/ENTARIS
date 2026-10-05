# Toolset: Kas & Bank (`kas-bank`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/kas-bank` · 27 tool (read 11, write 8, critical 8)

## Tujuan

Toolset **kas-bank** memungkinkan AIRA membaca dan mengoperasikan arus kas Entaris: transaksi pembayaran (terima/bayar/uang muka/refund), buku Transaksi Kas & Bank, uang jaminan proyek, rekonsiliasi bank, dan template transaksi berulang. Tool baca aman otomatis; tool yang memposting jurnal (`pay_record`, `pg_create`, `pg_settle`, `rec_execute`) dan semua pembatalan bertingkat kritis, sehingga membutuhkan persetujuan eksplisit.

## ALUR BISNIS

### Alur bisnis

**Pembayaran (`Payment`)**
- Satu endpoint `pay_record` menangani enam jenis `paymentType`:
  - `Receive` - terima pembayaran dari pelanggan (melunasi Sales Invoice).
  - `Pay` - bayar ke pemasok (melunasi Purchase Invoice).
  - `VendorDeposit` - uang muka ke pemasok.
  - `CustomerDeposit` - uang muka dari pelanggan (boleh ditautkan ke Sales Order lewat `salesOrderId`).
  - `VendorRefund` - pemasok mengembalikan uang ke kita.
  - `CustomerRefund` - kita mengembalikan uang ke pelanggan.
- `Receive`/`Pay` dialokasikan otomatis ke invoice **terlama** yang masih terbuka, kecuali `allocations` diisi manual. Pembayaran boleh multi-akun lewat `splits` (mis. 270 jt ke BCA + 7,5 jt ke Kas Kecil + 2,5 jt beban komisi); total split harus sama dengan `amount`.
- Sisa yang tidak teralokasi dicatat dan mengurangi saldo awal pihak (`openingOutstanding`).
- Pembayaran selalu langsung `Submitted` (tidak ada draf). Nomor `PAY-...`.
- Daftar: `pay_list` (semua, paging sederhana), `pay_ledger` (Transaksi Kas & Bank gabungan: pembayaran + baris jurnal pada akun kas/bank 1.1.x yang bukan hasil pembayaran, dengan filter tipe/arah/akun/tanggal), `pay_ledger_summary` (KPI uang masuk/keluar/netto), `pay_cash_journals` (100 baris jurnal kas terbaru yang bukan pembayaran).
- Arah uang: `Receive`, `CustomerDeposit`, `VendorRefund` = masuk; lainnya keluar. Baris jurnal: debit di akun kas = masuk, kredit = keluar; jenis `Transfer` (pindah buku) bila entri sama punya baris kas di sisi lawan.

**Uang Jaminan Proyek**
- Setoran jaminan (jenis `Penawaran`, `Pelaksanaan`, `Pemeliharaan`, `Lainnya`) ke pemberi proyek. Status: `Disetor` -> `Selesai` (sisa habis) atau `Dibatalkan`.
- Penyelesaian (`pg_settle`) boleh **parsial dan berulang**: bagian dikembalikan (kas masuk) dan/atau hangus (beban/penalti). Pembatalan setoran hanya bila belum ada settlement aktif; pembatalan settlement membuka kembali jaminan `Selesai` menjadi `Disetor` bila sisa > 0.
- `pg_list` punya mode tanpa `page` (semua + ringkasan) dan dengan `page` (paging, filter `due=overdue|dueSoon`, `dueState` per baris). Nomor `UJ-...`.

**Rekonsiliasi Bank**
- Sesi `Draft` untuk satu akun kas/bank pada tanggal statement: `recon_create` -> `recon_add_items` (mutasi rekening koran) -> `recon_match` / `recon_unmatch` (cocokkan item dengan ledger entry akun yang sama) -> `recon_complete` (kunci, `Completed`).
- Sesi Draft boleh dihapus (`recon_delete`). **Tidak ada** endpoint membuka kembali sesi `Completed`. Rekonsiliasi tidak memposting GL: hanya penanda pencocokan.
- `recon_get` menyertakan hingga 200 entri buku besar akun yang belum dicocokkan.

**Transaksi Berulang**
- Template (`rec_create`) dengan frekuensi `daily/weekly/monthly/quarterly/yearly`. Hanya tipe **`journal`** yang bisa dieksekusi; tipe `sales_invoice`/`purchase_invoice` tersimpan tetapi eksekusi mengembalikan `success=false`.
- Eksekusi otomatis dilakukan scheduler harian 02:00. `rec_execute` menjalankan **satu** template sekarang (bertanggal hari ini). Endpoint massal `POST /api/recurring/run-due` sengaja **tidak** menjadi tool (lihat DENYLIST).
- `rec_delete` hanyalah soft delete (`isActive=false`); aktifkan lagi lewat `rec_update`.

### Aturan posting

| Transaksi | Jurnal |
|---|---|
| `Receive` | DR Kas/Bank (1.1.x, per split) / CR Piutang Usaha (1.2.1); outstanding Sales Invoice turun |
| `Pay` | DR Hutang Usaha (2.1.1) / CR Kas/Bank (per split); outstanding Purchase Invoice turun |
| `VendorDeposit` | DR Uang Muka Vendor (1.3) / CR Kas-Bank (atau CR Ekuitas Saldo Awal 3.1 bila `isOpeningBalance`) |
| `CustomerDeposit` | DR Kas-Bank / CR Uang Muka Pelanggan (2.1.2) (atau saldo awal) |
| `VendorRefund` | DR Bank / CR Hutang Usaha; boleh mengurangi alokasi pembayaran asal (`refundSourcePaymentId`) |
| `CustomerRefund` | DR Piutang Usaha / CR Bank |
| Setor uang jaminan | DR Uang Jaminan Proyek (1.8) / CR Kas-Bank. Baris jurnal **tanpa** partyId (agar piutang pihak tidak terdistorsi) |
| Settlement jaminan | DR Kas-Bank (dikembalikan) + DR Akun Beban (hangus; default Beban Lain-lain, harus EXPENSE non-grup) / CR Uang Jaminan (1.8) |
| Eksekusi template `journal` | Jurnal Umum `Submitted` sesuai baris template; saldo akun diperbarui |
| Rekonsiliasi | Tidak ada jurnal |

Pembatalan memakai pola **soft-cancel**: jurnal berstatus `Cancelled`, ledger `isCancelled`, saldo akun dibalik (tidak membuat jurnal balikan `[BATAL]` baru, agar sinkronisasi ledger-vs-jurnal tetap sehat). Total debit selalu sama dengan total kredit.

Akun kas/bank yang valid = akun detail (non-grup) bernomor 1.1.x (Kas Kecil, BRI, Mandiri, BCA, ...). Tool menolak akun lain dengan "Akun yang dipilih bukan akun kas/bank".

### Persetujuan

- Modul kas-bank **tidak** melewati antrian `needsApproval`: `pay_record`, `pg_create`, `pg_settle`, dan `rec_execute` langsung memposting bagi pemanggil yang punya izin edit modulnya. Kontrol keamanannya berada di tier AIRA (kritis = wajib persetujuan) dan RBAC.
- Pembatalan butuh capability `doc.cancel` (default hanya Admin): `pay_cancel`, `pg_cancel`, `pg_settlement_cancel`.
- Izin modul: `payment`, `reconciliation`, `recurring`, `project_guarantee` (Accountant edit; Viewer hanya `payment` dan `project_guarantee` lihat; StaffProduksi tidak punya akses default kecuali yang dikonfigurasi).

### Jebakan umum

- **Salah jenis pembayaran = jurnal terbalik.** Pastikan `Receive` (pelanggan membayar kita) vs `Pay` (kita membayar pemasok). Uang muka dan refund punya jenis sendiri.
- `pay_cancel` hanya untuk `Receive`/`Pay`. Uang muka dibatalkan lewat tool uang muka (`vdep_cancel` di toolset pembelian atau pembatalan uang muka pelanggan di penjualan); refund belum bisa dibatalkan otomatis - buat jurnal koreksi manual (toolset akuntansi).
- Pembayaran yang dibatalkan harus dilakukan **sebelum** membatalkan invoice yang dibayarnya (invoice dengan alokasi pembayaran tidak bisa dibatalkan).
- `splits` harus berjumlah sama persis (toleransi 0,01) dengan `amount`. Akun split boleh akun beban (mis. komisi), tetapi akun utama tanpa split harus akun kas.
- `pay_list` hanya paging dasar; untuk laporan arus kas pakai `pay_ledger` + `pay_ledger_summary`. Perhatikan `pay_cash_journals` dibatasi 100 baris.
- Uang jaminan: bagian hangus **harus** akun beban (EXPENSE); bagian dikembalikan **harus** akun kas/bank. Total return + hangus tidak boleh melebihi sisa jaminan.
- `rec_create` template jurnal: eksekusi **tidak memvalidasi** debit = kredit dan tidak mengecek `isActive`; pastikan template seimbang sebelum eksekusi.
- Rekonsiliasi `Completed` terkunci permanen; selesaikan hanya setelah semua item dicocokkan sesuai rekening koran.
- Format tanggal `YYYY-MM-DD`; jumlah dalam Rupiah (angka, tanpa pemisah ribuan).

### Peta istilah

| Istilah bisnis | Padanan di sistem |
|---|---|
| Penerimaan / Terima Pembayaran | `paymentType=Receive` |
| Pembayaran / Bayar Hutang | `paymentType=Pay` |
| Uang Muka (DP) Vendor / Pelanggan | `VendorDeposit` (akun 1.3) / `CustomerDeposit` (akun 2.1.2) |
| Refund | `VendorRefund` / `CustomerRefund` |
| Alokasi | `PaymentAllocation` (pembayaran -> invoice) |
| Split | `PaymentSplit` (pembayaran multi-akun) |
| Kas & Bank | akun 1.1.x (Petty Cash, BRI, Mandiri, BRI2, BCA) |
| Pinbuk / Pindah Buku | jenis `Transfer` pada `pay_ledger` |
| Saldo Awal | `isOpeningBalance`, akun Ekuitas Saldo Awal 3.1 |
| Uang Jaminan Proyek | `ProjectGuarantee`, akun 1.8, nomor `UJ-...` |
| Hangus | bagian jaminan yang dipotong/tidak kembali, dibebankan ke akun beban |
| Rekonsiliasi Bank | `BankReconciliation`, status `Draft/Completed` |
| Rekening Koran / Statement | item statement (`statementAmount`) |
| Transaksi Berulang | `RecurringTemplate` (hanya `journal` yang dieksekusi) |
| Batal (cancel) | soft-cancel: jurnal `Cancelled`, saldo dibalik |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`pay_cancel`](#pay_cancel) | critical | tidak | `POST /api/payments/:id/cancel` |
| [`pay_cash_journals`](#pay_cash_journals) | read | - | `GET /api/payments/cash-journals` |
| [`pay_get`](#pay_get) | read | - | `GET /api/payments/:id` |
| [`pay_ledger`](#pay_ledger) | read | - | `GET /api/payments/ledger` |
| [`pay_ledger_summary`](#pay_ledger_summary) | read | - | `GET /api/payments/ledger/summary` |
| [`pay_list`](#pay_list) | read | - | `GET /api/payments` |
| [`pay_record`](#pay_record) | critical | tidak | `POST /api/payments` |
| [`pg_cancel`](#pg_cancel) | critical | tidak | `PATCH /api/project-guarantees/:id/cancel` |
| [`pg_create`](#pg_create) | critical | tidak | `POST /api/project-guarantees` |
| [`pg_get`](#pg_get) | read | - | `GET /api/project-guarantees/:id` |
| [`pg_list`](#pg_list) | read | - | `GET /api/project-guarantees` |
| [`pg_settle`](#pg_settle) | critical | tidak | `POST /api/project-guarantees/:id/settle` |
| [`pg_settlement_cancel`](#pg_settlement_cancel) | critical | tidak | `POST /api/project-guarantees/settlements/:id/cancel` |
| [`pg_summary`](#pg_summary) | read | - | `GET /api/project-guarantees/summary` |
| [`rec_create`](#rec_create) | write | ya | `POST /api/recurring` |
| [`rec_delete`](#rec_delete) | write | ya | `DELETE /api/recurring/:id` |
| [`rec_execute`](#rec_execute) | critical | tidak | `POST /api/recurring/:id/execute` |
| [`rec_list`](#rec_list) | read | - | `GET /api/recurring` |
| [`rec_update`](#rec_update) | write | ya | `PUT /api/recurring/:id` |
| [`recon_add_items`](#recon_add_items) | write | ya | `POST /api/reconciliation/:id/items` |
| [`recon_complete`](#recon_complete) | critical | tidak | `POST /api/reconciliation/:id/complete` |
| [`recon_create`](#recon_create) | write | ya | `POST /api/reconciliation` |
| [`recon_delete`](#recon_delete) | write | ya | `DELETE /api/reconciliation/:id` |
| [`recon_get`](#recon_get) | read | - | `GET /api/reconciliation/:id` |
| [`recon_list`](#recon_list) | read | - | `GET /api/reconciliation` |
| [`recon_match`](#recon_match) | write | ya | `PATCH /api/reconciliation/:id/match` |
| [`recon_unmatch`](#recon_unmatch) | write | ya | `PATCH /api/reconciliation/:id/unmatch` |

## Rincian tool

### pay_cancel

**Ringkasan:** Membatalkan pembayaran Receive/Pay: alokasi dibalik (outstanding invoice dipulihkan), jurnal dibatalkan. Uang muka dan refund tidak bisa dibatalkan di sini (pakai endpoint uang muka; refund lewat jurnal koreksi manual).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `payment` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/payments/:id/cancel` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pembayaran (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pay_cancel",
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
  "confirm": "Batalkan pembayaran <id>? Alokasi dan jurnal akan dibalik."
}
```

**Isi hasil:** Pembayaran dengan status Cancelled.

**Efek pembukuan/stok:** Reverse jurnal pembayaran (Receive: DR Piutang / CR Kas; Pay: DR Kas / CR Hutang): saldo akun dibalik, outstanding invoice terkait naik kembali, status invoice dipulihkan.

**Teks konfirmasi:** Batalkan pembayaran {id}? Alokasi dan jurnal akan dibalik.

**Error umum**

- 400: Pembayaran sudah dibatalkan
- 400: Gunakan endpoint Uang Muka untuk membatalkan deposit
- 400: Refund belum mendukung cancel otomatis

**Tool terkait:** [`pay_get`](#pay_get), [`vdep_cancel`](pembelian.md#vdep_cancel), [`pi_cancel`](pembelian.md#pi_cancel)

### pay_cash_journals

**Ringkasan:** 100 baris jurnal terakhir yang menyentuh akun kas/bank (1.1.x) yang bukan hasil pembayaran (nomor bukan JV-PAY): pindah buku, biaya, penerimaan lewat jurnal manual.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `payment` / `view`)
- **Handler:** `GET /api/payments/cash-journals` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "pay_cash_journals",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: [{ id, journalEntryId, date, entryNumber, narration, partyName, amount, isCredit, >"
}
```

**Isi hasil:** { data: [{ id, journalEntryId, date, entryNumber, narration, partyName, amount, isCredit, status }] }.

**Tool terkait:** [`pay_ledger`](#pay_ledger)

### pay_get

**Ringkasan:** Detail satu pembayaran: pihak, akun kas/bank, split, alokasi ke invoice, dan jurnal (baris debit/kredit per akun).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `payment` / `view`)
- **Handler:** `GET /api/payments/:id` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pembayaran (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pay_get",
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
  "data": "<Payment lengkap + party, account, splits, allocations, journalEntry.items.>"
}
```

**Isi hasil:** Payment lengkap + party, account, splits, allocations, journalEntry.items.

**Error umum**

- 404: Pembayaran tidak ditemukan

**Tool terkait:** [`pay_cancel`](#pay_cancel), [`pay_ledger`](#pay_ledger)

### pay_ledger

**Ringkasan:** Daftar Transaksi Kas & Bank gabungan: pembayaran dan baris jurnal pada akun kas/bank dalam satu daftar ber-paging. Filter tipe, arah masuk/keluar, status, pihak, rekening, tanggal, dan pencarian.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `payment` / `view`)
- **Handler:** `GET /api/payments/ledger` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Per halaman (default 25, maksimum 500). |
| `search` | query | `string` | tidak | Cari nomor/pihak/keterangan. |
| `type` | query | enum: `Receive`, `Pay`, `VendorDeposit`, `CustomerDeposit`, `VendorRefund`, `CustomerRefund`, `Transfer`, `Expense`, `JournalIn` | tidak | Jenis transaksi (Transfer = pindah buku, Expense/JournalIn = dari jurnal). |
| `direction` | query | enum: `in`, `out` | tidak | in = uang masuk; out = uang keluar. |
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled` | tidak | Status dokumen. |
| `partyId` | query | `string` | tidak | ID pihak. |
| `accountId` | query | `string` | tidak | ID akun kas/bank. |
| `startDate` | query | `date` | tidak | Tanggal dari (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal sampai (YYYY-MM-DD). |
| `sort` | query | `string` | tidak | date, number, party, amount; awalan - = menurun (default -date). |

**Contoh pemanggilan**

```json
{
  "tool": "pay_ledger",
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
  "data": "<{ data: baris kas/bank (sumber payment atau journal, arah, jumlah, pihak, rekening), total>"
}
```

**Isi hasil:** { data: baris kas/bank (sumber payment atau journal, arah, jumlah, pihak, rekening), total, page, limit }.

**Error umum**

- 400: tipe/arah/status/format tanggal tidak dikenal

**Tool terkait:** [`pay_ledger_summary`](#pay_ledger_summary), [`pay_get`](#pay_get)

### pay_ledger_summary

**Ringkasan:** Ringkasan Transaksi Kas & Bank (jumlah transaksi, uang masuk, uang keluar, netto) untuk filter yang sama dengan pay_ledger.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `payment` / `view`)
- **Handler:** `GET /api/payments/ledger/summary` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `search` | query | `string` | tidak | Cari nomor/pihak/keterangan. |
| `type` | query | `string` | tidak | Jenis transaksi (lihat pay_ledger). |
| `direction` | query | enum: `in`, `out` | tidak | Arah uang. |
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled` | tidak | Status dokumen. |
| `partyId` | query | `string` | tidak | ID pihak. |
| `accountId` | query | `string` | tidak | ID akun kas/bank. |
| `startDate` | query | `date` | tidak | Tanggal dari. |
| `endDate` | query | `date` | tidak | Tanggal sampai. |

**Contoh pemanggilan**

```json
{
  "tool": "pay_ledger_summary",
  "args": {
    "search": "<search>",
    "type": "<type>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ count, moneyIn, moneyOut, net }.>"
}
```

**Isi hasil:** { count, moneyIn, moneyOut, net }.

**Tool terkait:** [`pay_ledger`](#pay_ledger)

### pay_list

**Ringkasan:** Daftar transaksi pembayaran (Payment: terima, bayar, uang muka, refund) tanpa filter, urut tanggal terbaru dan dipaging. Untuk filter lengkap (tipe, arah, rekening, tanggal) gunakan pay_ledger.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `payment` / `view`)
- **Handler:** `GET /api/payments` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Per halaman (default 50, maksimum 200). |

**Contoh pemanggilan**

```json
{
  "tool": "pay_list",
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
  "data": "<{ data: Payment[] (+ party, splits), total, page, limit }.>"
}
```

**Isi hasil:** { data: Payment[] (+ party, splits), total, page, limit }.

**Tool terkait:** [`pay_ledger`](#pay_ledger), [`pay_get`](#pay_get)

### pay_record

**Ringkasan:** Mencatat transaksi kas/bank dan langsung memposting jurnal. Enam jenis (paymentType): Receive (terima dari pelanggan), Pay (bayar ke pemasok), VendorDeposit, CustomerDeposit, VendorRefund, CustomerRefund. Receive/Pay otomatis dialokasikan ke invoice terlama (atau sesuai allocations) dan boleh multi-akun lewat splits.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `payment` / `edit`)
- **Handler:** `POST /api/payments` (src/routes/payments.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal transaksi (YYYY-MM-DD). |
| `partyId` | body | `string` | ya | ID pelanggan/pemasok. |
| `amount` | body | `number` | ya | Jumlah Rp > 0. |
| `paymentType` | body | enum: `Receive`, `Pay`, `VendorDeposit`, `CustomerDeposit`, `VendorRefund`, `CustomerRefund` | ya | Receive \| Pay \| VendorDeposit \| CustomerDeposit \| VendorRefund \| CustomerRefund. |
| `accountId` | body | `string` | ya | Akun kas/bank (harus akun kas 1.1.x bila tanpa splits). |
| `allocations` | body | `array<object>` | tidak | Alokasi manual ke invoice: { invoiceType (SalesInvoice\|PurchaseInvoice), invoiceId, amount }. Kosong = otomatis ke invoice terlama. |
| `allocations[].invoiceType` | body | enum: `SalesInvoice`, `PurchaseInvoice` | ya |  |
| `allocations[].invoiceId` | body | `string` | ya |  |
| `allocations[].amount` | body | `number` | ya |  |
| `splits` | body | `array<object>` | tidak | Pecahan multi-akun { accountId, amount, notes }; total harus sama dengan amount. |
| `splits[].accountId` | body | `string` | ya |  |
| `splits[].amount` | body | `number` | ya |  |
| `splits[].notes` | body | `string` | tidak |  |
| `referenceNo` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `isOpeningBalance` | body | `boolean` | tidak | true = uang muka saldo awal (lawan akun Ekuitas Saldo Awal). |
| `refundSourcePaymentId` | body | `string` | tidak | Refund: ID pembayaran asal yang dikoreksi sebagian. |
| `salesOrderId` | body | `uuid` | tidak | CustomerDeposit: tautkan uang muka ke Sales Order. |

**Contoh pemanggilan**

```json
{
  "tool": "pay_record",
  "args": {
    "date": "2026-01-31",
    "partyId": "<id>",
    "amount": 1,
    "paymentType": "Receive",
    "accountId": "<id>"
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
  "confirm": "Catat Receive Rp 1 untuk pihak <id> tanggal 2026-01-31 lewat akun <id>. Jurnal akan diposting. Setujui?"
}
```

**Isi hasil:** Payment yang dibuat + party + unallocatedAmount. HTTP 201.

**Efek pembukuan/stok:** Receive: DR Kas/Bank (per split) / CR Piutang Usaha (1.2.1), outstanding SI turun. Pay: DR Hutang Usaha (2.1.1) / CR Kas/Bank (per split), outstanding PI turun. VendorDeposit: DR Uang Muka Vendor (1.3) / CR Kas-Bank (atau CR Ekuitas Saldo Awal 3.1 bila isOpeningBalance). CustomerDeposit: DR Kas-Bank / CR Uang Muka Pelanggan (2.1.2). VendorRefund: DR Bank / CR Hutang Usaha. CustomerRefund: DR Piutang Usaha / CR Bank. Sisa tak teralokasi mengurangi saldo awal pihak.

**Teks konfirmasi:** Catat {paymentType} Rp {amount} untuk pihak {partyId} tanggal {date} lewat akun {accountId}. Jurnal akan diposting. Setujui?

**Prasyarat**

- Periode fiskal terbuka
- Pihak aktif dan tipe sesuai (uang muka vendor hanya Supplier, uang muka pelanggan hanya Customer)
- Akun kas/bank valid

**Error umum**

- 400: Total split tidak sama dengan jumlah pembayaran
- 400: Akun yang dipilih bukan akun kas/bank
- 400: Uang muka hanya dapat dibuat untuk Supplier
- 400: Nilai refund melebihi alokasi pembayaran asal

**Tool terkait:** [`pi_list`](pembelian.md#pi_list), [`vdep_apply`](pembelian.md#vdep_apply), [`pay_cancel`](#pay_cancel), [`pay_ledger`](#pay_ledger)

### pg_cancel

**Ringkasan:** Membatalkan setoran uang jaminan (hanya bila belum ada settlement aktif): jurnal setoran dibatalkan dan saldo akun dibalik.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `project_guarantee` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `PATCH /api/project-guarantees/:id/cancel` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID uang jaminan (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pg_cancel",
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
  "confirm": "Batalkan uang jaminan <id>? Jurnal setoran akan dibalik."
}
```

**Isi hasil:** Uang jaminan berstatus Dibatalkan.

**Efek pembukuan/stok:** Soft-cancel jurnal setoran (DR Uang Jaminan 1.8 / CR Kas-Bank): jurnal Cancelled, ledger isCancelled, saldo akun dibalik. Tidak membuat jurnal balikan baru.

**Teks konfirmasi:** Batalkan uang jaminan {id}? Jurnal setoran akan dibalik.

**Error umum**

- 400: Uang jaminan sudah dibatalkan
- 400: Sudah ada settlement aktif - batalkan settlement dulu

**Tool terkait:** [`pg_settlement_cancel`](#pg_settlement_cancel), [`pg_create`](#pg_create)

### pg_create

**Ringkasan:** Mencatat setoran uang jaminan proyek (penawaran/pelaksanaan/pemeliharaan) ke pemberi proyek dan langsung memposting jurnalnya.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `project_guarantee` / `edit`)
- **Handler:** `POST /api/project-guarantees` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal setoran (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pemberi proyek (pelanggan). |
| `guaranteeType` | body | `enum` | ya | Penawaran \| Pelaksanaan \| Pemeliharaan \| Lainnya. |
| `projectName` | body | `string` | ya | Nama proyek. |
| `referenceNo` | body | `string` | tidak | Nomor referensi (opsional). |
| `amount` | body | `number` | ya | Nilai jaminan Rp > 0. |
| `accountId` | body | `uuid` | ya | Akun kas/bank sumber dana. |
| `expectedReturnDate` | body | `date` | tidak | Perkiraan tanggal pengembalian (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "pg_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "guaranteeType": "<guaranteeType>",
    "projectName": "<projectName>",
    "amount": 1,
    "accountId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Catat setoran uang jaminan <guaranteeType> proyek <projectName> Rp 1 dari akun 00000000-0000-0000-0000-000000000000. Jurnal akan diposting. Setujui?"
}
```

**Isi hasil:** Uang jaminan yang dibuat (guaranteeNumber, status Disetor).

**Efek pembukuan/stok:** Jurnal: DR Uang Jaminan Proyek (akun PROJECT_GUARANTEE, 1.8) / CR Kas-Bank sumber dana. Baris jurnal sengaja tanpa partyId agar piutang pihak tidak terdistorsi.

**Teks konfirmasi:** Catat setoran uang jaminan {guaranteeType} proyek {projectName} Rp {amount} dari akun {accountId}. Jurnal akan diposting. Setujui?

**Prasyarat**

- Periode fiskal terbuka
- Pihak aktif
- Akun kas/bank valid

**Error umum**

- 400: Akun yang dipilih bukan akun kas/bank
- 400: Pihak sudah tidak aktif

**Tool terkait:** [`pg_settle`](#pg_settle), [`pg_cancel`](#pg_cancel)

### pg_get

**Ringkasan:** Detail satu uang jaminan proyek beserta riwayat settlement (pengembalian/hangus).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `project_guarantee` / `view`)
- **Handler:** `GET /api/project-guarantees/:id` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID uang jaminan (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pg_get",
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
  "data": "<Jaminan + settlements[].>"
}
```

**Isi hasil:** Jaminan + settlements[].

**Error umum**

- 404: Uang jaminan tidak ditemukan

**Tool terkait:** [`pg_settle`](#pg_settle), [`pg_cancel`](#pg_cancel)

### pg_list

**Ringkasan:** Daftar uang jaminan proyek. Tanpa page: semua jaminan + ringkasan (filter partyId, status, guaranteeType). Dengan page: paging, status (Disetor/Selesai/Dibatalkan), filter jatuh tempo (overdue/dueSoon), tanggal, pencarian, sort; baris memuat dueState.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `project_guarantee` / `view`)
- **Handler:** `GET /api/project-guarantees` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `uuid` | tidak | ID pemberi proyek. |
| `status` | query | enum: `Disetor`, `Selesai`, `Dibatalkan` | tidak | Status jaminan. |
| `guaranteeType` | query | enum: `Penawaran`, `Pelaksanaan`, `Pemeliharaan`, `Lainnya` | tidak | Jenis jaminan. |
| `page` | query | `number` | tidak | Bila diisi aktifkan mode paging (limit default 25, maksimum 200). |
| `limit` | query | `number` | tidak | Per halaman. |
| `due` | query | enum: `overdue`, `dueSoon` | tidak | Filter jatuh tempo pengembalian. |
| `startDate` | query | `date` | tidak | Tanggal dari. |
| `endDate` | query | `date` | tidak | Tanggal sampai. |
| `search` | query | `string` | tidak | Pencarian nomor/proyek/pihak. |
| `sort` | query | `string` | tidak | date, guaranteeNumber, party, projectName, expectedReturnDate, amount, outstanding; awalan - = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "pg_list",
  "args": {
    "partyId": "00000000-0000-0000-0000-000000000000",
    "status": "Disetor"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data, summary } (tanpa page) atau { data, total, page, limit } (dengan page).>"
}
```

**Isi hasil:** { data, summary } (tanpa page) atau { data, total, page, limit } (dengan page).

**Tool terkait:** [`pg_summary`](#pg_summary), [`pg_get`](#pg_get), [`pg_settle`](#pg_settle)

### pg_settle

**Ringkasan:** Menyelesaikan uang jaminan: dikembalikan (kas masuk) dan/atau hangus (beban), parsial dan bisa berulang sampai sisa habis.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `project_guarantee` / `edit`)
- **Handler:** `POST /api/project-guarantees/:id/settle` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID uang jaminan. |
| `date` | body | `date` | ya | Tanggal settlement. |
| `returnAmount` | body | `number` | tidak | Bagian yang dikembalikan (Rp). |
| `forfeitAmount` | body | `number` | tidak | Bagian yang hangus/dipotong penalti (Rp). |
| `returnAccountId` | body | `uuid` | tidak | Akun kas/bank penerima pengembalian (wajib bila returnAmount > 0). |
| `expenseAccountId` | body | `uuid` | tidak | Akun beban untuk bagian hangus (opsional; default Beban Lain-lain). |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "pg_settle",
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
  "confirm": "Selesaikan uang jaminan <id>: dikembalikan Rp {returnAmount}, hangus Rp {forfeitAmount} tanggal 2026-01-31. Jurnal akan diposting. Setujui?"
}
```

**Isi hasil:** Settlement yang dibuat dan sisa jaminan terbaru.

**Efek pembukuan/stok:** Jurnal: DR Kas-Bank (returnAmount) + DR Akun Beban (forfeitAmount; default Beban Lain-lain, harus akun EXPENSE non-grup) / CR Uang Jaminan Proyek (total). Status menjadi Selesai bila sisa habis.

**Teks konfirmasi:** Selesaikan uang jaminan {id}: dikembalikan Rp {returnAmount}, hangus Rp {forfeitAmount} tanggal {date}. Jurnal akan diposting. Setujui?

**Error umum**

- 400: Uang jaminan berstatus {status}, tidak bisa di-settle
- 400: Akun hangus harus akun beban (EXPENSE)
- 400: Akun tujuan pengembalian bukan akun kas/bank
- 400: total melebihi sisa jaminan

**Tool terkait:** [`pg_get`](#pg_get), [`pg_settlement_cancel`](#pg_settlement_cancel)

### pg_settlement_cancel

**Ringkasan:** Membatalkan satu settlement uang jaminan (pengembalian/hangus): jurnal settlement dibatalkan dan sisa jaminan dipulihkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `project_guarantee` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/project-guarantees/settlements/:id/cancel` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID settlement (bukan ID jaminan). |

**Contoh pemanggilan**

```json
{
  "tool": "pg_settlement_cancel",
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
  "confirm": "Batalkan settlement uang jaminan <id>? Jurnal akan dibalik."
}
```

**Isi hasil:** { message: 'Settlement dibatalkan.' }.

**Efek pembukuan/stok:** Soft-cancel jurnal settlement (DR Kas-Bank/Beban / CR Uang Jaminan 1.8): saldo akun dibalik, sisa jaminan naik, status jaminan kembali Disetor bila sebelumnya Selesai.

**Teks konfirmasi:** Batalkan settlement uang jaminan {id}? Jurnal akan dibalik.

**Error umum**

- 400: Settlement sudah dibatalkan
- 400: Uang jaminan induk sudah dibatalkan

**Tool terkait:** [`pg_get`](#pg_get), [`pg_settle`](#pg_settle)

### pg_summary

**Ringkasan:** Ringkasan KPI uang jaminan proyek (jumlah, total setoran, sisa outstanding, yang jatuh tempo) untuk filter yang sama dengan daftar ber-paging.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `project_guarantee` / `view`)
- **Handler:** `GET /api/project-guarantees/summary` (src/routes/projectGuarantees.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Disetor`, `Selesai`, `Dibatalkan` | tidak | Status jaminan. |
| `due` | query | enum: `overdue`, `dueSoon` | tidak | Filter jatuh tempo. |
| `guaranteeType` | query | `string` | tidak | Jenis jaminan. |
| `partyId` | query | `string` | tidak | ID pemberi proyek. |
| `startDate` | query | `date` | tidak | Tanggal dari. |
| `endDate` | query | `date` | tidak | Tanggal sampai. |
| `search` | query | `string` | tidak | Pencarian. |

**Contoh pemanggilan**

```json
{
  "tool": "pg_summary",
  "args": {
    "status": "Disetor",
    "due": "overdue"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Total jumlah, setoran, sisa, dan hitungan jatuh tempo.>"
}
```

**Isi hasil:** Total jumlah, setoran, sisa, dan hitungan jatuh tempo.

**Tool terkait:** [`pg_list`](#pg_list)

### rec_create

**Ringkasan:** Membuat template transaksi berulang. Hanya templateType journal yang dapat dieksekusi otomatis; tipe sales_invoice/purchase_invoice tersimpan tetapi eksekusinya belum didukung. templateData journal berisi narration dan items (accountId, debit, credit, partyId, description).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `recurring` / `edit`)
- **Handler:** `POST /api/recurring` (src/routes/recurring.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama template. |
| `templateType` | body | enum: `journal`, `sales_invoice`, `purchase_invoice` | ya | journal \| sales_invoice \| purchase_invoice (hanya journal yang bisa dieksekusi). |
| `frequency` | body | enum: `daily`, `weekly`, `monthly`, `quarterly`, `yearly` | ya | daily \| weekly \| monthly \| quarterly \| yearly. |
| `dayOfMonth` | body | `number` | tidak | Tanggal jalan dalam bulan untuk monthly/quarterly (opsional). |
| `nextRunDate` | body | `date` | ya | Tanggal eksekusi berikutnya (YYYY-MM-DD). |
| `templateData` | body | `object` | ya | Data template. Untuk journal: { narration, items: [{ accountId, debit, credit, partyId?, description? }] }; harus seimbang karena eksekusi tidak memvalidasi balance. |
| `templateData.narration` | body | `string` | ya |  |
| `templateData.items` | body | `array<object>` | ya |  |
| `templateData.items[].accountId` | body | `uuid` | ya |  |
| `templateData.items[].partyId` | body | `uuid` | tidak |  |
| `templateData.items[].debit` | body | `number` | ya |  |
| `templateData.items[].credit` | body | `number` | ya |  |
| `templateData.items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "rec_create",
  "args": {
    "name": "<name>",
    "templateType": "journal",
    "frequency": "daily",
    "nextRunDate": "2026-01-31",
    "templateData": {}
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
  "confirm": "Buat template berulang <name> (journal, daily) mulai 2026-01-31. Setujui?"
}
```

**Isi hasil:** Template yang dibuat. HTTP 201.

**Efek pembukuan/stok:** Tidak ada efek GL/stok saat template dibuat. Jurnal baru dibuat nanti oleh eksekusi template (scheduler harian 02:00 atau rec_execute).

**Teks konfirmasi:** Buat template berulang {name} ({templateType}, {frequency}) mulai {nextRunDate}. Setujui?

**Error umum**

- 400: validasi skema (tipe/frekuensi tidak dikenal)

**Tool terkait:** [`rec_execute`](#rec_execute), [`rec_update`](#rec_update)

### rec_delete

**Ringkasan:** Menonaktifkan template transaksi berulang (soft delete: isActive=false). Data template dan jurnal yang sudah dibuat tidak dihapus.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `recurring` / `edit`)
- **Handler:** `DELETE /api/recurring/:id` (src/routes/recurring.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID template (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "rec_delete",
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
  "confirm": "Nonaktifkan template berulang <id>? Setujui?"
}
```

**Isi hasil:** { message: 'Template berulang dinonaktifkan.' }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya menonaktifkan template; dapat diaktifkan kembali lewat rec_update).

**Teks konfirmasi:** Nonaktifkan template berulang {id}? Setujui?

**Tool terkait:** [`rec_update`](#rec_update), [`rec_list`](#rec_list)

### rec_execute

**Ringkasan:** Menjalankan satu template berulang sekarang. Untuk tipe journal langsung membuat dan memposting Jurnal Umum bertanggal hari ini; tipe lain mengembalikan success=false. Setelah berhasil, lastRunDate dan nextRunDate diperbarui.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `recurring` / `edit`)
- **Handler:** `POST /api/recurring/:id/execute` (src/routes/recurring.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID template (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "rec_execute",
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
  "confirm": "Jalankan template berulang <id> sekarang? Jurnal akan langsung diposting."
}
```

**Isi hasil:** { success, result (jurnal) } atau { success: false, error }.

**Efek pembukuan/stok:** Tipe journal: membuat Jurnal Umum berstatus Submitted dan memposting ke buku besar sesuai baris template (DR/CR menurut templateData); saldo akun diperbarui. Tidak memvalidasi total debit = kredit, jadi template harus seimbang. Tipe invoice: tidak ada efek.

**Teks konfirmasi:** Jalankan template berulang {id} sekarang? Jurnal akan langsung diposting.

**Prasyarat**

- Template bertipe journal dengan items valid
- Periode fiskal terbuka

**Error umum**

- 404: Template tidak ditemukan
- success=false: tipe belum didukung / gagal membuat jurnal

**Tool terkait:** [`rec_list`](#rec_list), [`rec_update`](#rec_update)

### rec_list

**Ringkasan:** Daftar semua template transaksi berulang (nama, tipe, frekuensi, tanggal jalan berikutnya, status aktif).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `recurring` / `view`)
- **Handler:** `GET /api/recurring` (src/routes/recurring.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rec_list",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: template[] (+ nama pembuat) } urut terbaru.>"
}
```

**Isi hasil:** { data: template[] (+ nama pembuat) } urut terbaru.

**Tool terkait:** [`rec_create`](#rec_create), [`rec_execute`](#rec_execute)

### rec_update

**Ringkasan:** Mengubah template transaksi berulang (nama, tipe, frekuensi, tanggal berikutnya, data template) atau mengaktifkan/menonaktifkannya lewat isActive. Semua field opsional (parsial).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `recurring` / `edit`)
- **Handler:** `PUT /api/recurring/:id` (src/routes/recurring.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID template (UUID). |
| `name` | body | `string` | tidak | Nama. |
| `templateType` | body | enum: `journal`, `sales_invoice`, `purchase_invoice` | tidak |  |
| `frequency` | body | enum: `daily`, `weekly`, `monthly`, `quarterly`, `yearly` | tidak |  |
| `dayOfMonth` | body | `number` | tidak |  |
| `nextRunDate` | body | `date` | tidak |  |
| `templateData` | body | `object` | tidak |  |
| `templateData.narration` | body | `string` | ya |  |
| `templateData.items` | body | `array<object>` | ya |  |
| `templateData.items[].accountId` | body | `uuid` | ya |  |
| `templateData.items[].partyId` | body | `uuid` | tidak |  |
| `templateData.items[].debit` | body | `number` | ya |  |
| `templateData.items[].credit` | body | `number` | ya |  |
| `templateData.items[].description` | body | `string` | tidak |  |
| `isActive` | body | `boolean` | tidak | false = nonaktifkan template. |

**Contoh pemanggilan**

```json
{
  "tool": "rec_update",
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
  "confirm": "Ubah template berulang <id>. Setujui?"
}
```

**Isi hasil:** Template setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung; mengubah apa yang akan dibukukan pada eksekusi berikutnya.

**Teks konfirmasi:** Ubah template berulang {id}. Setujui?

**Error umum**

- 404/500: template tidak ditemukan

**Tool terkait:** [`rec_list`](#rec_list), [`rec_delete`](#rec_delete)

### recon_add_items

**Ringkasan:** Menambahkan baris mutasi rekening koran (statement item) ke sesi rekonsiliasi Draft.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `POST /api/reconciliation/:id/items` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (harus Draft). |
| `items` | body | `array<object>` | ya | Daftar { statementAmount (Rp, + masuk / - keluar), statementDesc, statementDate }, minimal satu. |
| `items[].statementAmount` | body | `number` | ya |  |
| `items[].statementDesc` | body | `string` | tidak |  |
| `items[].statementDate` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "recon_add_items",
  "args": {
    "id": "<id>",
    "items": [
      {
        "statementAmount": 1
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
  "confirm": "Tambahkan [...] baris mutasi statement ke rekonsiliasi <id>. Setujui?"
}
```

**Isi hasil:** Item statement yang ditambahkan / sesi terbaru.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya menambah item statement pada sesi Draft).

**Teks konfirmasi:** Tambahkan {items} baris mutasi statement ke rekonsiliasi {id}. Setujui?

**Error umum**

- 400: Rekonsiliasi sudah selesai
- 400: Rekonsiliasi tidak ditemukan

**Tool terkait:** [`recon_match`](#recon_match), [`recon_get`](#recon_get)

### recon_complete

**Ringkasan:** Menyelesaikan (mengunci) sesi rekonsiliasi: status menjadi Completed dan tidak bisa diubah lagi (tidak ada endpoint membuka kembali). Wajib memiliki minimal satu item statement.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `POST /api/reconciliation/:id/complete` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (Draft). |

**Contoh pemanggilan**

```json
{
  "tool": "recon_complete",
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
  "confirm": "Selesaikan dan kunci rekonsiliasi <id>? Setelah selesai tidak bisa diubah. Setujui?"
}
```

**Isi hasil:** Sesi dengan status Completed.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Mengunci sesi (Completed) secara permanen; tidak bisa lagi ditambah/dicocokkan/dihapus.

**Teks konfirmasi:** Selesaikan dan kunci rekonsiliasi {id}? Setelah selesai tidak bisa diubah. Setujui?

**Error umum**

- 400: Rekonsiliasi sudah selesai
- 400: Tidak ada item statement

**Tool terkait:** [`recon_get`](#recon_get), [`recon_delete`](#recon_delete)

### recon_create

**Ringkasan:** Membuat sesi rekonsiliasi bank (Draft) untuk satu akun kas/bank pada tanggal statement tertentu. Saldo buku diambil dari saldo akun saat ini.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `POST /api/reconciliation` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `accountId` | body | `string` | ya | ID akun kas/bank (harus akun kas). |
| `statementDate` | body | `date` | ya | Tanggal rekening koran (YYYY-MM-DD). |
| `statementBalance` | body | `number` | ya | Saldo akhir menurut rekening koran (Rp). |
| `notes` | body | `string` | tidak | Catatan (opsional). |

**Contoh pemanggilan**

```json
{
  "tool": "recon_create",
  "args": {
    "accountId": "<id>",
    "statementDate": "2026-01-31",
    "statementBalance": 1
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
  "confirm": "Buat sesi rekonsiliasi akun <id> tanggal statement 2026-01-31, saldo statement Rp 1. Setujui?"
}
```

**Isi hasil:** Sesi rekonsiliasi Draft (id, saldo buku, saldo statement). HTTP 201.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (sesi Draft; hanya mencatat saldo buku dan saldo statement).

**Teks konfirmasi:** Buat sesi rekonsiliasi akun {accountId} tanggal statement {statementDate}, saldo statement Rp {statementBalance}. Setujui?

**Error umum**

- 400: Akun yang dipilih bukan akun kas/bank
- 400: Akun tidak ditemukan

**Tool terkait:** [`recon_add_items`](#recon_add_items), [`recon_list`](#recon_list)

### recon_delete

**Ringkasan:** Menghapus sesi rekonsiliasi berstatus Draft (beserta item statement-nya). Sesi Completed tidak bisa dihapus.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `DELETE /api/reconciliation/:id` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (Draft). |

**Contoh pemanggilan**

```json
{
  "tool": "recon_delete",
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
  "confirm": "Hapus sesi rekonsiliasi Draft <id>? Tidak bisa dibatalkan."
}
```

**Isi hasil:** { message } konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya menghapus data sesi Draft).

**Teks konfirmasi:** Hapus sesi rekonsiliasi Draft {id}? Tidak bisa dibatalkan.

**Error umum**

- 400: Hanya rekonsiliasi berstatus Draft yang dapat dihapus

**Tool terkait:** [`recon_list`](#recon_list)

### recon_get

**Ringkasan:** Detail satu sesi rekonsiliasi bank: akun, saldo buku, saldo statement, item statement beserta status pencocokan, dan hingga 200 entri buku besar akun yang belum dicocokkan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `view`)
- **Handler:** `GET /api/reconciliation/:id` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "recon_get",
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
  "data": "<Sesi + account, items (statementAmount, isMatched, ledgerEntryId) + unmatchedLedgerEntries>"
}
```

**Isi hasil:** Sesi + account, items (statementAmount, isMatched, ledgerEntryId) + unmatchedLedgerEntries (maksimum 200).

**Error umum**

- 404: Rekonsiliasi tidak ditemukan

**Tool terkait:** [`recon_add_items`](#recon_add_items), [`recon_match`](#recon_match), [`recon_complete`](#recon_complete)

### recon_list

**Ringkasan:** Daftar sesi rekonsiliasi bank dengan paging. Filter akun kas/bank, status (Draft/Completed), rentang tanggal statement, dan pencarian; tiap baris memuat jumlah item statement yang sudah dicocokkan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `view`)
- **Handler:** `GET /api/reconciliation` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Per halaman (default 50, maksimum 200). |
| `accountId` | query | `string` | tidak | ID akun kas/bank. |
| `status` | query | enum: `Draft`, `Completed` | tidak | Status sesi. |
| `startDate` | query | `date` | tidak | Tanggal statement dari. |
| `endDate` | query | `date` | tidak | Tanggal statement sampai. |
| `search` | query | `string` | tidak | Cari nama/nomor akun atau catatan. |
| `sort` | query | `string` | tidak | statementDate, account, bookBalance, statementBalance, createdAt; awalan - = menurun (default -statementDate). |

**Contoh pemanggilan**

```json
{
  "tool": "recon_list",
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
  "data": "<{ data: sesi rekonsiliasi (akun, saldo buku, saldo statement, status, hitungan item cocok)>"
}
```

**Isi hasil:** { data: sesi rekonsiliasi (akun, saldo buku, saldo statement, status, hitungan item cocok), total, page, limit }.

**Tool terkait:** [`recon_get`](#recon_get), [`recon_create`](#recon_create)

### recon_match

**Ringkasan:** Mencocokkan satu item statement dengan satu entri buku besar (ledger entry) akun yang sama pada sesi Draft.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `PATCH /api/reconciliation/:id/match` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (Draft). |
| `itemId` | body | `string` | ya | ID item statement. |
| `ledgerEntryId` | body | `string` | ya | ID entri buku besar milik akun yang sama. |

**Contoh pemanggilan**

```json
{
  "tool": "recon_match",
  "args": {
    "id": "<id>",
    "itemId": "<id>",
    "ledgerEntryId": "<id>"
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
  "confirm": "Cocokkan item statement <id> dengan ledger entry <id>. Setujui?"
}
```

**Isi hasil:** Item statement yang sudah cocok.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya menandai item cocok dengan ledger entry).

**Teks konfirmasi:** Cocokkan item statement {itemId} dengan ledger entry {ledgerEntryId}. Setujui?

**Error umum**

- 400: Item sudah dicocokkan
- 400: Ledger entry tidak ditemukan atau bukan milik akun ini
- 400: Rekonsiliasi sudah selesai

**Tool terkait:** [`recon_unmatch`](#recon_unmatch), [`recon_complete`](#recon_complete)

### recon_unmatch

**Ringkasan:** Membatalkan pencocokan satu item statement pada sesi rekonsiliasi Draft.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant (modul `reconciliation` / `edit`)
- **Handler:** `PATCH /api/reconciliation/:id/unmatch` (src/routes/reconciliation.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi rekonsiliasi (Draft). |
| `itemId` | body | `string` | ya | ID item statement. |

**Contoh pemanggilan**

```json
{
  "tool": "recon_unmatch",
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
  "confirm": "Batalkan pencocokan item statement <id> pada rekonsiliasi <id>. Setujui?"
}
```

**Isi hasil:** Item statement dengan isMatched=false.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya melepas tanda cocok).

**Teks konfirmasi:** Batalkan pencocokan item statement {itemId} pada rekonsiliasi {id}. Setujui?

**Error umum**

- 400: Item tidak ditemukan
- 400: Rekonsiliasi sudah selesai

**Tool terkait:** [`recon_match`](#recon_match)


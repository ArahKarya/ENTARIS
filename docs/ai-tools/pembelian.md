# Toolset: Pembelian (`pembelian`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/pembelian` · 28 tool (read 12, write 5, critical 11)

## Tujuan

Toolset **pembelian** memungkinkan AIRA melihat dan menjalankan rantai pengadaan Entaris: Purchase Order (PO), Penerimaan Barang (STT/BPB), Invoice Pembelian (PI), dan Uang Muka Vendor. Tool baca (daftar, detail, ringkasan, pratinjau three-way match) aman dipanggil otomatis. Tool tulis membuat dokumen perencanaan atau posting ke stok dan buku besar, sehingga setiap penulisan melewati konfirmasi/persetujuan; pembatalan dan pembayaran selalu bertingkat kritis.

## ALUR BISNIS

### Alur bisnis

Rantai dokumen pembelian (Phase 4+). Setiap langkah **independen**: PO boleh dilewati, dan PI boleh dibuat tanpa STT (mode legacy/standalone).

```
PO (perencanaan, tanpa GL/stok)
  -> (opsional, tautan purchaseOrderId)
STT/BPB (stok masuk + accrual hutang belum tagih)
  -> (opsional, tautan goodsReceiptItemId pada baris PI)
PI (harga aktual + selisih harga + hutang usaha riil)
  -> Pembayaran "Pay" (toolset kas-bank, tool pay_record)
```

**Purchase Order (PO)**
- Status dokumen: `Draft` -> `Submitted` -> (`Cancelled`). PO bisa **Umum** (`partyId` kosong, boleh dipenuhi pemasok mana pun) atau **Khusus** (terikat satu pemasok).
- `po_create` dengan `saveAs=draft` menyimpan Draft; `saveAs=submit` (default) langsung mengajukan. `po_submit` mengajukan Draft yang sudah ada.
- Jika ada `ApprovalRule` aktif untuk dokumen `PurchaseOrder` dan grand total >= `minAmount`, PO **tetap Draft** dengan `approvalStatus=Pending` + `ApprovalRequest`. Setelah disetujui -> `Submitted`; ditolak -> kembali Draft dengan `approvalNote`. Di daftar, kondisi ini tampil sebagai `displayStatus=PendingApproval` (filter `status=PendingApproval`).
- `po_update` mengganti seluruh item selama PO belum dipakai STT/PI aktif dan tidak menunggu persetujuan. Pada PO Submitted, kenaikan grand total yang melampaui batas ApprovalRule ditolak.
- `po_delete` hanya untuk Draft. PO yang sudah dipesan **dibatalkan** (`po_cancel`), bukan dihapus.
- `po_close` = **short-close**: status tetap `Submitted`, `closedAt` terisi, sisa kuantitas dianggap tidak datang; PO tidak bisa dipakai STT baru. Alasan wajib (min 5 karakter).
- Status penerimaan turunan (`receiptStatus`): `unreceived`, `partial`, `full`, `closed` (dari `qtyReceived` vs `quantity` item). `isOverdue` = PO terbuka dengan tanggal kirim lewat dan belum lengkap diterima.

**Penerimaan Barang (STT/BPB)**
- Nomor `STT-...`. `gr_create` langsung berstatus `Submitted` (tidak ada draft): memposting stok masuk per gudang dan jurnal accrual.
- Harga di STT **tidak wajib**. Bila `lockedUnitCost` = 0/kosong, dipakai `averageCost` saat ini sebagai harga provisional. Harga aktual baru muncul di PI.
- Terkait PO: PO harus `Submitted`, belum ditutup, belum dibatalkan. `qtyReceived` item PO bertambah.
- **Barang titipan pelanggan** (`isCustomerOwned=true`, jasa repros): GL nol, tidak boleh terkait PO, dan tidak pernah ditagih PI.
- `gr_pending` = STT `Submitted`, belum ditagih (`invoiceId` kosong), bukan legacy, bukan titipan, untuk satu pemasok. Dipakai saat menyusun PI.
- Filter daftar STT (`status`): `Uninvoiced`, `Invoiced`, `CustomerOwned`, `Cancelled`, `Draft`, `Submitted`. STT virtual hasil backfill PI lama (`isLegacyBackfill=true`) disembunyikan kecuali `includeLegacy=true`.

**Invoice Pembelian (PI)**
- Status: `Draft`, `Submitted`, `PartiallyPaid`, `Paid`, `Overdue`, `Cancelled`. `outstanding` = sisa hutang ke pemasok.
- PI **standalone**: stok masuk + WAC dibuat oleh PI. PI **tertaut STT** (baris dengan `goodsReceiptItemId`): stok **tidak** dibuat ulang; PI hanya memposting hutang riil dan selisih harga; `STT.invoiceId` terisi.
- `pi_update` hanya mengubah `notes` dan `dueDate` (bukan baris/harga). Koreksi harga setelah posting = `pi_revise_price`.
- `pi_match_preview` memberi three-way match PO-STT-faktur untuk draf baris yang belum disimpan; hanya saran, tidak pernah memblokir. `pi_get` menyertakan ringkasan `match` yang sama.
- Pembayaran PI dilakukan lewat toolset **kas-bank** (`pay_record` tipe `Pay`), atau lewat aplikasi uang muka (`vdep_apply`).

**Uang Muka Vendor**
- Uang muka dibuat lewat `pay_record` dengan `paymentType=VendorDeposit` (toolset kas-bank), bukan lewat toolset ini. Toolset ini melihat saldo, mengaplikasikan, membatalkan, dan menyelesaikan (refund/offset).
- `vdep_apply` mengaplikasikan sisa uang muka ke PI pemasok yang sama; `vdep_refund` menyelesaikan sisa lewat offset ke hutang (FIFO PI terlama) dan/atau pengembalian kas.
- `vdep_list` punya dua mode: tanpa `page` (semua uang muka, mode legacy) dan dengan `page` (paging + status turunan `Active`/`PartiallyUsed`/`FullyUsed`).

### Aturan posting

| Langkah | Jurnal / efek |
|---|---|
| PO (buat/ubah/ajukan/tutup/batal) | Tidak ada GL, stok, WAC |
| STT submit (`gr_create`) | DR Persediaan (1.4.0) / CR Hutang Belum Tagih (2.1.5). Stok masuk, WAC dihitung ulang. Titipan pelanggan: GL nol |
| STT batal (`gr_cancel`) | Jurnal balik `JV-{stt}-CXL`: DR 2.1.5 / CR 1.4.0; stok dibalik; `qtyReceived` PO dikurangi |
| PI standalone (`pi_create`, role bypass) | DR Persediaan (per akun item) / CR Hutang Usaha (2.1.1); stok masuk + WAC; backfill COGS stok minus |
| PI dari STT | DR Hutang Belum Tagih (2.1.5) +/- Selisih Harga Pembelian (5.11) / CR Hutang Usaha (2.1.1); stok tidak dibuat ulang |
| Revisi harga PI (`pi_revise_price`) | Delta = (rate baru - lama) x qty. Porsi masih di stok -> Persediaan + koreksi WAC; porsi sudah keluar -> 5.11. Lawan selalu Hutang Usaha (2.1.1) |
| PI batal (`pi_cancel`) | Reverse GL, stok yang dibuat PI dibalik, STT dilepas (`invoiceId` dikosongkan) |
| Aplikasi uang muka (`vdep_apply`) | DR Hutang Usaha (2.1.1) / CR Uang Muka Vendor (1.3); outstanding PI turun |
| Refund/offset uang muka (`vdep_refund`) | Offset: DR 2.1.1 / CR 1.3. Refund kas: DR Kas/Bank / CR 1.3 |
| Batal uang muka (`vdep_cancel`) | Soft-cancel jurnal (DR 1.3 / CR Kas-Bank dibalik) |

Biaya tambahan di PI (`biayaLain`, potongan item, PPN, PPh) dialokasikan sebagai **landed cost**. Total debit selalu sama dengan total kredit.

### Persetujuan

- **Gate `needsApproval(role)`**: role tanpa capability `approval.bypass` (default hanya Admin yang bypass). Untuk `pi_create` role non-bypass menghasilkan **HTTP 202** `{ pendingApproval: true, request }` dan **tidak ada** dokumen/GL/stok sampai disetujui (`ApprovalRequest` tipe `PurchaseInvoice`; eksekusi memakai pengaju sebagai aktor). Admin langsung memposting.
- `pi_revise_price` non-bypass: antrian `PurchaseInvoiceRevisePrice` (HTTP 202). Satu permintaan Pending per PI (409 bila duplikat). Payload menyimpan snapshot `_before` untuk perbandingan.
- PO: persetujuan berbasis `ApprovalRule` (nilai minimum), bukan role. Hasil: PO Draft + `approvalStatus=Pending`.
- Pembatalan (`po_cancel`, `po_close`, `gr_cancel`, `pi_cancel`, `vdep_apply_cancel`) butuh capability `doc.cancel` (default hanya Admin). Catatan: `vdep_cancel` (batal uang muka) **tidak** dijaga capability, hanya izin edit modul `vendor_deposit`.
- STT dan `vdep_apply`/`vdep_refund` tidak melewati antrian approval: langsung memposting.

### Jebakan umum

- **STT tidak punya harga wajib.** Jangan menyimpulkan nilai persediaan dari STT; nilai aktual ada di PI. Selisih antara harga provisional STT dan harga PI masuk ke 5.11.
- **Membatalkan STT yang sudah ditagih** ditolak sampai PI-nya dibatalkan; PI yang sudah punya pembayaran teralokasi atau uang muka aktif juga tidak bisa dibatalkan (batalkan pembayaran/aplikasi dulu). Urutan pembatalan: pembayaran/aplikasi uang muka -> PI -> STT.
- `gr_cancel` menolak bila stok tidak cukup untuk dibalikkan (barang sudah dipakai/dijual). Opsi `allowNegativeStock` + `negativeStockReason` (min 10 karakter) hanya untuk override Admin.
- STT titipan pelanggan tidak muncul di `gr_pending` dan tidak bisa ditagih; jangan menaut ke PO.
- PO Draft tidak dibatalkan, tetapi dihapus; PO Submitted tidak dihapus, tetapi dibatalkan atau ditutup.
- `po_close` tidak mengubah `status` (tetap `Submitted`); gunakan `receiptStatus=closed` atau `closedAt` untuk mengenalinya.
- `pi_create` bisa mengembalikan 202 (antrian) alih-alih dokumen. Jangan menganggap PI sudah ada sebelum disetujui.
- `vdep_apply` mensyaratkan pemasok uang muka dan PI sama, serta jumlah tidak melebihi sisa uang muka maupun outstanding PI.
- Format tanggal selalu `YYYY-MM-DD`. ID bertipe UUID kecuali dinyatakan lain.
- Yang **tidak ada** di kode saat ini: tool khusus persetujuan PO tahap lanjut (approval-nya lewat `ApprovalRule` + toolset persetujuan), outstanding PO dan kinerja pemasok ada di toolset **laporan** (`/api/reports/po-outstanding`, `/api/reports/supplier-performance`), bukan di toolset ini.

### Peta istilah

| Istilah bisnis | Padanan di sistem |
|---|---|
| PO / Pesanan Pembelian | `PurchaseOrder`, nomor `PO-...`, status `Draft/Submitted/Cancelled` |
| PO Umum / PO Khusus | `partyId` kosong / terisi |
| Tutup PO (short-close) | `po_close`, `closedAt` |
| STT / BPB / Penerimaan Barang | `GoodsReceipt`, nomor `STT-...`; STT/BPB = Bukti Penerimaan Barang (dokumen yang sama) |
| Hutang Belum Tagih / accrual | akun 2.1.5, dibentuk saat STT, dibalik saat PI |
| PI / Faktur Pembelian | `PurchaseInvoice`, nomor `PI-...`, status `Draft/Submitted/PartiallyPaid/Paid/Overdue/Cancelled` |
| Hutang Usaha / AP | akun 2.1.1, `outstanding` pada PI |
| Selisih Harga Pembelian | akun 5.11 (varian harga STT vs PI, revisi harga) |
| Persediaan | akun 1.4.0 (atau akun persediaan per item) |
| WAC / HPP rata-rata | `averageCost` item (weighted average cost) |
| Uang Muka Vendor / DP Vendor | akun 1.3, `Payment` tipe `VendorDeposit` |
| Offset uang muka | `vdep_refund` bagian `offsetAmount` |
| Three-way match | pencocokan PO - STT - PI (`pi_match_preview`, `match` pada `pi_get`) |
| Barang titipan | `isCustomerOwned=true` pada STT |
| Revisi harga | `pi_revise_price` |
| Timbangan diterima / refaksi | `timbanganDiterima` / `refaksi` pada baris PI (bahan baku curah) |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`gr_cancel`](#gr_cancel) | critical | tidak | `POST /api/goods-receipts/:id/cancel` |
| [`gr_create`](#gr_create) | critical | tidak | `POST /api/goods-receipts` |
| [`gr_get`](#gr_get) | read | - | `GET /api/goods-receipts/:id` |
| [`gr_list`](#gr_list) | read | - | `GET /api/goods-receipts` |
| [`gr_pending`](#gr_pending) | read | - | `GET /api/goods-receipts/pending` |
| [`pi_cancel`](#pi_cancel) | critical | tidak | `POST /api/purchase/invoices/:id/cancel` |
| [`pi_create`](#pi_create) | critical | ya | `POST /api/purchase/invoices` |
| [`pi_get`](#pi_get) | read | - | `GET /api/purchase/invoices/:id` |
| [`pi_list`](#pi_list) | read | - | `GET /api/purchase/invoices` |
| [`pi_match_preview`](#pi_match_preview) | read | - | `POST /api/purchase/invoices/match-preview` |
| [`pi_revise_price`](#pi_revise_price) | critical | ya | `POST /api/purchase/invoices/:id/revise-price` |
| [`pi_summary`](#pi_summary) | read | - | `GET /api/purchase/invoices/summary` |
| [`pi_update`](#pi_update) | write | tidak | `PUT /api/purchase/invoices/:id` |
| [`po_cancel`](#po_cancel) | critical | tidak | `POST /api/purchase-orders/:id/cancel` |
| [`po_close`](#po_close) | critical | tidak | `POST /api/purchase-orders/:id/close` |
| [`po_create`](#po_create) | write | ya | `POST /api/purchase-orders` |
| [`po_delete`](#po_delete) | write | ya | `DELETE /api/purchase-orders/:id` |
| [`po_get`](#po_get) | read | - | `GET /api/purchase-orders/:id` |
| [`po_list`](#po_list) | read | - | `GET /api/purchase-orders` |
| [`po_submit`](#po_submit) | write | ya | `POST /api/purchase-orders/:id/submit` |
| [`po_update`](#po_update) | write | ya | `PUT /api/purchase-orders/:id` |
| [`vdep_apply`](#vdep_apply) | critical | tidak | `POST /api/vendor-deposits/apply` |
| [`vdep_apply_cancel`](#vdep_apply_cancel) | critical | tidak | `POST /api/vendor-deposits/apply/:id/cancel` |
| [`vdep_balance`](#vdep_balance) | read | - | `GET /api/vendor-deposits/balance/:partyId` |
| [`vdep_cancel`](#vdep_cancel) | critical | tidak | `PATCH /api/vendor-deposits/:id/cancel` |
| [`vdep_list`](#vdep_list) | read | - | `GET /api/vendor-deposits` |
| [`vdep_refund`](#vdep_refund) | critical | tidak | `POST /api/vendor-deposits/:id/refund` |
| [`vdep_summary`](#vdep_summary) | read | - | `GET /api/vendor-deposits/summary` |

## Rincian tool

### gr_cancel

**Ringkasan:** Membatalkan STT: stok dikembalikan (reverse stock movement), jurnal accrual dibalik, dan qtyReceived PO dikurangi. Ditolak bila stok tidak cukup untuk dibalikkan (kecuali allowNegativeStock dengan alasan minimal 10 karakter), bila STT legacy, atau bila PI terkait masih aktif (batalkan PI dulu).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `goods_receipt` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/goods-receipts/:id/cancel` (src/routes/goodsReceipts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID STT (UUID). |
| `allowNegativeStock` | body | `boolean` | tidak | true = abaikan guard stok minus saat membalikkan stok (override Admin). |
| `negativeStockReason` | body | `string` | tidak | Alasan bypass stok minus; wajib minimal 10 karakter bila allowNegativeStock=true. |

**Contoh pemanggilan**

```json
{
  "tool": "gr_cancel",
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
  "confirm": "Batalkan STT <id>? Stok akan dikembalikan dan accrual hutang dibalik."
}
```

**Isi hasil:** STT dengan status Cancelled.

**Efek pembukuan/stok:** Reverse stok masuk (stok & per-gudang berkurang, WAC dihitung ulang dari riwayat). Jurnal balik JV-{stt}-CXL: DR Hutang Belum Tagih (2.1.5) / CR Persediaan (1.4.0); jurnal asal berstatus Cancelled. qtyReceived PO dikurangi.

**Teks konfirmasi:** Batalkan STT {id}? Stok akan dikembalikan dan accrual hutang dibalik.

**Prasyarat**

- STT berstatus Submitted
- PI terkait (bila ada) sudah dibatalkan

**Error umum**

- 400: STT sudah dibatalkan
- 400: STT legacy - batalkan PI-nya
- 400: ada PI Paid / PI belum dibatalkan
- 400: stok tidak cukup untuk dibalikkan
- 400: alasan bypass stok minus wajib (min 10 karakter)

**Tool terkait:** [`pi_cancel`](#pi_cancel), [`gr_get`](#gr_get)

### gr_create

**Ringkasan:** Mencatat Penerimaan Barang (STT/BPB) dari pemasok: langsung memposting stok masuk per gudang dan accrual hutang belum tagih. Boleh terkait PO (menambah qtyReceived PO). Harga item opsional: bila 0, dipakai averageCost saat ini sebagai harga provisional; harga aktual datang dari PI.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `goods_receipt` / `edit`)
- **Handler:** `POST /api/goods-receipts` (src/routes/goodsReceipts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal penerimaan (YYYY-MM-DD). |
| `partyId` | body | `uuid` | ya | ID pemasok (wajib, harus Supplier/Both aktif). |
| `purchaseOrderId` | body | `uuid` | tidak | ID PO asal (opsional). Tidak boleh untuk barang titipan; PO harus Submitted, belum ditutup/dibatalkan. |
| `isCustomerOwned` | body | `boolean` | tidak | true = barang titipan pelanggan (jasa repros): GL nol, tidak bisa ditagih PI. |
| `nomorMobil` | body | `string` | tidak | Nomor kendaraan pengirim. |
| `driverName` | body | `string` | tidak |  |
| `recipientName` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Baris: inventoryItemId, warehouseId, itemName, quantity, unit wajib; lockedUnitCost harga provisional opsional; purchaseOrderItemId untuk menautkan ke baris PO. |
| `items[].inventoryItemId` | body | `uuid` | ya |  |
| `items[].warehouseId` | body | `uuid` | ya |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].lockedUnitCost` | body | `number` | tidak | aktual, selisih posted ke "Selisih Harga Pembelian". |
| `items[].description` | body | `string` | tidak |  |
| `items[].purchaseOrderItemId` | body | `uuid` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "gr_create",
  "args": {
    "date": "2026-01-31",
    "partyId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "inventoryItemId": "00000000-0000-0000-0000-000000000000",
        "warehouseId": "00000000-0000-0000-0000-000000000000",
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
  "confirm": "Catat penerimaan barang dari pemasok 00000000-0000-0000-0000-000000000000 tanggal 2026-01-31, [...] baris item. Stok dan hutang belum tagih akan dibukukan. Setujui?"
}
```

**Isi hasil:** STT yang dibuat (id, sttNumber, status Submitted). HTTP 201.

**Efek pembukuan/stok:** Stok masuk (StockMovement In) + stok per gudang bertambah; WAC dihitung ulang dengan lockedUnitCost (atau averageCost bila 0). Jurnal: DR Persediaan (1.4.0) / CR Hutang Belum Tagih (2.1.5). qtyReceived item PO bertambah bila terkait PO. Barang titipan pelanggan (isCustomerOwned): GL nol dan tidak bisa ditagih.

**Teks konfirmasi:** Catat penerimaan barang dari pemasok {partyId} tanggal {date}, {items} baris item. Stok dan hutang belum tagih akan dibukukan. Setujui?

**Prasyarat**

- Periode fiskal terbuka
- Pemasok & item & gudang aktif
- Jika terkait PO: PO Submitted dan belum ditutup

**Error umum**

- 400: pemasok tidak aktif/bukan supplier
- 400: PO sudah dibatalkan/belum dipesan/sudah ditutup
- 400: item atau gudang tidak ditemukan/tidak aktif

**Tool terkait:** [`gr_pending`](#gr_pending), [`pi_create`](#pi_create), [`gr_cancel`](#gr_cancel), [`po_get`](#po_get)

### gr_get

**Ringkasan:** Detail satu STT/BPB: item (barang, gudang, stock movement, baris PO), pemasok, PO asal, dan invoice (PI) yang menaganinya bila ada.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `goods_receipt` / `view`)
- **Handler:** `GET /api/goods-receipts/:id` (src/routes/goodsReceipts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID STT (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "gr_get",
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
  "data": "<Objek STT lengkap dengan items, supplier, invoice{id,invoiceNumber,status,grandTotal}, pur>"
}
```

**Isi hasil:** Objek STT lengkap dengan items, supplier, invoice{id,invoiceNumber,status,grandTotal}, purchaseOrder, user.

**Error umum**

- 404: STT tidak ditemukan

**Tool terkait:** [`gr_list`](#gr_list), [`gr_cancel`](#gr_cancel)

### gr_list

**Ringkasan:** Daftar Penerimaan Barang (STT/BPB) dengan paging. Filter status faktur (Uninvoiced, Invoiced, CustomerOwned, Cancelled, Draft, Submitted), pemasok, tanggal, dan pencarian nomor STT/pemasok/no. mobil/PO. STT legacy hasil backfill disembunyikan kecuali includeLegacy=true.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `goods_receipt` / `view`)
- **Handler:** `GET /api/goods-receipts` (src/routes/goodsReceipts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Per halaman (default 50, maksimum 200). |
| `status` | query | enum: `Uninvoiced`, `Invoiced`, `CustomerOwned`, `Cancelled`, `Draft`, `Submitted` | tidak | Uninvoiced = belum ditagih PI; Invoiced = sudah ditautkan ke PI; CustomerOwned = barang titipan pelanggan. |
| `partyId` | query | `uuid` | tidak | ID pemasok. |
| `startDate` | query | `date` | tidak | Tanggal dari (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal sampai (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor STT, pemasok, no. mobil, atau nomor PO. |
| `includeLegacy` | query | `boolean` | tidak | true = sertakan STT virtual hasil backfill PI lama. |
| `sort` | query | `string` | tidak | date, sttNumber, supplier; awalan - = menurun (default -date). |

**Contoh pemanggilan**

```json
{
  "tool": "gr_list",
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
  "data": "<{ data: STT[] (+ supplier, invoice, purchaseOrder, jumlah item), total, page, limit }.>"
}
```

**Isi hasil:** { data: STT[] (+ supplier, invoice, purchaseOrder, jumlah item), total, page, limit }.

**Error umum**

- 400: status/format tanggal tidak dikenal

**Tool terkait:** [`gr_get`](#gr_get), [`gr_pending`](#gr_pending), [`gr_create`](#gr_create)

### gr_pending

**Ringkasan:** STT milik satu pemasok yang berstatus Submitted dan belum ditagih (belum terhubung ke Invoice Pembelian), tidak termasuk STT legacy dan barang titipan pelanggan. Dipakai untuk memilih STT saat membuat PI.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `goods_receipt` / `view`)
- **Handler:** `GET /api/goods-receipts/pending` (src/routes/goodsReceipts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `uuid` | ya | ID pemasok (wajib). |

**Contoh pemanggilan**

```json
{
  "tool": "gr_pending",
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
  "data": "<{ data: STT[] beserta item (inventoryItem, gudang) dan pemasok }, urut tanggal naik.>"
}
```

**Isi hasil:** { data: STT[] beserta item (inventoryItem, gudang) dan pemasok }, urut tanggal naik.

**Error umum**

- 400: partyId wajib diisi

**Tool terkait:** [`pi_create`](#pi_create), [`pi_match_preview`](#pi_match_preview)

### pi_cancel

**Ringkasan:** Membatalkan Invoice Pembelian: jurnal faktur dibalik, stok yang dibuat PI dikembalikan, STT terkait dilepas (invoiceId dikosongkan, stok milik STT tidak terganggu). Ditolak bila faktur sudah lunas, punya pembayaran teralokasi, atau punya alokasi uang muka aktif.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `purchase_invoice` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/purchase/invoices/:id/cancel` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice pembelian (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pi_cancel",
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
  "confirm": "Batalkan Invoice Pembelian <id>? Jurnal dan stok terkait akan dibalik."
}
```

**Isi hasil:** { id, status: 'Cancelled' }.

**Efek pembukuan/stok:** Reverse GL faktur (jurnal Cancelled, saldo akun dibalik, outstanding = 0, outstanding pemasok dihitung ulang); stok yang dibuat PI dibalik; STT terkait kembali 'belum ditagih'.

**Teks konfirmasi:** Batalkan Invoice Pembelian {id}? Jurnal dan stok terkait akan dibalik.

**Error umum**

- 400: Invoice sudah dibatalkan
- 400: Invoice sudah lunas
- 400: Invoice memiliki pembayaran teralokasi - batalkan pembayaran dulu
- 400: Invoice memiliki alokasi uang muka aktif - batalkan alokasi dulu

**Tool terkait:** [`pay_cancel`](kas-bank.md#pay_cancel), [`vdep_apply_cancel`](#vdep_apply_cancel), [`gr_cancel`](#gr_cancel)

### pi_create

**Ringkasan:** Membuat Invoice Pembelian dengan harga aktual. Untuk role tanpa capability approval.bypass (non-Admin) dokumen tidak dibuat: payload diantrekan sebagai ApprovalRequest PurchaseInvoice (HTTP 202) dan baru dibuat saat disetujui. Untuk role bypass, langsung diposting.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `edit`)
- **Handler:** `POST /api/purchase/invoices` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal faktur (YYYY-MM-DD). |
| `partyId` | body | `string` | ya | ID pemasok. |
| `items` | body | `array<object>` | ya | Baris: itemName, quantity, rate wajib (rate boleh negatif untuk potongan jasa); inventoryItemId, warehouseId, goodsReceiptItemId (tautan STT), timbanganDiterima, discount, taxPct, pphPct, potonganItem opsional. |
| `items[].itemName` | body | `string` | ya |  |
| `items[].itemType` | body | enum: `product`, `service` | tidak |  |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].warehouseId` | body | `uuid` | tidak | multi-warehouse: source for SI, destination for PI |
| `items[].serviceItemId` | body | `uuid` | tidak |  |
| `items[].accountId` | body | `uuid` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].discount` | body | `number` | tidak | persen diskon per baris |
| `items[].taxPct` | body | `number` | tidak | PPN % per baris |
| `items[].pphPct` | body | `number` | tidak | PPh % per baris |
| `items[].description` | body | `string` | tidak |  |
| `items[].deliveryOrderItemId` | body | `uuid` | tidak | From-DO line: skip stock-out (DO already did) + use locked unitCost for COGS. |
| `items[].sourceMovementId` | body | `uuid` | tidak | the sales line for Phase 6 "loaded margin" reports. |
| `items[].rate` | body | `number` | ya | (mis. potongan jasa angkutan vendor pakai armada perusahaan). |
| `items[].kualitas` | body | `string` | tidak |  |
| `items[].refaksi` | body | `number` | tidak |  |
| `items[].timbanganTruk` | body | `number` | tidak |  |
| `items[].timbanganDiterima` | body | `number` | tidak |  |
| `items[].nomorMobil` | body | `string` | tidak |  |
| `items[].potonganItem` | body | `number` | tidak |  |
| `items[].goodsReceiptItemId` | body | `uuid` | tidak | (STT yang sudah create). PI hanya post AP + variance harga. |
| `dueDate` | body | `date` | tidak | Tanggal jatuh tempo (opsional). |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `terms` | body | `string` | tidak | Termin/syarat pembayaran (opsional). |
| `taxPct` | body | `number` | tidak | PPN % tingkat header. |
| `biayaLain` | body | `number` | tidak | Biaya lain tingkat header (boleh negatif = potongan tagihan). |
| `potongan` | body | `number` | tidak | Diturunkan server dari potonganItem per baris; nilai header diabaikan. |

**Contoh pemanggilan**

```json
{
  "tool": "pi_create",
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
  "confirm": "Buat Invoice Pembelian dari pemasok <id> tanggal 2026-01-31, [...] baris. Role non-Admin akan masuk antrian persetujuan. Setujui?"
}
```

**Isi hasil:** Bypass: PI yang dibuat (HTTP 201). Non-bypass: { pendingApproval: true, request, message } (HTTP 202).

**Efek pembukuan/stok:** Cabang non-bypass: tidak ada efek GL/stok sampai disetujui (ApprovalRequest Pending, notifikasi ke Admin). Cabang bypass/standalone: DR Persediaan (akun persediaan per item) / CR Hutang Usaha (2.1.1), stok masuk + WAC, penyelesaian backfill COGS stok minus; PPN/PPh/potongan/biaya lain dialokasikan (landed cost). Baris tertaut STT (goodsReceiptItemId): stok tidak dibuat ulang; DR Hutang Belum Tagih (2.1.5) +/- Selisih Harga Pembelian (5.11) / CR Hutang Usaha (2.1.1) dan STT.invoiceId diisi.

**Teks konfirmasi:** Buat Invoice Pembelian dari pemasok {partyId} tanggal {date}, {items} baris. Role non-Admin akan masuk antrian persetujuan. Setujui?

**Prasyarat**

- Pemasok aktif
- Periode fiskal terbuka
- STT yang ditautkan belum dibatalkan dan belum ditagih

**Error umum**

- 400: STT sudah dibatalkan / sudah ditagih / pemasok berbeda
- 202: menunggu persetujuan (bukan error)

**Tool terkait:** [`gr_pending`](#gr_pending), [`pi_match_preview`](#pi_match_preview), [`pay_record`](kas-bank.md#pay_record), [`pi_cancel`](#pi_cancel)

### pi_get

**Ringkasan:** Detail satu Invoice Pembelian: pemasok, baris (dengan STT asal per baris), alokasi pembayaran, aplikasi uang muka vendor, dan ringkasan three-way match PO-STT-faktur.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `view`)
- **Handler:** `GET /api/purchase/invoices/:id` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice pembelian (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "pi_get",
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
  "data": "<PI + items(goodsReceiptItem), depositApplications, paymentAllocations, match (ringkasan th>"
}
```

**Isi hasil:** PI + items(goodsReceiptItem), depositApplications, paymentAllocations, match (ringkasan three-way match, bisa null).

**Error umum**

- 404: Invoice tidak ditemukan

**Tool terkait:** [`pi_list`](#pi_list), [`pi_cancel`](#pi_cancel), [`pi_revise_price`](#pi_revise_price)

### pi_list

**Ringkasan:** Daftar Invoice Pembelian (PI) dengan paging. Filter status, pemasok, tanggal, dan pencarian nomor faktur/pemasok. Mengembalikan item per faktur.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `view`)
- **Handler:** `GET /api/purchase/invoices` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Per halaman (default 50, maksimum 500). |
| `status` | query | enum: `Draft`, `Submitted`, `Paid`, `PartiallyPaid`, `Overdue`, `Cancelled` | tidak | Status faktur. |
| `partyId` | query | `string` | tidak | ID pemasok. |
| `startDate` | query | `date` | tidak | Tanggal faktur dari (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal faktur sampai (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor faktur atau nama pemasok. |
| `sort` | query | `string` | tidak | date, dueDate, invoiceNumber, supplier, grandTotal, outstanding; awalan - = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "pi_list",
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
  "data": "<{ data: PI[] (+ supplier, items), total, page, limit }.>"
}
```

**Isi hasil:** { data: PI[] (+ supplier, items), total, page, limit }.

**Error umum**

- 400: status faktur/format tanggal tidak dikenal

**Tool terkait:** [`pi_summary`](#pi_summary), [`pi_get`](#pi_get), [`pay_record`](kas-bank.md#pay_record)

### pi_match_preview

**Ringkasan:** Pratinjau three-way match (PO - STT - faktur) untuk baris faktur yang belum disimpan. Hanya bersifat saran (advisory) dan tidak pernah memblokir penyimpanan; tidak menyimpan apa pun.

- **Risk / tier:** `read` / Auto (POST murni baca)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `view`)
- **Handler:** `POST /api/purchase/invoices/match-preview` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `items` | body | `array<object>` | ya | Baris faktur: quantity, rate wajib; itemName, unit, timbanganDiterima, discount, goodsReceiptItemId opsional (maksimum 500). |
| `items[].itemName` | body | `string` | tidak |  |
| `items[].unit` | body | `string` | tidak |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].timbanganDiterima` | body | `number` | tidak |  |
| `items[].rate` | body | `number` | ya |  |
| `items[].discount` | body | `number` | tidak |  |
| `items[].goodsReceiptItemId` | body | `uuid` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "pi_match_preview",
  "args": {
    "items": [
      {
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
  "kind": "read",
  "data": "<Hasil pencocokan per baris (selisih kuantitas/harga terhadap PO dan STT).>"
}
```

**Isi hasil:** Hasil pencocokan per baris (selisih kuantitas/harga terhadap PO dan STT).

**Tool terkait:** [`pi_create`](#pi_create), [`gr_pending`](#gr_pending)

### pi_revise_price

**Ringkasan:** Merevisi harga baris Invoice Pembelian yang sudah diposting (pemasok mengoreksi harga). Selisih dipecah: porsi barang masih di stok masuk ke Persediaan + koreksi WAC, porsi yang sudah keluar masuk ke Selisih Harga Pembelian (5.11). Untuk role non-bypass hanya mengantrekan ApprovalRequest PurchaseInvoiceRevisePrice (HTTP 202).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `edit`)
- **Handler:** `POST /api/purchase/invoices/:id/revise-price` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice pembelian (UUID). |
| `lines` | body | `array<object>` | ya | Daftar { itemId (ID baris PI), newRate (harga baru per unit) }, minimal satu. |
| `lines[].itemId` | body | `uuid` | ya |  |
| `lines[].newRate` | body | `number` | ya |  |
| `reason` | body | `string` | ya | Alasan revisi, 10-500 karakter. |

**Contoh pemanggilan**

```json
{
  "tool": "pi_revise_price",
  "args": {
    "id": "<id>",
    "lines": [
      {
        "itemId": "00000000-0000-0000-0000-000000000000",
        "newRate": 1
      }
    ],
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
  "confirm": "Revisi harga Invoice Pembelian <id> ([...] baris). Alasan: <reason>. Setujui?"
}
```

**Isi hasil:** Bypass: hasil revisi (jurnal/penyesuaian). Non-bypass: permintaan persetujuan (HTTP 202).

**Efek pembukuan/stok:** Cabang bypass: delta = (rate baru - lama) x qty; harga naik: CR Hutang Usaha (2.1.1) / DR Persediaan (porsi stok) + DR 5.11 (porsi sudah keluar); harga turun kebalikannya; WAC dikoreksi. Cabang non-bypass: tidak ada efek sampai permintaan disetujui (satu permintaan Pending per PI).

**Teks konfirmasi:** Revisi harga Invoice Pembelian {id} ({lines} baris). Alasan: {reason}. Setujui?

**Prasyarat**

- PI berstatus Submitted/Paid (belum dibatalkan)
- Tidak ada permintaan revisi Pending untuk PI yang sama

**Error umum**

- 409: sudah ada pengajuan Pending untuk dokumen ini
- 400: alasan minimal 10 karakter

**Tool terkait:** [`pi_get`](#pi_get), [`pi_cancel`](#pi_cancel)

### pi_summary

**Ringkasan:** Ringkasan KPI Invoice Pembelian (jumlah dan total per status, total outstanding, jumlah dan nilai yang lewat jatuh tempo) untuk filter yang sama dengan daftar PI.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `view`)
- **Handler:** `GET /api/purchase/invoices/summary` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Submitted`, `Paid`, `PartiallyPaid`, `Overdue`, `Cancelled` | tidak | Status faktur. |
| `partyId` | query | `string` | tidak | ID pemasok. |
| `startDate` | query | `date` | tidak | Tanggal dari. |
| `endDate` | query | `date` | tidak | Tanggal sampai. |
| `search` | query | `string` | tidak | Cari nomor faktur/pemasok. |

**Contoh pemanggilan**

```json
{
  "tool": "pi_summary",
  "args": {
    "status": "Draft",
    "partyId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Ringkasan per status + total grandTotal/outstanding + overdue{count,outstanding}.>"
}
```

**Isi hasil:** Ringkasan per status + total grandTotal/outstanding + overdue{count,outstanding}.

**Tool terkait:** [`pi_list`](#pi_list)

### pi_update

**Ringkasan:** Mengubah catatan (notes), tanggal jatuh tempo (dueDate) dan/atau termin (terms) Invoice Pembelian yang belum dibatalkan. Tidak mengubah baris, harga, atau jurnal.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_invoice` / `edit`)
- **Handler:** `PUT /api/purchase/invoices/:id` (src/routes/purchase.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID invoice pembelian (UUID). |
| `notes` | body | `string` | tidak | Catatan faktur. |
| `dueDate` | body | `date` | tidak | Tanggal jatuh tempo baru; null = hapus jatuh tempo. |
| `terms` | body | `string` | tidak | Termin/syarat pembayaran; string kosong = hapus termin. |

**Contoh pemanggilan**

```json
{
  "tool": "pi_update",
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
  "confirm": "Ubah catatan/jatuh tempo/termin Invoice Pembelian <id>. Setujui?"
}
```

**Isi hasil:** PI setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC (hanya metadata notes/dueDate/terms).

**Teks konfirmasi:** Ubah catatan/jatuh tempo/termin Invoice Pembelian {id}. Setujui?

**Error umum**

- 404: Invoice tidak ditemukan
- 400: Invoice sudah dibatalkan

**Tool terkait:** [`pi_get`](#pi_get), [`pi_revise_price`](#pi_revise_price)

### po_cancel

**Ringkasan:** Membatalkan PO yang sudah dipesan (status menjadi Cancelled). STT yang sudah terbit tetap valid. PO Draft tidak dibatalkan (gunakan po_delete).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `purchase_order` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/purchase-orders/:id/cancel` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "po_cancel",
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
  "confirm": "Batalkan PO <id>? PO tidak bisa dipakai lagi untuk penerimaan barang."
}
```

**Isi hasil:** PO dengan status Cancelled.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. STT terkait tetap valid; PO tidak bisa dipakai STT baru.

**Teks konfirmasi:** Batalkan PO {id}? PO tidak bisa dipakai lagi untuk penerimaan barang.

**Error umum**

- 400: PO sudah dibatalkan
- 400: PO Draf tidak dibatalkan - hapus draf

**Tool terkait:** [`po_delete`](#po_delete), [`po_close`](#po_close)

### po_close

**Ringkasan:** Menutup PO (short-close): sisa kuantitas yang belum diterima dianggap tidak akan datang. Status tetap Submitted, tetapi closedAt terisi sehingga PO tidak bisa dipakai STT baru. Alasan wajib (minimal 5 karakter).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `purchase_order` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/purchase-orders/:id/close` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO (UUID). |
| `reason` | body | `string` | ya | Alasan penutupan, 5-500 karakter. |

**Contoh pemanggilan**

```json
{
  "tool": "po_close",
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
  "confirm": "Tutup PO <id> (sisa barang tidak akan diterima). Alasan: <reason>. Setujui?"
}
```

**Isi hasil:** PO dengan closedAt dan alasan penutupan.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Hanya menandai PO ditutup (closedAt) dan menyimpan alasan.

**Teks konfirmasi:** Tutup PO {id} (sisa barang tidak akan diterima). Alasan: {reason}. Setujui?

**Prasyarat**

- PO berstatus Submitted dan belum ditutup

**Error umum**

- 400: hanya PO yang sudah dipesan yang bisa ditutup
- 400: PO sudah ditutup

**Tool terkait:** [`po_get`](#po_get), [`gr_create`](#gr_create)

### po_create

**Ringkasan:** Membuat Purchase Order baru (dokumen perencanaan). saveAs=draft menyimpan PO Draft; saveAs=submit (default) langsung mengajukan: PO menjadi Submitted, atau tetap Draft + permintaan persetujuan bila grand total mencapai batas ApprovalRule PurchaseOrder yang aktif. Nomor PO dibuat otomatis. partyId kosong = PO Umum.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_order` / `edit`)
- **Handler:** `POST /api/purchase-orders` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal PO (YYYY-MM-DD). |
| `partyId` | body | `uuid` | tidak | ID pemasok; null = PO Umum (boleh dipenuhi pemasok mana pun). |
| `expectedDeliveryDate` | body | `date` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `terms` | body | `string` | tidak |  |
| `paymentTermDays` | body | `number` | tidak | Termin pembayaran dalam hari (0-365). |
| `warehouseId` | body | `uuid` | tidak | Gudang tujuan penerimaan (opsional). |
| `supplierQuoteRef` | body | `string` | tidak |  |
| `otherCosts` | body | `number` | tidak | Biaya lain di luar item (ongkos kirim dll), tidak negatif. |
| `otherCostsLabel` | body | `string` | tidak |  |
| `saveAs` | body | enum: `draft`, `submit` | tidak | draft = simpan Draft; submit = ajukan langsung (default). |
| `items` | body | `array<object>` | ya | Baris item: itemName, quantity, unit wajib; estimatedRate (harga perkiraan), discount %, taxPct % opsional; inventoryItemId untuk item stok. |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].estimatedRate` | body | `number` | tidak |  |
| `items[].discount` | body | `number` | tidak |  |
| `items[].taxPct` | body | `number` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "po_create",
  "args": {
    "date": "2026-01-31",
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
  "confirm": "Buat PO untuk pemasok {partyId} dengan [...] baris item, tanggal 2026-01-31 (simpan sebagai {saveAs}). Setujui?"
}
```

**Isi hasil:** PO yang dibuat (id, poNumber, status) + approvalRequestId bila diantrekan untuk persetujuan. HTTP 201.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC (PO hanya dokumen perencanaan). Hasil: PO Draft, PO Submitted, atau PO Draft dengan ApprovalRequest Pending.

**Teks konfirmasi:** Buat PO untuk pemasok {partyId} dengan {items} baris item, tanggal {date} (simpan sebagai {saveAs}). Setujui?

**Prasyarat**

- Pemasok aktif dan bertipe Supplier/Both (bila partyId diisi)
- Gudang tujuan aktif (bila diisi)

**Error umum**

- 400: pemasok tidak ditemukan/tidak aktif/bukan supplier
- 400: format tanggal tidak valid

**Tool terkait:** [`po_submit`](#po_submit), [`po_update`](#po_update), [`gr_create`](#gr_create)

### po_delete

**Ringkasan:** Menghapus PO berstatus Draft (draf). PO yang sudah dipesan tidak dihapus tetapi dibatalkan; PO yang menunggu persetujuan tidak bisa dihapus.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_order` / `edit`)
- **Handler:** `DELETE /api/purchase-orders/:id` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO Draft (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "po_delete",
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
  "confirm": "Hapus draf PO <id>? Tindakan ini tidak bisa dibatalkan."
}
```

**Isi hasil:** { success: true, id, ... } PO draf yang dihapus.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Menghapus dokumen draf.

**Teks konfirmasi:** Hapus draf PO {id}? Tindakan ini tidak bisa dibatalkan.

**Error umum**

- 400: hanya PO Draf yang bisa dihapus
- 400: PO sedang menunggu persetujuan

**Tool terkait:** [`po_cancel`](#po_cancel), [`po_list`](#po_list)

### po_get

**Ringkasan:** Detail satu Purchase Order: item, pemasok, gudang tujuan, STT terkait yang belum dibatalkan, total (subtotal, diskon, PPN, biaya lain, grand total), status penerimaan, dan riwayat permintaan persetujuan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `purchase_order` / `view`)
- **Handler:** `GET /api/purchase-orders/:id` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "po_get",
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
  "data": "<Objek PO lengkap + receiptStatus, displayStatus, isOverdue, totals{subtotal,discountTotal,>"
}
```

**Isi hasil:** Objek PO lengkap + receiptStatus, displayStatus, isOverdue, totals{subtotal,discountTotal,taxTotal,otherCosts,grandTotal}, approvals[].

**Error umum**

- 404: PO tidak ditemukan

**Tool terkait:** [`po_list`](#po_list), [`po_submit`](#po_submit), [`po_update`](#po_update)

### po_list

**Ringkasan:** Daftar Purchase Order (PO) dengan paging. Filter status (termasuk PendingApproval = Draft yang menunggu persetujuan), pemasok, rentang tanggal, pencarian nomor PO/nama pemasok, status penerimaan barang, PO terbuka, dan PO terlambat. Tiap baris memuat receiptStatus, displayStatus, dan isOverdue turunan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `purchase_order` / `view`)
- **Handler:** `GET /api/purchase-orders` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Jumlah per halaman (default 50, maksimum 200). |
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled`, `PendingApproval` | tidak | Status PO. PendingApproval = Draft yang menunggu persetujuan. |
| `partyId` | query | `uuid` | tidak | ID pemasok. |
| `startDate` | query | `date` | tidak | Tanggal PO dari (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal PO sampai (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor PO atau nama pemasok. |
| `receipt` | query | enum: `unreceived`, `partial`, `full`, `closed` | tidak | Status penerimaan: belum diterima, sebagian, lengkap, atau sudah ditutup (short-close). |
| `open` | query | `boolean` | tidak | 1/true = hanya PO Submitted yang belum ditutup (daftar pilihan untuk STT). |
| `due` | query | enum: `overdue` | tidak | overdue = PO terbuka yang tanggal kirimnya lewat dan belum lengkap diterima. |
| `sort` | query | `string` | tidak | Urutan: date, poNumber, supplier, expectedDeliveryDate, totalEstimated; awalan - = menurun (default -date). |

**Contoh pemanggilan**

```json
{
  "tool": "po_list",
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
  "data": "<{ data: PO[] (+ supplier, jumlah item/STT, receiptStatus, displayStatus, isOverdue), total>"
}
```

**Isi hasil:** { data: PO[] (+ supplier, jumlah item/STT, receiptStatus, displayStatus, isOverdue), total, page, limit }.

**Error umum**

- 400: status/receipt/due/format tanggal tidak dikenal

**Tool terkait:** [`po_get`](#po_get), [`po_create`](#po_create), [`gr_create`](#gr_create)

### po_submit

**Ringkasan:** Mengajukan PO Draft. Bila grand total mencapai minAmount ApprovalRule PurchaseOrder aktif, PO tetap Draft dengan approvalStatus Pending dan dibuat ApprovalRequest; jika tidak, PO menjadi Submitted (siap dipakai STT).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_order` / `edit`)
- **Handler:** `POST /api/purchase-orders/:id/submit` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO Draft (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "po_submit",
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
  "confirm": "Ajukan PO <id>? PO akan dipesan, atau menunggu persetujuan bila melampaui batas."
}
```

**Isi hasil:** PO + approvalRequestId (null bila langsung Submitted).

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Mengubah status PO ke Submitted atau mengantrekan persetujuan.

**Teks konfirmasi:** Ajukan PO {id}? PO akan dipesan, atau menunggu persetujuan bila melampaui batas.

**Prasyarat**

- PO berstatus Draft dan tidak sedang menunggu persetujuan

**Error umum**

- 400: hanya PO berstatus Draf yang bisa diajukan
- 400: PO sedang menunggu persetujuan

**Tool terkait:** [`po_create`](#po_create), [`po_update`](#po_update)

### po_update

**Ringkasan:** Mengubah PO (header dan seluruh item diganti) selama belum ada STT/faktur aktif yang merujuknya dan tidak sedang menunggu persetujuan. Nomor PO dan status tetap. Pada PO Submitted, kenaikan grand total yang melampaui batas ApprovalRule ditolak (harus lewat persetujuan).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `purchase_order` / `edit`)
- **Handler:** `PUT /api/purchase-orders/:id` (src/routes/purchaseOrders.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID PO (UUID). |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `partyId` | body | `uuid` | tidak | null = PO Umum |
| `expectedDeliveryDate` | body | `date` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `terms` | body | `string` | tidak |  |
| `paymentTermDays` | body | `number` | tidak |  |
| `warehouseId` | body | `uuid` | tidak | ID gudang. |
| `supplierQuoteRef` | body | `string` | tidak |  |
| `otherCosts` | body | `number` | tidak |  |
| `otherCostsLabel` | body | `string` | tidak |  |
| `saveAs` | body | enum: `draft`, `submit` | tidak | Diabaikan pada pengubahan; status mengikuti PO saat ini. |
| `items` | body | `array<object>` | ya | Baris dokumen (item). |
| `items[].inventoryItemId` | body | `uuid` | tidak |  |
| `items[].itemName` | body | `string` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].unit` | body | `string` | ya |  |
| `items[].estimatedRate` | body | `number` | tidak |  |
| `items[].discount` | body | `number` | tidak |  |
| `items[].taxPct` | body | `number` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "po_update",
  "args": {
    "id": "<id>",
    "date": "2026-01-31",
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
  "confirm": "Ubah PO <id>: [...] baris item, tanggal 2026-01-31. Setujui?"
}
```

**Isi hasil:** PO setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok/WAC. Hanya mengganti data PO (item diganti seluruhnya).

**Teks konfirmasi:** Ubah PO {id}: {items} baris item, tanggal {date}. Setujui?

**Prasyarat**

- PO belum dibatalkan, tidak menunggu persetujuan, belum ada STT/PI aktif terkait

**Error umum**

- 400: PO sedang menunggu persetujuan
- 400: PO sudah dipakai STT/faktur
- 400: kenaikan total melampaui batas persetujuan

**Tool terkait:** [`po_get`](#po_get), [`po_submit`](#po_submit)

### vdep_apply

**Ringkasan:** Mengaplikasikan sebagian/seluruh sisa uang muka vendor untuk melunasi Invoice Pembelian pemasok yang sama. Mengurangi outstanding faktur (status menjadi PartiallyPaid/Paid) dan saldo uang muka.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `vendor_deposit` / `edit`)
- **Handler:** `POST /api/vendor-deposits/apply` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `depositPaymentId` | body | `uuid` | ya | ID pembayaran uang muka vendor (status Submitted). |
| `purchaseInvoiceId` | body | `uuid` | ya | ID invoice pembelian tujuan (belum Paid/Cancelled, pemasok sama). |
| `amount` | body | `number` | ya | Jumlah (Rp) > 0, tidak melebihi sisa uang muka maupun outstanding faktur. |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_apply",
  "args": {
    "depositPaymentId": "00000000-0000-0000-0000-000000000000",
    "purchaseInvoiceId": "00000000-0000-0000-0000-000000000000",
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
  "confirm": "Aplikasikan Rp 1 dari uang muka 00000000-0000-0000-0000-000000000000 ke Invoice Pembelian 00000000-0000-0000-0000-000000000000. Setujui?"
}
```

**Isi hasil:** VendorDepositApplication yang dibuat (id, appliedAmount, journalEntryId). HTTP 201.

**Efek pembukuan/stok:** Jurnal: DR Hutang Usaha (2.1.1) / CR Uang Muka Vendor (1.3) sebesar amount. outstanding PI turun (status PartiallyPaid/Paid), depositBalance pemasok turun, VendorDepositApplication dibuat.

**Teks konfirmasi:** Aplikasikan Rp {amount} dari uang muka {depositPaymentId} ke Invoice Pembelian {purchaseInvoiceId}. Setujui?

**Error umum**

- 400: Deposit dan invoice harus dari supplier yang sama
- 400: Sisa deposit tidak cukup
- 400: Sisa outstanding invoice kurang
- 400: Invoice sudah lunas/dibatalkan

**Tool terkait:** [`vdep_balance`](#vdep_balance), [`vdep_apply_cancel`](#vdep_apply_cancel), [`pi_get`](#pi_get)

### vdep_apply_cancel

**Ringkasan:** Membatalkan satu aplikasi uang muka vendor ke invoice: jurnal aplikasi dibalik, outstanding faktur dan saldo uang muka dipulihkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `vendor_deposit` / `edit`, capability `doc.cancel`)
- **Catatan akses:** Butuh capability doc.cancel (default hanya Admin).
- **Handler:** `POST /api/vendor-deposits/apply/:id/cancel` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID VendorDepositApplication (bukan ID uang muka). |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_apply_cancel",
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
  "confirm": "Batalkan aplikasi uang muka <id>? Hutang faktur akan dipulihkan."
}
```

**Isi hasil:** Aplikasi uang muka yang dibatalkan.

**Efek pembukuan/stok:** Reverse jurnal aplikasi (DR Hutang Usaha 2.1.1 / CR Uang Muka Vendor 1.3 dibalik): outstanding PI naik kembali, depositBalance pemasok naik, aplikasi ditandai isCancelled.

**Teks konfirmasi:** Batalkan aplikasi uang muka {id}? Hutang faktur akan dipulihkan.

**Error umum**

- 400: Aplikasi uang muka tidak ditemukan
- 400: Aplikasi sudah dibatalkan

**Tool terkait:** [`vdep_apply`](#vdep_apply), [`pi_get`](#pi_get)

### vdep_balance

**Ringkasan:** Saldo uang muka satu vendor: daftar uang muka aktif beserta sisa yang masih bisa diaplikasikan ke invoice pembelian.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `vendor_deposit` / `view`)
- **Handler:** `GET /api/vendor-deposits/balance/:partyId` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | path | `string` | ya | ID pemasok (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_balance",
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
  "data": "<{ data: [uang muka dengan sisa dan akun], totalBalance }.>"
}
```

**Isi hasil:** { data: [uang muka dengan sisa dan akun], totalBalance }.

**Tool terkait:** [`vdep_apply`](#vdep_apply), [`vdep_list`](#vdep_list)

### vdep_cancel

**Ringkasan:** Membatalkan uang muka vendor: jurnal pembukuan dibalik. Ditolak bila uang muka sudah diaplikasikan ke faktur (batalkan aplikasinya dulu).

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `vendor_deposit` / `edit`)
- **Catatan akses:** Hanya butuh izin edit modul vendor_deposit (tidak ada requireCap doc.cancel di endpoint ini, berbeda dengan pembatalan aplikasi uang muka).
- **Handler:** `PATCH /api/vendor-deposits/:id/cancel` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pembayaran uang muka vendor (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_cancel",
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
  "confirm": "Batalkan uang muka vendor <id>? Jurnal kas/bank terkait akan dibalik."
}
```

**Isi hasil:** Uang muka dengan status Cancelled.

**Efek pembukuan/stok:** Reverse jurnal uang muka (asal: DR Uang Muka Vendor 1.3 / CR Kas-Bank): jurnal Cancelled, ledger isCancelled, saldo akun dan depositBalance pemasok dibalik.

**Teks konfirmasi:** Batalkan uang muka vendor {id}? Jurnal kas/bank terkait akan dibalik.

**Error umum**

- 400: Deposit sudah dibatalkan
- 400: Deposit sudah digunakan untuk faktur - batalkan penggunaan dulu
- 400: Bukan tipe uang muka vendor

**Tool terkait:** [`vdep_apply_cancel`](#vdep_apply_cancel), [`pay_record`](kas-bank.md#pay_record)

### vdep_list

**Ringkasan:** Daftar uang muka vendor (Payment tipe VendorDeposit). Tanpa page: semua uang muka (filter partyId dan status dokumen). Dengan page: paging, status turunan (Active/PartiallyUsed/FullyUsed) atau status dokumen, rentang tanggal, pencarian, dan sort; baris memuat state dan sisa.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `vendor_deposit` / `view`)
- **Handler:** `GET /api/vendor-deposits` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `string` | tidak | ID pemasok. |
| `status` | query | enum: `Active`, `PartiallyUsed`, `FullyUsed`, `Draft`, `Submitted`, `Cancelled` | tidak | Status turunan atau status dokumen (mode paging); mode tanpa page hanya status dokumen. |
| `page` | query | `number` | tidak | Bila diisi aktifkan mode paging (limit default 25, maksimum 200). |
| `limit` | query | `number` | tidak | Per halaman (mode paging). |
| `startDate` | query | `date` | tidak | Tanggal dari (mode paging). |
| `endDate` | query | `date` | tidak | Tanggal sampai (mode paging). |
| `search` | query | `string` | tidak | Pencarian (mode paging). |
| `sort` | query | `string` | tidak | date, paymentNumber, supplier, amount, totalApplied, remaining; awalan - = menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_list",
  "args": {
    "partyId": "<id>",
    "status": "Active"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: uang muka (+ sisa, total teraplikasi) } atau { data, total, page, limit } bila mem>"
}
```

**Isi hasil:** { data: uang muka (+ sisa, total teraplikasi) } atau { data, total, page, limit } bila memakai page.

**Tool terkait:** [`vdep_summary`](#vdep_summary), [`vdep_balance`](#vdep_balance), [`vdep_apply`](#vdep_apply)

### vdep_refund

**Ringkasan:** Menyelesaikan sisa uang muka vendor lewat offset ke hutang (FIFO ke PI terlama pemasok) dan/atau pengembalian kas dari vendor ke rekening kas/bank. Minimal salah satu offsetAmount atau cashAmount > 0; total tidak boleh melebihi sisa.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `vendor_deposit` / `edit`)
- **Handler:** `POST /api/vendor-deposits/:id/refund` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID pembayaran uang muka vendor. |
| `date` | body | `date` | ya | Tanggal penyelesaian (YYYY-MM-DD). |
| `offsetAmount` | body | `number` | tidak | Bagian yang dikompensasi ke hutang usaha (Rp, default 0). |
| `cashAmount` | body | `number` | tidak | Bagian yang dikembalikan vendor sebagai kas (Rp, default 0). |
| `cashAccountId` | body | `uuid` | tidak | Akun kas/bank penerima; wajib bila cashAmount > 0. |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_refund",
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
  "confirm": "Selesaikan sisa uang muka vendor <id>: offset hutang Rp {offsetAmount}, refund kas Rp {cashAmount} ke akun {cashAccountId}. Setujui?"
}
```

**Isi hasil:** Ringkasan penyelesaian (jurnal offset/refund dan sisa uang muka).

**Efek pembukuan/stok:** Offset: DR Hutang Usaha (2.1.1) / CR Uang Muka Vendor (1.3) per PI (outstanding PI turun). Refund kas: DR Kas/Bank / CR Uang Muka Vendor (1.3). refundedAmount dan depositBalance pemasok diperbarui.

**Teks konfirmasi:** Selesaikan sisa uang muka vendor {id}: offset hutang Rp {offsetAmount}, refund kas Rp {cashAmount} ke akun {cashAccountId}. Setujui?

**Error umum**

- 400: Total melebihi sisa uang muka
- 400: Hutang vendor tidak cukup untuk offset
- 400: Akun yang dipilih bukan kas/bank
- 400: Uang muka sudah dibatalkan

**Tool terkait:** [`vdep_balance`](#vdep_balance), [`vdep_apply`](#vdep_apply)

### vdep_summary

**Ringkasan:** Ringkasan KPI uang muka vendor (total, terpakai, sisa) untuk filter yang sama dengan daftar ber-paging.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `vendor_deposit` / `view`)
- **Handler:** `GET /api/vendor-deposits/summary` (src/routes/vendorDeposits.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | Active \| PartiallyUsed \| FullyUsed \| Draft \| Submitted \| Cancelled. |
| `partyId` | query | `string` | tidak | ID pemasok. |
| `startDate` | query | `date` | tidak | Tanggal dari. |
| `endDate` | query | `date` | tidak | Tanggal sampai. |
| `search` | query | `string` | tidak | Pencarian. |

**Contoh pemanggilan**

```json
{
  "tool": "vdep_summary",
  "args": {
    "status": "<status>",
    "partyId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Total uang muka, total teraplikasi, total sisa, jumlah dokumen.>"
}
```

**Isi hasil:** Total uang muka, total teraplikasi, total sisa, jumlah dokumen.

**Tool terkait:** [`vdep_list`](#vdep_list)


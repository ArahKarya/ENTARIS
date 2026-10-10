# Toolset: Akuntansi (`akuntansi`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/akuntansi` · 33 tool (read 14, write 8, critical 11)

## Tujuan

Toolset Akuntansi memungkinkan AIRA membaca dan (dengan persetujuan) memelihara inti pembukuan Entaris: bagan akun (COA), jurnal umum/buku besar, tahun buku (periode dan tutup buku), pemetaan akun sistem untuk auto-posting, konfigurasi dan laporan pajak, aset tetap beserta penyusutannya, dan antrian backfill HPP. Hampir semua tool tulis di sini bersifat critical karena langsung memengaruhi saldo buku besar; tool baca aman dipanggil otomatis. Pengajuan pembayaran dan persetujuan dokumen punya toolset sendiri (lihat Pengajuan Pembayaran dan Persetujuan).

## ALUR BISNIS

### Alur bisnis

Entaris memakai pembukuan double-entry otomatis: setiap transaksi (faktur, pembayaran, stok, penyusutan) menghasilkan jurnal seimbang yang masuk ke buku besar tak-terhapus (`AccountingLedgerEntry`). Toolset ini adalah jalur manual/administratif di sekitar itu.

1. **Bagan akun (COA)**: pohon akun bernomor bertitik (`1.1.1`, `2.1.1`, ...). Digit pertama menentukan golongan: 1 Aset, 2 Kewajiban, 3 Ekuitas, 4 Pendapatan, 5-8 Beban. Akun grup (`isGroup`) hanya pengelompok dan tidak boleh dijurnal; transaksi selalu ke akun detail aktif. Cari `accountId` lewat `coa_flat` sebelum membuat jurnal atau pengajuan.
2. **Jurnal manual**: `je_create` memposting jurnal `JV-…` langsung berstatus Submitted (tidak ada draf). Dipakai untuk koreksi, transfer antar bank, dan penyesuaian. Jurnal otomatis dari modul lain (awalan `JV-PAY`, `JV-SI`, `JV-PI`, `JV-COGS`, serta narasi "Aplikasi Uang Muka:") TIDAK boleh dibatalkan dari sini; batalkan dari dokumen asalnya.
3. **Saldo awal**: `coa_set_balance` menyetel saldo akun detail ke nilai tertentu. Selisihnya diposting sebagai jurnal `OB-…` melawan Ekuitas Saldo Awal (3.1).
4. **Tahun buku**: setiap posting wajib jatuh pada tahun buku yang terbuka (`getOpenFiscalYear`). `fy_create` membuat periode; `fy_close` menutup buku (jurnal `CLOSE-<nama>`); `fy_reopen` membukanya lagi. Periode yang ditutup menolak posting baru.
5. **Akun sistem**: `sysacct_get`/`sysacct_update` memetakan peran akun (Piutang, Hutang, Persediaan, HPP, Uang Muka Karyawan, Laba Ditahan, dst.) ke akun COA konkret. Semua auto-posting membaca pemetaan ini.
6. **Pajak**: `tax_get_config` dan tiga tool tulisnya mengelola tarif (PPN penjualan/pembelian, PPh potong). `tax_report` meringkas PPN keluaran, PPN masukan, dan PPh per bulan dari faktur berstatus Submitted/Paid/PartiallyPaid/Overdue.
7. **Aset tetap**: aset dicatat (`fa_create`, nomor `FA-NNNN`) beserta jadwal penyusutan garis lurus bulanan. Penyusutan diposting per baris (`fa_depreciate`) atau massal per bulan (`fa_depreciate_bulk`, selalu coba `dryRun=true` dulu). Pelepasan (`fa_dispose`) hanya mengubah status.
8. **Backfill HPP**: bila penjualan terjadi sebelum stok/HPP ada, HPP diposting sementara dan antriannya (`cogs_backfill_list`/`cogs_backfill_summary`) dituntaskan saat stok masuk. Hanya baca.

### Aturan posting

| Aksi | Debit | Kredit | Catatan |
|------|-------|--------|---------|
| `je_create` | sesuai baris | sesuai baris | Total debit = total kredit; satu baris tidak boleh debit sekaligus kredit |
| `je_cancel` | (membalik) | (membalik) | Saldo akun dibalik, status Cancelled |
| `coa_set_balance` aset/beban naik | akun | Ekuitas Saldo Awal 3.1 | Turun: kebalikannya |
| `coa_set_balance` kewajiban/ekuitas/pendapatan naik | Ekuitas Saldo Awal 3.1 | akun | Turun: kebalikannya |
| `fy_close` (laba) | Laba Tahun Berjalan 3.4 | Laba Ditahan 3.2 | Rugi: kebalikannya; saldo berjalan akun pendapatan & beban tahun itu di-nol-kan |
| `fy_reopen` | Laba Ditahan 3.2 | Laba Tahun Berjalan 3.4 | Membalik jurnal penutup dan mengembalikan saldo pendapatan/beban |
| `fa_depreciate` / bulk | Beban Penyusutan (akun aset) | Akumulasi Penyusutan | Jurnal `DEP-…`; nilai buku aset berkurang |

Akun sistem utama (jangan dihapus/diubah; didefinisikan di `constants/accountNumbers.ts`): 1.1.x Kas/Bank, 1.2.1 Piutang Usaha, 1.3 Uang Muka Pembelian, 1.4.0 Persediaan, 1.5.6 Uang Muka Karyawan, 2.1.1 Hutang Usaha, 2.1.5 Hutang Belum Tagih, 3.1 Ekuitas Saldo Awal, 3.2 Laba Ditahan, 3.4 Laba Tahun Berjalan, 4.1 Penjualan, 4.2 Pendapatan Jasa, 5 HPP, 5.11 Selisih Harga Pembelian.

Yang TIDAK menghasilkan jurnal (sering disangka sebaliknya): `fa_create`, `fa_import`, dan `fa_dispose`. Pembelian aset harus dijurnal terpisah dan laba/rugi pelepasan dijurnal manual.

### Persetujuan

Toolset ini tidak memakai antrian `ApprovalRequest`. Pengamanannya berlapis:
- Izin modul: `coa`, `journal`, `fixed_assets`, `settings` (edit). Default hanya Admin untuk `coa` dan `settings`; Accountant bisa `journal` dan `fixed_assets`.
- Capability `doc.cancel` (default hanya Admin) untuk `coa_delete`, `fy_close`, `fy_reopen`, `tax_delete_config`.
- `sysacct_update` memeriksa role Admin secara eksplisit.
Pada AIRA, semua tool tulis di toolset ini tier critical: wajib persetujuan manusia (antrian approval) bila dipanggil agen.

### Jebakan umum

- **Tahun buku tidak terbuka**: posting jurnal/saldo awal ditolak ("tahun buku tidak ditemukan/ditutup"). Periksa `fy_list` lebih dulu.
- **Jurnal tidak seimbang**: toleransi hanya 0,01. Jangan memecah satu baris menjadi debit dan kredit sekaligus.
- **`je_cancel` pada jurnal otomatis** selalu ditolak; gunakan pembatalan dokumen asal (faktur, pembayaran, uang muka).
- **`coa_update`** hanya benar-benar menyimpan nomor, nama, status grup, dan aktif. Nomor akun yang dipetakan sebagai akun sistem tidak boleh diganti; akun grup yang masih punya anak tidak bisa dijadikan akun detail.
- **`coa_delete`** menolak bila ada sub-akun, pemetaan akun sistem, tautan ke item persediaan/jasa, mutasi buku besar, atau saldo bukan nol.
- **Tutup buku** mengubah saldo berjalan akun pendapatan/beban; jangan dipanggil sebelum jurnal penyesuaian selesai. `fy_reopen` membalikkannya.
- **Penyusutan bulk**: baris yang sudah diposting dilewati; hanya aset berstatus Active. Posting penyusutan tidak memeriksa tahun buku tertutup di kode saat ini, jadi pastikan periode yang dimaksud memang masih terbuka.
- **`fa_dispose` tidak dapat dibatalkan lewat API** dan tidak menjurnal; sertakan jurnal manual untuk laba/rugi pelepasan dan penghapusan akumulasi penyusutan.
- **`sysacct_update`** mengubah akun DR/CR semua posting otomatis berikutnya; salah petakan berarti pembukuan salah di seluruh modul.
- **Hak akses GET**: beberapa GET (COA, tahun buku, pajak, akun sistem) terbuka bagi semua user login karena data referensi; tool tulisnya tetap dibatasi.

### Peta istilah

| Istilah bisnis | Kode / field |
|----------------|--------------|
| Bagan akun, COA | `Account`, `accountNumber`, `rootType`, `isGroup` |
| Jurnal umum / JV | `JournalEntry`, `entryNumber` `JV-…`, status `Submitted`/`Cancelled` |
| Buku besar | `AccountingLedgerEntry` (ledger tak-terhapus) |
| Saldo awal | Jurnal `OB-…`, akun sistem `OPENING_EQUITY` (3.1) |
| Tahun buku, periode | `FiscalYear`, `isClosed`, `getOpenFiscalYear` |
| Tutup buku | Jurnal `CLOSE-<nama>`, `RETAINED_EARNINGS` (3.2), `CURRENT_PROFIT` (3.4) |
| Akun sistem | `SystemAccountMapping`, peran akun (role) |
| PPN keluaran / masukan, PPh | `TaxConfig.type` = `sales` / `purchase` / `withholding` |
| Aset tetap | `FixedAsset`, `FA-NNNN`, `status` Active/Disposed |
| Penyusutan | `DepreciationEntry`, jurnal `DEP-…`, `isPosted` |
| Akumulasi penyusutan, nilai buku | `accumulatedDepreciation`, `bookValue` |
| Backfill HPP | `CogsBackfillQueue` (Pending / PartiallySettled / Settled) |
| WAC / HPP | Harga rata-rata tertimbang / Harga Pokok Penjualan (akun 5) |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`coa_create`](#coa_create) | write | tidak | `POST /api/coa` |
| [`coa_delete`](#coa_delete) | critical | tidak | `DELETE /api/coa/:id` |
| [`coa_flat`](#coa_flat) | read | - | `GET /api/coa/flat` |
| [`coa_list`](#coa_list) | read | - | `GET /api/coa` |
| [`coa_set_balance`](#coa_set_balance) | critical | tidak | `PATCH /api/coa/:id/balance` |
| [`coa_update`](#coa_update) | write | tidak | `PUT /api/coa/:id` |
| [`cogs_backfill_list`](#cogs_backfill_list) | read | - | `GET /api/cogs-backfill` |
| [`cogs_backfill_summary`](#cogs_backfill_summary) | read | - | `GET /api/cogs-backfill/summary` |
| [`fa_categories`](#fa_categories) | read | - | `GET /api/fixed-assets/categories` |
| [`fa_create`](#fa_create) | write | tidak | `POST /api/fixed-assets` |
| [`fa_depreciate`](#fa_depreciate) | critical | tidak | `POST /api/fixed-assets/:id/depreciate` |
| [`fa_depreciate_bulk`](#fa_depreciate_bulk) | critical | tidak | `POST /api/fixed-assets/depreciate-bulk` |
| [`fa_dispose`](#fa_dispose) | critical | tidak | `POST /api/fixed-assets/:id/dispose` |
| [`fa_get`](#fa_get) | read | - | `GET /api/fixed-assets/:id` |
| [`fa_import`](#fa_import) | write | tidak | `POST /api/fixed-assets/import` |
| [`fa_list`](#fa_list) | read | - | `GET /api/fixed-assets` |
| [`fa_summary_by_category`](#fa_summary_by_category) | read | - | `GET /api/fixed-assets/summary/by-category` |
| [`fa_update`](#fa_update) | write | tidak | `PUT /api/fixed-assets/:id` |
| [`fy_close`](#fy_close) | critical | tidak | `POST /api/fiscal-years/:id/close` |
| [`fy_create`](#fy_create) | write | tidak | `POST /api/fiscal-years` |
| [`fy_list`](#fy_list) | read | - | `GET /api/fiscal-years` |
| [`fy_reopen`](#fy_reopen) | critical | tidak | `POST /api/fiscal-years/:id/reopen` |
| [`je_cancel`](#je_cancel) | critical | tidak | `PATCH /api/journals/:id/cancel` |
| [`je_create`](#je_create) | critical | tidak | `POST /api/journals` |
| [`je_get`](#je_get) | read | - | `GET /api/journals/:id` |
| [`je_list`](#je_list) | read | - | `GET /api/journals` |
| [`sysacct_get`](#sysacct_get) | read | - | `GET /api/system-accounts` |
| [`sysacct_update`](#sysacct_update) | critical | tidak | `PUT /api/system-accounts` |
| [`tax_create_config`](#tax_create_config) | write | tidak | `POST /api/tax/config` |
| [`tax_delete_config`](#tax_delete_config) | critical | tidak | `DELETE /api/tax/config/:id` |
| [`tax_get_config`](#tax_get_config) | read | - | `GET /api/tax/config` |
| [`tax_report`](#tax_report) | read | - | `GET /api/tax/report` |
| [`tax_update_config`](#tax_update_config) | write | tidak | `PUT /api/tax/config/:id` |

## Rincian tool

### coa_create

**Ringkasan:** Membuat akun baru di bagan akun (akun detail atau akun grup). rootType/accountType harus selaras dengan digit pertama nomor akun (1 aset, 2 kewajiban, 3 ekuitas, 4 pendapatan, 5-8 beban).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `coa` / `edit`)
- **Handler:** `POST /api/coa` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `accountNumber` | body | `string` | ya | Nomor akun unik, format bertitik (mis. 1.1.6). Digit pertama menentukan golongan. |
| `name` | body | `string` | ya | Nama akun. |
| `accountType` | body | enum: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE` | ya | Jenis akun: ASSET, LIABILITY, EQUITY, REVENUE atau EXPENSE. |
| `rootType` | body | enum: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE` | ya | Golongan induk; samakan dengan accountType. |
| `parentId` | body | `string` | tidak | ID akun induk (grup) atau null untuk akun akar. |
| `isGroup` | body | `boolean` | tidak | true = akun grup (tidak boleh dijurnal langsung). |
| `currency` | body | `string` | tidak | Kode mata uang (default IDR). |

**Contoh pemanggilan**

```json
{
  "tool": "coa_create",
  "args": {
    "accountNumber": "<accountNumber>",
    "name": "<name>",
    "accountType": "ASSET",
    "rootType": "ASSET"
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
  "confirm": "Buat akun <accountNumber> - <name> (ASSET)?"
}
```

**Isi hasil:** Akun yang dibuat (id, accountNumber, name, tipe, parentId).

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya menambah master akun (saldo awal 0).

**Teks konfirmasi:** Buat akun {accountNumber} - {name} ({accountType})?

**Prasyarat**

- Nomor akun belum dipakai akun lain.

**Error umum**

- 409: Nomor akun sudah digunakan.
- 400: induk bukan akun grup / tidak ditemukan.

**Tool terkait:** [`coa_update`](#coa_update), [`coa_flat`](#coa_flat)

### coa_delete

**Ringkasan:** Menghapus akun COA yang aman dihapus: tanpa sub-akun, tidak dipetakan sebagai Akun Sistem, tidak tertaut ke item persediaan/jasa, dan tidak punya mutasi buku besar, dan bersaldo nol.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `coa` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/coa/:id` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "coa_delete",
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
  "confirm": "HAPUS permanen akun <id> dari bagan akun?"
}
```

**Isi hasil:** Konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada jurnal; menghapus master akun secara permanen (tidak dapat dibatalkan).

**Teks konfirmasi:** HAPUS permanen akun {id} dari bagan akun?

**Prasyarat**

- Capability doc.cancel.
- Akun tidak punya transaksi dan saldo 0.

**Error umum**

- 400: masih punya sub-akun / dipakai Akun Sistem / tertaut item / punya transaksi

**Tool terkait:** [`coa_update`](#coa_update)

### coa_flat

**Ringkasan:** Daftar akun AKTIF datar (id, nomor, nama, tipe, isGroup) untuk dropdown/pencarian akun. Gunakan untuk mencari accountId sebelum membuat jurnal atau pengajuan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `coa` / `view`)
- **Catatan akses:** GET data referensi terbuka bagi semua user login (requireWrite).
- **Handler:** `GET /api/coa/flat` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "coa_flat",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array akun aktif tanpa hierarki.>"
}
```

**Isi hasil:** Array akun aktif tanpa hierarki.

**Tool terkait:** [`coa_list`](#coa_list), [`je_create`](#je_create)

### coa_list

**Ringkasan:** Bagan akun (COA) dalam bentuk pohon bertingkat (children) terurut nomor akun, termasuk akun nonaktif dan saldo berjalan tiap akun.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `coa` / `view`)
- **Catatan akses:** GET data referensi terbuka bagi semua user login (requireWrite).
- **Handler:** `GET /api/coa` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "coa_list",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array akar pohon; tiap node: id, accountNumber, name, accountType, rootType, isGroup, isAc>"
}
```

**Isi hasil:** Array akar pohon; tiap node: id, accountNumber, name, accountType, rootType, isGroup, isActive, balance, children[].

**Tool terkait:** [`coa_flat`](#coa_flat), [`coa_create`](#coa_create)

### coa_set_balance

**Ringkasan:** Menetapkan saldo awal sebuah akun detail ke nilai balance. Selisih terhadap saldo sekarang diposting sebagai jurnal Saldo Awal (OB) berlawanan dengan akun Ekuitas Saldo Awal (3.1) pada tahun buku terbuka.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `coa` / `edit`)
- **Handler:** `PATCH /api/coa/:id/balance` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID akun detail (bukan grup). |
| `balance` | body | `number` | ya | Saldo akhir yang diinginkan (angka rupiah; bukan selisih). |

**Contoh pemanggilan**

```json
{
  "tool": "coa_set_balance",
  "args": {
    "id": "<id>",
    "balance": 1
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
  "confirm": "Set saldo awal akun <id> menjadi 1? Selisih diposting ke Ekuitas Saldo Awal (3.1)."
}
```

**Isi hasil:** Akun dengan saldo terbaru.

**Efek pembukuan/stok:** Jurnal OB-… status Submitted + ledger: akun ASET/BEBAN delta>0 → DR akun / CR 3.1 (delta<0 sebaliknya); akun KEWAJIBAN/EKUITAS/PENDAPATAN delta>0 → CR akun / DR 3.1. Saldo kedua akun diperbarui. Tanpa selisih (<0,01) tidak ada jurnal.

**Teks konfirmasi:** Set saldo awal akun {id} menjadi {balance}? Selisih diposting ke Ekuitas Saldo Awal (3.1).

**Prasyarat**

- Ada tahun buku terbuka untuk hari ini.
- Akun bukan akun grup.
- Akun sistem OPENING_EQUITY terpetakan.

**Error umum**

- 400: akun grup tidak bisa diberi saldo
- 400: tidak ada tahun buku terbuka

**Tool terkait:** [`coa_flat`](#coa_flat), [`je_list`](#je_list)

### coa_update

**Ringkasan:** Mengubah akun: nomor akun, nama, status grup, atau aktif/nonaktif. Catatan kode: hanya accountNumber, name, isGroup, isActive yang benar-benar disimpan; accountType/rootType diturunkan ulang dari nomor akun, parentId/currency diabaikan. Nomor akun yang dipetakan sebagai Akun Sistem tidak boleh diganti.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `coa` / `edit`)
- **Handler:** `PUT /api/coa/:id` (src/routes/coa.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `accountNumber` | body | `string` | tidak |  |
| `name` | body | `string` | tidak | Nama. |
| `accountType` | body | enum: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE` | tidak |  |
| `rootType` | body | enum: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE` | tidak |  |
| `parentId` | body | `string` | tidak |  |
| `isGroup` | body | `boolean` | tidak |  |
| `currency` | body | `string` | tidak |  |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "coa_update",
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
  "confirm": "Ubah akun <id>: nomor/nama/status sesuai input?"
}
```

**Isi hasil:** Akun setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; mengubah label/status master akun. Menonaktifkan akun menyembunyikannya dari dropdown tetapi riwayat jurnal tetap.

**Teks konfirmasi:** Ubah akun {id}: nomor/nama/status sesuai input?

**Prasyarat**

- Akun bukan akun sistem bila nomor diganti.
- Akun grup yang masih punya sub-akun tidak bisa diubah menjadi akun detail.

**Error umum**

- 409: nomor akun dipakai akun lain
- 400: akun sistem tidak boleh diganti nomor
- 404: akun tidak ditemukan

**Tool terkait:** [`coa_create`](#coa_create), [`coa_delete`](#coa_delete)

### cogs_backfill_list

**Ringkasan:** Antrian backfill HPP: penjualan yang terjadi saat stok/HPP belum ada sehingga HPP diposting provisional dan akan disesuaikan saat stok masuk. Filter: status (default Pending & PartiallySettled), itemId, limit (maks 200).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `journal` / `view`)
- **Handler:** `GET /api/cogs-backfill` (src/routes/cogsBackfill.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | Filter status dokumen. |
| `itemId` | query | `string` | tidak |  |
| `limit` | query | `string` | tidak | Jumlah baris per halaman. |

**Contoh pemanggilan**

```json
{
  "tool": "cogs_backfill_list",
  "args": {
    "status": "<status>",
    "itemId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: entri antrian + item + faktur + riwayat settlement }.>"
}
```

**Isi hasil:** { data: entri antrian + item + faktur + riwayat settlement }.

**Tool terkait:** [`cogs_backfill_summary`](#cogs_backfill_summary)

### cogs_backfill_summary

**Ringkasan:** Ringkasan antrian backfill HPP yang belum tuntas: jumlah entri pending dan rincian qty pending per item.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `journal` / `view`)
- **Handler:** `GET /api/cogs-backfill/summary` (src/routes/cogsBackfill.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "cogs_backfill_summary",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ pendingCount, breakdown per item }.>"
}
```

**Isi hasil:** { pendingCount, breakdown per item }.

**Tool terkait:** [`cogs_backfill_list`](#cogs_backfill_list)

### fa_categories

**Ringkasan:** Daftar kategori aset tetap yang tersedia untuk filter/pengisian.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `fixed_assets` / `view`)
- **Handler:** `GET /api/fixed-assets/categories` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "fa_categories",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array kategori.>"
}
```

**Isi hasil:** Array kategori.

**Tool terkait:** [`fa_list`](#fa_list)

### fa_create

**Ringkasan:** Mencatat aset tetap baru (nomor FA-NNNN otomatis) dan membuat jadwal penyusutan garis lurus bulanan sepanjang masa manfaat. TIDAK membuat jurnal perolehan: pembelian aset harus dijurnal terpisah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `POST /api/fixed-assets` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama. |
| `category` | body | `string` | ya | Kategori aset tetap. |
| `description` | body | `string` | tidak | Keterangan. |
| `acquisitionDate` | body | `date` | ya | Tanggal perolehan (YYYY-MM-DD); harus ada tahun buku yang mencakupnya. |
| `acquisitionCost` | body | `number` | ya | Harga perolehan. |
| `usefulLifeMonths` | body | `number` | ya | Masa manfaat dalam bulan. |
| `salvageValue` | body | `number` | tidak | Nilai sisa (default 0). |
| `depreciationMethod` | body | enum: `straight_line` | tidak |  |
| `assetAccountId` | body | `uuid` | ya | Akun aset tetap (neraca). |
| `depreciationAccountId` | body | `uuid` | ya | Akun beban penyusutan. |
| `accumulatedDepAccountId` | body | `uuid` | ya | Akun akumulasi penyusutan. |
| `gaAssetId` | body | `string` | tidak | ID aset EAM (GaAsset) yang ditautkan; satu aset EAM hanya untuk satu aset tetap. Kosong/null = tidak ditautkan. |

**Contoh pemanggilan**

```json
{
  "tool": "fa_create",
  "args": {
    "name": "<name>",
    "category": "<category>",
    "acquisitionDate": "2026-01-31",
    "acquisitionCost": 1,
    "usefulLifeMonths": 1,
    "assetAccountId": "00000000-0000-0000-0000-000000000000",
    "depreciationAccountId": "00000000-0000-0000-0000-000000000000",
    "accumulatedDepAccountId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Catat aset tetap <name> (<category>) senilai 1, umur 1 bulan?"
}
```

**Isi hasil:** Aset yang dibuat + jumlah entri jadwal.

**Efek pembukuan/stok:** Tidak ada efek GL/stok saat dicatat; hanya master aset + jadwal penyusutan (belum diposting). Jurnal terjadi saat penyusutan diposting.

**Teks konfirmasi:** Catat aset tetap {name} ({category}) senilai {acquisitionCost}, umur {usefulLifeMonths} bulan?

**Error umum**

- 400: tahun buku tidak ditemukan untuk tanggal akuisisi

**Tool terkait:** [`fa_depreciate`](#fa_depreciate), [`fa_import`](#fa_import)

### fa_depreciate

**Ringkasan:** Memposting satu baris jadwal penyusutan (entryId) menjadi jurnal. Menaikkan akumulasi penyusutan dan menurunkan nilai buku aset.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `POST /api/fixed-assets/:id/depreciate` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID aset. |
| `entryId` | body | `uuid` | ya | ID baris jadwal penyusutan (dari fa_get → depreciationEntries). |

**Contoh pemanggilan**

```json
{
  "tool": "fa_depreciate",
  "args": {
    "id": "<id>",
    "entryId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Posting penyusutan jadwal 00000000-0000-0000-0000-000000000000 untuk aset <id>?"
}
```

**Isi hasil:** { success, journalEntryId }.

**Efek pembukuan/stok:** Jurnal DEP-… status Submitted pada tanggal periode: DR Beban Penyusutan (akun beban aset) / CR Akumulasi Penyusutan. Baris jadwal ditandai isPosted; accumulatedDepreciation & bookValue aset diperbarui. Catatan kode: tidak memeriksa tahun buku tertutup.

**Teks konfirmasi:** Posting penyusutan jadwal {entryId} untuk aset {id}?

**Error umum**

- 404: jadwal tidak ditemukan
- 400: depresiasi sudah diposting

**Tool terkait:** [`fa_get`](#fa_get), [`fa_depreciate_bulk`](#fa_depreciate_bulk)

### fa_depreciate_bulk

**Ringkasan:** Memposting penyusutan semua aset Aktif yang jatuh tempo pada bulan (month YYYY-MM, default bulan berjalan). Dengan dryRun=true hanya menghitung (pratinjau) tanpa memposting; entri yang sudah diposting dilewati. Selalu panggil dryRun dulu.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `POST /api/fixed-assets/depreciate-bulk` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `month` | body | `string` | tidak | Bulan periode YYYY-MM. |
| `dryRun` | body | `boolean` | tidak | true = pratinjau saja, tidak memposting. |

**Contoh pemanggilan**

```json
{
  "tool": "fa_depreciate_bulk",
  "args": {
    "month": "<month>",
    "dryRun": true
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
  "confirm": "Posting penyusutan massal bulan <month> (dryRun=true)?"
}
```

**Isi hasil:** { posted, totalAmount, jeNumbers, skipped, items[] } (dryRun: dryRun=true tanpa posting).

**Efek pembukuan/stok:** Per baris jadwal jatuh tempo: jurnal DEP-… DR Beban Penyusutan / CR Akumulasi Penyusutan; aset diperbarui. dryRun=true: tidak ada efek.

**Teks konfirmasi:** Posting penyusutan massal bulan {month} (dryRun={dryRun})?

**Tool terkait:** [`fa_depreciate`](#fa_depreciate), [`fa_list`](#fa_list)

### fa_dispose

**Ringkasan:** Melepas aset (status Disposed) dengan tanggal dan nilai pelepasan. Hanya mengubah status aset: TIDAK membuat jurnal laba/rugi pelepasan dan jadwal penyusutan sisa tidak lagi diposting.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `POST /api/fixed-assets/:id/dispose` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `disposalDate` | body | `date` | ya | Tanggal pelepasan aset (YYYY-MM-DD). |
| `disposalAmount` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "fa_dispose",
  "args": {
    "id": "<id>",
    "disposalDate": "2026-01-31"
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
  "confirm": "Lepas aset <id> pada 2026-01-31 senilai {disposalAmount}? Tidak ada jurnal otomatis."
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada jurnal (celah: laba/rugi pelepasan dan penghapusan akun aset/akumulasi harus dijurnal manual). Aset berstatus Disposed tidak dapat dikembalikan lewat API.

**Teks konfirmasi:** Lepas aset {id} pada {disposalDate} senilai {disposalAmount}? Tidak ada jurnal otomatis.

**Error umum**

- 400: aset sudah tidak aktif
- 404: aset tidak ditemukan

**Tool terkait:** [`fa_get`](#fa_get), [`je_create`](#je_create)

### fa_get

**Ringkasan:** Detail satu aset tetap beserta jadwal penyusutan bulanan (entry terposting/belum) dan akun aset/beban/akumulasi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `fixed_assets` / `view`)
- **Handler:** `GET /api/fixed-assets/:id` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "fa_get",
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
  "data": "<Aset + depreciationEntries[].>"
}
```

**Isi hasil:** Aset + depreciationEntries[].

**Tool terkait:** [`fa_depreciate`](#fa_depreciate), [`fa_list`](#fa_list)

### fa_import

**Ringkasan:** Impor massal aset tetap dari JSON (assets[]: name, category, acquisitionDate, acquisitionCost, usefulLifeMonths, salvageValue, akun aset/penyusutan/akumulasi). Bukan unggah berkas: body JSON biasa. Membuat aset + jadwal penyusutan dalam satu transaksi; tahun buku di luar rentang jatuh ke tahun buku terbaru.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `POST /api/fixed-assets/import` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `assets` | body | `array<object>` | ya | Daftar aset yang diimpor (array objek). |
| `assets[].name` | body | `string` | ya |  |
| `assets[].category` | body | `string` | ya |  |
| `assets[].description` | body | `string` | tidak |  |
| `assets[].acquisitionDate` | body | `string` | ya |  |
| `assets[].acquisitionCost` | body | `number` | ya |  |
| `assets[].usefulLifeMonths` | body | `number` | ya |  |
| `assets[].salvageValue` | body | `number` | tidak |  |
| `assets[].assetAccountId` | body | `uuid` | ya |  |
| `assets[].depreciationAccountId` | body | `uuid` | ya |  |
| `assets[].accumulatedDepAccountId` | body | `uuid` | ya |  |

**Contoh pemanggilan**

```json
{
  "tool": "fa_import",
  "args": {
    "assets": [
      {
        "name": "<name>",
        "category": "<category>",
        "acquisitionDate": "<acquisitionDate>",
        "acquisitionCost": 1,
        "usefulLifeMonths": 1,
        "assetAccountId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Impor [...] aset tetap sekaligus?"
}
```

**Isi hasil:** { success, count, scheduleEntries, created[] }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya master aset + jadwal penyusutan (belum diposting).

**Teks konfirmasi:** Impor {assets} aset tetap sekaligus?

**Error umum**

- 400: tidak ada tahun buku

**Tool terkait:** [`fa_create`](#fa_create)

### fa_list

**Ringkasan:** Daftar aset tetap. Tanpa parameter page → semua aset; dengan page/limit → paging (maks 500). Filter: status (Active/Disposed), category, startDate/endDate (tanggal perolehan), search, sort.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `fixed_assets` / `view`)
- **Handler:** `GET /api/fixed-assets` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | `string` | tidak | Filter status dokumen. |
| `category` | query | `string` | tidak | Kategori aset tetap. |

**Contoh pemanggilan**

```json
{
  "tool": "fa_list",
  "args": {
    "status": "<status>",
    "category": "<category>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array aset (atau {data,total,page,limit}) dengan nilai buku, akumulasi penyusutan, akun te>"
}
```

**Isi hasil:** Array aset (atau {data,total,page,limit}) dengan nilai buku, akumulasi penyusutan, akun terkait.

**Tool terkait:** [`fa_get`](#fa_get), [`fa_summary_by_category`](#fa_summary_by_category)

### fa_summary_by_category

**Ringkasan:** Ringkasan aset tetap per kategori: jumlah aset, total harga perolehan, akumulasi penyusutan, nilai buku.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `fixed_assets` / `view`)
- **Handler:** `GET /api/fixed-assets/summary/by-category` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "fa_summary_by_category",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array ringkasan per kategori.>"
}
```

**Isi hasil:** Array ringkasan per kategori.

**Tool terkait:** [`fa_list`](#fa_list)

### fa_update

**Ringkasan:** Mengubah metadata aset: nama, kategori, deskripsi. Nominal, masa manfaat, dan akun TIDAK bisa diubah.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `fixed_assets` / `edit`)
- **Handler:** `PUT /api/fixed-assets/:id` (src/routes/fixedAssets.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `name` | body | `string` | tidak | Nama. |
| `category` | body | `string` | tidak | Kategori aset tetap. |
| `description` | body | `string` | tidak | Keterangan. |
| `gaAssetId` | body | `string` | tidak | ID aset EAM (GaAsset) yang ditautkan; satu aset EAM hanya untuk satu aset tetap. Kosong/null = tidak ditautkan. |

**Contoh pemanggilan**

```json
{
  "tool": "fa_update",
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
  "confirm": "Ubah data aset <id> (nama/kategori/deskripsi)?"
}
```

**Isi hasil:** Aset setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya label).

**Teks konfirmasi:** Ubah data aset {id} (nama/kategori/deskripsi)?

**Error umum**

- 404: aset tidak ditemukan

**Tool terkait:** [`fa_get`](#fa_get)

### fy_close

**Ringkasan:** Tutup buku: menghitung laba/rugi tahun itu dari ledger pendapatan dan beban, memposting jurnal penutup, lalu menandai tahun buku isClosed sehingga tidak ada posting baru pada periode tersebut.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/fiscal-years/:id/close` (src/routes/fiscalYears.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "fy_close",
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
  "confirm": "TUTUP BUKU tahun <id>? Posting baru pada periode ini akan ditolak."
}
```

**Isi hasil:** Tahun buku yang ditutup (isClosed, closedAt, closedBy).

**Efek pembukuan/stok:** Jurnal CLOSE-<nama tahun> pada tanggal akhir tahun: laba → DR Laba Tahun Berjalan (3.4) / CR Laba Ditahan (3.2); rugi sebaliknya. Saldo berjalan akun pendapatan & beban pada tahun itu di-nol-kan (running balance dikurangi kontribusi tahun tsb.; ledger tetap utuh). Tahun buku ditandai ditutup (closedAt/closedBy). Laba 0 → tanpa jurnal penutup tetapi saldo tetap direset.

**Teks konfirmasi:** TUTUP BUKU tahun {id}? Posting baru pada periode ini akan ditolak.

**Prasyarat**

- Capability doc.cancel.
- Akun sistem RETAINED_EARNINGS & CURRENT_PROFIT terpetakan.

**Error umum**

- 400: tahun buku sudah ditutup
- 400: tahun buku tidak ditemukan

**Tool terkait:** [`fy_reopen`](#fy_reopen), [`fy_list`](#fy_list)

### fy_create

**Ringkasan:** Membuat tahun buku baru (nama unik, startDate < endDate, tidak boleh tumpang tindih dengan tahun buku lain).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `POST /api/fiscal-years` (src/routes/fiscalYears.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama. |
| `startDate` | body | `date` | ya | Tanggal awal (YYYY-MM-DD). |
| `endDate` | body | `date` | ya | Tanggal akhir (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "fy_create",
  "args": {
    "name": "<name>",
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
  "confirm": "Buat tahun buku <name> (2026-01-31 s/d 2026-01-31)?"
}
```

**Isi hasil:** Tahun buku yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya membuka periode baru untuk posting.

**Teks konfirmasi:** Buat tahun buku {name} ({startDate} s/d {endDate})?

**Error umum**

- 400: tanggal mulai harus sebelum akhir
- 400: bertumpang tindih
- 409: nama sudah dipakai

**Tool terkait:** [`fy_list`](#fy_list)

### fy_list

**Ringkasan:** Daftar tahun buku (nama, rentang tanggal, status isClosed). Dipakai untuk mengetahui periode yang masih terbuka sebelum memposting.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `settings` / `view`)
- **Catatan akses:** GET terbuka bagi semua user login (requireWrite settings).
- **Handler:** `GET /api/fiscal-years` (src/routes/fiscalYears.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "fy_list",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array tahun buku terurut terbaru.>"
}
```

**Isi hasil:** Array tahun buku terurut terbaru.

**Tool terkait:** [`fy_close`](#fy_close)

### fy_reopen

**Ringkasan:** Membuka kembali tahun buku yang sudah ditutup: jurnal penutup CLOSE-<nama> dibalik dan status ditutup dicabut sehingga periode bisa diposting lagi.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`, capability `doc.cancel`)
- **Handler:** `POST /api/fiscal-years/:id/reopen` (src/routes/fiscalYears.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "fy_reopen",
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
  "confirm": "BUKA KEMBALI tahun buku <id>? Jurnal penutup akan dibalik."
}
```

**Isi hasil:** Tahun buku yang dibuka kembali.

**Efek pembukuan/stok:** Membalik jurnal penutup CLOSE-<nama> (DR 3.2 / CR 3.4 sebesar laba tahun itu), mengembalikan saldo berjalan akun pendapatan & beban, dan membuka periode.

**Teks konfirmasi:** BUKA KEMBALI tahun buku {id}? Jurnal penutup akan dibalik.

**Prasyarat**

- Capability doc.cancel.
- Tahun buku berstatus ditutup.

**Error umum**

- 400: tahun buku belum ditutup

**Tool terkait:** [`fy_close`](#fy_close)

### je_cancel

**Ringkasan:** Membatalkan jurnal dengan membalik saldo akun (DR/CR ditukar) dan menandai status Cancelled. Jurnal otomatis dari pembayaran, faktur penjualan/pembelian, HPP, dan aplikasi uang muka ditolak: batalkan dari modul asalnya.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `journal` / `edit`)
- **Handler:** `PATCH /api/journals/:id/cancel` (src/routes/journals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "je_cancel",
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
  "confirm": "Batalkan (reverse) jurnal <id>?"
}
```

**Isi hasil:** Konfirmasi pembatalan / jurnal berstatus Cancelled.

**Efek pembukuan/stok:** Membalik saldo akun & saldo pihak; efek samping aplikasi uang muka/refund pelanggan yang ditautkan ikut dibalik. Tidak ada efek stok. Catatan kode: tidak ada capability doc.cancel pada endpoint ini.

**Teks konfirmasi:** Batalkan (reverse) jurnal {id}?

**Prasyarat**

- Jurnal berstatus Submitted dan bukan jurnal otomatis (JV-PAY/SI/PI/COGS) atau Aplikasi Uang Muka.

**Error umum**

- 404: tidak ditemukan
- 400: sudah dibatalkan
- 400: jurnal terkait pembayaran/dokumen sumber

**Tool terkait:** [`je_get`](#je_get), [`je_create`](#je_create)

### je_create

**Ringkasan:** Membuat jurnal manual langsung berstatus Submitted (tidak ada draft) pada tahun buku terbuka sesuai tanggal. Total debit harus sama dengan total kredit dan satu baris tidak boleh berisi debit sekaligus kredit.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `journal` / `edit`)
- **Handler:** `POST /api/journals` (src/routes/journals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal jurnal (YYYY-MM-DD); harus jatuh di tahun buku terbuka. |
| `narration` | body | `string` | ya | Keterangan jurnal. |
| `items` | body | `array<object>` | ya | Baris jurnal: accountId*, debit, credit (salah satu > 0), partyId (opsional untuk akun piutang/hutang), description. |
| `items[].accountId` | body | `string` | ya |  |
| `items[].debit` | body | `number` | ya |  |
| `items[].credit` | body | `number` | ya |  |
| `items[].partyId` | body | `string` | tidak |  |
| `items[].description` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "je_create",
  "args": {
    "date": "2026-01-31",
    "narration": "<narration>",
    "items": [
      {
        "accountId": "<id>",
        "debit": 1,
        "credit": 1
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
  "confirm": "Posting jurnal manual tanggal 2026-01-31 (<narration>) dengan [...] baris?"
}
```

**Isi hasil:** Jurnal yang dibuat (id, entryNumber, items).

**Efek pembukuan/stok:** Jurnal JV-… langsung diposting ke buku besar tak-terhapus; saldo akun diperbarui, saldo piutang/hutang pihak ikut berubah bila baris memakai partyId pada akun piutang/hutang. Tidak ada efek stok.

**Teks konfirmasi:** Posting jurnal manual tanggal {date} ({narration}) dengan {items} baris?

**Prasyarat**

- Tahun buku untuk tanggal tersebut terbuka.
- Akun pada baris adalah akun detail aktif.

**Error umum**

- 400: Jurnal tidak seimbang
- 400: debit dan kredit sekaligus dalam satu baris
- 400: tahun buku ditutup/tidak ada

**Tool terkait:** [`coa_flat`](#coa_flat), [`je_cancel`](#je_cancel)

### je_get

**Ringkasan:** Detail satu jurnal beserta baris debit/kredit per akun, pihak, dan status.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `journal` / `view`)
- **Handler:** `GET /api/journals/:id` (src/routes/journals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "je_get",
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
  "data": "<Jurnal lengkap (entryNumber, date, narration, status, items[]).>"
}
```

**Isi hasil:** Jurnal lengkap (entryNumber, date, narration, status, items[]).

**Tool terkait:** [`je_list`](#je_list), [`je_cancel`](#je_cancel)

### je_list

**Ringkasan:** Daftar jurnal umum/buku besar dengan paging. Filter: status (Submitted/Cancelled/…), hideCancelled=true, accountId, startDate/endDate, search (nomor/narasi), sort, page, limit (maks 200).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `journal` / `view`)
- **Handler:** `GET /api/journals` (src/routes/journals.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "je_list",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: jurnal[] (header + baris item per akun), total, page, limit }.>"
}
```

**Isi hasil:** { data: jurnal[] (header + baris item per akun), total, page, limit }.

**Tool terkait:** [`je_get`](#je_get), [`je_create`](#je_create)

### sysacct_get

**Ringkasan:** Pemetaan akun sistem (role → akun COA) untuk auto-posting GL, mis. Piutang, Hutang, Persediaan, HPP, Uang Muka Karyawan, Laba Ditahan, serta daftar role yang tersedia dan mana yang wajib.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `settings` / `view`)
- **Catatan akses:** GET terbuka bagi semua user login (requireWrite settings).
- **Handler:** `GET /api/system-accounts` (src/routes/systemAccounts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "sysacct_get",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ mappings: per role → akun[], roles: definisi role akun sistem }.>"
}
```

**Isi hasil:** { mappings: per role → akun[], roles: definisi role akun sistem }.

**Tool terkait:** [`sysacct_update`](#sysacct_update)

### sysacct_update

**Ringkasan:** Mengubah pemetaan akun sistem (mappings: role+accountId+sortOrder; clearRoles: melepas role non-wajib). Hanya role Admin (dicek eksplisit). Mempengaruhi SEMUA posting otomatis berikutnya.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `PUT /api/system-accounts` (src/routes/systemAccounts.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `mappings` | body | `array<object>` | tidak |  |
| `mappings[].role` | body | `string` | ya |  |
| `mappings[].accountId` | body | `uuid` | ya |  |
| `mappings[].sortOrder` | body | `number` | tidak |  |
| `clearRoles` | body | `array<string>` | tidak | Roles yang ingin dilepas total (set ke kosong). Tidak boleh role wajib. |

**Contoh pemanggilan**

```json
{
  "tool": "sysacct_update",
  "args": {
    "mappings": [
      {
        "role": "<role>",
        "accountId": "00000000-0000-0000-0000-000000000000"
      }
    ],
    "clearRoles": []
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
  "confirm": "Ubah pemetaan akun sistem ([...] pemetaan, lepas [...])? Berdampak pada semua posting otomatis."
}
```

**Isi hasil:** Pemetaan terbaru.

**Efek pembukuan/stok:** Tidak memposting jurnal, tetapi menentukan akun DR/CR semua jurnal otomatis berikutnya (penjualan, pembelian, HPP, uang muka, penutupan buku). Salah petakan = pembukuan salah.

**Teks konfirmasi:** Ubah pemetaan akun sistem ({mappings} pemetaan, lepas {clearRoles})? Berdampak pada semua posting otomatis.

**Prasyarat**

- Akun tujuan aktif dan bukan akun grup.
- Role wajib tidak boleh dikosongkan.

**Error umum**

- 403: hanya Admin
- 400: role tidak valid / akun tidak aktif / role wajib dilepas

**Tool terkait:** [`sysacct_get`](#sysacct_get), [`coa_flat`](#coa_flat)

### tax_create_config

**Ringkasan:** Menambah konfigurasi pajak baru (nama, tarif persen, tipe sales/purchase/withholding, akun GL opsional).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `POST /api/tax/config` (src/routes/tax.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama. |
| `rate` | body | `number` | ya | Tarif dalam persen (mis. 11). |
| `type` | body | enum: `sales`, `purchase`, `withholding` | ya | sales = PPN keluaran, purchase = PPN masukan, withholding = PPh dipotong. |
| `accountId` | body | `string` | tidak | ID akun COA. |

**Contoh pemanggilan**

```json
{
  "tool": "tax_create_config",
  "args": {
    "name": "<name>",
    "rate": 1,
    "type": "sales"
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
  "confirm": "Tambah konfigurasi pajak <name> 1% (sales)?"
}
```

**Isi hasil:** Konfigurasi yang dibuat.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya master konfigurasi pajak.

**Teks konfirmasi:** Tambah konfigurasi pajak {name} {rate}% ({type})?

**Tool terkait:** [`tax_get_config`](#tax_get_config)

### tax_delete_config

**Ringkasan:** Menghapus konfigurasi tarif pajak (PPN/PPh) dari master. Dokumen yang sudah diposting tidak berubah.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/tax/config/:id` (src/routes/tax.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |

**Contoh pemanggilan**

```json
{
  "tool": "tax_delete_config",
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
  "confirm": "HAPUS konfigurasi pajak <id>?"
}
```

**Isi hasil:** Konfirmasi penghapusan.

**Efek pembukuan/stok:** Tidak ada jurnal; menghapus master konfigurasi pajak (permanen).

**Teks konfirmasi:** HAPUS konfigurasi pajak {id}?

**Tool terkait:** [`tax_get_config`](#tax_get_config)

### tax_get_config

**Ringkasan:** Daftar konfigurasi tarif pajak (PPN penjualan/pembelian, PPh potong) beserta akun GL terkait.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `settings` / `view`)
- **Catatan akses:** GET terbuka bagi semua user login (requireWrite settings).
- **Handler:** `GET /api/tax/config` (src/routes/tax.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "tax_get_config",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array konfigurasi pajak (name, rate, type, accountId, isActive).>"
}
```

**Isi hasil:** Array konfigurasi pajak (name, rate, type, accountId, isActive).

**Tool terkait:** [`tax_report`](#tax_report)

### tax_report

**Ringkasan:** Laporan pajak bulanan untuk rentang startDate-endDate (wajib): PPN keluaran dari faktur penjualan dan PPN masukan/PPh dari faktur pembelian berstatus Submitted/Paid/PartiallyPaid/Overdue, dikelompokkan per bulan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `reports` / `view`)
- **Catatan akses:** Endpoint hanya memakai requireWrite(settings) sehingga GET terbuka bagi semua user login; modul reports dipilih sebagai batas semantik di sisi AIRA.
- **Handler:** `GET /api/tax/report` (src/routes/tax.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |

**Contoh pemanggilan**

```json
{
  "tool": "tax_report",
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
  "data": "<Ringkasan per bulan: ppnKeluaran, ppnMasukan, pph, plus total.>"
}
```

**Isi hasil:** Ringkasan per bulan: ppnKeluaran, ppnMasukan, pph, plus total.

**Error umum**

- 400: startDate dan endDate wajib diisi

**Tool terkait:** [`tax_get_config`](#tax_get_config)

### tax_update_config

**Ringkasan:** Mengubah konfigurasi pajak (nama, tarif, tipe, akun, aktif/nonaktif). Tidak mengubah faktur yang sudah diposting.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `PUT /api/tax/config/:id` (src/routes/tax.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID dokumen/rekaman (UUID). |
| `name` | body | `string` | tidak | Nama. |
| `rate` | body | `number` | tidak | Harga satuan. |
| `type` | body | enum: `sales`, `purchase`, `withholding` | tidak | Tipe/jenis (nilai valid mengikuti skema). |
| `accountId` | body | `string` | tidak | ID akun COA. |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "tax_update_config",
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
  "confirm": "Ubah konfigurasi pajak <id>?"
}
```

**Isi hasil:** Konfigurasi setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; tarif baru dipakai untuk dokumen berikutnya.

**Teks konfirmasi:** Ubah konfigurasi pajak {id}?

**Tool terkait:** [`tax_get_config`](#tax_get_config)


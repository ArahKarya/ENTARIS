# Toolset: Persediaan (`persediaan`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/persediaan` · 34 tool (read 19, write 6, critical 9)

## Tujuan

Toolset **persediaan** memberi AIRA kemampuan membaca dan (dengan persetujuan) mengubah data stok: master item, gudang, kartu stok (pergerakan stok), transfer antar gudang, stok opname, serta dashboard persediaan. Semua pembacaan aman dipanggil otomatis; setiap tool yang mengubah stok atau jurnal diklasifikasikan `critical` karena efeknya langsung (tidak ada tahap draft pada pergerakan stok, transfer, maupun opname).

## ALUR BISNIS

### Alur bisnis

Persediaan dicatat di tiga lapis:

| Lapis | Tabel (konsep) | Isi |
|-------|----------------|-----|
| Master item | `InventoryItem` | kode, nama, satuan, kategori, `minimumStock`, `averageCost` (WAC/HPP), `currentStock` (total semua gudang, denormalisasi), `accountId` (akun persediaan, kosong = 1.4.0) |
| Saldo per gudang | `InventoryStock` (item x gudang) | `currentStock` per gudang. Biaya (WAC) tetap satu angka per item untuk semua gudang. |
| Kartu stok | `StockMovement` (nomor `SM-...`) | tiap perubahan stok: jenis `In`, `Out`, `AdjustmentIn`, `AdjustmentOut`, `TransferIn`, `TransferOut`; `quantity`, `unitCost`, `totalValue`, `referenceType/Id` (dokumen asal), `isCancelled`, `journalEntryId` |

Sumber pergerakan stok (siapa yang menghasilkan SM):

1. **Pembelian**: STT/BPB (penerimaan barang) = stok masuk + akrual hutang; PI standalone = stok masuk + hutang (lihat toolset pembelian).
2. **Penjualan**: Surat Jalan (DO) / Invoice penjualan = stok keluar (HPP/COGS memakai `unitCost` yang terkunci).
3. **Produksi**: `ProductionRun` = bahan input keluar, produk output masuk (lihat toolset produksi).
4. **Manual** (`inv_mov_create`): stok awal, koreksi, pemakaian lain.
5. **Transfer antar gudang** (`stf_create`): `TransferOut` + `TransferIn` berpasangan.
6. **Stok opname** (`opn_create`): penyesuaian selisih fisik vs sistem.

Pergerakan yang lahir dari dokumen lain (STT/GoodsReceipt, ProductionRun) **tidak boleh diedit/dibatalkan per baris** lewat `inv_mov_update` / `inv_mov_cancel`; koreksi dilakukan di dokumen sumbernya.

Status dokumen:
- **Transfer stok**: `Submitted` (langsung saat dibuat) -> `Cancelled`. Enum `DocumentStatus` memang punya `Draft`, tetapi API tidak membuat draft transfer.
- **Stok opname**: `Submitted` (langsung final saat dibuat) -> `Cancelled`. `Draft` ada di enum, tetapi pembuatan lewat API sekali jalan; bila ada sesi `Draft` lama, pembuatan baru ditolak.
- **Pergerakan stok**: aktif atau `isCancelled=true` (tidak ada status Draft).
- **Gudang/Item**: `isActive` true/false; gudang punya satu `isDefault`.

### Aturan posting

Kunci ringkas: **stok bergerak = SM**, **jurnal hanya bila ada nilai uang yang berpindah akun**.

| Tool | Efek stok | Efek GL | Efek WAC |
|------|-----------|---------|----------|
| `inv_mov_create` In/AdjustmentIn | + qty (gudang & total) | DR Persediaan (akun item / 1.4.0) / CR akun lawan (default Ekuitas Saldo Awal 3.1) bila qty x unitCost > 0 | dihitung ulang: `(stok x WAC lama + qty x unitCost) / (stok + qty)` hanya bila unitCost > 0 |
| `inv_mov_create` Out/AdjustmentOut | - qty (ditolak bila stok gudang < qty) | DR akun lawan / CR Persediaan | tidak berubah |
| `inv_mov_update` | batal lama + buat baru | jurnal lama dibatalkan, jurnal baru diposting | dihitung ulang dari replay riwayat (`recomputeAverageCostFromReplay`), COGS backfill diselesaikan ulang |
| `inv_mov_cancel` | dibalik | jurnal terkait Cancelled, saldo akun dihitung ulang | recompute |
| `stf_create` | - qty gudang asal, + qty gudang tujuan; total item tetap | **tidak ada** (akun persediaan sama, net nol) | tidak berubah |
| `stf_cancel` | dibalik | tidak ada | tidak berubah |
| `opn_create` | disesuaikan = stok aktual - stok sistem per item | surplus: DR Persediaan / CR Selisih Persediaan (6.38 default, role `INVENTORY_VARIANCE`); defisit: DR Selisih Persediaan / CR Persediaan; revaluasi `unitCost` manual: selisih nilai dijurnal ke akun yang sama | `averageCost` item diganti ke `unitCost` manual bila berbeda |
| `opn_cancel` | dibalik | jurnal `JV-<nomor opname>` Cancelled | revaluasi tidak otomatis dikembalikan |

Aturan wajib:
- Setiap jurnal harus seimbang (debit = kredit); sistem menjaga ini, AIRA tidak perlu menghitung manual.
- Tanggal transaksi harus jatuh di **tahun fiskal yang belum ditutup** (jika tidak: 400 "Tidak ada tahun fiskal aktif").
- Nilai uang dibulatkan 2 desimal; kuantitas sampai 3 desimal.
- Akun sistem 1.4.0 (Persediaan Umum) dan 3.1 (Ekuitas Saldo Awal) tidak boleh diubah (lihat CLAUDE.md).

### Persetujuan

- Modul persediaan **tidak** memakai antrian `ApprovalRequest` (`needsApproval`) untuk pergerakan manual, transfer, maupun opname; keamanannya lewat izin RBAC modul (`inventory`, `stock_transfer`, `stock_opname`) dan capability.
- Capability yang relevan: `doc.cancel` (wajib untuk `inv_mov_cancel`, `opn_cancel`, `wh_delete`), `inventory.negative_stock` (izin melewati validasi stok minus; dipakai di produksi/penjualan, bukan di pergerakan manual).
- Pada rancangan AIRA: semua tool `critical` di toolset ini berstatus **Wajib-Approve** (manusia mengonfirmasi sebelum dieksekusi), tool `write` (master) berstatus Draft/Approve, tool `read` otomatis.
- Peringatan konsistensi: `stf_cancel` hanya butuh izin edit `stock_transfer` (tanpa `doc.cancel`) dan tidak mengecek stok gudang tujuan; manusia sebaiknya meninjau.

### Jebakan umum

1. **Stok total vs per gudang**. `inv_items_list` tanpa `warehouseId` menampilkan total semua gudang; dengan `warehouseId` menampilkan saldo gudang itu (0 bila tak ada baris). Jangan menjumlah ulang sendiri.
2. **Biaya satuan nol**. `inv_mov_create` dengan `unitCost` kosong/0 tidak menjurnal dan tidak mengubah WAC (stok bertambah tanpa nilai). Untuk stok awal selalu isi `unitCost`.
3. **Akun lawan default 3.1**. Tanpa `offsetAccountId`, pergerakan masuk menjurnal CR Ekuitas Saldo Awal; untuk koreksi biasa sebaiknya tentukan akun lawan yang tepat (mis. akun selisih persediaan).
4. **Edit = batal + buat ulang**. `inv_mov_update` bukan edit draft; nomor SM berubah dan jurnal lama berstatus Cancelled.
5. **Transfer langsung berlaku**. `stf_create` tidak punya draft; kesalahan harus diperbaiki dengan `stf_cancel` lalu buat ulang. `stf_update` hanya mengubah metadata cetak (mobil, supir, penerima, catatan).
6. **Opname langsung final**. `opn_create` memposting penyesuaian dan jurnal saat itu juga. Kirim semua item yang dihitung (termasuk yang tidak berselisih) agar jejak audit lengkap; angka aktual negatif ditolak kecuali sama dengan stok sistem minus historis.
7. **Revaluasi tak sengaja**. Mengisi `unitCost` pada baris opname yang berbeda dari WAC akan MENGUBAH `averageCost` item dan menjurnal selisih nilai. Isi hanya bila memang revaluasi.
8. **Pembatalan butuh stok**. `inv_mov_cancel` untuk pergerakan masuk dan `opn_cancel` untuk surplus ditolak bila stok saat ini tidak cukup untuk dibalik.
9. **Hapus master**. `inv_item_delete` menghapus permanen item + pergerakan batalnya, dan ditolak bila ada mutasi aktif/dipakai invoice. `wh_delete` ditolak untuk gudang default/bersaldo/berriwayat; nonaktifkan saja (`wh_update isActive=false`).
10. **Batch**. `inv_item_batches` hanya melacak pemakaian yang tertaut `sourceMovementId`; jumlah sisa batch tidak selalu sama dengan stok fisik.
11. **Data referensi terbuka**. GET items, gudang tidak butuh izin khusus (semua user login boleh membaca) sehingga tool `read` untuk master tersedia bagi semua role; hanya penulisan butuh `edit`.
12. **Stok minus** (hasil penjualan/produksi dengan bypass) dipantau di dashboard "Stok Minus Aktif"; COGS penjualan yang tertunda diselesaikan otomatis (COGS backfill) ketika stok masuk berikutnya tercatat.

### Peta istilah

| Istilah bisnis | Padanan sistem |
|----------------|----------------|
| Barang / item / bahan / produk | `InventoryItem` (kode, nama, satuan) |
| Gudang | `Warehouse` (kode, `isDefault`) |
| Kartu stok / mutasi stok | `StockMovement` (nomor `SM-...`) |
| Stok masuk / keluar | movementType `In` / `Out` |
| Penyesuaian stok | `AdjustmentIn` / `AdjustmentOut` |
| Transfer / mutasi antar gudang / SJG (Surat Jalan Antar Gudang) | `StockTransfer` (`TransferOut` + `TransferIn`) |
| Stok opname / hitung fisik | `StockOpname` (nomor `SO-...`; jangan tertukar dengan Sales Order) |
| Selisih opname | `difference` = stok aktual - stok sistem; akun Selisih Persediaan (6.38) |
| HPP / harga pokok rata-rata / WAC | `averageCost` (Weighted Average Cost, satu angka per item) |
| Nilai persediaan | stok x `averageCost` |
| Stok minimum / stok rendah | `minimumStock`; status stok `low` / `out` / `ok` |
| Batch / lot | pergerakan masuk aktif + sisa tersedia (`inv_item_batches`) |
| Akun persediaan umum | 1.4.0; akun lawan default stok awal 3.1 Ekuitas Saldo Awal |
| Tahun fiskal terbuka | `FiscalYear.isClosed=false` yang mencakup tanggal transaksi |
| Bypass stok minus | capability `inventory.negative_stock` |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`inv_dash_by_category`](#inv_dash_by_category) | read | - | `GET /api/inventory/dashboard/by-category` |
| [`inv_dash_metrics`](#inv_dash_metrics) | read | - | `GET /api/inventory/dashboard/metrics` |
| [`inv_dash_movement_trend`](#inv_dash_movement_trend) | read | - | `GET /api/inventory/dashboard/movement-trend` |
| [`inv_dash_recent_movements`](#inv_dash_recent_movements) | read | - | `GET /api/inventory/dashboard/recent-movements` |
| [`inv_dash_stock_value`](#inv_dash_stock_value) | read | - | `GET /api/inventory/dashboard/stock-value` |
| [`inv_dash_top_items`](#inv_dash_top_items) | read | - | `GET /api/inventory/dashboard/top-items` |
| [`inv_item_batches`](#inv_item_batches) | read | - | `GET /api/inventory/items/:id/batches` |
| [`inv_item_create`](#inv_item_create) | write | tidak | `POST /api/inventory/items` |
| [`inv_item_delete`](#inv_item_delete) | critical | tidak | `DELETE /api/inventory/items/:id` |
| [`inv_item_update`](#inv_item_update) | write | tidak | `PUT /api/inventory/items/:id` |
| [`inv_items_list`](#inv_items_list) | read | - | `GET /api/inventory/items` |
| [`inv_items_summary`](#inv_items_summary) | read | - | `GET /api/inventory/items/summary` |
| [`inv_mov_cancel`](#inv_mov_cancel) | critical | tidak | `PUT /api/inventory/movements/:id/cancel` |
| [`inv_mov_create`](#inv_mov_create) | critical | tidak | `POST /api/inventory/movements` |
| [`inv_mov_get`](#inv_mov_get) | read | - | `GET /api/inventory/movements/:id` |
| [`inv_mov_list`](#inv_mov_list) | read | - | `GET /api/inventory/movements` |
| [`inv_mov_summary`](#inv_mov_summary) | read | - | `GET /api/inventory/movements/summary` |
| [`inv_mov_update`](#inv_mov_update) | critical | tidak | `PUT /api/inventory/movements/:id` |
| [`opn_cancel`](#opn_cancel) | critical | tidak | `PUT /api/stock-opname/:id/cancel` |
| [`opn_create`](#opn_create) | critical | tidak | `POST /api/stock-opname` |
| [`opn_get`](#opn_get) | read | - | `GET /api/stock-opname/:id` |
| [`opn_list`](#opn_list) | read | - | `GET /api/stock-opname` |
| [`stf_cancel`](#stf_cancel) | critical | tidak | `PATCH /api/stock-transfers/:id/cancel` |
| [`stf_create`](#stf_create) | critical | tidak | `POST /api/stock-transfers` |
| [`stf_get`](#stf_get) | read | - | `GET /api/stock-transfers/:id` |
| [`stf_list`](#stf_list) | read | - | `GET /api/stock-transfers` |
| [`stf_mark_printed`](#stf_mark_printed) | write | tidak | `POST /api/stock-transfers/:id/mark-printed` |
| [`stf_update`](#stf_update) | write | tidak | `PATCH /api/stock-transfers/:id` |
| [`wh_create`](#wh_create) | write | tidak | `POST /api/warehouses` |
| [`wh_delete`](#wh_delete) | critical | tidak | `DELETE /api/warehouses/:id` |
| [`wh_get`](#wh_get) | read | - | `GET /api/warehouses/:id` |
| [`wh_list`](#wh_list) | read | - | `GET /api/warehouses` |
| [`wh_stock_snapshot`](#wh_stock_snapshot) | read | - | `GET /api/warehouses/stock-snapshot` |
| [`wh_update`](#wh_update) | write | tidak | `PUT /api/warehouses/:id` |

## Rincian tool

### inv_dash_by_category

**Ringkasan:** Distribusi stok per kategori item aktif: jumlah item dan total kuantitas per kategori (item tanpa kategori dikelompokkan 'Lainnya'), urut dari kuantitas terbesar. Untuk NILAI rupiah per kategori gunakan inv_dash_stock_value.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/by-category` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_by_category",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array [{category, itemCount, totalQuantity}] terurut menurun menurut totalQuantity.>"
}
```

**Isi hasil:** Array [{category, itemCount, totalQuantity}] terurut menurun menurut totalQuantity.

**Tool terkait:** [`inv_dash_stock_value`](#inv_dash_stock_value)

### inv_dash_metrics

**Ringkasan:** Metrik ringkas persediaan: jumlah item, item aktif, jumlah item stok rendah (di bawah stok minimum), jumlah mutasi stok bulan berjalan, dan total nilai persediaan (stok x biaya rata-rata). Menggantikan alias lama inv_low_stock yang menunjuk endpoint yang sama.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/metrics` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_metrics",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {totalItems, activeItems, lowStockCount, movementsThisMonth, inventoryValue}.>"
}
```

**Isi hasil:** Objek {totalItems, activeItems, lowStockCount, movementsThisMonth, inventoryValue}.

**Error umum**

- 500: gagal mengambil metrik gudang

**Tool terkait:** [`inv_dash_stock_value`](#inv_dash_stock_value), [`inv_items_list`](#inv_items_list)

### inv_dash_movement_trend

**Ringkasan:** Tren pergerakan stok 6 bulan terakhir (jumlah/kuantitas masuk vs keluar per bulan) untuk grafik dashboard persediaan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/movement-trend` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_movement_trend",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Deret bulanan pergerakan stok masuk dan keluar (6 bulan terakhir).>"
}
```

**Isi hasil:** Deret bulanan pergerakan stok masuk dan keluar (6 bulan terakhir).

### inv_dash_recent_movements

**Ringkasan:** 10 pergerakan stok terbaru (nomor SM, item, jenis, kuantitas, nilai) untuk panel aktivitas dashboard. Untuk pencarian/filter gunakan inv_mov_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/recent-movements` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_recent_movements",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array 10 pergerakan stok terakhir.>"
}
```

**Isi hasil:** Array 10 pergerakan stok terakhir.

**Tool terkait:** [`inv_mov_list`](#inv_mov_list)

### inv_dash_stock_value

**Ringkasan:** Nilai persediaan operasional (kuantitas x biaya rata-rata item aktif) dikelompokkan per kategori atau per gudang, lengkap dengan porsi persentase terhadap total.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/stock-value` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `groupBy` | query | enum: `category`, `warehouse` | ya | Pengelompokan: 'category' (per kategori item) atau 'warehouse' (per gudang, memakai saldo inventory_stocks). |

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_stock_value",
  "args": {
    "groupBy": "category"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {groupBy, total, groups:[{key, label, itemCount, value, share}]}.>"
}
```

**Isi hasil:** Objek {groupBy, total, groups:[{key, label, itemCount, value, share}]}.

**Error umum**

- 400: groupBy harus category atau warehouse

**Tool terkait:** [`inv_dash_by_category`](#inv_dash_by_category), [`inv_dash_top_items`](#inv_dash_top_items)

### inv_dash_top_items

**Ringkasan:** Semua item aktif diurutkan menurut nilai stok (kuantitas x biaya rata-rata) dari terbesar. Berguna untuk melihat item yang menyerap modal persediaan terbanyak.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/dashboard/top-items` (src/routes/inventory/dashboard.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "inv_dash_top_items",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array item dengan kuantitas, biaya rata-rata, dan nilai stok, terurut menurun menurut nila>"
}
```

**Isi hasil:** Array item dengan kuantitas, biaya rata-rata, dan nilai stok, terurut menurun menurut nilai.

**Tool terkait:** [`inv_dash_stock_value`](#inv_dash_stock_value)

### inv_item_batches

**Ringkasan:** Daftar batch stok masuk (pergerakan In/AdjustmentIn aktif) sebuah item beserta biaya satuan dan sisa tersedia per batch (qtyInbound dikurangi pemakaian yang tertaut via sourceMovementId: produksi, penjualan, transfer, penyesuaian keluar). Hanya batch dengan sisa > 0 yang dikembalikan. Dipakai memilih batch bahan baku pada input produksi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/items/:id/batches` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID item persediaan. |
| `warehouseId` | query | `string` | tidak | Opsional: batasi ke batch di satu gudang. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_item_batches",
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
  "data": "<Objek {data:[{id, movementNumber, date, qtyInbound, unitCost, qtyConsumed, qtyAvailable, s>"
}
```

**Isi hasil:** Objek {data:[{id, movementNumber, date, qtyInbound, unitCost, qtyConsumed, qtyAvailable, sourceType, sourceRef, sourceRefId}], item, currentStock}. Pemakaian yang tidak tertaut ke batch diserap berurutan sehingga total sisa batch dapat berbeda dari stok sebenarnya.

**Prasyarat**

- Item harus ada.

**Error umum**

- 404: item tidak ditemukan

**Tool terkait:** [`prod_draft_create`](produksi.md#prod_draft_create), [`inv_items_list`](#inv_items_list)

### inv_item_create

**Ringkasan:** Membuat master item persediaan baru (kode unik, nama, satuan, kategori, minimum stok, akun persediaan opsional). Stok awal 0; tidak ada jurnal. Stok awal dimasukkan lewat pergerakan stok manual atau opname.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `inventory` / `edit`)
- **Handler:** `POST /api/inventory/items` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode item unik (400 bila sudah dipakai). |
| `name` | body | `string` | ya | Nama. |
| `unit` | body | `string` | ya | Satuan dasar (mis. kg, pcs). |
| `category` | body | `string` | tidak | Kategori aset tetap. |
| `description` | body | `string` | tidak | Keterangan. |
| `minimumStock` | body | `number` | tidak | Batas stok minimum untuk peringatan stok rendah (default 0). |
| `accountId` | body | `string` | tidak | Opsional: UUID akun persediaan khusus item; kosong = akun Persediaan Umum 1.4.0. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_item_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "unit": "<unit>"
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
  "confirm": "Buat item persediaan <code> - <name> (satuan <unit>)?"
}
```

**Isi hasil:** Item yang dibuat (201) beserta akun terkait.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya master; stok 0, WAC 0).

**Teks konfirmasi:** Buat item persediaan {code} - {name} (satuan {unit})?

**Error umum**

- 400: Kode item sudah digunakan

**Tool terkait:** [`inv_item_update`](#inv_item_update), [`inv_mov_create`](#inv_mov_create), [`opn_create`](#opn_create)

### inv_item_delete

**Ringkasan:** Menghapus PERMANEN master item beserta seluruh baris pergerakan stok-nya yang sudah dibatalkan. Ditolak bila item punya mutasi stok aktif atau sudah dipakai di invoice penjualan/pembelian; gunakan inv_item_update isActive=false untuk menonaktifkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `inventory` / `edit`)
- **Handler:** `DELETE /api/inventory/items/:id` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID item. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_item_delete",
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
  "confirm": "HAPUS PERMANEN item <id>? Tindakan ini tidak dapat dibatalkan."
}
```

**Isi hasil:** Pesan {message: 'Item stok berhasil dihapus.'}.

**Efek pembukuan/stok:** Tidak ada jurnal. Hard delete master item + baris stock_movements berstatus batal milik item (tidak dapat dikembalikan).

**Teks konfirmasi:** HAPUS PERMANEN item {id}? Tindakan ini tidak dapat dibatalkan.

**Error umum**

- 400: item punya mutasi stok aktif
- 400: item sudah dipakai di invoice
- 404: item tidak ditemukan

**Tool terkait:** [`inv_item_update`](#inv_item_update)

### inv_item_update

**Ringkasan:** Mengubah master item (kode, nama, satuan, kategori, deskripsi, minimum stok, akun persediaan, status aktif). Tidak mengubah stok maupun WAC dan tidak menjurnal ulang; mengganti accountId hanya berlaku untuk transaksi berikutnya.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `inventory` / `edit`)
- **Handler:** `PUT /api/inventory/items/:id` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID item. |
| `code` | body | `string` | tidak | Kode. |
| `name` | body | `string` | tidak | Nama. |
| `unit` | body | `string` | tidak | Satuan. |
| `category` | body | `string` | tidak | Kategori aset tetap. |
| `description` | body | `string` | tidak | Keterangan. |
| `minimumStock` | body | `number` | tidak |  |
| `accountId` | body | `string` | tidak | ID akun COA. |
| `isActive` | body | `boolean` | tidak | false = nonaktifkan item (tidak bisa dipakai transaksi baru). |

**Contoh pemanggilan**

```json
{
  "tool": "inv_item_update",
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
  "confirm": "Ubah master item <id>?"
}
```

**Isi hasil:** Item setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung. Catatan: mengganti accountId membuat transaksi baru memakai akun lain (jurnal lama tidak dipindah).

**Teks konfirmasi:** Ubah master item {id}?

**Error umum**

- 404: item tidak ditemukan

**Tool terkait:** [`inv_items_list`](#inv_items_list)

### inv_items_list

**Ringkasan:** Daftar master item persediaan dengan stok saat ini, biaya rata-rata (WAC), akun persediaan, dan minimum stok. Bila warehouseId diberikan, currentStock diganti saldo gudang itu. Mode halaman daftar (aktif bila sort/stockStatus/category dikirim) menambah status stok per baris.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** GET data referensi terbuka untuk semua user login (requireWrite); hanya tulis butuh izin edit modul inventory.
- **Handler:** `GET /api/inventory/items` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `string` | tidak | Nomor halaman (mulai 1). |
| `limit` | query | `string` | tidak | Jumlah baris per halaman (maks 200). |
| `search` | query | `string` | tidak | Cari pada kode atau nama item (tanpa membedakan huruf besar/kecil). |
| `isActive` | query | `string` | tidak | 'true' / 'false' untuk menyaring item aktif/nonaktif. |
| `warehouseId` | query | `string` | tidak | UUID gudang; stok yang ditampilkan menjadi saldo gudang tersebut. |
| `category` | query | `string` | tidak | Saring persis pada kategori item. |
| `stockStatus` | query | enum: `out`, `low`, `ok` | tidak | Status stok: out = habis, low = di bawah minimum, ok = cukup. |
| `sort` | query | `string` | tidak | Urutan: code\|name\|category\|currentStock\|minimumStock\|stockValue; awali '-' untuk menurun. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_items_list",
  "args": {
    "page": "<page>",
    "limit": "<limit>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {data:[item], total, page, limit}; item memuat code, name, unit, category, currentSt>"
}
```

**Isi hasil:** Objek {data:[item], total, page, limit}; item memuat code, name, unit, category, currentStock, minimumStock, averageCost, account (+ stockStatus pada mode halaman daftar).

**Tool terkait:** [`inv_items_summary`](#inv_items_summary), [`inv_item_batches`](#inv_item_batches), [`inv_item_create`](#inv_item_create)

### inv_items_summary

**Ringkasan:** Total KPI untuk filter yang sama dengan daftar item (search, isActive, warehouseId, category, stockStatus): jumlah item, total nilai, jumlah habis/rendah, serta daftar kategori.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/inventory/items/summary` (src/routes/inventory/items.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `search` | query | `string` | tidak | Kata kunci pencarian (nomor dokumen / nama). |
| `isActive` | query | `string` | tidak | Status aktif. |
| `warehouseId` | query | `uuid` | tidak | ID gudang. |
| `category` | query | `string` | tidak | Kategori aset tetap. |
| `stockStatus` | query | enum: `out`, `low`, `ok` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "inv_items_summary",
  "args": {
    "search": "<search>",
    "isActive": "<isActive>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek ringkasan KPI item (jumlah, nilai, habis/rendah, kategori).>"
}
```

**Isi hasil:** Objek ringkasan KPI item (jumlah, nilai, habis/rendah, kategori).

**Tool terkait:** [`inv_items_list`](#inv_items_list)

### inv_mov_cancel

**Ringkasan:** Membatalkan pergerakan stok: stok gudang dan total dibalik, jurnal terkait dibatalkan (ledger ikut batal, saldo akun dihitung ulang). Pergerakan dari STT harus dibatalkan lewat STT.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `inventory` / `edit`, capability `doc.cancel`)
- **Handler:** `PUT /api/inventory/movements/:id/cancel` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID pergerakan stok. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_cancel",
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
  "confirm": "Batalkan pergerakan stok <id>? Stok dan jurnal akan dibalik."
}
```

**Isi hasil:** Pesan sukses pembatalan.

**Efek pembukuan/stok:** Stok dibalik (In dikurangi / Out ditambah); jurnal terkait status Cancelled + saldo akun dihitung ulang; WAC dan COGS backfill disesuaikan.

**Teks konfirmasi:** Batalkan pergerakan stok {id}? Stok dan jurnal akan dibalik.

**Prasyarat**

- User memiliki capability doc.cancel.
- Untuk pergerakan masuk: stok saat ini cukup untuk pembalikan.

**Error umum**

- 400: gerakan sudah dibatalkan
- 400: dari STT tidak dapat dibatalkan per baris
- 400: stok tidak mencukupi untuk pembalikan
- 403: tanpa capability doc.cancel

**Tool terkait:** [`inv_mov_get`](#inv_mov_get), [`inv_mov_create`](#inv_mov_create)

### inv_mov_create

**Ringkasan:** Mencatat pergerakan stok manual (In, Out, AdjustmentIn, AdjustmentOut) pada satu item di satu gudang. Langsung mengubah stok gudang dan stok total, menghitung ulang WAC pada stok masuk, dan memposting jurnal otomatis bila biaya satuan > 0. Gudang default dipakai bila warehouseId kosong.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `inventory` / `edit`)
- **Handler:** `POST /api/inventory/movements` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | body | `string` | ya | UUID item persediaan (harus aktif). |
| `warehouseId` | body | `uuid` | tidak | UUID gudang; kosong = gudang default aktif. |
| `movementType` | body | enum: `In`, `Out`, `AdjustmentIn`, `AdjustmentOut` | ya | In = stok masuk, Out = stok keluar, AdjustmentIn/AdjustmentOut = penyesuaian tambah/kurang. |
| `quantity` | body | `number` | ya | Kuantitas (> 0). |
| `unitCost` | body | `number` | tidak | Biaya satuan; jika 0/kosong tidak ada jurnal dan WAC tidak berubah. |
| `date` | body | `date` | ya | Tanggal transaksi (YYYY-MM-DD) - harus berada di tahun fiskal aktif. |
| `offsetAccountId` | body | `string` | tidak | UUID akun lawan jurnal (default Ekuitas Saldo Awal 3.1). |
| `referenceType` | body | `string` | tidak |  |
| `referenceId` | body | `string` | tidak |  |
| `referenceNumber` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `sourceMovementId` | body | `uuid` | tidak | Opsional UUID batch sumber. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_create",
  "args": {
    "itemId": "<id>",
    "movementType": "In",
    "quantity": 1,
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
  "confirm": "Catat In 1 untuk item <id> tanggal 2026-01-31 (biaya satuan {unitCost})? Stok dan jurnal akan langsung berubah."
}
```

**Isi hasil:** Pergerakan stok yang dibuat (201) dengan nomor SM dan journalEntryId bila ada jurnal.

**Efek pembukuan/stok:** Stok: +/- qty di gudang & total item; WAC dihitung ulang (rata-rata tertimbang) untuk In/AdjustmentIn dengan unitCost > 0. GL (bila qty x unitCost > 0, status jurnal Submitted JV-...): masuk = DR Persediaan item (akun item atau 1.4.0) / CR akun lawan; keluar = DR akun lawan / CR Persediaan. Akun lawan default Ekuitas Saldo Awal 3.1 bila offsetAccountId kosong atau sama dengan akun persediaan.

**Teks konfirmasi:** Catat {movementType} {quantity} untuk item {itemId} tanggal {date} (biaya satuan {unitCost})? Stok dan jurnal akan langsung berubah.

**Prasyarat**

- Tahun fiskal terbuka untuk tanggal transaksi.
- Stok gudang cukup untuk Out/AdjustmentOut.

**Error umum**

- 400: tidak ada tahun fiskal aktif untuk tanggal ini
- 400: stok di gudang tidak cukup
- 400: item tidak aktif / tidak ditemukan

**Tool terkait:** [`inv_mov_cancel`](#inv_mov_cancel), [`inv_mov_list`](#inv_mov_list), [`opn_create`](#opn_create)

### inv_mov_get

**Ringkasan:** Detail satu pergerakan stok (nomor SM, item, gudang, jenis, kuantitas, biaya satuan, akun lawan, referensi dokumen, status batal).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/movements/:id` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID pergerakan stok. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_get",
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
  "data": "<Objek pergerakan stok beserta item dan akun lawan.>"
}
```

**Isi hasil:** Objek pergerakan stok beserta item dan akun lawan.

**Error umum**

- 404: gerakan stok tidak ditemukan

**Tool terkait:** [`inv_mov_list`](#inv_mov_list), [`inv_mov_update`](#inv_mov_update), [`inv_mov_cancel`](#inv_mov_cancel)

### inv_mov_list

**Ringkasan:** Daftar pergerakan stok (kartu stok) dengan filter item, gudang, jenis, status aktif/batal, rentang tanggal, dan pencarian. Tanpa sort, urutan nomor SM menurun.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/movements` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | query | `uuid` | tidak | UUID item. |
| `warehouseId` | query | `uuid` | tidak | UUID gudang. |
| `movementType` | query | `string` | tidak | Jenis: In, Out, AdjustmentIn, AdjustmentOut, TransferIn, TransferOut (sesuai enum StockMovementType). |
| `status` | query | enum: `active`, `cancelled` | tidak | active = hanya yang berlaku, cancelled = hanya yang dibatalkan. |
| `startDate` | query | `date` | tidak | Awal rentang (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Akhir rentang (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor SM / referensi / item / catatan. |
| `sort` | query | `string` | tidak | date\|movementNumber\|item\|quantity\|totalValue; awali '-' untuk menurun. |
| `page` | query | `number` | tidak | Halaman (mulai 1). |
| `limit` | query | `number` | tidak | Baris per halaman (default 50, maks 200). |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_list",
  "args": {
    "itemId": "00000000-0000-0000-0000-000000000000",
    "warehouseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {data:[pergerakan dengan item, gudang, akun lawan], total, page, limit}.>"
}
```

**Isi hasil:** Objek {data:[pergerakan dengan item, gudang, akun lawan], total, page, limit}.

**Error umum**

- 400: filter status/tipe/tanggal tidak valid

**Tool terkait:** [`inv_mov_summary`](#inv_mov_summary), [`inv_mov_get`](#inv_mov_get)

### inv_mov_summary

**Ringkasan:** Total KPI pergerakan stok (jumlah, kuantitas dan nilai masuk/keluar, yang dibatalkan) untuk filter yang sama dengan inv_mov_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `inventory` / `view`)
- **Handler:** `GET /api/inventory/movements/summary` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `itemId` | query | `uuid` | tidak |  |
| `warehouseId` | query | `uuid` | tidak | ID gudang. |
| `movementType` | query | `string` | tidak | Jenis mutasi stok. |
| `status` | query | enum: `active`, `cancelled` | tidak | Filter status dokumen. |
| `startDate` | query | `date` | tidak | Tanggal awal (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Tanggal akhir (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Kata kunci pencarian (nomor dokumen / nama). |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_summary",
  "args": {
    "itemId": "00000000-0000-0000-0000-000000000000",
    "warehouseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek total pergerakan masuk/keluar/dibatalkan (jumlah, qty, nilai).>"
}
```

**Isi hasil:** Objek total pergerakan masuk/keluar/dibatalkan (jumlah, qty, nilai).

**Tool terkait:** [`inv_mov_list`](#inv_mov_list)

### inv_mov_update

**Ringkasan:** Mengedit pergerakan stok manual dengan cara membatalkan yang lama (stok dan jurnal dibalik) lalu membuat yang baru; WAC dihitung ulang dari riwayat dan penyelesaian COGS backfill disesuaikan. BUKAN edit draft. Pergerakan dari STT/GoodsReceipt atau produksi tidak dapat diedit per baris.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `inventory` / `edit`)
- **Handler:** `PUT /api/inventory/movements/:id` (src/routes/inventory/movements.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID pergerakan stok yang diedit. |
| `movementType` | body | enum: `In`, `Out`, `AdjustmentIn`, `AdjustmentOut` | ya | Jenis mutasi stok. |
| `quantity` | body | `number` | ya | Jumlah (qty). |
| `unitCost` | body | `number` | tidak |  |
| `date` | body | `date` | ya | Tanggal dokumen (YYYY-MM-DD). |
| `offsetAccountId` | body | `string` | tidak |  |
| `referenceType` | body | `string` | tidak |  |
| `referenceNumber` | body | `string` | tidak |  |
| `notes` | body | `string` | tidak | Catatan bebas. |

**Contoh pemanggilan**

```json
{
  "tool": "inv_mov_update",
  "args": {
    "id": "<id>",
    "movementType": "In",
    "quantity": 1,
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
  "confirm": "Ubah pergerakan stok <id> menjadi In 1 biaya satuan {unitCost} tanggal 2026-01-31? Stok dan jurnal lama dibalik lalu dibuat ulang."
}
```

**Isi hasil:** Pergerakan stok hasil edit (pergerakan baru).

**Efek pembukuan/stok:** Membalik stok & jurnal lama (jurnal lama berstatus Cancelled), memposting stok & jurnal baru sesuai nilai baru (DR/CR Persediaan vs akun lawan seperti inv_mov_create), reverse+settle ulang COGS backfill, recompute WAC item dari replay.

**Teks konfirmasi:** Ubah pergerakan stok {id} menjadi {movementType} {quantity} biaya satuan {unitCost} tanggal {date}? Stok dan jurnal lama dibalik lalu dibuat ulang.

**Prasyarat**

- Pergerakan belum dibatalkan.
- Bukan berasal dari STT/GoodsReceipt atau ProductionRun.
- Tahun fiskal tanggal baru terbuka.

**Error umum**

- 400: gerakan sudah dibatalkan
- 400: gerakan dari STT/produksi tidak dapat diedit per baris
- 400: pembalikan stok lama membuat stok negatif

**Tool terkait:** [`inv_mov_get`](#inv_mov_get), [`inv_mov_cancel`](#inv_mov_cancel)

### opn_cancel

**Ringkasan:** Membatalkan Stok Opname yang sudah final: penyesuaian stok dibalik (pergerakan penyesuaian dibatalkan), jurnal JV-<nomor opname> dibatalkan dan saldo akun dihitung ulang. Opname Draft atau yang sudah batal tidak dapat dibatalkan.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `stock_opname` / `edit`, capability `doc.cancel`)
- **Handler:** `PUT /api/stock-opname/:id/cancel` (src/routes/stockOpname.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID stok opname. |

**Contoh pemanggilan**

```json
{
  "tool": "opn_cancel",
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
  "confirm": "Batalkan stok opname <id>? Penyesuaian stok dan jurnal selisih akan dibalik."
}
```

**Isi hasil:** Pesan sukses pembatalan.

**Efek pembukuan/stok:** Stok dibalik sebesar -selisih; pergerakan penyesuaian isCancelled; jurnal selisih persediaan Cancelled + saldo akun dihitung ulang. Revaluasi nilai satuan (averageCost) tidak otomatis dikembalikan.

**Teks konfirmasi:** Batalkan stok opname {id}? Penyesuaian stok dan jurnal selisih akan dibalik.

**Prasyarat**

- User memiliki capability doc.cancel.
- Stok item saat ini cukup untuk membalik surplus.

**Error umum**

- 400: stok opname sudah dibatalkan
- 400: stok item tidak mencukupi untuk pembalikan
- 403: tanpa capability doc.cancel

**Tool terkait:** [`opn_get`](#opn_get)

### opn_create

**Ringkasan:** Membuat dan langsung memfinalkan Stok Opname dalam satu langkah (tidak ada tahap draft di API): selisih stok aktual vs sistem langsung menjadi pergerakan penyesuaian stok + jurnal selisih persediaan. Bila unitCost manual diisi dan berbeda dari WAC, nilai persediaan direvaluasi.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `stock_opname` / `edit`)
- **Handler:** `POST /api/stock-opname` (src/routes/stockOpname.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal opname (YYYY-MM-DD), harus di tahun fiskal aktif. |
| `warehouseId` | body | `uuid` | tidak | UUID gudang yang dihitung; bila diisi, stok sistem dibandingkan dengan saldo gudang itu saja. |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `items` | body | `array<object>` | ya | Baris hitung: [{itemId, actualStock, unitCost?, notes?}]. actualStock negatif ditolak bila berbeda dari stok sistem. unitCost opsional = revaluasi nilai satuan. |
| `items[].itemId` | body | `uuid` | ya |  |
| `items[].actualStock` | body | `number` | ya | sistem saat ini (artinya user aktif mengetik angka negatif). |
| `items[].unitCost` | body | `number` | tidak | ke nilai ini dan selisih nilainya dijurnal ke akun Selisih Persediaan. |
| `items[].notes` | body | `string` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "opn_create",
  "args": {
    "date": "2026-01-31",
    "items": [
      {
        "itemId": "00000000-0000-0000-0000-000000000000",
        "actualStock": 1
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
  "confirm": "Finalkan stok opname tanggal 2026-01-31 gudang {warehouseId}? Stok dan jurnal selisih akan langsung diposting."
}
```

**Isi hasil:** 201 objek opname (status Submitted) dengan nomor SO-... dan baris item.

**Efek pembukuan/stok:** Stok gudang & total disesuaikan sebesar selisih (SM AdjustmentIn/Out per item berselisih). GL: surplus = DR Persediaan (akun item atau 1.4.0) / CR Selisih Persediaan (INVENTORY_VARIANCE, default 6.38); defisit = DR Selisih Persediaan / CR Persediaan. Revaluasi unitCost: averageCost item diganti dan selisih nilai dijurnal ke akun yang sama.

**Teks konfirmasi:** Finalkan stok opname tanggal {date} gudang {warehouseId}? Stok dan jurnal selisih akan langsung diposting.

**Prasyarat**

- Tahun fiskal aktif untuk tanggal opname.
- Tidak ada sesi opname berstatus Draft lain.

**Error umum**

- 400: tidak ada tahun fiskal aktif
- 400: masih ada stok opname Draft
- 400: stok aktual tidak boleh negatif
- 400: item tidak ditemukan

**Tool terkait:** [`opn_get`](#opn_get), [`opn_cancel`](#opn_cancel), [`inv_items_list`](#inv_items_list)

### opn_get

**Ringkasan:** Detail satu Stok Opname: item, stok sistem vs stok aktual, selisih, nilai, serta pergerakan stok yang dihasilkan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `stock_opname` / `view`)
- **Handler:** `GET /api/stock-opname/:id` (src/routes/stockOpname.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID stok opname. |

**Contoh pemanggilan**

```json
{
  "tool": "opn_get",
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
  "data": "<Objek opname dengan baris item (systemStock, actualStock, difference, unitCost, totalValue>"
}
```

**Isi hasil:** Objek opname dengan baris item (systemStock, actualStock, difference, unitCost, totalValue, movementId).

**Error umum**

- 404: stok opname tidak ditemukan

**Tool terkait:** [`opn_list`](#opn_list), [`opn_cancel`](#opn_cancel)

### opn_list

**Ringkasan:** Daftar sesi Stok Opname dengan total selisih dan jumlah item berselisih per sesi. Filter status, gudang, rentang tanggal, pencarian (nomor/catatan/pembuat).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant (modul `stock_opname` / `view`)
- **Handler:** `GET /api/stock-opname` (src/routes/stockOpname.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled` | tidak | Status opname (Draft, Submitted, Cancelled). |
| `warehouseId` | query | `uuid` | tidak | UUID gudang yang dihitung. |
| `startDate` | query | `date` | tidak | Awal rentang (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Akhir rentang (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor opname, catatan, atau pembuat. |
| `sort` | query | `string` | tidak | date\|opnameNumber; awali '-' untuk menurun. |
| `page` | query | `number` | tidak | Halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (default 20, maks 100). |

**Contoh pemanggilan**

```json
{
  "tool": "opn_list",
  "args": {
    "status": "Draft",
    "warehouseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data:[opname + totalVariance + itemsWithDiff], total, page, limit}.>"
}
```

**Isi hasil:** {data:[opname + totalVariance + itemsWithDiff], total, page, limit}.

**Tool terkait:** [`opn_get`](#opn_get), [`opn_create`](#opn_create)

### stf_cancel

**Ringkasan:** Membatalkan Transfer Stok: stok dikembalikan ke gudang asal dan dikurangi dari gudang tujuan, pergerakan terkait ditandai batal, status menjadi Cancelled. Catatan: tidak ada pengecekan stok tujuan cukup, sehingga bisa membuat saldo gudang tujuan negatif.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `edit`)
- **Catatan akses:** Tidak butuh capability doc.cancel - cukup izin edit modul stock_transfer.
- **Handler:** `PATCH /api/stock-transfers/:id/cancel` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID transfer. |

**Contoh pemanggilan**

```json
{
  "tool": "stf_cancel",
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
  "confirm": "Batalkan transfer stok <id>? Stok akan dikembalikan ke gudang asal."
}
```

**Isi hasil:** Transfer dengan status Cancelled.

**Efek pembukuan/stok:** Stok: +qty gudang asal, -qty gudang tujuan; SM transfer isCancelled. Tidak ada jurnal GL.

**Teks konfirmasi:** Batalkan transfer stok {id}? Stok akan dikembalikan ke gudang asal.

**Error umum**

- 400: transfer sudah dibatalkan
- 404: transfer tidak ditemukan

**Tool terkait:** [`stf_get`](#stf_get)

### stf_create

**Ringkasan:** Membuat dan langsung memposting Transfer Stok antar gudang (tidak ada tahap draft): stok gudang asal berkurang, gudang tujuan bertambah, dua pergerakan TransferOut/TransferIn tercatat. Stok total item tidak berubah dan tidak ada jurnal.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `edit`)
- **Handler:** `POST /api/stock-transfers` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | body | `date` | ya | Tanggal transfer (YYYY-MM-DD). |
| `fromWarehouseId` | body | `uuid` | ya | UUID gudang asal (aktif). |
| `toWarehouseId` | body | `uuid` | ya | UUID gudang tujuan (aktif, harus beda dari asal). |
| `notes` | body | `string` | tidak | Catatan bebas. |
| `nomorMobil` | body | `string` | tidak | Plat kendaraan (untuk cetak SJG). |
| `driverName` | body | `string` | tidak | Nama supir. |
| `recipientName` | body | `string` | tidak | Nama penerima. |
| `items` | body | `array<object>` | ya | Baris: [{itemId, quantity, description?, sourceMovementId?(batch)}]. |
| `items[].itemId` | body | `uuid` | ya |  |
| `items[].quantity` | body | `number` | ya |  |
| `items[].description` | body | `string` | tidak |  |
| `items[].sourceMovementId` | body | `uuid` | tidak | Phase 5: optional batch picker — lock unitCost to a specific inbound batch |

**Contoh pemanggilan**

```json
{
  "tool": "stf_create",
  "args": {
    "date": "2026-01-31",
    "fromWarehouseId": "00000000-0000-0000-0000-000000000000",
    "toWarehouseId": "00000000-0000-0000-0000-000000000000",
    "items": [
      {
        "itemId": "00000000-0000-0000-0000-000000000000",
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
  "confirm": "Transfer stok dari gudang 00000000-0000-0000-0000-000000000000 ke 00000000-0000-0000-0000-000000000000 tanggal 2026-01-31? Stok akan langsung berpindah."
}
```

**Isi hasil:** 201 transfer (status Submitted) dengan nomor transfer dan item.

**Efek pembukuan/stok:** Stok: -qty di gudang asal, +qty di gudang tujuan (SM TransferOut/TransferIn berpasangan, biaya satuan = WAC item atau biaya batch terpilih). Tidak ada jurnal GL (akun persediaan sama, net nol); WAC tidak berubah.

**Teks konfirmasi:** Transfer stok dari gudang {fromWarehouseId} ke {toWarehouseId} tanggal {date}? Stok akan langsung berpindah.

**Prasyarat**

- Stok di gudang asal cukup untuk setiap item.
- Tahun fiskal aktif untuk tanggal transfer.

**Error umum**

- 400: gudang asal dan tujuan tidak boleh sama
- 400: stok item di gudang asal tidak cukup
- 400: gudang tidak aktif

**Tool terkait:** [`stf_get`](#stf_get), [`stf_cancel`](#stf_cancel), [`wh_stock_snapshot`](#wh_stock_snapshot)

### stf_get

**Ringkasan:** Detail satu Transfer Stok: gudang asal/tujuan, item beserta kuantitas dan biaya, data pengiriman (nomor mobil, supir, penerima), status, waktu cetak.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `view`)
- **Handler:** `GET /api/stock-transfers/:id` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID transfer stok. |

**Contoh pemanggilan**

```json
{
  "tool": "stf_get",
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
  "data": "<Objek transfer lengkap.>"
}
```

**Isi hasil:** Objek transfer lengkap.

**Error umum**

- 404: transfer tidak ditemukan

**Tool terkait:** [`stf_list`](#stf_list), [`stf_cancel`](#stf_cancel)

### stf_list

**Ringkasan:** Daftar Transfer Stok antar gudang (Surat Jalan Antar Gudang) dengan gudang asal/tujuan, item, dan pembuat. Filter status, gudang (asal atau tujuan), rentang tanggal, pencarian (nomor, catatan, kendaraan, supir, penerima, nama gudang).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `view`)
- **Handler:** `GET /api/stock-transfers` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `status` | query | enum: `Draft`, `Submitted`, `Cancelled` | tidak | Status transfer: Draft, Submitted, atau Cancelled (transfer yang dibuat via API langsung Submitted). |
| `warehouseId` | query | `uuid` | tidak | UUID gudang (asal ATAU tujuan). |
| `startDate` | query | `date` | tidak | Awal rentang (YYYY-MM-DD). |
| `endDate` | query | `date` | tidak | Akhir rentang (YYYY-MM-DD). |
| `search` | query | `string` | tidak | Cari nomor/catatan/kendaraan/supir/penerima/gudang. |
| `sort` | query | `string` | tidak | date\|transferNumber; awali '-' untuk menurun. |
| `page` | query | `number` | tidak | Halaman. |
| `limit` | query | `number` | tidak | Baris per halaman (default 50, maks 200). |

**Contoh pemanggilan**

```json
{
  "tool": "stf_list",
  "args": {
    "status": "Draft",
    "warehouseId": "00000000-0000-0000-0000-000000000000"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data:[transfer + gudang + items + user], total, page, limit}.>"
}
```

**Isi hasil:** {data:[transfer + gudang + items + user], total, page, limit}.

**Tool terkait:** [`stf_get`](#stf_get), [`stf_create`](#stf_create)

### stf_mark_printed

**Ringkasan:** Menandai SJG (Surat Jalan Antar Gudang) sudah dicetak dengan mengisi printedAt = sekarang. Hanya penanda, tidak berefek ke stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `edit`)
- **Handler:** `POST /api/stock-transfers/:id/mark-printed` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID transfer. |

**Contoh pemanggilan**

```json
{
  "tool": "stf_mark_printed",
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
  "confirm": "Tandai transfer <id> sudah dicetak?"
}
```

**Isi hasil:** Transfer dengan printedAt terisi.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Tandai transfer {id} sudah dicetak?

### stf_update

**Ringkasan:** Mengubah data header pengiriman transfer (catatan, nomor mobil, supir, penerima) pada transfer berstatus Submitted. Tidak mengubah item/kuantitas dan tidak berefek ke stok.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `stock_transfer` / `edit`)
- **Handler:** `PATCH /api/stock-transfers/:id` (src/routes/stockTransfers.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID transfer. |
| `notes` | body | `string` | tidak | Catatan. |
| `nomorMobil` | body | `string` | tidak | Plat kendaraan. |
| `driverName` | body | `string` | tidak | Nama supir. |
| `recipientName` | body | `string` | tidak | Nama penerima. |

**Contoh pemanggilan**

```json
{
  "tool": "stf_update",
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
  "confirm": "Ubah data pengiriman transfer <id>?"
}
```

**Isi hasil:** Transfer setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya metadata cetak).

**Teks konfirmasi:** Ubah data pengiriman transfer {id}?

**Prasyarat**

- Transfer berstatus Submitted.

**Error umum**

- 400: hanya transfer Submitted yang bisa diedit
- 404: transfer tidak ditemukan

### wh_create

**Ringkasan:** Membuat gudang baru (kode otomatis huruf besar, nama, lokasi). Bila isDefault=true, gudang default lama dilepas.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `warehouse` / `edit`)
- **Handler:** `POST /api/warehouses` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `location` | body | `string` | tidak |  |
| `description` | body | `string` | tidak | Keterangan. |
| `isActive` | body | `boolean` | tidak | Status aktif. |
| `isDefault` | body | `boolean` | tidak | true = jadikan gudang default (menggantikan default lama). |
| `sortOrder` | body | `number` | tidak | Urutan tampil. |

**Contoh pemanggilan**

```json
{
  "tool": "wh_create",
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
  "confirm": "Buat gudang <code> - <name>?"
}
```

**Isi hasil:** Gudang yang dibuat (201).

**Efek pembukuan/stok:** Tidak ada efek GL/stok (hanya master).

**Teks konfirmasi:** Buat gudang {code} - {name}?

**Error umum**

- 409/400: kode gudang sudah ada

**Tool terkait:** [`wh_update`](#wh_update)

### wh_delete

**Ringkasan:** Menghapus permanen gudang. Ditolak bila gudang default, masih punya saldo stok, atau punya riwayat pergerakan/transfer (nonaktifkan saja). Butuh capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `warehouse` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/warehouses/:id` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID gudang. |

**Contoh pemanggilan**

```json
{
  "tool": "wh_delete",
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
  "confirm": "HAPUS permanen gudang <id>?"
}
```

**Isi hasil:** {success:true}.

**Efek pembukuan/stok:** Tidak ada jurnal; hard delete gudang + baris saldo stok nol.

**Teks konfirmasi:** HAPUS permanen gudang {id}?

**Prasyarat**

- User memiliki capability doc.cancel.
- Gudang bukan default, tanpa saldo, tanpa riwayat.

**Error umum**

- 400: gudang default tidak bisa dihapus
- 400: masih punya saldo / riwayat transaksi
- 404: gudang tidak ditemukan
- 403: tanpa capability doc.cancel

### wh_get

**Ringkasan:** Detail satu gudang beserta rincian stok per item yang saldonya tidak nol (kode, nama, satuan, biaya rata-rata, kategori), urut dari stok terbesar.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `warehouse` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/warehouses/:id` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID gudang. |

**Contoh pemanggilan**

```json
{
  "tool": "wh_get",
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
  "data": "<Objek gudang + stocks:[{item, currentStock}].>"
}
```

**Isi hasil:** Objek gudang + stocks:[{item, currentStock}].

**Error umum**

- 404: gudang tidak ditemukan

### wh_list

**Ringkasan:** Daftar gudang (kode, nama, lokasi, default, aktif, urutan) dengan jumlah item bersaldo dan total kuantitas stok per gudang.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `warehouse` / `view`)
- **Catatan akses:** GET data referensi terbuka untuk semua user login.
- **Handler:** `GET /api/warehouses` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `active` | query | `string` | tidak | 'true' = hanya aktif, 'false' = hanya nonaktif, kosong = semua. |

**Contoh pemanggilan**

```json
{
  "tool": "wh_list",
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
  "data": "<{data:[gudang + itemCount + totalStock]}.>"
}
```

**Isi hasil:** {data:[gudang + itemCount + totalStock]}.

**Tool terkait:** [`wh_get`](#wh_get), [`wh_stock_snapshot`](#wh_stock_snapshot)

### wh_stock_snapshot

**Ringkasan:** Snapshot stok per gudang 'as of' akhir tanggal tertentu, direkonstruksi dari riwayat pergerakan stok. Berguna untuk stok historis atau unduh stok akhir periode.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `warehouse` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/warehouses/stock-snapshot` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | query | `date` | tidak | Tanggal snapshot (YYYY-MM-DD). Default hari ini. |
| `warehouseIds` | query | `string` | tidak | Opsional: daftar UUID gudang dipisah koma. |

**Contoh pemanggilan**

```json
{
  "tool": "wh_stock_snapshot",
  "args": {
    "date": "2026-01-31",
    "warehouseIds": "<warehouseIds>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Snapshot stok per gudang per item pada tanggal tersebut.>"
}
```

**Isi hasil:** Snapshot stok per gudang per item pada tanggal tersebut.

**Error umum**

- 400: parameter date tidak valid

**Tool terkait:** [`wh_list`](#wh_list), [`inv_items_list`](#inv_items_list)

### wh_update

**Ringkasan:** Mengubah data gudang (kode, nama, lokasi, deskripsi, aktif, default, urutan). Menjadikan default akan melepas default lama.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `warehouse` / `edit`)
- **Handler:** `PUT /api/warehouses/:id` (src/routes/warehouses.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | UUID gudang. |
| `code` | body | `string` | tidak | Kode. |
| `name` | body | `string` | tidak | Nama. |
| `location` | body | `string` | tidak |  |
| `description` | body | `string` | tidak | Keterangan. |
| `isActive` | body | `boolean` | tidak | false = nonaktifkan (disarankan ketimbang menghapus gudang berriwayat). |
| `isDefault` | body | `boolean` | tidak |  |
| `sortOrder` | body | `number` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "wh_update",
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
  "confirm": "Ubah gudang <id>?"
}
```

**Isi hasil:** Gudang setelah diperbarui.

**Efek pembukuan/stok:** Tidak ada efek GL/stok.

**Teks konfirmasi:** Ubah gudang {id}?

**Error umum**

- 400: gudang tidak ditemukan


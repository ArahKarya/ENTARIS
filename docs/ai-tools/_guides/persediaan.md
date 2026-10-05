Toolset **persediaan** memberi AIRA kemampuan membaca dan (dengan persetujuan) mengubah data stok: master item, gudang, kartu stok (pergerakan stok), transfer antar gudang, stok opname, serta dashboard persediaan. Semua pembacaan aman dipanggil otomatis; setiap tool yang mengubah stok atau jurnal diklasifikasikan `critical` karena efeknya langsung (tidak ada tahap draft pada pergerakan stok, transfer, maupun opname).

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

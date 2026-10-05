Toolset **pembelian** memungkinkan AIRA melihat dan menjalankan rantai pengadaan Entaris: Purchase Order (PO), Penerimaan Barang (STT/BPB), Invoice Pembelian (PI), dan Uang Muka Vendor. Tool baca (daftar, detail, ringkasan, pratinjau three-way match) aman dipanggil otomatis. Tool tulis membuat dokumen perencanaan atau posting ke stok dan buku besar, sehingga setiap penulisan melewati konfirmasi/persetujuan; pembatalan dan pembayaran selalu bertingkat kritis.

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

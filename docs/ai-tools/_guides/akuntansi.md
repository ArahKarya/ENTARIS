Toolset Akuntansi memungkinkan AIRA membaca dan (dengan persetujuan) memelihara inti pembukuan Entaris: bagan akun (COA), jurnal umum/buku besar, tahun buku (periode dan tutup buku), pemetaan akun sistem untuk auto-posting, konfigurasi dan laporan pajak, aset tetap beserta penyusutannya, dan antrian backfill HPP. Hampir semua tool tulis di sini bersifat critical karena langsung memengaruhi saldo buku besar; tool baca aman dipanggil otomatis. Pengajuan pembayaran dan persetujuan dokumen punya toolset sendiri (lihat Pengajuan Pembayaran dan Persetujuan).

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
Pada AIRA, semua tool tulis di toolset ini tier critical: wajib persetujuan manusia dan nonaktif secara default.

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

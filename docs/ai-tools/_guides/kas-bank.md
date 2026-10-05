Toolset **kas-bank** memungkinkan AIRA membaca dan mengoperasikan arus kas Entaris: transaksi pembayaran (terima/bayar/uang muka/refund), buku Transaksi Kas & Bank, uang jaminan proyek, rekonsiliasi bank, dan template transaksi berulang. Tool baca aman otomatis; tool yang memposting jurnal (`pay_record`, `pg_create`, `pg_settle`, `rec_execute`) dan semua pembatalan bertingkat kritis, sehingga membutuhkan persetujuan eksplisit.

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

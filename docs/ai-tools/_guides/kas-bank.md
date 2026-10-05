Toolset **kas-bank** memungkinkan AIRA membaca dan mengoperasikan arus kas Entaris: transaksi pembayaran (terima/bayar/uang muka/refund), buku Transaksi Kas & Bank, uang jaminan proyek, rekonsiliasi bank, dan template transaksi berulang. Buku kas dari foto/nota ditangani lewat **Draft Buku Kas** (`kas_*`): engine mengusulkan baris, manusia meninjau dan memposting. Tool baca aman otomatis; tool yang memposting jurnal (`pay_record`, `pg_create`, `pg_settle`, `rec_execute`) dan semua pembatalan bertingkat kritis, sehingga membutuhkan persetujuan eksplisit.

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

### Buku kas dari nota (Draft Buku Kas)

Alur untuk engine AIRA bila pengguna mengirim **foto/scan nota atau halaman buku kas** dan meminta pencatatan. Engine hanya *mengusulkan*; Entaris menyimpan draft, memvalidasi, menentukan arah DR/CR, meminta tinjauan manusia, lalu memposting. **Engine tidak pernah memposting sendiri** (`kas_draft_posting` selalu masuk antrian persetujuan untuk aktor level Standar).

1. **`kas_daftar_akun`** - panggil dulu. Hasilnya: katalog akun lawan (`id`, `code`, `name`, `type`, `isCash`, `role`), akun kas/bank untuk dipilih (`cashAccounts`), tabel aturan jenis transaksi, batas baris dan **pola terpelajari** (keterangan -> akun hasil koreksi manusia sebelumnya; pakai sebagai petunjuk).
2. **Baca foto, ekstrak baris, klasifikasikan.** Satu baris = `{date?, description, masuk | keluar}` (atau `amount` + `direction`). `masuk` = kas masuk (kolom debit buku kas), `keluar` = kas keluar (kolom kredit). Salin keterangan apa adanya, jangan merangkum. Untuk tiap baris usulkan `txnType` (`pengeluaran`, `pemasukan`, `uang_muka`, `terima_kasbon`, `lainnya`), `accountCode` **hanya dari daftar `kas_daftar_akun`**, `confidence` 0..1 yang **jujur** (di bawah 0,7 baris otomatis ditandai "perlu ditinjau") dan `reason` singkat. Bila ragu pakai `lainnya` atau kosongkan `accountCode`; jangan mengarang kode akun. Catat juga saldo awal/akhir di halaman bila tertulis (`openingBalance`, `closingBalance`) agar server dapat memeriksa selisihnya.
3. **`kas_buat_draft_dari_baris`** - satu panggilan untuk seluruh halaman (maksimal **300 baris**; pecah bila lebih). Tanggal halaman `entryDate` dipakai bila baris tak bertanggal. `cashAccountId` = salah satu `cashAccounts`. Sertakan `sourceNote` (mis. "halaman 3, tulisan tangan"). Server mencatat `createdVia=mcp`, aktor, dan `sourceRef` (diambil dari `ref` pada actor assertion bila tidak diisi). Hasil: nomor `DKB-YYYYMM-NNNN`, total masuk/keluar, jumlah baris perlu ditinjau, cek saldo, dan `reviewPath`. **Belum ada jurnal.**
4. **Beritahu pengguna** untuk meninjau dan memposting di Entaris: **Kas & Bank -> Draft Buku Kas** (`/cash-book-drafts/<id>`). Sebutkan nomor draft, jumlah baris yang ragu, serta peringatan saldo/duplikat bila ada. Koreksi lewat chat boleh dengan `kas_draft_ubah_baris` / `kas_draft_tambah_baris` / `kas_draft_buang`; posting oleh pengguna di layar peninjauan, atau lewat `kas_draft_posting` (menunggu persetujuan manusia di Persetujuan).

Yang dilakukan server (deterministik, bukan LLM):

- **Arah ditentukan kolom masuk/keluar**, bukan `txnType`. Jenis yang bertentangan (mis. `pemasukan` pada kas keluar) dikoreksi ke jenis polos arah itu, keyakinan dibatasi 0,5, akun usulan engine dibuang (diganti pola terpelajari atau akun default) dan baris ditandai perlu ditinjau dengan alasannya.
- `uang_muka` / `terima_kasbon` selalu memakai akun sistem Uang Muka Karyawan (role `EMPLOYEE_ADVANCE`); `accountCode` dari engine diabaikan.
- Baris tanpa akun / akun tak dikenal / akun grup / nonaktif / sama dengan akun kas: **tidak membatalkan draft**; baris ditandai, akunnya dikosongkan atau diganti usulan default (Beban Diluar Usaha Lainnya `OTHER_EXPENSE` untuk kas keluar, Pendapatan Diluar Usaha Lainnya `OTHER_INCOME` untuk kas masuk).
- **Pola terpelajari** dipakai bila engine tak memberi akun atau keyakinannya rendah; akun berkeyakinan tinggi dari engine tidak pernah ditimpa diam-diam (hanya dicatat di `reason`). Satu koreksi manusia = keyakinan 0,65 (tetap perlu ditinjau); dua kali 0,75; tiga kali atau lebih 0,85.
- **Duplikat**: tanggal + nominal + arah + keterangan sama dengan baris di draft/posting lain pada akun kas yang sama (atau baris sebelumnya di draft yang sama) -> `kemungkinan duplikat` + perlu ditinjau.
- Baris tak valid (nominal <= 0, masuk dan keluar sekaligus, tanggal salah, keterangan kosong, lebih dari 300 baris) membuat **seluruh panggilan ditolak** dengan `rowErrors` berindeks baris; perbaiki dan kirim ulang.

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
| Draft Buku Kas diposting (`kas_draft_posting`) | **Satu jurnal seimbang per baris** pada tanggal baris, atas nama pemosting. `pengeluaran` / `lainnya` keluar = DR akun lawan / CR kas; `pemasukan` / `lainnya` masuk = DR kas / CR akun lawan; `uang_muka` = DR Uang Muka Karyawan (1.5.6) / CR kas; `terima_kasbon` = DR kas / CR Uang Muka Karyawan. Semua baris dalam satu transaksi (atau `partial=true`: baris valid saja, sisanya `PartiallyPosted` dengan error per baris) |

Pembatalan memakai pola **soft-cancel**: jurnal berstatus `Cancelled`, ledger `isCancelled`, saldo akun dibalik (tidak membuat jurnal balikan `[BATAL]` baru, agar sinkronisasi ledger-vs-jurnal tetap sehat). Total debit selalu sama dengan total kredit.

Akun kas/bank yang valid = akun detail (non-grup) bernomor 1.1.x (Kas Kecil, BRI, Mandiri, BCA, ...). Tool menolak akun lain dengan "Akun yang dipilih bukan akun kas/bank".

### Persetujuan

- Modul kas-bank **tidak** melewati antrian `needsApproval`: `pay_record`, `pg_create`, `pg_settle`, dan `rec_execute` langsung memposting bagi pemanggil yang punya izin edit modulnya. Kontrol keamanannya berada di tier AIRA (kritis = wajib persetujuan) dan RBAC.
- Draft Buku Kas memakai izin modul `journal` (lihat = view, ubah/posting = edit, sama dengan jurnal manual); posting tidak lewat `needsApproval` tetapi aktor AIRA level Standar selalu lewat antrian persetujuan.
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
- **Draft Buku Kas**: jangan menebak kode akun, jangan mengisi `masuk` dan `keluar` sekaligus, jangan menganggap draft = sudah tercatat (belum ada jurnal sampai diposting), dan jangan menunggu `kas_draft_posting` langsung jalan (menunggu persetujuan). Jurnal dari draft yang salah dibatalkan lewat `je_cancel` (toolset akuntansi) pada nomor jurnal baris terkait.
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
| Buku Kas / Kas Harian / Petty Cash dari nota | `CashBookDraft` (`DKB-YYYYMM-NNNN`), baris `CashBookDraftRow`, pola `CashBookLearnedMap` |
| Kasbon / Uang Muka Karyawan | `txnType` `uang_muka` / `terima_kasbon`, akun 1.5.6 (role `EMPLOYEE_ADVANCE`) |
| Rekonsiliasi Bank | `BankReconciliation`, status `Draft/Completed` |
| Rekening Koran / Statement | item statement (`statementAmount`) |
| Transaksi Berulang | `RecurringTemplate` (hanya `journal` yang dieksekusi) |
| Batal (cancel) | soft-cancel: jurnal `Cancelled`, saldo dibalik |

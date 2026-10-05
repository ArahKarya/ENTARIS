Toolset **dashboard** adalah ringkasan angka cepat yang sama dengan kartu dan grafik di halaman Dashboard Entaris: posisi kas, piutang/hutang, tren laba, faktur jatuh tempo, peringatan stok, dan pemeliharaan. Semua tool read-only dan murah dijalankan (tanpa parameter atau dengan `startDate`/`endDate`). Gunakan untuk "gambaran singkat sekarang"; untuk angka resmi per periode gunakan toolset **laporan**.

### Peta tool

| Kebutuhan | Tool | Catatan |
|---|---|---|
| Kas, piutang, hutang, persediaan, laba periode | `rpt_dashboard` | periode default bulan berjalan |
| Pendapatan vs beban per bulan | `rpt_dash_charts` | default 6 bulan terakhir |
| Laba per bulan | `rpt_dash_monthly_profit` | default 12 bulan terakhir |
| Rincian beban per akun | `rpt_dash_expense_breakdown` | default bulan berjalan |
| Kas masuk/keluar harian | `rpt_dash_cash_flow` | dari tabel Pembayaran |
| Saldo tiap akun kas/bank | `get_cash_position` | saldo saat ini |
| Umur piutang & hutang (5 bucket) | `rpt_dash_aging_summary` | per hari ini |
| Faktur lewat jatuh tempo | `rpt_dash_overdue` | gabungan jual+beli, 10 teratas |
| Faktur akan jatuh tempo 14 hari | `rpt_dash_upcoming_due` | gabungan, 8 teratas |
| Pelanggan/pemasok teratas | `rpt_dash_top_customers`, `rpt_dash_top_vendors` | 5 teratas by grandTotal |
| Rasio keuangan | `rpt_dash_financial_ratios` | current ratio, DER, DAR |
| Surat Jalan belum di-invoice | `rpt_dash_pending_do` | status Submitted, invoiceId kosong |
| Item stok di bawah minimum | `rpt_dash_stock_alerts` | maks. 20 |
| Item stok minus | `rpt_dash_negative_stock` | maks. 50, + gerak terakhir |
| Aset tetap (KPI, kategori, penyusutan jatuh tempo) | `rpt_fa_dashboard` | - |
| Pemeliharaan (PM, work order, pajak/asuransi kendaraan, dokumen) | `rpt_dash_maintenance` | izin per sumber GA |

### Aturan data

- **Parameter periode**: hanya `rpt_dashboard`, `rpt_dash_charts`, `rpt_dash_expense_breakdown`, `rpt_dash_cash_flow`, `rpt_dash_monthly_profit` menerima `startDate`/`endDate` (`YYYY-MM-DD`; `endDate` sampai 23:59:59). Nilai tidak valid diam-diam diganti default (tidak error, berbeda dari toolset laporan).
- **Saldo** (`rpt_dashboard`, `get_cash_position`, `rpt_dash_financial_ratios`) diambil dari kolom `balance` akun saat ini (saldo tersimpan), bukan dihitung ulang dari jurnal per tanggal. Karena itu tidak bisa dipakai untuk posisi historis.
- `rpt_dashboard`: kas = jumlah saldo akun kas/bank sistem; piutang = saldo akun Piutang Usaha (1.2.1) dengan batas bawah 0; hutang = jumlah saldo seluruh akun LIABILITY non-grup (bukan hanya Hutang Usaha), batas bawah 0; uang muka vendor dari jumlah `depositBalance` per mitra; nilai persediaan = jumlah akun 1.4.* (boleh negatif; negatif = anomali stok). Laba = pendapatan (kredit-debit) dikurangi beban (debit-kredit) pada periode.
- `rpt_dash_cash_flow` hanya menghitung Pembayaran berstatus Submitted: Receive = masuk, Pay = keluar. Tidak termasuk jurnal manual atau pengajuan pembayaran yang tidak lewat modul Pembayaran.
- `rpt_dash_aging_summary` memakai faktur `outstanding > 0` selain Draft/Cancelled; tanpa jatuh tempo atau belum jatuh tempo = bucket "Belum JT". Bucket: 1-30, 31-60, 61-90, >90 hari lewat jatuh tempo. Sedikit berbeda dari `rpt_aging` (laporan) yang hanya mengambil status Submitted/PartiallyPaid/Overdue.
- `rpt_dash_overdue` dan `rpt_dash_upcoming_due` mengecualikan Draft, Cancelled, Paid. Pemisahan: lewat jatuh tempo vs jatuh tempo dalam 14 hari ke depan.
- `rpt_dash_stock_alerts`: item aktif dengan `minimumStock > 0` dan stok <= minimum. `rpt_dash_negative_stock`: stok item atau stok gudang < 0 (hasil bypass stok negatif oleh admin; lihat capability `inventory.negative_stock`).
- `rpt_dash_pending_do`: DO Submitted tanpa invoice; `ageDays` = umur sejak tanggal DO. DO lama yang belum ditagih berarti pendapatan belum tercatat.
- `rpt_fa_dashboard`: hanya aset berstatus Active; penyusutan bulan ini/YTD dari `DepreciationEntry`.
- `rpt_dash_maintenance`: tidak dipasang di belakang izin `reports`. Handler mengecek tiga izin view: `ga_maintenance` (jadwal PM & work order), `ga_vehicle` (pajak & asuransi kendaraan), `ga_documents` (dokumen legal). Hanya sumber yang diizinkan yang dimuat; ketiganya ditolak = HTTP 403. State jatuh tempo: `overdue`, `today`, `soon` (<= 7 hari), `scheduled`; daftar akan datang dipotong 8 baris.

### Hak akses

- Default: modul `reports` view (Admin, Accountant, Viewer). `rpt_dash_stock_alerts` dan `rpt_dash_negative_stock` cukup izin `reports` ATAU `inventory` (view), jadi StaffProduksi juga bisa.
- `rpt_dash_maintenance`: lihat di atas (izin GA per sumber; default hanya Admin karena modul `ga_*` tidak ada di matriks bawaan role lain).

### Jebakan umum

- Dashboard bukan laporan resmi: tidak ada filter perusahaan/gudang, dan beberapa metrik memotong angka negatif menjadi 0 (piutang/hutang) sehingga kelebihan bayar tidak terlihat.
- `rpt_dash_financial_ratios` memakai saldo saat ini; "current" = akun aset 1.* dan kewajiban 2.* non-grup (aproksimasi, bukan klasifikasi lancar resmi). Rasio dikembalikan 0 bila penyebut 0.
- `rpt_dash_top_*` tidak menerima periode: berdasarkan seluruh faktur (selain Draft/Cancelled).
- `rpt_dash_cash_flow` (dashboard) berbeda angka dengan `rpt_cash_flow` (laporan, dari jurnal). Jangan dibandingkan langsung.
- Untuk daftar lengkap faktur jatuh tempo (bukan 8-10 teratas) gunakan `get_receivable_schedule`/`get_payable_schedule` di toolset laporan.

### Peta istilah

| Istilah Indonesia | Istilah kode/sistem |
|---|---|
| Belum JT | belum jatuh tempo (`current`) |
| Surat Jalan / DO | Delivery Order (`pending-do`) |
| Stok minimum | `minimumStock` |
| Stok minus | `current_stock < 0` |
| PM | Preventive Maintenance (jadwal pemeliharaan) |
| Nilai buku | `bookValue` aset tetap |

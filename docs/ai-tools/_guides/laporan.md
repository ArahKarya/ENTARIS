Toolset **laporan** berisi laporan keuangan dan operasional yang dihitung server dari data yang sudah tercatat (buku besar, faktur, pembelian, produksi). Semuanya read-only: tidak ada jurnal, stok, atau dokumen yang berubah. Gunakan toolset ini untuk menjawab pertanyaan seperti "berapa laba bulan ini?", "siapa yang menunggak?", "PO mana yang belum datang?", atau "berapa modal per kg hasil giling?". Semua tool berada di bawah izin modul `reports` (view): default Admin, Accountant, dan Viewer; StaffProduksi tidak punya akses laporan.

### Peta pertanyaan bisnis ke tool

| Pertanyaan | Tool | Parameter kunci |
|---|---|---|
| Apakah debit = kredit? Saldo tiap akun? | `get_trial_balance` | `startDate`, `endDate` (opsional) |
| Untung/rugi periode ini? | `rpt_profit_loss` | `startDate`, `endDate` |
| Posisi aset/kewajiban/ekuitas pada tanggal X | `rpt_balance_sheet` | `date` |
| Arus kas operasi/investasi/pendanaan | `rpt_cash_flow` | `startDate`, `endDate` |
| Rincian mutasi satu akun | `rpt_ledger_detail` | `accountId` (wajib), tanggal |
| Seluruh buku besar dengan saldo awal | `rpt_ledger_book` | tanggal |
| Umur piutang atau hutang per pihak | `rpt_aging` | `type=Customer` atau `Supplier` |
| Daftar faktur piutang/hutang jatuh tempo | `get_receivable_schedule`, `get_payable_schedule` | - |
| Margin kotor per item/SKU | `rpt_hpp`, `rpt_profitability_sku` | tanggal |
| Modal produksi per kg, yield | `rpt_production_cost_summary` | tanggal, `warehouseId` |
| Aktivitas satu hari (penjualan, pembelian, produksi, kas, stok) | `rpt_daily` | `date` |
| PO yang belum lengkap diterima | `rpt_po_outstanding` | `partyId`, `warehouseId`, `overdue` |
| Kinerja pemasok | `rpt_supplier_performance` | `partyId`, tanggal |

Ringkasan angka cepat (kas, piutang, hutang, rasio) ada di toolset **dashboard**; laporan di sini lebih rinci dan memakai periode eksplisit.

### Aturan periode dan tanggal

- Format tanggal `YYYY-MM-DD`. `endDate` dan `date` dianggap sampai 23:59:59 hari itu (inklusif), `startDate` dari 00:00.
- Tanggal tidak valid menghasilkan HTTP 400 ("Parameter startDate tidak valid").
- Perilaku default berbeda per laporan, jadi sebutkan periode secara eksplisit:
  - `get_trial_balance`, `rpt_profit_loss`, `rpt_ledger_book`: tanpa periode = SEMUA transaksi sejak awal (kumulatif).
  - `rpt_cash_flow`, `rpt_hpp`, `rpt_profitability_sku`: default awal tahun berjalan sampai hari ini.
  - `rpt_production_cost_summary`: default awal bulan berjalan sampai hari ini.
  - `rpt_balance_sheet`: default hari ini.
  - `rpt_aging`, jadwal piutang/hutang: selalu per hari ini (tidak ada parameter tanggal).
- Zona waktu: tanggal diparse oleh server; laporan PO memakai hari bisnis lokal (WIB).

### Aturan data (dari mana angka berasal)

- **Laporan berbasis buku besar** (trial balance, laba rugi, neraca, arus kas, ledger): hanya `AccountingLedgerEntry` dengan `isCancelled = false`. Dokumen yang dibatalkan (void/reverse) tidak ikut. Dokumen berstatus Draft tidak punya entri GL sehingga tidak muncul.
- **Konvensi tanda**: saldo ditampilkan pada sisi normal akun. Aset dan beban = debit dikurangi kredit; kewajiban, ekuitas, dan pendapatan = kredit dikurangi debit. Laba bersih = total pendapatan dikurangi total beban.
- **Laba rugi** hanya memuat akun rootType REVENUE dan EXPENSE, berjenjang (grup + anak); akun saldo nol disembunyikan, grup tetap tampil. Beban pokok penjualan (akun 5) dan Selisih Harga Pembelian (5.11) masuk sebagai beban.
- **Neraca** menambahkan baris sintetis "Laba Tahun Berjalan" (akun 3.4) dari total pendapatan dikurangi beban sampai tanggal posisi, dan membuang akun riil 3.3.1 agar tidak ganda. Jadi total ekuitas sudah termasuk laba berjalan.
- **Arus kas** dibangun dari mutasi akun kas/bank sistem (1.1.x); mutasi dikelompokkan berdasarkan akun lawan: pendapatan/beban/piutang/hutang = operasi, akun 1.6/1.7 = investasi, ekuitas atau 2.3 = pendanaan, sisanya masuk operasi.
- **Aging**: faktur berstatus Submitted/PartiallyPaid/Overdue, jumlah = `outstanding`. Hitung hari = hari ini dikurangi jatuh tempo (jika tanpa jatuh tempo dipakai tanggal faktur). Bucket: `current` (belum jatuh tempo), `1` (1-30), `31` (31-60), `61` (61-90), `91` (>90). Maksimum 10.000 faktur.
- **Jadwal piutang/hutang**: faktur dengan `outstanding > 0` dan status bukan Draft/Cancelled. Status: `overdue` (lewat jatuh tempo), `due_soon` (jatuh tempo <= 7 hari), `on_track`, `no_due_date`.
- **HPP (`rpt_hpp`) dan profitabilitas SKU**: dihitung dari baris faktur penjualan (status bukan Draft/Cancelled) dengan HPP = qty x rata-rata biaya (WAC) item PADA SAAT LAPORAN DIJALANKAN, bukan HPP yang diposting ke GL saat itu. Hasilnya bisa berbeda dari akun 5 di laba rugi. `rpt_profitability_sku` membandingkan dua basis: material (WAC sekarang) dan loaded (biaya batch bila baris faktur memilih batch; `coveragePct` = porsi baris yang punya batch).
- **Modal produksi (`rpt_production_cost_summary`)**: per production run tidak batal; `rawMaterialPerKg` = nilai bahan keluar dibagi kg output utama; `glPerKg` = nilai output utama yang diposting (bahan dikurangi NRV produk samping ditambah biaya konversi) dibagi kg; `yieldPct` = kg output utama / kg bahan. Run tanpa output utama dikeluarkan. Informasi saja.
- **PO outstanding**: PO status Submitted yang belum ditutup; `remaining = ordered - received`, nilai sisa memakai harga estimasi PO setelah diskon. `overdue=1` hanya PO yang melewati tanggal kirim yang diharapkan. Maksimum 2000 PO.
- **Kinerja pemasok**: ketepatan = STT terakhir (atau pertama) pada/sebelum tanggal kirim yang diharapkan; fill rate = jumlah diterima (dibatasi qty pesanan) dibagi jumlah dipesan; selisih harga = nilai faktur pembelian dibanding nilai PO pada qty faktur. Metrik `null` bila tidak ada data untuk dihitung.
- Pembulatan: angka dalam Rupiah dikirim sebagai number (bukan string); persentase dibulatkan 1-2 desimal sesuai laporan.

### Jebakan umum

- `rpt_aging` namanya "receivable" tetapi `type=Supplier` menghasilkan umur HUTANG. Tanpa `type` hasilnya piutang.
- `rpt_ledger_detail` memulai saldo berjalan dari 0 pada baris pertama hasil filter; ia TIDAK memuat saldo awal sebelum `startDate`. Untuk saldo awal gunakan `rpt_ledger_book` (field `openingBalance`).
- `rpt_ledger_book` bisa sangat besar. Persempit periode.
- Laba rugi tanpa periode adalah laba kumulatif sejak awal, bukan tahun berjalan. Tutup buku tahunan memindahkan ke Laba Ditahan (3.2); bandingkan dengan neraca bila perlu.
- Angka `rpt_hpp` bergeser jika WAC item berubah setelah transaksi; jangan dipakai untuk rekonsiliasi dengan akun 5.
- `rpt_dash_*` (toolset dashboard) dan laporan di sini bisa berbeda untuk metrik "sama" (mis. `rpt_dash_cash_flow` dari tabel pembayaran, `rpt_cash_flow` dari jurnal).
- Laporan tidak memfilter per gudang/perusahaan kecuali ada parameter eksplisit (`warehouseId` pada produksi dan PO).
- `POST /api/reports/export` sengaja tidak menjadi tool (menghasilkan berkas .xlsx); gunakan data JSON dari tool laporan.

### Peta istilah

| Istilah Indonesia | Istilah kode/sistem |
|---|---|
| Neraca saldo | trial balance |
| Laba rugi | profit & loss (`profit-loss`) |
| Neraca | balance sheet |
| Arus kas | cash flow |
| Buku besar | ledger (`AccountingLedgerEntry`) |
| Umur piutang/hutang | aging (AR/AP) |
| HPP / Harga Pokok Penjualan | COGS (akun 5), `average_cost` = WAC |
| Yield | `yieldPct` (kg output utama / kg bahan) |
| Modal per kg | `rawMaterialPerKg` / `glPerKg` |
| STT / BPB | Goods Receipt (penerimaan barang) |
| PO outstanding | PO Submitted belum terima penuh |

# Toolset: Laporan (`laporan`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/laporan` · 15 tool (read 15, write 0, critical 0)

## Tujuan

Toolset **laporan** berisi laporan keuangan dan operasional yang dihitung server dari data yang sudah tercatat (buku besar, faktur, pembelian, produksi). Semuanya read-only: tidak ada jurnal, stok, atau dokumen yang berubah. Gunakan toolset ini untuk menjawab pertanyaan seperti "berapa laba bulan ini?", "siapa yang menunggak?", "PO mana yang belum datang?", atau "berapa modal per kg hasil giling?". Semua tool berada di bawah izin modul `reports` (view): default Admin, Accountant, dan Viewer; StaffProduksi tidak punya akses laporan.

## ALUR BISNIS

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

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`get_payable_schedule`](#get_payable_schedule) | read | - | `GET /api/reports/payable-schedule` |
| [`get_receivable_schedule`](#get_receivable_schedule) | read | - | `GET /api/reports/receivable-schedule` |
| [`get_trial_balance`](#get_trial_balance) | read | - | `GET /api/reports/trial-balance` |
| [`rpt_aging`](#rpt_aging) | read | - | `GET /api/reports/aging` |
| [`rpt_balance_sheet`](#rpt_balance_sheet) | read | - | `GET /api/reports/balance-sheet` |
| [`rpt_cash_flow`](#rpt_cash_flow) | read | - | `GET /api/reports/cash-flow` |
| [`rpt_daily`](#rpt_daily) | read | - | `GET /api/reports/daily` |
| [`rpt_hpp`](#rpt_hpp) | read | - | `GET /api/reports/hpp` |
| [`rpt_ledger_book`](#rpt_ledger_book) | read | - | `GET /api/reports/ledger-book` |
| [`rpt_ledger_detail`](#rpt_ledger_detail) | read | - | `GET /api/reports/ledger-detail` |
| [`rpt_po_outstanding`](#rpt_po_outstanding) | read | - | `GET /api/reports/po-outstanding` |
| [`rpt_production_cost_summary`](#rpt_production_cost_summary) | read | - | `GET /api/reports/production-cost-summary` |
| [`rpt_profit_loss`](#rpt_profit_loss) | read | - | `GET /api/reports/profit-loss` |
| [`rpt_profitability_sku`](#rpt_profitability_sku) | read | - | `GET /api/reports/profitability-per-sku` |
| [`rpt_supplier_performance`](#rpt_supplier_performance) | read | - | `GET /api/reports/supplier-performance` |

## Rincian tool

### get_payable_schedule

**Ringkasan:** Jadwal jatuh tempo hutang: semua faktur pembelian bersisa (outstanding>0, bukan Draft/Cancelled) urut jatuh tempo, status overdue/due_soon (<=7 hari)/on_track/no_due_date. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/payable-schedule` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "get_payable_schedule",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{invoices[] {id, invoiceNumber, supplierName, dueDate, grandTotal, outstanding, daysUntilD>"
}
```

**Isi hasil:** {invoices[] {id, invoiceNumber, supplierName, dueDate, grandTotal, outstanding, daysUntilDue, status}, summary {totalOutstanding, overdueAmount, dueSoonAmount, totalInvoices}}.

**Tool terkait:** [`rpt_aging`](#rpt_aging), [`rpt_dash_upcoming_due`](dashboard.md#rpt_dash_upcoming_due)

### get_receivable_schedule

**Ringkasan:** Jadwal jatuh tempo piutang: semua faktur penjualan bersisa (outstanding>0, bukan Draft/Cancelled) urut jatuh tempo dengan status overdue/due_soon/on_track/no_due_date. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/receivable-schedule` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "get_receivable_schedule",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{invoices[] {id, invoiceNumber, customerName, dueDate, grandTotal, outstanding, daysUntilD>"
}
```

**Isi hasil:** {invoices[] {id, invoiceNumber, customerName, dueDate, grandTotal, outstanding, daysUntilDue, status}, summary {totalOutstanding, overdueAmount, totalInvoices}}.

**Tool terkait:** [`rpt_aging`](#rpt_aging), [`rpt_dash_overdue`](dashboard.md#rpt_dash_overdue)

### get_trial_balance

**Ringkasan:** Neraca saldo (trial balance): total debit, total kredit, dan saldo per akun dari buku besar (hanya jurnal tidak dibatalkan). Filter periode opsional startDate/endDate. Tanpa startDate/endDate laporan mencakup SEMUA transaksi sejak awal.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/trial-balance` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "get_trial_balance",
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
  "data": "<Array akun {id, name, accountNumber, accountType, rootType, debit, credit, balance}; akun >"
}
```

**Isi hasil:** Array akun {id, name, accountNumber, accountType, rootType, debit, credit, balance}; akun tanpa mutasi tidak ditampilkan. balance = saldo pada sisi normal akun.

**Prasyarat**

- Jurnal sudah diposting ke buku besar

**Error umum**

- 400: startDate/endDate tidak valid

**Tool terkait:** [`rpt_profit_loss`](#rpt_profit_loss), [`rpt_balance_sheet`](#rpt_balance_sheet), [`rpt_ledger_detail`](#rpt_ledger_detail)

### rpt_aging

**Ringkasan:** Umur piutang (type=Customer, default) atau umur hutang (type=Supplier) per pihak per hari ini, dari faktur berstatus Submitted/PartiallyPaid/Overdue. Bucket: current (belum JT), 1-30, 31-60, 61-90, >90 hari sejak jatuh tempo. Catatan: nama tool menyebut receivable tetapi juga melayani hutang lewat type=Supplier.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/aging` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `type` | query | enum: `Customer`, `Supplier` | tidak | Jenis pihak: Customer = piutang, Supplier = hutang (default Customer) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_aging",
  "args": {
    "type": "Customer"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {name, current, 1, 31, 61, 91, total} per pelanggan/pemasok (kunci 1/31/61/91 = buck>"
}
```

**Isi hasil:** Array {name, current, 1, 31, 61, 91, total} per pelanggan/pemasok (kunci 1/31/61/91 = bucket 1-30/31-60/61-90/>90). Maksimum 10.000 faktur.

**Tool terkait:** [`get_receivable_schedule`](#get_receivable_schedule), [`get_payable_schedule`](#get_payable_schedule), [`rpt_dash_aging_summary`](dashboard.md#rpt_dash_aging_summary)

### rpt_balance_sheet

**Ringkasan:** Neraca (balance sheet) per tanggal: aset, kewajiban, ekuitas berjenjang, ditambah baris sintetis "Laba Tahun Berjalan" dari saldo pendapatan-beban. Parameter date (default hari ini) = tanggal posisi.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/balance-sheet` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | query | `date` | tidak | Tanggal posisi neraca (default hari ini) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_balance_sheet",
  "args": {
    "date": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{assets[], liabilities[], equity[] (termasuk Laba Tahun Berjalan), totalAssets, totalLiabi>"
}
```

**Isi hasil:** {assets[], liabilities[], equity[] (termasuk Laba Tahun Berjalan), totalAssets, totalLiabilities, totalEquity}.

**Error umum**

- 400: date tidak valid

**Tool terkait:** [`get_trial_balance`](#get_trial_balance), [`rpt_profit_loss`](#rpt_profit_loss)

### rpt_cash_flow

**Ringkasan:** Laporan arus kas (metode langsung dari mutasi akun kas/bank sistem) dikelompokkan operasi/investasi/pendanaan. Filter startDate/endDate; default awal tahun berjalan s.d. hari ini.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/cash-flow` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_cash_flow",
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
  "data": "<{operating, investing, financing, netChange, details:{operating[],investing[],financing[]}>"
}
```

**Isi hasil:** {operating, investing, financing, netChange, details:{operating[],investing[],financing[]}} dalam Rupiah; klasifikasi berdasarkan nomor/tipe akun lawan.

**Error umum**

- 400: startDate/endDate tidak valid

**Tool terkait:** [`rpt_dash_cash_flow`](dashboard.md#rpt_dash_cash_flow), [`get_cash_position`](dashboard.md#get_cash_position)

### rpt_daily

**Ringkasan:** Laporan operasional harian: faktur penjualan & pembelian, produksi, pembayaran, jurnal manual, dan piutang/hutang pada satu tanggal. Parameter date (default hari ini).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/daily` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `date` | query | `date` | tidak | Tanggal laporan (default hari ini) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_daily",
  "args": {
    "date": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{date, sales, purchases, production, finance, receivables, payables, vendorDeposits, stock>"
}
```

**Isi hasil:** {date, sales, purchases, production, finance, receivables, payables, vendorDeposits, stock} — stock = snapshot nilai persediaan per gudang pada akhir tanggal tsb.

**Error umum**

- 400: date tidak valid

### rpt_hpp

**Ringkasan:** Laporan HPP/margin kotor per item dari baris faktur penjualan (status bukan Draft/Cancelled) pada periode: omzet, qty, HPP = qty x rata-rata biaya (WAC) item SAAT INI, margin. Default awal tahun s.d. hari ini. Bukan HPP dari jurnal.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/hpp` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_hpp",
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
  "data": "<{period, items[] {itemId, itemCode, itemName, category, totalQty, totalRevenue, totalCogs,>"
}
```

**Isi hasil:** {period, items[] {itemId, itemCode, itemName, category, totalQty, totalRevenue, totalCogs, grossMargin, marginPct}, summary {totalRevenue, totalCogs, grossProfit, grossMarginPct}}.

**Tool terkait:** [`rpt_profitability_sku`](#rpt_profitability_sku), [`rpt_profit_loss`](#rpt_profit_loss)

### rpt_ledger_book

**Ringkasan:** Buku besar lengkap semua akun aktif non-grup yang punya mutasi/saldo awal, dengan saldo awal (openingBalance sebelum startDate), mutasi, dan closingBalance. Filter startDate/endDate opsional. Output besar — gunakan periode sempit.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/ledger-book` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_ledger_book",
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
  "data": "<Array per akun {accountId, accountNumber, accountName, rootType, openingBalance, entries[]>"
}
```

**Isi hasil:** Array per akun {accountId, accountNumber, accountName, rootType, openingBalance, entries[], totalDebit, totalCredit, closingBalance}.

**Tool terkait:** [`rpt_ledger_detail`](#rpt_ledger_detail)

### rpt_ledger_detail

**Ringkasan:** Mutasi buku besar satu akun (wajib accountId) dengan saldo berjalan. Filter startDate/endDate opsional; maks. 10.000 baris. Saldo berjalan dimulai dari 0 pada baris pertama hasil filter (TIDAK memuat saldo awal sebelum startDate).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/ledger-detail` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `accountId` | query | `string` | ya | ID akun (COA) yang dilihat mutasinya |
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_ledger_detail",
  "args": {
    "accountId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{accountId, accountName, accountNumber, entries[] {date, debit, credit, description, refer>"
}
```

**Isi hasil:** {accountId, accountName, accountNumber, entries[] {date, debit, credit, description, referenceType, runningBalance}}.

**Error umum**

- 400: accountId wajib / tanggal tidak valid
- 404: akun tidak ditemukan

**Tool terkait:** [`rpt_ledger_book`](#rpt_ledger_book), [`get_trial_balance`](#get_trial_balance)

### rpt_po_outstanding

**Ringkasan:** PO yang masih outstanding (status Submitted, belum ditutup) dengan qty dipesan vs diterima, sisa, nilai sisa, dan penanda overdue vs tanggal kirim. Filter partyId, warehouseId, startDate/endDate (tanggal PO), overdue=1 untuk hanya yang telat. Maks. 2000 PO.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/po-outstanding` (src/routes/reports/purchasing.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `string` | tidak | Filter pemasok |
| `warehouseId` | query | `string` | tidak | Filter gudang tujuan |
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |
| `overdue` | query | enum: `1`, `true` | tidak | Isi 1/true untuk hanya PO lewat tanggal kirim |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_po_outstanding",
  "args": {
    "partyId": "<id>",
    "warehouseId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{rows[] per baris PO {poNumber, supplier, itemName, unit, ordered, received, remaining, un>"
}
```

**Isi hasil:** {rows[] per baris PO {poNumber, supplier, itemName, unit, ordered, received, remaining, unitValue, remainingValue, isOverdue, daysOverdue, ...}, summary {poCount, lineCount, remainingValue, overduePoCount}}.

**Error umum**

- 400: format tanggal harus YYYY-MM-DD

**Tool terkait:** [`rpt_supplier_performance`](#rpt_supplier_performance)

### rpt_production_cost_summary

**Ringkasan:** Modal per periode untuk produksi: per output utama x gudang, kg & nilai bahan, kg output, yield, modal bahan baku murni/kg vs HPP GL/kg. Informasi saja, tidak membuat jurnal. Default bulan berjalan; filter opsional warehouseId.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/production-cost-summary` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |
| `warehouseId` | query | `string` | tidak | Batasi ke satu gudang hasil produksi |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_production_cost_summary",
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
  "data": "<{period, summary[] per output+gudang, total, runs[] per production run {runNumber, inputKg>"
}
```

**Isi hasil:** {period, summary[] per output+gudang, total, runs[] per production run {runNumber, inputKg, mainKg, yieldPct, rawMaterialPerKg, glPerKg, ...}}. Run batal dan run tanpa output utama dikeluarkan.

**Tool terkait:** [`rpt_hpp`](#rpt_hpp)

### rpt_profit_loss

**Ringkasan:** Laporan laba rugi: pendapatan (REVENUE) dikurangi beban (EXPENSE) per akun berjenjang, dengan totalRevenue, totalExpense, netProfit. Filter periode opsional startDate/endDate. Tanpa startDate/endDate laporan mencakup SEMUA transaksi sejak awal.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/profit-loss` (src/routes/reports.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_profit_loss",
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
  "data": "<{revenue[], expense[] (pohon akun {id,name,accountNumber,isGroup,balance,children}), total>"
}
```

**Isi hasil:** {revenue[], expense[] (pohon akun {id,name,accountNumber,isGroup,balance,children}), totalRevenue, totalExpense, netProfit}. Pendapatan = kredit-debit; beban = debit-kredit.

**Error umum**

- 400: startDate/endDate tidak valid

**Tool terkait:** [`rpt_balance_sheet`](#rpt_balance_sheet), [`rpt_hpp`](#rpt_hpp)

### rpt_profitability_sku

**Ringkasan:** Profitabilitas per SKU: omzet vs HPP bahan (WAC saat ini) vs HPP loaded (biaya batch bila baris faktur memilih batch). Default awal tahun s.d. hari ini; coveragePct = porsi baris yang punya batch.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/profitability-per-sku` (src/routes/reports/operational.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_profitability_sku",
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
  "data": "<{period, items[] {itemId, itemCode, itemName, unit, category, totalQty, totalRevenue, mate>"
}
```

**Isi hasil:** {period, items[] {itemId, itemCode, itemName, unit, category, totalQty, totalRevenue, materialCogs, loadedCogs, coveragePct, ...}, summary {materialGrossProfit, loadedGrossProfit, materialMarginPct, loadedMarginPct}}.

**Tool terkait:** [`rpt_hpp`](#rpt_hpp)

### rpt_supplier_performance

**Ringkasan:** Kinerja pemasok dari PO Submitted: ketepatan kirim (STT terakhir/pertama vs expectedDeliveryDate), rata-rata lead time, fill rate qty, dan selisih harga faktur vs PO. Filter partyId dan startDate/endDate (tanggal PO). Maks. 5000 PO.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/reports/supplier-performance` (src/routes/reports/purchasing.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `partyId` | query | `string` | tidak | Filter satu pemasok |
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_supplier_performance",
  "args": {
    "partyId": "<id>",
    "startDate": "2026-01-31"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{rows[] {supplierId, supplierName, poCount, evaluatedCount, onTimeRate %, firstOnTimeRate >"
}
```

**Isi hasil:** {rows[] {supplierId, supplierName, poCount, evaluatedCount, onTimeRate %, firstOnTimeRate %, avgLeadTimeDays, fillRate %, priceVariancePct, priceVarianceAmount}} urut poCount terbanyak.

**Error umum**

- 400: format tanggal harus YYYY-MM-DD

**Tool terkait:** [`rpt_po_outstanding`](#rpt_po_outstanding)


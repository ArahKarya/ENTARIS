# Toolset: Dashboard (`dashboard`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/dashboard` · 17 tool (read 17, write 0, critical 0)

## Tujuan

Toolset **dashboard** adalah ringkasan angka cepat yang sama dengan kartu dan grafik di halaman Dashboard Entaris: posisi kas, piutang/hutang, tren laba, faktur jatuh tempo, peringatan stok, dan pemeliharaan. Semua tool read-only dan murah dijalankan (tanpa parameter atau dengan `startDate`/`endDate`). Gunakan untuk "gambaran singkat sekarang"; untuk angka resmi per periode gunakan toolset **laporan**.

## ALUR BISNIS

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

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`get_cash_position`](#get_cash_position) | read | - | `GET /api/dashboard/cash-position` |
| [`rpt_dash_aging_summary`](#rpt_dash_aging_summary) | read | - | `GET /api/dashboard/aging-summary` |
| [`rpt_dash_cash_flow`](#rpt_dash_cash_flow) | read | - | `GET /api/dashboard/cash-flow` |
| [`rpt_dash_charts`](#rpt_dash_charts) | read | - | `GET /api/dashboard/charts` |
| [`rpt_dash_expense_breakdown`](#rpt_dash_expense_breakdown) | read | - | `GET /api/dashboard/expense-breakdown` |
| [`rpt_dash_financial_ratios`](#rpt_dash_financial_ratios) | read | - | `GET /api/dashboard/financial-ratios` |
| [`rpt_dash_maintenance`](#rpt_dash_maintenance) | read | - | `GET /api/dashboard/maintenance` |
| [`rpt_dash_monthly_profit`](#rpt_dash_monthly_profit) | read | - | `GET /api/dashboard/monthly-profit` |
| [`rpt_dash_negative_stock`](#rpt_dash_negative_stock) | read | - | `GET /api/dashboard/negative-stock` |
| [`rpt_dash_overdue`](#rpt_dash_overdue) | read | - | `GET /api/dashboard/overdue` |
| [`rpt_dash_pending_do`](#rpt_dash_pending_do) | read | - | `GET /api/dashboard/pending-do` |
| [`rpt_dash_stock_alerts`](#rpt_dash_stock_alerts) | read | - | `GET /api/dashboard/stock-alerts` |
| [`rpt_dash_top_customers`](#rpt_dash_top_customers) | read | - | `GET /api/dashboard/top-customers` |
| [`rpt_dash_top_vendors`](#rpt_dash_top_vendors) | read | - | `GET /api/dashboard/top-vendors` |
| [`rpt_dash_upcoming_due`](#rpt_dash_upcoming_due) | read | - | `GET /api/dashboard/upcoming-due` |
| [`rpt_dashboard`](#rpt_dashboard) | read | - | `GET /api/dashboard/metrics` |
| [`rpt_fa_dashboard`](#rpt_fa_dashboard) | read | - | `GET /api/dashboard/fixed-assets` |

## Rincian tool

### get_cash_position

**Ringkasan:** Saldo saat ini per akun kas/bank sistem (akun role CASH aktif non-grup) beserta total.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/cash-position` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "get_cash_position",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{accounts[{id, accountNumber, name, balance}], total}.>"
}
```

**Isi hasil:** {accounts[{id, accountNumber, name, balance}], total}.

**Tool terkait:** [`rpt_cash_flow`](laporan.md#rpt_cash_flow)

### rpt_dash_aging_summary

**Ringkasan:** Ringkasan umur piutang dan hutang dalam 5 bucket (Belum JT, 1-30, 31-60, 61-90, >90 hari) dari faktur bersisa bukan Draft/Cancelled. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/aging-summary` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_aging_summary",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{receivable[{label,amount}], payable[{label,amount}], totalReceivable, totalPayable}.>"
}
```

**Isi hasil:** {receivable[{label,amount}], payable[{label,amount}], totalReceivable, totalPayable}.

**Tool terkait:** [`rpt_aging`](laporan.md#rpt_aging)

### rpt_dash_cash_flow

**Ringkasan:** Kas masuk (Receive) dan keluar (Pay) harian dari transaksi Pembayaran pada periode (default bulan berjalan; startDate/endDate opsional). Hanya pembayaran berstatus Submitted. Beda dengan rpt_cash_flow (berbasis jurnal).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/cash-flow` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_cash_flow",
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
  "data": "<{days[{date, cashIn, cashOut}], totalIn, totalOut, net}.>"
}
```

**Isi hasil:** {days[{date, cashIn, cashOut}], totalIn, totalOut, net}.

**Tool terkait:** [`rpt_cash_flow`](laporan.md#rpt_cash_flow)

### rpt_dash_charts

**Ringkasan:** Deret bulanan pendapatan vs beban untuk grafik dashboard (default 6 bulan terakhir; startDate/endDate opsional).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/charts` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_charts",
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
  "data": "<Array {name (label bulan), pendapatan, beban} per bulan.>"
}
```

**Isi hasil:** Array {name (label bulan), pendapatan, beban} per bulan.

### rpt_dash_expense_breakdown

**Ringkasan:** Rincian beban per akun beban pada periode (default bulan berjalan; startDate/endDate opsional) dari buku besar.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/expense-breakdown` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_expense_breakdown",
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
  "data": "<Array {accountName, amount, ...} akun beban dengan saldo >0, urut terbesar.>"
}
```

**Isi hasil:** Array {accountName, amount, ...} akun beban dengan saldo >0, urut terbesar.

### rpt_dash_financial_ratios

**Ringkasan:** Rasio keuangan dari saldo akun saat ini: current ratio, debt-to-equity, debt-to-asset beserta total aset/kewajiban/ekuitas. Tanpa parameter (bukan per tanggal historis).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/financial-ratios` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_financial_ratios",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{currentRatio, debtToEquity, debtToAsset, totalAssets, totalLiabilities, totalEquity}; ras>"
}
```

**Isi hasil:** {currentRatio, debtToEquity, debtToAsset, totalAssets, totalLiabilities, totalEquity}; rasio 0 bila penyebut 0.

### rpt_dash_maintenance

**Ringkasan:** Dashboard pemeliharaan: jadwal PM, work order terbuka, pajak/asuransi kendaraan, dan dokumen legal yang akan/ sudah jatuh tempo (overdue/today/soon/scheduled). Hanya sumber yang boleh dilihat peminta yang dimuat.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `ga_maintenance` / `view`)
- **Catatan akses:** Tanpa guard mount: izin dicek per sumber di handler — ga_maintenance, ga_vehicle, ga_documents (view). Cukup salah satu; sumber tanpa izin tidak dimuat. 403 bila ketiganya tidak ada.
- **Handler:** `GET /api/dashboard/maintenance` (src/routes/dashboardMaintenance.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_maintenance",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Ringkasan + daftar akan-datang per jenis (schedule, workOrder, vehicleTax, vehicleInsuranc>"
}
```

**Isi hasil:** Ringkasan + daftar akan-datang per jenis (schedule, workOrder, vehicleTax, vehicleInsurance, document) dengan state jatuh tempo.

**Error umum**

- 403: tidak punya izin modul pemeliharaan

### rpt_dash_monthly_profit

**Ringkasan:** Tren laba bulanan (pendapatan, beban, laba) dari buku besar; default 12 bulan terakhir, startDate/endDate opsional.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/monthly-profit` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_monthly_profit",
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
  "data": "<Array per bulan {name (label), revenue, expense, profit}.>"
}
```

**Isi hasil:** Array per bulan {name (label), revenue, expense, profit}.

### rpt_dash_negative_stock

**Ringkasan:** Item dengan stok minus (level item atau per gudang) beserta pergerakan terakhir sebagai konteks (siapa/kapan/kenapa) — monitor bypass stok negatif. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `reports` / `view`)
- **Catatan akses:** Cukup izin modul reports ATAU inventory (view).
- **Handler:** `GET /api/dashboard/negative-stock` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_negative_stock",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array maks. 50 {id, code, name, unit, currentStock, negativeWarehouses[{warehouseCode, war>"
}
```

**Isi hasil:** Array maks. 50 {id, code, name, unit, currentStock, negativeWarehouses[{warehouseCode, warehouseName, currentStock}], lastMovementAt}.

**Tool terkait:** [`rpt_dash_stock_alerts`](#rpt_dash_stock_alerts)

### rpt_dash_overdue

**Ringkasan:** Faktur penjualan dan pembelian yang sudah lewat jatuh tempo dan masih bersisa; gabungan maks. 10 teratas urut paling terlambat. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/overdue` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_overdue",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {type: sales|purchase, invoiceNumber, partyName, amount (sisa), dueDate, daysOverdue>"
}
```

**Isi hasil:** Array {type: sales|purchase, invoiceNumber, partyName, amount (sisa), dueDate, daysOverdue}.

**Tool terkait:** [`get_receivable_schedule`](laporan.md#get_receivable_schedule), [`get_payable_schedule`](laporan.md#get_payable_schedule)

### rpt_dash_pending_do

**Ringkasan:** Surat Jalan berstatus Submitted yang belum di-invoice (invoiceId kosong), maks. 50, supaya DO lama tidak terlupa ditagihkan. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/pending-do` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_pending_do",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {id, doNumber, date, customer, itemCount, totalQty, unit, ageDays}.>"
}
```

**Isi hasil:** Array {id, doNumber, date, customer, itemCount, totalQty, unit, ageDays}.

### rpt_dash_stock_alerts

**Ringkasan:** Item aktif yang stoknya sudah di bawah/sama dengan stok minimum (minimumStock>0), terendah dahulu, maks. 20. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `reports` / `view`)
- **Catatan akses:** Cukup izin modul reports ATAU inventory (view) — dipakai kartu stok semua role gudang.
- **Handler:** `GET /api/dashboard/stock-alerts` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_stock_alerts",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {id, code, name, unit, category, currentStock, minimumStock}.>"
}
```

**Isi hasil:** Array {id, code, name, unit, category, currentStock, minimumStock}.

**Tool terkait:** [`rpt_dash_negative_stock`](#rpt_dash_negative_stock)

### rpt_dash_top_customers

**Ringkasan:** 5 pelanggan teratas berdasarkan total faktur penjualan (status bukan Draft/Cancelled). Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/top-customers` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_top_customers",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array maks. 5 {rank, partyId, partyName, total (grandTotal)}.>"
}
```

**Isi hasil:** Array maks. 5 {rank, partyId, partyName, total (grandTotal)}.

### rpt_dash_top_vendors

**Ringkasan:** 5 pemasok teratas berdasarkan total faktur pembelian. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/top-vendors` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_top_vendors",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array maks. 5 {rank, partyId, partyName, total (grandTotal)}.>"
}
```

**Isi hasil:** Array maks. 5 {rank, partyId, partyName, total (grandTotal)}.

### rpt_dash_upcoming_due

**Ringkasan:** Faktur penjualan/pembelian yang BELUM jatuh tempo namun jatuh tempo dalam 14 hari ke depan dan masih bersisa; gabungan maks. 8 teratas urut paling dekat. Pelengkap rpt_dash_overdue.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/upcoming-due` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dash_upcoming_due",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array {type: sales|purchase, invoiceNumber, partyName, amount (sisa), dueDate, daysLeft}.>"
}
```

**Isi hasil:** Array {type: sales|purchase, invoiceNumber, partyName, amount (sisa), dueDate, daysLeft}.

**Tool terkait:** [`rpt_dash_overdue`](#rpt_dash_overdue)

### rpt_dashboard

**Ringkasan:** Metrik ringkas dashboard: saldo kas, piutang usaha, hutang (saldo akun LIABILITY), uang muka vendor, nilai persediaan, dan laba bersih periode (default bulan berjalan; startDate/endDate opsional). Piutang/hutang di-floor 0.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/metrics` (src/routes/dashboard.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "rpt_dashboard",
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
  "data": "<{cashBalance, accountsReceivable, accountsPayable, vendorDeposit, inventoryValue, netProfi>"
}
```

**Isi hasil:** {cashBalance, accountsReceivable, accountsPayable, vendorDeposit, inventoryValue, netProfit}.

**Tool terkait:** [`rpt_profit_loss`](laporan.md#rpt_profit_loss), [`get_cash_position`](#get_cash_position)

### rpt_fa_dashboard

**Ringkasan:** Dashboard aset tetap aktif: KPI (total biaya perolehan, akumulasi penyusutan, nilai buku, penyusutan bulan ini dan YTD), per kategori, aset teratas, dan penyusutan jatuh tempo. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `reports` / `view`)
- **Handler:** `GET /api/dashboard/fixed-assets` (src/routes/dashboard/fixedAssets.ts)
- **Status default:** nonaktif (diaktifkan owner)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "rpt_fa_dashboard",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{summary, byCategory[], topAssets[], depreciationDue[]}.>"
}
```

**Isi hasil:** {summary, byCategory[], topAssets[], depreciationDue[]}.


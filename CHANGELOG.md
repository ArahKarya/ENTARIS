# Changelog

## [Unreleased]

### Merek
**Diubah**:
- Produk berganti nama dari **Simple ERP / ERP PMD** menjadi **Entaris** (*Enterprise Agentic Reasoning Integrated System*) — tagline "Entaris — Agentic ERP".
- Ikon aplikasi baru: huruf E tiga bilah + titik agen (Langit 800 `#1F5F74`, Krem, Gabah). Favicon 16/32 px digambar pas grid piksel; PWA kini punya ikon `any` dan `maskable` terpisah (`pwa-maskable-512x512.png`); `mask-icon.svg` satu warna untuk Safari.
- Judul tab, manifest PWA, `theme-color`, nama cadangan di login/sidebar/onboarding/landing kini memakai Entaris.
- Logo bawaan tidak lagi di-*invert* di sidebar & halaman login (ikon baru berwarna penuh).
- Halaman login memakai palet Entaris (gradien Langit, aksen Gabah) menggantikan biru navy; label panel menjadi "Agentic ERP". Kontras tombol & tautan ≥ 4,5 : 1.
- Panduan merek & file sumber logo di `docs/brand/entaris/`.

**Catatan**: pengenal teknis `simple-erp` (kontrak `app` ke aira-core, nama proses pm2, nama repo) tidak diubah agar integrasi dan deploy yang berjalan tidak putus.

## [3.19.0] - 2026-10-02

Rilis kumulatif sejak 3.18.1 (31 Jul): modul Surat Jalan Sementara, pembenahan HPP/persediaan, EAM terintegrasi keuangan, dan sejumlah perbaikan integritas data.

### Penjualan
**Ditambahkan**:
- **Surat Jalan Sementara (SJS)** — tab baru di Penjualan > Surat Jalan untuk barang yang dikirim sebelum produksi diinput. Tidak memotong stok, tanpa jurnal, tidak bisa diinvoice. Nomor `SJS-YYYYMM-NNNN`; status Terbuka → Tertaut / Dibatalkan. Ditautkan ke DO resmi saat membuat DO (langsung maupun dari SO) atau ke DO yang sudah ada (`POST /api/temporary-delivery-notes/:id/link`); qty DO boleh berbeda. DO dibatalkan → SJS kembali Terbuka. Banner pengingat SJS Terbuka > 7 hari, cetak PDF "Surat Jalan Sementara". Migrasi `20261002000000_temporary_delivery_notes.sql` (tabel baru saja, tanpa ALTER tabel lama).
- Kolom tanda tangan **Verifikasi Fisik (Security)** di PDF Delivery Order.
- Invoice bernilai **Rp 0** (sumbangan/sampel) otomatis berstatus `Paid` saat submit tanpa jurnal piutang; tetap bisa dibatalkan dari UI.
- Linimasa riwayat pembayaran gabungan pada detail invoice, termasuk uang muka yang dibatalkan.

**Diperbaiki**:
- Retur qty-saja (tarif 0, mis. barang titipan) kini diizinkan tanpa syarat total > 0.
- Cache `customerDepositBalance` disinkronkan saat submit dan cancel retur.
- Daftar Surat Jalan Sementara gagal dimuat (cast tanggal kosong ke `date`); kini memakai `NULLIF`.

### Pembelian & Penerimaan
**Ditambahkan**:
- Satu invoice pembelian dapat menagih **lebih dari satu STT/BPB** (pilih ganda); constraint UNIQUE `goods_receipts.invoice_id` dihapus.
- Detail pengajuan invoice pembelian lengkap bagi penyetuju (STT, lampiran, hutang dan deposit pemasok, harga sebelumnya); cek qty terhadap STT memperhitungkan refaksi.
- Guard WAC: STT dengan harga satuan 0 ditolak untuk barang milik sendiri (barang titipan dikecualikan).

**Diubah**:
- Edit dan batal movement stok bertipe STT **per baris diblokir** (`PUT /api/inventory/movements/:id`, `/cancel`); gunakan batal/revisi dari halaman STT agar jurnal GRNI ikut terbalik.

### Persediaan, Produksi & HPP
**Ditambahkan**:
- Akun **5.12 Biaya Konversi Dibebankan ke Persediaan** — kredit biaya konversi produksi dipisah dari 5.1 HPP (sisa selisih NRV tetap di 5.1); reklasifikasi historis Mei–Sep 2026.
- **Modal bahan baku murni (WAC2)** di detail produksi dan laporan Modal Produksi per Periode.
- Input manual nilai/satuan (`unitCost`) di Stock Opname (ERP + EAM).

**Diperbaiki**:
- `recalculateAccountBalances()` kini berbasis `accounting_ledger_entries` (sumber kebenaran), bukan `journal_entry_accounts`.
- **Reversal otomatis penyelesaian HPP (COGS backfill)** saat dokumen pemicu dibatalkan atau diedit — produksi, invoice pembelian, dan mutasi manual (`services/cogsBackfillReverse.ts`). Sebelumnya jurnal penyelesaian dan antrian tertinggal sehingga persediaan overstated. Operasi idempoten; `averageCost` tidak dibalik secara aritmetika.
- Guard HPP edit produksi disamakan dengan submit (maklon cost 0 / NRV produk samping tinggi).
- Detail produksi menampilkan jurnal aktif terbaru (revisi `-R1`/`-R2`), bukan jurnal pertama yang sudah Cancelled.
- Stock Opname tidak lagi terblokir oleh item minus historis yang tak disentuh pengguna.
- Penomoran dokumen melewati nomor yang turunan `entryNumber`-nya sudah ada.

### EAM / General Affairs
**Ditambahkan**:
- Integrasi **Tagihan GA ke keuangan** — pajak/STNK/KIR, riwayat servis, dan material request masuk antrian, diposting sebagai jurnal langsung atau faktur pembelian; akun **6.41 Beban Pajak & Perizinan Kendaraan** sebagai default pajak.
- Alur pengajuan dan approval Pajak/STNK; panel Pengajuan terpusat (servis dan pajak) sebagai tab di Maintenance/WO.
- Pengajuan servis yang disetujui otomatis membuat Work Order; menutup WO otomatis membuat riwayat servis kendaraan.
- Inventaris GA: foto per item, tab Dashboard stok dan tab Tools (opname cepat, export CSV).
- Export Excel rekap Work Order; biaya WO dan MR berstatus PAID digabung di Report Armada tanpa hitung ganda.

**Diperbaiki**:
- Antrian Tagihan GA tidak lagi hilang karena status pajak tertimpa; status pajak terjurnal dikunci (409).
- Status PAID ditambahkan di badge, label, dan filter MR; foto item inventaris dan file `/uploads` dilayani lewat endpoint aman.

### Laporan & Keuangan
**Diperbaiki**:
- Logo dan kop perusahaan kini tampil di Laba Rugi, Neraca, Neraca Saldo, Arus Kas, Aging, dan Laporan Harian.
- Halaman Bank & Kas: baris jurnal manual (biaya adm, bunga, pindah-buku) membuka detail jurnal.
- Pembatalan jurnal aplikasi Uang Muka dari Buku Besar diblokir lewat pola narasi.
- Rentang tanggal preset dashboard dihitung ulang saat dimuat, bukan memakai cache localStorage basi.
- Panel approval mengambil daftar pihak/barang dengan limit tinggi agar tidak hilang dari peta pencarian.

**Kompatibilitas**: semua migrasi baru additive dan idempotent; tidak ada perubahan yang mengubah data lama secara otomatis.

## [3.18.1] - 2026-07-31

### Export PDF Hasil Inspeksi Berkala Kendaraan

Riwayat inspeksi kendaraan kini bisa diunduh sebagai dokumen PDF per record — sebelumnya hasil inspeksi hanya bisa dilihat di layar, dan PDF "Report Kendaraan" yang ada cuma memuat satu baris ringkas inspeksi terakhir (ringkasan TCO/biaya, bukan detail checklist).

**Ditambahkan**:
- `client/src/lib/pdf/InspectionDetailPDF.tsx` + `client-eam/src/lib/pdf/InspectionDetailPDF.tsx` (identik) — dokumen A4 @react-pdf/renderer berisi header perusahaan + logo, ringkasan (hasil keseluruhan, odometer, level BBM, jadwal inspeksi berikutnya), identitas kendaraan, tabel checklist per kategori dengan status berwarna (OK hijau / Perlu Perhatian amber / Rusak merah), catatan, grid foto bukti per kategori, dan footer "dicetak oleh <user> · <tanggal cetak>" + nomor halaman
- Tombol "PDF" per baris di tabel riwayat inspeksi (tab Inspeksi, `GaVehiclePage.tsx` ERP + EAM) — nama file `Inspeksi_<plat|kode>_<tanggal>.pdf`
- `GET /api/ga/vehicle/assets/:id/inspections/:iid/photos/:pid/file` — serve file foto inspeksi lewat route ber-RBAC dengan path-traversal guard

**Diperbaiki**:
- Foto bukti inspeksi sebelumnya dirujuk sebagai `/uploads/<filePath>` langsung, padahal `/uploads/*` tidak di-serve sebagai static oleh backend (request jatuh ke SPA fallback dan mengembalikan `index.html`), sehingga gambar tidak pernah tampil. Kini `<img>` di riwayat dan gambar di PDF sama-sama memakai endpoint file di atas (di PDF byte-nya di-inline sebagai data URL).

**Kompatibilitas**: checklist format lama (12 item datar) tetap tercetak di PDF pada grup "Checklist (format lama)"; tidak ada perubahan skema DB.

## [3.18.0] - 2026-07-31

### Inspeksi Berkala Kendaraan — Komprehensif

Fitur Inspeksi Berkala di modul Kendaraan (ERP `client/` + EAM `client-eam/`) diperluas dari checklist 12 item datar menjadi inspeksi komprehensif: checklist detail per kategori, foto bukti per kategori, nama inspektor, level BBM, dan jadwal inspeksi berikutnya otomatis.

**Ditambahkan**:
- Checklist detail 33 sub-item dalam 6 kategori (Mesin & Cairan, Kelistrikan, Rem & Kemudi, Ban & Roda, Keselamatan, Lain-lain) — UI accordion per kategori dengan tombol "tandai semua" per kategori, bukan grid datar 2 kolom
- Foto bukti per kategori inspeksi (1 foto/kategori, JPG/PNG/WEBP maks 5 MB) — tabel `ga_vehicle_inspection_photos`, endpoint `POST/DELETE /api/ga/vehicle/assets/:id/inspections/:iid/photos`, file di `uploads/ga/inspections/`
- Kolom `inspector_name`, `inspector_user_id`, `fuel_level` (enum `GaVehicleFuelLevel`: KOSONG/SEPEREMPAT/SETENGAH/TIGA_PEREMPAT/PENUH), `next_due_date` di `ga_vehicle_inspections`
- Jadwal inspeksi berikutnya dihitung otomatis saat simpan (default interval 30 hari, dapat diubah per inspeksi) + banner reminder status TERLAMBAT / segera jatuh tempo di tab Inspeksi
- KPI armada "Inspeksi Jatuh Tempo" di `GET /api/ga/vehicle/fleet-summary` (`inspectionOverdue`, `inspectionDueSoon`, `inspectionNeverDone`) — dihitung dari inspeksi terakhir per kendaraan
- Endpoint `GET /api/ga/vehicle/inspection-categories` (struktur kategori + sub-item untuk FE)
- Baris riwayat inspeksi bisa di-expand: detail checklist per kategori, foto, inspektor, BBM, jadwal berikutnya

**Kompatibilitas data lama**: checklist tetap disimpan sebagai JSON flat (`{key: OK|PERLU_PERHATIAN|RUSAK}`), jadi inspeksi format lama (12 item) tetap terbaca. Sub-item yang tidak dikenal kategori baru ditampilkan di grup "Checklist (format lama)", bukan blank/error. Endpoint lama `GET /api/ga/vehicle/inspection-checkpoints` tetap ada. Migrasi `20260731000000_ga_vehicle_inspection_detail.sql` additive-only & idempotent (semua kolom baru nullable, backfill `next_due_date` = tanggal + 30 hari untuk data lama).

## [3.17.0] - 2026-07-28

### EAM (Enterprise Asset Management) — Aplikasi Terintegrasi Satu Repo

Modul EAM (dulu General Affairs) kini punya frontend standalone di `client-eam/`, dideploy terpisah di `eam.panganmasadepan.com`, **tetap satu monorepo, satu backend/API, satu database** dengan ERP utama — bukan produk/repo terpisah.

**Ditambahkan**:
- `client-eam/` — React+Vite SPA baru, di-clone dari `client/` lalu dipangkas hanya rute modul GA/EAM (Aset, Kendaraan, Gedung, Equipment, Maintenance, Permintaan Barang, Inventaris, Dokumen, Master Data)
- Dashboard EAM (`/`) — total aset, nilai buku (NBV), work order aktif & overdue, breakdown per kategori, quick links
- Login SSO cross-subdomain: cookie `.panganmasadepan.com` (`sameSite: lax`) sehingga 1 login ERP otomatis berlaku juga di EAM
- Filter kategori multi-value di `GET /api/fixed-assets` & `GET /api/ga/assets` (`?categoryId=A,B`) — dipakai tiap halaman modul EAM supaya otomatis hanya menampilkan kategori miliknya (mis. halaman Kendaraan hanya tampilkan aset Kendaraan)
- Tampilan login EAM dibedakan dari ERP: palet hijau tosca/emerald, ikon & copy khusus aset/maintenance (bukan replikasi identik ERP)
- Service `client-eam` ditambahkan ke `docker-compose.yml` — deploy jadi bagian siklus `docker compose up -d --build` yang sama dengan ERP

**Diubah**:
- `server/src/routes/auth.ts` — cookie domain `.panganmasadepan.com` (produksi) + `sameSite: lax` (dari `strict`) supaya cookie ikut terbawa lintas subdomain ERP↔EAM
- `server/src/routes/ga/assets.ts` — `buildAssetWhere()` menerima `categoryId` comma-separated (backward-compatible, single ID tetap jalan seperti biasa)

**Tidak berubah**: modul GA di ERP utama tetap aktif dan tersinkron real-time dengan EAM (baca/tulis ke endpoint & DB yang sama).

## [3.1.3] - 2026-05-22

### Strict Mode: Stok Tidak Boleh Minus (Hapus Bypass)

Lapis pelindung tambahan setelah patch v3.1.2: **stok minus DILARANG total**. Flag `allowNegativeStock` di server diabaikan, checkbox UI dihapus.

**Files patched (server)**:
- `services/deliveryOrderSubmit.ts` — hard block, hapus flag bypass
- `services/deliveryOrderEdit.ts` — sama
- `services/productionRunSubmit.ts` — hard block input qty > stok
- `services/productionRunEdit.ts` — block reverse In (kalau output sudah dipakai) + block new input oversold
- `services/productionRunCancel.ts` — block cancel kalau output sudah dipakai (output sudah jadi stok yg di-konsumsi hilir)
- `routes/inventory/movements.ts` — extend Out validation ke AdjustmentOut juga

**Files patched (client)**:
- `DeliveryOrderModal.tsx` — hapus checkbox "Izinkan stok minus", ganti dengan pesan jelas
- `ProductionRunModal.tsx` — hapus checkbox

**Stock Transfer**: sudah punya validasi per-warehouse di `services/stockTransfer.ts:60-71` (tidak diubah).

### Rationale

Insiden 2026-05: stok BRS-PGC-25KG sudah negatif sejak 18 April (oversold). Setiap In berikutnya trigger bug WAC karena formula `(cQty × cCost + iQty × iCost) / (cQty + iQty)` dengan cQty negatif menghasilkan angka liar. Compound antara produksi cascading + DO submit yang lock avg corrupt → COGS SI-0072/0073 jadi Rp 80.911/Kg untuk barang yg modal sebenarnya Rp 14.000/Kg.

Hapus bypass = tidak mungkin lagi stok negatif = tidak mungkin lagi WAC corruption ini terulang.

---

## [3.1.2] - 2026-05-22

### Fix WAC Korup Saat Stok Negatif

Bug kritis di `server/src/utils/weightedAverage.ts`: formula WAC `(cQty × cCost + iQty × iCost) / (cQty + iQty)` menghasilkan angka absurd saat `currentStock < 0` (oversold). Empirik trace:

- `calcWeightedAverage(-9.863, 8.842, 7.825, 14.050)` returns **-11.153** (negative)
- Di runtime, multiple production cancel/edit cycles meng-compound nilai sampai BRS-PGC-25KG average_cost = **Rp 1.706.336/Kg**
- Akibat: SI-0072 (PT GARUDA SENTRA) + SI-0073 (Baehaqi) di 20 Mei 2026, jual 10.000 Kg @ Rp 14.100 (revenue Rp 141jt each), tapi COGS dibukukan Rp 80.911/Kg = Rp 809jt each → akun 1.4.20 Cruise jadi **−Rp 1,38 Miliar**

**Fix**: kalau `currentQty ≤ 0`, fallback pakai `inUnitCost` (anchor avg cost ke harga inbound) — jangan pakai formula yang punya pembagian dengan angka anomali. Pathological case `totalQty ≤ 0` juga di-handle sama.

### Block Oversold di Surat Jalan

`server/src/services/deliveryOrderSubmit.ts`: validasi qty kirim ≤ stok per-gudang **sebelum** decrement. Kalau tidak cukup, lempar `BusinessError`:

```
Stok 'Beras Cruise 25Kg' di gudang POLES kurang.
Tersedia 0 Kg, diminta 10000 Kg.
Buat produksi/transfer/penerimaan dulu sebelum kirim.
```

Tanpa block ini, oversold meleluasa → stok fisik jadi negatif → trigger bug WAC di atas → COGS rusak total.

### Dashboard Hapus Clamp Math.max(0, ...)

`server/src/routes/dashboard.ts:86` dan `server/src/routes/inventory/dashboard.ts:39`:

Sebelum: `inventoryValue: Math.max(0, sum)` — menyembunyikan saldo persediaan negatif sebagai 0 di widget Dashboard.
Sesudah: `inventoryValue: sum` — tampil apa adanya supaya pemilik langsung tahu kalau ada anomali.

### Data Fix: Rekonsiliasi Stok POLES (ADJ-2605-POLES)

Adjustment fisik dijalankan via script `scripts/inventory-adjustment-poles.cjs` untuk 7 item di gudang POLES:

| Item | Old qty × avg | New qty × avg | Δ value |
|---|---|---|---|
| PK-IRBO | 1.813 × 12.230,53 | 1.830 × 12.231 | +208.779 |
| BRS-PGC-25KG | −850 × 1.706.336 | 300 × 14.200 | +1.454.645.932 |
| BRS-WLM-5KG | −15 × 0 | 750 × 14.100 | +10.575.000 |
| BRS-HGL-50KG | −3.015 × 13.294 | 6.150 × 13.294 | +121.840.987 |
| BRS-MCL-50KG | 4.077 × 15.032,91 | 4.050 × 15.032,91 | −405.888 |
| BRS-PGJ-5KG | 30 × 0 | 30 × 14.500 | +435.000 |
| BRS-PGC-5KG | −10 × 0 | 0 × 0 | 0 |
| **TOTAL** | | | **+Rp 1.587.299.810** |

JE `JV-ADJ-2605-POLES`: DR Persediaan masing-masing / CR 8.8 Pembulatan & Selisih total Rp 1,58M. Net saldo akun 1.4.x sebelum: −Rp 416jt → sesudah: +Rp 1,17M.

### Catatan Outstanding

- **1.4.26 (Pagi Jaya)**: masih −Rp 71jt karena ada kebocoran historis di luar 7 item yang di-fix
- **BRS-WLM-50KG**: average_cost masih corrupt Rp 176.669/Kg — perlu input fisik terpisah
- **SI-202605-0072 & SI-202605-0073**: tidak di-cancel, dibiarkan apa adanya (COGS-nya yang inflated sudah ter-offset oleh adjustment ke 8.8 di periode yang sama)

---

## [3.1.1] - 2026-05-20

### Landed Cost Pembelian (Material + Refaksi → Persediaan)

Selisih harga PI ↔ STT tidak lagi di-post ke akun **5.11 Selisih Harga Pembelian** sebagai expense terpisah. Sekarang seluruh komponen line PI (material + line tambahan seperti "RESIKO MACAN") **diserap masuk ke nilai Persediaan** sebagai landed cost adjustment. Ini sesuai prinsip akuntansi: biaya tambahan yang *attributable* ke perolehan barang adalah bagian dari harga pokok, bukan expense periode.

**Rumus harga akhir per Kg** (saat refaksi berbeda dengan qty fisik STT):
```
unitCost = total invoice PI / qty STT (qty fisik diterima)
```

Contoh kasus PMD: GKP-IR 10.426 Kg fisik diterima di STT, PI total Rp 86.411.520 (10.386 Kg × 8.100 + 10.386 × 220 refaksi). Sebelum fix: stockMovement @ Rp 8.096/Kg (provisional STT). Setelah fix: stockMovement @ Rp 8.288/Kg (landed = 86.411.520 / 10.426).

### Implementation

- **Backend** (`purchaseInvoiceSubmit.ts`):
  - Hapus posting variance ke 5.11. Delta `effectiveAmount − provisionalTotal` di-DR ke akun Persediaan (per-item account kalau ada, fallback ke 1.4.0).
  - Negative delta otomatis ter-normalisasi ke credit side.
  - Update `stockMovement.unit_cost` dan `total_value` di akhir transaction (sumber kebenaran untuk batch picker).
  - Recalc `inventory_items.averageCost` proporsional: `(stok × avgLama + delta) / stok` dibulatkan 2 desimal.
- **Frontend**: tidak ada perubahan UI — batch picker, modal sales, dan PDF otomatis pakai unit_cost terbaru.

### Migration

Tidak ada perubahan schema. PI lama yang sudah Submitted tidak ditarik ulang (data historis tetap apa adanya). Untuk STT yang menunggu PI (status Submitted, invoice_id null), submit PI baru akan otomatis pakai logic landed cost.

---

## [3.1.0] - 2026-05-20

### Modul Produksi — Loaded HPP & Traceability
- **Phase 1**: master Standar Biaya Produksi (per kategori cost: listrik, buruh, kirim, dll) — rate Rp/Kg input atau output. Tidak posting GL, snapshot dipakai oleh production run untuk hitung HPP loaded.
- **Phase 2**: batch picker untuk bahan baku input produksi — pilih batch tertentu dari inbound stock movement, lock COGS ke harga batch (bukan WAC), simpan `sourceMovementId` + `batchUnitCost` snapshot.
- **Phase 3**: cost components per run + auto-calc HPP loaded = (material + cost input side + cost output side − by-product NRV) / qty main output. Optional override manual. Persistent `production_runs.computedHpp` + `unitCostLoaded` di output stockMovement.
- **Phase 5**: batch picker meluas — SalesInvoice (default WAC fallback, opsional specific identification), StockTransfer (lock cost dari batch source), StockMovement adjustment Out. Schema baru `stock_movements.source_movement_id` (universal back-link).
- **Phase 6**: laporan **Profitability per SKU** (Material WAC vs Loaded HPP margin side-by-side + coverage %), drawer invoice menampilkan loaded vs material margin.
- **Master Proses Produksi**: list proses (Drying, Huller, Polishing, Packing, dll) sebagai multiselect chip di production modal — traceability murni, tidak posting GL.
- **PDF Production Run**: layout A4 dengan header company, input/output/byproduct table (dengan batch ref), komponen biaya, HPP loaded breakdown, signature 3 kolom (Staff/Supervisor/Manajer).
- **Cost standard per gudang**: rate bisa di-scope per gudang (mis. Listrik Mesin Giling hanya muncul di gudang GILING, Polisher hanya di POLES).
- **HPP main output optional**: kalau staff biarkan kosong, server auto-fill dari loaded HPP yang terhitung.
- **Dedup cost standard di modal**: standar yang sudah dipakai di baris lain (di sisi yang sama) disembunyikan dari dropdown baris berikutnya.

### Aset Tetap — Import Massal + Lifecycle Lengkap
- **Import 79 aset PMD** via script `scripts/import-fixed-assets.cjs` (Tanah, Bangunan, Mesin, Peralatan) dengan opening accumulated depreciation per kategori (snapshot per Mei 2026), generate 4.864 jadwal depresiasi (mulai Juni 2026 → akhir umur 2043).
- **Opening Balance JE** via `scripts/post-fa-opening-je.cjs`: DR akun aset (1.6.x) Rp 16.359M / CR akm penyusutan (1.7.x) Rp 5.040M + ekuitas saldo awal (3.1) Rp 11.319M. Sebelum ini, rasio keuangan ngaco karena aset tetap belum masuk neraca.
- **Bulk depreciation posting**: tombol "Posting Bulanan" di halaman Aset Tetap — 1 klik post 77 JE depresiasi sekaligus per bulan (vs 77 klik manual). Preview modal: count, total Rp, breakdown per kategori. Idempotent (entry sudah-post di-skip).
- **Confirm dialog single posting**: tombol "Posting" per entry sekarang buka modal konfirmasi dengan detail (asset, periode, jumlah, JE yg akan dibuat) supaya tidak ke-klik tidak sengaja.
- **Edit metadata aset**: tombol pencil per row, edit name/category/description. Field nominal (cost, masa manfaat, akun) immutable supaya JE historis tetap konsisten.
- **Export CSV** semua aset tetap dengan label akun lengkap.
- **Import CSV** dengan dropzone, preview validasi per-row (akun unknown / nominal invalid → ditandai merah), max 500 baris/import, auto-generate jadwal depresiasi. Tidak auto-post opening JE (manual via script).

### Dashboard Enrichment
- **Section baru "Aset"** di Dashboard utama (Admin/Accountant/Viewer) — 4 widget: KPI (count/cost/akumulasi/nilai buku), distribusi per kategori (pie chart), penyusutan due bulan ini + 5 upcoming, top 10 aset by nilai buku.
- **Widget Profitability per SKU** di section Sales — table top 10 SKU dengan margin Material vs Loaded side-by-side + coverage % (% line yang link ke batch).
- **Widget Production Deep Dive** di section Produksi — 4 mini-KPI (run periode, total input/output, avg loaded HPP per Kg), yield trend line chart, top input/output bars, best/worst yield rank, loaded HPP breakdown.
- **Endpoint backend**: `/api/dashboard/fixed-assets` (comprehensive), extend `/api/inventory/dashboard/production` dengan `loadedHpp` block (per-product weighted avg HPP).
- 4 widget Aset share 1 fetch via TanStack Query (queryKey `dashboard-fixed-assets`).

### Stok Wajib via Surat Jalan / STT
- **Direct-sale invoice ditutup**: Sales Invoice dengan inventory line WAJIB link ke DeliveryOrder yang sudah submit. Stok keluar hanya via DO. Invoice = tagihan saja, tidak gerakkan stok.
- **Direct-purchase invoice ditutup**: Purchase Invoice dengan inventory line WAJIB link ke STT/BPB yang sudah submit. Stok masuk hanya via STT. Mirror dari sales.
- Frontend warning banner merah di SalesInvoiceModal & PurchaseInvoiceModal dengan list item yang masih orphan + petunjuk solusi.
- Service items / line akun bebas (tanpa inventoryItemId) **tetap bisa** direct via invoice.
- Backward compat: existing direct-sale/direct-purchase invoices tetap valid, cancel/payment workflow normal. Hanya CREATE baru yang di-block.

### Buku Besar (General Ledger) — Pagination
- Footer paginasi: First / Prev / Next / Last + selector per-halaman (25/50/100/200) + info "Menampilkan X–Y dari Z jurnal".
- Filter (search + hideCancelled) sekarang **server-side** supaya konsisten antar halaman (sebelumnya cuma filter 50 hasil pertama).
- Auto-reset ke page 1 saat filter berubah, indikator "memuat ulang…" saat ganti page, `placeholderData(prev)` untuk transisi mulus.

### VersionWatcher (Auto-Reload)
- Setiap deploy baru: VersionWatcher di-mount global, polling `/api/version` setiap 2 menit + sekali setiap tab kembali fokus. Versi berubah → toast persistent "Versi terbaru tersedia — Muat Ulang".
- `index.html` di-serve dengan `Cache-Control: no-store`, `/assets/*` immutable 1 tahun (Vite content-hash). Tidak perlu Ctrl-Shift-R manual lagi.

### Bug Fixes Penting
- **"Data duplikat terdeteksi" saat reuse DO/STT setelah invoice cancel**: invoice cancellation sekarang clear `delivery_order_item_id` / `goods_receipt_item_id` di sales_invoice_items / purchase_invoice_items (kolom `@unique` constraint). Plus backfill 1 record orphan SI-202605-0066.
- **DO pending tidak refresh setelah cancel invoice**: frontend invalidate cache `delivery-orders`, `delivery-orders-pending`, `stock-movements`, `journals`, `payments`, `dashboard-metrics`, `aging-summary` saat cancel.
- **Batch picker overshoot stok**: FIFO auto-absorb konsumsi legacy outbound (sales/transfer pre-Phase 5) supaya list batch di picker tidak melebihi stok gudang sebenarnya. GKP-IR yang dulu muncul 65+ batch sekarang muncul 1 batch sesuai stok real.
- **List Pelanggan/Vendor**: nama panjang dan label "Pelanggan/Vendor" tabrakan/overlay (h3 inline-flex → flex; nama panjang truncate dengan ellipsis; badge shrink-0).
- **Rasio Keuangan dashboard**: setelah opening balance JE Aset Tetap, Total Aset naik dari Rp 4.59M → Rp 15.91M, Current Ratio 0.15x → 0.50x, D/A 6.87x → 1.98x.

### Schema Migrations
- `20260518_add_production_loaded_hpp_phase1.sql`: tabel `production_cost_standards`, `production_run_costs`; kolom totals + `computedHpp` di `production_runs`, `sourceMovementId` + `batchUnitCost` + `nrvUnitValue` di `production_run_items`, `unitCostLoaded` di `stock_movements`.
- `20260518b_stock_movement_batch_source.sql`: `source_movement_id` universal di `stock_movements`, `sales_invoice_items`, `stock_transfer_items` + `unit_cost_loaded` di `sales_invoice_items`.
- `20260518c_cost_standard_warehouse_scope.sql`: `warehouse_id` di `production_cost_standards`.
- `20260519_add_production_processes.sql`: tabel `production_processes` + junction `production_run_processes`.

## [3.0.0] - 2026-05-10

### Rebrand
- **Nama aplikasi**: `Simple ERP` → **`ERP PMD`** (PWA manifest, browser title, login screen, semua surface internal)
- **Domain**: `keuangan.panganmasadepan.com` → **`erp.panganmasadepan.com`** (hard cutover, nginx 301 redirect siap kalau DNS lama dibuka kembali)
- **Repo**: split menjadi `simple-erp-pmd` (PMD-specific origin) + `simple-erp` (generic upstream, cherry-pick untuk fitur non-PMD)

### Pipeline Penjualan Lengkap (Inquiry → Penawaran → Invoice)
- **Modul Inquiry**: catat pertanyaan calon customer / prospect sebelum penawaran resmi
  - Workflow: Baru → Diproses → Dikonversi / Hilang / Ditutup
  - Channel tracking: WhatsApp, Telepon, Email, Walk-in, Referral, Lainnya
  - Hybrid items: free-text textarea atau structured rows (qty/unit/est. harga)
  - Auto-create Party saat conversion (prospect → customer)
- **Public Inquiry Form** (`/tanya`): customer/prospect isi sendiri, langsung masuk pipeline
  - Mobile-first branded form dengan logo perusahaan
  - Anti-spam: honeypot field + rate limit 5/IP/jam
  - Channel auto-detect dari `?src=` URL parameter
- **QR Code Generator**: header Inquiry punya tombol "QR Form"
  - Generate QR (warna abu-abu) + tracking sumber (qr-cetak/qr-toko/qr-kartu-nama/wa/ig/ref)
  - Aksi: copy link, download PNG, share via WA, native Web Share API
- **Modul Penawaran (Quotations)**: full lifecycle dengan conversion ke Sales Invoice
  - Status: Draft → Sent → Accepted/Rejected/Expired/Cancelled
  - Auto-expire sweeper tiap 1 jam + notifikasi 3 hari sebelum expiry
  - PDF "PENAWARAN HARGA" branded dengan validity box, status badge, signatures
  - Excel export per-item

### UI/UX
- **Sidebar Modular** (9 modul): Penjualan, Pembelian, Stok & Produksi, Bank & Kas, Akuntansi, Laporan, Master Data, Sistem — dengan submenu collapse/expand, persist state di localStorage, auto-expand modul aktif
- **Theme Toggle** dipindah dari sidebar ke header (samping Search): cycle Light → Dark → System
- **Sticky table thead** + body scroll-lock pada modal
- **ConfirmDialog adoption**: replace 3 native `confirm()` (PurchaseInvoice edit, Approval delete, FixedAsset dispose) dengan modal yang konsisten, dark-mode-safe, focus-trap
- **Browser tab title** auto-update per route ("Penawaran — ERP PMD")
- **Industrial Professional theme**: OKLCH steel blue, Inter + Plus Jakarta Sans
- Copyright "© Arah Karya by Yayang Setya Nugroho" di footer sidebar

### Invoice Enhancements
- **Excel Export per-item** (Sales & Purchase): 1 invoice dengan N item → N baris di Excel, plus kolom kualitas/timbangan untuk Purchase
- **No. Referensi PO/Penawaran** (`customerRefNo`) di Sales Invoice — tampil di modal create/edit, drawer detail, dan PDF
- **Total Qty** di Sales/Purchase Modal & Drawer — agregat per unit (mis. "5,000 Kg · 50 Sak"); Purchase prefer `timbanganDiterima`
- **grandTotal >= 0**: invoice gratis (sample/replacement/100% diskon) sekarang bisa di-submit
- **Vendor Deposit Refund**: endpoint baru `/vendor-deposits/:id/refund` untuk offset hutang FIFO + refund kas (mirror Customer pattern)

### Security & Reliability
- Magic-byte MIME validation pada upload attachment (cegah file disamarkan via Content-Type spoof)
- Token blacklist purge cron (1 jam interval)
- `apiRateLimit` dipindah sebelum auth routes (rate-limit `/api/auth/me`, `/logout`)
- `Content-Disposition` filename di-encode RFC 5987 (cegah header injection)
- `cogsBackfill` ditambah role guard (Admin/Accountant)
- PATCH method ditambah ke audit trail
- ALE.referenceType bug fix: stock movement adjustment sekarang correctly tagged 'JournalEntry' (sebelumnya 'StockMovement' menyebabkan false-positive di health check)

### Performance
- Composite indexes: `accounting_ledger_entries (account_id, date) WHERE NOT is_cancelled`, `stock_movements (item_id, date)`, `(reference_type, reference_id)`
- Recalculate accounts.balance dari JI source-of-truth (eliminate drift)

### Generalize (Multi-vertical)
- Terminology hook: vendor/customer label configurable per industri
- Repo dual-track: `simple-erp` generic untuk semua industri, `simple-erp-pmd` PMD-specific overrides

### Bug Fixes
- Cancel reversal pattern: journals/customerDeposits/vendorDeposits sekarang soft-cancel originals (`is_cancelled=true`) bukan create `[BATAL]` reversal entries
- Vendor Deposit list: `remaining = amount - applied - refunded` (sebelumnya tidak kurangi refunded)
- Inventory Dashboard: `inventoryValue` pakai SUM(accounts.balance) WHERE 1.4.* (bukan stock_movements cumulative)
- Health Check: ALE↔JI sync, account drift, orphan ALE, stock mismatch — semua 0 issues
- Data fixes: Supari/Suparih typo merge, Bulog opening balance reconcile, Dion vendor deposit tracking sync, Gunawan→Panut deposit transfer

## [2.4.0] - 2026-04-05

### Fitur Baru
- **Dashboard Pelanggan & Vendor** — KPI (piutang, hutang, deposit), aging analysis piutang/hutang, top 10 pelanggan/vendor, invoice jatuh tempo, pembayaran terakhir
- **Dashboard Proses Produksi** — KPI produksi, volume input/output/samping, tren rendemen, top bahan input/output, rendemen tertinggi/terendah, dengan filter periode dan produk
- **Edit Proses Produksi** — Edit data produksi yang sudah dibuat (reverse stok & jurnal lama, buat baru)
- **Detail Proses Produksi** — Drawer detail dengan ringkasan biaya, jurnal GL, dan tombol pembatalan

### Perbaikan
- Fix GL posting invoice jasa: item bertipe service tanpa serviceItemId sekarang otomatis masuk ke akun 4.2 (Pendapatan Jasa) bukan 4.1 (Penjualan)
- Fix data 10 invoice item jasa yang salah masuk akun 4.1, dipindahkan ke 4.2 beserta jurnal dan ledger
- Fix rendemen produksi multi-input: kalkulasi total output / total input, produk samping tidak dihitung
- Fix duplikasi journal entry number saat edit produksi berulang (suffix -R, -R2, -R3, dst)
- Fix mobile overflow text/nilai keluar dari card container

## [2.3.0] - 2026-04-04

### Fitur Baru
- **PWA (Progressive Web App)** — Aplikasi bisa diinstall seperti native app di HP/desktop melalui browser
- **Buku Besar (General Ledger)** — Laporan mutasi per akun dengan filter tanggal dan export Excel
- **Pengaturan Akun Sistem** — Halaman pengaturan yang lebih lengkap dengan grouping, search, dan status konfigurasi
- **Stock Opname** — Fitur penyesuaian stok fisik dengan GL posting otomatis
- **Weighted Average Costing** — Metode HPP rata-rata tertimbang untuk perhitungan COGS
- **PPh Per-Item** — Pajak penghasilan per item di invoice penjualan, tampil di detail dan PDF
- **Upload Bukti Transfer** — Lampiran bukti transfer untuk semua transaksi kas/bank
- **Per-Item Inventory GL** — Posting GL persediaan per item (bukan bulk)
- **Opening Balance Deposits** — Saldo awal deposit pelanggan/supplier
- **Edit Stock Movement** — Edit pergerakan stok yang sudah diinput

### Perbaikan
- HPP penjualan & produksi posting ke akun 5.1 (HPP Beras), bukan parent 5
- Payment modal menampilkan saldo awal (non-invoice) outstanding
- GL reversal menggunakan metode swap pada semua flow pembatalan
- Produksi GL journal balanced (DR output = CR input)
- Dashboard dark mode chart dan nullish coalescing fix
- Tax report, security audit, dan database indexes
- COA menampilkan indikator D/K (Debit/Kredit)
- Report number overflow fix
- Docker build compatibility untuk PWA + Vite

## [2.2.0] - 2026-04-02

### Fitur Baru
- Sistem keuangan double-entry bookkeeping
- Modul penjualan, pembelian, pembayaran
- Chart of Accounts (COA) dengan tree structure
- Jurnal umum manual
- Laporan keuangan: Neraca, Laba Rugi, Arus Kas
- Manajemen inventori dengan produksi (gabah → beras)
- Multi-user dengan role: Admin, Accountant, Viewer
- Export PDF dan Excel
- Dark mode
- Docker Compose deployment

Toolset **penjualan** memungkinkan AIRA membaca dan mengoperasikan siklus penjualan Entaris: Inquiry (permintaan prospek), Penawaran (Quotation), Pesanan Penjualan (Sales Order/SO), Surat Jalan (Delivery Order/DO) termasuk Surat Jalan Sementara (SJS), Invoice Penjualan, Retur Penjualan, dan Uang Muka Pelanggan. Hampir semua tool baca (daftar, detail, ringkasan) aman dipanggil otomatis; tool tulis dipisah menurut dampaknya: dokumen non-posting (draft/status) versus tool yang memposting stok atau jurnal (invoice, DO, retur, uang muka), yang selalu berisiko `critical` atau butuh konfirmasi. Master item jasa (`svc_*`) tercatat di toolset master-data tetapi dipakai pada baris invoice.

### Alur bisnis

Rantai dokumen (setiap langkah boleh dilewati; Invoice bisa dibuat langsung tanpa SO/DO):

```
Inquiry (INQ) -> Penawaran (QO) -> [Sales Order (PSN)] -> Surat Jalan (DO) -> Invoice Penjualan (SI) -> Pembayaran (modul Bank & Kas)
                                        \-> SJS (Surat Jalan Sementara) -> ditautkan ke DO resmi
Invoice -> Retur Penjualan (RN)          Uang Muka Pelanggan -> dipakai/di-offset/di-refund ke Invoice
```

Status per dokumen:

- **Inquiry**: `Baru`, `Diproses`, `Dikonversi` (terkunci, hanya lewat `inq_link`), `Hilang` (wajib alasan >= 5 karakter), `Ditutup`. Hanya inquiry yang belum Dikonversi boleh dihapus.
- **Penawaran**: `Draft` -> `Sent` (`quot_send`, butuh minimal 1 item dan `validUntil` belum lewat) -> `Accepted` (`quot_accept`) atau `Rejected` (`quot_reject`, alasan wajib). Penawaran `Sent` yang melewati `validUntil` otomatis menjadi `Expired` (job harian). `Cancelled` lewat `quot_cancel` (capability `doc.cancel`; tidak bisa bila sudah dikonversi ke invoice). Hanya `Draft` yang bisa diedit/dihapus. Konversi: `quot_convert_payload` (hanya Accepted) -> `si_create` -> `quot_link`. Catatan: konversi penawaran menuju INVOICE, bukan SO (SO hanya menyimpan `quotationId` sebagai rujukan).
- **Sales Order**: `Draft` -> `Submitted` (`so_submit`) -> `PartiallyDelivered` -> `FullyDelivered` (dihitung otomatis dari baris DO yang tertaut) atau `Cancelled`. SO hanya boleh diedit saat Draft. Over-delivery (kirim melebihi sisa) diperbolehkan dan hanya dicatat log.
- **Surat Jalan (DO)**: dibuat `Submitted` dan langsung memotong stok. "Belum ditagih" = `Submitted` dengan `invoiceId` kosong; "Invoiced" = `Submitted` dengan `invoiceId` terisi; `Cancelled`. Filter status `Invoiced` pada `do_list` hanyalah turunan, bukan nilai kolom.
- **SJS**: `Open` (Terbuka) -> `Linked` (ditautkan ke DO resmi) atau `Cancelled`. Hanya dokumen kirim sementara; tidak menyentuh stok/GL/WAC dan tidak bisa di-invoice.
- **Invoice Penjualan**: tidak ada draft pada alur API — `si_create` langsung memposting; status awal `Submitted` (`Paid` bila total Rp 0), lalu `PartiallyPaid`/`Paid`/`Overdue` mengikuti pembayaran, atau `Cancelled`.
- **Retur**: `Submitted` atau `Cancelled` (Draft ada di enum tetapi tidak dipakai alur normal).
- **Uang muka pelanggan**: dicatat sebagai Payment bertipe `CustomerDeposit` (dibuat lewat modul Pembayaran, bukan toolset ini). Status turunan `Active`, `PartiallyUsed`, `FullyUsed` dihitung dari jumlah terpakai/refund; status dokumen `Submitted`/`Cancelled`.

### Aturan posting

Hanya langkah berikut yang menyentuh stok/GL; semuanya dikerjakan dalam satu transaksi database dan harus seimbang:

| Aksi | Stok | Jurnal GL |
|---|---|---|
| Inquiry, Penawaran, SO (semua status), SJS | Tidak ada | Tidak ada |
| `do_create`, `so_generate_do` | Keluar per item/gudang, unitCost = WAC saat kirim (dikunci) | Tidak ada (HPP menunggu invoice) |
| `do_update` | Balik pergerakan lama + keluar baru | Tidak ada |
| `do_cancel` | Stok dikembalikan | Tidak ada |
| `do_from_invoice` | Tidak ada (stok sudah dipotong invoice) | Tidak ada |
| `si_create` | Keluar untuk baris inventori (kecuali baris dari DO, yang memakai unitCost terkunci di DO) | DR 1.2.1 Piutang Usaha (grand total) [+ DR 1.5.4 PPh bila pphPct>0] / CR akun pendapatan per baris (4.1 Penjualan, 4.2 Pendapatan Jasa, atau akun item jasa/kustom) + CR PPN Keluaran; lalu JV-COGS: DR 5.1 HPP (fallback 5) / CR Persediaan |
| `si_cancel` | Stok dikembalikan | Semua jurnal invoice + HPP dibalik |
| `sret_create` | Masuk lagi untuk baris `restock=true` | JV-RN: DR 4.3 Retur Penjualan (+ PPN Keluaran) / CR 1.2.1 Piutang (sebesar yang mengurangi outstanding) dan CR 2.1.2 Uang Muka Pelanggan (kelebihan, jadi kredit pelanggan); JV-COGS-RN: DR Persediaan / CR HPP pada biaya asli |
| `cdep_apply` | Tidak ada | DR 2.1.2 Uang Muka Pelanggan / CR 1.2.1 Piutang Usaha |
| `cdep_refund` | Tidak ada | Offset: DR 2.1.2 / CR 1.2.1 (FIFO ke faktur terlama); refund kas: DR 2.1.2 / CR Kas/Bank (1.1.x) |
| `cdep_cancel`, `cdep_apply_cancel` | Tidak ada | Jurnal asal dibalik (soft-cancel ledger, bukan jurnal pembalik) |

Biaya (HPP) diambil dengan prioritas: unitCost pergerakan stok DO -> `unitCostLoaded` baris invoice -> `averageCost` item (WAC). Pembayaran invoice ada di toolset kas-bank (`pay_record`: DR Kas/Bank / CR Piutang).

### Persetujuan

- **Retur Penjualan** (`sret_create`): bila role pemanggil tidak punya capability `approval.bypass` (default hanya Admin), dokumen TIDAK dibuat; payload masuk antrian `ApprovalRequest` tipe `SalesReturn` (HTTP 202) dan dieksekusi saat disetujui (aktor = pengaju). Admin/role bypass langsung memposting (201).
- **Surat Jalan** (`do_create`): antrian approval tipe `DeliveryOrder` hanya muncul pada kasus stok minus: `allowNegativeStock=true` tanpa capability `inventory.negative_stock`. Perhatikan: `so_generate_do` dan `do_update` TIDAK mengantrikan approval — keduanya menolak dengan 403 bila bypass stok minus diminta tanpa capability.
- **Pembatalan** memakai capability `doc.cancel` (default hanya Admin): `quot_cancel`, `do_cancel`, `si_cancel`, `sret_cancel`, `cdep_apply_cancel`, `tdn_cancel`, `svc_delete`. Pengecualian yang tidak ber-capability: `so_cancel` dan `cdep_cancel` (hanya izin edit modul) — pertimbangkan ini saat mengatur tier tool.
- Keputusan approval dilakukan di toolset persetujuan; tool penjualan hanya mengantrikan.

### Jebakan umum

1. **`inq_convert_payload` bermutasi walau GET**: bila inquiry berupa prospek tanpa pelanggan, endpoint membuat master Pelanggan baru dan mengisi `partyId` inquiry. Diklasifikasikan `write`. Sebaliknya `quot_convert_payload` murni baca.
2. **Invoice tidak punya draft**: `si_create` = posting langsung (jurnal + stok + HPP). Jangan dipanggil untuk "simpan dulu". `si_update` hanya mengubah catatan/jatuh tempo/syarat; nilai tidak bisa diedit — koreksi = `si_cancel` lalu buat ulang.
3. **Urutan pembatalan**: Pembayaran/aplikasi uang muka -> Invoice -> DO -> SO. `si_cancel` ditolak bila ada pembayaran teralokasi atau aplikasi uang muka aktif; `do_cancel` ditolak bila DO sudah masuk invoice; `so_cancel` ditolak bila masih ada DO aktif; `tdn_cancel` ditolak bila SJS sudah Linked.
4. **Stok minus**: `allowNegativeStock` tidak otomatis diizinkan; butuh capability `inventory.negative_stock`. Pada `do_create` tanpa capability hasilnya 202 (antrian approval), pada `so_generate_do`/`do_update`/invoice hasilnya error.
5. **Retur melebihi sisa**: qty retur dibatasi sisa baris invoice (`remaining` dari `sret_eligible`). Retur ke invoice Draft/Cancelled ditolak. Retur dengan kelebihan nilai menjadi kredit pelanggan (deposit) — jika kredit itu sudah dipakai, `sret_cancel` ditolak.
6. **Baris invoice dari DO**: baris dengan `deliveryOrderItemId` tidak memotong stok lagi dan memakai unitCost terkunci DO; DO yang sudah Cancelled atau sudah di invoice lain ditolak.
7. **`do_list` status**: gunakan `Submitted` untuk "belum ditagih", `Invoiced` untuk "sudah ditagih". `do_pending` mewajibkan `partyId`.
8. **Paging opsional**: `cdep_list` dan `svc_list` berperilaku berbeda dengan/tanpa `page` (tanpa page = semua baris `{data}` tanpa total).
9. **Tahun fiskal**: pembuatan dokumen bernomor (QO, PSN, INQ, DO, SI, RN, JV) butuh tahun fiskal terbuka pada tanggal dokumen.
10. **Tarif pajak**: PPN (`taxPct`) bisa per baris dan per dokumen; PPh per baris (`pphPct`) didebit ke 1.5.4 bila akun itu ada di COA (jika tidak ada, baris PPh dilewati tanpa error).

### Peta istilah

| Istilah bisnis | Kode / field / status |
|---|---|
| Inquiry, permintaan harga, prospek | `Inquiry`, `inquiryNumber` (INQ), `prospectName`, status `Baru/Diproses/Dikonversi/Hilang/Ditutup` |
| Penawaran, Quotation (QO) | `Quotation`, `quotationNumber`, `validUntil`, `Draft/Sent/Accepted/Rejected/Expired/Cancelled` |
| Pesanan Penjualan, SO (PSN) | `SalesOrder`, `soNumber`, `deliveredQty`, `customerRefNo` (No. PO pelanggan) |
| Surat Jalan, SJ, DO | `DeliveryOrder`, `doNumber`, `invoiceId` (terisi = sudah ditagih), `nomorMobil`, `driverName` |
| Surat Jalan Sementara, SJS | `TemporaryDeliveryNote`, `Open/Linked/Cancelled` |
| Invoice Penjualan, faktur (SI) | `SalesInvoice`, `invoiceNumber`, `outstanding`, `grandTotal`, `Submitted/PartiallyPaid/Paid/Overdue/Cancelled` |
| Retur Penjualan, RN | `SalesReturn`, `returnNumber`, `restock`, jurnal `JV-RN-...` |
| Uang muka pelanggan, DP | Payment `paymentType=CustomerDeposit`, akun 2.1.2, `refundedAmount`, `CustomerDepositApplication` |
| Piutang usaha | akun 1.2.1 (`AR`) |
| Penjualan / Pendapatan jasa | akun 4.1 / 4.2 |
| HPP, COGS | akun 5.1 (fallback 5); biaya dari WAC/unitCost terkunci |
| Retur Penjualan (akun) | akun 4.3 |
| PPN Keluaran / PPh dibayar dimuka | `TAX_OUTPUT` / akun 1.5.4 |
| WAC | rata-rata tertimbang biaya item (`averageCost`) |
| Item jasa | `ServiceItem` (kode, tarif default, akun pendapatan) |
| Stok minus | capability `inventory.negative_stock`, flag `allowNegativeStock` |

# Glosarium Entaris

Istilah bisnis (Indonesia) dan padanan teknisnya di kode/tool. Lihat juga panduan per toolset di [INDEX.md](INDEX.md).

## Dokumen & alur

| Istilah | Kepanjangan / arti | Padanan teknis |
|---|---|---|
| **Quotation / Penawaran** | Penawaran harga ke pelanggan, tidak mengikat, tanpa GL | `Quotation`, toolset penjualan |
| **Inquiry** | Permintaan calon pelanggan (termasuk dari formulir publik) | `Inquiry` |
| **SO** | Sales Order / Pesanan Penjualan — komitmen jual, tanpa GL/stok | `SalesOrder` |
| **DO / SJ** | Delivery Order / **Surat Jalan** — pengiriman; stok keluar + HPP (COGS) | `DeliveryOrder` |
| **TDN / Nota Sementara** | Temporary Delivery Note — catatan pengiriman sementara sebelum SJ resmi | `TemporaryDeliveryNote` |
| **SI / Invoice Penjualan** | Tagihan ke pelanggan; DR Piutang 1.2.1 / CR Penjualan 4.1 | `SalesInvoice` |
| **Retur Penjualan** | Pengembalian barang dari pelanggan (dapat restock) | `SalesReturn` |
| **PO** | Purchase Order / Pesanan Pembelian — perencanaan, tanpa GL/stok | `PurchaseOrder` |
| **STT / BPB** | **Surat Tanda Terima / Bukti Penerimaan Barang** (Goods Receipt): stok masuk + akrual hutang (DR Persediaan 1.4.0 / CR Hutang Belum Tagih 2.1.5) | `GoodsReceipt` |
| **PI / Invoice Pembelian** | Faktur pemasok: harga aktual, selisih harga (5.11), hutang riil (2.1.1) | `PurchaseInvoice` |
| **Uang muka** | Pembayaran di muka. Pelanggan: `CustomerDeposit`; vendor: `VendorDeposit` (akun 1.3); karyawan: akun 1.5.6 | deposit |
| **Pembayaran / Payment** | Penerimaan (Receive: DR Kas/Bank / CR Piutang) atau pembayaran (Pay: DR Hutang / CR Kas/Bank) | `Payment` |
| **Pengajuan Pembayaran** | Permintaan pembayaran internal (karyawan/vendor) yang diverifikasi atasan -> Keuangan -> dibayar | `PaymentRequest`, `/payment-requests` |
| **Pertanggungjawaban uang muka** | Penyelesaian (settlement) realisasi biaya vs uang muka | `PaymentRequest settlement` |
| **Tagihan EAM** | Antrian tagihan aset (pajak kendaraan, servis, MR sparepart) yang diposting lewat Pengajuan Pembayaran | `/payment-requests/eam` |
| **Stok Opname** | Perhitungan fisik stok; finalisasi menyesuaikan stok & GL | `StockOpname` |
| **Transfer Stok** | Pemindahan antar gudang | `StockTransfer` |
| **DPR** | Draft Production Run (`DPR-YYYYMM-NNNN`) — input produksi selalu draft dulu | `ProductionRunDraft` |
| **MR** | Material Request / Permintaan Barang (EAM) | `ga_material_request` |
| **WO** | Work Order maintenance | `ga_maintenance` |
| **EAM / GA** | Enterprise Asset Management / General Affairs (modul `ga_*`) | `/api/ga/*` |

## Akuntansi

| Istilah | Arti |
|---|---|
| **COA** | Chart of Accounts / Bagan Akun |
| **JV** | Journal Voucher / jurnal; manual harus seimbang (debit = kredit) |
| **GL** | General Ledger / Buku Besar |
| **DR / CR** | Debit / Kredit |
| **Piutang (1.2.1) / Hutang Usaha (2.1.1)** | AR / AP dagang |
| **Hutang Belum Tagih (2.1.5)** | Akrual penerimaan barang yang belum difakturkan |
| **WAC / HPP** | Weighted Average Cost (biaya rata-rata tertimbang) / Harga Pokok Penjualan (COGS, akun 5) |
| **Selisih Harga Pembelian (5.11)** | Variance harga STT (provisional) vs PI (aktual) |
| **Tahun buku** | Fiscal year; penutupan memindah laba ke Laba Ditahan (3.2) |
| **Rekonsiliasi bank** | Mencocokkan mutasi bank dengan GL |

## Persetujuan & akses

| Istilah | Arti |
|---|---|
| **Approval gate / `needsApproval`** | Role tanpa capability `approval.bypass` (default hanya Admin) tidak langsung membuat dokumen; payload disimpan di `ApprovalRequest` dan dieksekusi saat disetujui |
| **Capability** | Hak sensitif di luar view/edit: `doc.cancel`, `approval.decide`, `approval.bypass`, `approval.view_all`, `inventory.negative_stock`, `rbac.manage` |
| **RBAC modul** | Matriks role x modul -> `view`/`edit` (`server/src/constants/modules.ts`) |
| **Role bawaan** | Admin (super-admin), Accountant, StaffProduksi, Viewer |
| **Draft** | Dokumen yang belum berefek ke GL/stok |
| **Posting** | Saat dokumen menghasilkan jurnal/mutasi stok |

## Agentic

| Istilah | Arti |
|---|---|
| **AIRA** | Agen AI Entaris |
| **Tool** | Satu fungsi ERP yang dapat dipanggil agen (entri registry) |
| **Toolset** | Kelompok tool (satu endpoint MCP per toolset) |
| **Tier** | read=Auto, write=Draft/Approve, critical=Wajib-Approve |
| **Denylist** | Endpoint yang tidak boleh menjadi tool ([DENYLIST.md](DENYLIST.md)) |
| **MCP** | Model Context Protocol — cara engine AIRA memanggil tool Entaris |
| **Actor assertion** | Pernyataan identitas bertanda tangan HMAC yang menyertai tiap panggilan ([ARSITEKTUR-MCP.md](ARSITEKTUR-MCP.md)) |
| **AIRA registry** | Daftar orang yang boleh berbicara dengan AIRA + peran/domain/flag mereka |

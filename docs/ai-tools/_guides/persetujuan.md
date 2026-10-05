Toolset Persetujuan memberi AIRA akses ke antrian approval Entaris: melihat pengajuan yang menunggu keputusan, memeriksa perbandingan sebelum/sesudah, memutuskan (setujui, tolak, minta revisi), mengajukan ulang setelah revisi, dan mengelola aturan approval. Persetujuan di sini adalah gerbang "approve-before-effect": dokumen penting BELUM dibuat sampai disetujui, sehingga keputusan menyetujui langsung memicu posting stok dan jurnal. Karena itu tool keputusan bertier critical dan hanya untuk pemegang capability `approval.decide`. Persetujuan Pengajuan Pembayaran (atasan, Keuangan, direktur) punya alur sendiri di toolset Pengajuan Pembayaran.

### Alur bisnis

**Siapa yang digerbang.** `needsApproval(role)` bernilai true bagi role TANPA capability `approval.bypass` (default hanya Admin yang punya). Jadi saat Accountant/StaffProduksi membuat dokumen berikut, dokumennya tidak dibuat; payload disimpan di `ApprovalRequest` berstatus `Pending`:

| documentType | Dokumen | Dieksekusi saat approve |
|--------------|---------|-------------------------|
| `PurchaseInvoice` | Invoice Pembelian | Faktur dibuat + posting GL (dan stok bila standalone) |
| `ProductionRun` | Data Produksi | Produksi diposting (stok bahan/hasil, WAC) |
| `SalesReturn` | Retur Penjualan | Retur diposting (stok masuk, pembalikan penjualan/HPP) |
| `DeliveryOrder` | Surat Jalan | DO dibuat (stok keluar + HPP) |
| `PurchaseOrder` | PO (tahap 2) | Status Draf menjadi Submitted, tanpa GL |
| `ProductionRunEdit` | Edit produksi yang sudah diposting | `editProductionRunInTx` |
| `PurchaseInvoiceRevisePrice` | Revisi harga invoice pembelian | `revisePurchaseInvoiceInTx` |

Dokumen dibuat dengan pengaju sebagai pembuatnya (audit menunjuk si penginput), bukan penyetuju.

**Status pengajuan (`ApprovalRequest.status`).**
`Pending` → `Approved` (dokumen dieksekusi), `Rejected` (final), atau `NeedsRevision` (bisa kembali ke `Pending` lewat `appr_resubmit`). Hanya pengajuan `Pending` yang bisa diputuskan; yang sudah diproses ditolak dengan "Pengajuan sudah diproses".

**Jalur keputusan (butuh capability `approval.decide`).**
1. `appr_requests_list` / `appr_request_get` untuk melihat antrian dan payload; `appr_request_context` untuk info pendukung (STT sumber, lampiran).
2. Untuk tipe edit, `appr_request_get` menyertakan `comparison` (sebelum/sesudah). Payload adalah body asli ditambah `_before` (snapshot untuk perbandingan, dibuang sebelum validasi).
3. `appr_approve` mengeksekusi dokumen; `appr_reject` menolak final; `appr_request_revision` meminta revisi (alasan WAJIB).
4. Pengaju memperbaiki lalu memanggil `appr_resubmit` (PUT; hanya `PurchaseInvoice` dan `ProductionRun`).

**Aturan approval (`ApprovalRule`).** `documentType` + `minAmount` + `requiredRole`. Dipakai oleh `appr_check` dan `appr_request_create` (jalur generik), serta tahap direktur Pengajuan Pembayaran (documentType `PaymentRequest`; aturan aktif dengan `minAmount` tertinggi yang ≤ total menang). Mengelola aturan butuh `approval.decide`.

**Penanda status dokumen.** `appr_pending` (documentType edit + documentId) menjawab apakah dokumen punya pengajuan edit Pending, dipakai untuk badge dan mengunci tombol edit. Hanya satu pengajuan Pending per target (409 bila ganda).

### Aturan posting

`appr_approve` sendiri tidak punya jurnal tetap; efeknya mengikuti dokumen yang dieksekusi:
- Invoice Pembelian dari STT: DR Hutang Belum Tagih 2.1.5 (+/- Selisih Harga Pembelian 5.11) / CR Hutang Usaha 2.1.1; stok tidak dibuat ulang. Standalone/legacy: DR Persediaan 1.4.0 / CR Hutang Usaha 2.1.1.
- Produksi: stok bahan keluar dan hasil masuk dengan WAC; tanpa jurnal penjualan.
- Retur penjualan dan Surat Jalan: pergerakan stok dengan HPP.
- PO, `appr_reject`, `appr_request_revision`, `appr_resubmit`, `appr_request_create`, dan semua tool aturan: tidak ada efek GL/stok.

Untuk produksi yang berasal dari draf (`production_run_drafts`): approve membuat run dan menandai draf Posted; reject atau minta-revisi mengembalikan draf ke Draft dengan catatan (`lastError`) dan pengajuan menjadi Rejected.

### Persetujuan

- Capability `approval.decide`: memutuskan dan mengelola aturan. `approval.view_all`: melihat seluruh antrian (tanpa itu hanya pengajuan milik sendiri; pengajuan orang lain terlihat 404). `approval.bypass`: lolos gerbang (dokumen dibuat langsung).
- Modul RBAC `approvals` (view/edit) menjadi syarat semua endpoint di mount ini. Akibatnya Viewer tidak bisa memanggil endpoint apa pun di sini.
- Menambah aksi finansial baru pada dokumen yang sudah ada harus melewati `needsApproval` dan tipe edit baru, bukan hanya `requireCap`.
- Tipe edit tidak bisa "Minta Edit"/resubmit; hanya `PurchaseInvoice` dan `ProductionRun` yang bisa diajukan ulang.
- Pengajuan test dari AI Router (`ai_tool:<nama>`) tidak bisa dieksekusi lewat approve ("Tipe dokumen tidak didukung").

### Jebakan umum

- **Approve = posting nyata.** Periksa `appr_request_get` (payload dan comparison) sebelum `appr_approve`; kegagalan eksekusi (stok kurang, periode tertutup) mengembalikan 400 dan pengajuan tetap Pending.
- **`appr_request_revision` pada produksi dari draf** menghasilkan status Rejected, bukan NeedsRevision, karena draf yang dikembalikan menjadi sumber perbaikan.
- **`appr_rule_update`** menyimpan semua field dari body; field yang tidak dikirim dapat menimpa nilai dengan kosong. Kirim lengkap.
- **`appr_request_create`** hanya membuat pengajuan jika ada aturan aktif yang cocok (jika tidak: `required:false`); ia tidak membawa payload dokumen. Jalur normal dibuat otomatis dari endpoint dokumen.
- **`GET /approvals/check`** hanya menjawab apakah aturan ada; gerbang sebenarnya untuk 4 tipe dokumen ditentukan role pengaju, bukan nominal.
- **Aturan approval adalah kontrol internal**; mengubahnya melonggarkan atau mengetatkan persetujuan semua dokumen/pengajuan berikutnya. Diklasifikasi critical.

### Peta istilah

| Istilah bisnis | Kode / field |
|----------------|--------------|
| Pengajuan approval | `ApprovalRequest` (`documentType`, `documentId`, `documentNumber`, `amount`, `payload`) |
| Menunggu persetujuan | status `Pending` |
| Disetujui / Ditolak | `Approved` / `Rejected` |
| Perlu revisi | `NeedsRevision` |
| Minta Edit | tipe `ProductionRunEdit`, `PurchaseInvoiceRevisePrice` |
| Perbandingan sebelum/sesudah | `comparison`, kunci `_before` pada payload |
| Aturan approval | `ApprovalRule` (`minAmount`, `requiredRole`, `isActive`) |
| Lewati antrian | capability `approval.bypass` |
| Lihat semua pengajuan | capability `approval.view_all` |
| Putuskan pengajuan | capability `approval.decide` |
| Draf produksi | `production_run_drafts`, `DPR-YYYYMM-NNNN` |
| STT / BPB | Surat Terima Timbang / Bukti Penerimaan Barang (`GoodsReceipt`) |

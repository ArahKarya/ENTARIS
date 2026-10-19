Toolset Pengajuan Pembayaran memungkinkan AIRA membantu seluruh siklus permintaan pembayaran internal: karyawan mengajukan reimburse, pembayaran vendor, uang muka, atau perjalanan dinas; atasan, Keuangan, dan direktur menyetujui; Keuangan membayar dari kas/bank; lalu uang muka dipertanggungjawabkan. Toolset ini juga memuat antrean Tagihan EAM (pajak kendaraan, servis, sparepart MR) yang diposting ke akuntansi oleh Keuangan, serta master Jenis Pengajuan. Tool yang membuat draf atau mengajukan bersifat draft-capable; tool keputusan, pembayaran, dan pembatalan bersifat critical karena menggerakkan uang dan jurnal.

### Alur bisnis

**Siklus pengajuan** (`PaymentRequest`, nomor `PP-…`):

```
DRAFT --submit--> SUBMITTED (atasan) --> PENDING_FINANCE --> [PENDING_DIRECTOR] --> APPROVED (Siap Dibayar) --pay--> PAID
          (pengaju tanpa atasan aktif: langsung PENDING_FINANCE)
Tiap tahap persetujuan bisa REJECT (REJECTED, final) atau RETURN (REVISION: pengaju edit lalu submit ulang)
Pengaju bisa CANCEL sebelum PAID (CANCELLED). Keuangan bisa cancel-payment (PAID -> APPROVED).
```

Siapa yang memutuskan per tahap:
- `SUBMITTED`: atasan langsung pengaju (snapshot `supervisorId`).
- `PENDING_FINANCE`: user dengan izin `payment_request` edit (Keuangan). Pada tahap ini Keuangan menetapkan akun biaya per baris (`payreq_set_accounts` atau `lineAccounts` saat approve). Saat Keuangan menyetujui, sistem mencari aturan approval aktif documentType `PaymentRequest` dengan `minAmount` tertinggi yang ≤ total; ada → `PENDING_DIRECTOR` (`directorRole` dari aturan), tidak ada → `APPROVED`.
- `PENDING_DIRECTOR`: role dari aturan (atau super-admin).
- Tidak seorang pun, termasuk super-admin, boleh memproses pengajuannya sendiri.

**Langkah AIRA yang umum:** `payreqtype_list` (pilih jenis) → `payreq_create` (draf) → `payreq_update` bila perlu → `payreq_submit` → pemantauan `payreq_get`/`payreq_list scope=approvals` → penyetuju `payreq_approve` / `payreq_reject` / `payreq_return` → Keuangan `payreq_pay`.

**Jenis pengajuan** (`kind`): `REIMBURSEMENT`, `VENDOR_PAYMENT` (butuh `partyId` vendor), `CASH_ADVANCE`, `TRAVEL` (butuh tujuan dan tanggal; baris dirinci per kategori tarif × jumlah), `OTHER`. Jenis dapat mewajibkan lampiran (`requiresAttachment`) dan pertanggungjawaban (`requiresSettlement`).

**Tab / scope daftar:** `mine`, `approvals` (menunggu keputusan saya, termasuk pertanggungjawaban), `payable` (hanya Keuangan), `advances` (uang muka belum dipertanggungjawabkan), `all` (butuh izin `payment_request` view).

**Pertanggungjawaban uang muka** (`settlementStatus` pada pengajuan PAID jenis uang muka/perjalanan yang `requiresSettlement`):

```
OPEN --submit--> SUBMITTED (atasan) --approve--> PENDING_FINANCE --post--> SETTLED
 (tanpa atasan aktif: langsung PENDING_FINANCE)
Atasan atau Keuangan bisa RETURN (REVISION). Keuangan bisa cancel-posting (SETTLED -> PENDING_FINANCE).
```

Langkah: `payreq_settlement_save` (draf realisasi) → `payreq_settlement_submit` → atasan `payreq_settlement_approve` → Keuangan `payreq_settlement_preview` lalu `payreq_settlement_post`. Uang muka yang lebih dari 14 hari sejak dibayar dianggap terlambat (`payreq_advances_summary`).

**Tagihan EAM** (`/payment-requests/eam`, hanya Keuangan): antrean biaya dari modul EAM (jenis `VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST`). `eambill_list`/`eambill_summary` untuk melihat, `eambill_pay` untuk memposting, `eambill_cancel` untuk membatalkan posting. Servis berasal dari impor (`source='IMPORT'`) tidak masuk antrean karena sudah ada di GL. Satu-satunya jalur posting adalah `services/gaFinance.ts` via `gaBillQueue`; alias lama `/api/ga/finance` dan modul `ga_finance` sudah dihapus.

### Aturan posting

| Peristiwa | Debit | Kredit |
|-----------|-------|--------|
| `payreq_pay` jenis biasa (REIMBURSEMENT, VENDOR_PAYMENT, OTHER) | Akun biaya per baris (dikelompokkan per akun) | Kas/Bank 1.1.x yang dipilih |
| `payreq_pay` CASH_ADVANCE / TRAVEL | Uang Muka Karyawan 1.5.6 | Kas/Bank 1.1.x |
| `payreq_cancel_payment` | (void jurnal pembayaran) | (void jurnal pembayaran) |
| `payreq_settlement_post`, realisasi R vs uang muka A | Akun biaya per baris (R) | Uang Muka Karyawan 1.5.6 sebesar min(R, A) |
| R < A (sisa) | Kas/Bank (A−R) | Uang Muka Karyawan 1.5.6 (A−R); karyawan mengembalikan sisa |
| R > A (kurang bayar) | (tidak ada tambahan debit) | Kas/Bank (R−A); perusahaan membayar kekurangan |
| R = A | tanpa baris kas | — |
| `payreq_settlement_cancel_posting` | (void jurnal pertanggungjawaban) | (void jurnal pertanggungjawaban) |
| `eambill_pay` method JOURNAL | Akun beban | Kas/Bank (lunas) |
| `eambill_pay` method PURCHASE_INVOICE | Akun beban | Hutang Usaha 2.1.1 (dilunasi lewat modul Pembayaran) |
| `eambill_cancel` | void jurnal / batalkan faktur | — |

Aturan penting: seluruh jurnal satu transaksi seimbang dan diposting satu jurnal; akun kas/bank tidak boleh sama dengan akun biaya; tahun buku harus terbuka. Posting uang muka mengikuti `kind` jenis (akun 1.5.6), tetapi wajib-tidaknya pertanggungjawaban hanya mengikuti `type.requiresSettlement`; jenis uang muka yang tidak mewajibkan pertanggungjawaban tidak dilacak (bersihkan 1.5.6 lewat jurnal manual). Persetujuan, pengajuan, dan pengembalian TIDAK membuat jurnal; hanya `pay`, `settlement/post`, dan `eambill_pay` yang membuat jurnal.

### Persetujuan

- Mount `/api/payment-requests` tidak punya gate modul: semua user login boleh membuat, melihat pengajuan sendiri, dan (bila berwenang) memutuskan. Izin `payment_request` (edit) menentukan "Keuangan": verifikasi akun, approve tahap Keuangan, bayar, batalkan bayar, posting pertanggungjawaban, seluruh `/eam`. Izin `payment_request` (view) membuka tab "Semua". Default: Admin dan Accountant.
- Tahap atasan memakai relasi supervisor user; tahap direktur memakai aturan approval documentType `PaymentRequest` (dikelola di toolset Persetujuan).
- Pengajuan yang sudah PAID tidak bisa dibatalkan pengaju; Keuangan harus membatalkan pembayaran dulu, dan itu ditolak bila pertanggungjawaban sudah SETTLED atau sedang berjalan.
- Pada AIRA: aksi pengaju (create/update/submit/save settlement) tier draft; keputusan, bayar, batal, dan posting tier critical.

### Jebakan umum

- **Lampiran** (nota/kuitansi) hanya bisa diunggah lewat antarmuka web; jenis yang mewajibkan lampiran gagal di `payreq_submit` bila belum ada.
- **Akun biaya wajib** pada semua baris sebelum `payreq_pay` (kecuali jenis uang muka); "Akun biaya baris N belum diisi" berarti Keuangan harus memanggil `payreq_set_accounts` atau menyertakan `lineAccounts` saat approve. Akun harus akun detail aktif.
- **Status stale**: perubahan status bersamaan menghasilkan "Status pengajuan sudah berubah, muat ulang"; ambil ulang `payreq_get` sebelum mencoba lagi.
- **Self-approval**: pengaju yang juga atasan/Keuangan tetap tidak boleh memutuskan atau membayar pengajuannya sendiri.
- **Alasan wajib** (min 3 karakter) untuk reject, return, cancel-payment, settlement return dan cancel-posting.
- **`payreq_settlement_approve`** hanya untuk tahap atasan; tahap Keuangan diselesaikan dengan `payreq_settlement_post`. Tanggal posting tidak boleh sebelum tanggal bayar uang muka.
- **`payreq_settlement_preview`** adalah POST yang murni baca (tanpa simpan); aman dipanggil otomatis.
- **Akun sistem Uang Muka Karyawan (1.5.6)** harus terpetakan, jika tidak pembayaran/pertanggungjawaban jenis uang muka gagal ("belum dipetakan").
- **Hak `permAction` tool**: tool aksi pengaju sebenarnya terbuka bagi semua user login; field modul `payment_request` pada katalog hanya acuan batas AIRA. Lihat `accessNote` tiap tool.
- **Jenis pengajuan yang sudah dipakai** tidak bisa dihapus; nonaktifkan lewat `payreqtype_update`.

### Peta istilah

| Istilah bisnis | Kode / field |
|----------------|--------------|
| Pengajuan Pembayaran (PP) | `PaymentRequest`, nomor `PP-…` |
| Draf / Menunggu atasan / Menunggu Keuangan / Menunggu direktur | `DRAFT` / `SUBMITTED` / `PENDING_FINANCE` / `PENDING_DIRECTOR` |
| Siap Dibayar / Dibayar | `APPROVED` / `PAID` |
| Ditolak / Perlu Revisi / Dibatalkan | `REJECTED` / `REVISION` / `CANCELLED` |
| Jenis pengajuan | `PaymentRequestType` (`kind`, `requiresAttachment`, `requiresSettlement`) |
| Reimburse / Pembayaran vendor / Uang muka / Perjalanan dinas | `REIMBURSEMENT` / `VENDOR_PAYMENT` / `CASH_ADVANCE` / `TRAVEL` |
| Penerima | `payeeKind` `EMPLOYEE` / `VENDOR`, `payeeName`, `partyId` |
| Rincian biaya | `PaymentRequestLine` (`expenseAccountId`, `category`) |
| Verifikasi Keuangan | `payreq_set_accounts`, izin `payment_request` edit |
| Uang Muka Karyawan | akun sistem 1.5.6 (`EMPLOYEE_ADVANCE`) |
| Pertanggungjawaban uang muka | `settlementStatus` `OPEN` / `SUBMITTED` / `PENDING_FINANCE` / `REVISION` / `SETTLED` |
| Sisa / kurang bayar | mode `RETURN` / `REIMBURSE` (R < A / R > A); `EXACT` bila sama |
| Tagihan EAM | antrean `GaBill` (`VEHICLE_TAX`, `SERVICE_LOG`, `MATERIAL_REQUEST`) |
| Pajak kendaraan / STNK / KIR | `VEHICLE_TAX` |
| MR (Permintaan Barang) sparepart | `MATERIAL_REQUEST` |
| Hutang Usaha | akun 2.1.1 |
| Aturan direktur | `ApprovalRule` documentType `PaymentRequest` |

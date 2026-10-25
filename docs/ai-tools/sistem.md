# Toolset: Sistem (`sistem`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/sistem` · 19 tool (read 15, write 3, critical 1)

## Tujuan

Toolset **sistem** memuat fungsi pendukung yang aman diakses agen: Jejak Audit, notifikasi pribadi, pencarian universal, profil perusahaan, diagnostik integritas data (health check), dan metadata lampiran. Hampir semuanya read-only. Fungsi administratif yang berbahaya (login, user/role, backup, reset data, konfigurasi AI/Telegram, unggah berkas) sengaja TIDAK tersedia sebagai tool; lihat bagian "Yang sengaja tidak dibuka" dan `DENYLIST.md`.

## ALUR BISNIS

### Peta tool

| Kebutuhan | Tool | Risiko | Izin |
|---|---|---|---|
| Siapa mengubah apa dan kapan | `audit_list`, `audit_get`, `audit_summary`, `audit_facets` | read | modul `audit` (view; default Admin) |
| Notifikasi saya | `notif_list`, `notif_types`, `notif_unread_count` | read | semua user login (milik sendiri) |
| Tandai notifikasi dibaca | `notif_read`, `notif_read_all` | write | semua user login (milik sendiri) |
| Cari dokumen/mitra/akun | `search_global` | read | semua user login, hasil difilter izin |
| Profil perusahaan | `set_company_get` | read | semua user login |
| Ubah profil perusahaan | `set_company_update` | critical | modul `settings` (edit; default Admin) |
| Cek integritas data | `hc_run`, `hc_preview` | read | modul `audit` (view; default Admin) |
| Metadata lampiran dokumen | `att_list`, `att_counts`, `att_invoice_related` | read | semua user login |

### Jejak Audit

- Middleware `auditTrail` mencatat otomatis SETIAP mutasi (`POST`, `PUT`, `PATCH`, `DELETE`) dari user yang login. Satu baris berisi: `userId` (+ nama/email), `action` (`CREATE` untuk POST, `UPDATE` untuk PUT/PATCH, `DELETE`), `entityType` (segmen pertama URL, mis. `sales`, `purchase`, `payments`, `payment-requests`), `entityId` (id dari respons, atau dari snapshot sebelum perubahan, atau `N/A`), `oldValues` (snapshot sebelum perubahan untuk dokumen/master terdaftar), `newValues` (isi respons), `ipAddress`, `userAgent`, `createdAt`.
- Nilai rahasia (password, token, service token, bot token, dsb.) di-redact menjadi `[REDACTED]` sebelum disimpan.
- `audit_list` memfilter `userId`, `action`, `entityType`, `search` (ID entitas), `startDate`/`endDate`; paging default 50, maks. 200; urut terbaru. `audit_facets` memberi pilihan nilai filter; `audit_summary` menghitung per aksi dengan filter yang sama.
- Pembacaan (GET) tidak dicatat. Aksi AIRA lewat tool juga tercatat sebagai mutasi biasa pada user yang diwakili.
- Karena `entityType` berasal dari URL, penelusuran dokumen tertentu paling mudah dengan `search=<id dokumen>`.

### Notifikasi

- Notifikasi bersifat per user; tool hanya menyentuh milik pemanggil.
- Jenis yang dibuat sistem antara lain `invoice_overdue` (faktur jatuh tempo), `low_stock` (stok di bawah minimum), `guarantee_due` (jaminan proyek jatuh tempo), `po_overdue` (PO melewati tanggal kirim). Pemeriksaan harian berjalan 07:00 WIB lewat scheduler dengan dedup 24 jam; pemicu manual `POST /notifications/check` tidak dibuka sebagai tool.
- `notif_list` tanpa parameter = 50 terbaru + `unreadCount`; dengan `page/limit/isRead/type/search` = daftar berpaging (default 25, maks. 100).
- `notif_read` dan `notif_read_all` hanya membalik flag `isRead`; tidak ada efek GL/stok. Dua tool ini tetap risk write agar tercatat di audit dan tunduk pada kebijakan tier.

### Pencarian universal (`search_global`)

- Minimal 2 karakter (kurang dari itu = hasil kosong). `limit` default 10, maks. 20 per jenis.
- Selalu mencari mitra dan akun COA; faktur penjualan (no. faktur/catatan), faktur pembelian, pembayaran, dan jurnal hanya jika pemanggil punya izin view modulnya (`sales_invoice`, `purchase_invoice`, `payment`, `journal`). Pengecekan gagal = jenis itu dikosongkan (fail-closed).
- Gunakan sebagai langkah pertama untuk menerjemahkan nama/nomor yang disebut user menjadi ID, lalu panggil tool detail.

### Profil perusahaan

- `set_company_get` mengembalikan record tunggal (slug `default`): nama, alamat, kontak, NPWP, mata uang, `fiscalYearStartMonth`, logo (base64, bisa berukuran MB), dan `invoiceSettings` (rekening bank/catatan kaki/tanda tangan pada cetak faktur).
- `set_company_update` adalah UPSERT PENUH, bukan patch: field yang tidak dikirim di-reset (alamat, telepon, email, NPWP menjadi kosong; `fiscalYearStartMonth` menjadi 1; mata uang menjadi IDR; `companyName` menjadi "Perusahaan Anda" bila kosong). Selalu ambil nilai sekarang dengan `set_company_get` lalu kirim ulang seluruh nilai. `dateFormat` diterima skema tetapi tidak disimpan.
- Diklasifikasikan critical karena memengaruhi dokumen berikutnya (mata uang, awal tahun fiskal, NPWP, rekening bank yang tercetak di faktur) dan merupakan konfigurasi global.

### Health check (diagnostik integritas)

`hc_run` menjalankan enam pemeriksaan paralel: `ALE vs JournalItem Sync` (kode preview `ale-sync`), `Account Balance Drift` (`account-balance-drift`: saldo tersimpan akun vs hitungan dari item jurnal), `Unbalanced Journal Entries` (jurnal terposting dengan debit != kredit), `Orphan ALE Entries` (`orphan-ale`: entri ledger yang dokumen sumbernya sudah tidak ada), `Stock vs Movement Mismatch` (stok item vs jumlah pergerakan stok), dan `Drift Stok per Gudang` (stok total item vs jumlah stok per gudang). Status keseluruhan: `ok`, `warning`, atau `error`. `hc_preview` (`check` = `ale-sync`, `account-balance-drift`, `orphan-ale`) menunjukkan apa yang akan diubah perbaikan otomatis. Perbaikan (`POST /health-check/fix/:check`) sengaja tidak tersedia untuk agen: ia memutasi data massal tanpa dokumen sumber dan harus dijalankan Admin setelah meninjau pratinjau.

### Lampiran (metadata saja)

- `att_list(referenceType, referenceId)`: metadata berkas yang melekat pada satu dokumen. Jenis referensi yang diizinkan saat unggah: `payment`, `journal`, `purchase_invoice`, `sales_invoice`, `sales_order`, `delivery_order`, `goods_receipt`, `approval_request`, dan beberapa lainnya.
- `att_counts`: jumlah lampiran per daftar ID (POST hanya karena membawa array; tidak mengubah data, di katalog `safeNonGet`).
- `att_invoice_related(type=sales|purchase, id)`: lampiran faktur + bukti pembayaran/deposit yang dialokasikan ke faktur itu.
- Unggah, unduh isi berkas, dan hapus lampiran tidak tersedia sebagai tool (berkas biner). Respons metadata juga memuat path internal berkas; abaikan, jangan diteruskan ke pengguna akhir.

### Yang sengaja tidak dibuka

Autentikasi (`/api/auth/*`), administrasi user dan role (`/api/users`, `/api/roles`), backup/restore, reset & data dummy, impor massal, konfigurasi AIRA/Telegram, endpoint publik (QR aset, formulir inquiry), unggah/unduh berkas, probe `/health` dan `/api/version`, `GET /api/settings/runtime` (info server), `GET /api/settings/check-update` (menjalankan git fetch), ekspor `.xlsx`, dan pemicu job notifikasi. Alasan tiap entri ada di `DENYLIST.md`.

### Jebakan umum

- Jejak audit memuat `oldValues`/`newValues` yang bisa berisi data sensitif (nama, email, nilai transaksi). Ringkas, jangan menempelkan seluruh JSON ke chat grup.
- `audit_*` dan `hc_*` default hanya untuk Admin; Accountant mendapat 403 kecuali izin `audit` diberikan.
- `att_list` tidak memeriksa izin per jenis dokumen (semua user login boleh membaca metadata) sehingga hormati kebijakan data-access AIRA pada lapisan atas.
- `set_company_update` tanpa membaca nilai lama akan menghapus data profil (lihat di atas).

### Peta istilah

| Istilah Indonesia | Istilah kode/sistem |
|---|---|
| Jejak Audit | `AuditLog` / tabel `audit_trail` |
| Notifikasi | `Notification` |
| Profil perusahaan | `CompanySettings` (slug `default`) |
| Tahun fiskal | `fiscalYearStartMonth` |
| Lampiran | `TransactionAttachment` |
| Cek kesehatan data | health check (`/api/health-check`) |
| ALE | `AccountingLedgerEntry` (entri buku besar) |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`att_counts`](#att_counts) | read | - | `POST /api/attachments/counts` |
| [`att_download_link`](#att_download_link) | read | - | `POST /api/attachments/download-link` |
| [`att_invoice_related`](#att_invoice_related) | read | - | `GET /api/attachments/invoice/:type/:id/related` |
| [`att_list`](#att_list) | read | - | `GET /api/attachments/:referenceType/:referenceId` |
| [`att_upload`](#att_upload) | write | ya | `POST /api/attachments/json` |
| [`audit_facets`](#audit_facets) | read | - | `GET /api/audit-logs/facets` |
| [`audit_get`](#audit_get) | read | - | `GET /api/audit-logs/:id` |
| [`audit_list`](#audit_list) | read | - | `GET /api/audit-logs` |
| [`audit_summary`](#audit_summary) | read | - | `GET /api/audit-logs/summary` |
| [`hc_preview`](#hc_preview) | read | - | `GET /api/health-check/preview/:check` |
| [`hc_run`](#hc_run) | read | - | `GET /api/health-check` |
| [`notif_list`](#notif_list) | read | - | `GET /api/notifications` |
| [`notif_read`](#notif_read) | write | tidak | `PATCH /api/notifications/:id/read` |
| [`notif_read_all`](#notif_read_all) | write | tidak | `PATCH /api/notifications/read-all` |
| [`notif_types`](#notif_types) | read | - | `GET /api/notifications/types` |
| [`notif_unread_count`](#notif_unread_count) | read | - | `GET /api/notifications/unread-count` |
| [`search_global`](#search_global) | read | - | `GET /api/search` |
| [`set_company_get`](#set_company_get) | read | - | `GET /api/settings/company` |
| [`set_company_update`](#set_company_update) | critical | tidak | `PUT /api/settings/company` |

## Rincian tool

### att_counts

**Ringkasan:** Hitung jumlah lampiran per dokumen secara batch (POST hanya karena body berisi daftar ID; tidak mengubah data).

- **Risk / tier:** `read` / Auto (POST murni baca)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `attachments` / `view`)
- **Catatan akses:** Tanpa guard modul/dokumen: semua user login dapat membaca metadata lampiran (tidak ada cek izin per jenis dokumen). Isi berkas tidak diekspos sebagai tool.
- **Handler:** `POST /api/attachments/counts` (src/routes/attachments.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `referenceType` | body | `string` | ya | Jenis dokumen induk, mis. sales_invoice |
| `referenceIds` | body | `array<string>` | ya | Daftar ID dokumen induk |

**Contoh pemanggilan**

```json
{
  "tool": "att_counts",
  "args": {
    "referenceType": "<referenceType>",
    "referenceIds": []
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Objek {referenceId: jumlah}; {} bila input kosong.>"
}
```

**Isi hasil:** Objek {referenceId: jumlah}; {} bila input kosong.

**Tool terkait:** [`att_list`](#att_list)

### att_download_link

**Ringkasan:** Buat TAUTAN UNDUH isi satu lampiran (PDF/JPG/PNG/WebP). Mengembalikan url bertanda tangan (berlaku 5 menit, sekali pakai), fileName, mimeType, size. Agen mengunduh url itu dengan HTTP GET biasa tanpa header otorisasi. Izin = membaca dokumen induk lampiran. Cari id lampiran lewat att_list / payreq_get.

- **Risk / tier:** `read` / Auto (POST murni baca)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `attachments` / `view`)
- **Catatan akses:** Pemeriksaan view dokumen induk saat membuat tautan DAN saat mengunduh.
- **Handler:** `POST /api/attachments/download-link` (src/routes/attachmentLinks.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `attachmentId` | body | `string` | ya | ID lampiran (UUID) dari att_list / payreq_get. |

**Contoh pemanggilan**

```json
{
  "tool": "att_download_link",
  "args": {
    "attachmentId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{url, fileName, mimeType, size, expiresInSeconds, oneTimeUse, warning?}. url sudah absolut>"
}
```

**Isi hasil:** {url, fileName, mimeType, size, expiresInSeconds, oneTimeUse, warning?}. url sudah absolut bila PUBLIC_BASE_URL terisi.

**Tool terkait:** [`att_list`](#att_list), [`att_counts`](#att_counts), [`payreq_get`](pengajuan-pembayaran.md#payreq_get)

### att_invoice_related

**Ringkasan:** Semua lampiran terkait satu faktur: lampiran faktur sendiri + lampiran tiap pembayaran/deposit yang dialokasikan ke faktur tersebut (bukti transfer).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `attachments` / `view`)
- **Catatan akses:** Tanpa guard modul/dokumen: semua user login dapat membaca metadata lampiran (tidak ada cek izin per jenis dokumen). Isi berkas tidak diekspos sebagai tool.
- **Handler:** `GET /api/attachments/invoice/:type/:id/related` (src/routes/attachments.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `type` | path | `string` | ya | sales atau purchase |
| `id` | path | `string` | ya | ID faktur |

**Contoh pemanggilan**

```json
{
  "tool": "att_invoice_related",
  "args": {
    "type": "<type>",
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{invoice[] (source=invoice), payments[] (source=payment + info {paymentNumber, paymentType>"
}
```

**Isi hasil:** {invoice[] (source=invoice), payments[] (source=payment + info {paymentNumber, paymentType, date, status})}.

**Error umum**

- 400: type harus 'sales' atau 'purchase'

**Tool terkait:** [`att_list`](#att_list)

### att_list

**Ringkasan:** Daftar metadata lampiran (nama berkas, tipe, ukuran, pengunggah, waktu) untuk satu dokumen. referenceType: payment, journal, purchase_invoice, sales_invoice, sales_order, delivery_order, goods_receipt, approval_request, dll.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `attachments` / `view`)
- **Catatan akses:** Tanpa guard modul/dokumen: semua user login dapat membaca metadata lampiran (tidak ada cek izin per jenis dokumen). Isi berkas tidak diekspos sebagai tool.
- **Handler:** `GET /api/attachments/:referenceType/:referenceId` (src/routes/attachments.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `referenceType` | path | `string` | ya | Jenis dokumen induk, mis. sales_invoice \| purchase_invoice \| payment \| journal \| sales_order \| delivery_order \| goods_receipt |
| `referenceId` | path | `string` | ya | ID dokumen induk |

**Contoh pemanggilan**

```json
{
  "tool": "att_list",
  "args": {
    "referenceType": "<referenceType>",
    "referenceId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array lampiran {id, referenceType, referenceId, fileName, mimeType, fileSize, createdAt, u>"
}
```

**Isi hasil:** Array lampiran {id, referenceType, referenceId, fileName, mimeType, fileSize, createdAt, user{fullName}}. Catatan: ikut membawa filePath/storedName internal.

**Tool terkait:** [`att_counts`](#att_counts), [`att_invoice_related`](#att_invoice_related)

### att_upload

**Ringkasan:** Melampirkan SATU berkas (JPG/PNG/WebP/PDF, maks. 5 MB, maks. 5 berkas per dokumen) ke dokumen transaksi apa pun. referenceType: payment, journal, purchase_invoice, sales_invoice, sales_order, delivery_order, goods_receipt, quotation, proforma_invoice, purchase_order, sales_return, stock_transfer, stock_opname, production_run, fixed_asset, approval_request. Dua cara: (1) tanpa contentBase64 → salin lampiran dari panel chat Entaris pengguna ini (default: lampiran pada pesan chat saat ini, atau pilih dengan chatAttachmentId); (2) contentBase64+fileName → isi berkas dibawa langsung (batas body MCP 256 KB ≈ 180 KB berkas). Jenis berkas ditentukan dari isi, bukan nama. Izin = edit pada modul dokumen induk. Untuk pengajuan pembayaran pakai payreq_attachment_add.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** ya (hanya membuat draft / pengajuan pending)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `attachments` / `edit`)
- **Catatan akses:** Butuh izin edit modul dokumen induk (approval_request: hanya pengaju). Lampiran chat harus milik pengguna yang sama.
- **Handler:** `POST /api/attachments/json` (src/routes/attachments.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `referenceType` | body | `string` | ya | Jenis dokumen induk: payment, journal, purchase_invoice, sales_invoice, sales_order, delivery_order, goods_receipt, quotation, proforma_invoice, purchase_order, sales_return, stock_transfer, stock_opname, production_run, fixed_asset, approval_request. |
| `referenceId` | body | `string` | ya | ID dokumen induk (UUID). |
| `fileName` | body | `string` | tidak | Nama berkas (wajib bila contentBase64 diisi; opsional untuk mengganti nama lampiran chat). |
| `contentBase64` | body | `string` | tidak | Isi berkas base64 (tanpa/dengan prefix data:). Maks. ±180 KB karena batas body MCP; kosongkan untuk memakai lampiran panel chat. |
| `mimeType` | body | `string` | tidak | Petunjuk jenis (image/jpeg, image/png, image/webp, application/pdf); ditolak bila tak cocok dengan isi berkas. |
| `chatAttachmentId` | body | `string` | tidak | ID lampiran panel chat milik pengguna ini. Kosong → lampiran pada pesan chat yang sedang berjalan. |

**Contoh pemanggilan**

```json
{
  "tool": "att_upload",
  "args": {
    "referenceType": "<referenceType>",
    "referenceId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Lampirkan berkas ke <referenceType> <id>?"
}
```

**Isi hasil:** Metadata lampiran tersimpan (array 1 elemen: id, fileName, mimeType, fileSize, referenceType, referenceId).

**Efek pembukuan/stok:** Tidak ada efek GL/stok; berkas tersimpan sebagai lampiran pengajuan.

**Teks konfirmasi:** Lampirkan berkas ke {referenceType} {referenceId}?

**Error umum**

- 400: Tidak ada lampiran pada pesan chat ini
- 400: Maksimal 10 lampiran per pengajuan
- 400: File tidak dikenali sebagai JPG/PNG/WebP/PDF
- 400: Ukuran file maksimal 5 MB
- 400: pengajuan tidak bisa diedit
- 413: body MCP > 256 KB (pakai lampiran chat)

**Tool terkait:** [`att_list`](#att_list), [`att_counts`](#att_counts), [`att_download_link`](#att_download_link), [`payreq_attachment_add`](pengajuan-pembayaran.md#payreq_attachment_add)

### audit_facets

**Ringkasan:** Opsi filter audit: daftar aksi, jenis entitas, dan user yang muncul di log (untuk mengisi parameter audit_list).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Handler:** `GET /api/audit-logs/facets` (src/routes/audit.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "audit_facets",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{actions[], entityTypes[], users[{id, fullName}]}.>"
}
```

**Isi hasil:** {actions[], entityTypes[], users[{id, fullName}]}.

**Tool terkait:** [`audit_list`](#audit_list)

### audit_get

**Ringkasan:** Satu catatan audit lengkap (nilai lama/baru, IP, user agent) berdasarkan ID — untuk deep link dari audit_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Handler:** `GET /api/audit-logs/:id` (src/routes/audit.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID catatan audit (UUID) |

**Contoh pemanggilan**

```json
{
  "tool": "audit_get",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Satu record audit + user.>"
}
```

**Isi hasil:** Satu record audit + user.

**Error umum**

- 404: catatan audit tidak ditemukan

**Tool terkait:** [`audit_list`](#audit_list)

### audit_list

**Ringkasan:** Jejak audit (siapa mengubah apa kapan) berpaging dengan filter pelaku/aksi/entitas/tanggal. Setiap mutasi POST/PUT/PATCH/DELETE tercatat otomatis dengan nilai lama/baru (rahasia di-redact). Default 50 baris, maks. 200, terbaru dulu.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Catatan akses:** Izin modul audit (view) — default hanya Admin.
- **Handler:** `GET /api/audit-logs` (src/routes/audit.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `sort` | query | `string` | tidak | Urutan: createdAt \| action \| entityType (awalan - atau :desc untuk menurun) |
| `userId` | query | `string` | tidak | Filter pelaku (ID user) |
| `action` | query | `string` | tidak | Filter aksi, mis. CREATE \| UPDATE \| DELETE |
| `entityType` | query | `string` | tidak | Filter jenis entitas (segmen pertama URL, mis. sales, purchase, payments) |
| `search` | query | `string` | tidak | Cari berdasarkan ID entitas |
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |
| `page` | query | `number` | tidak | Halaman |
| `limit` | query | `number` | tidak | Ukuran halaman (maks. 200) |

**Contoh pemanggilan**

```json
{
  "tool": "audit_list",
  "args": {
    "sort": "<sort>",
    "userId": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data[] {id, userId, user{fullName,email}, action, entityType, entityId, oldValues, newVal>"
}
```

**Isi hasil:** {data[] {id, userId, user{fullName,email}, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent, createdAt}, total, page, limit}.

**Error umum**

- 400: filter/tanggal tidak valid

**Tool terkait:** [`audit_get`](#audit_get), [`audit_summary`](#audit_summary), [`audit_facets`](#audit_facets)

### audit_summary

**Ringkasan:** Jumlah catatan audit per aksi (CREATE/UPDATE/DELETE) dengan filter yang sama seperti audit_list.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Handler:** `GET /api/audit-logs/summary` (src/routes/audit.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `userId` | query | `string` | tidak | Filter pelaku (ID user) |
| `action` | query | `string` | tidak | Filter aksi, mis. CREATE \| UPDATE \| DELETE |
| `entityType` | query | `string` | tidak | Filter jenis entitas (segmen pertama URL, mis. sales, purchase, payments) |
| `search` | query | `string` | tidak | Cari berdasarkan ID entitas |
| `startDate` | query | `date` | tidak | Tanggal awal periode (inklusif) (format YYYY-MM-DD) |
| `endDate` | query | `date` | tidak | Tanggal akhir periode (inklusif, sampai 23:59:59) (format YYYY-MM-DD) |

**Contoh pemanggilan**

```json
{
  "tool": "audit_summary",
  "args": {
    "userId": "<id>",
    "action": "<action>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Agregat jumlah per aksi + total.>"
}
```

**Isi hasil:** Agregat jumlah per aksi + total.

**Error umum**

- 400: filter tidak valid

**Tool terkait:** [`audit_list`](#audit_list)

### hc_preview

**Ringkasan:** Pratinjau (tanpa mengubah data) perubahan yang akan dilakukan perbaikan otomatis. Hanya untuk check: ale-sync, account-balance-drift, orphan-ale. Perbaikan itu sendiri (fix) tidak tersedia sebagai tool.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Handler:** `GET /api/health-check/preview/:check` (src/routes/healthCheck.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `check` | path | enum: `ale-sync`, `account-balance-drift`, `orphan-ale` | ya | Kode check: ale-sync \| account-balance-drift \| orphan-ale |

**Contoh pemanggilan**

```json
{
  "tool": "hc_preview",
  "args": {
    "check": "ale-sync"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{success, data:{check, description, count, details[], warning?}}.>"
}
```

**Isi hasil:** {success, data:{check, description, count, details[], warning?}}.

**Error umum**

- 400: check tidak dapat di-preview

**Tool terkait:** [`hc_run`](#hc_run)

### hc_run

**Ringkasan:** Jalankan 6 diagnostik integritas data secara paralel: sinkron ledger, selisih saldo akun, jurnal tak seimbang, ledger yatim, selisih stock movement, selisih stok gudang. Hanya membaca.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin (modul `audit` / `view`)
- **Catatan akses:** Izin modul audit (view) — default hanya Admin.
- **Handler:** `GET /api/health-check` (src/routes/healthCheck.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "hc_run",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{success, data:{status: ok|warning|error, checks[] {id, status, ringkasan, jumlah masalah}>"
}
```

**Isi hasil:** {success, data:{status: ok|warning|error, checks[] {id, status, ringkasan, jumlah masalah}}}.

**Tool terkait:** [`hc_preview`](#hc_preview)

### notif_list

**Ringkasan:** Notifikasi milik user pemanggil. Tanpa parameter: 50 terbaru + unreadCount. Dengan page/limit/isRead/type/search: daftar berpaging (default 25, maks. 100).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `notifications` / `view`)
- **Catatan akses:** Semua user login; hanya notifikasi MILIK pemanggil. Modul "notifications" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `GET /api/notifications` (src/routes/notifications.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `page` | query | `number` | tidak | Halaman |
| `limit` | query | `number` | tidak | Ukuran halaman (maks. 100) |
| `isRead` | query | enum: `true`, `false` | tidak | Filter status baca |
| `type` | query | `string` | tidak | Filter jenis notifikasi (lihat notif_types) |
| `search` | query | `string` | tidak | Cari di judul/pesan |

**Contoh pemanggilan**

```json
{
  "tool": "notif_list",
  "args": {
    "page": 1,
    "limit": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data[] notifikasi, total, page, limit, unreadCount}.>"
}
```

**Isi hasil:** {data[] notifikasi, total, page, limit, unreadCount}.

**Error umum**

- 400: filter status baca tidak valid

**Tool terkait:** [`notif_types`](#notif_types), [`notif_unread_count`](#notif_unread_count)

### notif_read

**Ringkasan:** Tandai satu notifikasi milik sendiri sebagai sudah dibaca.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `notifications` / `edit`)
- **Catatan akses:** Semua user login; hanya notifikasi MILIK pemanggil. Modul "notifications" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `PATCH /api/notifications/:id/read` (src/routes/notifications.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID notifikasi |

**Contoh pemanggilan**

```json
{
  "tool": "notif_read",
  "args": {
    "id": "<id>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tandai notifikasi <id> sebagai sudah dibaca?"
}
```

**Isi hasil:** {message}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya flag isRead notifikasi pemanggil.

**Teks konfirmasi:** Tandai notifikasi {id} sebagai sudah dibaca?

**Error umum**

- 404: notifikasi tidak ditemukan (bukan milik pemanggil)

### notif_read_all

**Ringkasan:** Tandai SEMUA notifikasi belum dibaca milik user pemanggil sebagai sudah dibaca.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `notifications` / `edit`)
- **Catatan akses:** Semua user login; hanya notifikasi MILIK pemanggil. Modul "notifications" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `PATCH /api/notifications/read-all` (src/routes/notifications.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "notif_read_all",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Tandai semua notifikasi sebagai sudah dibaca?"
}
```

**Isi hasil:** {message}.

**Efek pembukuan/stok:** Tidak ada efek GL/stok; hanya flag isRead seluruh notifikasi pemanggil.

**Teks konfirmasi:** Tandai semua notifikasi sebagai sudah dibaca?

### notif_types

**Ringkasan:** Jenis notifikasi yang ada pada user pemanggil beserta jumlahnya (untuk filter type di notif_list), mis. stok rendah, faktur lewat jatuh tempo, pemeliharaan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `notifications` / `view`)
- **Catatan akses:** Semua user login; hanya notifikasi MILIK pemanggil. Modul "notifications" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `GET /api/notifications/types` (src/routes/notifications.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "notif_types",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data[{type, count}]}.>"
}
```

**Isi hasil:** {data[{type, count}]}.

**Tool terkait:** [`notif_list`](#notif_list)

### notif_unread_count

**Ringkasan:** Jumlah notifikasi belum dibaca milik user pemanggil.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `notifications` / `view`)
- **Catatan akses:** Semua user login; hanya notifikasi MILIK pemanggil. Modul "notifications" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `GET /api/notifications/unread-count` (src/routes/notifications.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "notif_unread_count",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{count}.>"
}
```

**Isi hasil:** {count}.

### search_global

**Ringkasan:** Pencarian universal (min. 2 karakter) lintas mitra, akun COA, faktur penjualan/pembelian, pembayaran, dan jurnal; maks. 20 hasil per jenis (default 10). Jenis dokumen hanya dikembalikan bila pemanggil punya izin view modulnya.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** Semua user login. Mitra & akun COA selalu dicari; faktur/pembayaran/jurnal difilter izin sales_invoice/purchase_invoice/payment/journal (view) per jenis (gagal-tertutup).
- **Handler:** `GET /api/search` (src/routes/search.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `q` | query | `string` | ya | Kata kunci (min. 2 karakter; kosong/terlalu pendek = hasil kosong) |
| `limit` | query | `number` | tidak | Maks. hasil per jenis (default 10, maks. 20) |

**Contoh pemanggilan**

```json
{
  "tool": "search_global",
  "args": {
    "q": "<q>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Array hasil {type, id, label/nomor, info} lintas entitas.>"
}
```

**Isi hasil:** Array hasil {type, id, label/nomor, info} lintas entitas.

**Tool terkait:** [`party_search`](master-data.md#party_search)

### set_company_get

**Ringkasan:** Profil perusahaan: nama, alamat, kontak, NPWP, mata uang, bulan awal tahun fiskal, logo (base64, bisa besar), dan pengaturan cetak faktur.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `settings` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login (dipakai header/cetak); hanya perubahan butuh izin settings edit.
- **Handler:** `GET /api/settings/company` (src/routes/settings.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "set_company_get",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Record CompanySettings (slug default) atau null bila belum diisi.>"
}
```

**Isi hasil:** Record CompanySettings (slug default) atau null bila belum diisi.

### set_company_update

**Ringkasan:** Simpan profil perusahaan (upsert penuh): companyName, alamat, kontak, NPWP, currency, fiscalYearStartMonth (1-12), logo, dan invoiceSettings (rekening bank & catatan kaki faktur). PERHATIAN: bukan patch — field yang tidak dikirim di-reset (alamat/telepon/email/NPWP jadi kosong, fiscalYearStartMonth jadi 1, mata uang IDR). Kirim ulang semua nilai yang ada.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `settings` / `edit`)
- **Handler:** `PUT /api/settings/company` (src/routes/settings.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `companyName` | body | `string` | tidak | Nama perusahaan |
| `address` | body | `string` | tidak |  |
| `phone` | body | `string` | tidak |  |
| `email` | body | `email` | tidak |  |
| `taxId` | body | `string` | tidak | NPWP perusahaan |
| `logoUrl` | body | `string` | tidak |  |
| `logoUrlDark` | body | `string` | tidak |  |
| `currency` | body | `string` | tidak | Kode mata uang, mis. IDR |
| `dateFormat` | body | `string` | tidak | Diterima skema tetapi TIDAK disimpan oleh endpoint |
| `fiscalYearStartMonth` | body | `number` | tidak | Bulan awal tahun fiskal 1-12 |
| `invoiceSettings` | body | `object` | tidak | Pengaturan cetak faktur {sales{bankAccounts,footerNote,showSignature,signatureLabels}, purchase{...}} |
| `invoiceSettings.sales` | body | `object` | tidak |  |
| `invoiceSettings.sales.bankAccounts` | body | `string` | tidak |  |
| `invoiceSettings.sales.footerNote` | body | `string` | tidak |  |
| `invoiceSettings.sales.showSignature` | body | `boolean` | tidak |  |
| `invoiceSettings.sales.signatureLabels` | body | `array<string>` | tidak |  |
| `invoiceSettings.purchase` | body | `object` | tidak |  |
| `invoiceSettings.purchase.footerNote` | body | `string` | tidak |  |
| `invoiceSettings.purchase.showSignature` | body | `boolean` | tidak |  |
| `invoiceSettings.purchase.signatureLabels` | body | `array<string>` | tidak |  |

**Contoh pemanggilan**

```json
{
  "tool": "set_company_update",
  "args": {
    "companyName": "<companyName>",
    "address": "<address>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "action",
  "status": "pending_approval",
  "approvalId": "<id>",
  "confirm": "Ubah profil perusahaan menjadi \"<companyName>\" (mata uang {currency}, awal tahun fiskal bulan {fiscalYearStartMonth}). Setujui?"
}
```

**Isi hasil:** Record CompanySettings terbaru.

**Efek pembukuan/stok:** Tidak ada jurnal. Mengubah konfigurasi global: mata uang, awal tahun fiskal, NPWP, rekening bank pada faktur, logo — berdampak ke dokumen/laporan berikutnya.

**Teks konfirmasi:** Ubah profil perusahaan menjadi "{companyName}" (mata uang {currency}, awal tahun fiskal bulan {fiscalYearStartMonth}). Setujui?

**Error umum**

- 400: validasi (email, bulan 1-12) atau logo > ~4MB

**Tool terkait:** [`set_company_get`](#set_company_get)


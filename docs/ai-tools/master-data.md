# Toolset: Master Data (`master-data`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/master-data` · 12 tool (read 6, write 5, critical 1)

## Tujuan

Toolset **master-data** mengelola data induk mitra bisnis: **Pelanggan & Vendor** (entitas `Party`). Mitra dipakai di hampir semua dokumen: penawaran, SO, DO, faktur penjualan (pelanggan), PO, STT/BPB, faktur pembelian (pemasok), pembayaran, uang muka. Satu mitra bisa berperan ganda (`partyType = Both`). Akun COA, gudang, dan item stok adalah master lain yang berada di toolset akuntansi dan persediaan; toolset ini khusus mitra. Daftar dan pencarian bisa dipakai siapa saja yang login; membuat/mengubah mitra butuh izin modul `parties` edit; menghapus butuh capability `doc.cancel`.

## ALUR BISNIS

### Alur penggunaan

1. **Cari dulu, jangan buat duplikat.** Gunakan `party_search` (filter `search`, `type`, `isActive`, `hasOutstanding`) atau `party_similar` (deteksi nama mirip, skor Levenshtein >= 0.6, maks. 5 hasil).
2. **Buat** dengan `party_create` (hanya `name` dan `partyType` wajib). Mitra langsung aktif dengan saldo 0; tidak ada status draft dan tidak ada jurnal.
3. **Ubah** dengan `party_update` (parsial). `isActive=false` menyembunyikan mitra dari pilihan transaksi baru tanpa menghapus riwayat.
4. **Hapus** dengan `party_delete`: bila mitra sudah punya faktur penjualan, faktur pembelian, atau pembayaran, sistem TIDAK menghapus melainkan menonaktifkan (respons `deactivated: true`); hanya mitra tanpa transaksi yang benar-benar dihapus (`deleted: true`).
5. **Pantau** dengan `party_summary` (KPI daftar yang difilter), `party_dashboard` (ringkasan mitra aktif non-dummy), dan `party_get` (satu mitra lengkap dengan saldo).

### Peta tool

| Tool | Fungsi | Risiko |
|---|---|---|
| `party_search` | Daftar/cari mitra (mode daftar atau picker) | read |
| `party_get` | Detail satu mitra + saldo tersimpan | read |
| `party_summary` | KPI agregat dengan filter yang sama seperti daftar | read |
| `party_dashboard` | Total piutang, hutang, uang muka, mitra teratas | read |
| `party_similar` | Cek duplikat berdasar nama | read |
| `party_create` | Mitra baru | write |
| `party_update` | Ubah data/status mitra | write |
| `party_delete` | Hapus atau nonaktifkan | critical (cap `doc.cancel`) |

### Aturan data

- **Jenis mitra** (`partyType`): `Customer` (pelanggan), `Supplier` (pemasok), `Both`. Filter `type=Customer` atau `Supplier` ikut menyertakan mitra bertipe `Both`; `type=Both` hanya yang bertipe `Both`.
- **Saldo tersimpan** (cache di record mitra, diperbarui saat transaksi diposting, bukan dihitung ulang tiap query):
  - `outstandingAmount`: sisa piutang (pelanggan) atau sisa hutang (pemasok) dari faktur belum lunas.
  - `depositBalance`: saldo uang muka yang kita bayarkan ke vendor (Uang Muka Pembelian, akun 1.3).
  - `customerDepositBalance`: saldo uang muka yang diterima dari pelanggan.
  - `openingOutstanding`: saldo awal hasil impor/setup.
  Jika saldo tampak tidak cocok dengan buku besar, jalankan `hc_run` (toolset sistem) untuk diagnostik integritas.
- **`isWapu`**: menandai mitra sebagai Wajib Pungut (WAPU). Memengaruhi perlakuan pajak pada faktur BARU yang melibatkan mitra tersebut; perubahan tidak mengubah faktur lama.
- **`taxId`** menyimpan NPWP. Pencarian `search` mencocokkan nama, email, telepon, dan NPWP (tidak peka huruf besar).
- **Mode daftar vs picker**: `party_search` masuk mode daftar bila ada salah satu `search`, `sort`, `isActive`, atau `hasOutstanding` (paging default 25, maks. 500; `sort` field `name`, `outstanding`, `deposit`). Selain itu mode picker (default 100, maks. 200, urut nama). Keduanya mengembalikan `{ data, total, page, limit }`.
- Mitra dummy (`isDummy`) dikecualikan dari `party_dashboard`.
- Audit: semua perubahan lewat `PUT/POST/DELETE /api/parties` tercatat di Jejak Audit (lihat toolset sistem, `audit_list`).

### Hak akses

- GET (daftar, detail, summary, dashboard, similar): terbuka untuk semua user login karena dipakai untuk mengisi form di seluruh aplikasi (guard `requireWrite('parties')`).
- POST/PUT: izin modul `parties` edit (default Admin, Accountant, StaffProduksi).
- DELETE: tambahan capability `doc.cancel` (default hanya Admin).

### Jebakan umum

- Membuat mitra dengan nama yang hampir sama (mis. "PT Maju" vs "PT. Maju") menimbulkan dua saldo terpisah. Selalu panggil `party_similar` sebelum `party_create`.
- `party_update` mengirim hanya field yang diubah. Mengirim `email: ""` mengosongkan email; `isActive=false` bukan penghapusan.
- `party_delete` pada mitra bertransaksi hanya menonaktifkan; jangan menyimpulkan data hilang. Mitra yang dinonaktifkan masih tampil dengan filter `isActive=false`.
- `outstandingAmount` hanya satu kolom per mitra. `party_dashboard` menghitung mitra bertipe `Both` pada kedua sisi (total piutang dan total hutang), sehingga angkanya bisa terhitung ganda. Untuk rincian per sisi gunakan laporan umur (`rpt_aging`, `type` Customer atau Supplier).
- Format email harus valid (kosong diperbolehkan); selain itu respons 400 dengan pesan validasi.

### Peta istilah

| Istilah Indonesia | Istilah kode/sistem |
|---|---|
| Pelanggan | Customer (`partyType`) |
| Vendor / Pemasok | Supplier |
| Pelanggan & Vendor | Both |
| Mitra / Pihak | Party |
| Saldo piutang/hutang | `outstandingAmount` |
| Uang muka vendor | `depositBalance` (Vendor Deposit) |
| Uang muka pelanggan | `customerDepositBalance` (Customer Deposit) |
| WAPU | Wajib Pungut (`isWapu`) |
| NPWP | `taxId` |

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`party_create`](#party_create) | write | tidak | `POST /api/parties` |
| [`party_dashboard`](#party_dashboard) | read | - | `GET /api/parties/dashboard` |
| [`party_delete`](#party_delete) | critical | tidak | `DELETE /api/parties/:id` |
| [`party_get`](#party_get) | read | - | `GET /api/parties/:id` |
| [`party_search`](#party_search) | read | - | `GET /api/parties` |
| [`party_similar`](#party_similar) | read | - | `GET /api/parties/similar` |
| [`party_summary`](#party_summary) | read | - | `GET /api/parties/summary` |
| [`party_update`](#party_update) | write | tidak | `PUT /api/parties/:id` |
| [`svc_create`](#svc_create) | write | tidak | `POST /api/service-items` |
| [`svc_delete`](#svc_delete) | write | tidak | `DELETE /api/service-items/:id` |
| [`svc_list`](#svc_list) | read | - | `GET /api/service-items` |
| [`svc_update`](#svc_update) | write | tidak | `PATCH /api/service-items/:id` |

## Rincian tool

### party_create

**Ringkasan:** Buat pelanggan/pemasok baru (name dan partyType wajib). Langsung aktif; tidak ada draft. Cek duplikat dulu dengan party_similar.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `parties` / `edit`)
- **Handler:** `POST /api/parties` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | body | `string` | ya | Nama mitra |
| `partyType` | body | enum: `Customer`, `Supplier`, `Both` | ya | Customer = pelanggan, Supplier = pemasok, Both = keduanya |
| `phone` | body | `string` | tidak |  |
| `email` | body | `email` | tidak |  |
| `address` | body | `string` | tidak |  |
| `taxId` | body | `string` | tidak |  |
| `isWapu` | body | `boolean` | tidak | Tandai Wajib Pungut (WAPU) PPN/pajak |

**Contoh pemanggilan**

```json
{
  "tool": "party_create",
  "args": {
    "name": "<name>",
    "partyType": "Customer"
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
  "confirm": "Buat mitra baru \"<name>\" bertipe Customer. Setujui?"
}
```

**Isi hasil:** Record mitra baru (201).

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya membuat master mitra aktif (saldo awal 0).

**Teks konfirmasi:** Buat mitra baru "{name}" bertipe {partyType}. Setujui?

**Prasyarat**

- Sudah cek party_similar agar tidak duplikat

**Tool terkait:** [`party_similar`](#party_similar), [`party_update`](#party_update)

### party_dashboard

**Ringkasan:** Dashboard mitra aktif non-dummy: total piutang (pelanggan), total hutang (pemasok), total uang muka, dan daftar teratas berdasar saldo. Tanpa parameter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/parties/dashboard` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter:** tidak ada.

**Contoh pemanggilan**

```json
{
  "tool": "party_dashboard",
  "args": {}
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Ringkasan {totalPiutang, totalHutang, deposit, top lists...}.>"
}
```

**Isi hasil:** Ringkasan {totalPiutang, totalHutang, deposit, top lists...}.

### party_delete

**Ringkasan:** Hapus mitra. Bila sudah punya faktur penjualan/pembelian/pembayaran, mitra TIDAK dihapus melainkan dinonaktifkan; hanya mitra tanpa transaksi yang benar-benar dihapus. Butuh capability doc.cancel.

- **Risk / tier:** `critical` / Wajib-Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `parties` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/parties/:id` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID mitra (UUID) |

**Contoh pemanggilan**

```json
{
  "tool": "party_delete",
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
  "confirm": "Hapus/nonaktifkan mitra <id>? Mitra dengan transaksi hanya dinonaktifkan. Setujui?"
}
```

**Isi hasil:** {message, deleted:true} atau {message, deactivated:true}.

**Efek pembukuan/stok:** Tidak ada jurnal. Menghapus master permanen (tanpa transaksi) atau menonaktifkan (ada transaksi).

**Teks konfirmasi:** Hapus/nonaktifkan mitra {id}? Mitra dengan transaksi hanya dinonaktifkan. Setujui?

**Error umum**

- 404: data mitra tidak ditemukan

### party_get

**Ringkasan:** Detail satu pelanggan/pemasok termasuk saldo terutang tersimpan (outstandingAmount) dan saldo uang muka vendor/pelanggan.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/parties/:id` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID mitra (UUID) |

**Contoh pemanggilan**

```json
{
  "tool": "party_get",
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
  "data": "<Satu record mitra lengkap.>"
}
```

**Isi hasil:** Satu record mitra lengkap.

**Error umum**

- 404: pihak tidak ditemukan

**Tool terkait:** [`party_search`](#party_search)

### party_search

**Ringkasan:** Daftar/cari pelanggan & pemasok. Mode daftar (aktif bila ada search/sort/isActive/hasOutstanding): filter + sort + paging maks. 500; mode picker (type/page/limit saja): maks. 200 urut nama. type=Customer/Supplier ikut menyertakan pihak bertipe Both.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** GET master referensi terbuka untuk semua user login (requireWrite: hanya tulis butuh izin parties edit).
- **Handler:** `GET /api/parties` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `type` | query | enum: `Customer`, `Supplier`, `Both` | tidak | Jenis mitra |
| `page` | query | `number` | tidak | Halaman (mulai 1) |
| `limit` | query | `number` | tidak | Ukuran halaman (default 25 mode daftar / 100 mode picker) |
| `search` | query | `string` | tidak | Cari di nama, email, telepon, NPWP |
| `isActive` | query | enum: `true`, `false` | tidak | Filter status aktif |
| `hasOutstanding` | query | enum: `true`, `false` | tidak | true = hanya yang punya saldo terutang >0; false = tanpa |
| `sort` | query | `string` | tidak | Urutan, mis. name:asc \| outstanding:desc \| deposit:desc (field: name, outstanding, deposit) |

**Contoh pemanggilan**

```json
{
  "tool": "party_search",
  "args": {
    "type": "Customer",
    "page": 1
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data[] mitra {id, name, partyType, phone, email, address, taxId, isActive, isWapu, outsta>"
}
```

**Isi hasil:** {data[] mitra {id, name, partyType, phone, email, address, taxId, isActive, isWapu, outstandingAmount, depositBalance, customerDepositBalance}, total, page, limit}.

**Error umum**

- 400: jenis mitra/filter tidak valid

**Tool terkait:** [`party_get`](#party_get), [`party_similar`](#party_similar), [`party_summary`](#party_summary)

### party_similar

**Ringkasan:** Deteksi duplikat: cari maks. 5 mitra bernama mirip (substring + Levenshtein, skor >=0.6). Panggil sebelum party_create. name minimal 2 karakter.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/parties/similar` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `name` | query | `string` | ya | Nama yang dicek (min. 2 karakter) |
| `type` | query | enum: `Customer`, `Supplier`, `Both` | tidak | Batasi jenis mitra |

**Contoh pemanggilan**

```json
{
  "tool": "party_similar",
  "args": {
    "name": "<name>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{data[] {id, name, partyType, phone, isActive, similarity 0..1}}.>"
}
```

**Isi hasil:** {data[] {id, name, partyType, phone, isActive, similarity 0..1}}.

**Tool terkait:** [`party_create`](#party_create)

### party_summary

**Ringkasan:** KPI ringkas daftar mitra dengan filter yang sama seperti party_search mode daftar (type, search, isActive, hasOutstanding): jumlah mitra, total piutang/hutang, total uang muka.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `parties` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login.
- **Handler:** `GET /api/parties/summary` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `type` | query | enum: `Customer`, `Supplier`, `Both` | tidak | Jenis mitra |
| `search` | query | `string` | tidak | Cari nama/email/telepon/NPWP |
| `isActive` | query | enum: `true`, `false` | tidak | Filter status aktif |
| `hasOutstanding` | query | enum: `true`, `false` | tidak | Filter punya saldo terutang |

**Contoh pemanggilan**

```json
{
  "tool": "party_summary",
  "args": {
    "type": "Customer",
    "search": "<search>"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<Agregat KPI mitra (jumlah, total outstanding, total uang muka).>"
}
```

**Isi hasil:** Agregat KPI mitra (jumlah, total outstanding, total uang muka).

**Error umum**

- 400: filter tidak valid

### party_update

**Ringkasan:** Ubah data mitra (nama, tipe, kontak, NPWP, isWapu, isActive). Parsial: hanya field yang dikirim berubah; null atau string kosong menghapus phone/email/address/taxId. Perhatian: isWapu/taxId memengaruhi perlakuan pajak faktur berikutnya; isActive=false menyembunyikan dari pilihan transaksi baru.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant, StaffProduksi (modul `parties` / `edit`)
- **Handler:** `PUT /api/parties/:id` (src/routes/parties.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID mitra (UUID) |
| `name` | body | `string` | tidak | Nama. |
| `partyType` | body | enum: `Customer`, `Supplier`, `Both` | tidak |  |
| `phone` | body | `string` | tidak |  |
| `email` | body | `email` | tidak |  |
| `address` | body | `string` | tidak |  |
| `taxId` | body | `string` | tidak |  |
| `isWapu` | body | `boolean` | tidak |  |
| `isActive` | body | `boolean` | tidak | Status aktif. |

**Contoh pemanggilan**

```json
{
  "tool": "party_update",
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
  "confirm": "Ubah mitra <id>. Setujui?"
}
```

**Isi hasil:** Record mitra terbaru.

**Efek pembukuan/stok:** Tidak ada efek GL/stok langsung; memengaruhi faktur BARU (pajak WAPU, status aktif). Faktur lama tidak diubah.

**Teks konfirmasi:** Ubah mitra {id}. Setujui?

**Error umum**

- 404: data pihak tidak ditemukan

**Tool terkait:** [`party_get`](#party_get)

### svc_create

**Ringkasan:** Membuat master item jasa baru (kode unik, nama, satuan, tarif default, akun pendapatan). Dipakai pada baris invoice jenis jasa.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `sales_invoice` / `edit`)
- **Handler:** `POST /api/service-items` (src/routes/serviceItems.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `code` | body | `string` | ya | Kode. |
| `name` | body | `string` | ya | Nama. |
| `unit` | body | `string` | tidak | Satuan. |
| `defaultRate` | body | `number` | tidak | Tarif default per satuan. |
| `accountId` | body | `uuid` | ya | Akun pendapatan (COA) tempat invoice jasa ini dikreditkan. |
| `description` | body | `string` | tidak | Keterangan. |

**Contoh pemanggilan**

```json
{
  "tool": "svc_create",
  "args": {
    "code": "<code>",
    "name": "<name>",
    "accountId": "00000000-0000-0000-0000-000000000000"
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
  "confirm": "Buat item jasa <code> - <name>?"
}
```

**Isi hasil:** ServiceItem yang dibuat (dengan account).

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Hanya master data.

**Teks konfirmasi:** Buat item jasa {code} - {name}?

**Error umum**

- 409/400: kode sudah dipakai.

### svc_delete

**Ringkasan:** Menonaktifkan item jasa (soft delete: isActive=false; data tidak dihapus dan dapat diaktifkan lagi lewat svc_update). Butuh capability doc.cancel.

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin (modul `sales_invoice` / `edit`, capability `doc.cancel`)
- **Handler:** `DELETE /api/service-items/:id` (src/routes/serviceItems.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID item jasa. |

**Contoh pemanggilan**

```json
{
  "tool": "svc_delete",
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
  "confirm": "Nonaktifkan item jasa <id>?"
}
```

**Isi hasil:** { success: true }.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Item jasa dinonaktifkan; dokumen lama tidak terpengaruh.

**Teks konfirmasi:** Nonaktifkan item jasa {id}?

**Tool terkait:** [`svc_update`](#svc_update)

### svc_list

**Ringkasan:** Daftar item jasa (master layanan untuk invoice: kode, nama, satuan, tarif default, akun pendapatan). Tanpa page: semua baris; dengan page: paging.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, Viewer (modul `sales_invoice` / `view`)
- **Catatan akses:** GET terbuka untuk semua user login (data referensi); hanya tulis butuh izin edit modul sales_invoice.
- **Handler:** `GET /api/service-items` (src/routes/serviceItems.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `search` | query | `string` | tidak | Cari kode/nama. |
| `isActive` | query | enum: `true`, `false` | tidak | Filter aktif/nonaktif. |
| `page` | query | `number` | tidak | Aktifkan paging bila diisi. |
| `limit` | query | `number` | tidak | Baris per halaman (maks 200). |
| `sort` | query | `string` | tidak | code \| name \| defaultRate; awalan '-' = menurun (mode paging). |

**Contoh pemanggilan**

```json
{
  "tool": "svc_list",
  "args": {
    "search": "<search>",
    "isActive": "true"
  }
}
```

**Contoh hasil (dipersingkat)**

```json
{
  "ok": true,
  "kind": "read",
  "data": "<{ data: ServiceItem[] (dengan account), total?, page?, limit? }.>"
}
```

**Isi hasil:** { data: ServiceItem[] (dengan account), total?, page?, limit? }.

### svc_update

**Ringkasan:** Mengubah sebagian field master item jasa (kode, nama, satuan, tarif default, akun, deskripsi, status aktif).

- **Risk / tier:** `write` / Draft/Approve
- **Draft-capable:** tidak (efek langsung)
- **Roles & izin:** Admin, Accountant (modul `sales_invoice` / `edit`)
- **Handler:** `PATCH /api/service-items/:id` (src/routes/serviceItems.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID item jasa. |
| `code` | body | `string` | tidak | Kode. |
| `name` | body | `string` | tidak | Nama. |
| `unit` | body | `string` | tidak | Satuan. |
| `defaultRate` | body | `number` | tidak |  |
| `accountId` | body | `uuid` | tidak | ID akun COA. |
| `description` | body | `string` | tidak | Keterangan. |
| `isActive` | body | `boolean` | tidak | false = nonaktif; true = aktifkan kembali. |

**Contoh pemanggilan**

```json
{
  "tool": "svc_update",
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
  "confirm": "Ubah item jasa <id>?"
}
```

**Isi hasil:** ServiceItem setelah diubah.

**Efek pembukuan/stok:** Tidak ada efek GL/stok. Invoice lama tidak berubah; perubahan akun hanya berlaku untuk invoice berikutnya.

**Teks konfirmasi:** Ubah item jasa {id}?


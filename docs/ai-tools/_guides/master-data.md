Toolset **master-data** mengelola data induk mitra bisnis: **Pelanggan & Vendor** (entitas `Party`). Mitra dipakai di hampir semua dokumen: penawaran, SO, DO, faktur penjualan (pelanggan), PO, STT/BPB, faktur pembelian (pemasok), pembayaran, uang muka. Satu mitra bisa berperan ganda (`partyType = Both`). Akun COA, gudang, dan item stok adalah master lain yang berada di toolset akuntansi dan persediaan; toolset ini khusus mitra. Daftar dan pencarian bisa dipakai siapa saja yang login; membuat/mengubah mitra butuh izin modul `parties` edit; menghapus butuh capability `doc.cancel`.

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

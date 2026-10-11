# Terjemahan UI (ID/EN)

Entaris tersedia dalam Bahasa Indonesia (`id`, bawaan) dan English (`en`). Bahasa dipilih per pengguna di **Pengaturan > Tampilan**. Pengguna yang belum memilih memakai bahasa bawaan perusahaan (**Pengaturan > Profil Perusahaan**). PDF dan ekspor mengikuti bahasa pengguna yang mencetaknya.

## Struktur

```
client/src/
├── i18n/
│   ├── index.ts        # init i18next, setUiLanguage(), pemuatan per namespace
│   ├── language.ts     # 'id' | 'en', localeFor(), penyimpanan lokal
│   ├── i18next.d.ts    # tipe kunci: setiap namespace baru WAJIB didaftarkan di sini
│   └── locales.test.ts # menjaga id dan en punya kunci + placeholder yang sama
└── locales/
    ├── id/<namespace>.json
    └── en/<namespace>.json
```

Server: `users.language` (NULL = ikut perusahaan), `company_settings.default_language`, `PUT /api/users/me/language`. `/auth/login` dan `/auth/me` mengembalikan `language` (efektif) dan `languagePreference`.

## Namespace

Satu namespace per modul. `common`, `shell`, dan `auth` dimuat sejak awal; namespace lain dimuat saat pertama dipakai.

| Namespace | Isi |
|---|---|
| `common` | Tombol umum (Simpan, Batal), status dokumen, label tabel bersama, pesan galat umum, komponen `components/ui` dan `components/shared` |
| `shell` | Sidebar, header, menu pengguna, palet perintah, notifikasi |
| `auth` | Login, halaman publik, landing |
| `settings` | Semua tab Pengaturan |
| `sales` | Penawaran, Sales Order, Surat Jalan, Invoice Penjualan, retur, uang muka customer, customer |
| `purchasing` | Purchase Order, STT/BPB, Invoice Pembelian, uang muka supplier, supplier |
| `inventory` | Item, stok, mutasi, gudang, stok opname, transfer |
| `production` | Produksi, mesin, OEE, biaya produksi |
| `finance` | Bagan akun, jurnal, buku besar, kas & bank, pembayaran, rekonsiliasi, aset tetap, pengajuan pembayaran, buku kas |
| `reports` | Semua halaman laporan |
| `eam` | Aset & pemeliharaan (kendaraan, gedung, peralatan, work order, dokumen, inventori GA) |
| `dashboard` | Dasbor dan widget |
| `approvals` | Persetujuan dan audit trail |
| `aira` | Panel AIRA |
| `pdf` | Template PDF dan judul kolom ekspor |

## Aturan menulis

- Kunci: `camelCase`, bersarang per halaman/komponen: `salesInvoiceList.title`, `salesInvoiceList.columns.dueDate`.
- Komponen: `const { t } = useTranslation('sales')`, lalu `t('salesInvoiceList.title')`. Kunci dari namespace lain: daftarkan dulu, `useTranslation(['sales', 'common'])`, lalu `t('common:actions.save')`. Namespace pertama adalah bawaan untuk kunci tanpa awalan.
- Di luar komponen (kolom tabel, model, util), panggil `i18n.t(...)` dari `@/i18n` **saat dipakai**, bukan di konstanta tingkat modul. Konstanta modul dievaluasi sekali dan tidak ikut ganti bahasa. Ubah konstanta label menjadi fungsi, atau simpan kuncinya lalu terjemahkan saat render.
- Variabel: `{{name}}`. Jumlah: `{{count}}` dengan `_one`/`_other` di `en`. Di `id` cukup satu bentuk (`key_other`, dan `key_one` berisi teks yang sama).
- JSX berformat: `<Trans>` dari `react-i18next`.
- Jangan diterjemahkan: nomor dokumen, kode akun, nilai enum yang dikirim ke API, data pengguna, singkatan resmi (PPN/VAT ditulis sesuai glosarium).
- Angka, uang, dan tanggal selalu lewat `@/lib/format`. Formatnya otomatis mengikuti bahasa (`id-ID`/`en-US`, satuan ringkas rb/jt/M ↔ K/M/B). Jangan menulis `'id-ID'` langsung; pakai `LOCALE` dari `@/lib/format`.
- Gaya bahasa: kalimat biasa (sentence case), tanpa tanda seru, tanpa HURUF KAPITAL untuk penekanan, tanpa kata "berhasil" di pesan sukses. Sama untuk `en`: "Invoice disimpan." menjadi "Invoice saved.", bukan "Invoice saved successfully!".
- Setiap kunci baru harus ada di `id` dan `en`; `locales.test.ts` gagal kalau tidak.
- Tes menjalankan UI dalam Bahasa Indonesia dengan semua namespace termuat (`src/test/setup.ts`), jadi tes yang mencari teks Indonesia tetap berlaku.

## Changelog

Catatan rilis dua bahasa: `client/src/lib/version.ts` (Indonesia) dan `client/src/lib/changelog.en.ts` (English, kunci = versi). Setiap rilis baru wajib menambah entri di keduanya dengan jumlah butir yang sama; `changelog.test.ts` gagal kalau tidak. Halaman Pengaturan > Tentang menampilkan versi sesuai bahasa pengguna.

## Glosarium

Istilah baku Indonesia mengikuti keputusan pemilik produk (10 Oktober 2026): istilah serapan yang lazim di kantor. Pakai persis seperti tabel ini di semua teks.

| Konsep | Indonesia | English |
|---|---|---|
| Pihak yang membeli | Customer | Customer |
| Pihak yang menjual ke kita | Supplier | Supplier |
| Pihak (customer/supplier) | Mitra | Partner |
| Tagihan ke customer | Invoice Penjualan | Sales Invoice |
| Tagihan dari supplier | Invoice Pembelian | Purchase Invoice |
| Faktur pajak (dokumen pajak) | Faktur Pajak | Tax Invoice (Faktur Pajak) |
| Penawaran harga | Penawaran | Quotation |
| Pesanan dari customer | Sales Order | Sales Order |
| Pesanan ke supplier | Purchase Order | Purchase Order |
| Dokumen kirim barang | Surat Jalan | Delivery Order |
| Penerimaan barang | STT/BPB | Goods Receipt |
| Retur penjualan | Retur Penjualan | Sales Return |
| Uang muka dari customer | Uang Muka Customer | Customer Deposit |
| Uang muka ke supplier | Uang Muka Supplier | Supplier Deposit |
| Piutang | Piutang | Receivables |
| Hutang | Hutang | Payables |
| Pembayaran | Pembayaran | Payment |
| Pengajuan pembayaran | Pengajuan Pembayaran | Payment Request |
| Bagan akun | Bagan Akun | Chart of Accounts |
| Jurnal | Jurnal Umum | General Journal |
| Buku besar | Buku Besar | General Ledger |
| Tahun buku | Tahun Buku | Fiscal Year |
| Kas & bank | Kas & Bank | Cash & Bank |
| Rekonsiliasi bank | Rekonsiliasi Bank | Bank Reconciliation |
| Aset tetap | Aset Tetap | Fixed Assets |
| Penyusutan | Penyusutan | Depreciation |
| Harga pokok penjualan | HPP | COGS |
| Pajak pertambahan nilai | PPN | VAT |
| Nomor pokok wajib pajak | NPWP | Tax ID (NPWP) |
| Persediaan | Persediaan | Inventory |
| Barang | Item | Item |
| Gudang | Gudang | Warehouse |
| Mutasi stok | Mutasi Stok | Stock Movement |
| Stok opname | Stok Opname | Stock Count |
| Transfer gudang | Transfer Stok | Stock Transfer |
| Produksi | Produksi | Production |
| Persetujuan | Persetujuan | Approval |
| Jejak audit | Audit Trail | Audit Trail |
| Aset & pemeliharaan | Aset & Pemeliharaan | Assets & Maintenance |
| Perintah kerja | Work Order | Work Order |
| Draft | Draft | Draft |
| Diposting | Diposting | Posted |
| Dibatalkan | Dibatalkan | Cancelled |

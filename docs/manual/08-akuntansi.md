# Bab 8 — Akuntansi

[← Bank & Kas](07-modul-bank-kas.md) · [Daftar Isi](README.md) · [Lanjut: Laporan →](09-laporan.md)

---

Grup menu **Akuntansi**. Untuk Accountant & Admin.

## 8.1 Buku Besar (General Ledger)

Menu **Akuntansi → Buku Besar**. Daftar semua jurnal (JV) yang ter-posting.

- **Default tampil:** jurnal **bulan berjalan** (supaya tidak tenggelam di ribuan baris).
- **Filter:** rentang tanggal (preset Hari ini/Minggu/Bulan/Tahun), sembunyikan yang dibatalkan.
- **Cari:** sekarang match **nomor jurnal, keterangan, nama akun, nomor akun, dan deskripsi baris**. Mis. cari "Piutang Karyawan" atau "1.2.2" → ketemu semua jurnal yang menyentuh akun itu.
- **Pagination:** First/Prev/Next/Last + pilih 25/50/100/200 per halaman.
- Klik jurnal → lihat detail debit/kredit per baris.

> Mayoritas jurnal dibuat **otomatis** oleh sistem (dari invoice, pembayaran, produksi, dll). Jurnal manual hanya untuk penyesuaian.

## 8.2 Jurnal Manual (Journal Voucher)

Untuk transaksi yang tidak lewat modul standar (penyesuaian, koreksi, reklasifikasi):
- **Buat jurnal:** tanggal, keterangan, baris debit/kredit (minimal 2 baris).
- **Wajib seimbang:** total debit = total kredit, kalau tidak ditolak.
- Satu baris tidak boleh debit & kredit sekaligus.
- **Batalkan:** jurnal bisa di-cancel (reverse otomatis) — tercatat di audit.

> Hati-hati jurnal manual ke akun yang dikelola modul (Persediaan, Piutang, Hutang) — bisa bikin selisih dengan sub-ledger. Konsultasi Accountant.

## 8.3 Aset Tetap & Depresiasi

Menu **Akuntansi → Aset Tetap**. Kelola aset (tanah, bangunan, mesin, peralatan) + penyusutan.

### Daftar & input aset
- **Tambah aset:** nama, kategori, harga perolehan, tanggal beli, masa manfaat, akun aset (1.6.x) + akun akumulasi penyusutan (1.7.x).
- **Import CSV:** bulk untuk banyak aset. Preview validasi per baris.
- **Export CSV:** backup/laporan aset.
- **Edit metadata:** nama/kategori/deskripsi (field nominal dikunci supaya jurnal historis konsisten).

### Opening balance aset (migrasi)
Kalau aset sudah ada sebelum pakai sistem: input + posting **opening balance JE** (DR Aset / CR Akumulasi Penyusutan + Ekuitas Saldo Awal). Supaya neraca benar.

### Depresiasi bulanan
- Sistem generate jadwal penyusutan (garis lurus) sampai akhir masa manfaat.
- **Posting Bulanan (bulk):** 1 klik posting semua entry depresiasi bulan itu sekaligus (vs satu-satu). Preview: jumlah entry, total Rp, breakdown per kategori. Idempotent (yang sudah posting di-skip).
- **Posting per-entry:** ada confirm dialog supaya tidak salah klik.
- Jurnal: DR Beban Penyusutan / CR Akumulasi Penyusutan.

## 8.4 Approval

Menu **Akuntansi → Approval**. Workflow persetujuan untuk transaksi tertentu (sesuai aturan approval yang diset).
- Transaksi yang butuh approval masuk antrian.
- Approver setujui/tolak → transaksi lanjut/batal.

---

## Contoh Kasus: Posting Depresiasi Juni
Akhir Juni, posting penyusutan semua aset:
1. **Aset Tetap** → tab Jadwal Depresiasi → bulan Juni.
2. Klik **Posting Bulanan** → preview: 77 aset, total Rp X, breakdown (mesin/bangunan/peralatan).
3. Konfirmasi → 77 jurnal depresiasi ter-posting sekaligus.
4. Cek Buku Besar: muncul JV depresiasi Juni.

## Contoh Kasus: Koreksi Reklasifikasi
Salah catat beban transport ke akun listrik, mau pindahkan Rp 2jt:
1. **Jurnal Manual** → DR Beban Transport 2jt / CR Beban Listrik 2jt.
2. Keterangan: "Reklas transport salah masuk listrik Mei".
3. Submit (seimbang) → terkoreksi.

---

[← Bank & Kas](07-modul-bank-kas.md) · [Daftar Isi](README.md) · [Lanjut: Laporan →](09-laporan.md)

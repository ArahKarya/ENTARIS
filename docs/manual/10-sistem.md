# Bab 10 — Sistem & Administrasi

[← Laporan](09-laporan.md) · [Daftar Isi](README.md) · [Lanjut: Contoh Kasus →](11-contoh-kasus.md)

---

Grup menu **Sistem**. Khusus **Admin**.

## 10.1 Pengaturan (Settings)

Menu **Sistem → Pengaturan**:
- **Profil Perusahaan:** nama, logo, alamat, NPWP (muncul di dokumen).
- **Akun Sistem:** mapping akun auto-posting (lihat [Bab 2.7](02-setup-awal.md)).
- **Backup:** download backup manual / upload restore file (.sql.gz).
- **Pajak:** konfigurasi PPN/PPh default.
- Tema terang/gelap (juga di header).

## 10.2 Manajemen User

Menu **Sistem → Manajemen User**:
- Tambah/edit/nonaktif user.
- Set role (Admin/Accountant/StaffProduksi/Viewer).
- Reset password user.

> Nonaktifkan user yang resign (jangan hapus — jaga histori siapa input apa).

## 10.3 Jejak Audit (Audit Trail)

Menu **Sistem → Jejak Audit**. Log semua aksi penting: siapa, kapan, ubah apa.
- Telusuri perubahan data (create/update/delete/cancel).
- Penting untuk kontrol internal & investigasi selisih.
- Termasuk catatan **override stok minus** (siapa bypass, alasan apa).

## 10.4 Health Check

Menu **Sistem → Health Check**. Diagnostik kesehatan data:
- Cek konsistensi: jurnal seimbang, stok vs GL, akun sistem lengkap, dll.
- Jalankan berkala untuk deteksi anomali dini.

## 10.5 Backup & Restore

- **Otomatis:** backup harian jalan otomatis (pg_dump → tersimpan).
- **Manual:** Pengaturan → Backup → download sebelum aksi besar (import, tutup buku, migrasi).
- **Restore:** upload file .sql.gz (hati-hati — menimpa data; lakukan di lingkungan terkontrol).

> 💡 **Best practice:** sebelum import massal atau tutup buku, selalu backup manual dulu.

## 10.6 Update Aplikasi

- Saat ada versi baru deploy, user yang sedang login dapat notifikasi **"Versi terbaru tersedia → Muat Ulang"**.
- Klik untuk refresh ke versi baru. Tidak perlu Ctrl-Shift-R manual.
- Changelog versi bisa dilihat di menu/notifikasi update.

## 10.7 Keamanan & Best Practice

1. **Password kuat**, ganti berkala. Jangan share akun.
2. **Role minimal:** beri akses sesuai kebutuhan (jangan semua Admin).
3. **Backup rutin** + simpan kopi di luar server.
4. **Review audit trail** berkala.
5. **Jangan hapus** akun sistem / dokumen historis — nonaktifkan/batalkan saja.
6. **Tutup buku** tahunan setelah semua transaksi beres.

---

[← Laporan](09-laporan.md) · [Daftar Isi](README.md) · [Lanjut: Contoh Kasus →](11-contoh-kasus.md)

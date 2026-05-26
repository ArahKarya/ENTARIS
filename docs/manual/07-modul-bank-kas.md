# Bab 7 — Modul Bank & Kas

[← Stok & Produksi](06-modul-stok-produksi.md) · [Daftar Isi](README.md) · [Lanjut: Akuntansi →](08-akuntansi.md)

---

Grup menu **Bank & Kas**. Semua arus uang masuk/keluar.

## 7.1 Transaksi Bank/Kas (Payments)

Menu **Bank & Kas → Transaksi Bank/Kas**. Satu tempat untuk 6 jenis transaksi uang:

| Jenis | Arti | Jurnal |
|---|---|---|
| **Penerimaan (Receive)** | Terima dari customer | DR Kas/Bank / CR Piutang |
| **Pembayaran (Pay)** | Bayar ke vendor | DR Hutang / CR Kas/Bank |
| **Uang Muka Pelanggan** | DP dari customer | DR Kas/Bank / CR Uang Muka Penjualan |
| **Uang Muka Vendor** | DP ke vendor | DR Uang Muka Pembelian / CR Kas/Bank |
| **Refund Pelanggan** | Kembalikan DP customer | DR Uang Muka Penjualan / CR Kas/Bank |
| **Refund Vendor** | Tarik DP dari vendor | DR Kas/Bank / CR Uang Muka Pembelian |

### Cara catat penerimaan/pembayaran
1. Pilih jenis (Penerimaan/Pembayaran).
2. Pilih party (customer/vendor) + akun Kas/Bank.
3. **Alokasi ke invoice:** pilih invoice mana yang dibayar + jumlah (bisa beberapa invoice sekaligus / sebagian).
4. Submit → jurnal otomatis, outstanding invoice berkurang.

### Pengeluaran umum (non-vendor)
Untuk biaya operasional (beli ATK, bayar listrik, transport, dll) tanpa invoice: pakai **Split** — alokasikan langsung ke akun beban. Mis. DR Beban Listrik / CR Kas.

### Lampiran
Upload bukti transfer/kwitansi per pembayaran.

## 7.2 Pindah Buku (Transfer Antar Bank/Kas)

Pindahkan saldo antar akun kas/bank sendiri (mis. tarik tunai dari Bank ke Petty Cash):
- DR Akun Tujuan / CR Akun Asal. Tidak ada dampak laba/rugi.

## 7.3 Rekonsiliasi Bank

Menu **Bank & Kas → Rekonsiliasi Bank**. Cocokkan catatan sistem vs rekening koran bank.

- **Buat sesi:** pilih akun bank, tanggal statement, saldo statement.
- Centang transaksi yang sudah muncul di rekening koran.
- Sistem hitung selisih (outstanding items belum clear).
- Tujuan: pastikan saldo buku = saldo bank riil.

## 7.4 Transaksi Berulang (Recurring)

Menu **Bank & Kas → Transaksi Berulang**. Untuk biaya/pendapatan rutin (sewa, langganan, cicilan).

- Buat template: jenis transaksi, jumlah, frekuensi (harian/mingguan/bulanan).
- Sistem ingatkan/generate otomatis sesuai jadwal.

---

## Contoh Kasus: Customer Bayar 2 Invoice Sekaligus
Bulog transfer Rp 50jt untuk lunasi SI-001 (Rp 30jt) + SI-002 (Rp 20jt):
1. **Transaksi Bank/Kas** → Penerimaan → party Bulog → akun Bank BRI.
2. Jumlah Rp 50jt. Alokasi: SI-001 Rp 30jt + SI-002 Rp 20jt.
3. Submit → DR Bank 50jt / CR Piutang 50jt. Kedua invoice jadi Lunas.

## Contoh Kasus: Bayar Listrik Pabrik
Bayar PLN Rp 15jt tunai:
1. **Transaksi Bank/Kas** → Pembayaran → (tanpa vendor / pilih PLN).
2. Akun: Petty Cash. Split ke akun "Beban Listrik".
3. Submit → DR Beban Listrik 15jt / CR Petty Cash 15jt.

---

[← Stok & Produksi](06-modul-stok-produksi.md) · [Daftar Isi](README.md) · [Lanjut: Akuntansi →](08-akuntansi.md)

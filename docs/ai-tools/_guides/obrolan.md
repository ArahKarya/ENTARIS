Toolset **obrolan** memberi agen (AIRA) memori percakapan: mencari dan membaca riwayat panel chat milik orang yang sedang dilayani. Entaris menyimpan semua sesi dan pesan panel chat sendiri (per pengguna); agen tidak perlu menyimpan transkrip. Kedua tool bersifat read-only dan hanya melihat sesi MILIK aktor (uid dari actor assertion), ditegakkan di server.

### Peta tool

| Kebutuhan | Tool | Risiko | Izin |
|---|---|---|---|
| Mencari topik/angka/dokumen yang pernah dibahas | `chat_cari_riwayat` | read | semua user login (milik sendiri) |
| Membaca percakapan lama secara lengkap | `chat_ambil_sesi` | read | semua user login (milik sendiri) |

### Alur memanggil kembali ingatan

1. Pengguna merujuk hal lama ("seperti kemarin", "angka yang tadi saya sebut").
2. Panggil `chat_cari_riwayat` dengan kata kunci spesifik (nama, nomor dokumen, topik). Hasil memuat `sessionId`, judul, tanggal, dan cuplikan.
3. Bila cuplikan belum cukup, panggil `chat_ambil_sesi` dengan `id` sesi tersebut (berpaging, `page`/`limit`).
4. Jangan mengarang isi percakapan lama: kutip hanya yang dikembalikan tool. Percakapan orang lain tidak pernah dikembalikan; sesi yang bukan milik aktor dijawab "tidak ditemukan".

### Catatan konteks

- Pada panel chat, Entaris sudah mengirim pesan terbaru yang muat dalam anggaran konteks ditambah ringkasan bergulir bagian lama sesi itu. Tool ini untuk detail yang tidak ikut terkirim atau berada di sesi lain.
- Pencarian memakai pencarian teks penuh (`simple`, netral bahasa) digabung pencocokan substring; kata pendek (< 2 karakter) ditolak.
- Isi tiap pesan dipotong 4.000 karakter pada `chat_ambil_sesi`.

# Toolset: Obrolan (memori percakapan) (`obrolan`)

> Dibangkitkan otomatis dari `server/src/ai/aira-tool-router.json` — jangan edit manual. Panduan alur: `docs/ai-tools/_guides/`.

Endpoint MCP target: `/mcp/obrolan` · 2 tool (read 2, write 0, critical 0)

## Tujuan

Toolset **obrolan** memberi agen (AIRA) memori percakapan: mencari dan membaca riwayat panel chat milik orang yang sedang dilayani. Entaris menyimpan semua sesi dan pesan panel chat sendiri (per pengguna); agen tidak perlu menyimpan transkrip. Kedua tool bersifat read-only dan hanya melihat sesi MILIK aktor (uid dari actor assertion), ditegakkan di server.

## ALUR BISNIS

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

## Daftar tool

| Tool | Risk | Draft | Handler |
|---|---|---|---|
| [`chat_ambil_sesi`](#chat_ambil_sesi) | read | - | `GET /api/chat-history/sessions/:id` |
| [`chat_cari_riwayat`](#chat_cari_riwayat) | read | - | `GET /api/chat-history/search` |

## Rincian tool

### chat_ambil_sesi

**Ringkasan:** Baca pesan satu sesi percakapan panel chat MILIK pemanggil (urut waktu, berpaging). Gunakan setelah chat_cari_riwayat untuk mengingat detail percakapan lama. Sesi milik orang lain ditolak (tidak ditemukan).

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `chat_history` / `view`)
- **Catatan akses:** Semua user login; hanya sesi chat MILIK pemanggil (sesi lain = 404). Isi pesan dipotong 4.000 karakter per pesan.
- **Handler:** `GET /api/chat-history/sessions/:id` (src/routes/chatHistory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `id` | path | `string` | ya | ID sesi (dari chat_cari_riwayat). |
| `page` | query | `number` | tidak | Halaman (default 1). |
| `limit` | query | `number` | tidak | Pesan per halaman (default 30, maks. 100). |

**Contoh pemanggilan**

```json
{
  "tool": "chat_ambil_sesi",
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
  "data": "<{session:{id,title,status,...}, data:[{id, role, status, date, content}], total, page, lim>"
}
```

**Isi hasil:** {session:{id,title,status,...}, data:[{id, role, status, date, content}], total, page, limit}.

**Tool terkait:** [`chat_cari_riwayat`](#chat_cari_riwayat)

### chat_cari_riwayat

**Ringkasan:** Cari di riwayat percakapan panel chat MILIK pemanggil sendiri (pesan pengguna dan jawaban AIRA; pencarian teks penuh + kata). Mengembalikan id sesi, judul, tanggal, dan cuplikan; pakai chat_ambil_sesi untuk membaca sesi lengkap. Hanya sesi milik pemanggil: tidak pernah menampilkan percakapan orang lain.

- **Risk / tier:** `read` / Auto
- **Roles & izin:** Admin, Accountant, StaffProduksi, Viewer (modul `chat_history` / `view`)
- **Catatan akses:** Semua user login; hanya sesi chat MILIK pemanggil (ditegakkan di server berdasarkan uid aktor). Modul "chat_history" bukan modul RBAC (tanpa matriks izin).
- **Handler:** `GET /api/chat-history/search` (src/routes/chatHistory.ts)
- **Status default:** aktif (dapat dinonaktifkan per tool di Settings → AIRA)

**Parameter**

| Nama | Lokasi | Tipe | Wajib | Keterangan |
|---|---|---|---|---|
| `q` | query | `string` | ya | Kata kunci (min. 2 karakter), mis. nama pelanggan, nomor dokumen, atau topik yang pernah dibahas. |
| `limit` | query | `number` | tidak | Maks. hasil (default 10, maks. 50). |

**Contoh pemanggilan**

```json
{
  "tool": "chat_cari_riwayat",
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
  "data": "<{data:[{sessionId, sessionTitle, messageId, role, date, snippet}], total, hint}.>"
}
```

**Isi hasil:** {data:[{sessionId, sessionTitle, messageId, role, date, snippet}], total, hint}.

**Tool terkait:** [`chat_ambil_sesi`](#chat_ambil_sesi)


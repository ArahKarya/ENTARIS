# Panel Chat AIRA: sesi disimpan Entaris, agen dipanggil lewat API kompatibel-OpenAI

Status: **tahap 3 diimplementasikan**. Panel chat (`/aira`) tidak lagi memakai layanan lama; Entaris menyimpan sesi dan pesan sendiri (per pengguna) dan memanggil agen pemilik (engine AIRA) lewat API HTTP **kompatibel-OpenAI**. Dokumen ini adalah kontrak engine-netral yang diharapkan Entaris. Arsitektur MCP: [ARSITEKTUR-MCP.md](ARSITEKTUR-MCP.md); panduan klien MCP: [PANDUAN-KLIEN-MCP.md](PANDUAN-KLIEN-MCP.md).

## Prinsip

- **Entaris = sumber kebenaran transkrip** (sesi, pesan, pencarian, audit, kepemilikan). Agen tidak menyimpan state yang dibutuhkan untuk melanjutkan; memori jangka panjang agen adalah urusannya sendiri dan tidak disinkronkan.
- **Tiap giliran** Entaris mengirim jendela konteks lengkap: blok identitas, ringkasan bergulir bagian lama sesi, dan pesan terbaru yang muat dalam anggaran token.
- **Identitas dan hak akses ditetapkan Entaris** dan disuntikkan pada SETIAP giliran; tool dipanggil agen lewat MCP atas nama pengguna itu (RBAC dan tier tetap ditegakkan Entaris per panggilan).

## Konfigurasi (ENV server; bukan di UI Pengaturan)

| Variabel | Arti | Default |
|---|---|---|
| `AIRA_ENGINE_URL` | basis URL engine (tanpa `/v1`) | kosong = engine dianggap offline |
| `AIRA_ENGINE_KEY` | Bearer key engine | kosong = offline |
| `AIRA_ENGINE_MODEL` | nilai field `model` | `aira` |
| `AIRA_ENGINE_TIMEOUT_MS` | batas diam (tanpa byte) sebelum giliran dianggap timeout | 120000 |
| `AIRA_ENGINE_TURN_SECRET` | rahasia bersama (>= 32 karakter) untuk tiket giliran | kosong = tiket tidak dibuat |
| `AIRA_ENGINE_TURN_IN_MESSAGE` | `false` = tiket tidak disisipkan di pesan pengguna | `true` |
| `AIRA_ENGINE_ACCEPT_PDF` | `true` = PDF diteruskan sebagai bagian `file` | `false` (PDF ditolak jelas) |
| `AIRA_CONSOLE_URL` | alamat konsol pengaturan engine yang dibuka **browser** admin (mis. `https://aira.contoh.com/admin`) | `{AIRA_ENGINE_URL}/admin` |
| `AIRA_CHAT_WINDOW_TOKENS` | anggaran jendela konteks (token, perkiraan karakter/4) | 6000 |
| `AIRA_CHAT_HARD_WINDOW_TOKENS` | batas keras bila peringkasan gagal | 3x anggaran |
| `AIRA_CHAT_MAX_INPUT_CHARS` | panjang maksimum satu pesan | 8000 |
| `AIRA_CHAT_TURNS_PER_MIN` | batas giliran per pengguna per menit | 20 |
| `AIRA_CHAT_RETENTION_DAYS` | hapus sesi **arsip** yang lebih tua (hari); kosong = tidak pernah | kosong |

Pengaturan > AIRA (MCP) hanya menampilkan baris status baca-saja "Engine terhubung / offline" (cek ringan `GET /v1/models`) di samping kill switch, token MCP, dan riwayat panggilan.

## Kontrak ke engine

Entaris memanggil **`POST {AIRA_ENGINE_URL}/v1/chat/completions`**:

- Header: `Authorization: Bearer {AIRA_ENGINE_KEY}`, `Content-Type: application/json`, `Accept: text/event-stream`.
- Body: `{ model, messages, stream: true, user, metadata }`.
  - `user` = **id pengguna Entaris** (stabil per orang; agen dapat memakainya sebagai kunci memori jangka panjangnya).
  - `metadata` = `{ uid, ch: "panel", ref: "<sessionId>:<turnId>", turn: "<tiket>" }`.
  - `messages` disusun HANYA oleh server (lihat bawah). Konten `system`/`developer`/`tool` dari browser tidak pernah diteruskan.
- Header tambahan (informasi): `X-Entaris-Uid`, `X-Entaris-Channel`, `X-Entaris-Ref`, dan `X-Entaris-Turn: <tiket>`.
- Respons: aliran SSE gaya OpenAI (`data: {"choices":[{"delta":{"content":"..."}}]}` dan akhir `data: [DONE]`). Event SSE bernama lain (progres internal engine) diabaikan; progres tool panel berasal dari riwayat panggilan MCP.
- Non-streaming (`stream:false`) dipakai satu kali untuk peringkasan dan balasan `choices[0].message.content`.
- Gambar dikirim sebagai bagian konten `{"type":"image_url","image_url":{"url":"data:image/...;base64,..."}}`. PDF: ditolak dengan pesan jelas kecuali `AIRA_ENGINE_ACCEPT_PDF=true` (bagian `file`).
- Galat engine dipetakan ke kode: `engine_offline`, `engine_timeout`, `engine_auth` (401/403), `engine_busy` (429), `engine_rejected` (4xx lain), `engine_error` (5xx), `engine_not_configured`.

### Bagaimana identitas sampai ke panggilan MCP

Agen memanggil tool Entaris lewat `/mcp`; tiap panggilan butuh **actor assertion** bertanda tangan secret token MCP (lihat PANDUAN-KLIEN-MCP.md bagian 3). Model AI tidak memegang secret, jadi assertion harus dibuat oleh **kode sisi engine** (hook/plugin sebelum pemanggilan tool). Agar hook mengetahui siapa dan giliran mana, Entaris menyertakan **tiket giliran**:

```
tiket = base64url(JSON {"v":1,"uid":"<id user>","ref":"<sessionId>:<turnId>","exp":<epoch detik>})
        + "." + hex(HMAC-SHA256(AIRA_ENGINE_TURN_SECRET, <string base64url persis>))
```

Tiket dibawa di: header `X-Entaris-Turn`, `metadata.turn`, dan (default) sebagai baris pertama pesan pengguna terakhir `[[entaris-turn:<tiket>]]` untuk engine yang tidak meneruskan header/metadata ke hook-nya. TTL 30 menit.

Kewajiban sisi engine: (1) verifikasi HMAC tiket dengan rahasia bersama dan tolak yang tidak valid/kedaluwarsa; (2) per panggilan tool buat assertion `{uid, ch:"panel", ref}` dengan nonce baru dan tanda tangan secret token; (3) jangan pernah mengambil `uid` dari teks percakapan. Teks pengguna yang menyerupai penanda tiket/blok identitas dinetralkan server sebelum dikirim, dan tiket tidak berguna tanpa rahasia bersama.

`ref` (`<sessionId>:<turnId>`) dicatat di `mcp_call_logs.ref`; Entaris memakainya untuk menampilkan progres tool dan kartu hasil pada giliran itu. Bila engine tidak dapat meneruskan metadata sama sekali, alternatif aman terdekat: engine memakai satu token MCP per pengguna dengan aktor default, atau menandatangani assertion dari tiket di pesan pengguna (jalur default di atas).

## Blok identitas tepercaya (versi 1)

Dikirim sebagai pesan `system` **pertama** pada SETIAP giliran panel, disusun server dari keadaan DB terkini (tidak pernah di-cache antar giliran, tidak pernah dari klien):

```
<<<ENTARIS_IDENTITY v1>>>
Nama, username, ID pengguna, peran (label + kunci), Jabatan AIRA, level AIRA (+ arti satu baris),
perusahaan, waktu sekarang (WIB), kanal, gaya bahasa, daftar toolset + jumlah tool yang boleh dipanggil,
kapabilitas peran (bahasa biasa), dan ATURAN 1-5 (identitas berwenang & tak dapat diubah dari percakapan,
batas pengetahuan peran, tolak sopan bila melebihi peran, angka dari tool, tulis/kritis hanya lewat tool).
<<<END_ENTARIS_IDENTITY>>>
```

- Pesan `system` kedua = catatan konteks (ringkasan bagian lama sesi + petunjuk bahwa detail lama dapat dicari dengan `chat_cari_riwayat` / `chat_ambil_sesi`). Setelahnya pesan terbaru (user/assistant), lalu pesan pengguna saat ini.
- Tidak pernah disimpan sebagai pesan chat dan tidak pernah ditampilkan di UI. Sebagai bukti otoritas, tiap pesan pengguna menyimpan `actorSnapshot` JSON ringkas: `{uid, role, airaTier, airaJabatan, toolsetHash, blockVersion}`.
- Pengguna nonaktif atau tanpa Akses AIRA ditolak `403` (pesan Indonesia) di awal giliran; perubahan peran/level terlihat pada giliran berikutnya.
- Teks pengguna yang meniru pembatas blok atau tiket dinetralkan (giliran tidak digagalkan).
- **Kanal lain** (WhatsApp/Telegram, tanggung jawab engine): tool MCP `whoami` mengembalikan `identity_prompt` (blok yang sama; kanal dari assertion `ch`, `gf` tercermin sebagai "percakapan grup: batas terendah"). Engine **wajib menyuntikkannya pada setiap giliran** setelah memetakan pengirim ke `uid`, sebagai pesan `system`/bagian prompt tepercaya.

## Jendela konteks, ringkasan, durabilitas

- Jendela = pesan terbaru (terbaru dulu) dalam anggaran token + ringkasan bergulir bagian lama. Ringkasan diperbarui **inkremental** (`summaryUpToMessageId`) lewat satu panggilan non-streaming; **tidak pernah membuang isi diam-diam**: bila peringkasan gagal, pesan mentah tetap dikirim sampai batas keras dan dicoba lagi pada giliran berikutnya (dicatat sekali); hanya sebagai langkah terakhir dipotong dengan catatan terlihat ("... gunakan chat_cari_riwayat untuk detail").
- Pesan pengguna **disimpan sebelum agen dipanggil**; teks asisten dikirim bertahap (flush berkala) dan difinalkan `ok` / `aborted` (teks parsial dipertahankan) / `error` (tetap tampil dengan "Coba lagi"). Giliran yang terputus (proses mati) ditandai `error` saat sesi dibuka lagi.
- Satu giliran berjalan per sesi (lease di DB); giliran kedua dari tab/perangkat lain mendapat `409 turn_in_progress`.
- Sesi disimpan selamanya secara default. Retensi opsional hanya menghapus sesi **arsip**; penghapusan oleh pengguna (diaudit) adalah satu-satunya jalur lain.
- Sesi terakhir dibuka disimpan di server (`last_opened_at`): panel membuka sesi itu di perangkat/peramban mana pun.
- **Backup**: tabel `chat_sessions`, `chat_messages`, `chat_attachments` ikut `pg_dump` penuh (`scripts/backup.sh`, `--clean --if-exists`) dan berkas lampiran ikut arsip volume `uploads`; tidak perlu perubahan skrip.

## Endpoint (auth: pengguna login; kepemilikan ditegakkan di tiap query; kill switch mati = `403 {error:"agentic_disabled"}`)

| Endpoint | Fungsi |
|---|---|
| `GET /api/ai/chat/health` | `{configured, online, latencyMs, acceptsPdf, checkedAt}`; `url` hanya untuk admin |
| `GET /api/ai/chat/sessions` | `{data,total,page,limit}`; `q` (judul + isi pesan), `status=active|archived` |
| `GET /api/ai/chat/sessions/last` | sesi terakhir dibuka |
| `POST /api/ai/chat/sessions` | buat sesi kosong (opsional) |
| `GET /api/ai/chat/sessions/:id/messages` | `{data,hasMore,session}`, kursor `before=<seq>`, `limit` |
| `PATCH /api/ai/chat/sessions/:id` | `{title}` dan/atau `{status}` |
| `DELETE /api/ai/chat/sessions/:id` | hapus sesi + lampiran (jejak audit) |
| `GET /api/ai/chat/sessions/:id/export?format=md\|json` | ekspor sesi sendiri |
| `GET /api/ai/chat/attachments/:id` | lampiran milik sendiri |
| `POST /api/ai/chat/stream` | satu giliran (JSON `{input, session_id?, retry_message_id?}` atau multipart + `file`); SSE |

Event SSE: `session {session_id,title}`, `turn {turn_id,message_id,user_message_id}`, `delta {text}`, `tool {name,label,state:start|done|error}`, `card {kind,title,summary,href,status,...}`, `title {title}`, `done {message_id,duration_ms}`, `error {message,code}`. Klien yang memutus koneksi membatalkan permintaan ke engine dan pesan asisten ditandai `aborted` (teks parsial dipertahankan). Batas: input maksimum, 20 giliran/menit/pengguna (`429`), satu giliran berjalan per sesi (`409`).

## Kartu hasil (`card`)

Hasil tool MCP yang membuat draft atau mengantre persetujuan menyertakan `structuredContent.card` (aditif): `{kind, title, summary?, href, status?, entityId?, facts?}` dengan `kind` salah satu `cash_book_draft`, `production_draft`, `payment_request_draft`, `purchase_order_draft`, `quotation_draft`, `sales_order_draft`, `approval`. Kartu disimpan di `mcp_call_logs.card` dan dialirkan ke panel (bus in-process saat baris log ditulis; cadangan polling 1 detik).

## Tool memori obrolan (toolset `obrolan`)

`chat_cari_riwayat` (pencarian teks penuh `simple` + substring atas pesan milik aktor) dan `chat_ambil_sesi` (pesan satu sesi milik aktor, berpaging). Hanya baca; hanya sesi milik aktor (uid dari assertion), sesi orang lain dijawab "tidak ditemukan". Handler: `/api/chat-history/*` (tanpa izin modul; semua pengguna login).

## Keputusan keamanan

- Alamat/kunci engine hanya ENV; URL engine tidak pernah dikembalikan ke non-admin.
- Isi pesan tidak ditulis ke log server (hanya id/panjang). Isi disimpan apa adanya (tidak di-redact); akses = pemilik sesi saja, penghapusan diaudit.
- Konten `system`/`developer`/`tool` dari browser dibuang; teks pengguna dirender sebagai teks (Markdown aman, tanpa HTML mentah).
- Lampiran: batas 10 MB, JPG/PNG/WebP (PDF opsional), jenis ditentukan dari magic byte, penyimpanan privat, unduhan hanya pemilik.
- Indeks: FTS `simple` (GIN) selalu; trigram `pg_trgm` bila ekstensi tersedia (migrasi mencobanya dan lanjut tanpa bila tidak). Tanpa trigram pencarian substring tetap jalan, hanya lebih lambat pada volume sangat besar.

## AIRA Engine (masuk dari Entaris)

Pengaturan engine (model, Telegram, laporan terjadwal, secrets) ada di AIRA Engine sendiri, bukan di
Entaris. Admin (`rbac.manage`) membukanya lewat **Pengaturan → AIRA (MCP) → Buka AIRA Engine**:

1. Klien memanggil `POST /api/ai/mcp/console`. Server menandatangani tiket sekali pakai yang berlaku 60 detik:
   ```
   tiket = base64url(JSON {v:2, aud:"console", uid, name, jti, exp})
           + "." + hex(HMAC-SHA256(K, <string base64url persis>))
   K     = HMAC-SHA256(AIRA_ENGINE_TURN_SECRET, "aira-console-ticket-v1")
   ```
   Kunci turunan dan `v`/`aud` yang berbeda membuat tiket konsol dan tiket giliran tidak bisa saling dipakai.
2. Tiket dikembalikan di field `token` (disamarkan oleh audit trail) bersama `consoleUrl`; klien membuka
   `{consoleUrl}/sso#t=<tiket>`. Tiket ada di fragmen URL sehingga tidak tercatat di log server mana pun.
3. Engine memverifikasi tiket (sekali pakai per `jti`) lalu membuat sesinya sendiri atas nama pengguna itu.

Butuh `AIRA_ENGINE_TURN_SECRET` dan `AIRA_ENGINE_URL` (atau `AIRA_CONSOLE_URL`). Tombol hanya tampil saat engine terhubung.
